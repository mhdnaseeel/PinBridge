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
  try {
    if (!lastKnownHeartbeat) return;
    
    // 20 minutes threshold to account for Android's background PeriodicWorkManager (15 min min)
    const isOnline = (Date.now() - lastKnownHeartbeat) < 1200000;
    
    const currentStatus = await chrome.storage.session.get(['isOnline']);
    if (currentStatus.isOnline !== isOnline) {
      await chrome.storage.session.set({ isOnline });
      safeSendMessage({ type: 'statusUpdate', online: isOnline });
      console.log(`[PinBridge] Device status changed to: ${isOnline ? 'Online' : 'Offline'}`);
    }
  } catch (err) {
    console.error('[PinBridge] Online status check failed:', err);
  }
}

function safeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message).catch(err => {
      if (!err.message.includes('Could not establish connection')) {
        console.warn('[PinBridge] Runtime message error:', err);
      }
    });
  } catch (e) {
    // Catch immediate sync errors
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    signInAnonymously(auth)
      .then(() => {
        chrome.storage.local.set({ pairedDeviceId: msg.deviceId, secret: msg.secret });
        startOtpListener(msg.deviceId);
        sendResponse({status: 'paired'});
      })
      .catch(err => {
        sendResponse({status: 'error', error: err.message});
      });
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
        chrome.storage.local.remove(['pairedDeviceId', 'secret', 'latestOtp']);
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
             chrome.storage.local.get(['secret'], async ({secret}) => {
                if (secret) {
                  try {
                    const decrypted = await decryptOtp(data, secret);
                    chrome.storage.local.set({latestOtp: {otp: decrypted, ts: Date.now()}});
                    sendResponse({status: 'ok', otp: decrypted});
                  } catch (err) {
                    console.error('[PinBridge] Manual fetch decryption failed:', err);
                    sendResponse({status: 'error', error: 'Decryption failed'});
                  }
                } else {
                  sendResponse({status: 'error', error: 'No secret found'});
                }
             });
          } else {
            sendResponse({status: 'error', error: 'No data found'});
          }
        }).catch(err => {
          console.error('[PinBridge] Manual fetch doc get failed:', err);
          sendResponse({status: 'error', error: err.message});
        });
      } else {
        sendResponse({status: 'error', error: 'Not paired'});
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
    
    // Remote Unpair Detection: If document is deleted or paired is false
    if (!data || data.paired === false) {
      console.log('[PinBridge] Pairing document removed or disabled remotely. Unpairing locally...');
      chrome.runtime.sendMessage({ type: 'signOut' }); // Trigger internal sign-out logic
      return;
    }

    // Monitor Online/Offline status
    lastKnownHeartbeat = data.lastSeen?.toMillis() || 0;
    checkOnlineStatus(); // Immediate re-check
  }, err => {
    console.error('[PinBridge] Pairing snapshot error:', err);
    if (err.code === 'permission-denied') {
      console.warn('[PinBridge] Permission denied. Unpairing...');
      chrome.runtime.sendMessage({ type: 'signOut' });
    }
  });

  // Keep the OTP listener on 'otps' collection
  const otpDocRef = doc(db, 'otps', deviceId);
  onSnapshot(otpDocRef, snap => {
    const data = snap.data();
    if (!data) return;
    chrome.storage.local.get(['secret'], async ({secret}) => {
      if (!secret) {
        console.warn('[PinBridge] No secret found for decryption');
        return;
      }
      try {
        const decrypted = await decryptOtp(data, secret);
        chrome.storage.local.set({latestOtp: {otp: decrypted, ts: Date.now()}});
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/128.png',
          title: 'New OTP Received',
          message: `Your OTP is: ${decrypted}`,
          priority: 2
        });
        safeSendMessage({type: 'newOtp', otp: decrypted});
        
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {type: 'newOtp', otp: decrypted}).catch(() => {
              // Expected for tabs where PinBridge isn't active
            });
          });
        });
      } catch (e) {
        console.error('Decryption failed', e);
      }
    });
  }, err => {
    console.error('[PinBridge] OTP snapshot error:', err);
    if (err.code === 'permission-denied') {
      console.warn('[PinBridge] Permission denied for OTPs. Unpairing...');
      chrome.runtime.sendMessage({ type: 'signOut' });
    }
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
