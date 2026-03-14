import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import QRCode from 'qrcode';

const firebaseConfig = {
  apiKey: "AIzaSyBwBr0MOdVKCwuvoK3oOU6tg5LcS7uqZOE",
  authDomain: "pinbridge-61dd4.firebaseapp.com",
  projectId: "pinbridge-61dd4",
  storageBucket: "pinbridge-61dd4.firebasestorage.app",
  messagingSenderId: "475556984962",
  appId: "1:475556984962:web:87e42b8f4e3b0ce9a89c9b",
  measurementId: "G-LEDS6BH99B"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

(async () => {
  const deviceId = crypto.randomUUID();
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secretB64 = btoa(String.fromCharCode(...secretBytes));

  // Generate a random 6-digit code
  const pairingCode = ('000000' + Math.floor(100000 + Math.random() * 900000)).slice(-6);

  console.log('[PinBridge] Generating pairing session:', { deviceId, pairingCode });

  // 1. Initialize via Cloud Function instead of direct Firestore write
  try {
    const startPairing = httpsCallable(functions, 'startPairing');
    await startPairing({
      deviceId,
      secret: secretB64,
      pairingCode: pairingCode
    });
    console.log('[PinBridge] Pairing session initialized via Cloud Function');
  } catch (e) {
    console.error('[PinBridge] Failed to initialize pairing session:', e);
    alert('Failed to initialize pairing session. Please try again or check Firebase Functions deployment.');
    return;
  }

  // 2. Save in session storage for the background script
  chrome.storage.session.set({
    deviceId,
    secret: secretB64,
    pairingCode
  });

  // 3. Render QR
  const payload = JSON.stringify({ deviceId, secret: secretB64, pairingCode });
  const canvas = document.getElementById('qrCanvas');
  QRCode.toCanvas(canvas, payload, { width: 256, margin: 1 }, err => {
    if (err) console.error(err);
  });

  // 4. Show code
  document.getElementById('code').textContent = pairingCode;

  // 5. Copy button
  document.getElementById('copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(pairingCode);
    const btn = document.getElementById('copyBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
})();
