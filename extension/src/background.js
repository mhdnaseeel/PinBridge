import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged } from "firebase/auth";
import { initializeFirestore, collection, doc, onSnapshot, getDoc, deleteDoc } from "firebase/firestore";

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
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

let unsubscribe = null;
let lastKnownDeviceId = null;
let lastKnownHeartbeat = 0;
let checkInterval = null;

async function checkOnlineStatus() {
  if (!lastKnownHeartbeat) return;
  
  // 5 minutes threshold to account for clock drift and WorkManager delays
  const isOnline = (Date.now() - lastKnownHeartbeat) < 300000;
  
  const currentStatus = await chrome.storage.session.get(['isOnline']);
  if (currentStatus.isOnline !== isOnline) {
    chrome.storage.session.set({ isOnline });
    safeSendMessage({ type: 'statusUpdate', online: isOnline });
    console.log(`[PinBridge] Device status changed to: ${isOnline ? 'Online' : 'Offline'}`);
  }
}

function safeSendMessage(message) {
  chrome.runtime.sendMessage(message).catch(err => {
    // Ignore "Could not establish connection" errors as they just mean the popup/sidepanel is closed
    if (err.message !== 'Could not establish connection. Receiving end does not exist.') {
      console.warn('[PinBridge] SendMessage error:', err);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    signInAnonymously(auth)
      .then(() => {
        chrome.storage.local.set({ pairedDeviceId: msg.deviceId });
        chrome.storage.session.set({ secret: msg.secret });
        startOtpListener(msg.deviceId);
        sendResponse({status: 'paired'});
      })
      .catch(err => {
        sendResponse({status: 'error', error: err.message});
      });
    return true;
  } else if (msg.type === 'getStatus') {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
       sendResponse({status: pairedDeviceId ? 'paired' : 'unpaired', deviceId: pairedDeviceId});
    });
    return true;
    return true;
  } else if (msg.type === 'signOut') {
    chrome.storage.local.get(['pairedDeviceId'], async ({pairedDeviceId}) => {
      try {
        if (pairedDeviceId) {
          console.log('[PinBridge] Unpairing device from Firestore:', pairedDeviceId);
          // Delete from Firestore first
          await Promise.all([
            deleteDoc(doc(db, 'pairings', pairedDeviceId)),
            deleteDoc(doc(db, 'otps', pairedDeviceId))
          ]);
          console.log('[PinBridge] Firestore records deleted');
        }
      } catch (err) {
        console.error('[PinBridge] Firestore cleanup failed:', err);
      } finally {
        await signOut(auth);
        chrome.storage.local.remove(['pairedDeviceId', 'latestOtp']);
        if (unsubscribe) unsubscribe();
        console.log('[PinBridge] Signed out and cleaned up local storage');
        sendResponse({status: 'ok'});
      }
    });
    return true;
  } else if (msg.type === 'manualFetch') {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) {
        getDoc(doc(db, 'otps', pairedDeviceId)).then(snap => {
          const data = snap.data();
          if (data) {
             // Process existing data manually
             chrome.storage.session.get(['secret'], async ({secret}) => {
                if (secret) {
                  const decrypted = await decryptOtp(data, secret);
                  chrome.storage.local.set({latestOtp: {otp: decrypted, ts: Date.now()}});
                  sendResponse({status: 'ok', otp: decrypted});
                }
             });
          }
        });
      }
    });
    return true;
  }
});

function startOtpListener(deviceId) {
  if (!deviceId) return;
  lastKnownDeviceId = deviceId;
  if (unsubscribe) unsubscribe();
  
  // Start the background monitoring interval if not already running
  if (!checkInterval) {
    checkInterval = setInterval(checkOnlineStatus, 60000);
  }

  const docRef = doc(db, 'pairings', deviceId);
  unsubscribe = onSnapshot(docRef, snap => {
    const data = snap.data();
    if (!data) return;

    // Monitor Online/Offline status
    lastKnownHeartbeat = data.lastSeen?.toMillis() || 0;
    checkOnlineStatus(); // Immediate re-check
  });

  // Keep the OTP listener on 'otps' collection
  const otpDocRef = doc(db, 'otps', deviceId);
  onSnapshot(otpDocRef, snap => {
    const data = snap.data();
    if (!data) return;
    chrome.storage.session.get(['secret'], async ({secret}) => {
      if (!secret) return;
      try {
        const decrypted = await decryptOtp(data, secret);
        chrome.storage.local.set({latestOtp: {otp: decrypted, ts: Date.now()}});
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'New OTP Received',
          message: `Your OTP is: ${decrypted}`,
          priority: 2
        });
        safeSendMessage({type: 'newOtp', otp: decrypted});
        
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {type: 'newOtp', otp: decrypted});
          });
        });
      } catch (e) {
        console.error('Decryption failed', e);
      }
    });
  });
}

onAuthStateChanged(auth, user => {
  if (user) {
    chrome.storage.local.get(['pairedDeviceId'], ({pairedDeviceId}) => {
      if (pairedDeviceId) startOtpListener(pairedDeviceId);
    });
  }
});

// Assuming decrypt.js is also modularized or we include it here
async function decryptOtp(data, b64Secret) {
    const secret = Uint8Array.from(atob(b64Secret), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
    const cipherText = Uint8Array.from(atob(data.otp), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", secret, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, cipherText);
    return new TextDecoder().decode(decrypted);
}
