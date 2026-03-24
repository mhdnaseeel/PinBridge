# PinBridge – New Pairing Flow (Mac → Android)

## 🏁 Overview
The pairing process has been optimized to start from your Mac. You can now generate a QR code on your browser and scan it with your phone for a seamless setup.

## 📦 Components Involved:
1. **Chrome Extension (Mac)**: Generates the pairing credentials.
2. **Android App (Phone)**: Scans or enters the credentials.
3. **Cloud Functions (Backend)**: Verifies the pairing and issues security tokens.

---

## 🛠 Step-by-Step Flow

### 1. Initiate on Mac
- Click the PinBridge icon in your Chrome toolbar.
- Click the **"Start Pairing (Mac → Phone)"** button.
- A new tab will open showing:
  - 📱 A **QR Code**
  - 🔢 A **6-digit Manual Code**

### 2. Connect via Phone
**Option A: QR Scan (Recommended)**
- Open the PinBridge app and tap **"Start Pairing"**.
- Grant camera permission if requested.
- Point your phone camera at the QR code on your Mac screen.
- The app will automatically pair and authenticate.

**Option B: Manual Entry (Fallback)**
- If scanning fails, tap **"Enter Code Manually"** on the phone screen.
- Type the 6-digit code shown on your Mac and press **Confirm**.

### 3. Verification
- Once paired, the phone will display **"Authenticated"**.
- The extension popup will show **"Connected"**.

---

## 🔒 Security Notes
- **Temporary Sessions**: Pairing sessions in Firestore are short-lived and deleted immediately after a successful pairing.
- **One-time Secret**: The pairing secret is rotated every time you click "Start Pairing".
- **Encrypted Storage**: Credentials on Android are stored using `EncryptedSharedPreferences` (AES-256-GCM).

## 🎨 Asset Customization
- **Android Icons**: Replace the placeholders in `android/app/src/main/res/mipmap-*/` with your custom `ic_launcher.png`.
- **Extension Icons**: Replace `extension/icons/16.png`, `48.png`, and `128.png` with your branded assets.
