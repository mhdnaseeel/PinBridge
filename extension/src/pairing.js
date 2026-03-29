import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import QRCode from 'qrcode';

import * as Sentry from "@sentry/browser";

// Sentry Initialization
Sentry.init({
    dsn: "https://3457c2e95d532379d40e4152fc7642c1@o4511118204141568.ingest.us.sentry.io/4511118399635456",
    tracesSampleRate: 1.0,
    sendDefaultPii: true
});

// Global error handlers to prevent Chrome Extension error UI
const targetScope = typeof self !== 'undefined' ? self : window;
targetScope.addEventListener('error', (e) => {
    Sentry.captureException(e.error || e.message);
    e.preventDefault();
    console.debug('[PinBridge] Reported error:', e.error || e.message);
});
targetScope.addEventListener('unhandledrejection', (e) => {
    Sentry.captureException(e.reason);
    e.preventDefault();
    console.debug('[PinBridge] Reported unhandled rejection:', e.reason);
});

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
const auth = getAuth(app);
const db = getFirestore(app);

(async () => {
  // Ensure we are signed in anonymously
  try {
    await signInAnonymously(auth);
    console.log('[PinBridge] Signed in anonymously');
  } catch (e) {
    console.error('[PinBridge] Auth failed:', e);
    alert('Failed to authenticate. Please check your internet connection.');
    return;
  }

  const deviceId = crypto.randomUUID();
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secretB64 = btoa(String.fromCharCode(...secretBytes));

  // Generate a random 6-digit code
  const pairingCode = ('000000' + Math.floor(100000 + Math.random() * 900000)).slice(-6);

  console.log('[PinBridge] Generating pairing session:', { deviceId, pairingCode });

  // 1. Initialize via direct Firestore write (Functionless Spark Plan)
  try {
    await setDoc(doc(db, 'pairings', deviceId), {
      secret: secretB64,
      pairingCode: pairingCode,
      createdAt: serverTimestamp()
    });
    console.log('[PinBridge] Pairing session initialized in Firestore');
  } catch (e) {
    console.error('[PinBridge] Failed to initialize pairing session:', e);
    alert(`Failed to initialize pairing session: ${e.message}\n\nPlease check your Firebase project setup.`);
    return;
  }

  // 2. Save in local storage for persistence across restarts
  chrome.storage.local.set({
    pairedDeviceId: deviceId, // Keep this consistent with what background expects
    secret: secretB64
  });

  // Also keep pairingCode in session if needed for the UI during pairing
  chrome.storage.session.set({
    deviceId,
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

  // 6. Listen for pairing completion
  const unsub = onSnapshot(doc(db, 'pairings', deviceId), (snapshot) => {
    const data = snapshot.data();
    if (data && data.paired) {
        console.log('[PinBridge] Pairing confirmed by device!');
        if (typeof unsub === 'function') unsub();
        
        // Notify background script to finalize pairing
        chrome.runtime.sendMessage({
            type: 'pair',
            deviceId: deviceId,
            secret: secretB64
        }, (response) => {
            if (response && response.status === 'paired') {
                // Update UI to show success
                const container = document.querySelector('.container');
                container.innerHTML = `
                    <h2 style="background: linear-gradient(to right, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Successfully Paired!</h2>
                    <p>Your Chrome extension is now securely connected to your mobile device.</p>
                    <div style="font-size: 64px; margin: 32px 0;">✅</div>
                    <button id="closeBtn">Close Window</button>
                `;
                document.getElementById('closeBtn').onclick = () => window.close();
            }
        });
    }
  }, (error) => {
    if (error.code === 'permission-denied') {
       console.log('[PinBridge] Pairing listener stopped (permission denied, likely signed out).');
       if (typeof unsub === 'function') unsub();
       window.close(); // Close the pairing window automatically
    } else {
       console.error('[PinBridge] Pairing snapshot error:', error);
    }
  });

  // 7. Auto-close if user signs out from popup while this tab is open
  chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.pairedDeviceId && !changes.pairedDeviceId.newValue) {
          if (typeof unsub === 'function') unsub();
          window.close();
      }
  });
})();
