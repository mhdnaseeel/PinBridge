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
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { io } from "socket.io-client";

const SOCKET_SERVER_URL = "https://pinbridge-presence.onrender.com";
let socket = null;

const firebaseConfig = {
  // nosemgrep: generic.secrets.security.detected-generic-api-key
  // Firebase API keys are public client-side identifiers, NOT secrets.
  // Security is enforced by Firestore rules + Firebase App Check.
  apiKey: "AIzaSyBwBr0MOdVKCwuvoK3oOU6tg5LcS7uqZOE", // nosemgrep
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
// Security (C-3): Read reCAPTCHA key from environment variable.
// Set VITE_RECAPTCHA_SITE_KEY in your .env file or Vercel/Firebase Hosting config.
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (RECAPTCHA_SITE_KEY && RECAPTCHA_SITE_KEY !== 'YOUR_RECAPTCHA_SITE_KEY') {
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
} else {
  console.warn('[PinBridge] App Check NOT initialized: VITE_RECAPTCHA_SITE_KEY is missing or placeholder. Set this in production!');
}

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
  latestOtp: null, // In-memory only — never localStorage
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

// Security (M-5): Battery value sanitization — prevents injection via non-numeric values
function sanitizeBattery(level) {
  if (typeof level !== 'number' || !Number.isFinite(level)) return null;
  return Math.max(0, Math.min(100, Math.round(level)));
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
    // Security: Validate parameter formats before processing/writing to storage (SonarCloud S6145 / CWE-20)
    const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;
    const SECRET_REGEX = /^[a-zA-Z0-9+/=]{16,128}$/;
    if (!DEVICE_ID_REGEX.test(d) || !SECRET_REGEX.test(s)) {
      console.warn('[PinBridge] Pairing aborted: Invalid deviceId or secret format in URL parameters');
      return false;
    }
    
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

function svgEl(tag, attrs = {}, ...children) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
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

  // Update battery display — Security (H-5): use textContent instead of innerHTML for dynamic data
  const hasBattery = state.batteryLevel != null && state.batteryLevel >= 0;
  if (batteryEl) {
    if (hasBattery) {
      // Clear and rebuild safely with DOM API
      batteryEl.textContent = '';
      if (online) {
        batteryEl.textContent = `🔋 ${state.batteryLevel}%`;
        if (state.isCharging) {
          const badge = document.createElement('span');
          badge.className = 'charging-badge';
          badge.textContent = '⚡ Charging';
          batteryEl.appendChild(document.createTextNode(' '));
          batteryEl.appendChild(badge);
        }
        batteryEl.style.color = '';
      } else {
        batteryEl.textContent = `🔋 ${state.batteryLevel}% `;
        const lastKnown = document.createElement('span');
        lastKnown.style.cssText = 'color:#ef4444;font-size:12px;';
        lastKnown.textContent = '(Last known)';
        batteryEl.appendChild(lastKnown);
        batteryEl.style.color = '#ef4444';
      }
      batteryEl.style.display = 'flex';
    } else {
      batteryEl.style.display = 'none';
    }
  }
  
  // Update sidebar — Security (H-5): use textContent instead of innerHTML
  if (sidebarStatus) {
    const sidebarDotClass = online ? 'dot-online' : (state.lastSeen > 0 ? 'dot-offline' : 'dot-connecting');
    const sidebarLabel = online ? 'Online' : (state.lastSeen > 0 ? 'Offline' : 'Connecting...');
    sidebarStatus.textContent = '';
    const dotSpan = document.createElement('span');
    dotSpan.id = 'sidebarDeviceDot';
    dotSpan.className = `dot ${sidebarDotClass}`;
    sidebarStatus.appendChild(dotSpan);
    sidebarStatus.appendChild(document.createTextNode(` ${sidebarLabel}`));
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
  appDiv.innerHTML = ''; // Clear DOM safely
  
  const signOutBtn = el('button', { id: 'signOutBtn', className: 'btn-signout btn-signout-margin' }, 'Sign Out');
  signOutBtn.onclick = handleSignOut;

  appDiv.appendChild(
    el('div', { className: 'dashboard-layout' },
      el('div', { className: 'sidebar' },
        el('div', { className: 'logo-area' },
          el('img', { src: '/logo.png', className: 'logo-icon-img', alt: 'Logo' }),
          el('span', { className: 'logo-text' }, 'PinBridge')
        ),
        el('div', { className: 'status-group' },
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Account'),
            el('span', { className: 'status-value sidebar-account-text' }, state.user?.email || 'Signed In')
          ),
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Environment'),
            el('span', { className: 'status-value' }, 'Secure Cloud')
          )
        )
      ),
      el('div', { className: 'main-stage' },
        el('div', { className: 'locked-view' },
          el('div', { className: 'lock-icon' }, '📱'),
          el('h1', { className: 'view-title' }, 'Waiting for Pairing'),
          el('p', { className: 'view-subtitle' }, 
            'Use the ',
            el('strong', {}, 'PinBridge Chrome Extension'),
            ' to pair with your Android app. This dashboard will automatically sync once pairing is complete.'
          ),
          el('div', { className: 'premium-card locked-card' },
            el('div', { className: 'locked-icon-large' }, '🔗'),
            el('div', { className: 'locked-instruction-header' }, 'How to connect:'),
            el('ol', { className: 'locked-instruction-list' },
              el('li', {}, 'Open the ', el('strong', {}, 'PinBridge Extension'), ' in Chrome'),
              el('li', {}, 'Sign in with this same Google account'),
              el('li', {}, 'Click ', el('strong', {}, '"Start Pairing"'), ' to get a QR code'),
              el('li', {}, 'Scan the QR with the ', el('strong', {}, 'PinBridge Android App'))
            ),
            el('div', { className: 'signed-in-badge signed-in-badge-container' },
              el('span', { className: 'dot dot-online signed-in-badge-dot' }),
              el('span', { className: 'signed-in-text' }, 
                'Signed in as ',
                el('strong', {}, state.user?.email || 'User')
              )
            ),
            el('p', { className: 'locked-hint locked-hint-margin' }, 'This page will update automatically once your extension pairs with a device.'),
            signOutBtn
          )
        )
      )
    )
  );
}

/** Screen 3: Signed in + device paired — full OTP dashboard */
function renderPaired() {
  const isConnecting = !isDeviceOnline() && state.lastSeen === 0 && state.serverStatus !== 'offline';
  const otpContent = state.latestOtp?.otp || (isConnecting ? '000000' : '------');
  const otpClass = 'otp-value';
  
  const timeContent = state.latestOtp?.ts 
    ? `Received at ${new Date(state.latestOtp.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}` 
    : (isConnecting ? 'Syncing securely...' : 'Waiting for signal...');
  const timeClass = 'otp-meta';
  
  const statusLabel = isDeviceOnline() ? 'Online' : (state.lastSeen > 0 ? 'Offline' : 'Connecting...');
  const dotClass = isDeviceOnline() ? 'dot-online' : (state.lastSeen > 0 ? 'dot-offline' : 'dot-connecting');
  const lastSeenStr = state.lastSeen ? new Date(state.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Never';
  const connDetail = isDeviceOnline() ? 'Device is connected and active' : 
    (state.lastSeen && state.lastSeen > 0 ? `Last seen at ${lastSeenStr}` : 'Establishing connection to device');
  
  // Status classes
  const statusColorClass = isDeviceOnline() ? 'conn-status-online' : (state.lastSeen > 0 ? 'conn-status-offline' : 'conn-status-connecting');
  const sidebarStatusColorClass = isDeviceOnline() ? 'sidebar-status-online' : (state.lastSeen > 0 ? 'sidebar-status-offline' : 'sidebar-status-connecting');

  // Battery display strings
  const deviceOnline = isDeviceOnline();
  const hasBattery = state.batteryLevel != null && state.batteryLevel >= 0;
  const sidebarBatteryStr = hasBattery ? `${state.batteryLevel}%${deviceOnline && state.isCharging ? ' ⚡' : ''}` : '--';
  const sidebarBatteryColorClass = hasBattery && !deviceOnline ? 'sidebar-battery-text battery-display-offline' : 'sidebar-battery-text';
  
  appDiv.innerHTML = ''; // Clear DOM safely

  // Icons constructed programmatically to satisfy S5131
  const copyIcon = svgEl('svg', { width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', className: 'btn-icon-middle' },
    svgEl('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' }),
    svgEl('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
  );

  const syncIcon = svgEl('svg', { width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24', className: 'btn-icon-middle' },
    svgEl('path', { d: 'M23 4v6h-6' }),
    svgEl('path', { d: 'M1 20v-6h6' }),
    svgEl('path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' })
  );

  const signalIcon = svgEl('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', className: 'btn-icon-middle' },
    svgEl('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' })
  );

  // Text labels
  const copyText = el('span', {}, 'Copy Code');
  const fetchText = el('span', {}, 'Quick Sync');
  const syncSignalText = el('span', {}, 'Sync Signal');

  // Buttons
  const copyBtn = el('button', { id: 'copyBtn', className: 'btn-primary btn-primary-flex' },
    copyIcon,
    copyText
  );
  
  const fetchBtn = el('button', { id: 'fetchBtn', className: 'btn-secondary btn-secondary-flex' },
    syncIcon,
    fetchText
  );

  const syncSignalBtn = el('button', { id: 'syncSignalBtn', className: 'btn-signal' },
    signalIcon,
    syncSignalText
  );

  const signOutBtn = el('button', { id: 'signOutBtn', className: 'btn-signout btn-signout-margin' }, 'Sign Out');

  const batteryDisplay = hasBattery ? el('div', { id: 'batteryDisplay', className: 'battery-display' + (!deviceOnline ? ' battery-display-offline' : '') }) : null;
  if (batteryDisplay) {
    if (deviceOnline) {
      batteryDisplay.textContent = `🔋 ${state.batteryLevel}%`;
      if (state.isCharging) {
        const chargingBadge = el('span', { className: 'charging-badge' }, '⚡ Charging');
        batteryDisplay.appendChild(document.createTextNode(' '));
        batteryDisplay.appendChild(chargingBadge);
      }
    } else {
      batteryDisplay.textContent = `🔋 ${state.batteryLevel}% `;
      const lastKnownSpan = el('span', { className: 'last-known-battery-text' }, '(Last known)');
      batteryDisplay.appendChild(lastKnownSpan);
    }
  }

  appDiv.appendChild(
    el('div', { className: 'dashboard-layout' },
      el('aside', { className: 'sidebar' },
        el('div', { className: 'logo-area' },
          el('img', { src: '/logo.png', className: 'logo-icon-img', alt: 'Logo' }),
          el('span', { className: 'logo-text' }, 'PinBridge')
        ),
        el('div', { className: 'status-group' },
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Account'),
            el('span', { className: 'status-value sidebar-account-text' }, state.user?.email || 'Signed In')
          ),
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Device'),
            el('span', { id: 'sidebarDeviceStatus', className: 'status-value sidebar-device-text ' + sidebarStatusColorClass },
              el('span', { id: 'sidebarDeviceDot', className: `dot ${dotClass}` }),
              ` ${statusLabel}`
            )
          ),
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Last Seen'),
            el('span', { id: 'sidebarLastSeen', className: 'status-value sidebar-lastseen-text' }, lastSeenStr)
          ),
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Battery'),
            el('span', { id: 'sidebarBattery', className: 'status-value ' + sidebarBatteryColorClass }, sidebarBatteryStr)
          ),
          el('div', { className: 'status-item' },
            el('span', { className: 'status-label' }, 'Encryption'),
            el('span', { className: 'status-value', style: 'color: var(--primary);' }, 'AES-256')
          )
        )
      ),
      el('main', { className: 'main-stage' },
        el('header', { className: 'view-header' },
          el('h1', { className: 'view-title' }, 'Security Terminal'),
          el('p', { className: 'view-subtitle' },
            'Real-time OTP mirroring from device ',
            el('strong', {}, `${state.pairedDeviceId?.slice(0,8)}...`)
          )
        ),
        el('div', { id: 'connectionIndicator', className: 'connection-indicator' },
          el('span', { id: 'connDot', className: `dot ${dotClass}` }),
          el('div', { className: 'conn-text' },
            el('span', { id: 'connStatus', className: 'conn-status ' + statusColorClass }, statusLabel),
            el('span', { id: 'connDetail', className: 'conn-detail' }, connDetail)
          )
        ),
        batteryDisplay || document.createTextNode(''),
        el('div', { className: 'premium-card' },
          el('div', { className: 'otp-section' },
            el('div', { className: 'otp-label' }, 'Active Verification Code'),
            el('div', { id: 'otpValue', className: otpClass }, otpContent),
            el('div', { id: 'otpMeta', className: timeClass }, timeContent)
          ),
          el('div', { className: 'btn-subgroup-flex' },
            copyBtn,
            el('div', { className: 'btn-subgroup-flex' },
              fetchBtn,
              syncSignalBtn
            )
          )
        ),
        el('div', { className: 'footer-section footer-section-flex' },
          el('div', { className: 'footer-links footer-links-flex' },
            el('span', {}, '● Secure Channel'),
            el('span', {}, '● End-to-End Encrypted'),
            el('span', {}, '● Auto-Push Active')
          ),
          signOutBtn
        )
      )
    )
  );
  
  // Bind actions (DOM APIs exclusively, resolving esbuild double-declarations and SonarCloud S5131)
  copyBtn.onclick = () => {
    if (state.latestOtp?.otp) {
      navigator.clipboard.writeText(state.latestOtp.otp);
      copyText.textContent = '✓ Copied';
      setTimeout(() => {
        copyText.textContent = 'Copy Code';
      }, 2000);
    }
  };

  fetchBtn.onclick = async () => {
    if (!isDeviceOnline()) {
      fetchText.textContent = 'Device Offline';
      fetchBtn.style.background = '#ef4444';
      fetchBtn.disabled = true;
      fetchBtn.classList.add('syncing-btn');
      setTimeout(() => {
        fetchText.textContent = 'Quick Sync';
        fetchBtn.style.background = '';
        fetchBtn.disabled = false;
        fetchBtn.classList.remove('syncing-btn');
      }, 2000);
      return;
    }

    fetchBtn.disabled = true;
    fetchText.textContent = 'Requesting...';
    fetchBtn.classList.add('syncing-btn');
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
             fetchText.textContent = 'Success!';
             fetchBtn.style.background = '#10b981';
             fetchBtn.classList.remove('syncing-btn');
             setTimeout(() => {
               fetchBtn.disabled = false;
               fetchText.textContent = 'Quick Sync';
               fetchBtn.style.background = '';
             }, 2000);
          } else if (attempts >= 10) { // 10 seconds timeout
             clearInterval(waitInterval);
             fetchText.textContent = 'Timed Out';
             fetchBtn.style.background = '#f59e0b';
             fetchBtn.classList.remove('syncing-btn');
             setTimeout(() => {
               fetchBtn.disabled = false;
               fetchText.textContent = 'Quick Sync';
               fetchBtn.style.background = '';
             }, 2000);
          }
      }, 1000);
    } catch (e) {
      fetchText.textContent = 'Error';
      fetchBtn.style.background = '#ef4444';
      setTimeout(() => {
        fetchBtn.classList.remove('syncing-btn');
        fetchBtn.disabled = false;
        fetchText.textContent = 'Quick Sync';
        fetchBtn.style.background = '';
      }, 3000);
    }
  };

  syncSignalBtn.onclick = () => {
    if (socket) {
      syncSignalBtn.disabled = true;
      syncSignalText.textContent = 'Connecting...';
      syncSignalBtn.classList.add('syncing-btn');

      // Clear cached data so UI doesn't show old values while connecting
      state.lastSeen = 0;
      state.batteryLevel = null;
      state.serverStatus = 'offline';
      updateUI();
      
      socket.disconnect();
      setTimeout(() => {
        socket.connect();
        socket.emit('request_presence');
        syncSignalText.textContent = 'Sent!';
        syncSignalBtn.style.background = '#10b981';
        syncSignalBtn.style.borderColor = '#10b981';
        setTimeout(() => {
          syncSignalText.textContent = 'Sync Signal';
          syncSignalBtn.style.background = '#3b82f6';
          syncSignalBtn.style.borderColor = '#3b82f6';
          syncSignalBtn.classList.remove('syncing-btn');
          syncSignalBtn.disabled = false;
        }, 2000);
      }, 500);
    }
  };

  signOutBtn.onclick = handleSignOut;
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
  // Note: secret and latestOtp are in-memory only, no localStorage removal needed
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
// nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation
window.addEventListener('message', (e) => {
  if (e.source !== window) return; // Only accept from same frame
  
  // Security: Strict origin verification to prevent arbitrary execution (SonarCloud S2819 / CWE-345)
  const trustedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://pinbridge-61dd4.firebaseapp.com',
    'https://pinbridge-61dd4.web.app',
    'https://pin-bridge.vercel.app'
  ];
  if (!trustedOrigins.includes(e.origin)) return;

  if (e.data && e.data.source === 'pinbridge-extension') {
    if (e.data.action === 'UNPAIR') {
      handleForcedUnpair();
    } else if (e.data.action === 'SYNC') {
      // Security: Validate deviceId format before writing to local storage to prevent tainted data injection (SonarCloud S6145)
      const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;
      if (typeof e.data.deviceId === 'string' && DEVICE_ID_REGEX.test(e.data.deviceId)) {
        localStorage.setItem('pairedDeviceId', e.data.deviceId);
        state.pairedDeviceId = e.data.deviceId;
      }
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
          const token = await state.user.getIdToken(true);
          cb({
            token,
            deviceId: state.pairedDeviceId,
            clientType: 'viewer'
          });
        } catch (e) {
          console.error('[PinBridge] Failed to get token for socket auth:', e);
          cb(new Error('Failed to get token'));
        }
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 60000,
      transports: ['websocket', 'polling']
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
      // Security (M-5): Validate battery values before storing
      if (batteryLevel != null) {
          state.batteryLevel = sanitizeBattery(batteryLevel);
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

    const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
    if (expiresAt && Date.now() > expiresAt) return;

    try {
      const decrypted = await decryptOtp(data, state.secret);
      const ts = data.smsTs || Date.now();
      state.latestOtp = { otp: decrypted, ts, otpEventId: eventId };
      // Security: Do not persist decrypted OTP to localStorage
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
    // Note: secret and OTP are in-memory only
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
      // Security: Validate formats of data synced from database before writing to storage (SonarCloud S6145 / CWE-20)
      const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;
      const SECRET_REGEX = /^[a-zA-Z0-9+/=]{16,128}$/;
      if (DEVICE_ID_REGEX.test(pairedDeviceId) && SECRET_REGEX.test(secret)) {
        state.pairedDeviceId = pairedDeviceId;
        state.secret = secret; // In-memory only (V-01)
        localStorage.setItem('pairedDeviceId', pairedDeviceId);
        // Security (V-01): Do NOT persist secret to localStorage
        startListeners();
      } else {
        console.warn('[PinBridge] Synchronized active pairing details fail format validation');
      }
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
