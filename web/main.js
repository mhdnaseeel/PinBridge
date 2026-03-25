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
  signInAnonymously, 
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
  pairedDeviceId: localStorage.getItem('pairedDeviceId'),
  secret: localStorage.getItem('secret'),
  isOnline: false,
  lastSeen: null,
  latestOtp: JSON.parse(localStorage.getItem('latestOtp') || 'null'),
  pairingDeviceId: null,
  pairingSecret: null
};

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
    // Clear URL params without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }
  return false;
}

// DOM Elements
const appDiv = document.getElementById('app');
const offlineBanner = document.getElementById('offlineBanner');

// Listeners
let unsubOtp = null;
let unsubStatus = null;

/**
 * Decrypts an OTP using AES-GCM (Mirrored from extension)
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

function updateUI() {
  if (state.pairedDeviceId) {
    renderPaired();
  } else {
    renderUnpaired();
  }
}

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
            <span class="status-label">Environment</span>
            <span class="status-value">Secure Cloud</span>
          </div>
        </div>
      </div>
      <div class="main-stage">
        <div class="locked-view">
          <div class="view-header">
            <h1 class="view-title">Dashboard Locked</h1>
            <p class="view-subtitle">Pair your device or log in to sync your profile.</p>
          </div>

          <div class="premium-card glass">
            <div class="lock-vignette">🔒</div>
            <div class="btn-group" style="margin-top: 24px;">
              <button id="googleLoginBtn" class="btn-primary" style="background: white; color: #1f2937;">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" style="margin-right: 10px;">
                Sign in with Google
              </button>
            </div>
            <p style="margin-top: 16px; font-size: 13px; color: var(--text-dim); text-align: center;">
              Log in to automatically pair this browser with your existing cloud profile.
            </p>
          </div>
        </div>
      </div>
  `;
}

function renderPaired() {
  const otp = state.latestOtp?.otp || '------';
  const time = state.latestOtp?.ts ? new Date(state.latestOtp.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}) : 'Waiting for signal...';
  
  appDiv.innerHTML = `
    <div class="dashboard-layout">
      <!-- Professional Sidebar -->
      <aside class="sidebar">
        <div class="logo-area">
          <img src="/logo.png" class="logo-icon-img" alt="Logo">
          <span class="logo-text">PinBridge</span>
        </div>
        
        <div class="status-group">
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

      <!-- Main Stage -->
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
              Copy Terminal
            </button>
            <button id="fetchBtn" class="btn-secondary">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              Quick Sync
            </button>
          </div>
        </div>

        <div style="margin-top: 40px; color: var(--text-muted); font-size: 12px; display: flex; gap: 20px;">
          <span>● Secure Channel</span>
          <span>● End-to-End Encrypted</span>
          <span>● Private Instance</span>
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
      btn.innerHTML = 'Success';
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
}

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

// Listen for direct messages from Extension Content Script (Robust Sync)
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
  if (!state.pairedDeviceId) return;
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
    if (document.getElementById('googleLoginBtn')) {
    document.getElementById('googleLoginBtn').onclick = loginWithGoogle;
  }
}

async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    console.log('[PinBridge] Signed in with Google:', result.user.email);
    // After login, check for cloud-synced pairing
    await checkCloudSync(result.user.uid);
  } catch (err) {
    console.error('Google Sign-In Error', err);
    alert('Failed to sign in with Google');
  }
}

async function checkCloudSync(uid) {
  const syncSnap = await getDoc(doc(db, 'users', uid, 'mirroring', 'active'));
  if (syncSnap.exists()) {
    const data = syncSnap.data();
    console.log('[PinBridge] Cloud Sync found! Updating local credentials...');
    localStorage.setItem('pairedDeviceId', data.deviceId);
    localStorage.setItem('secret', data.secret);
    window.location.reload(); // Quickest way to re-init with new credentials
  } else {
    console.log('[PinBridge] No cloud sync found for this account.');
    alert('This Google account has no paired devices synced yet. Please pair your Android app first and enable Cloud Sync there.');
  }
}

function stopListeners() {
  if (unsubOtp) unsubOtp();
  if (unsubStatus) unsubStatus();
}

// Global Browser Status
window.addEventListener('online', () => offlineBanner.classList.remove('active'));
window.addEventListener('offline', () => offlineBanner.classList.add('active'));
if (!navigator.onLine) offlineBanner.classList.add('active');

// Auth Lifecycle & Init
checkUrlParams();

onAuthStateChanged(auth, user => {
  if (user && state.pairedDeviceId) {
    startListeners();
  } else if (!user) {
    signInAnonymously(auth);
  }
});

updateUI();
