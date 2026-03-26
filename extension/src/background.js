import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirestore, doc, onSnapshot, getDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { decryptOtp } from "./crypto";

// Global error handlers to prevent Chrome Extension error UI
self.addEventListener('error', (e) => {
    e.preventDefault();
    console.debug('[PinBridge] Suppressed error:', e.error || e.message);
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
  measurementId: "G-LEDS6BH99B",
  databaseURL: "https://pinbridge-61dd4-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

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

async function checkOnlineStatus() {
  // Now handled by RTDB onValue listener in startListeners
  checkPairingStatus(); 
}

function stopStatusMonitor() {
    // Alarms no longer needed for primary status
}

function startStatusMonitor() {
    // Relying on RTDB listeners
}

function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch (e) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    signInAnonymously(auth)
      .then(() => {
        chrome.storage.local.set({ pairedDeviceId: msg.deviceId, secret: msg.secret });
        startListeners(msg.deviceId);
        safeSendMessage({ type: 'paired', deviceId: msg.deviceId, isOnline: true });
        sendResponse({status: 'paired'});
      })
      .catch(err => sendResponse({status: 'error', error: err.message}));
    return true;
  } else if (msg.type === 'getStatus') {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
       chrome.storage.session.get(['isOnline'], ({isOnline}) => {
         sendResponse({
           status: pairedDeviceId ? 'paired' : 'unpaired', 
           deviceId: pairedDeviceId,
           isOnline: !!isOnline
         });
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
  // Use the pre-configured Web Dashboard for zero-setup authentication
  const webUrl = 'https://pin-bridge.vercel.app/';
  
  chrome.tabs.create({ url: webUrl }, (tab) => {
    chrome.storage.local.set({ authTabId: tab.id });
  });

  sendResponse({ status: 'pending', message: 'Please sign in on the opened PinBridge dashboard...' });
}

async function handleWebLoginSuccess(msg) {
  const { uid, email } = msg;

  // Close the auth tab
  chrome.storage.local.get(['authTabId'], async ({ authTabId }) => {
    if (authTabId) {
      chrome.tabs.remove(authTabId).catch(e => console.log('Tab already closed'));
      chrome.storage.local.remove('authTabId');
    }
  });

  console.log('[PinBridge] Captured login from web:', email);
  try {
    const syncSnap = await getDoc(doc(db, 'users', uid, 'mirroring', 'active'));
    if (syncSnap.exists()) {
      const data = syncSnap.data();
      await chrome.storage.local.set({ 
        pairedDeviceId: data.deviceId, 
        secret: data.secret,
        googleUid: uid,
        googleEmail: email
      });
      startListeners(data.deviceId);
      safeSendMessage({ type: 'paired', deviceId: data.deviceId });
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
        const isOnlineObj = await chrome.storage.session.get(['isOnline']);
        if (!isOnlineObj.isOnline) {
            console.warn('[PinBridge] Manual fetch triggered while status is Offline. Proceeding with best-effort trigger.');
            // We proceed anyway to trigger the Firestore signal, in case the heartbeat is just lagging.
        }

        // Ensure we are signed in
        if (!auth.currentUser) {
            console.log('[PinBridge] No active session. Signing in...');
            await signInAnonymously(auth);
        }

        // Save pre-fetch uploadTs to detect when new upload completes
        const currentData = await chrome.storage.local.get(['latestOtp']);
        const preFetchUploadTs = currentData.latestOtp ? (currentData.latestOtp.uploadTs || 0) : 0;

        const pairingDoc = doc(db, 'pairings', pairedDeviceId);
        await updateDoc(pairingDoc, {
            fetchRequested: serverTimestamp()
        });
        console.log('[PinBridge] Remote fetch requested for:', pairedDeviceId);

        // Wait up to 15 seconds for Android to respond
        let attempts = 0;
        const maxAttempts = 15;
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000));
            
            // Check if phone went offline during polling (prevents hanging success)
            const statusCheck = await chrome.storage.session.get(['isOnline']);
            if (!statusCheck.isOnline) {
                sendResponse({status: 'error', error: 'Phone went offline'});
                return;
            }

            const { latestOtp } = await chrome.storage.local.get(['latestOtp']);
            if (latestOtp && (latestOtp.uploadTs || 0) > preFetchUploadTs) {
                console.log('[PinBridge] New OTP successfully fetched by device.');
                sendResponse({status: 'ok', otp: latestOtp.otp});
                return;
            }
            attempts++;
        }
        
        console.warn('[PinBridge] Manual fetch timeout. No OTP uploaded by device.');
        sendResponse({status: 'error', error: 'Timeout waiting for phone to upload'});
    } catch (err) {
        console.error('[PinBridge] Manual fetch error details:', {
            code: err.code,
            message: err.message,
            stack: err.stack
        });
        sendResponse({status: 'error', error: err.message});
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
    await chrome.storage.session.remove(['isOnline']);
    
    stopListeners();
    stopStatusMonitor();
    
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
}

function startListeners(deviceId) {
  if (!deviceId) return;
  stopListeners();
  startStatusMonitor();

  // 1. Pairing Listener – handles pairing/unpairing only
  unsubscribePairing = onSnapshot(doc(db, 'pairings', deviceId), async snap => {
    const data = snap.data();
    if (!data || data.paired === false) {
      performSignOut();
      return;
    }
  }, err => {
    if (err.code === 'permission-denied') performSignOut();
  });

  // 2. Status Listener (RTDB) – handles live presence
  const statusRef = ref(rtdb, `status/${deviceId}`);
  unsubscribeStatus = onValue(statusRef, async snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const now = Date.now();
    const lastSeen = data.last_changed || now;
    
    // Grace Logic: Even if state is 'offline', treat as online if last_changed is < 30s ago (Heartbeat grace)
    const isOnline = data.state === 'online' || (now - lastSeen < 30000);
    
    const currentStatus = await chrome.storage.session.get(['isOnline']);
    // Always update session storage with last seen
    await chrome.storage.session.set({ isOnline, lastSeen });
    
    safeSendMessage({ type: 'statusUpdate', online: isOnline, lastSeen });
    console.log(`[PinBridge] RTDB Presence: ${isOnline ? 'Online' : 'Offline'} (Raw: ${data.state}), Last Seen: ${new Date(lastSeen).toLocaleString()}`);
  });

  // 2. OTP Listener
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

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'statusCheck') {
        checkOnlineStatus();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) {
          startStatusMonitor();
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
