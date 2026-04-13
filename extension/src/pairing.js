import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import QRCode from 'qrcode';
import { FIREBASE_CONFIG } from "./config";

// Global error handlers to prevent Chrome Extension error UI
const targetScope = typeof self !== 'undefined' ? self : window;
targetScope.addEventListener('error', (e) => {
    console.error('[PinBridge] Uncaught error:', e.error || e.message);
    e.preventDefault();
});
targetScope.addEventListener('unhandledrejection', (e) => {
    console.error('[PinBridge] Unhandled rejection:', e.reason);
    e.preventDefault();
});

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── Status UI helpers ─────────────────────────────────────────
const statusArea = () => document.getElementById('statusArea');
const statusText = () => document.getElementById('statusText');
const countdownEl = () => document.getElementById('countdown');

function setStatus(type, icon, message, showRetry = false) {
  const area = statusArea();
  const text = statusText();
  if (!area || !text) return;

  area.className = `status-area status-${type}`;
  // Clear existing content
  area.innerHTML = '';
  
  const iconSpan = document.createElement('span');
  iconSpan.className = `status-icon${type === 'waiting' ? ' pulse' : ''}`;
  iconSpan.textContent = icon;
  area.appendChild(iconSpan);

  const textSpan = document.createElement('span');
  textSpan.className = 'status-text';
  textSpan.id = 'statusText';
  textSpan.textContent = message;
  area.appendChild(textSpan);

  if (showRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = 'Retry Pairing';
    retryBtn.onclick = () => window.location.reload();
    // Append retry button below the status area
    area.parentElement.appendChild(retryBtn);
  }
}

// ─── Countdown timer ───────────────────────────────────────────
const PAIRING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
let countdownInterval = null;

function startCountdown(startTime) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const remaining = PAIRING_TIMEOUT_MS - elapsed;
    
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      setStatus('error', '⏰', 'Pairing session expired. Please try again.', true);
      const cdEl = countdownEl();
      if (cdEl) cdEl.textContent = '';
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const cdEl = countdownEl();
    if (cdEl) cdEl.textContent = `Session expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

// ─── Main pairing flow ─────────────────────────────────────────
(async () => {
  const startTime = Date.now();

  // Use a promise to wait for auth to initialize or change
  const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe();
      resolve(u);
    });
  });

  if (!user) {
    console.log('[PinBridge] No active session, signing in anonymously for initial setup...');
    try {
      await signInAnonymously(auth);
      console.log('[PinBridge] Signed in anonymously');
    } catch (e) {
      console.error('[PinBridge] Auth failed:', e);
      setStatus('error', '❌', 'Failed to authenticate. Please check your internet connection and try again.', true);
      return;
    }
  } else {
    console.log('[PinBridge] Using existing session:', user.uid);
  }

  const deviceId = crypto.randomUUID();
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secretB64 = btoa(String.fromCharCode(...secretBytes));

  // Generate a random 6-digit code
  const pairingCode = ('000000' + Math.floor(100000 + Math.random() * 900000)).slice(-6);

  console.log('[PinBridge] Generating pairing session:', { deviceId, pairingCode });

  // Read the signed-in Google UID to embed in the pairing session
  const { googleUid } = await chrome.storage.local.get(['googleUid']);
  if (!googleUid) {
    setStatus('error', '🔒', 'You must sign in with Google before pairing. Please close this window and sign in first.');
    return;
  }

  // 1. Initialize via direct Firestore write (Functionless Spark Plan)
  //    FIX: Include paired: false explicitly so the state is unambiguous
  try {
    await setDoc(doc(db, 'pairings', deviceId), {
      secret: secretB64,
      pairingCode: pairingCode,
      googleUid: googleUid,
      paired: false,         // Explicitly false — Android will set to true
      createdAt: serverTimestamp()
    });
    console.log('[PinBridge] Pairing session initialized in Firestore with googleUid:', googleUid);
  } catch (e) {
    console.error('[PinBridge] Failed to initialize pairing session:', e);
    setStatus('error', '❌', `Failed to initialize pairing session: ${e.message}. Please check your Firebase setup.`, true);
    return;
  }

  // 2. FIX: Do NOT save pairedDeviceId to chrome.storage.local yet!
  //    Only save to session storage for temporary use during the pairing flow.
  //    pairedDeviceId will be saved AFTER the Android app confirms pairing.
  //    This prevents background.js from starting listeners prematurely.
  chrome.storage.session.set({
    deviceId,
    secret: secretB64,
    pairingCode,
    pairingInProgress: true
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

  // 6. Start countdown
  startCountdown(startTime);

  // 7. Listen for pairing completion — two-phase:
  //    Phase 1: paired === true (device scanned QR)
  //    Phase 2: status === 'online' (device connected to presence server)
  let pairingCompleted = false;
  let pairingPhase1Done = false;
  const unsub = onSnapshot(doc(db, 'pairings', deviceId), (snapshot) => {
    const data = snapshot.data();
    if (!data || pairingCompleted) return;

    // Phase 1: Device confirmed pairing
    if (data.paired === true && !pairingPhase1Done) {
        pairingPhase1Done = true;
        console.log('[PinBridge] Phase 1: Pairing confirmed by device. Waiting for device to come online...');
        
        // FIX (Bug 3): Hide the QR code, manual entry code, copy button, and countdown
        // so the user doesn't see a confusing mix of QR + "Device paired!" message
        const qrCanvas = document.getElementById('qrCanvas');
        const codeBox = document.querySelector('.code-box');
        const copyBtn = document.getElementById('copyBtn');
        const cdEl = countdownEl();
        
        if (qrCanvas) qrCanvas.style.display = 'none';
        if (codeBox) codeBox.style.display = 'none';
        if (copyBtn) copyBtn.style.display = 'none';
        if (cdEl) cdEl.style.display = 'none';
        
        // Update the description text
        const descText = document.querySelector('.container > p');
        if (descText) descText.textContent = 'Establishing secure connection with your device...';
        
        setStatus('waiting', '🔄', 'Device paired! Waiting for connection...');
        
        // Save credentials immediately so the background can start listeners
        chrome.storage.local.set({
          pairedDeviceId: deviceId,
          secret: secretB64
        });
        chrome.storage.session.remove(['pairingInProgress']);
        
        // Notify background to start listeners right away
        chrome.runtime.sendMessage({
            type: 'pair',
            deviceId: deviceId,
            secret: secretB64
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn('[PinBridge] Background response error:', chrome.runtime.lastError.message);
            }
        });
    }

    // Phase 2: Device is online — full success
    if (pairingPhase1Done && data.status === 'online' && !pairingCompleted) {
        pairingCompleted = true;
        console.log('[PinBridge] Phase 2: Device online! Pairing fully complete.');
        if (typeof unsub === 'function') unsub();
        if (countdownInterval) clearInterval(countdownInterval);
        
        const container = document.querySelector('.container');
        container.innerHTML = `
            <h2 style="background: linear-gradient(to right, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Successfully Paired!</h2>
            <p>Your Chrome extension is now securely connected to your mobile device.</p>
            <div style="font-size: 64px; margin: 32px 0;">✅</div>
            <button id="closeBtn">Close Window</button>
        `;
        document.getElementById('closeBtn').onclick = () => window.close();
        setTimeout(() => { try { window.close(); } catch (e) {} }, 5000);
    }

    // Fallback: If Phase 1 is done but device doesn't come online within 30s,
    // still allow closing — the background has already started listeners.
    if (pairingPhase1Done && !pairingCompleted) {
        setTimeout(() => {
            if (!pairingCompleted) {
                pairingCompleted = true;
                console.log('[PinBridge] Phase 2 timeout — closing with Phase 1 success.');
                if (typeof unsub === 'function') unsub();
                if (countdownInterval) clearInterval(countdownInterval);
                
                const container = document.querySelector('.container');
                container.innerHTML = `
                    <h2 style="background: linear-gradient(to right, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Successfully Paired!</h2>
                    <p>Your Chrome extension is now securely connected to your mobile device.</p>
                    <div style="font-size: 64px; margin: 32px 0;">✅</div>
                    <button id="closeBtn">Close Window</button>
                `;
                document.getElementById('closeBtn').onclick = () => window.close();
                setTimeout(() => { try { window.close(); } catch (e) {} }, 5000);
            }
        }, 30000);
    }
  }, (error) => {
    if (error.code === 'permission-denied') {
       console.warn('[PinBridge] Pairing listener: permission denied.');
       if (!pairingCompleted) {
         setStatus('error', '🔒', 'Permission error. You may need to sign in again.', true);
       }
       if (typeof unsub === 'function') unsub();
    } else {
       console.error('[PinBridge] Pairing snapshot error:', error);
       if (!pairingCompleted) {
         setStatus('error', '⚠️', `Connection error: ${error.message}. Please try again.`, true);
       }
    }
  });

  // 8. FIX: Only listen for explicit unpair actions (e.g. user signed out),
  //    NOT for pairedDeviceId changes (since we no longer write it prematurely).
  chrome.storage.onChanged.addListener((changes, area) => {
      // If user signs out (googleUid removed) while pairing page is open, close it
      if (area === 'local' && changes.googleUid && !changes.googleUid.newValue) {
          if (!pairingCompleted) {
            if (typeof unsub === 'function') unsub();
            if (countdownInterval) clearInterval(countdownInterval);
            setStatus('error', '🔒', 'You were signed out. Closing...');
            setTimeout(() => window.close(), 2000);
          }
      }
  });
})();
