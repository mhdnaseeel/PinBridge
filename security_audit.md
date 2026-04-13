# PinBridge — Comprehensive Security Audit Report

**Date**: 2026-04-03  
**Auditor Role**: Senior Cybersecurity Analyst  
**Scope**: Android App, Chrome Extension (MV3), Web Dashboard, Presence Server  
**Classification**: CONFIDENTIAL — Contains credential references and vulnerability details

---

## 1. Problem Definition

PinBridge handles **one-time passwords (OTPs)** — authentication tokens that directly gate access to bank accounts, email, and other high-value targets. Any compromise in the chain (interception, replay, exfiltration, or unauthorized access) constitutes a **critical authentication bypass** for any service the user protects with SMS 2FA.

The threat surface is unusually wide: the system spans a native Android app (SMS receiver + encryption), a Chrome extension (real-time listener + autofill), a web dashboard (decrypt + display), and a Node.js presence server (status relay). Each platform trusts data from the others, creating a **transitive trust chain** where a weakness in any component undermines all others.

### Attack Value
- **OTPs are high-value, short-lived secrets.** Even a 30-second interception window allows account takeover.
- **The encryption key (secret)** is long-lived and stored on all platforms. Compromise of this single key decrypts all past and future OTPs for that pairing.
- **Firebase credentials** are embedded in client code. While API keys are designed to be public, the combination of API key + project access can be exploited if Firestore rules are weak.

---

## 2. Assumptions & Unknowns

### Assumptions
| # | Assumption | Risk if Wrong |
|---|-----------|---------------|
| A1 | Firebase Auth is the only access control layer (no server-side middleware beyond Socket.IO auth) | If Firebase rules have gaps, there is no secondary defense |
| A2 | The AES-256 encryption key (`secret`) is generated with CSPRNG (`crypto.getRandomValues`) | If PRNG is weak, all OTP encryption is broken |
| A3 | The presence server is the only server-side component (no Firebase Functions actively processing OTPs) | If functions exist but were not audited, there may be unreviewed logic |
| A4 | Users pair one device to one extension. Multi-device/multi-extension is not officially supported. | If users attempt multi-pairing, race conditions and data overwrites can occur |
| A5 | The Android app is not distributed via sideloading or untrusted sources | If sideloaded, certificate pinning and integrity checks become critical |

### Unknowns (Flagged for Investigation)
| # | Unknown | Potential Impact |
|---|---------|-----------------|
| U1 | **Has the Firebase Admin SDK key been rotated** since it was committed to Git? | If not rotated, anyone with repo access has full admin access to Firebase |
| U2 | **Firebase App Check** — is it enabled? | Without it, any client can impersonate the app and access Firestore/Auth |
| U3 | **Render deployment secrets** — are environment variables (Redis URL, Firebase service account) encrypted at rest? | If Render's env var storage is compromised, all server-side secrets are exposed |
| U4 | **SSL certificate pinning** — does the Android app pin certificates for the presence server? | Without pinning, MITM attacks on the socket connection are trivial |
| U5 | **ProGuard/R8 obfuscation** — is the release build obfuscated? | Without obfuscation, reverse engineering the APK reveals the entire codebase |
| U6 | **Chrome Web Store review status** — has the extension been reviewed/approved? | Extensions with `identity`, `sidePanel`, and broad content scripts face scrutiny |

---

## 3. Technical Breakdown

### 3.1 Vulnerability Matrix

| ID | Vulnerability | CVSS 3.1 | Platform | Status |
|----|--------------|----------|----------|--------|
| **V-01** | AES encryption key stored in `localStorage` (plaintext) | **9.1 Critical** | Web | 🔴 Open |
| **V-02** | `postMessage('*')` — no origin validation on sends | **8.1 High** | Extension, Web | 🔴 Open |
| **V-03** | `postMessage` receiver accepts any `source: 'pinbridge-extension'` | **8.1 High** | Web | 🔴 Open |
| **V-04** | QR code contains plaintext encryption key | **7.5 High** | Extension, Android | 🔴 Open |
| **V-05** | `android:allowBackup="true"` — credential extraction via ADB | **7.4 High** | Android | 🔴 Open |
| **V-06** | OTP displayed in Chrome notification (visible on lock screen) | **7.2 High** | Extension | 🔴 Open |
| **V-07** | `innerHTML` injection with user-controlled data (`state.error`, `googleEmail`) | **7.0 High** | Web, Extension | 🔴 Open |
| **V-08** | CORS `origin: "*"` on Socket.IO server | **6.8 Medium** | Server | 🔴 Open |
| **V-09** | ~~Sentry DSN exposed in client code — event injection~~ | **5.3 Medium** | All | ✅ Resolved (Sentry removed) |
| **V-10** | No rate limiting on pairing code attempts | **6.5 Medium** | Extension, Firestore | 🔴 Open |
| **V-11** | `OtpReceiver` exported with priority 999 — intent spoofing | **6.1 Medium** | Android | 🔴 Open |
| **V-12** | No Firebase App Check — API abuse possible | **6.0 Medium** | All | 🔴 Open |
| **V-13** | Firestore rules allow OTP writes for any authenticated user | **5.9 Medium** | Firestore | 🔴 Open |
| **V-14** | ~~`sendDefaultPii: true` in Sentry — leaks user data~~ | **5.3 Medium** | All | ✅ Resolved (Sentry removed) |
| **V-15** | OTP doc `expiresAt` is set but never enforced | **4.3 Medium** | Firestore | 🔴 Open |
| **V-16** | ~~`tracesSampleRate: 1.0` — performance data leakage to Sentry~~ | **3.7 Low** | All | ✅ Resolved (Sentry removed) |
| **V-17** | No network security config — cleartext traffic not explicitly blocked | **3.5 Low** | Android | 🔴 Open |
| **V-18** | ~~Sentry `attach-screenshot` and `attach-view-hierarchy` enabled~~ | **4.5 Medium** | Android | ✅ Resolved (Sentry removed) |
| **V-19** | Secret embedded in Firestore pairing document | **6.5 Medium** | Firestore | 🔴 Open |
| **V-20** | Content script error suppression hides security errors | **3.1 Low** | Extension | 🔴 Open |

---

### 3.2 Detailed Vulnerability Analysis

---

#### V-01: AES Encryption Key in localStorage (CRITICAL)

**Location**: [web/main.js:54](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L54), [web/main.js:84-85](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L84-L85)

```javascript
secret: localStorage.getItem('secret'),
// ...
localStorage.setItem('secret', s);
```

**Attack scenario**: 
1. Any JavaScript running in the same origin (XSS, third-party script, browser extension, or DevTools) can read `localStorage.getItem('secret')`.
2. The secret is the AES-256-GCM key. With it, an attacker can decrypt all OTPs (past and future) by reading the `otps/{deviceId}` Firestore document.
3. Combined with V-07 (innerHTML injection), a successful XSS attack immediately compromises all OTPs.

**Evidence**: The secret is stored in 9 separate `localStorage` calls across `web/main.js`. It is also passed via URL parameters (`?d=DEVICE_ID&s=SECRET` on line 76-85), which means it may appear in browser history, server logs, and referrer headers.

**Remediation**:
```javascript
// Option A: Use sessionStorage (cleared when tab closes)
sessionStorage.setItem('secret', s);

// Option B: Use IndexedDB with a worker-only context (not accessible from page JS)

// Option C: Hold the secret in a JavaScript closure/variable only — never persist
// This is the most secure approach for short sessions
```

**Priority**: 🔴 **P0** — This is the single highest-impact vulnerability. The encryption key is the crown jewel.

---

#### V-02 / V-03: Cross-Origin postMessage Vulnerabilities (HIGH)

**Location**: 
- [extension/src/content.js:34](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/content.js#L34), [content.js:52](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/content.js#L52), [content.js:60](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/content.js#L60), [content.js:80](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/content.js#L80)
- [web/main.js:489](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L489), [main.js:733](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L733)
- [web/main.js:565](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L565) (receiver)

**Attack scenario (Sender — V-02)**:
```javascript
// content.js sends secret to ANY origin:
window.postMessage({ 
    source: 'pinbridge-extension', 
    action: 'SYNC', 
    deviceId: changes.pairedDeviceId.newValue,
    secret: data.secret  // ← THE ENCRYPTION KEY
}, '*');  // ← '*' means ANY listening window gets this
```

If the user has the dashboard open in an iframe, or if a malicious page opens the dashboard in a popup, the `secret` is broadcast to that context.

**Attack scenario (Receiver — V-03)**:
```javascript
// web/main.js:565 — accepts messages from ANY source
window.addEventListener('message', (e) => {
    if (e.data && e.data.source === 'pinbridge-extension') {
        if (e.data.action === 'SYNC') {
            localStorage.setItem('pairedDeviceId', e.data.deviceId);
            localStorage.setItem('secret', e.data.secret);
```

Any page can send `{ source: 'pinbridge-extension', action: 'SYNC', deviceId: 'attacker-device', secret: 'attacker-secret' }` to the dashboard. This overwrites the real pairing with an attacker-controlled device ID. Future OTPs would then be encrypted with the attacker's key and sent to the attacker's Firestore document.

**Remediation**:
```javascript
// SENDER: Specify exact origin
const DASHBOARD_ORIGIN = 'https://pin-bridge.vercel.app';
window.postMessage({ ... }, DASHBOARD_ORIGIN);

// RECEIVER: Validate origin AND source
window.addEventListener('message', (e) => {
    const ALLOWED_ORIGINS = [
        'https://pin-bridge.vercel.app',
        'https://pinbridge-61dd4.web.app',
        'https://pinbridge-61dd4.firebaseapp.com'
    ];
    if (!ALLOWED_ORIGINS.includes(e.origin)) return;
    if (e.data?.source !== 'pinbridge-extension') return;
    // Now safe to process
});
```

**Priority**: 🔴 **P0** — A trivial exploit that allows pairing hijack and secret exfiltration.

---

#### V-04: QR Code Contains Plaintext Encryption Key (HIGH)

**Location**: [extension/src/pairing.js:88](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/pairing.js#L88)

```javascript
const payload = JSON.stringify({ deviceId, secret: secretB64, pairingCode });
QRCode.toCanvas(canvas, payload, ...);
```

**Attack scenario**: Anyone who photographs or screenshots the QR code has the encryption key forever. The QR is displayed for the duration of the pairing session (potentially minutes). Screen recording malware, shoulder surfing, or a colleague walking past can capture it.

**Furthermore**: The same secret is also stored in the Firestore pairing document (line 62-67):
```javascript
await setDoc(doc(db, 'pairings', deviceId), {
    secret: secretB64,  // ← Plaintext secret in Firestore
    pairingCode: pairingCode,
    googleUid: googleUid,
    ...
});
```

This means the encryption key is readable by any authenticated user via the Firestore `read` rule (which only checks `googleUid` match, not during initial creation). During the pairing window, the document has no `googleUid` match requirement for reads because the Android app hasn't paired yet.

**Remediation**: Use a Diffie-Hellman key exchange or ECDH during pairing:
1. Extension generates an ECDH key pair, encodes the public key in the QR.
2. Android app generates its own ECDH key pair, computes the shared secret.
3. Android writes its public key to Firestore.
4. Extension reads Android's public key, computes the same shared secret.
5. The shared secret is never transmitted or stored in Firestore.

**Shorter-term fix**: Delete the `secret` field from the Firestore document after pairing completes (in `completePairing()`).

**Priority**: 🟡 **P1** — Requires architectural change, but the current approach leaks the key through multiple channels.

---

#### V-05: `allowBackup="true"` — ADB Credential Extraction (HIGH)

**Location**: [AndroidManifest.xml:19](file:///Users/muhammednaseel/Desktop/Project/PinBridge/android/app/src/main/AndroidManifest.xml)

```xml
android:allowBackup="true"
```

**Attack scenario**: An attacker with physical access to the device (or ADB access in development mode) can extract the app's data via:
```bash
adb backup -apk com.pinbridge.otpmirror
```

This extracts `EncryptedSharedPreferences`, which contains the AES encryption key and device ID. While EncryptedSharedPreferences uses the Android Keystore for key management, the backup file itself can be restored to another device where the key material may be accessible.

**Remediation**:
```xml
<application
    android:allowBackup="false"
    android:fullBackupContent="false"
    android:dataExtractionRules="@xml/data_extraction_rules">
```

Create `res/xml/data_extraction_rules.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="sharedpref" path="."/>
    </cloud-backup>
    <device-transfer>
        <exclude domain="sharedpref" path="."/>
    </device-transfer>
</data-extraction-rules>
```

**Priority**: 🔴 **P0** — Trivial to exploit on any unlocked device with Developer Options enabled.

---

#### V-06: OTP in Chrome Notification (HIGH)

**Location**: [extension/src/background.js:425-431](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/background.js#L425-L431)

```javascript
chrome.notifications.create({
    type: 'basic',
    title: 'New OTP Received',
    message: `Your OTP is: ${decrypted}`,  // ← Plaintext OTP
    priority: 2
});
```

**Attack scenario**: 
- On macOS/Windows, Chrome notifications appear on the lock screen by default.
- Notifications are logged in the OS notification center (accessible even after dismissal).
- Screen recording or screenshots capture the notification content.
- Nearby observers can read the OTP from the notification banner.

**Remediation**:
```javascript
chrome.notifications.create({
    type: 'basic',
    title: 'PinBridge',
    message: 'New verification code received. Click to view.',
    priority: 2
});
// Show the OTP only in the popup when the user explicitly clicks
```

**Priority**: 🔴 **P0** — Defeats the purpose of 2FA. The OTP is shown in plaintext on potentially locked screens.

---

#### V-07: innerHTML Injection (DOM-Based XSS) (HIGH)

**Location**: 
- [web/main.js:223](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L223): `${state.error}` injected into `innerHTML`
- [web/main.js:247](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L247), [319](file:///Users/muhammednaseel/Desktop/Project/PinBridge/web/main.js#L319): `${state.user?.email}` injected into `innerHTML`
- [extension/src/popup.js:169](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/popup.js#L169): `${googleEmail}` injected into `innerHTML`

**Attack scenario**: If a Firebase Auth error message or Google email address contains HTML/JavaScript (unlikely for email, but possible for error messages), it will be rendered as HTML. For `state.error`, the code path is:
```javascript
state.error = `Sign-in failed: ${err.code || err.message}`;
// Later:
appDiv.innerHTML = `... ${state.error ? `<p class="auth-error">${state.error}</p>` : ''} ...`;
```

If `err.message` contains `<img src=x onerror="alert(document.cookie)">`, it executes.

**Remediation**:
```javascript
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// Use:
`<p class="auth-error">${escapeHtml(state.error)}</p>`
```

Or switch to `textContent` for all user-derived values.

**Priority**: 🔴 **P0** — Combined with V-01, a successful XSS exfiltrates the encryption key.

---

#### V-08: CORS Wide Open on Presence Server (MEDIUM-HIGH)

**Location**: [server/index.js:32-35](file:///Users/muhammednaseel/Desktop/Project/PinBridge/server/index.js#L32-L35)

```javascript
const io = new Server(server, {
    cors: {
        origin: "*",       // ← Any website can connect
        methods: ["GET", "POST"]
    }
});
```

**Attack scenario**: A malicious website includes a Socket.IO client pointing to `pinbridge-presence.onrender.com`. If it has a valid Firebase token (e.g., from a user who signed in on the attacker's site), it can:
1. Join `room:{deviceId}` and receive real-time presence updates
2. Learn when the victim's device is online/offline
3. Infer behavioral patterns (sleep schedule, travel, etc.)

**Remediation**:
```javascript
const ALLOWED_ORIGINS = [
    'chrome-extension://YOUR_EXTENSION_ID',
    'https://pin-bridge.vercel.app',
    'https://pinbridge-61dd4.web.app',
    'https://pinbridge-61dd4.firebaseapp.com',
    'http://localhost:5173'  // dev only
];

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || ALLOWED_ORIGINS.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Origin not allowed'));
            }
        },
        methods: ["GET", "POST"]
    }
});
```

**Priority**: 🔴 **P0**

---

#### V-10: No Rate Limiting on Pairing Code Attempts (MEDIUM)

**Location**: [extension/src/pairing.js:49](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/pairing.js#L49), [android/PairingRepository.kt:143-146](file:///Users/muhammednaseel/Desktop/Project/PinBridge/android/app/src/main/java/com/pinbridge/otpmirror/data/PairingRepository.kt#L143-L146)

The 6-digit pairing code has 900,000 possible values. The Firestore query:
```kotlin
db.collection(Constants.COLL_PAIRINGS)
    .whereEqualTo("pairingCode", code)
    .limit(1)
    .get()
```

There is no rate limiting, lockout, or CAPTCHA on code entry. An attacker who knows a pairing session is active can brute-force the code at network speed.

**Calculation**: At 100 requests/second, 900,000 values → ~150 minutes to exhaust. With Firestore's 10,000 writes/day free tier, this is also a cost attack.

**Remediation**:
1. Add a `createdAt` timestamp and auto-expire pairing sessions after 5 minutes
2. Add an `attempts` counter to the pairing document; lock after 5 failed attempts
3. Consider using a longer pairing code (8+ characters with letters and numbers)
4. Implement Firestore rate limiting rules or a Cloud Function validator

**Priority**: 🟡 **P1**

---

#### V-11: Exported BroadcastReceiver with High Priority (MEDIUM)

**Location**: AndroidManifest.xml

```xml
<receiver
    android:name=".OtpReceiver"
    android:exported="true">
    <intent-filter android:priority="999">
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

**Attack scenario**: `android:exported="true"` means any app on the device can send a crafted `SMS_RECEIVED` intent to `OtpReceiver`. An attacker app could inject fake SMS messages containing arbitrary OTP codes, which would then be encrypted and uploaded as if they were real.

**Impact**: The user and their extension would receive a fake OTP. While this doesn't directly compromise accounts, it could be used in social engineering (e.g., sending a "Your bank code is XXX, please enter it now" notification).

**Remediation**:
```xml
<receiver
    android:name=".OtpReceiver"
    android:exported="true"
    android:permission="android.permission.BROADCAST_SMS">
    <intent-filter android:priority="999">
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

The `android:permission="android.permission.BROADCAST_SMS"` attribute ensures only the system telephony process (which holds this permission) can deliver SMS broadcasts to this receiver.

**Priority**: 🟡 **P1**

---

#### V-13: OTP Collection Write Rules Too Permissive (MEDIUM)

**Location**: [firestore.rules:13-17](file:///Users/muhammednaseel/Desktop/Project/PinBridge/firestore.rules#L13-L17)

```
match /otps/{deviceId} {
    // OTP docs contain AES-256-GCM encrypted ciphertext only — no secrets.
    // Ownership enforcement isn't feasible here without cross-doc lookups.
    allow read, write: if request.auth != null;
}
```

**Attack scenario**: Any authenticated user (including anonymous auth) can:
1. **Read** any device's encrypted OTPs (they're encrypted, but the ciphertext is visible)
2. **Write** to any device's OTP document — injecting a fake encrypted OTP

Combined with V-10 or a compromised pairing, an attacker who has the encryption key can read the victim's OTPs simply by querying `/otps/{deviceId}`.

**Remediation**: While cross-document lookups are not supported in Firestore rules, you can:
1. Add a `googleUid` field to OTP documents when writing them
2. Enforce `resource.data.googleUid == request.auth.uid` on reads
3. Use a Cloud Function to validate that the writer's UID matches the pairing owner

**Priority**: 🟡 **P1**

---

#### V-14: ~~`sendDefaultPii: true` in Sentry~~ (RESOLVED)

**Status**: ✅ Resolved — Sentry has been completely removed from the project. Error tracking is now handled by Firebase Crashlytics (Android) and `console.error` (Web/Extension/Server).

**Priority**: ✅ Resolved

---

#### V-17: No Network Security Config (LOW-MEDIUM)

**Location**: AndroidManifest.xml — `android:networkSecurityConfig` is absent

The app does not have a `network_security_config.xml`. On Android 9+ (API 28+), cleartext traffic is blocked by default, but:
- There is no explicit certificate pinning for `pinbridge-presence.onrender.com`
- Custom CAs installed by the user (e.g., corporate proxies) can MITM the traffic
- Debugging proxies (Charles, mitmproxy) can intercept in development

**Remediation**: Create `res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    
    <!-- Pin the presence server certificate (optional but recommended) -->
    <domain-config>
        <domain includeSubdomains="true">pinbridge-presence.onrender.com</domain>
        <pin-set>
            <pin digest="SHA-256">CERTIFICATE_HASH_HERE</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

And reference it in `AndroidManifest.xml`:
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

**Priority**: 🟢 **P2**

---

#### V-18: ~~Sentry Screenshot & View Hierarchy Capture~~ (RESOLVED)

**Status**: ✅ Resolved — Sentry has been completely removed from the project. All `io.sentry.*` meta-data entries have been removed from `AndroidManifest.xml`. Firebase Crashlytics is used instead and does not capture screenshots or view hierarchies by default.

**Priority**: ✅ Resolved

---

#### V-19: Encryption Secret Stored in Firestore (MEDIUM)

**Location**: [extension/src/pairing.js:62-63](file:///Users/muhammednaseel/Desktop/Project/PinBridge/extension/src/pairing.js#L62-L63)

```javascript
await setDoc(doc(db, 'pairings', deviceId), {
    secret: secretB64,     // ← THE ENCRYPTION KEY IN FIRESTORE
    pairingCode: pairingCode,
    googleUid: googleUid,
    ...
});
```

The AES-256 encryption key is stored in the Firestore pairing document. This means:
1. Firebase Admin SDK (server-side) has permanent access to all encryption keys
2. Any Firestore rule misconfiguration leaks the key
3. The key persists in Firestore backups/exports indefinitely
4. A compromised Firebase admin can decrypt all OTPs for all users

**Remediation**: Delete the `secret` from the Firestore document after the Android app has successfully retrieved it during pairing. The `completePairing()` method should include:
```kotlin
// After successful pairing, remove the secret from Firestore
db.collection(Constants.COLL_PAIRINGS).document(deviceId)
    .update("secret", com.google.firebase.firestore.FieldValue.delete())
    .await()
```

Long term: Implement ECDH key agreement so the secret never transits through Firestore.

**Priority**: 🟡 **P1** — Reduces the blast radius of a Firestore compromise

---

### 3.3 Cross-Platform Trust Chain Analysis

```
Extension (chrome.storage.local) ── postMessage('*') ──→ Web Dashboard (localStorage)
       │                                                        │
       │ writes secret to                                       │ reads secret from
       │ Firestore 'pairings'                                   │ localStorage
       │                                                        │
       ▼                                                        ▼
   Firestore  ←── reads secret ── Android App ── encrypts OTP ──→ Firestore 'otps'
                                                                        │
                                                                        ▼
                                                              Extension decrypts
                                                              Web Dashboard decrypts
```

**Trust chain weaknesses**:

| Link | Trust Assumption | Violation Scenario |
|------|-----------------|-------------------|
| Extension → Web | `postMessage` is delivered only to the dashboard | Any page can intercept (V-02, V-03) |
| Web → localStorage | Only PinBridge code accesses localStorage | XSS executes `localStorage.getItem('secret')` (V-01, V-07) |
| Firestore → Android | Pairing document is created by legitimate extension | Attacker creates fake pairing doc with compromised secret (V-13) |
| Android → Firestore | OTP document is accessible only to paired extension | Any authenticated user can read (V-13) |
| QR Code → Android | QR is scanned in private | Shoulder surfing captures the secret (V-04) |

---

## 4. Implementation Approach — Prioritized Remediation

### 🔴 Phase 1: Critical (Must-Fix Before Any Release)

| # | Fix | Effort | Files |
|---|-----|--------|-------|
| **S-01** | **Move secret out of localStorage** — use `sessionStorage` or in-memory only. Never persist the encryption key to disk in the web dashboard. | 1 hr | `web/main.js` |
| **S-02** | **Restrict postMessage origins** — specify exact dashboard origins in `content.js`, validate `event.origin` in `web/main.js` receiver. | 1 hr | `content.js`, `web/main.js` |
| **S-03** | **Set `allowBackup="false"`** and add `dataExtractionRules` to exclude SharedPreferences. | 15 min | `AndroidManifest.xml` |
| **S-04** | **Remove plaintext OTP from notification** — show "Code received" instead. | 15 min | `background.js` |
| **S-05** | **Escape all user-derived values in innerHTML** — sanitize `state.error`, `state.user?.email`, `googleEmail`. | 1 hr | `web/main.js`, `popup.js` |
| **S-06** | **Restrict CORS on presence server** — whitelist specific origins. | 30 min | `server/index.js` |
| **S-07** | **Rotate Firebase Admin SDK key** — generate new key, update Render env, invalidate old key in Google Cloud Console. | 30 min | Google Cloud Console |
| **S-08** | **Delete `secret` from Firestore after pairing completes** — remove the encryption key from the pairing document once both sides have it. | 30 min | `PairingRepository.kt` |

**Total Phase 1 effort: ~5 hours**

### 🟡 Phase 2: High Priority (Before Public Launch)

| # | Fix | Effort | Files |
|---|-----|--------|-------|
| **S-09** | **Add pairing session expiry** — auto-delete pairing docs older than 5 minutes via Firestore TTL or Cloud Function. | 2 hrs | Firestore config, `pairing.js` |
| **S-10** | **Add rate limiting on pairing code attempts** — lock after 5 failures. | 2 hrs | `PairingRepository.kt`, Firestore rules |
| **S-11** | **Protect OtpReceiver** — add `android:permission="android.permission.BROADCAST_SMS"`. | 5 min | `AndroidManifest.xml` |
| **S-12** | ~~Set `sendDefaultPii: false`~~ | ✅ Done | Sentry removed entirely |
| **S-13** | ~~Disable Sentry screenshot/view-hierarchy~~ | ✅ Done | Sentry removed entirely |
| **S-14** | ~~Reduce `tracesSampleRate` to 0.1~~ | ✅ Done | Sentry removed entirely |
| **S-15** | **Add network security config** — block cleartext, consider cert pinning. | 30 min | `network_security_config.xml`, `AndroidManifest.xml` |
| **S-16** | **Add `googleUid` to OTP documents** and restrict reads to owner. | 1 hr | `OtpUploader.kt`, `UploadOtpWorker.kt`, `firestore.rules` |
| **S-17** | **Enable Firebase App Check** — enforce attestation for Firestore and Auth access. | 2-3 hrs | Firebase Console, Android, Extension, Web |

**Total Phase 2 effort: ~9 hours**

### 🟢 Phase 3: Hardening (Post-Launch)

| # | Fix | Effort |
|---|-----|--------|
| **S-18** | Implement ECDH key agreement for pairing (eliminate plaintext secret in QR and Firestore) | 1-2 days |
| **S-19** | Add Helmet.js to Express server for HTTP security headers | 30 min |
| **S-20** | Fix content script error suppression — log to `console.error` instead of silencing | 30 min |
| **S-21** | Implement key rotation mechanism (periodic re-keying of the AES secret) | 1-2 days |
| **S-22** | Add Android SafetyNet/Play Integrity attestation before allowing pairing | 4-6 hrs |
| **S-23** | ~~Implement Sentry DSN proxy~~ — N/A, Sentry removed | ✅ Done |
| **S-24** | R8/ProGuard obfuscation verification for release builds | 1 hr |

---

## 5. Edge Cases & Risks

### Attack Trees

#### Attack Tree 1: OTP Theft via Web Dashboard XSS
```
Goal: Steal user's OTPs
├── 1. Find XSS vector in web dashboard
│   ├── 1a. Inject via state.error (error message from Firebase Auth)
│   └── 1b. Inject via user email (unlikely but possible with custom domains)
├── 2. Execute: localStorage.getItem('secret')
├── 3. Read deviceId from localStorage
├── 4. Connect to Firestore as authenticated user
├── 5. Read /otps/{deviceId} — get encrypted OTP
└── 6. Decrypt with stolen secret → plaintext OTP
```

#### Attack Tree 2: Pairing Hijack via postMessage
```
Goal: Redirect OTPs to attacker's device
├── 1. Open victim's dashboard in an iframe or popup
├── 2. Send crafted postMessage:
│   {source: 'pinbridge-extension', action: 'SYNC', 
│    deviceId: 'attacker-device', secret: 'attacker-key'}
├── 3. Dashboard overwrites localStorage with attacker's credentials
├── 4. Dashboard starts listening to attacker's Firestore document
└── 5. Victim sees no OTPs (they go to attacker's device)
    └── 5a. Attacker receives all future OTPs
```

#### Attack Tree 3: Physical Device Compromise
```
Goal: Extract encryption key from Android device
├── 1. Enable ADB on unlocked device
├── 2. Run: adb backup com.pinbridge.otpmirror (allowBackup=true)
├── 3. Extract SharedPreferences from backup
├── 4. EncryptedSharedPreferences is backed up with key material
├── 5. Restore to attacker device
└── 6. Read hcpdevice_id and secret → decrypt all OTPs
```

### Emergent Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Credential Re-use** | If the Firebase Admin SDK key is still the one that was committed to Git, anyone with access to the repo's Git history has full admin access | Rotate immediately (S-07) |
| **Render Free Tier** | Render's free tier suspends containers after inactivity. During suspension, the in-memory `lastHeartbeatMap` is lost, causing all devices to appear offline | Migrate watchdog to Redis key expiry |
| **Chrome MV3 Service Worker Lifecycle** | The background.js service worker is terminated after inactivity. Firestore `onSnapshot` listeners are lost. On restart, `onInstalled` re-establishes them, but there's a window where OTPs are missed | Use `chrome.alarms` for periodic keepalive |
| **OTP Replay** | Once an OTP is stored in Firestore, it stays until overwritten by the next OTP. If an attacker reads the encrypted OTP and later obtains the key, they can decrypt it retroactively | Implement OTP document TTL enforcement (delete after 10 minutes) |
| **Multi-Tab Dashboard** | Multiple dashboard tabs create multiple Socket.IO connections and Firestore listeners, amplifying cost and creating race conditions | Implement `BroadcastChannel` or `SharedWorker` for tab coordination |

---

## 6. Optional Improvements

### Security Architecture Improvements
1. **Zero-knowledge architecture**: Move to a model where the server never has access to the encryption key, even theoretically. Implement ECDH key exchange so the secret is derived independently on both endpoints.

2. **End-to-end encryption verification**: Show a "security code" (hash of the shared secret) on both devices so users can visually verify they have the same key (similar to Signal's safety numbers).

3. **Content Security Policy (CSP)**: Add strict CSP to the web dashboard's `index.html`:
   ```html
   <meta http-equiv="Content-Security-Policy" 
         content="default-src 'self'; 
                  connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://pinbridge-presence.onrender.com wss://pinbridge-presence.onrender.com; 
                  script-src 'self'; 
                  style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; 
                  font-src 'self' https://fonts.gstatic.com;
                  img-src 'self' data: https://www.gstatic.com;">
   ```

4. **Subresource Integrity (SRI)**: Pin the hash of external resources (Google Fonts, Firebase SDK) to prevent CDN supply-chain attacks.

5. **WebAuthn for unpair verification**: Replace the CAPTCHA-style unpair dialog with WebAuthn/biometric authentication for higher assurance.

### Monitoring & Detection
1. **Firestore audit logging**: Enable Cloud Audit Logs for Firestore to detect unauthorized access patterns.
2. **Anomaly detection**: Alert on unusual patterns — e.g., OTP reads from unexpected IP addresses, multiple failed pairing attempts, or access from new geographic locations.
3. **Secret rotation alerting**: Alert if a pairing's secret hasn't been rotated in >30 days.

### Compliance Considerations
- **GDPR**: OTPs may contain or be associated with personal data. Implement data retention policies and right-to-erasure mechanisms.
- **PCI DSS**: If OTPs are used for financial services, the system may need to comply with PCI DSS requirements for storing authentication factors.
- **SOC 2**: If targeting enterprise users, implement formal access controls, audit trails, and incident response procedures.

---

## Summary

The system has a **sound cryptographic foundation** (AES-256-GCM with CSPRNG) but suffers from **trust boundary violations** that undermine the encryption:

| Severity | Count | Key Theme |
|----------|-------|-----------|
| 🔴 Critical | 3 | Secret exposure (localStorage, postMessage, QR code) |
| 🟠 High | 5 | XSS vectors, backup exposure, notification leakage |
| 🟡 Medium | 4 | CORS, rate limiting, Firestore rules |
| 🟢 Low | 4 | Network config, error suppression, sample rates |

**The most urgent finding**: The AES encryption key — the single piece of data that protects all OTPs — is exposed through at least 5 different channels: `localStorage`, `postMessage`, QR code, Firestore document, and URL parameters. Addressing these 5 exposure vectors (Phase 1) should be the immediate priority before any public release.

---

*End of Security Audit Report*
