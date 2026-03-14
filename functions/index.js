const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Initialize Pairing: POST {deviceId, secret, pairingCode}
exports.startPairing = functions.https.onCall(async (data, context) => {
  const { deviceId, secret, pairingCode } = data;
  if (!deviceId || !secret || !pairingCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing fields');
  }

  try {
    await admin.firestore().collection('pairings').doc(deviceId).set({
      secret,
      pairingCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Start pairing error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to initialize pairing');
  }
});

// QR Pairing: POST {deviceId, secret}
exports.pair = functions.https.onCall(async (data, context) => {
  const {deviceId, secret} = data;
  if (!deviceId || !secret) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing deviceId or secret');
  }

  try {
    const docRef = admin.firestore().doc(`pairings/${deviceId}`);
    const doc = await docRef.get();

    if (!doc.exists || doc.data().secret !== secret) {
      throw new functions.https.HttpsError('not-found', 'Invalid pairing');
    }

    const customToken = await admin.auth().createCustomToken(deviceId);
    await docRef.delete(); // Consume secret

    return { customToken };
  } catch (error) {
    console.error('Pairing error:', error);
    throw new functions.https.HttpsError('internal', 'Internal Server Error');
  }
});

// Manual Code Pairing: {code}
exports.pairWithCode = functions.https.onCall(async (data, context) => {
  const {code} = data;
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing pairing code');
  }

  try {
    const pairings = await admin.firestore().collection('pairings')
      .where('pairingCode', '==', code)
      .limit(1)
      .get();

    if (pairings.empty) {
      throw new functions.https.HttpsError('not-found', 'Invalid or expired code');
    }

    const pairDoc = pairings.docs[0];
    const {deviceId, secret} = pairDoc.data();
    
    const customToken = await admin.auth().createCustomToken(deviceId);
    await pairDoc.ref.delete(); // Consume code

    return { customToken, deviceId, secret };
  } catch (error) {
    console.error('Code pairing error:', error);
    throw new functions.https.HttpsError('internal', 'Internal Server Error');
  }
});
