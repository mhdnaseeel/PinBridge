# 📌 PinBridge

**Get OTPs from your Android phone on your computer — instantly, securely, and automatically.**

PinBridge mirrors one-time passwords (OTPs) received via SMS on your Android device to your Chrome browser in real-time. No more switching between devices to copy verification codes.

---

## 💡 Why PinBridge?

Many users rely on a secondary phone for SIM-based OTPs, which creates real friction — especially when the device isn't nearby during urgent authentication.

> *Carrying a second phone just for OTPs is frustrating.*
> *I used to forget mine all the time — and only realize it when I urgently needed an OTP.*
>
> *So I built PinBridge.*

Now, OTPs from my secondary phone show up instantly on my laptop via a browser extension and web app.

**No switching devices. No interruptions. No stress. Just seamless authentication.**

---

## ✨ Features

- 🔄 **Real-Time OTP Sync** — OTPs appear on your browser within seconds of being received on your phone
- 🔐 **End-to-End Encryption** — All OTPs are encrypted with AES-GCM before leaving your phone
- 🌐 **Chrome Extension** — View OTPs directly in your browser with auto-fill support
- 📱 **Web Dashboard** — Access your latest OTP from any browser at [pin-bridge.vercel.app](https://pin-bridge.vercel.app)
- ☁️ **Cloud Sync** — Sign in with Google to sync pairing across devices without re-scanning QR codes
- 🟢 **Live Device Status** — See whether your phone is online, offline, or charging in real-time
- 🔔 **Desktop Notifications** — Get notified instantly when a new OTP is received
- ✍️ **Auto-Fill** — OTPs are automatically pasted into input fields on websites
- 📡 **Background Sync** — The Android app runs silently in the background, even after reboots
- 🛡️ **CAPTCHA Protection** — Accidental unpairing is prevented with a 4-digit verification code

---

## 🏗️ Architecture

```
┌──────────────┐     SMS      ┌──────────────────┐
│  SMS Sender  │ ──────────► │   Android App    │
│  (Bank etc.) │              │  (PinBridge)     │
└──────────────┘              └────────┬─────────┘
                                       │
                              AES-GCM encrypted
                                       │
                                       ▼
                              ┌──────────────────┐
                              │   Firebase Cloud  │
                              │   (Firestore)     │
                              └────────┬─────────┘
                                       │
                          ┌────────────┼────────────┐
                          │            │            │
                          ▼            ▼            ▼
                   ┌────────────┐ ┌─────────┐ ┌──────────┐
                   │  Chrome    │ │  Web    │ │ Presence │
                   │  Extension │ │ Dash.   │ │  Server  │
                   └────────────┘ └─────────┘ └──────────┘
```

---

## 📦 Project Structure

| Directory | Description |
|-----------|-------------|
| `android/` | Android app — Kotlin, Jetpack Compose, Hilt, Firebase, Socket.IO |
| `extension/` | Chrome Extension — Manifest V3, Webpack, Firebase SDK, Socket.IO |
| `web/` | Web Dashboard — Vite, Vanilla JS, Firebase SDK |
| `server/` | Presence Server — Node.js, Express, Socket.IO, Redis, Firebase Admin |
| `functions/` | Firebase Cloud Functions (reserved) |
| `e2e/` | End-to-end testing suite |
| `docs/` | Project documentation and structure logs |
| `for-execution/` | Compiled artifacts (APK, Extension ZIP) ready for deployment |
| `graphify-out/` | Generated architecture visualizations |

---

## 🚀 How It Works

### Step 1 — Sign In
Open the PinBridge Android app and sign in with your Google account. On the Chrome extension, sign in with the **same** Google account.

### Step 2 — Pair Devices
From the Chrome extension, click **Start Pairing** to generate a QR code. Scan it with the Android app, or enter the pairing code manually. The devices are now linked with a shared encryption key.

### Step 3 — Receive OTPs
When an SMS with an OTP lands on your Android phone, PinBridge:
1. **Detects** the SMS and extracts the OTP
2. **Encrypts** it with AES-256-GCM using the shared secret
3. **Uploads** the encrypted payload to Firebase Firestore
4. The Chrome extension **decrypts** and **displays** it instantly

### Step 4 — Use OTPs
- The extension shows a notification and copies the OTP
- Websites with OTP input fields get **auto-filled**
- You can also click **Fetch Latest** or **Sync Signal** to manually pull the most recent status or OTP

---

## 🔒 Security

| Layer | Technology |
|-------|-----------|
| Encryption | AES-256-GCM (end-to-end, key never sent to server) |
| Authentication | Firebase Auth with Google Sign-In |
| Storage | Firebase Firestore with security rules |
| Transport | HTTPS / WSS (TLS) |
| Local Storage | Android EncryptedSharedPreferences |

The encryption key is generated during pairing and shared only between your phone and browser via QR code. **Firebase servers never see your OTPs in plaintext.**

---

## 🛠️ Setup & Development

### Prerequisites

- Android Studio (Arctic Fox or later)
- Node.js 18+
- Chrome browser
- Firebase project with Firestore, Auth, and Functions enabled

### Android App

```bash
cd android
./gradlew assembleDebug
# Install on device
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Chrome Extension

```bash
cd extension
npm install
npm run build
# Load in Chrome:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select the extension/dist/ folder
```

### Web Dashboard

```bash
cd web
npm install
npx vite build
# Deploy to Vercel or serve locally:
npx vite
```

### Presence Server

```bash
cd server
npm install
# Configure .env with Firebase Admin credentials and Redis URL
node index.js
```

---

## 📱 Supported Platforms

| Platform | Minimum Version |
|----------|----------------|
| Android | 8.0 (API 26) |
| Chrome | 116+ (Manifest V3, Side Panel API) |
| Web | Any modern browser |

---

## 🗂️ Tech Stack

| Component | Technologies |
|-----------|-------------|
| Android | Kotlin, Jetpack Compose, Hilt, CameraX, ML Kit, WorkManager |
| Extension | JavaScript, Webpack, Firebase JS SDK, Socket.IO Client |
| Web Dashboard | Vanilla JS, Vite, Firebase JS SDK |
| Backend | Node.js, Express, Socket.IO, Redis, Firebase Admin SDK |
| Error Tracking | Sentry (Android + Extension) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Google Sign-In) |
| Hosting | Vercel (Web), Render (Presence Server) |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

© 2026 Muhammed Naseel
