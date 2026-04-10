import './style.css';
import * as Sentry from "@sentry/browser";

// Sentry Initialization
Sentry.init({
    dsn: "https://3457c2e95d532379d40e4152fc7642c1@o4511118204141568.ingest.us.sentry.io/4511118399635456",
    tracesSampleRate: 0.2,
    sendDefaultPii: false
});


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
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { io } from "socket.io-client";

const SOCKET_SERVER_URL = "https://pinbridge-presence.onrender.com";
let socket = null;

const firebaseConfig = {
  apiKey: "AIzaSyBwBr0MOdVKCwuvoK3oOU6tg5LcS7uqZOE",
  authDomain: "pinbridge-61dd4.firebaseapp.com",
  projectId: "pinbridge-61dd4",
  storageBucket: "pinbridge-61dd4.firebasestorage.app",
  messagingSenderId: "475556984962",
  appId: "1:475556984962:web:87e42b8f4e3b0ce9a89c9b",
  measurementId: "G-LEDS6BH99B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check (P0 - Security)
// IMPORTANT: Replace 'YOUR_RECAPTCHA_SITE_KEY' with your actual reCAPTCHA v3 site key from the Google Cloud Console.
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('YOUR_RECAPTCHA_SITE_KEY'),
  isTokenAutoRefreshEnabled: true
});

const auth = getAuth(app);
const db = getFirestore(app);

// State
// Security (V-01): secret is kept in-memory ONLY — never persisted to localStorage.
// On page refresh, it is re-fetched from the Firestore cloud sync document.
let state = {
  user: null, // Firebase user object
  pairedDeviceId: localStorage.getItem('pairedDeviceId'),
  secret: null, // In-memory only — never localStorage (V-01)
  lastSeen: 0,
  batteryLevel: null,
  isCharging: false,
  serverStatus: null, // Authoritative status from socket server ('online'/'offline')
  latestOtp: JSON.parse(localStorage.getItem('latestOtp') || 'null'),
  signingIn: false,
  error: null
};

// Active heartbeat: derive online/offline from lastSeen
const ONLINE_THRESHOLD = 25000; // 25 seconds
function isDeviceOnline() {
  const now = Date.now();
  const isRecent = state.lastSeen > 0 && (now - state.lastSeen < ONLINE_THRESHOLD);
  const isTrustworthy = state.lastSeen > 0 && (now - state.lastSeen < 60000);
  return isRecent || (state.serverStatus === 'online' && isTrustworthy);
}

// HTML escaping utility (V-07)
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
    state.secret = s; // In-memory only (V-01)
    localStorage.setItem('pairedDeviceId', d);
    // Security (V-01): Do NOT persist secret to localStorage
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

// ─── DOM HELPER ─────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'className') {
      element.className = value;
    } else if (key === 'id') {
      element.id = value;
    } else if (value !== undefined && value !== null) {
      element.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (!child) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }
  return element;
}

// ─── UI RENDERING ───────────────────────────────────────────────

function updateUI() {
  if (!state.user) {
    renderSignIn();
  } else if (state.pairedDeviceId) {
    // If paired view is already rendered, just update the dynamic parts
    const connIndicator = document.getElementById('connectionIndicator');
    if (connIndicator) {
      updateConnectionIndicator();
      // Also update OTP display if changed
      const otpEl = document.getElementById('otpValue');
      const otpMetaEl = document.getElementById('otpMeta');
      if (otpEl && state.latestOtp?.otp) {
        otpEl.textContent = state.latestOtp.otp;
        const time = new Date(state.latestOtp.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
        otpMetaEl.textContent = `Received at ${time}`;
      }
    } else {
      renderPaired();
    }
  } else {
    renderUnpaired();
  }
}

/** Update only the connection indicator without full re-render */
function updateConnectionIndicator() {
  const dot = document.getElementById('connDot');
  const statusText = document.getElementById('connStatus');
  const detailText = document.getElementById('connDetail');
  const sidebarDot = document.getElementById('sidebarDeviceDot');
  const sidebarStatus = document.getElementById('sidebarDeviceStatus');
  const sidebarLastSeen = document.getElementById('sidebarLastSeen');
  const batteryEl = document.getElementById('batteryDisplay');
  const sidebarBatteryEl = document.getElementById('sidebarBattery');
  
  if (!dot) return;
  
  const online = isDeviceOnline();
  
  if (online) {
    dot.className = 'dot dot-online';
    statusText.textContent = 'Online';
    statusText.style.color = '#10b981';
    detailText.textContent = 'Device is connected and active';
  } else if (state.lastSeen > 0) {
    dot.className = 'dot dot-offline';
    statusText.textContent = 'Offline';
    statusText.style.color = '#f59e0b';
    const timeStr = new Date(state.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    detailText.textContent = `Last seen at ${timeStr}`;
  } else {
    dot.className = 'dot dot-connecting';
    statusText.textContent = 'Connecting...';
    statusText.style.color = '#6366f1';
    detailText.textContent = 'Establishing connection to device';
  }

  // Update battery display
  const hasBattery = state.batteryLevel != null && state.batteryLevel >= 0;
  if (batteryEl) {
    if (hasBattery) {
      if (online) {
        let batteryHtml = `🔋 ${state.batteryLevel}%`;
        if (state.isCharging) {
          batteryHtml += ' <span class="charging-badge">⚡ Charging</span>';
        }
        batteryEl.innerHTML = batteryHtml;
        batteryEl.style.color = '';
      } else {
        batteryEl.innerHTML = `🔋 ${state.batteryLevel}% <span style="color:#ef4444;font-size:12px;">(Last known)</span>`;
        batteryEl.style.color = '#ef4444';
      }
      batteryEl.style.display = 'flex';
    } else {
      batteryEl.style.display = 'none';
    }
  }
  
  // Update sidebar
  if (sidebarStatus) {
    const sidebarDotClass = online ? 'dot-online' : (state.lastSeen > 0 ? 'dot-offline' : 'dot-connecting');
    const sidebarLabel = online ? 'Online' : (state.lastSeen > 0 ? 'Offline' : 'Connecting...');
    sidebarStatus.innerHTML = `<span id="sidebarDeviceDot" class="dot ${sidebarDotClass}"></span> ${sidebarLabel}`;
  }
  if (sidebarLastSeen) {
    sidebarLastSeen.textContent = state.lastSeen ? new Date(state.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Never';
  }
  if (sidebarBatteryEl) {
    if (hasBattery) {
      if (online) {
        let sidebarBatteryHtml = `${state.batteryLevel}%`;
        if (state.isCharging) {
          sidebarBatteryHtml += ' ⚡';
        }
        sidebarBatteryEl.textContent = sidebarBatteryHtml;
        sidebarBatteryEl.style.color = '';
      } else {
        sidebarBatteryEl.textContent = `${state.batteryLevel}%`;
        sidebarBatteryEl.style.color = '#ef4444';
      }
    } else {
      sidebarBatteryEl.textContent = '--';
      sidebarBatteryEl.style.color = '';
    }
  }
}

/** Screen 1: Not signed in — show Google Sign-In */
/** Screen 1: Not signed in — show Google Sign-In */
function renderSignIn() {
  appDiv.innerHTML = ''; // Clear DOM safely

  const loginBtn = el('button', { 
    id: 'googleLoginBtn', 
    className: 'google-signin-btn',
    disabled: state.signingIn ? 'disabled' : null,
  }, 
    el('img', { src: 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg', width: '20', alt: 'Google' }),
    state.signingIn ? ' Signing in...' : ' Sign in with Google'
  );
  loginBtn.onclick = loginWithGoogle;

  const errorEl = state.error ? el('p', { className: 'auth-error' }, String(state.error)) : undefined;

  appDiv.appendChild(
    el('div', { className: 'dashboard-layout' },
      el('div', { className: 'sidebar' },
        el('div', { className: 'logo-area' },
          el('img', { src: '/logo.png', className: 'logo-icon-img', alt: 'Logo' }),
          el('span', { className: 'logo-text' }, 'PinBridge')
        ),
        el('div', { className: 'status-group' },
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Environment'),
            el('span', { className: 'status-value' }, 'Secure Cloud')
          )
        )
      ),
      el('div', { className: 'main-stage' },
        el('div', { className: 'locked-view' },
          el('div', { className: 'lock-icon' }, '🔒'),
          el('h1', { className: 'view-title' }, 'Dashboard Locked'),
          el('p', { className: 'view-subtitle' }, 'Sign in with your Google account to access your OTP dashboard.'),
          el('div', { className: 'premium-card locked-card' },
            loginBtn,
            errorEl,
            el('p', { className: 'locked-hint' }, 'Your credentials are synced securely via AES-256 encryption.')
          )
        )
      )
    )
  );
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
            <span class="status-value" style="font-size: 11px;">${escapeHtml(state.user?.email) || 'Signed In'}</span>
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
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Signed in as <strong>${escapeHtml(state.user?.email) || 'User'}</strong></span>
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
  
  const statusColor = isDeviceOnline() ? '#10b981' : (state.lastSeen > 0 ? '#f59e0b' : '#6366f1');
  const statusLabel = isDeviceOnline() ? 'Online' : (state.lastSeen > 0 ? 'Offline' : 'Connecting...');
  const dotClass = isDeviceOnline() ? 'dot-online' : (state.lastSeen > 0 ? 'dot-offline' : 'dot-connecting');
  const lastSeenStr = state.lastSeen ? new Date(state.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Never';
  const connDetail = isDeviceOnline() ? 'Device is connected and active' : 
    (state.lastSeen && state.lastSeen > 0 ? `Last seen at ${lastSeenStr}` : 'Establishing connection to device');
  
  // Battery display strings
  const deviceOnline = isDeviceOnline();
  const hasBattery = state.batteryLevel != null && state.batteryLevel >= 0;
  const sidebarBatteryStr = hasBattery ? `${state.batteryLevel}%${deviceOnline && state.isCharging ? ' ⚡' : ''}` : '--';
  const sidebarBatteryColor = hasBattery && !deviceOnline ? '#ef4444' : '';
  let batteryHtml = '';
  let batteryStyle = '';
  if (hasBattery) {
    if (deviceOnline) {
      batteryHtml = `🔋 ${state.batteryLevel}%`;
      if (state.isCharging) {
        batteryHtml += ' <span class="charging-badge">⚡ Charging</span>';
      }
    } else {
      batteryHtml = `🔋 ${state.batteryLevel}% <span style="color:#ef4444;font-size:12px;">(Last known)</span>`;
      batteryStyle = 'color:#ef4444;';
    }
  }
  
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
            <span class="status-value" style="font-size: 11px;">${escapeHtml(state.user?.email) || 'Signed In'}</span>
          </div>
          <div class="status-item">
            <span class="status-label">Device</span>
            <span id="sidebarDeviceStatus" class="status-value" style="font-size: 11px; font-weight: 500; color: ${statusColor};">
              <span id="sidebarDeviceDot" class="dot ${dotClass}"></span> ${statusLabel}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Last Seen</span>
            <span id="sidebarLastSeen" class="status-value" style="font-size: 11px;">
              ${lastSeenStr}
            </span>
          </div>
          <div class="status-item">
            <span class="status-label">Battery</span>
            <span id="sidebarBattery" class="status-value" style="font-size: 11px;${sidebarBatteryColor ? ' color:' + sidebarBatteryColor + ';' : ''}">
              ${sidebarBatteryStr}
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
          <p class="view-subtitle">Real-time OTP mirroring from device <strong>${escapeHtml(state.pairedDeviceId?.slice(0,8))}...</strong></p>
        </header>

        <div id="connectionIndicator" class="connection-indicator">
          <span id="connDot" class="dot ${dotClass}"></span>
          <div class="conn-text">
            <span id="connStatus" class="conn-status" style="color: ${statusColor};">${statusLabel}</span>
            <span id="connDetail" class="conn-detail">${connDetail}</span>
          </div>
        </div>

        <div id="batteryDisplay" class="battery-display" style="display: ${hasBattery ? 'flex' : 'none'};${batteryStyle}">
          ${batteryHtml}
        </div>

        <div class="premium-card">
          <div class="otp-section">
            <div class="otp-label">Active Verification Code</div>
            <div id="otpValue" class="otp-value">${otp}</div>
            <div id="otpMeta" class="otp-meta">Received at ${time}</div>
          </div>
          
          <div class="btn-group">
            <button id="copyBtn" class="btn-primary" style="margin-bottom: 10px; width: 100%;">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy Code
            </button>
            <div style="display: flex; gap: 10px; width: 100%;">
              <button id="fetchBtn" class="btn-secondary" style="flex: 1;">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Quick Sync
              </button>
              <button id="syncSignalBtn" class="btn-secondary" style="flex: 1; background: #3b82f6; border-color: #3b82f6; color: white;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                Sync Signal
              </button>
            </div>
          </div>
        </div>

        <div class="footer-section" style="margin-top: 40px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div class="footer-links" style="color: var(--text-muted); font-size: 12px; display: flex; gap: 20px; flex-wrap: wrap;">
            <span>● Secure Channel</span>
            <span>● End-to-End Encrypted</span>
            <span>● Auto-Push Active</span>
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
    
    if (!isDeviceOnline()) {
      const original = btn.innerHTML;
      btn.innerHTML = 'Device Offline';
      btn.style.background = '#ef4444';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = '';
        btn.disabled = false;
      }, 2000);
      return;
    }

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = 'Requesting...';
    try {
      const preEventId = state.latestOtp ? state.latestOtp.otpEventId : null;
      await updateDoc(doc(db, 'pairings', state.pairedDeviceId), {
        fetchRequested: serverTimestamp()
      });
      
      let attempts = 0;
      const waitInterval = setInterval(() => {
          attempts++;
          if (state.latestOtp && state.latestOtp.otpEventId !== preEventId) {
             clearInterval(waitInterval);
             btn.innerHTML = 'Success!';
             btn.style.background = '#10b981';
             setTimeout(() => { btn.disabled = false; btn.innerHTML = original; btn.style.background = ''; }, 2000);
          } else if (attempts >= 10) { // 10 seconds timeout
             clearInterval(waitInterval);
             btn.innerHTML = 'Timed Out';
             btn.style.background = '#f59e0b';
             setTimeout(() => { btn.disabled = false; btn.innerHTML = original; btn.style.background = ''; }, 2000);
          }
      }, 1000);
    } catch (e) {
      btn.innerHTML = 'Error';
      btn.style.background = '#ef4444';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = original;
        btn.style.background = '';
      }, 3000);
    }
  };

  const syncSignalBtn = document.getElementById('syncSignalBtn');
  if (syncSignalBtn) {
    syncSignalBtn.onclick = () => {
      if (socket) {
        syncSignalBtn.disabled = true;
        const original = syncSignalBtn.innerHTML;
        syncSignalBtn.innerHTML = 'Connecting...';

        // Clear cached data so UI doesn't show old values while connecting
        state.lastSeen = 0;
        state.batteryLevel = null;
        state.serverStatus = 'offline';
        updateUI();
        
        socket.disconnect();
        setTimeout(() => {
          socket.connect();
          socket.emit('request_presence');
          syncSignalBtn.innerHTML = 'Sent!';
          syncSignalBtn.style.background = '#10b981';
          syncSignalBtn.style.borderColor = '#10b981';
          setTimeout(() => {
            syncSignalBtn.innerHTML = original;
            syncSignalBtn.style.background = '#3b82f6';
            syncSignalBtn.style.borderColor = '#3b82f6';
            syncSignalBtn.disabled = false;
          }, 2000);
        }, 500);
      }
    };
  }

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
  
  unsubCloudSync = onSnapshot(doc(db, 'users', uid, 'mirroring', 'active'), async (syncSnap) => {
    if (syncSnap.exists()) {
      const data = syncSnap.data();
      const deviceId = data.deviceId;
      const secret = data.secret;

      if (!deviceId || !secret) {
        console.warn('[PinBridge] Cloud sync data incomplete.');
        updateUI();
        return;
      }

      // Validate that the pairing is still active in Firestore before auto-pairing
      try {
        const pairingSnap = await getDoc(doc(db, 'pairings', deviceId));
        if (pairingSnap.exists() && pairingSnap.data()?.paired === true) {
          // Pairing is still valid — proceed
          console.log('[PinBridge] Cloud Sync active! Pairing validated.');
          state.pairedDeviceId = deviceId;
          state.secret = secret;
          // Security (V-01): Do NOT persist secret to localStorage
          
          // Notify extension content script that pairing succeeded (if extension is active)
          // Fix V-02: Use own origin instead of '*'
          window.postMessage({
            source: 'pinbridge-web',
            action: 'PAIRING_SUCCESS',
            deviceId: deviceId,
            secret: secret
          }, window.location.origin);

          startListeners();
          updateUI();
        } else {
          // Stale cloud sync data — clean up
          console.warn('[PinBridge] Cloud sync data is stale (pairing doc missing or unpaired). Cleaning up.');
          try {
            await deleteDoc(doc(db, 'users', uid, 'mirroring', 'active'));
            console.log('[PinBridge] Stale cloud sync document cleaned up.');
          } catch (e) {
            console.warn('[PinBridge] Failed to clean up stale cloud sync:', e);
          }
          if (state.pairedDeviceId) {
            handleForcedUnpair();
          } else {
            updateUI();
          }
        }
      } catch (e) {
        console.warn('[PinBridge] Failed to validate pairing document:', e);
        updateUI();
      }
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
  localStorage.removeItem('latestOtp');
  // Note: secret is in-memory only (V-01), no localStorage removal needed
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('[PinBridge] Sign out error:', e);
  }
  updateUI();
}

// ─── LISTENERS ──────────────────────────────────────────────────

// Listen for sync/unpair from Extension
// Note: secret is no longer in localStorage (V-01). The storage listener only
// tracks deviceId changes. The secret is provided via postMessage SYNC events
// or re-fetched from Firestore cloud sync.
window.addEventListener('storage', (e) => {
  const d = localStorage.getItem('pairedDeviceId');
  
  if (d && d !== state.pairedDeviceId) {
    // deviceId changed — secret will arrive via postMessage SYNC or cloud sync
    state.pairedDeviceId = d;
    // If secret is already in memory (from SYNC message), start listeners
    if (state.secret) {
      startListeners();
    }
    updateUI();
  } else if (!d && state.pairedDeviceId) {
    handleForcedUnpair();
  }
});

// Listen for direct messages from Extension Content Script
// Fix V-03: Validate event.source to only accept same-frame messages
window.addEventListener('message', (e) => {
  if (e.source !== window) return; // Only accept from same frame
  if (e.data && e.data.source === 'pinbridge-extension') {
    if (e.data.action === 'UNPAIR') {
      handleForcedUnpair();
    } else if (e.data.action === 'SYNC') {
      localStorage.setItem('pairedDeviceId', e.data.deviceId);
      state.secret = e.data.secret; // In-memory only (V-01)
      window.dispatchEvent(new Event('storage'));
    }
  }
});


function startListeners() {
  if (!state.pairedDeviceId || !state.user) return;
  stopListeners();

  // 1. Presence (Socket.IO)
  if (!socket) {
    // P1-4: Show connecting state until we get the first real status
    updateUI();

    socket = io(SOCKET_SERVER_URL, {
      auth: async (cb) => {
        try {
          const token = await state.user.getIdToken();
          cb({ 
            token, 
            deviceId: state.pairedDeviceId,
            clientType: 'viewer'
          });
        } catch (e) {
          console.error('[PinBridge] Failed to get token for socket auth:', e);
          cb(new Error('Failed to get token'));
        }
      }
    });

    socket.on('connect', () => {
      console.log('[PinBridge Web] Socket connected');
      // Explicitly request current presence data on connect/reconnect
      socket.emit('request_presence');
    });

    socket.on('presence_update', (data) => {
      if (data.deviceId === state.pairedDeviceId) {
        applyPresenceUpdate(data.lastSeen, data.batteryLevel, data.isCharging, data.status);
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('[PinBridge Web] Socket connection error:', err.message);
      // Stay in connecting state — Socket.IO will auto-reconnect
    });
  }

  function applyPresenceUpdate(lastSeen, batteryLevel, isCharging, serverStatus) {
      if (lastSeen) {
          // Always accept the latest timestamp. If clock skew makes it slightly jump backwards, 
          // the 25s threshold handles it seamlessly.
          state.lastSeen = lastSeen;
      }
      if (batteryLevel != null) {
          state.batteryLevel = batteryLevel;
          state.isCharging = !!isCharging;
      }
      // Track authoritative server status
      if (serverStatus === 'online' || serverStatus === 'offline') {
          state.serverStatus = serverStatus;
          // Note: Battery is intentionally NOT cleared on offline.
          // The UI shows the last known battery in red when offline.
      }
      updateUI();
  }

  // 2. Status Listener (Firestore) - Reliable fallback
  unsubStatus = onSnapshot(doc(db, 'pairings', state.pairedDeviceId), snap => {
    const data = snap.data();
    if (!data) return;
    
    const lastSeen = data.lastOnline ? (data.lastOnline.toMillis ? data.lastOnline.toMillis() : data.lastOnline) : null;
    const batteryLevel = data.batteryLevel != null ? data.batteryLevel : null;
    const isCharging = !!data.isCharging;
    const serverStatus = data.status || null; // Firestore also has the status field
    applyPresenceUpdate(lastSeen, batteryLevel, isCharging, serverStatus);
  });

  // 3. OTP Mirroring (Firestore)
  unsubOtp = onSnapshot(doc(db, 'otps', state.pairedDeviceId), async (snap) => {
    const data = snap.data();
    if (!data) return;

    // Deduplicate OTPs using otpEventId
    const eventId = data.otpEventId;
    if (eventId && state.latestOtp?.otpEventId === eventId) {
        console.log(`[PinBridge Web] Skipping already-processed OTP (eventId: ${eventId})`);
        return;
    }

    try {
      const decrypted = await decryptOtp(data, state.secret);
      const ts = data.smsTs || Date.now();
      state.latestOtp = { otp: decrypted, ts, otpEventId: eventId };
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
    localStorage.removeItem('latestOtp');
    // Note: secret is in-memory only (V-01)
    updateUI();
}

function stopListeners() {
  if (unsubOtp) unsubOtp();
  if (unsubStatus) unsubStatus();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  unsubOtp = null;
  unsubStatus = null;
}

// Re-evaluate online/offline every 5 seconds
setInterval(() => {
  if (state.pairedDeviceId && (state.lastSeen > 0 || state.serverStatus)) {
    updateUI();
  }
}, 5000);

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
        if (data.deviceId && data.secret) {
          // Validate that the pairing is still active before passing it to the extension
          const pairingSnap = await getDoc(doc(db, 'pairings', data.deviceId));
          if (pairingSnap.exists() && pairingSnap.data()?.paired === true) {
            pairedDeviceId = data.deviceId;
            secret = data.secret;
          } else {
            console.warn('[PinBridge] Stale cloud sync detected during auth. Cleaning up.');
            await deleteDoc(doc(db, 'users', user.uid, 'mirroring', 'active')).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('[PinBridge] Error checking active pairing:', e);
    }

    // Update local state with the fetched pairing data
    if (pairedDeviceId && secret) {
      state.pairedDeviceId = pairedDeviceId;
      state.secret = secret; // In-memory only (V-01)
      localStorage.setItem('pairedDeviceId', pairedDeviceId);
      // Security (V-01): Do NOT persist secret to localStorage
      startListeners();
    }

    // Update UI immediately so user sees the transition
    updateUI();

    // Always broadcast to extension content script (handles both fresh sign-in and existing session)
    // Fix V-02: Use own origin instead of '*'
    window.postMessage({
      source: 'pinbridge-web',
      action: 'LOGIN_SUCCESS',
      uid: user.uid,
      email: user.email,
      pairedDeviceId,
      secret
    }, window.location.origin);

    // Listen for future pairing changes
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
