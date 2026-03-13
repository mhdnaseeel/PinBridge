# PinBridge – Automated Test Plan

> This document describes how to run **all** automated tests for the PinBridge Android implementation,
> including unit tests, UI tests, WorkManager integration tests, a full end‑to‑end E2E test, and a
> Node‑script sanity check for the Cloud Function `/pair`.

## 📦 Prerequisites

| Requirement | How to satisfy |
|-------------|-----------------|
| **Java 17** | Install JDK 17 (`java -version`). |
| **Android SDK** | Android Studio Flamingo or command‑line SDK (`sdkmanager`). |
| **Gradle 8.x** | Bundled with the project (`./gradlew`). |
| **Firebase CLI** | `npm i -g firebase-tools` and run `firebase login`. |
| **Node 18+** | Used for the Cloud Function test script. |
| **Android emulator** (API 30 or higher) | Required for UI and E2E tests (ADB SMS injection). |
| **Firebase project** (Spark tier) | Create a project in the Firebase console; note the project ID (`{{FIREBASE_PROJECT_ID}}`). |

## 1️⃣ Start the Firebase emulators

```bash
cd {{REPO_ROOT}}
firebase emulators:start --only functions,firestore,auth
```

- Functions → `http://localhost:5001`
- Firestore → `http://localhost:8080`
- Auth → `http://localhost:9099`
- UI console (optional) → `http://localhost:4000`

Leave this terminal running. The Gradle task `runEmulators` will attach to it when you run Android tests.

---

## 2️⃣ Unit tests (pure JVM)

```bash
cd {{REPO_ROOT}}/android
./gradlew test
```

**Expected:**  
`CryptoUtilTest` and `ConstantsTest` pass (✔).  
If any fail, check the `CryptoUtil` implementation.

---

## 3️⃣ UI / Instrumentation tests

```bash
./gradlew connectedAndroidTest
```

**What runs:**

| Test | What it verifies |
|------|-------------------|
| `MainActivityTest` | “Show Pairing QR” button exists, launches `PairingActivity`, QR ImageView is displayed. |
| `PairingActivityTest` | QR can be decoded, JSON contains a valid UUID `deviceId` and a 256‑bit Base64 `secret`. |
| `UploadOtpWorkerTest` | Worker encrypts OTP, writes to Firestore emulator, decryption succeeds. |
| `E2ETest` | Full flow: pair → custom token → SMS injection → Firestore verification. |

**Result:** All tests should finish with `OK` and **no failures**.  
If any UI test fails, ensure the emulator screen is unlocked and the IDs in the layouts match those used in the tests.

---

## 4️⃣ WorkManager integration test (part of UI tests)

`UploadOtpWorkerTest` is executed together with `connectedAndroidTest`.  
It:

1. Writes a known secret/deviceId to `EncryptedSharedPreferences`.
2. Starts the `UploadOtpWorker`.
3. Checks that a Firestore document exists under `otps/<deviceId>`.
4. Decrypts the stored `otp` and asserts equality with the original OTP.

All steps must pass.

---

## 5️⃣ End‑to‑End (E2E) test

```bash
./gradlew connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.pinbridge.otpmirror.E2ETest
```

**Prerequisites for this test:**

- **Emulators must be running** (step 1).  
- **AVD must be an emulator**, not a physical device, because the test uses `adb -e emu sms send …`.  
- **Replace `{{FIREBASE_PROJECT_ID}}`** in `E2ETest.kt` with your actual Firebase project ID before running.

**What the test does:**

1. Launches `PairingActivity`, extracts the QR JSON, posts it to the local `/pair` function, receives a custom JWT.  
2. Signs in to Firebase Auth with that token (against the Auth emulator).  
3. Sends a fake SMS containing `123456` to the emulator.  
4. Waits for `OtpReceiver → WorkManager → Firestore` to process the message.  
5. Reads the OTP document from the Firestore emulator, decrypts it, and asserts the OTP equals `123456`.

**Expected outcome:** Test finishes with `OK`.  
If it times out, increase the `Thread.sleep` delay (currently 8 seconds) or verify the emulator can reach the emulators via `10.0.2.2`.

---

## 6️⃣ Cloud Function sanity check (`pair.test.js`)

```bash
cd {{REPO_ROOT}}/functions
node tests/pair.test.js
```

**What it checks:**  

- The Functions emulator is running (step 1).  
- Posting a random payload returns a JSON object containing a `customToken`.  

**Expected output** (example):

```
✅ Pairing succeeded – received custom token:
eyJhbGciOiJSUzI1NiIsInR5cCI6...
```

If the script exits with `❌` messages, verify that the Functions emulator is running and that `{{FIREBASE_PROJECT_ID}}` is correctly replaced.

---

## 7️⃣ Summary of commands

```bash
# 1️⃣ Emulators
firebase emulators:start --only functions,firestore,auth

# 2️⃣ Unit tests
cd android && ./gradlew test

# 3️⃣ UI & integration tests
cd android && ./gradlew connectedAndroidTest

# 4️⃣ End‑to‑End only
cd android && ./gradlew connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.pinbridge.otpmirror.E2ETest

# 5️⃣ Cloud Function sanity check
cd functions && node tests/pair.test.js
```

All commands should complete with a **green** success indicator.  

---

## 📌 What to do if something fails

| Failed test | Quick diagnosis |
|------------|-----------------|
| `CryptoUtilTest` | Verify `CryptoUtil.encrypt/decrypt` – make sure you are using the same secret bytes for both calls. |
| `MainActivityTest` / `PairingActivityTest` | Ensure the layout IDs (`btnPair`, `ivQr`) match those used in the test code. |
| `UploadOtpWorkerTest` | Check that the Firebase Emulators are reachable (`10.0.2.2`). Confirm Auth emulator is running on port 9099 and Firestore on 8080. |
| `E2ETest` | 1️⃣ Verify the emulator is **started with** `-e` (so `adb -e` works). 2️⃣ Confirm the `/pair` function URL uses the correct project ID. 3️⃣ Increase the `Thread.sleep` if the OTP upload takes longer. |
| `pair.test.js` | Make sure the Functions emulator is running (`firebase emulators:start --only functions`). Replace the placeholder project ID. |

---

## ✅ Final checklist

- **All test source files added** (unit, UI, integration, E2E).  
- **Gradle module updated** with test dependencies and `runEmulators` task.  
- **firebase.json** contains emulator configuration.  
- **Node script** (`pair.test.js`) validates the Cloud Function.  
- **TEST_PLAN.md** explains how to run everything.  

Once you run the commands above and every test reports **PASS**, the PinBridge Android implementation is verified to meet the specification. 🎉
