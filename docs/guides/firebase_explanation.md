# How Firebase Works in PinBridge

Firebase is the core infrastructure of PinBridge. While Socket.IO provides "live" status updates, Firebase provides the **secure database**, **identity management**, and **message delivery system**.

---

## 1. Firebase Authentication (The Identity Layer)

PinBridge uses a hybrid authentication model across its components:

### Android App
- **Anonymous Auth:** Often signs in with an anonymous UID to establish a unique identity without requiring a Google login immediately.
- **Google Auth:** Optionally signs in with Google to sync pairing data to the cloud.
- **Purpose:** Every Firestore write from the phone is tagged with a `uid`, which is used for security rule validation.

### Chrome Extension & Web Dashboard
- **Google Sign-In:** The primary way users access their dashboard. 
- **Purpose:** By signing in with the same Google account on the browser as on the phone, the system can "link" them automatically via Cloud Sync.

### Presence Server
- **Admin SDK:** Does not "sign in." Instead, it uses a Service Account key to verify the ID tokens sent by the clients via Socket.IO.

---

## 2. Cloud Firestore (The Database Layer)

Firestore stores all persistent data. It is structured into three main collections:

### A. `pairings` Collection
Stores the "handshake" between your phone and browser.
- **Path:** `pairings/{deviceId}`
- **Fields:**
    - `googleUid`: The owner's Google UID (links the pairing to a human).
    - `secret`: A hashed or encrypted version of the pairing secret (never stored in plaintext).
    - `status`: `'online'` or `'offline'`.
    - `lastOnline`: Timestamp of the last activity.
    - `paired`: Boolean flag indicating if the link is active.
    - `batteryLevel`: Last known percentage.

### B. `otps` Collection
The "inbox" for your verification codes.
- **Path:** `otps/{deviceId}`
- **Fields:**
    - `otp`: The **encrypted** ciphertext of the verification code.
    - `iv`: The initialization vector used for AES-GCM encryption.
    - `smsTs`: The original timestamp of the SMS message.
    - `uploaderUid`: The UID of the device that uploaded it.

### C. `users` Collection (Cloud Sync)
Enables "Login and it works" across multiple browsers.
- **Path:** `users/{googleUid}/mirroring/active`
- **Fields:**
    - `deviceId`: The ID of the paired phone.
    - `secret`: The pairing secret (encrypted/stored for sync).
- **Benefit:** If you log into the web dashboard on a new computer, it reads this document and immediately knows which device to listen to.

---

## 3. Firestore Security Rules

The `firestore.rules` file ensures that nobody can steal your OTPs, even if they know your `deviceId`.

### Protecting OTPs
```javascript
match /otps/{deviceId} {
  // Anyone can write (so the Android app can upload)
  allow write: if request.auth != null;
  
  // ONLY the owner can read
  allow read: if request.auth != null
    && (resource.data.uploaderUid == request.auth.uid // The uploader
        || get(/pairings/$(deviceId)).data.googleUid == request.auth.uid); // The owner
}
```

### Protecting Pairings
- Users can only edit their own pairing documents.
- A "lock" mechanism prevents anyone from changing the `googleUid` once it's set, preventing "hijacking" of a device.

---

## 4. End-to-End Encryption (E2EE)

This is the most critical part of how Firebase is used. **Firebase is "blind" to your OTPs.**

1. **Android Phone:** Receives SMS → Encrypts it using `AES-256-GCM` with a 32-byte secret key.
2. **Firebase:** Stores the encrypted string (ciphertext).
3. **Browser:** Listens for the update → Receives the ciphertext → Decrypts it using the **same secret key**.

> [!IMPORTANT]
> Because the secret key is only stored on the **Phone** and the **Browser** (and never sent to Firebase in plaintext), even a Google employee with access to the database cannot read your OTPs.

---

## 5. Firebase App Check

The web dashboard uses **App Check with reCAPTCHA v3**. 
- **Purpose:** It verifies that requests coming to Firebase are actually coming from your official PinBridge website and not from a malicious script or bot.
- **Configuration:** Initialized in `web/main.js` using `ReCaptchaV3Provider`.

---

## 6. Summary: The Firebase Lifecycle

| Action | Component | Firebase Service |
|:---|:---|:---|
| **Start Pairing** | Android | Auth (Sign In) |
| **Generate QR** | Extension | Auth (Google Sign In) |
| **Scan QR** | Android | Firestore (Write to `pairings`) |
| **Sync to Web** | Web | Firestore (Read from `users`) |
| **SMS Arrives** | Android | Firestore (Write to `otps`) |
| **OTP Display** | Browser | Firestore (Listener on `otps`) |
| **Watchdog** | Server | Admin SDK (Token Verify) |

---

## 7. Key Timing & Behavior
- **Real-time Listeners:** Browser components use `onSnapshot()` to get sub-second updates from Firestore.
- **Offline Persistence:** If the browser is offline, Firestore caches the last known OTPs and syncs them automatically as soon as the connection returns.
- **TTL (Time to Live):** The presence server runs a background task to delete documents from the `otps` collection after they expire, keeping the database clean.
