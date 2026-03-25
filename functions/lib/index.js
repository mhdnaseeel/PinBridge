"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pair = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
exports.pair = functions.https.onCall(async (data, context) => {
    const { deviceId, secret } = data;
    if (!deviceId || typeof deviceId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Missing or invalid deviceId.");
    }
    if (!secret || typeof secret !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Missing or invalid secret.");
    }
    const db = admin.firestore();
    const pairingRef = db.collection("pairings").doc(deviceId);
    try {
        const docSnap = await pairingRef.get();
        if (!docSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Pairing session not found.");
        }
        const pairingData = docSnap.data();
        if ((pairingData === null || pairingData === void 0 ? void 0 : pairingData.secret) !== secret) {
            throw new functions.https.HttpsError("permission-denied", "Invalid secret.");
        }
        // Generate custom token for the device
        const customToken = await admin.auth().createCustomToken(deviceId);
        // Delete the pairing document as it's single-use
        await pairingRef.delete();
        return { customToken };
    }
    catch (error) {
        console.error("Pairing error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "An internal error occurred during pairing.");
    }
});
//# sourceMappingURL=index.js.map