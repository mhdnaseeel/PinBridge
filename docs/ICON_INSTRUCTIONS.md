# PinBridge Icon Assets

This document explains how to use the generated Base-64 icon assets.

## 1. Decoding Base-64 to PNG
To convert the strings into PNG files on macOS or Linux:
```bash
echo "BASE64_STRING" | base64 -d > filename.png
```
On Windows (PowerShell):
```powershell
[System.Convert]::FromBase64String("BASE64_STRING") | Set-Content filename.png -Encoding Byte
```

## 2. Placement
Place the decoded files into the following directories:
- **Android (mdpi)**: `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- **Android (hdpi)**: `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- **Android (xhdpi)**: `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- **Android (xxhdpi)**: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- **Android (xxxhdpi)**: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- **Extension (16px)**: `extension/icons/16.png`
- **Extension (48px)**: `extension/icons/48.png`
- **Extension (128px)**: `extension/icons/128.png`

## 3. Testing
- **Android**: Re-build the project in Android Studio or run `./gradlew assembleDebug`.
- **Extension**: Go to `chrome://extensions/` and click the **Reload** (refresh) icon on the PinBridge card.
