import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export const pair = functions.https.onCall(async (data, context) => {
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
        if (pairingData?.secret !== secret) {
            throw new functions.https.HttpsError("permission-denied", "Invalid secret.");
        }

        // Generate custom token for the device
        const customToken = await admin.auth().createCustomToken(deviceId);

        // Delete the pairing document as it's single-use
        await pairingRef.delete();

        return { customToken };
    } catch (error) {
        console.error("Pairing error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "An internal error occurred during pairing.");
    }
});
