import './style.css';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc, 
  updateDoc, 
  serverTimestamp, 
  deleteDoc 
} from "firebase/firestore";
import { 
  getAuth, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut
} from "firebase/auth";
import { 
  getDatabase, 
  ref, 
  onValue, 
  off 
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBwBr0MOdVKCwuvoK3oOU6tg5LcS7uqZOE",
  authDomain: "pinbridge-61dd4.firebaseapp.com",
  projectId: "pinbridge-61dd4",
  storageBucket: "pinbridge-61dd4.firebasestorage.app",
  messagingSenderId: "475556984962",
  appId: "1:475556984962:web:87e42b8f4e3b0ce9a89c9b",
  measurementId: "G-LEDS6BH99B",
  databaseURL: "https://pinbridge-61dd4-default-rtdb.firebaseio.com/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// State
let state = {
  user: null, // Firebase user object
  pairedDeviceId: localStorage.getItem('pairedDeviceId'),
  secret: localStorage.getItem('secret'),
  isOnline: false,
  lastSeen: null,
  latestOtp: JSON.parse(localStorage.getItem('latestOtp') || 'null'),
  signingIn: false,
  error: null
};

// DOM Elements
const appDiv = document.getElementById('app');
const offlineBanner = document.getElementById('offlineBanner');

// Listeners
let unsubOtp = null;
let unsubStatus = null;

/**
 * Checks URL for ?d=DEVICE_ID&s=SECRET and initializes pairing
 */
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const d = params.get('d');
  const s = params.get('s');
  
  if (d && s) {
    console.log('[PinBridge] Initializing pairing from URL parameters');
    state.pairedDeviceId = d;
    state.secret = s;
    localStorage.setItem('pairedDeviceId', d);
    localStorage.setItem('secret', s);
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }
  return false;
}

/**
 * Decrypts an OTP using AES-GCM
 */
async function decryptOtp(data, b64Secret) {
    if (!data || !data.iv || !data.otp || !b64Secret) throw new Error('Missing data');
    const secret = Uint8Array.from(atob(b64Secret), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
    const cipherText = Uint8Array.from(atob(data.otp), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipherText);
    return new TextDecoder().decode(decrypted);
}

// ─── UI RENDERING ───────────────────────────────────────────────

function updateUI() {
  if (!state.user) {
    renderSignIn();
  } else if (state.pairedDeviceId) {
    renderPaired();
  } else {
    renderUnpaired();
  }
}

/** Screen 1: Not signed in — show Google Sign-In */
function renderSignIn() {
  appDiv.innerHTML = `
    <div class="dashboard-layout">
      <div class="sidebar">
        <div class="logo-area">
          <img src="/logo.png" class="logo-icon-img" alt="Logo">
          <span class="logo-text">PinBridge</span>
        </div>
        <div class="status-group">
          <div class="status-item">
            <span class="status-label">Environment</span>
            <span class="status-value">Secure Cloud</span>
          </div>
        </div>
      </div>
      <div class="main-stage">
        <div class="locked-view">
          <div class="lock-icon">🔒</div>
          <h1 class="view-title">Dashboard Locked</h1>
          <p class="view-subtitle">Sign in with your Google account to access your OTP dashboard.</p>

          <div class="premium-card locked-card">
            <button id="googleLoginBtn" class="google-signin-btn" ${state.signingIn ? 'disabled' : ''}>
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="Google">
              ${state.signingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
            ${state.error ? `<p class="auth-error">${state.error}</p>` : ''}
            <p class="locked-hint">Your credentials are synced securely via AES-256 encryption.</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const googleBtn = document.getElementById('googleLoginBtn');
  if (googleBtn) googleBtn.onclick = loginWithGoogle;
}

/** Screen 2: Signed in but no device paired — passive waiting */
function renderUnpaired() {
  appDiv.innerHTML = `
    <div class="dashboard-layout">
      <div class="sidebar">
        <div class="logo-area">
          <img src="/logo.png" class="logo-icon-img" alt="Logo">
          <span class="logo-text">PinBridge</span>
        </div>
        <div class="status-group">
          <div class="status-item">
            <span class="status-label">Account</span>
            <span class="status-value" style="font-size: 11px;">${state.user?.email || 'Signed In'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Environment</span>
            <span class="status-value">Secure Cloud</span>
          </div>
        </div>
      </div>
      <div class="main-stage">
        <div class="locked-view">
          <div class="lock-icon">📱</div>
          <h1 class="view-title">Waiting for Pairing</h1>
          <p class="view-subtitle">Use the <strong>PinBridge Chrome Extension</strong> to pair with your Android app. This dashboard will automatically sync once pairing is complete.</p>

          <div class="premium-card locked-card">
            <div style="font-size: 48px; margin-bottom: 16px;">🔗</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 8px;">How to connect:</div>
            <ol style="text-align: left; font-size: 13px; color: var(--text-muted); line-height: 2; padding-left: 20px;">
              <li>Open the <strong>PinBridge Extension</strong> in Chrome</li>
              <li>Sign in with this same Google account</li>
              <li>Click <strong>"Start Pairing"</strong> to get a QR code</li>
              <li>Scan the QR with the <strong>PinBridge Android App</strong></li>
            </ol>

            <div class="signed-in-badge" style="justify-content: center; margin-top: 20px; max-width: 100%; box-sizing: border-box;">
              <span class="dot dot-online" style="flex-shrink: 0;"></span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Signed in as <strong>${state.user?.email || 'User'}</strong></span>
            </div>
            <p class="locked-hint" style="margin-top: 16px;">This page will update automatically once your extension pairs with a device.</p>
            <button id="signOutBtn" class="btn-signout" style="margin-top: 16px;">Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('signOutBtn').onclick = handleSignOut;
}

/** Screen 3: Signed in + device paired — full OTP dashboard */
function renderPaired() {
  const otp = state.latestOtp?.otp || '------';
  const time = state.latestOtp?.ts ? new Date(state.latestOtp.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'Waiting for signal...';
  
  appDiv.innerHTML = `
    <div class="dashboard-layout">
      <aside class="sidebar">
        <div class="logo-area">
          <img src="/logo.png" class="logo-icon-img" alt="Logo">
          <span class="logo-text">PinBridge</span>
        </div>
        
        <div class="status-group">
          <div class="status-item">
            <span class="status-label">Account</span>
            <span class="status-value" style="font-size: 11px;">${state.user?.email || 'Signed In'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Device Status</span>
            <span class="status-value">
              <span class="dot ${state.isOnline ? 'dot-online' : 'dot-offline'}"></span>
              ${state.isOnline ? 'Active' : 'Standby'}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Last Seen</span>
            <span class="status-value" style="font-size: 11px;">
              ${state.lastSeen ? new Date(state.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Never'}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Encryption</span>
            <span class="status-value" style="color: var(--primary);">AES-256</span>
          </div>
        </div>
      </aside>

      <main class="main-stage">
        <header class="view-header">
          <h1 class="view-title">Security Terminal</h1>
          <p class="view-subtitle">Real-time OTP mirroring from synchronized device <strong>${state.pairedDeviceId.slice(0,8)}...</strong></p>
        </header>

        <div class="premium-card">
          <div class="otp-section">
            <div class="otp-label">Active Verification Code</div>
            <div id="otpValue" class="otp-value">${otp}</div>
            <div class="otp-meta">Received at ${time}</div>
          </div>
          
          <div class="btn-group">
            <button id="copyBtn" class="btn-primary">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy Code
            </button>
            <button id="fetchBtn" class="btn-secondary">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              Quick Sync
            </button>
          </div>
        </div>

        <div class="footer-section" style="margin-top: 40px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div class="footer-links" style="color: var(--text-muted); font-size: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
            <span>● Secure Channel</span>
            <span>● End-to-End Encrypted</span>
          </div>
          <button id="signOutBtn" class="btn-signout" style="margin-top: 0;">Sign Out</button>
        </div>
      </main>
    </div>
  `;
  
  // Re-bind actions
  document.getElementById('copyBtn').onclick = () => {
    if (state.latestOtp?.otp) {
      navigator.clipboard.writeText(state.latestOtp.otp);
      const btn = document.getElementById('copyBtn');
      const original = btn.innerHTML;
      btn.innerHTML = '✓ Copied';
      setTimeout(() => btn.innerHTML = original, 2000);
    }
  };

  document.getElementById('fetchBtn').onclick = async () => {
    const btn = document.getElementById('fetchBtn');
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = 'Requesting...';
    try {
      await updateDoc(doc(db, 'pairings', state.pairedDeviceId), {
        fetchRequested: serverTimestamp()
      });
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = original;
      }, 3000);
    } catch (e) {
      btn.innerHTML = 'Error';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = original;
      }, 3000);
    }
  };

  document.getElementById('signOutBtn').onclick = handleSignOut;
}

// ─── AUTH ACTIONS ───────────────────────────────────────────────

async function loginWithGoogle() {
  state.signingIn = true;
  state.error = null;
  updateUI();

  const provider = new GoogleAuthProvider();
  try {
    // Use popup instead of redirect for a more desktop-friendly experience
    await signInWithPopup(auth, provider);
    state.signingIn = false;
    updateUI();
  } catch (err) {
    console.error('[PinBridge] Google Sign-In Error:', err.code, err.message);
    state.signingIn = false;
    
    if (err.code === 'auth/unauthorized-domain') {
      state.error = 'This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    } else if (err.code === 'auth/operation-not-allowed') {
      state.error = 'Google Sign-In not enabled. Enable it in Firebase Console → Authentication → Sign-in method.';
    } else {
      state.error = `Sign-in failed: ${err.code || err.message}`;
    }
    updateUI();
  }
}

let unsubCloudSync = null;

function listenToCloudSync(uid) {
  if (unsubCloudSync) unsubCloudSync();
  
  unsubCloudSync = onSnapshot(doc(db, 'users', uid, 'mirroring', 'active'), (syncSnap) => {
    if (syncSnap.exists()) {
      const data = syncSnap.data();
      console.log('[PinBridge] Cloud Sync active!');
      state.pairedDeviceId = data.deviceId;
      state.secret = data.secret;
      localStorage.setItem('pairedDeviceId', data.deviceId);
      localStorage.setItem('secret', data.secret);
      
      // Notify extension content script that pairing succeeded (if extension is active)
      window.postMessage({
        source: 'pinbridge-web',
        action: 'PAIRING_SUCCESS',
        deviceId: data.deviceId,
        secret: data.secret
      }, '*');

      startListeners();
      updateUI();
    } else {
      console.log('[PinBridge] No cloud sync found. Awaiting pairing.');
      if (state.pairedDeviceId) {
        handleForcedUnpair();
      } else {
        updateUI();
      }
    }
  }, (err) => {
    console.warn('[PinBridge] Cloud sync listener error:', err);
  });
}

async function handleSignOut() {
  stopListeners();
  state.pairedDeviceId = null;
  state.secret = null;
  state.latestOtp = null;
  state.user = null;
  localStorage.removeItem('pairedDeviceId');
  localStorage.removeItem('secret');
  localStorage.removeItem('latestOtp');
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('[PinBridge] Sign out error:', e);
  }
  updateUI();
}

// ─── LISTENERS ──────────────────────────────────────────────────

// Listen for sync/unpair from Extension
window.addEventListener('storage', (e) => {
  const d = localStorage.getItem('pairedDeviceId');
  const s = localStorage.getItem('secret');
  
  if (d && s && d !== state.pairedDeviceId) {
    state.pairedDeviceId = d;
    state.secret = s;
    startListeners();
    updateUI();
  } else if (!d && state.pairedDeviceId) {
    handleForcedUnpair();
  }
});

// Listen for direct messages from Extension Content Script
window.addEventListener('message', (e) => {
  if (e.data && e.data.source === 'pinbridge-extension') {
    if (e.data.action === 'UNPAIR') {
      handleForcedUnpair();
    } else if (e.data.action === 'SYNC') {
      localStorage.setItem('pairedDeviceId', e.data.deviceId);
      localStorage.setItem('secret', e.data.secret);
      window.dispatchEvent(new Event('storage'));
    }
  }
});

function startListeners() {
  if (!state.pairedDeviceId || !state.user) return;
  stopListeners();

  // 1. Presence (RTDB)
  const statusRef = ref(rtdb, `status/${state.pairedDeviceId}`);
  unsubStatus = onValue(statusRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    const now = Date.now();
    const lastSeen = data.last_changed || now;
    state.isOnline = data.state === 'online' || (now - lastSeen < 30000);
    state.lastSeen = lastSeen;
    updateUI();
  }, (err) => {
    console.warn('[PinBridge] RTDB error:', err);
  });

  // 2. OTP Mirroring (Firestore)
  unsubOtp = onSnapshot(doc(db, 'otps', state.pairedDeviceId), async (snap) => {
    const data = snap.data();
    if (!data) return;
    try {
      const decrypted = await decryptOtp(data, state.secret);
      const ts = data.smsTs || Date.now();
      state.latestOtp = { otp: decrypted, ts };
      localStorage.setItem('latestOtp', JSON.stringify(state.latestOtp));
      updateUI();
    } catch (e) {
      console.error('Decryption error', e);
    }
  }, (err) => {
    console.warn('[PinBridge] Firestore error:', err);
  });
}

function handleForcedUnpair() {
    stopListeners();
    state.pairedDeviceId = null;
    state.secret = null;
    state.latestOtp = null;
    localStorage.removeItem('pairedDeviceId');
    localStorage.removeItem('secret');
    localStorage.removeItem('latestOtp');
    updateUI();
}

function stopListeners() {
  if (unsubOtp) unsubOtp();
  if (unsubStatus) unsubStatus();
  unsubOtp = null;
  unsubStatus = null;
}

// ─── GLOBAL INIT ────────────────────────────────────────────────

// Browser online/offline
window.addEventListener('online', () => offlineBanner.classList.remove('active'));
window.addEventListener('offline', () => offlineBanner.classList.add('active'));
if (!navigator.onLine) offlineBanner.classList.add('active');

// Check URL params before auth
checkUrlParams();

// Auth state listener — single source of truth
onAuthStateChanged(auth, async (user) => {
  if (user && !user.isAnonymous) {
    state.user = user;

    // Fetch existing pairing session from cloud BEFORE broadcasting LOGIN_SUCCESS
    let pairedDeviceId = null;
    let secret = null;
    try {
      const syncSnap = await getDoc(doc(db, 'users', user.uid, 'mirroring', 'active'));
      if (syncSnap.exists()) {
        const data = syncSnap.data();
        pairedDeviceId = data.deviceId;
        secret = data.secret;
      }
    } catch (e) {
      console.warn('[PinBridge] Error checking active pairing:', e);
    }

    // Always broadcast to extension content script (handles both fresh sign-in and existing session)
    window.postMessage({
      source: 'pinbridge-web',
      action: 'LOGIN_SUCCESS',
      uid: user.uid,
      email: user.email,
      pairedDeviceId,
      secret
    }, '*');

    listenToCloudSync(user.uid);
  } else {
    state.user = null;
    if (unsubCloudSync) {
        unsubCloudSync();
        unsubCloudSync = null;
    }
    updateUI();
  }
});
