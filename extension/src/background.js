import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot } from "firebase/firestore";

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

let unsubscribe = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    signInWithCustomToken(auth, msg.token)
      .then(userCred => {
        startOtpListener(userCred.user.uid);
        sendResponse({status: 'paired'});
      })
      .catch(err => {
        sendResponse({status: 'error', error: err.message});
      });
    return true;
  } else if (msg.type === 'getStatus') {
    const user = auth.currentUser;
    sendResponse({status: user ? 'paired' : 'unpaired', uid: user?.uid});
  } else if (msg.type === 'signOut') {
    signOut(auth).then(() => {
      if (unsubscribe) unsubscribe();
      sendResponse({status: 'ok'});
    });
    return true;
  }
});

function startOtpListener(uid) {
  if (unsubscribe) unsubscribe();
  const docRef = doc(db, 'otps', uid);
  unsubscribe = onSnapshot(docRef, snap => {
    const data = snap.data();
    if (!data) return;
    chrome.storage.session.get(['secret'], async ({secret}) => {
      if (!secret) return;
      try {
        // Decrypt logic would go here, assuming decryptOtp is imported or defined
        // For simplicity, I'll keep the logic consistent with previous versions
        // but now using modular imports
        const decrypted = await decryptOtp(data, secret);
        chrome.storage.local.set({latestOtp: {otp: decrypted, ts: Date.now()}});
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'New OTP Received',
          message: `Your OTP is: ${decrypted}`,
          priority: 2
        });
        // Notify popup if it's open
        chrome.runtime.sendMessage({type: 'newOtp', otp: decrypted});

        // Broadcast to all tabs for autofill
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
  if (user) startOtpListener(user.uid);
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
