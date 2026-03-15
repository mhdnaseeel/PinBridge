import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { initializeFirestore, doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
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
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

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

  // 6. Listen for pairing completion
  const unsub = onSnapshot(doc(db, 'pairings', deviceId), (snapshot) => {
    const data = snapshot.data();
    if (data && data.paired) {
        console.log('[PinBridge] Pairing confirmed by device!');
        unsub();
        
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
  });
})();
