// pair.test.js – integration test for the /pair HTTPS function
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

(async () => {
  const deviceId = uuidv4(); // random UUID
  const secret = crypto.randomBytes(32).toString('base64'); // 256‑bit secret

  const payload = { deviceId, secret };

  const url = 'http://localhost:5001/pinbridge-61dd4/us-central1/pair';
  // 👉 Replace {{FIREBASE_PROJECT_ID}} with your real Firebase project ID before running.

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      console.error('❌ Pairing failed – HTTP', resp.status);
      const err = await resp.text();
      console.error(err);
      process.exit(1);
    }

    const data = await resp.json();

    if (!data.customToken) {
      console.error('❌ Response missing customToken:', data);
      process.exit(1);
    }

    console.log('✅ Pairing succeeded – received custom token:');
    console.log(data.customToken);
  } catch (e) {
    console.error('❌ Exception while calling /pair:', e);
    process.exit(1);
  }
})();
