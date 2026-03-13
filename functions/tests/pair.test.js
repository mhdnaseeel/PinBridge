// pair.test.js – integration test for the /pair HTTPS function
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

(async () => {
  // ---- Build a realistic payload -------------------------------------------------
  const deviceId = uuidv4();
  const secret = crypto.randomBytes(32).toString('base64'); // 256-bit secret

  const payload = { deviceId, secret };
  const url = 'http://localhost:5001/{{FIREBASE_PROJECT_ID}}/us-central1/pair';

  console.log(`Testing Cloud Function at: ${url}`);
  console.log(`Payload: ${JSON.stringify(payload)}`);

  // ---- POST to the Cloud Function ------------------------------------------------
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      console.error('❌ Pairing failed – status', resp.status);
      const err = await resp.text();
      console.error(err);
      process.exit(1);
    }

    const data = await resp.json();
    if (!data.customToken) {
      console.error('❌ No customToken in response', data);
      process.exit(1);
    }

    console.log('✅ Pairing succeeded – received custom token:', data.customToken);
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    process.exit(1);
  }
})();
