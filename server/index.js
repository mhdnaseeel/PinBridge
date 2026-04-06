require("./instrument.js");
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const admin = require('firebase-admin');
const Sentry = require("@sentry/node");
const helmet = require('helmet');
require('dotenv').config();

// Initialize Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const path = require('path');
    const serviceAccount = require(path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
} else {
    admin.initializeApp();
}

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
// Security (V-08): Restrict CORS to known PinBridge origins
const ALLOWED_ORIGINS = [
    'https://pin-bridge.vercel.app',
    'https://pinbridge-61dd4.web.app',
    'https://pinbridge-61dd4.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:3000'
];

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (mobile apps, curl, server-to-server)
            // and Chrome extensions (chrome-extension:// protocol)
            if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) {
                callback(null, true);
            } else {
                console.warn(`[CORS] Blocked request from origin: ${origin}`);
                callback(new Error('Origin not allowed'));
            }
        },
        methods: ["GET", "POST"]
    },
    pingTimeout: 15000,
    pingInterval: 5000
});

// Structured logging utility (P2-3)
function log(level, message, meta = {}) {
    const entry = { ts: new Date().toISOString(), level, message, ...meta };
    if (level === 'error') console.error(JSON.stringify(entry));
    else if (level === 'warn') console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
}

// Redis setup (Upstash compatible)
const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    tls: { rejectUnauthorized: false }
});

// Middleware for authentication
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    const deviceId = socket.handshake.auth.deviceId;
    const clientType = socket.handshake.auth.clientType || 'viewer';

    if (!token || !deviceId) {
        return next(new Error("Authentication error: Missing token or deviceId"));
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        socket.user = decodedToken;
        socket.deviceId = deviceId;
        socket.clientType = clientType;
        next();
    } catch (err) {
        console.error(`[PinBridge Server] Auth error for device ${deviceId}:`, err.message);
        next(new Error("Authentication error: Invalid token"));
    }
});

// In-memory watchdog for active devices
const lastHeartbeatMap = new Map();
// Throttle Firestore writes to avoid excessive updates
const lastFirestoreSyncMap = new Map();
const FIRESTORE_SYNC_INTERVAL = 60000; // Sync to Firestore at most once per 60s
// Track whether first heartbeat has been received (for eager battery write)
const firstHeartbeatReceived = new Map();

io.on('connection', async (socket) => {
    const { deviceId, user, clientType } = socket;
    console.log(`[PinBridge Server] ${clientType === 'device' ? 'Device' : 'Viewer'} connected: ${deviceId}`);

    socket.join(`room:${deviceId}`);

    if (clientType === 'device') {
        const now = Date.now();
        lastHeartbeatMap.set(deviceId, now);
        firstHeartbeatReceived.set(deviceId, false); // Reset: waiting for first heartbeat with battery
        
        await redis.set(`presence:${deviceId}`, 'online', 'EX', 35);
        await redis.set(`lastSeen:${deviceId}`, now.toString());

        // FIX (Bug 2): Read existing battery data from Redis to include in initial Firestore write
        let existingBattery = null;
        const batteryRaw = await redis.get(`battery:${deviceId}`);
        if (batteryRaw) {
            existingBattery = JSON.parse(batteryRaw);
        }

        // Write online status + any existing battery data to Firestore on connect (always)
        try {
            const updateData = {
                lastOnline: admin.firestore.FieldValue.serverTimestamp(),
                status: 'online'
            };
            if (existingBattery) {
                updateData.batteryLevel = existingBattery.level;
                updateData.isCharging = existingBattery.isCharging;
                updateData.batteryUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
            }
            await db.collection('pairings').doc(deviceId).update(updateData);
            lastFirestoreSyncMap.set(deviceId, now);
        } catch (e) {
            console.error('[PinBridge Server] Firestore online write error:', e.message);
        }

        io.to(`room:${deviceId}`).emit('presence_update', {
            deviceId,
            status: 'online',
            lastSeen: now,
            batteryLevel: existingBattery ? existingBattery.level : null,
            isCharging: existingBattery ? existingBattery.isCharging : false
        });
    } else {
        const status = await redis.get(`presence:${deviceId}`) || 'offline';
        const lastSeen = await redis.get(`lastSeen:${deviceId}`);
        const batteryRaw = await redis.get(`battery:${deviceId}`);
        const battery = batteryRaw ? JSON.parse(batteryRaw) : null;
        
        socket.emit('presence_update', {
            deviceId,
            status,
            lastSeen: lastSeen ? parseInt(lastSeen) : null,
            batteryLevel: battery ? battery.level : null,
            isCharging: battery ? battery.isCharging : false
        });
    }

    socket.on('heartbeat', async (data) => {
        if (clientType === 'device') {
            const now = Date.now();
            lastHeartbeatMap.set(deviceId, now);
            await redis.set(`presence:${deviceId}`, 'online', 'EX', 35);
            await redis.set(`lastSeen:${deviceId}`, now.toString());

            // Parse battery info from heartbeat payload
            let batteryLevel = null;
            let isCharging = false;
            if (data && typeof data === 'object') {
                batteryLevel = typeof data.batteryLevel === 'number' ? data.batteryLevel : null;
                isCharging = !!data.isCharging;
            }

            // Store battery info in Redis
            if (batteryLevel !== null) {
                await redis.set(`battery:${deviceId}`, JSON.stringify({ level: batteryLevel, isCharging }));
            }

            // FIX (Bug 2): On the first heartbeat with battery data, write to Firestore immediately
            // without respecting the 60s throttle. This ensures battery data is available fast.
            const isFirstHB = !firstHeartbeatReceived.get(deviceId);
            const lastSync = lastFirestoreSyncMap.get(deviceId) || 0;
            const shouldSync = isFirstHB && batteryLevel !== null || (now - lastSync > FIRESTORE_SYNC_INTERVAL);
            
            if (isFirstHB && batteryLevel !== null) {
                firstHeartbeatReceived.set(deviceId, true);
            }

            if (shouldSync) {
                try {
                    const updateData = {
                        lastOnline: admin.firestore.FieldValue.serverTimestamp(),
                        status: 'online'
                    };
                    if (batteryLevel !== null) {
                        updateData.batteryLevel = batteryLevel;
                        updateData.isCharging = isCharging;
                        updateData.batteryUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
                    }
                    await db.collection('pairings').doc(deviceId).update(updateData);
                    lastFirestoreSyncMap.set(deviceId, now);
                } catch (e) {
                    console.error('[PinBridge Server] Firestore heartbeat sync error:', e.message);
                }
            }

            io.to(`room:${deviceId}`).emit('presence_update', {
                deviceId,
                status: 'online',
                lastSeen: now,
                batteryLevel,
                isCharging
            });
        }
    });

    socket.on('disconnect', async (reason) => {
        console.log(`[PinBridge Server] ${clientType === 'device' ? 'Device' : 'Viewer'} disconnected: ${deviceId} (${reason})`);
        
        if (clientType === 'device') {
            lastHeartbeatMap.delete(deviceId);
            lastFirestoreSyncMap.delete(deviceId);
            firstHeartbeatReceived.delete(deviceId);
            await redis.set(`presence:${deviceId}`, 'offline');
            const now = Date.now();

            // Get last known battery info for the disconnect broadcast
            let batteryLevel = null;
            let isCharging = false;
            const batteryRaw = await redis.get(`battery:${deviceId}`);
            if (batteryRaw) {
                const battery = JSON.parse(batteryRaw);
                batteryLevel = battery.level;
                isCharging = battery.isCharging;
            }
            
            try {
                await db.collection('pairings').doc(deviceId).update({
                    lastOnline: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'offline'
                });
            } catch (e) {
                console.error("[PinBridge Server] Firestore error:", e.message);
            }

            io.to(`room:${deviceId}`).emit('presence_update', {
                deviceId,
                status: 'offline',
                lastSeen: now,
                batteryLevel,
                isCharging
            });
        }
    });
});

/**
 * Presence Watchdog: Sweep for missed heartbeats (Threshold: 40s)
 * Catches 'dirty disconnects' where Android app is killed or network drops silently.
 */
setInterval(async () => {
    const now = Date.now();
    const TIMEOUT_MS = 40000;

    for (const [deviceId, lastSeen] of lastHeartbeatMap.entries()) {
        if (now - lastSeen > TIMEOUT_MS) {
            console.log(`[PinBridge Server] Presence Watchdog: Heartbeat timeout for ${deviceId}`);
            lastHeartbeatMap.delete(deviceId);
            
            await redis.set(`presence:${deviceId}`, 'offline');

            // Get last known battery info
            let batteryLevel = null;
            let isCharging = false;
            const batteryRaw = await redis.get(`battery:${deviceId}`);
            if (batteryRaw) {
                const battery = JSON.parse(batteryRaw);
                batteryLevel = battery.level;
                isCharging = battery.isCharging;
            }
            
            // Push offline status to Firestore & Socket Viewers
            try {
                await db.collection('pairings').doc(deviceId).update({
                    lastOnline: admin.firestore.Timestamp.fromMillis(lastSeen),
                    status: 'offline'
                });
            } catch (e) {}

            io.to(`room:${deviceId}`).emit('presence_update', {
                deviceId,
                status: 'offline',
                lastSeen: lastSeen,
                batteryLevel,
                isCharging
            });
        }
    }
}, 30000); // Check every 30s

// Manual TTL Cleanup for Free Tier Users
// Runs every 10 minutes to delete OTPs where expiresAt < now.
// This bypasses the need for the Firebase Blaze billing plan.
setInterval(async () => {
    try {
        const now = admin.firestore.Timestamp.now();
        const snapshot = await db.collection('otps')
            .where('expiresAt', '<', now)
            .get();

        if (snapshot.empty) return;

        console.log(`[PinBridge Server] TTL Cleanup: Deleting ${snapshot.size} expired OTP document(s)`);
        
        // Use batch to delete documents efficiently
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    } catch (e) {
        console.error('[PinBridge Server] TTL Cleanup Error:', e.message);
    }
}, 10 * 60 * 1000);

// Helmet.js for HTTP security headers (2.12)
app.use(helmet());

// Enhanced Health check endpoint (2.9)
app.get("/", async (req, res) => {
    let redisStatus = 'unknown';
    try {
        await redis.ping();
        redisStatus = 'connected';
    } catch {
        redisStatus = 'disconnected';
    }
    res.json({
        status: "ok",
        service: "PinBridge Presence Server",
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor(process.uptime()),
        redis: redisStatus,
        connectedSockets: io.engine?.clientsCount || 0
    });
});

// Sentry Express error handler
Sentry.setupExpressErrorHandler(app);

// Simple debug route to test Sentry
app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("Sentry Test Error from PinBridge Server");
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    log('info', `Presence server running on port ${PORT}`);
});

// Graceful shutdown (2.12)
process.on('SIGTERM', async () => {
    log('info', 'SIGTERM received. Starting graceful shutdown...');
    
    // Stop accepting new connections
    server.close(() => {
        log('info', 'HTTP server closed.');
    });
    
    // Close all socket connections
    io.close(() => {
        log('info', 'Socket.IO server closed.');
    });
    
    // Close Redis connection
    try {
        await redis.quit();
        log('info', 'Redis connection closed.');
    } catch (e) {
        log('warn', 'Error closing Redis:', { error: e.message });
    }
    
    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
        log('error', 'Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10000);
});
