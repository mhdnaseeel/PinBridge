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
  if (unsubscribe) unsubscribe();
  const docRef = doc(db, 'pairings', deviceId); // Changed from 'otps' to 'pairings' to monitor metadata
  unsubscribe = onSnapshot(docRef, snap => {
    const data = snap.data();
    if (!data) return;

    // Monitor Online/Offline status
    const lastSeen = data.lastSeen?.toMillis() || 0;
    const isOnline = (Date.now() - lastSeen) < 90000; // 90 seconds threshold
    chrome.runtime.sendMessage({type: 'statusUpdate', online: isOnline});

    // We also monitor the OTPS separate document or the same document?
    // In previous versions, 'otps' collection was used for the OTP data.
    // Let's check the pairing doc for 'otp' field or if we still use separate doc.
    // Assuming 'otp' data is now mirrored in the pairing doc for efficiency,
    // or we check the 'otps' collection separately.
    // The previous logic used: doc(db, 'otps', deviceId)
    
    // Let's stick to dual doc if needed, but for heartbeat 'pairings' is correct.
    // I will add a separate listener for OTPS if it's not in the same doc.
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
        chrome.runtime.sendMessage({type: 'newOtp', otp: decrypted});
        
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
