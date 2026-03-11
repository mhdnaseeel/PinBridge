// Firebase SDKs (using compat version for easier extension integration)
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js');
importScripts('decrypt.js');

const firebaseConfig = {
  apiKey: "{{FIREBASE_API_KEY}}",
  authDomain: "{{FIREBASE_PROJECT_ID}}.firebaseapp.com",
  projectId: "{{FIREBASE_PROJECT_ID}}",
  storageBucket: "{{FIREBASE_PROJECT_ID}}.appspot.com",
  messagingSenderId: "{{FIREBASE_SENDER_ID}}",
  appId: "{{FIREBASE_APP_ID}}"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let unsubscribe = null;

// Handle messages from popup or pairing page
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    auth.signInWithCustomToken(msg.token)
      .then(userCred => {
        const uid = userCred.user.uid;
        startOtpListener(uid);
        sendResponse({status: 'paired'});
      })
      .catch(err => {
        console.error('Sign-in error:', err);
        sendResponse({status: 'error', error: err.message});
      });
    return true; // Keep channel open for async response
  } else if (msg.type === 'getStatus') {
    const user = auth.currentUser;
    sendResponse({status: user ? 'paired' : 'unpaired', uid: user?.uid});
  } else if (msg.type === 'signOut') {
    auth.signOut().then(() => {
      if (unsubscribe) unsubscribe();
      sendResponse({status: 'ok'});
    });
    return true;
  }
});

function startOtpListener(uid) {
  if (unsubscribe) unsubscribe();

  const docRef = db.collection('otps').doc(uid);
  unsubscribe = docRef.onSnapshot(snap => {
    const data = snap.data();
    if (!data) return;

    // Retrieve secret from session storage to decrypt
    chrome.storage.session.get(['secret'], async ({secret}) => {
      if (!secret) return;
      
      try {
        // We'll import decryptOtp from a separate file or define it here
        // Since importScripts is used, we can just define it in another file and import it
        const decrypted = await decryptOtp(data, secret);
        
        // Save latest OTP and notify
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
      } catch (e) {
        console.error('Decryption failed', e);
      }
    });
  });
}

// Re-start listener if already signed in
auth.onAuthStateChanged(user => {
  if (user) {
    startOtpListener(user.uid);
  }
});
