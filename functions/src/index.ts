import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

export const pair = onCall(async (request) => {
    // Security (H-4): Require at least anonymous authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { deviceId, secret } = request.data;

    if (!deviceId || typeof deviceId !== "string") {
        throw new HttpsError("invalid-argument", "Missing or invalid deviceId.");
    }
    // Security (M-5): Validate deviceId format
    if (!/^[a-zA-Z0-9_-]{10,128}$/.test(deviceId)) {
        throw new HttpsError("invalid-argument", "Invalid deviceId format.");
    }
    if (!secret || typeof secret !== "string") {
        throw new HttpsError("invalid-argument", "Missing or invalid secret.");
    }

    const db = admin.firestore();
    const pairingRef = db.collection("pairings").doc(deviceId);

    try {
        const docSnap = await pairingRef.get();
        if (!docSnap.exists) {
            throw new HttpsError("not-found", "Pairing session not found.");
        }

        const pairingData = docSnap.data();
        if (pairingData?.secret !== secret) {
            throw new HttpsError("permission-denied", "Invalid secret.");
        }

        // Generate custom token for the device
        const customToken = await admin.auth().createCustomToken(deviceId);

        // Delete the pairing document as it's single-use
        await pairingRef.delete();

        return { customToken };
    } catch (error) {
        console.error("Pairing error:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "An internal error occurred during pairing.");
    }
});
