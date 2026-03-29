require("./instrument.js");
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const admin = require('firebase-admin');
const Sentry = require("@sentry/node");
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
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 15000,
    pingInterval: 5000
});

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

io.on('connection', async (socket) => {
    const { deviceId, user, clientType } = socket;
    console.log(`[PinBridge Server] ${clientType === 'device' ? 'Device' : 'Viewer'} connected: ${deviceId}`);

    socket.join(`room:${deviceId}`);

    if (clientType === 'device') {
        const now = Date.now();
        lastHeartbeatMap.set(deviceId, now);
        
        await redis.set(`presence:${deviceId}`, 'online', 'EX', 35);
        await redis.set(`lastSeen:${deviceId}`, now.toString());

        // Write online status to Firestore on connect (always)
        try {
            await db.collection('pairings').doc(deviceId).update({
                lastOnline: admin.firestore.FieldValue.serverTimestamp(),
                status: 'online'
            });
            lastFirestoreSyncMap.set(deviceId, now);
        } catch (e) {
            console.error('[PinBridge Server] Firestore online write error:', e.message);
        }

        io.to(`room:${deviceId}`).emit('presence_update', {
            deviceId,
            status: 'online',
            lastSeen: now
        });
    } else {
        const status = await redis.get(`presence:${deviceId}`) || 'offline';
        const lastSeen = await redis.get(`lastSeen:${deviceId}`);
        
        socket.emit('presence_update', {
            deviceId,
            status,
            lastSeen: lastSeen ? parseInt(lastSeen) : null
        });
    }

    socket.on('heartbeat', async () => {
        if (clientType === 'device') {
            const now = Date.now();
            lastHeartbeatMap.set(deviceId, now);
            await redis.set(`presence:${deviceId}`, 'online', 'EX', 35);
            await redis.set(`lastSeen:${deviceId}`, now.toString());
            
            // Periodically sync online status to Firestore (throttled)
            const lastSync = lastFirestoreSyncMap.get(deviceId) || 0;
            if (now - lastSync > FIRESTORE_SYNC_INTERVAL) {
                try {
                    await db.collection('pairings').doc(deviceId).update({
                        lastOnline: admin.firestore.FieldValue.serverTimestamp(),
                        status: 'online'
                    });
                    lastFirestoreSyncMap.set(deviceId, now);
                } catch (e) {
                    console.error('[PinBridge Server] Firestore heartbeat sync error:', e.message);
                }
            }

            io.to(`room:${deviceId}`).emit('presence_update', {
                deviceId,
                status: 'online',
                lastSeen: now
            });
        }
    });

    socket.on('disconnect', async (reason) => {
        console.log(`[PinBridge Server] ${clientType === 'device' ? 'Device' : 'Viewer'} disconnected: ${deviceId} (${reason})`);
        
        if (clientType === 'device') {
            lastHeartbeatMap.delete(deviceId);
            lastFirestoreSyncMap.delete(deviceId);
            await redis.set(`presence:${deviceId}`, 'offline');
            const now = Date.now();
            
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
                lastSeen: now
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
                lastSeen: lastSeen
            });
        }
    }
}, 30000); // Check every 30s

// Sentry Express error handler
Sentry.setupExpressErrorHandler(app);

// Simple debug route to test Sentry
app.get("/debug-sentry", function mainHandler(req, res) {
    throw new Error("Sentry Test Error from PinBridge Server");
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Presence server running on port ${PORT}`);
});
