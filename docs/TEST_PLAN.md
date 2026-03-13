# PinBridge – Automated Test Plan

## 1️⃣ Start the Firebase Emulators
```bash
firebase emulators:start --only functions,firestore,auth
```
- Functions → http://localhost:5001  
- Firestore → http://localhost:8080  
- Auth → http://localhost:9099  

Leave this terminal running; the Gradle `runEmulators` task will attach to it when you run the Android tests.

## 2️⃣ Unit Tests (pure JVM)
```bash
./gradlew test
```
*Expect:* All JUnit tests (`CryptoUtilTest`, `ConstantsTest`) PASS.

## 3️⃣ Instrumentation / UI Tests
```bash
./gradlew connectedAndroidTest
```
*What runs:*  
- `MainActivityTest` – verifies the “Show Pairing QR” button and QR display.  
- `PairingActivityTest` – decodes the QR and checks JSON fields.  

*Result:* PASS = UI renders QR, QR contains valid `deviceId` and `secret`.

## 4️⃣ WorkManager / Firestore Integration Test
```bash
./gradlew test --tests "com.pinbridge.otpmirror.UploadOtpWorkerTest"
```
*What it does:*  
- Uses the Firestore emulator (host 10.0.2.2:8080).  
- Checks that after the worker finishes a document `otps/test‑uid` exists with correctly encrypted data that can be decrypted back to the original OTP.

## 5️⃣ End‑to‑End Flow (E2E)
```bash
./gradlew connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.pinbridge.otpmirror.E2ETest
```
*Execution steps:*  
1. Launches the app → extracts QR → POSTs to the local `/pair` function.  
2. Signs in with the returned custom token.  
3. Sends a fake SMS (via `adb -e emu sms send …`).  
4. Waits for the WorkManager to upload.  
5. Queries the Firestore emulator and verifies decrypted OTP = `123456`.

*Result:* PASS = whole pipeline works end‑to‑end.

## 6️⃣ Cloud Function Direct Test
```bash
cd functions
node tests/pair.test.js
```
*Result:* Should print a ✅ and a custom JWT token.

---

### Expected Outcomes Summary

| Test suite                     | Expected result |
|--------------------------------|-----------------|
| `./gradlew test` (unit)       | All tests PASS |
| `./gradlew connectedAndroidTest` (UI) | All UI & QR tests PASS |
| `UploadOtpWorkerTest` (integration) | Document created, decrypts correctly |
| `E2ETest` (full flow)        | OTP `123456` appears in Firestore and decrypts correctly |
| `pair.test.js` (Node)          | Returns a JWT custom token |

---

### Helpful Commands for Manual Checks

* **Inject a test SMS into the emulator**:
  ```bash
  adb -e emu sms send +15551234567 "Your PinBridge verification code is 123456"
  ```

* **Inspect Firestore emulator data**:
  ```bash
  curl http://localhost:8080/emulator/v1/projects/{{FIREBASE_PROJECT_ID}}/databases/(default)/documents/otps
  ```

* **View emulator UI** at `http://localhost:4000`.
