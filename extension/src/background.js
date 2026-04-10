import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirestore, doc, onSnapshot, deleteDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { decryptOtp } from "./crypto";
import { io } from "socket.io-client";
import * as Sentry from "@sentry/browser";
import { FIREBASE_CONFIG, SENTRY_DSN, SOCKET_SERVER_URL, GOOGLE_CLIENT_ID } from "./config";

// Sentry Initialization
Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    sendDefaultPii: false
});


// Global error handlers to capture and report errors to Sentry
self.addEventListener('error', (e) => {
    Sentry.captureException(e.error || e.message);
    e.preventDefault();
    console.debug('[PinBridge] Reported error:', e.error || e.message);
});
self.addEventListener('unhandledrejection', (e) => {
    Sentry.captureException(e.reason);
    e.preventDefault();
    console.debug('[PinBridge] Reported unhandled rejection:', e.reason);
});
try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} catch (e) {
  // sidePanel API may not be available during service worker restart
}

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

let unsubscribePairing = null;
let unsubscribeOtp = null;
let isSigningOut = false;
let pairingPending = false; // FIX: Track when pairing is in progress to prevent premature unpair
let isPairingNow = false;   // FIX: Guard against concurrent startListeners from onAuthStateChanged
let lastListenersStartTime = 0; // FIX: Cooldown to prevent death-spiral restarts
const LISTENERS_COOLDOWN_MS = 15000; // Don't restart listeners more than once per 15s

// FIX: Helper to wait for Firebase Auth to restore from IndexedDB.
// In MV3, the service worker may cold-start, and auth.currentUser will be null
// until Firebase finishes restoring the session. Calling signInAnonymously
// during this window DESTROYS the existing Google session.
async function waitForAuth(timeoutMs = 5000) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsub(); resolve(null); }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (e) {}
}

// ─── Centralized State Manager ─────────────────────────────────
// Single source of truth — accepts updates from Socket.IO and Firestore
// but only applies them if the incoming lastSeen >= the current known value.
// This eliminates race conditions where stale cache overwrites fresh data.
const stateManager = {
  lastSeen: 0,
  batteryLevel: null,
  isCharging: false,
  serverStatus: null, // Authoritative status from socket server ('online'/'offline')

  // Returns true if state was updated
  update({ lastSeen, batteryLevel, isCharging, status }) {
    if (lastSeen) {
        this.lastSeen = lastSeen;
    }
    if (batteryLevel != null) {
      this.batteryLevel = batteryLevel;
      this.isCharging = !!isCharging;
    }
    // Track the authoritative server status
    if (status === 'online' || status === 'offline') {
      this.serverStatus = status;
    }
    // Note: Battery is intentionally NOT cleared on offline.
    // The popup/web will show the last known battery in red when offline.
    // Persist to storage for popup/sidepanel reads
    const storageData = { lastSeen: this.lastSeen };
    if (this.batteryLevel != null) {
      storageData.batteryLevel = this.batteryLevel;
      storageData.isCharging = this.isCharging;
    } else {
      // Actively remove stale battery from storage when null
      chrome.storage.local.remove(['batteryLevel', 'isCharging']);
    }
    if (this.serverStatus) {
      storageData.serverStatus = this.serverStatus;
    }
    chrome.storage.local.set(storageData);
    // Push to any open popup/sidepanel
    safeSendMessage({
      type: 'statusUpdate',
      lastSeen: this.lastSeen,
      serverStatus: this.serverStatus,
      batteryLevel: this.batteryLevel,
      isCharging: this.isCharging
    });
    return true;
  },

  reset() {
    this.lastSeen = 0;
    this.batteryLevel = null;
    this.isCharging = false;
    this.serverStatus = null;
  }
};

// ─── Service Worker Keepalive ──────────────────────────────────
// MV3 service workers go idle after ~30s. An alarm every 25s keeps it alive
// so Firestore onSnapshot listeners (OTP + status) remain active.
const KEEPALIVE_ALARM = 'pinbridge-keepalive';

function startKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // ~24 seconds
  console.log('[PinBridge] Keepalive alarm started.');
}

function stopKeepalive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
  console.log('[PinBridge] Keepalive alarm stopped.');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    const performPairing = async () => {
        isPairingNow = true; // Guard: prevent onAuthStateChanged from calling startListeners

        // FIX: Wait for Firebase Auth to restore the Google session from IndexedDB.
        let currentUser = await waitForAuth();
        if (!currentUser) {
            console.warn('[PinBridge] Auth not restored after waiting. Attempting anonymous sign-in as fallback...');
            await signInAnonymously(auth);
        }

        // Save pairing data and seed an initial lastSeen so popup shows "Online"
        const now = Date.now();
        stateManager.update({ lastSeen: now });
        await chrome.storage.local.set({ 
            pairedDeviceId: msg.deviceId, 
            secret: msg.secret,
            lastSeen: now
        });
        pairingPending = false; // Pairing is now confirmed
        startAllListeners(msg.deviceId);
        isPairingNow = false; // Allow onAuthStateChanged to work again
        
        // Push initial state to popup
        safeSendMessage({ type: 'statusUpdate', lastSeen: now });
        safeSendMessage({ type: 'paired', deviceId: msg.deviceId });

        // Write pairing to cloud so the web dashboard can auto-sync
        const { googleUid } = await chrome.storage.local.get(['googleUid']);
        if (googleUid) {
          try {
            await setDoc(doc(db, 'users', googleUid, 'mirroring', 'active'), {
              deviceId: msg.deviceId,
              secret: msg.secret,
              pairedAt: serverTimestamp()
            });
            console.log('[PinBridge] Cloud sync written for uid:', googleUid);
          } catch (e) {
            console.warn('[PinBridge] Cloud sync write failed:', e);
          }
        }

        sendResponse({status: 'paired'});
    };

    performPairing().catch(err => {
        console.error('[PinBridge] Pairing execution failed:', err);
        isPairingNow = false;
        pairingPending = false;
        sendResponse({status: 'error', error: err.message});
    });
    return true;
  } else if (msg.type === 'getStatus') {
    // Service worker might have slept. Restart PRESENCE listeners if dead.
    // OTP listener is independent and should NOT be restarted by polling.
    if (!unsubscribePairing && !isPairingNow) {
        chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
            if (pairedDeviceId) {
                console.log('[PinBridge] getStatus: No presence listeners, starting.');
                startPresenceListeners(pairedDeviceId);
            }
        });
    }

    chrome.storage.local.get(['pairedDeviceId', 'lastSeen', 'batteryLevel', 'isCharging', 'serverStatus'], ({pairedDeviceId, lastSeen, batteryLevel, isCharging, serverStatus}) => {
      sendResponse({
        status: pairedDeviceId ? 'paired' : 'unpaired', 
        deviceId: pairedDeviceId,
        lastSeen: lastSeen || null,
        serverStatus: serverStatus || stateManager.serverStatus || null,
        batteryLevel: batteryLevel != null ? batteryLevel : null,
        isCharging: !!isCharging
      });
    });
    return true;
  } else if (msg.type === 'signOut') {
    performSignOut().then(() => sendResponse({status: 'ok'}));
    return true;
  } else if (msg.type === 'manualFetch') {
    handleManualFetch(sendResponse);
    return true;
  } else if (msg.type === 'syncSignal') {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) {
        console.log('[PinBridge] Manual Sync Signal requested via popup, restarting presence listeners.');
        // Force bypass cooldown
        lastListenersStartTime = 0;
        startPresenceListeners(pairedDeviceId);
      }
    });
    sendResponse({status: 'ok'});
    return true;
  } else if (msg.type === 'signOutOnly') {
    // Sign out from Firebase Auth only — keep pairing data intact
    performSignOutOnly().then(() => sendResponse({status: 'ok'}));
    return true;
  } else if (msg.type === 'unpairOnly') {
    // Remove pairing data + Firestore docs but keep auth session
    performUnpairOnly().then(() => sendResponse({status: 'ok'}));
    return true;
  } else if (msg.type === 'googleSignIn') {
    handleGoogleSignIn(sendResponse);
    return true;
  } else if (msg.type === 'webLoginSuccess') {
    handleWebLoginSuccess(msg);
    return true;
  } else if (msg.type === 'webPairingSuccess') {
    handleWebPairingSuccess(msg);
    return true;
  } else if (msg.type === 'refreshStatus') {
    // FIX: Popup requests fresh live status.
    // ALWAYS read from chrome.storage.local — it's the most reliable source because
    // Firestore onSnapshot writes to it continuously. The in-memory stateManager
    // may be stale if the SW restarted and no Firestore snapshot has arrived yet.
    const hydrateAndPush = async () => {
      // Always read the latest from storage
      const stored = await chrome.storage.local.get(['lastSeen', 'batteryLevel', 'isCharging', 'serverStatus']);
      
      // Update stateManager with latest storage values only if storage is newer
      // than our current in-memory state. This prevents stale storage reads
      // from overwriting fresh live data received by listeners.
      if (stored.lastSeen && stored.lastSeen > stateManager.lastSeen) {
        stateManager.lastSeen = stored.lastSeen;
        if (stored.batteryLevel != null) {
          stateManager.batteryLevel = stored.batteryLevel;
          stateManager.isCharging = !!stored.isCharging;
        } else {
          stateManager.batteryLevel = null;
          stateManager.isCharging = false;
        }
        if (stored.serverStatus) {
          stateManager.serverStatus = stored.serverStatus;
        }
      }

      // Push current state to popup
      safeSendMessage({
        type: 'statusUpdate',
        lastSeen: stateManager.lastSeen,
        serverStatus: stateManager.serverStatus,
        batteryLevel: stateManager.batteryLevel,
        isCharging: stateManager.isCharging
      });

      // FIX: Only restart listeners if they are truly dead AND not currently connecting.
      // The old code restarted on every 3s poll if socket wasn't yet connected,
      // which killed the connecting socket before it could finish the auth handshake.
      // This created a death spiral: start→kill→start→kill→... every 3 seconds.
      //
      // isSocketAlive: socket exists AND is connected, connecting, or reconnecting.
      const isSocketAlive = socket && (socket.connected || socket.active);
      const listenersFullyDead = !unsubscribePairing && !isSocketAlive;

      if (listenersFullyDead && !isPairingNow) {
        const { pairedDeviceId } = await chrome.storage.local.get(['pairedDeviceId']);
        if (pairedDeviceId) {
          console.log('[PinBridge] refreshStatus: Presence listeners fully dead, restarting.');
          startPresenceListeners(pairedDeviceId);
        }
      } else if (socket && socket.connected) {
        // Socket is alive and connected — request fresh data if we haven't recently
        const dataAge = Date.now() - stateManager.lastSeen;
        if (dataAge > 30000 || stateManager.lastSeen === 0) {
          socket.emit('request_presence');
        }
      }
    };
    hydrateAndPush().catch(e => console.warn('[PinBridge] refreshStatus error:', e));
  }
});

async function handleGoogleSignIn(sendResponse) {
  try {
    const redirectUri = chrome.identity.getRedirectURL();
    const scopes = encodeURIComponent("profile email");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=id_token%20token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&nonce=${Math.random().toString(36).substring(2)}`;

    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, async (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        console.error('[PinBridge] launchWebAuthFlow error:', chrome.runtime.lastError);
        sendResponse({ status: 'error', error: chrome.runtime.lastError?.message || 'Sign-in cancelled or failed' });
        return;
      }

      try {
        const urlHash = new URL(redirectUrl).hash.substring(1);
        const params = new URLSearchParams(urlHash);
        const idToken = params.get('id_token');
        const accessToken = params.get('access_token');

        if (!idToken && !accessToken) {
          throw new Error('No tokens returned from Google Auth');
        }

        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        const userCredential = await signInWithCredential(auth, credential);
        const user = userCredential.user;

        await chrome.storage.local.set({
          googleUid: user.uid,
          googleEmail: user.email
        });

        console.log('[PinBridge] Google Sign-In native success:', user.email);
        sendResponse({ status: 'success', email: user.email, uid: user.uid });
        safeSendMessage({ type: 'statusUpdate', message: `Signed in as ${user.email}` });
        safeSendMessage({ type: 'unpaired' });
      } catch (err) {
        console.error('[PinBridge] Firebase auth error:', err);
        sendResponse({ status: 'error', error: err.message });
      }
    });
  } catch (err) {
    console.error('[PinBridge] setup auth error:', err);
    sendResponse({ status: 'error', error: err.message });
  }
}

async function handleWebLoginSuccess(msg) {
  const { uid, email, pairedDeviceId, secret } = msg;

  // Close the auth tab
  chrome.storage.local.get(['authTabId'], async ({ authTabId }) => {
    if (authTabId) {
      chrome.tabs.remove(authTabId).catch(e => console.log('Tab already closed'));
      chrome.storage.local.remove('authTabId');
    }
  });

  console.log('[PinBridge] Captured login from web:', email);
  try {
    if (pairedDeviceId && secret) {
      await chrome.storage.local.set({ 
        pairedDeviceId: pairedDeviceId, 
        secret: secret,
        googleUid: uid,
        googleEmail: email
      });
      startAllListeners(pairedDeviceId);
      safeSendMessage({ type: 'paired', deviceId: pairedDeviceId });
    } else {
      await chrome.storage.local.set({
        googleUid: uid,
        googleEmail: email
      });
      safeSendMessage({ type: 'statusUpdate', message: `Signed in as ${email}` });
      safeSendMessage({ type: 'unpaired' });
    }
  } catch (err) {
    console.error('Error in handling web login:', err);
  }
}

async function handleWebPairingSuccess(msg) {
  const { deviceId, secret } = msg;
  console.log('[PinBridge] Captured auto-pairing from web for device:', deviceId);
  await chrome.storage.local.set({ 
    pairedDeviceId: deviceId, 
    secret: secret
  });
  startAllListeners(deviceId);
  safeSendMessage({ type: 'paired', deviceId: deviceId });
}

async function handleManualFetch(sendResponse) {
    const { pairedDeviceId, secret } = await chrome.storage.local.get(['pairedDeviceId', 'secret']);
    if (!pairedDeviceId || !secret) {
        sendResponse({status: 'error', error: 'Not paired'});
        return;
    }

    try {
        // FIX: Wait for auth to restore from IndexedDB instead of blindly calling signInAnonymously
        let currentUser = await waitForAuth();
        if (!currentUser) {
            console.log('[PinBridge] No active session for manual fetch, signing in anonymously...');
            await signInAnonymously(auth);
        }

        const currentData = await chrome.storage.local.get(['latestOtp']);
        const preFetchEventId = currentData.latestOtp ? currentData.latestOtp.otpEventId : null;
        console.log(`[PinBridge] Manual fetch request. Last eventId: ${preFetchEventId}`);

        // Update signaling Firestore
        await updateDoc(doc(db, 'pairings', pairedDeviceId), {
            fetchRequested: serverTimestamp()
        });
        console.log('[PinBridge] Sync signal sent to Firebase.');

        let attempts = 0;
        const maxAttempts = 30; // 30 seconds total
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            
            // Check for new OTP in storage
            const { latestOtp } = await chrome.storage.local.get(['latestOtp']);
            const currentEventId = latestOtp ? latestOtp.otpEventId : null;

            if (latestOtp && currentEventId !== preFetchEventId) {
                console.log(`[PinBridge] Fetch Success: New OTP found (eventId: ${currentEventId})`);
                sendResponse({status: 'ok', otp: latestOtp.otp});
                return;
            }
            attempts++;
        }
        
        console.warn(`[PinBridge] Fetch Timed Out (${maxAttempts}s)`);
        sendResponse({status: 'error', error: 'Timed out waiting for device'});
    } catch (err) {
        console.error('[PinBridge] Manual fetch logic failed:', err);
        sendResponse({status: 'error', error: err.message || 'Fetch Logic Error'});
    }
}

async function performSignOutOnly() {
  // Only sign out from Firebase Auth — pairing data stays intact
  try {
    await signOut(auth).catch(() => {});
    console.log('[PinBridge] Signed out (auth only), pairing preserved.');
    // FIX: Don't send 'unpaired' — pairing is still active.
    // The popup handles sign-out separately via signOutOnly response.
  } catch (err) {
    console.error('[PinBridge] Sign out (auth only) failed:', err);
  }
}

// ─── Shared cleanup logic for unpair and sign-out ──────────────
async function cleanupFirestorePairing(pairedDeviceId, googleUid) {
  try {
    if (pairedDeviceId) {
      console.log('[PinBridge] Cleaning up Firestore pairing for:', pairedDeviceId);
      // FIX (Bug 5): Set paired:false BEFORE deleting, so the Android's Firestore
      // listener gets a clear unpair signal even if it misses the deletion.
      try {
        await updateDoc(doc(db, 'pairings', pairedDeviceId), { paired: false });
        // Brief delay to let Firestore propagate the field change to Android
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.warn('[PinBridge] Failed to set paired=false (non-critical):', e.message);
      }
      await Promise.all([
        deleteDoc(doc(db, 'pairings', pairedDeviceId)),
        deleteDoc(doc(db, 'otps', pairedDeviceId))
      ]).catch(e => console.warn('[PinBridge] Partial Firestore cleanup:', e));
    }
    if (googleUid) {
      await deleteDoc(doc(db, 'users', googleUid, 'mirroring', 'active'))
        .catch(e => console.warn('[PinBridge] Cloud sync cleanup:', e));
    }
  } catch (err) {
    console.error('[PinBridge] Firestore cleanup failed:', err);
  }
}

async function performUnpairOnly() {
  const { pairedDeviceId, googleUid } = await chrome.storage.local.get(['pairedDeviceId', 'googleUid']);

  // FIX: Clear local state and notify popup FIRST for instant UI response.
  // Firestore cleanup happens in the background (non-blocking).
  stopAllListeners();
  stateManager.reset();
  await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp', 'lastSeen', 'batteryLevel', 'isCharging', 'serverStatus']);
  console.log('[PinBridge] Unpaired (auth preserved)');
  safeSendMessage({ type: 'statusUpdate', lastSeen: 0 });
  safeSendMessage({ type: 'unpaired' });

  // Firestore cleanup in background — don't block the UI
  cleanupFirestorePairing(pairedDeviceId, googleUid).catch(e => {
    console.warn('[PinBridge] Background Firestore cleanup error:', e);
  });
}

async function performSignOut() {
  if (isSigningOut) return;
  isSigningOut = true;
  
  const { pairedDeviceId, googleUid } = await chrome.storage.local.get(['pairedDeviceId', 'googleUid']);

  // FIX: Clear local state and notify popup FIRST for instant UI response.
  stopAllListeners();
  stateManager.reset();
  await signOut(auth).catch(() => {});
  await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp', 'googleUid', 'googleEmail']);
  await chrome.storage.local.remove(['lastSeen', 'batteryLevel', 'isCharging', 'serverStatus']);
  
  isSigningOut = false;
  console.log('[PinBridge] Local state cleaned');
  safeSendMessage({ type: 'statusUpdate', lastSeen: 0 });
  safeSendMessage({ type: 'unpaired' });

  // Firestore cleanup in background — don't block the UI
  cleanupFirestorePairing(pairedDeviceId, googleUid).catch(e => {
    console.warn('[PinBridge] Background Firestore cleanup error:', e);
  });
}

function stopPresenceListeners() {
    if (unsubscribePairing) { unsubscribePairing(); unsubscribePairing = null; }
    if (socket) {
        console.log('[PinBridge] Disconnecting socket...');
        socket.disconnect();
        socket = null;
    }
    stopKeepalive();
}

function stopOtpListener() {
    if (unsubscribeOtp) { unsubscribeOtp(); unsubscribeOtp = null; }
}

function stopAllListeners() {
    stopPresenceListeners();
    stopOtpListener();
}

let socket = null;

// ─── Presence Listeners (Socket.IO + Firestore pairings doc) ─────────────────
// These handle connection status, battery, and unpair detection.
// They can be freely restarted by polling without affecting OTP.
function startPresenceListeners(deviceId) {
  if (!deviceId) return;

  // Cooldown to prevent the death spiral where the popup's 3s polling
  // calls refreshStatus → socketDead check → startPresenceListeners → stop
  // (kills connecting socket) → start → repeat forever.
  const now = Date.now();
  if (now - lastListenersStartTime < LISTENERS_COOLDOWN_MS) {
    console.log(`[PinBridge] startPresenceListeners: Cooldown active (${Math.round((LISTENERS_COOLDOWN_MS - (now - lastListenersStartTime)) / 1000)}s remaining), skipping.`);
    return;
  }
  lastListenersStartTime = now;

  // Stop existing presence listeners (does NOT touch OTP)
  stopPresenceListeners();

  // 1. Presence (Socket.IO) - Real-time primary
  console.log('[PinBridge] Connecting to presence server:', SOCKET_SERVER_URL);
  socket = io(SOCKET_SERVER_URL, {
    auth: async (cb) => {
      // Wait for Firebase Auth to restore from IndexedDB on SW cold-start.
      const user = await waitForAuth(5000);
      const token = user ? await user.getIdToken() : null;
      cb({ token, deviceId, clientType: "viewer" });
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 60000
  });

  // Start keepalive to prevent service worker from sleeping
  startKeepalive();

  socket.on('connect', () => {
    console.log('[PinBridge] Socket connected to presence server');
    socket.emit('request_presence');
  });

  socket.on('presence_update', (data) => {
    if (data.deviceId === deviceId) {
      handlePresenceUpdate(data.lastSeen, data.batteryLevel, data.isCharging, data.status);
    }
  });

  socket.on('disconnect', (reason) => {
    console.warn('[PinBridge] Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[PinBridge] Socket connection error:', err.message);
  });

  // Helper: feed updates through the centralized StateManager
  function handlePresenceUpdate(lastSeen, batteryLevel, isCharging, status) {
      console.log(`[PinBridge] Presence update: status=${status}, lastSeen=${lastSeen}, battery=${batteryLevel}%, charging=${isCharging}`);
      stateManager.update({ lastSeen, batteryLevel, isCharging, status });
  }

  // 2. Firestore pairings doc listener — status updates + unpair detection
  let isFirstPairingSnapshot = true;

  unsubscribePairing = onSnapshot(doc(db, 'pairings', deviceId), snap => {
    const data = snap.data();

    // Unpair detection: document deleted
    if (!data) {
      if (pairingPending) {
        console.log('[PinBridge] Document missing but pairing is pending — ignoring.');
        return;
      }
      console.log('[PinBridge] Pairing document deleted. Unpairing...');
      isFirstPairingSnapshot = false;
      performUnpairOnly();
      return;
    }

    if (data.paired === false) {
      if (isFirstPairingSnapshot || pairingPending) {
        console.log('[PinBridge] Ignoring paired:false (first snapshot or pairing pending).');
        isFirstPairingSnapshot = false;
        return;
      }
      console.log('[PinBridge] Pairing explicitly revoked (paired set to false). Unpairing...');
      performUnpairOnly();
      return;
    }

    // Got a valid snapshot
    isFirstPairingSnapshot = false;

    // Status update: online/offline + battery
    const lastSeen = data.lastOnline ? (data.lastOnline.toMillis ? data.lastOnline.toMillis() : data.lastOnline) : null;
    const batteryLevel = data.batteryLevel != null ? data.batteryLevel : null;
    const isCharging = !!data.isCharging;

    console.log(`[PinBridge] Firestore status update: status=${data.status}, lastSeen: ${lastSeen}, battery: ${batteryLevel}%`);
    handlePresenceUpdate(lastSeen, batteryLevel, isCharging, data.status || null);
  }, err => {
    if (err.code === 'permission-denied') {
      if (pairingPending || isFirstPairingSnapshot) {
        console.warn('[PinBridge] Permission denied during startup — scheduling presence restart in 3s.');
        isFirstPairingSnapshot = false;
        unsubscribePairing = null; // Mark as dead so refreshStatus will restart
        setTimeout(() => {
          if (!unsubscribePairing && !isPairingNow) {
            console.log('[PinBridge] Retrying presence listeners after permission-denied recovery.');
            startPresenceListeners(deviceId);
          }
        }, 3000);
      } else {
        console.warn('[PinBridge] Permission denied on pairing listener. Unpairing.');
        performUnpairOnly();
      }
    }
  });
}

// ─── OTP Listener (Firestore otps doc only) ──────────────────────────────────
// Completely independent from presence. Started once on pair/auth restore.
// Never restarted by polling — only fires when a new OTP arrives.
function startOtpListener(deviceId) {
  if (!deviceId) return;

  // Stop existing OTP listener if any (prevents duplicates)
  stopOtpListener();

  let isFirstOtpEvent = true;
  unsubscribeOtp = onSnapshot(doc(db, 'otps', deviceId), snap => {
    isFirstOtpEvent = false;
    const data = snap.data();
    if (!data) return;
    processNewOtp(data);
  }, err => {
    if (err.code === 'permission-denied') {
      if (pairingPending || isFirstOtpEvent) {
        console.warn('[PinBridge] OTP permission denied (first event or pairing pending) — ignoring.');
        isFirstOtpEvent = false;
      } else {
        performUnpairOnly();
      }
    }
  });
}

// ─── Start Both (used on pair, auth restore, web login) ──────────────────────
function startAllListeners(deviceId) {
  startPresenceListeners(deviceId);
  startOtpListener(deviceId);
}

async function processNewOtp(data) {
    const { secret, latestOtp } = await chrome.storage.local.get(['secret', 'latestOtp']);
    if (!secret) return;

    // Fix P0-1: Deduplicate OTPs by comparing otpEventId OR timestamp.
    // Without this, every Firestore snapshot (including initial cache reads)
    // triggers a decrypt + notification of the same OTP.
    const eventId = data.otpEventId;
    const tsFromDb = data.smsTs || (data.ts && typeof data.ts.toMillis === 'function' ? data.ts.toMillis() : Date.now());
    
    if ((eventId && latestOtp?.otpEventId === eventId) || (latestOtp?.ts === tsFromDb && latestOtp?.ts > 0)) {
        console.log(`[PinBridge] Skipping already-processed OTP`);
        return;
    }

    try {
        const decrypted = await decryptOtp(data, secret);
        chrome.storage.local.set({latestOtp: {otp: decrypted, ts: tsFromDb, otpEventId: eventId}});
        
        // Fix V-06: Do not show the OTP in the notification.
        // Notifications are visible on lock screens and in OS notification centers.
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/128.png',
          title: 'PinBridge',
          message: 'New verification code received. Click to view.',
          priority: 2
        });
        
        safeSendMessage({type: 'newOtp', otp: decrypted, ts: tsFromDb});
        
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {type: 'newOtp', otp: decrypted, ts: tsFromDb}).catch(() => {});
          });
        });
    } catch (e) {
        console.error('[PinBridge] Background decrypt failed:', e);
    }
}


chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) {
          startAllListeners(pairedDeviceId);
      }
    });
});

// FIX: Listen for pairing-in-progress flag from session storage
// This prevents the background from interfering with an active pairing flow
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.pairingInProgress) {
    pairingPending = !!changes.pairingInProgress.newValue;
    console.log(`[PinBridge] Pairing pending state changed: ${pairingPending}`);
  }
});

// Check on startup if a pairing was left in progress
chrome.storage.session.get(['pairingInProgress'], (data) => {
  if (data.pairingInProgress) {
    pairingPending = true;
    console.log('[PinBridge] Pairing was in progress on startup.');
  }
});

onAuthStateChanged(auth, user => {
  if (user && !isPairingNow) {
    // Auth restored on SW restart — start both presence and OTP listeners.
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId && !isPairingNow) startAllListeners(pairedDeviceId);
    });
  }
});

// ─── Alarm handler: keepalive + listener recovery ─────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Service worker was woken by alarm — restart presence only (not OTP).
    // OTP listener is independent and doesn't need periodic recovery.
    const isSocketAlive = socket && (socket.connected || socket.active);
    if (!unsubscribePairing && !isSocketAlive && !isPairingNow) {
      chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
        if (pairedDeviceId && !isPairingNow) {
          console.log('[PinBridge] Keepalive: No presence listeners, restarting.');
          startPresenceListeners(pairedDeviceId);
        }
      });
    }
  }
});
