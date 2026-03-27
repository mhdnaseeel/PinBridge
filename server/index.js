const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const admin = require('firebase-admin');
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

    if (!token || !deviceId) {
        return next(new Error("Authentication error: Missing token or deviceId"));
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        socket.user = decodedToken;
        socket.deviceId = deviceId;
        next();
    } catch (err) {
        console.error("Auth error:", err.message);
        next(new Error("Authentication error: Invalid token"));
    }
});

io.on('connection', async (socket) => {
    const { deviceId, user } = socket;
    console.log(`Device connected: ${deviceId} (User: ${user.email})`);

    // Mark online in Redis with TTL
    await redis.set(`presence:${deviceId}`, 'online', 'EX', 30);
    await redis.set(`lastSeen:${deviceId}`, Date.now().toString());

    // Join a room for this device so Web/Extension can listen specifically
    socket.join(`room:${deviceId}`);

    // Broadcast immediate online status
    io.to(`room:${deviceId}`).emit('presence_update', {
        deviceId,
        status: 'online',
        lastSeen: Date.now()
    });

    socket.on('heartbeat', async () => {
        // Refresh TTL
        await redis.set(`presence:${deviceId}`, 'online', 'EX', 30);
        await redis.set(`lastSeen:${deviceId}`, Date.now().toString());
    });

    socket.on('disconnect', async (reason) => {
        console.log(`Device disconnected: ${deviceId} (${reason})`);
        
        // Mark offline in Redis
        await redis.set(`presence:${deviceId}`, 'offline');
        const now = Date.now();
        
        // Persist to Firestore for long-term lastSeen records
        try {
            await db.collection('pairings').doc(deviceId).update({
                lastOnline: admin.firestore.FieldValue.serverTimestamp(),
                state: 'offline'
            });
        } catch (e) {
            console.error("Failed to update Firestore on disconnect:", e.message);
        }

        // Broadcast offline status
        io.to(`room:${deviceId}`).emit('presence_update', {
            deviceId,
            status: 'offline',
            lastSeen: now
        });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Presence server running on port ${PORT}`);
});
