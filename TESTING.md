# PinBridge - Testing & Verification Guide

This guide ensures the end-to-end functionality of PinBridge is verified on physical hardware before deployment.

## 🛠 Prerequisites
- 📱 A physical Android device (API 26+) with a SIM card.
- 💻 A computer with the Chrome extension installed.
- 🔥 A Firebase project with Firestore and Anonymous Auth enabled.

---

## 🧪 Test Cases

### 1. Initial Pairing (Happy Path)
1.  Open the Chrome extension and click **"Pair New Device"**.
2.  Verify a QR code and a 6-digit numeric code are displayed.
3.  Open the PinBridge app on Android.
4.  Allow **Camera** and **SMS** permissions.
5.  Scan the QR code from the browser.
6.  **Expected Result**: The Android app should show "Paired" and finish the scanner activity. The Browser extension should show "Connected".

### 2. Manual Pairing Fallback
1.  On the Android scanner screen, click **"Enter Code Manually"**.
2.  Type the 6-digit code shown in the browser.
3.  Click **"Confirm Code"**.
4.  **Expected Result**: Successful pairing and navigation back to the main screen.

### 3. OTP Mirroring (Real Hardware)
1.  With the device paired, send an SMS to the Android phone containing: `Your verification code is 123456`.
2.  Observe the Android notification area or logs for `UploadOtpWorker` execution.
3.  Check the Chrome extension popup.
4.  **Expected Result**: The code `123456` should appear in the extension with the correct timestamp within 2-5 seconds.

### 4. Encryption Verification
1.  Open the **Firebase Console > Firestore**.
2.  Locate the document under `/otps/{deviceId}`.
3.  Verify the `otp` field contains a long Base64 string (encrypted) and NOT the plaintext code.
4.  **Expected Result**: Data is unintelligible in the database, confirming E2E encryption.

### 5. TTL / Auto-Cleanup
1.  Wait for 60 seconds after an OTP is mirrored.
2.  Check the Firestore document again.
3.  **Expected Result**: The document should be deleted (if TTL rules are active) or the extension should stop displaying it if it has "Expired".

---

## 🚨 Troubleshooting
- **No SMS detected**: Ensure the app is NOT the default SMS app; it must listen as a secondary receiver.
- **Pairing Fails**: Check if the device has internet access and if the Firebase region is correct.
- **R8 Issues**: If the release build crashes, check `proguard-rules.pro` for Hilt missing rules.
