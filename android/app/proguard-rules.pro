# PinBridge ProGuard Rules

# Firebase
-keep class com.google.firebase.** { *; }
-keep interface com.google.firebase.** { *; }

# Google Play Services
-keep class com.google.android.gms.** { *; }

# Credential Manager & Google Identity (Google Sign-In)
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-if class androidx.credentials.CredentialManager
-keep class * implements androidx.credentials.CredentialProvider { *; }

# AndroidX Security & Crypto
-keep class androidx.security.crypto.** { *; }

# PinBridge Internal
-keep class com.pinbridge.otpmirror.CryptoUtil { *; }
-keep class com.pinbridge.otpmirror.UploadOtpWorker { *; }
