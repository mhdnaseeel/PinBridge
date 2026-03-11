const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.pair = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    return res.status(204).send('');
  }

  const {deviceId, secret} = req.body;
  if (!deviceId || !secret) {
    return res.status(400).send('Missing deviceId or secret');
  }

  try {
    const docRef = admin.firestore().doc(`pairings/${deviceId}`);
    const doc = await docRef.get();

    if (!doc.exists || doc.data().secret !== secret) {
      return res.status(400).send('Invalid pairing');
    }

    // Create custom token that will be used as UID
    const customToken = await admin.auth().createCustomToken(deviceId);

    // Remove secret so it cannot be reused
    await docRef.delete();

    res.json({token: customToken});
  } catch (error) {
    console.error('Pairing error:', error);
    res.status(500).send('Internal Server Error');
  }
});
