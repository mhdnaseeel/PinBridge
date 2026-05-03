# PinBridge Runbook & Operations Guide

This runbook outlines the standard operating procedures, known issues, and recovery paths for the **PinBridge Pilot Phase (2-5 Users)**. 

---

## 1. Environment Topology

### Infrastructure
- **Frontend / Dashboard:** Hosted on Firebase Hosting (`pinbridge-*-web.app`)
- **Backend / Presence Server:** Hosted on Render (Node.js/Socket.io)
- **Database:** Firebase Firestore
- **Mobile Client:** Android Application (API 26+)
- **Browser Client:** Chrome Extension (MV3)

---

## 2. Deployment Procedures

### Web Dashboard
```bash
cd web
npm run build
firebase deploy --only hosting
```

### Presence Server (Render)
Pushes to the `main` branch automatically trigger a Render deployment.
**Important:** If you change the Firebase Admin SDK Service Account JSON, you must manually update the `FIREBASE_SERVICE_ACCOUNT` environment variable in the Render Dashboard and trigger a manual redeploy.

### Android Application
1. Update `versionCode` and `versionName` in `android/app/build.gradle.kts`
2. Build via UI: `Build > Generate Signed Bundle / APK` -> `release` variant.
*(The release variant automatically enables R8 Minification and Resource Shrinking to remove debug logs and minimize footprint).*

---

## 3. Recovery & Rollback

### Vercel / Firebase Hosting Rollback
If a frontend change introduces a critical visual bug or breaks App Check configurations:
1. Open the Firebase Console > **Hosting**.
2. Locate the "Release History" table.
3. Click the three dots on the last known stable release and select **Rollback**.

### Node.js Presence Server Rollback
If socket connections drop consistently or TTL cleanup causes unexpected deletions:
1. Open Render Dashboard -> PinBridge Server.
2. Go to **Events** -> find the last successful deploy commit.
3. Use the **Rollback** button next to that specific deployment.

### Firestore Rules Rollback
If Firestore documents are rejecting legitimate writes (Permission Denied):
1. In Firebase Console, go to **Firestore Database** -> **Rules**.
2. You can revert to previous rule configurations via the `History` tab.

---

## 4. Monitoring & Observability

### Firebase Crashlytics (Android)
All unexpected crashes on Android are captured by Firebase Crashlytics and visible in the Firebase Console under Release & Monitor → Crashlytics.

### Crashlytics (Android)
If the Android app crashes natively (e.g. `NullPointerException` during intent broadcasts or out-of-memory errors), the stack trace is automatically visible in the **Firebase Console > Crashlytics** tab. 

### Server Operations (The TTL "Sweep")
The current backend is configured with a 10-minute Chron loop that sweeps the `otps` structure in Firestore for any document where the `expiresAt` timestamp is older than the current time. Do not panic if OTP objects "disappear" from Firestore after 10 minutes—this is the intended zero-trust TTL design.

---

## 5. Known Issues & Edge Cases

*   **Render Cold Starts:** The free instance on Render puts the server to sleep after 15 minutes of inactivity. When the very first user connects, they may be stuck in the "Connecting..." state for up to roughly 45 seconds while the instance wakes up.
*   **Missing ReCAPTCHA v3 Key:** The web dashboard currently has a placeholder `YOUR_RECAPTCHA_SITE_KEY` integrated with the App Check SDK. Until a valid Google reCAPTCHA v3 key is placed there and deployed, any attempts to **enforce** App Check within the Firebase Console will lock out valid users.
*   **Android App Backgrounding:** Some specific device manufacturers (e.g. Xiaomi, Huawei) aggressively kill background intent listeners. If OTP mirroring stops working, advise the user to check their device's Battery Optimization settings and explicitly allow PinBridge to run unrestrained.
