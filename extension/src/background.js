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

function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    const performPairing = async () => {
        if (!auth.currentUser) {
            console.log('[PinBridge] No active session during pairing message, signing in anonymously...');
            await signInAnonymously(auth);
        }
        // FIX: pairedDeviceId is already saved by pairing.js after confirmation.
        // Ensure it's set in storage (may already be there from pairing.js)
        await chrome.storage.local.set({ pairedDeviceId: msg.deviceId, secret: msg.secret });
        pairingPending = false; // Pairing is now confirmed
        startListeners(msg.deviceId);
        safeSendMessage({ type: 'paired', deviceId: msg.deviceId, isOnline: true });

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
        pairingPending = false;
        sendResponse({status: 'error', error: err.message});
    });
    return true;
  } else if (msg.type === 'getStatus') {
    chrome.storage.local.get(['pairedDeviceId', 'isOnline', 'lastSeen', 'batteryLevel', 'isCharging'], ({pairedDeviceId, isOnline, lastSeen, batteryLevel, isCharging}) => {
      sendResponse({
        status: pairedDeviceId ? 'paired' : 'unpaired', 
        deviceId: pairedDeviceId,
        isOnline: !!isOnline,
        lastSeen: lastSeen || null,
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
        if (!auth.currentUser) {
            console.log('[PinBridge] No active session, signing in anonymously...');
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
  try {
    await cleanupFirestorePairing(pairedDeviceId, googleUid);
  } finally {
    await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp', 'isOnline', 'batteryLevel', 'isCharging']);
    stopListeners();
    console.log('[PinBridge] Unpaired (auth preserved)');
    safeSendMessage({ type: 'statusUpdate', online: false, lastSeen: Date.now() });
    safeSendMessage({ type: 'unpaired' });
  }
}

async function performSignOut() {
  if (isSigningOut) return;
  isSigningOut = true;
  
  const { pairedDeviceId, googleUid } = await chrome.storage.local.get(['pairedDeviceId', 'googleUid']);
  try {
    await cleanupFirestorePairing(pairedDeviceId, googleUid);
  } finally {
    await signOut(auth).catch(() => {});
    await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp', 'googleUid', 'googleEmail']);
    await chrome.storage.local.remove(['isOnline', 'batteryLevel', 'isCharging']);
    
    stopListeners();
    
    isSigningOut = false;
    console.log('[PinBridge] Local state cleaned');
    safeSendMessage({ type: 'statusUpdate', online: false, lastSeen: Date.now() });
    safeSendMessage({ type: 'unpaired' }); 
  }
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

  // 1. Presence (Socket.IO) - Real-time primary
  if (!socket) {
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
        validatePresence(data.status === 'online', data.lastSeen, data.batteryLevel, data.isCharging);
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[PinBridge] Socket disconnected:', reason);
      // Socket.IO handles reconnection automatically with above config
    });

    socket.on('connect_error', (err) => {
      console.warn('[PinBridge] Socket connection error:', err.message);
    });
  }

  // Helper to validate and propagate status
  function validatePresence(online, lastSeen, batteryLevel, isCharging) {
      const now = Date.now();
      const STALE_THRESHOLD = 60000;
      let effectiveOnline = online;
      let isStale = false;

      if (online && lastSeen && (now - lastSeen > STALE_THRESHOLD)) {
          console.warn(`[PinBridge] Stale online status detected (lastSeen: ${now - lastSeen}ms ago). Forcing offline.`);
          effectiveOnline = false;
          isStale = true;
      }

      console.log(`[PinBridge] Presence: ${effectiveOnline ? 'ONLINE' : 'OFFLINE'} ${isStale ? '(STALE)' : ''} Battery: ${batteryLevel}% ${isCharging ? '(Charging)' : ''}`);
      const storageData = { isOnline: effectiveOnline, lastSeen };
      if (batteryLevel != null) {
          storageData.batteryLevel = batteryLevel;
          storageData.isCharging = !!isCharging;
      }
      chrome.storage.local.set(storageData);
      safeSendMessage({ type: 'statusUpdate', online: effectiveOnline, lastSeen, isStale, batteryLevel: batteryLevel != null ? batteryLevel : undefined, isCharging: !!isCharging });
  }

  // 2. SINGLE Firestore listener for both status + pairing state (Fix W-5)
  // Replaces the previous two separate onSnapshot listeners.
  unsubscribePairing = onSnapshot(doc(db, 'pairings', deviceId), snap => {
    const data = snap.data();

    // Unpair detection: document deleted
    if (!data) {
      console.log('[PinBridge] Pairing document deleted. Unpairing...');
      performUnpairOnly();
      return;
    }

    // FIX: paired:false means pairing is in progress (set by pairing.js initially).
    // Only treat it as an unpair if we were PREVIOUSLY paired (not during initial setup).
    // During active pairing flow, pairingPending is true, so skip this check.
    if (data.paired === false && !pairingPending) {
      // Check if we were previously confirmed as paired
      chrome.storage.local.get(['pairedDeviceId'], ({ pairedDeviceId }) => {
        if (pairedDeviceId === deviceId) {
          console.log('[PinBridge] Pairing explicitly revoked (paired set to false). Unpairing...');
          performUnpairOnly();
        }
        // else: This is the initial pairing doc creation — ignore
      });
      return;
    }

    // Status update: online/offline + battery
    const online = data.status === 'online';
    const lastSeen = data.lastOnline ? (data.lastOnline.toMillis ? data.lastOnline.toMillis() : data.lastOnline) : null;
    const batteryLevel = data.batteryLevel != null ? data.batteryLevel : null;
    const isCharging = !!data.isCharging;

    console.log(`[PinBridge] Firestore status update: ${online ? 'online' : 'offline'}, lastSeen: ${lastSeen}, battery: ${batteryLevel}%`);
    validatePresence(online, lastSeen, batteryLevel, isCharging);
  }, err => {
    // FIX: Don't unpair on permission-denied if pairing is still in progress
    if (err.code === 'permission-denied') {
      if (pairingPending) {
        console.warn('[PinBridge] Permission denied during active pairing — ignoring (pairing in progress).');
      } else {
        console.warn('[PinBridge] Permission denied on pairing listener. Unpairing.');
        performUnpairOnly();
      }
    }
  });

  // 3. OTP Listener
  unsubscribeOtp = onSnapshot(doc(db, 'otps', deviceId), snap => {
    const data = snap.data();
    if (!data) return;
    processNewOtp(data);
  }, err => {
    if (err.code === 'permission-denied') {
      if (pairingPending) {
        console.warn('[PinBridge] OTP permission denied during active pairing — ignoring.');
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
  if (user) {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) startListeners(pairedDeviceId);
    });
  }
});
