import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirestore, doc, onSnapshot, getDoc, deleteDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { decryptOtp } from "./crypto";
import { io } from "socket.io-client";
import * as Sentry from "@sentry/browser";

// Sentry Initialization
Sentry.init({
    dsn: "https://3457c2e95d532379d40e4152fc7642c1@o4511118204141568.ingest.us.sentry.io/4511118399635456",
    tracesSampleRate: 1.0,
    sendDefaultPii: true
});

// Verification - remove after testing
try {
    myUndefinedFunction();
} catch (e) {
    Sentry.captureException(e);
}

const SOCKET_SERVER_URL = "https://pinbridge-presence.onrender.com";
let socket = null;

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
self.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    console.debug('[PinBridge] Suppressed unhandled rejection:', e.reason);
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

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

let unsubscribePairing = null;
let unsubscribeOtp = null;
let unsubscribeStatus = null;
let isSigningOut = false;


async function checkPairingStatus() {
  const { pairedDeviceId } = await chrome.storage.local.get(['pairedDeviceId']);
  if (!pairedDeviceId) return;

  try {
    const pairingDoc = await getDoc(doc(db, 'pairings', pairedDeviceId));
    if (!pairingDoc.exists() || pairingDoc.data().paired === false) {
      console.log('[PinBridge] Pairing no longer valid on server. Signing out...');
      performSignOut();
    }
  } catch (err) {
    if (err.code === 'permission-denied') {
      performSignOut();
    }
  }
}

function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    signInAnonymously(auth)
      .then(async () => {
        chrome.storage.local.set({ pairedDeviceId: msg.deviceId, secret: msg.secret });
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
      })
      .catch(err => sendResponse({status: 'error', error: err.message}));
    return true;
  } else if (msg.type === 'getStatus') {
    chrome.storage.local.get(['pairedDeviceId', 'isOnline', 'lastSeen'], ({pairedDeviceId, isOnline, lastSeen}) => {
      sendResponse({
        status: pairedDeviceId ? 'paired' : 'unpaired', 
        deviceId: pairedDeviceId,
        isOnline: !!isOnline,
        lastSeen: lastSeen || null
      });
    });
    return true;
  } else if (msg.type === 'signOut') {
    performSignOut().then(() => sendResponse({status: 'ok'}));
    return true;
  } else if (msg.type === 'manualFetch') {
    handleManualFetch(sendResponse);
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
    const clientId = "475556984962-jekqarbki0ob5s1una398poptimup0eq.apps.googleusercontent.com";
    const redirectUri = chrome.identity.getRedirectURL();
    const scopes = encodeURIComponent("profile email");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=id_token%20token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&nonce=${Math.random().toString(36).substring(2)}`;

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

async function performSignOut() {
  if (isSigningOut) return;
  isSigningOut = true;
  
  const { pairedDeviceId } = await chrome.storage.local.get(['pairedDeviceId']);
  try {
    if (pairedDeviceId) {
      console.log('[PinBridge] Cleaning up Firestore for:', pairedDeviceId);
      await Promise.all([
        deleteDoc(doc(db, 'pairings', pairedDeviceId)),
        deleteDoc(doc(db, 'otps', pairedDeviceId))
      ]).catch(e => console.warn('[PinBridge] Partial Firestore cleanup:', e));
    }
  } catch (err) {
    console.error('[PinBridge] Sign out cleanup failed:', err);
  } finally {
    await signOut(auth).catch(() => {});
    await chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp']);
    await chrome.storage.local.remove(['isOnline']);
    
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
    if (unsubscribeStatus) { unsubscribeStatus(); unsubscribeStatus = null; }
    if (socket) {
        console.log('[PinBridge] Disconnecting socket...');
        socket.disconnect();
        socket = null;
    }
}

function startListeners(deviceId) {
  if (!deviceId) return;

  // 1. Presence (Socket.IO) - Real-time primary
  if (!socket) {
    console.log('[PinBridge] Connecting to presence server:', SOCKET_SERVER_URL);
    socket = io(SOCKET_SERVER_URL, {
      auth: async (cb) => {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        cb({ token, deviceId, clientType: "viewer" });
      }
    });

    socket.on('connect', () => console.log('[PinBridge] Socket connected to presence server'));

    socket.on('presence_update', (data) => {
      if (data.deviceId === deviceId) {
        validatePresence(data.status === 'online', data.lastSeen);
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('[PinBridge] Socket connection error:', err.message);
    });
  }

  // Helper to validate and propagate status
  function validatePresence(online, lastSeen) {
      const now = Date.now();
      const STALE_THRESHOLD = 60000;
      let effectiveOnline = online;
      let isStale = false;

      if (online && lastSeen && (now - lastSeen > STALE_THRESHOLD)) {
          console.warn(`[PinBridge] Stale online status detected (lastSeen: ${now - lastSeen}ms ago). Forcing offline.`);
          effectiveOnline = false;
          isStale = true;
      }

      console.log(`[PinBridge] Presence: ${effectiveOnline ? 'ONLINE' : 'OFFLINE'} ${isStale ? '(STALE)' : ''}`);
      chrome.storage.local.set({ isOnline: effectiveOnline, lastSeen });
      safeSendMessage({ type: 'statusUpdate', online: effectiveOnline, lastSeen, isStale });
  }

  // 2. Status Listener (Firestore) - Reliable source of truth
  // No local deduplication — service worker restarts clear JS state,
  // so we always propagate what Firestore says.
  unsubscribeStatus = onSnapshot(doc(db, 'pairings', deviceId), snap => {
    const data = snap.data();
    if (!data) return;
    
    const online = data.status === 'online';
    const lastSeen = data.lastOnline ? (data.lastOnline.toMillis ? data.lastOnline.toMillis() : data.lastOnline) : null;
    
    console.log(`[PinBridge] Firestore status update: ${online ? 'online' : 'offline'}, lastSeen: ${lastSeen}`);
    validatePresence(online, lastSeen);
  });

  // 3. Pairing Listener – handles unpairing logic
  unsubscribePairing = onSnapshot(doc(db, 'pairings', deviceId), async snap => {
    const data = snap.data();
    if (!data || data.paired === false) {
      performSignOut();
      return;
    }
  }, err => {
    if (err.code === 'permission-denied') performSignOut();
  });

  // 3. OTP Listener
  unsubscribeOtp = onSnapshot(doc(db, 'otps', deviceId), snap => {
    const data = snap.data();
    if (!data) return;
    processNewOtp(data);
  }, err => {
    if (err.code === 'permission-denied') performSignOut();
  });
}

async function processNewOtp(data) {
    const { secret } = await chrome.storage.local.get(['secret']);
    if (!secret) return;

    try {
        const decrypted = await decryptOtp(data, secret);
        const tsFromDb = data.smsTs || (data.ts && typeof data.ts.toMillis === 'function' ? data.ts.toMillis() : Date.now());
        const uploadTs = data.ts && typeof data.ts.toMillis === 'function' ? data.ts.toMillis() : Date.now();
        chrome.storage.local.set({latestOtp: {otp: decrypted, ts: tsFromDb, uploadTs}});
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/128.png',
          title: 'New OTP Received',
          message: `Your OTP is: ${decrypted}`,
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

onAuthStateChanged(auth, user => {
  if (user) {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) startListeners(pairedDeviceId);
    });
  }
});
