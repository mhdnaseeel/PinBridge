# PinBridge ProGuard Rules

# Firebase
-keep class com.google.firebase.** { *; }
-keep interface com.google.firebase.** { *; }

# Google Play Services
-keep class com.google.android.gms.** { *; }

# AndroidX Security & Crypto
-keep class androidx.security.crypto.** { *; }

# PinBridge Internal
-keep class com.pinbridge.otpmirror.CryptoUtil { *; }
-keep class com.pinbridge.otpmirror.UploadOtpWorker { *; }
