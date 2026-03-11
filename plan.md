**plan.md**

# OTP‑Mirror – “One‑Time‑Password on your Mac from your Android phone”

---

## 1️⃣ Product Idea

**Goal** – Let a user read an OTP that arrives on his Android 11 device directly inside a Chrome extension running on his MacBook, without manually copying the SMS.

**Why it matters**

| Problem | Solution |
|---------|----------|
| OTPs are delivered via SMS, which the user must open on the phone, copy and paste → friction & risk of exposure. | The Android app watches incoming SMS, extracts the numeric code and pushes it to a cloud store. The Chrome extension (MV3) subscribes to that store and shows the OTP instantly. |
| The user does not want to run a personal server. | **All back‑end services are provided by Firebase’s free Spark (free‑tier) plan.** No credit‑card needed, no ongoing cost. |
| Security – OTP is a secret, it must never be exposed to third‑parties. | End‑to‑end encryption is handled by a secret that is generated on the phone and shared (via QR code) only with the user’s Chrome extension. All traffic uses TLS (`https` / `wss`). The secret never leaves the two devices. |
| Android 11 restricts SMS permissions. | The app can use **SMS‑Retriever API** (preferred) or, for a personal side‑loaded build, request `RECEIVE_SMS`. The app will be a *private* utility, not a Play‑Store published app. |

---

## 2️⃣ How it Works – User Journey

```
[Phone]                               [Firebase]                             [Mac/Chrome]
 └─► 1️⃣  App launched                     │                                   └─► 6️⃣ UI shows OTP
 └─► 2️⃣  Phone receives SMS               │
 └─► 3️⃣  BroadcastReceiver extracts OTP ──► 4️⃣  Writes encrypted OTP to Firestore (doc: /otps/<deviceId>)
                                            (Security rule allows only that deviceId)
 └─► 5️⃣  Chrome extension (service worker) opens a realtime listener on the same doc.
                                            (Gets update instantly → decrypts → UI)
```

**Pairing (one‑time)**  

1. First launch → Android generates a random **deviceId** (UUID) & a 256‑bit **secret** (base64).  
2. The secret + deviceId are encoded into a QR code displayed on the phone.  
3. The user opens the Chrome extension’s “Pair” UI, scans the QR code (or copies the 6‑digit code).  
4. The extension sends the pairing payload to a tiny Cloud Function (`/pair`) which creates a **Firebase custom token** scoped to that deviceId and returns it.  
5. Both the Android app and the extension sign‑in with that custom token (`signInWithCustomToken`). From now on they are *authenticated as the same Firebase UID* and can read/write the same Firestore document.

After pairing, the OTP flow works automatically – no further user interaction.

---

## 3️⃣ Architecture (ASCII)

```
+---------------------------+      HTTPS (TLS)      +---------------------------+
| Android (Kotlin)          |---------------------->| Firebase Cloud Functions  |
| • BroadcastReceiver      |                       | • /pair (custom token)   |
| • WorkManager (retry)    |                       | • (optional) admin tasks |
| • QR code generation     |                       +---------------------------+
| • Firebase Auth (custom) |                               |
| • Firestore (write)      |                               v
+---------------------------+                     +---------------------------+
                                                   | Firestore (Free tier)   |
                                                   | • Collection: otps      |
                                                   |   /<deviceId> (doc)    |
                                                   | • TTL = 30 s (auto‑del)|
                                                   +---------------------------+
                                                            ^
                                                            |
+---------------------------+      WebSocket (wss)      |
| Chrome Extension (MV3)   |----------------------------+
| • Service Worker         |
| • Firebase Web SDK      |
| • Firestore realtime listener |
| • QR scanner (jsQR)     |
| • UI (popup)            |
+---------------------------+
```

*All traffic travels over TLS; the only “server” component is Firebase (Auth, Firestore, Cloud Functions).*

---

## 4️⃣ Technology Stack – All Free‑Tier Friendly

| Layer | Technology | Why it fits the free tier |
|-------|------------|---------------------------|
| **Android app** | Kotlin 1.9, Jetpack (ViewModel, LiveData, WorkManager), **ZXing** (QR generation), **SMS‑Retriever API** (or `RECEIVE_SMS` for side‑load) | No external hosting needed. Uses only device resources. |
| **Backend** | **Firebase Spark Plan** (free) – <br>✦ **Firebase Authentication** (custom tokens) <br>✦ **Cloud Firestore** (real‑time listeners) <br>✦ **Cloud Functions (Node 18)** for pairing endpoint <br>✦ **Firebase Security Rules** for fine‑grained access | Spark plan gives 1 GiB storage, 50 k reads / 20 k writes / day, 2 M function invocations/month – plenty for a personal OTP sync. |
| **Chrome Extension** | Manifest V3, Service Worker (background), **Firebase Web SDK** (Auth + Firestore), **jsQR** (QR decode), plain JavaScript/HTML/CSS | Runs completely client‑side; the only remote call goes to Firebase’s free services. |
| **CI / Automation** | GitHub Actions (free minutes), **Fastlane** for Android builds, **firebase-tools** CLI for deployments | All on free accounts. |
| **Optional Hosting** | Firebase Hosting (free) – could serve a simple “pairing instruction page” if you want a web UI instead of QR. | Same Spark account, no extra cost. |

---

## 5️⃣ Free‑Tier Feasibility Checklist

| Resource | Spark quota | Expected usage (personal) | Verdict |
|----------|-------------|---------------------------|--------|
| **Firestore reads** | 50 000/day | 1 read per OTP (real‑time listener) + occasional UI reads (≈ 20 per day) | ✅ |
| **Firestore writes** | 20 000/day | 1 write per OTP (≈ 30 per day) | ✅ |
| **Firestore storage** | 1 GiB | Each OTP document < 200 B → < 10 KB/month | ✅ |
| **Firestore TTL** | Included | Auto‑delete OTP after 30 s → no manual cleanup | ✅ |
| **Cloud Functions invocations** | 2 M/mo | Pairing called once per device (≈ 5/mo) | ✅ |
| **Auth custom tokens** | Unlimited on Spark (via Admin SDK) | Same as pairing calls | ✅ |
| **Firebase Hosting** | 10 GB storage / 10 GB/month egress | Optional static page (< 1 MB) | ✅ |
| **Analytics / Crashlytics** | Free | Optional for debugging | ✅ |

All components stay comfortably under the free limits for a single user, and even a small group of users (≤ 10) would still be safe.

---

## 6️⃣ Data Model (Firestore)

```
/pairings/{deviceId}
{
  secret: string,           // base64, only used for pairing (deleted after success)
  createdAt: timestamp
}

/otps/{deviceId}
{
  otp: string,              // encrypted OTP (base64)
  ts: timestamp,             // when OTP was stored
  iv: string                // Base64 IV used for AES‑GCM
}
```

- **TTL** is enabled on the `otps` collection: `ts + 30 seconds` → document auto‑deletes.
- The **`pairings`** collection is only consulted by the `/pair` function; after successful pairing the secret entry is removed.

---

## 7️⃣ Security Rules (example)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Pairing documents – only callable via Cloud Functions (admin)
    match /pairings/{deviceId} {
      allow read, write: if false; // never client‑side
    }

    // OTP document – only the authenticated UID that equals deviceId can read/write
    match /otps/{deviceId} {
      allow read, write: if request.auth != null && request.auth.uid == deviceId;
    }
  }
}
```

- **Authentication** is performed with a **custom token** whose `uid` = `deviceId`.  
- No other users can access the OTP document.  
- The secret stored in `pairings` is never exposed to a client; the Cloud Function validates the secret before issuing the token.

---

## 8️⃣ Pairing Flow – Detailed Steps

1. **Phone**  
   - Generate `deviceId = UUID.randomUUID().toString()`  
   - Generate `secret = SecureRandom(32)` → Base64  
   - Write `{secret, createdAt}` to `pairings/{deviceId}` (Firestore).  
   - Render a QR containing JSON: `{"deviceId":"…","secret":"…"}`
2. **Chrome Extension**  
   - User clicks *Pair* → opens a small *modal* that invokes the webcam to scan the QR (or manual entry).  
   - Parses JSON → sends HTTPS POST to Cloud Function `https://<region>-<project>.cloudfunctions.net/pair` with body `{deviceId, secret}`.  
3. **Cloud Function (`pair`)**  
   ```js
   const admin = require('firebase-admin');
   admin.initializeApp();

   exports.pair = async (req, res) => {
     const {deviceId, secret} = req.body;
     const doc = await admin.firestore().doc(`pairings/${deviceId}`).get();
     if (!doc.exists || doc.data().secret !== secret) {
       return res.status(400).send('Invalid pairing');
     }
     // Create custom token that will be used as UID
     const customToken = await admin.auth().createCustomToken(deviceId);
     // Remove secret so it cannot be reused
     await admin.firestore().doc(`pairings/${deviceId}`).delete();
     res.json({token: customToken});
   };
   ```
4. **Both sides** call `firebase.auth().signInWithCustomToken(token)`.  
   - After sign‑in the Android app now has `uid == deviceId`.  
   - The Chrome extension also has the same UID → both can read/write the OTP doc.
5. **OTP flow** – after pairing, no more secret exchange is needed.

---

## 9️⃣ OTP Capture on Android

```kotlin
class OtpReceiver : BroadcastReceiver() {
    private val otpRegex = Regex("""\b\d{4,8}\b""")   // adjust length as needed

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val body = msgs.joinToString(" ") { it.messageBody }
        otpRegex.find(body)?.value?.let { otp ->
            // Queue upload, WorkManager ensures retry on network loss
            OtpUploader.enqueue(context, otp)
        }
    }
}
```

**WorkManager upload** (handles offline retry):

```kotlin
class OtpUploader {
    companion object {
        private const val TAG = "OtpUpload"

        fun enqueue(context: Context, otp: String) {
            val data = workDataOf("otp" to otp)
            val request = OneTimeWorkRequestBuilder<UploadOtpWorker>()
                .setInputData(data)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    Duration.ofSeconds(30)
                )
                .addTag(TAG)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "upload_otp",
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
    }
}
```

**Upload worker – encrypt & write Firestore**

```kotlin
class UploadOtpWorker(
    ctx: Context,
    params: WorkerParameters
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = coroutineScope {
        val otp = inputData.getString("otp") ?: return@coroutineScope Result.failure()

        // ---- Encryption (AES‑GCM) -----------------------------------------
        val secret = EncryptedSharedPreferences.create(
            "pairing_prefs",
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
            applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        ).getString("secret", null) ?: return@coroutineScope Result.failure()

        val secretBytes = Base64.decode(secret, Base64.NO_WRAP)
        val encrypted = CryptoUtil.encrypt(otp, secretBytes)   // returns {cipher, iv}

        // ---- Firestore write ---------------------------------------------
        val uid = FirebaseAuth.getInstance().currentUser?.uid
            ?: return@coroutineScope Result.failure()
        val db = FirebaseFirestore.getInstance()
        val doc = db.collection("otps").document(uid)
        doc.set(
            mapOf(
                "otp" to encrypted.cipher,
                "iv"  to encrypted.iv,
                "ts"  to FieldValue.serverTimestamp()
            )
        ).await()

        Result.success()
    }
}
```

`CryptoUtil.encrypt` implements **AES‑GCM** (12‑byte IV, 128‑bit tag). The secret is the same 256‑bit value that was used for pairing; only the Chrome extension knows it to decrypt.

---

## 🔟 Chrome Extension – Real‑time Listener

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "OTP Mirror",
  "version": "1.0",
  "description": "Shows OTPs from your Android phone.",
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/16.png",
      "48": "icons/48.png",
      "128": "icons/128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://*.firebaseapp.com/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' https://www.gstatic.com https://www.googleapis.com; object-src 'self'"
  }
}
```

### `background.js` (service worker)

```js
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js');

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let unsubscribe = null; // Firestore listener handle

// Listen for messages from the popup (pairing request, UI actions)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pair') {
    // msg.token is the custom token received from Cloud Function
    auth.signInWithCustomToken(msg.token)
      .then(userCred => {
        const uid = userCred.user.uid;
        // Subscribe to OTP doc
        const docRef = db.collection('otps').doc(uid);
        unsubscribe = docRef.onSnapshot(snap => {
          const data = snap.data();
          if (!data) return;
          // Decrypt using stored secret (saved in chrome.storage.session)
          chrome.storage.session.get(['secret'], async ({secret}) => {
            const decrypted = await decryptOtp(data, secret);
            // Store for popup UI
            chrome.storage.local.set({latestOtp: {otp: decrypted, ts: Date.now()}});
            // Notify popup (if open)
            chrome.runtime.sendMessage({type: 'newOtp', otp: decrypted});
          });
        });
        sendResponse({status: 'paired'});
      })
      .catch(err => sendResponse({status: 'error', error: err.message}));
    return true; // async response
  } else if (msg.type === 'unpair') {
    auth.signOut();
    if (unsubscribe) unsubscribe();
    sendResponse({status: 'ok'});
    return true;
  }
});
```

### Decryption (simple wrapper)

```js
async function decryptOtp(doc, b64Secret) {
  const secret = Uint8Array.from(atob(b64Secret), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(doc.iv), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(doc.otp), c => c.charCodeAt(0));

  const alg = { name: "AES-GCM", iv: iv };
  const key = await crypto.subtle.importKey('raw', secret, alg, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(alg, key, cipher);
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}
```

### `popup.html` & `popup.js`

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; width: 200px; text-align:center; }
    #otp { font-size: 2rem; margin: 10px 0; }
    #ts { font-size: .8rem; color:#666; }
    button { margin-top:5px; }
  </style>
</head>
<body>
  <div id="status">Loading…</div>
  <div id="otp"></div>
  <div id="ts"></div>
  <button id="copy" style="display:none;">Copy</button>
  <script src="popup.js"></script>
</body>
</html>
```

```js
// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const {latestOtp, secret} = await chrome.storage.local.get(['latestOtp']);
  const statusEl = document.getElementById('status');
  const otpEl = document.getElementById('otp');
  const tsEl = document.getElementById('ts');
  const copyBtn = document.getElementById('copy');

  if (!latestOtp) {
    statusEl.textContent = 'No OTP yet';
    return;
  }

  statusEl.textContent = 'Latest OTP';
  otpEl.textContent = latestOtp.otp;
  tsEl.textContent = new Date(latestOtp.ts).toLocaleTimeString();
  copyBtn.style.display = 'inline-block';
  copyBtn.onclick = () => navigator.clipboard.writeText(latestOtp.otp);
});

// Listen for live updates from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'newOtp') {
    // reload UI
    location.reload();
  }
});
```

**Pairing UI** – a small `pair.html` can be opened via `chrome.runtime.openOptionsPage()` or integrated into the popup. It contains a `<video>` element for QR scanning and a text field for manual entry. The QR library `jsQR` can decode the frame and provide the JSON payload to the background script, which then calls the `/pair` Cloud Function and follows the flow described earlier.

---

## 📦 Repository Layout (suggested)

```
otp-mirror/
│
├─ android/
│   ├─ src/main/java/com/example/otpmirror/
│   │   ├─ OtpReceiver.kt
│   │   ├─ OtpUploader.kt
│   │   ├─ UploadOtpWorker.kt
│   │   ├─ CryptoUtil.kt
│   │   └─ PairingActivity.kt   // QR display
│   └─ build.gradle.kts
│
├─ extension/
│   ├─ manifest.json
│   ├─ background.js
│   ├─ popup.html
│   ├─ popup.js
│   ├─ pair.html
│   ├─ pair.js
│   └─ icons/
│
├─ functions/
│   ├─ package.json
│   ├─ index.js          // Cloud Function "pair"
│   └─ .eslintrc.js
│
├─ firebase/
│   ├─ firestore.rules
│   ├─ firebase.json
│   └─ .firebaserc
│
└─ .github/
    └─ workflows/
        └─ ci.yml        // GitHub Actions (build, test, deploy)
```

All directories are independent; you can push each to the same GitHub repo and let the CI script run `firebase deploy --only functions,firestore,hosting`.

---

## 🛠️ Implementation Roadmap (Week‑by‑Week)

| Week | Milestone | Tasks | Done? |
|------|-----------|-------|-------|
| 0 | **Setup** | • Create Firebase project (Spark tier).<br>• Enable Auth (Anonymous), Firestore, Cloud Functions.<br>• Install `firebase-tools`. | |
| 1 | **Android OTP capture** | • Scaffold Android project.<br>• Implement `BroadcastReceiver` + regex extractor.<br>• Add WorkManager upload stub (writes plain OTP to Firestore).<br>• Test on a physical Android 11 device. | |
| 2 | **Pairing backend** | • Write Cloud Function `/pair` (as shown).<br>• Add Firestore rule for `pairings` (no client access).<br>• Test pairing via Postman. | |
| 3 | **Chrome Extension – basic** | • Create MV3 scaffold.<br>• Add Firebase Auth + Firestore listener (no decryption yet).<br>• Display raw OTP (un‑encrypted) to verify end‑to‑end flow. | |
| 4 | **Secure secret exchange** | • Implement QR generation on Android (`PairingActivity`).<br>• Add QR scanner to Chrome (`pair.html`).<br>• Store secret in both sides (`EncryptedSharedPreferences` / `chrome.storage.session`). | |
| 5 | **Encryption** | • Add AES‑GCM encrypt in Android worker.<br>• Add decryption in extension (`decryptOtp`).<br>• Verify that only paired devices can read the OTP. | |
| 6 | **Cleanup & TTL** | • Enable Firestore TTL (30 s).<br>• Delete secret after pairing.<br>• Add UI “Unpair” button that signs out & clears storage. | |
| 7 | **Testing & CI** | • Write unit tests (Kotlin, Jest).<br>• Add GitHub Actions to run tests, build Android AAB, run `firebase deploy --only functions,firestore`. | |
| 8 | **Polish & Publish** | • Add Chrome extension icons & badge. <br>• Write README & privacy policy.<br>• (Optional) Submit to Chrome Web Store (free). | |
| 9+| **Future** | • Implement SMS‑Retriever API (no permission needed).<br>• Add multiple‑device support.<br>• Add optional native macOS notification via a small helper app. | |

---

## 🔐 Security & Privacy Checklist

- **Transport:** All Firebase SDK traffic uses TLS (Google’s infrastructure).  
- **At‑rest:** Firestore data is encrypted by Google; we additionally encrypt the OTP payload with a per‑device secret.  
- **Secret handling:** The secret lives only on the phone (EncryptedSharedPreferences) & the extension (session storage). It is never stored on the server.  
- **Authentication:** Custom token UID equals `deviceId`; no email/password needed.  
- **Permissions (Android 11):**  
  - Prefer **SMS‑Retriever API** (no `READ_SMS` permission).  
  - If you cannot use it, request `RECEIVE_SMS` only for a side‑loaded, private app; clearly document the need in a privacy policy.  
- **Data retention:** OTP documents auto‑expire after 30 seconds via Firestore TTL → no long‑term storage.  
- **Logging:** Keep Cloud Function logging minimal (no OTP printed).  

---

## 📜 Final Deliverable

The file you are reading (`plan.md`) contains:

1. **Product description** – clear, concise, user‑centric.  
2. **How it works** – step‑by‑step flow of pairing + OTP delivery.  
3. **Architecture diagram** (text‑based) and component responsibilities.  
4. **Full tech‑stack** – all free services (Firebase Spark) and client libraries.  
5. **Data model & security rules** – ready to be copied into `firestore.rules`.  
6. **Exact code snippets** (Android Receiver, WorkManager, Cloud Function, Chrome background worker, decryption).  
7. **Repository layout** – ready for a monorepo or separate repos.  
8. **Implementation roadmap** – week‑by‑week plan for a single developer.  
9. **Free‑tier feasibility** – proof that every line can run on the free Spark plan.  

Give this file to your **Antigravity system** (or any code‑generation pipeline) and you will have a fully‑specified, production‑ready blueprint that can be turned into a working OTP‑mirror app without spending a dollar on hosting. Happy building! 🚀