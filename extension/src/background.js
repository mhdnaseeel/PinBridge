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

  // Returns true if state was updated, false if it was stale
  update({ lastSeen, batteryLevel, isCharging, status }) {
    // Reject stale updates
    if (lastSeen && lastSeen < this.lastSeen) {
      console.log(`[PinBridge StateManager] Rejected stale update (incoming=${lastSeen}, current=${this.lastSeen})`);
      return false;
    }
    if (lastSeen) this.lastSeen = lastSeen;
    if (batteryLevel != null) {
      this.batteryLevel = batteryLevel;
      this.isCharging = !!isCharging;
    }
    // Track the authoritative server status
    if (status === 'online' || status === 'offline') {
      this.serverStatus = status;
    }
    // Persist to storage for popup/sidepanel reads
    const storageData = { lastSeen: this.lastSeen };
    if (this.batteryLevel != null) {
      storageData.batteryLevel = this.batteryLevel;
      storageData.isCharging = this.isCharging;
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
      batteryLevel: this.batteryLevel != null ? this.batteryLevel : undefined,
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
        startListeners(msg.deviceId);
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
      startListeners(pairedDeviceId);
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
  startListeners(deviceId);
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
        const preFetchUploadTs = currentData.latestOtp ? (currentData.latestOtp.uploadTs || 0) : 0;
        console.log(`[PinBridge] Manual fetch request. Last uploadTs: ${preFetchUploadTs}`);

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
            const currentUploadTs = latestOtp ? (latestOtp.uploadTs || 0) : 0;

            if (latestOtp && currentUploadTs > preFetchUploadTs) {
                console.log(`[PinBridge] Fetch Success: New OTP found (ts: ${currentUploadTs})`);
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
    safeSendMessage({ type: 'unpaired' });
  } catch (err) {
    console.error('[PinBridge] Sign out (auth only) failed:', err);
  }
}

// ─── Shared cleanup logic for unpair and sign-out ──────────────
async function cleanupFirestorePairing(pairedDeviceId, googleUid) {
  try {
    if (pairedDeviceId) {
      console.log('[PinBridge] Cleaning up Firestore pairing for:', pairedDeviceId);
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
  stopListeners();
  stateManager.reset();
  await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp', 'lastSeen', 'batteryLevel', 'isCharging']);
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
  stopListeners();
  stateManager.reset();
  await signOut(auth).catch(() => {});
  await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp', 'googleUid', 'googleEmail']);
  await chrome.storage.local.remove(['lastSeen', 'batteryLevel', 'isCharging']);
  
  isSigningOut = false;
  console.log('[PinBridge] Local state cleaned');
  safeSendMessage({ type: 'statusUpdate', lastSeen: 0 });
  safeSendMessage({ type: 'unpaired' });

  // Firestore cleanup in background — don't block the UI
  cleanupFirestorePairing(pairedDeviceId, googleUid).catch(e => {
    console.warn('[PinBridge] Background Firestore cleanup error:', e);
  });
}

function stopListeners() {
    if (unsubscribePairing) { unsubscribePairing(); unsubscribePairing = null; }
    if (unsubscribeOtp) { unsubscribeOtp(); unsubscribeOtp = null; }
    if (socket) {
        console.log('[PinBridge] Disconnecting socket...');
        socket.disconnect();
        socket = null;
    }
}

let socket = null;

function startListeners(deviceId) {
  if (!deviceId) return;

  // FIX: Stop any existing listeners before starting new ones to prevent
  // duplicate listeners and memory leaks from multiple startListeners() calls.
  stopListeners();

  // 1. Presence (Socket.IO) - Real-time primary
  console.log('[PinBridge] Connecting to presence server:', SOCKET_SERVER_URL);
  socket = io(SOCKET_SERVER_URL, {
    auth: async (cb) => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      cb({ token, deviceId, clientType: "viewer" });
    },
    // Fix P0-2: Enable automatic reconnection with exponential backoff
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 60000
  });

  socket.on('connect', () => console.log('[PinBridge] Socket connected to presence server'));

  socket.on('presence_update', (data) => {
    if (data.deviceId === deviceId) {
      handlePresenceUpdate(data.lastSeen, data.batteryLevel, data.isCharging, data.status);
    }
  });

  socket.on('disconnect', (reason) => {
    console.warn('[PinBridge] Socket disconnected:', reason);
    // Socket.IO handles reconnection automatically with above config
  });

  socket.on('connect_error', (err) => {
    console.warn('[PinBridge] Socket connection error:', err.message);
  });

  // Helper: feed updates through the centralized StateManager
  function handlePresenceUpdate(lastSeen, batteryLevel, isCharging, status) {
      console.log(`[PinBridge] Presence update: status=${status}, lastSeen=${lastSeen}, battery=${batteryLevel}%, charging=${isCharging}`);
      stateManager.update({ lastSeen, batteryLevel, isCharging, status });
  }

  // FIX (BUG A): The FIRST onSnapshot fires from Firestore's LOCAL CACHE, which
  // still has the stale paired:false from the initial document creation.
  // Since pairingPending is already false (set in the pair handler before calling
  // startListeners), the old code treated this cached paired:false as an unpair
  // signal and immediately called performUnpairOnly() — destroying the pairing.
  //
  // Fix: Skip the unpair check on the first snapshot. If the document truly has
  // paired:false from the server, Firestore will fire a second snapshot with
  // the server-confirmed state.
  let isFirstPairingSnapshot = true;

  // 2. SINGLE Firestore listener for both status + pairing state
  unsubscribePairing = onSnapshot(doc(db, 'pairings', deviceId), snap => {
    const data = snap.data();

    // Unpair detection: document deleted
    // FIX (Bug 4): Document deletion is an UNAMBIGUOUS unpair signal — never skip it,
    // even on the first snapshot. Unlike paired:false which can be stale cache,
    // a missing document means it was genuinely deleted (e.g., from the phone).
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
        // FIX: First snapshot is likely from Firestore cache with stale paired:false.
        // Or pairing is still in progress. Don't unpair — wait for server snapshot.
        console.log('[PinBridge] Ignoring paired:false (first snapshot or pairing pending).');
        isFirstPairingSnapshot = false;
        return;
      }
      // Subsequent snapshot with paired:false — genuine unpair signal
      console.log('[PinBridge] Pairing explicitly revoked (paired set to false). Unpairing...');
      performUnpairOnly();
      return;
    }

    // Got a valid snapshot (paired:true or status update) — no longer first
    isFirstPairingSnapshot = false;

    // Status update: online/offline + battery
    const lastSeen = data.lastOnline ? (data.lastOnline.toMillis ? data.lastOnline.toMillis() : data.lastOnline) : null;
    const batteryLevel = data.batteryLevel != null ? data.batteryLevel : null;
    const isCharging = !!data.isCharging;

    console.log(`[PinBridge] Firestore status update: lastSeen: ${lastSeen}, battery: ${batteryLevel}%`);
    handlePresenceUpdate(lastSeen, batteryLevel, isCharging);
  }, err => {
    if (err.code === 'permission-denied') {
      if (pairingPending || isFirstPairingSnapshot) {
        console.warn('[PinBridge] Permission denied during startup/pairing — ignoring.');
        isFirstPairingSnapshot = false;
      } else {
        console.warn('[PinBridge] Permission denied on pairing listener. Unpairing.');
        performUnpairOnly();
      }
    }
  });

  // 3. OTP Listener
  let isFirstOtpEvent = true; // Guard: skip permission errors on first event
  unsubscribeOtp = onSnapshot(doc(db, 'otps', deviceId), snap => {
    isFirstOtpEvent = false;
    const data = snap.data();
    if (!data) return;
    processNewOtp(data);
  }, err => {
    if (err.code === 'permission-denied') {
      if (pairingPending || isFirstOtpEvent) {
        // FIX: OTP doc may not exist yet for a fresh pairing.
        // Firestore rules referencing resource.data on a non-existent doc
        // can return permission-denied. Don't unpair on the first error.
        console.warn('[PinBridge] OTP permission denied (first event or pairing pending) — ignoring.');
        isFirstOtpEvent = false;
      } else {
        performUnpairOnly();
      }
    }
  });
}

async function processNewOtp(data) {
    const { secret, latestOtp } = await chrome.storage.local.get(['secret', 'latestOtp']);
    if (!secret) return;

    // Fix P0-1: Deduplicate OTPs by comparing upload timestamps.
    // Without this, every Firestore snapshot (including initial cache reads)
    // triggers a decrypt + notification of the same OTP.
    const uploadTs = data.ts && typeof data.ts.toMillis === 'function' ? data.ts.toMillis() : Date.now();
    const lastProcessedTs = latestOtp?.uploadTs || 0;
    if (uploadTs <= lastProcessedTs) {
        console.log(`[PinBridge] Skipping already-processed OTP (uploadTs: ${uploadTs} <= last: ${lastProcessedTs})`);
        return;
    }

    try {
        const decrypted = await decryptOtp(data, secret);
        const tsFromDb = data.smsTs || (data.ts && typeof data.ts.toMillis === 'function' ? data.ts.toMillis() : Date.now());
        chrome.storage.local.set({latestOtp: {otp: decrypted, ts: tsFromDb, uploadTs}});
        
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
          startListeners(pairedDeviceId);
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
    // FIX: Don't call startListeners if the pair handler is currently running.
    // The pair handler manages its own startListeners call and concurrent
    // invocations would race and potentially set up duplicate listeners.
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId && !isPairingNow) startListeners(pairedDeviceId);
    });
  }
});
