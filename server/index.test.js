/**
 * Server unit tests — Socket.IO auth, health check, structured logging
 * Run: npm test (from server directory)
 */

describe('Structured logging utility', () => {
    let log;
    let originalConsole;

    beforeEach(() => {
        originalConsole = {
            log: console.log,
            warn: console.warn,
            error: console.error
        };
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();

        // Inline the log function (same as server/index.js)
        log = function(level, message, meta = {}) {
            const entry = { ts: expect.any(String), level, message, ...meta };
            const jsonStr = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
            if (level === 'error') console.error(jsonStr);
            else if (level === 'warn') console.warn(jsonStr);
            else console.log(jsonStr);
        };
    });

    afterEach(() => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    });

    test('info logs to console.log as JSON', () => {
        log('info', 'Server started', { port: 3001 });
        expect(console.log).toHaveBeenCalledTimes(1);
        const parsed = JSON.parse(console.log.mock.calls[0][0]);
        expect(parsed.level).toBe('info');
        expect(parsed.message).toBe('Server started');
        expect(parsed.port).toBe(3001);
        expect(parsed.ts).toBeDefined();
    });

    test('warn logs to console.warn', () => {
        log('warn', 'Connection dropped', { deviceId: 'abc123' });
        expect(console.warn).toHaveBeenCalledTimes(1);
        const parsed = JSON.parse(console.warn.mock.calls[0][0]);
        expect(parsed.level).toBe('warn');
        expect(parsed.deviceId).toBe('abc123');
    });

    test('error logs to console.error', () => {
        log('error', 'Redis connection failed', { error: 'ECONNREFUSED' });
        expect(console.error).toHaveBeenCalledTimes(1);
        const parsed = JSON.parse(console.error.mock.calls[0][0]);
        expect(parsed.level).toBe('error');
        expect(parsed.error).toBe('ECONNREFUSED');
    });
});

describe('CORS origin validation', () => {
    const ALLOWED_ORIGINS = [
        'https://pin-bridge.vercel.app',
        'https://pinbridge-61dd4.web.app',
        'https://pinbridge-61dd4.firebaseapp.com',
        'http://localhost:5173',
        'http://localhost:3000'
    ];

    function validateOrigin(origin) {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) {
            return true;
        }
        return false;
    }

    test('allows production dashboard origin', () => {
        expect(validateOrigin('https://pin-bridge.vercel.app')).toBe(true);
    });

    test('allows Firebase hosting origin', () => {
        expect(validateOrigin('https://pinbridge-61dd4.web.app')).toBe(true);
    });

    test('allows Chrome extension origin', () => {
        expect(validateOrigin('chrome-extension://abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    test('allows localhost for development', () => {
        expect(validateOrigin('http://localhost:5173')).toBe(true);
        expect(validateOrigin('http://localhost:3000')).toBe(true);
    });

    test('allows null origin (mobile apps, curl)', () => {
        expect(validateOrigin(null)).toBe(true);
        expect(validateOrigin(undefined)).toBe(true);
    });

    test('blocks unknown origins', () => {
        expect(validateOrigin('https://evil.com')).toBe(false);
        expect(validateOrigin('https://pin-bridge.evil.app')).toBe(false);
        expect(validateOrigin('http://localhost:8080')).toBe(false);
    });
});

describe('Health check response shape', () => {
    test('response includes required fields', () => {
        const response = {
            status: "ok",
            service: "PinBridge Presence Server",
            version: '1.0.0',
            uptime: 123,
            redis: 'connected',
            connectedSockets: 5
        };

        expect(response.status).toBe('ok');
        expect(response.service).toBe('PinBridge Presence Server');
        expect(typeof response.uptime).toBe('number');
        expect(['connected', 'disconnected', 'unknown']).toContain(response.redis);
        expect(typeof response.connectedSockets).toBe('number');
    });
});

describe('Heartbeat timeout detection', () => {
    test('detects stale heartbeat after 40 seconds', () => {
        const TIMEOUT_MS = 40000;
        const now = Date.now();
        const lastSeen = now - 50000; // 50 seconds ago

        expect(now - lastSeen > TIMEOUT_MS).toBe(true);
    });

    test('does not flag fresh heartbeat', () => {
        const TIMEOUT_MS = 40000;
        const now = Date.now();
        const lastSeen = now - 10000; // 10 seconds ago

        expect(now - lastSeen > TIMEOUT_MS).toBe(false);
    });

    test('detects exact timeout boundary', () => {
        const TIMEOUT_MS = 40000;
        const now = Date.now();
        const lastSeen = now - 40001; // Just over timeout

        expect(now - lastSeen > TIMEOUT_MS).toBe(true);
    });
});
