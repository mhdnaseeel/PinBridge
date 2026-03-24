# PinBridge - Deployment Guide

This guide describes how to prepare the PinBridge Android application and Chrome extension for production release.

## 📱 Android Application

### 1. Signing the APK/AAB
To release the app on the Play Store or distribute it securely, you must sign it with a release key.

1.  **Generate a Keystore**:
    If you don't have one, generate a keystore file:
    ```bash
    keytool -genkey -v -keystore pinbridge-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pinbridge-key
    ```
2.  **Configure signing in Gradle**:
    Create a `signingConfigs` block in `app/build.gradle.kts` or use the Android Studio Signing Wizard (**Build > Generate Signed Bundle / APK...**).

### 2. Build for Release
Run the following command to generate the release bundle:
```bash
./gradlew bundleRelease
```
The output file will be located at:
`app/build/outputs/bundle/release/app-release.aab`

### 3. Verification
Before uploading, verify the release build locally:
```bash
./gradlew installRelease
```
> [!NOTE]
> R8 minification is enabled by default in the release build to optimize APK size and secure the code.

---

## 🌐 Chrome Extension

### 1. Build the Extension
Ensure all assets are bundled and minified:
```bash
cd extension
npm install
npm run build
```

### 2. Package for Web Store
1.  Navigate to the `extension` directory.
2.  Compress the following files into a `.zip` archive:
    - `dist/`
    - `icons/`
    - `manifest.json`
    - `popup.html`
    - `pairing.html`
3.  Upload the `.zip` to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### 3. Permissions
Ensure `manifest.json` correctly lists:
- `storage`: For pairing data.
- `https://firestore.googleapis.com/*`: For real-time updates.
- `identity`: If using Google Sign-in (currently using Anonymous Auth).

---

## 🔥 Firebase Configuration

### 1. Firestore Rules
Deploy the final security rules:
```bash
firebase deploy --only firestore:rules
```

### 2. Authentication
Ensure **Anonymous Authentication** is enabled in the Firebase Console under **Build > Authentication > Sign-in method**.
