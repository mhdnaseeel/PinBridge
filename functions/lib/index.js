"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pair = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
admin.initializeApp();
// Timing-safe constant-time comparison helper (CWE-208)
function safeCompare(a, b) {
    try {
        const aBuf = Buffer.from(a, "utf8");
        const bBuf = Buffer.from(b, "utf8");
        if (aBuf.length !== bBuf.length) {
            // Mitigate timing difference even if lengths differ
            crypto.timingSafeEqual(aBuf, aBuf);
            return false;
        }
        return crypto.timingSafeEqual(aBuf, bBuf);
    }
    catch (_a) {
        return false;
    }
}
exports.pair = (0, https_1.onCall)(async (request) => {
    // Security (H-4): Require at least anonymous authentication
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    const { deviceId, secret } = request.data;
    if (!deviceId || typeof deviceId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid deviceId.");
    }
    // Security (M-5): Validate deviceId format
    if (!/^[a-zA-Z0-9_-]{10,128}$/.test(deviceId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid deviceId format.");
    }
    // bearer:disable javascript_lang_observable_timing
    if (typeof secret !== "string" || secret === "") {
        throw new https_1.HttpsError("invalid-argument", "Missing or invalid secret.");
    }
    const db = admin.firestore();
    const pairingRef = db.collection("pairings").doc(deviceId);
    try {
        const docSnap = await pairingRef.get();
        if (!docSnap.exists) {
            throw new https_1.HttpsError("not-found", "Pairing session not found.");
        }
        const pairingData = docSnap.data();
        const firestoreSecret = pairingData === null || pairingData === void 0 ? void 0 : pairingData.secret;
        // bearer:disable javascript_lang_observable_timing
        if (typeof firestoreSecret !== "string" || !safeCompare(firestoreSecret, secret)) {
            throw new https_1.HttpsError("permission-denied", "Invalid secret.");
        }
        // Generate custom token for the device
        const customToken = await admin.auth().createCustomToken(deviceId);
        // Delete the pairing document as it's single-use
        await pairingRef.delete();
        return { customToken };
    }
    catch (error) {
        console.error("Pairing error:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "An internal error occurred during pairing.");
    }
});
//# sourceMappingURL=index.js.map