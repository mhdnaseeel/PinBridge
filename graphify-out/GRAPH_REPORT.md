# Graph Report - .  (2026-04-14)

## Corpus Check
- Corpus is ~39,457 words - fits in a single context window. You may not need a graph.

## Summary
- 278 nodes · 272 edges · 52 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Device Heartbeat Service|Device Heartbeat Service]]
- [[_COMMUNITY_Android Pairing Repository|Android Pairing Repository]]
- [[_COMMUNITY_Extension Background Worker|Extension Background Worker]]
- [[_COMMUNITY_OTP Regex Logic|OTP Regex Logic]]
- [[_COMMUNITY_Extension Popup UI|Extension Popup UI]]
- [[_COMMUNITY_Web Dashboard Core|Web Dashboard Core]]
- [[_COMMUNITY_Android Main Activity|Android Main Activity]]
- [[_COMMUNITY_Crypto Utility Testing|Crypto Utility Testing]]
- [[_COMMUNITY_QR Code Scan Activity|QR Code Scan Activity]]
- [[_COMMUNITY_OTP Uploader Component|OTP Uploader Component]]
- [[_COMMUNITY_Extension Pairing Manager|Extension Pairing Manager]]
- [[_COMMUNITY_Android E2E Tests|Android E2E Tests]]
- [[_COMMUNITY_Manual Pairing Entry|Manual Pairing Entry]]
- [[_COMMUNITY_Dependency Injection Module|Dependency Injection Module]]
- [[_COMMUNITY_Security & Monitoring Core|Security & Monitoring Core]]
- [[_COMMUNITY_Upload Worker Tests|Upload Worker Tests]]
- [[_COMMUNITY_Cryptographic Helpers|Cryptographic Helpers]]
- [[_COMMUNITY_QR Pairing Tests|QR Pairing Tests]]
- [[_COMMUNITY_Unit Tests|Unit Tests]]
- [[_COMMUNITY_OTP Extraction Logic|OTP Extraction Logic]]
- [[_COMMUNITY_OTP Receiver Analysis|OTP Receiver Analysis]]
- [[_COMMUNITY_UI Navigation Tests|UI Navigation Tests]]
- [[_COMMUNITY_Constants Configuration|Constants Configuration]]
- [[_COMMUNITY_Worker Service logic|Worker Service logic]]
- [[_COMMUNITY_App Lifecycle Management|App Lifecycle Management]]
- [[_COMMUNITY_SMS Permission Helpers|SMS Permission Helpers]]
- [[_COMMUNITY_Android Broadcast Receivers|Android Broadcast Receivers]]
- [[_COMMUNITY_SMS Fetching Service|SMS Fetching Service]]
- [[_COMMUNITY_System Boot Receiver|System Boot Receiver]]
- [[_COMMUNITY_Extension Configuration|Extension Configuration]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]

## God Nodes (most connected - your core abstractions)
1. `DeviceHeartbeatService` - 22 edges
2. `OtpRegexTest` - 21 edges
3. `PairingRepositoryImpl` - 15 edges
4. `MainActivity` - 11 edges
5. `updateUI()` - 9 edges
6. `safeSendMessage()` - 8 edges
7. `CryptoUtilTest` - 8 edges
8. `PairingScannerActivity` - 7 edges
9. `PairingRepository` - 7 edges
10. `startAllListeners()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Presence Server` --shares_data_with--> `Firebase Firestore`  [INFERRED]
  server/index.js → README.md
- `AES-256-GCM Encryption` --rationale_for--> `OTP Mirroring Flow`  [EXTRACTED]
  security_audit.md → README.md
- `ECDH Key Agreement` --references--> `OTP Mirroring Flow`  [EXTRACTED]
  docs/PAIRING_FLOW.md → README.md
- `Firebase Crashlytics Monitoring` --references--> `OTP Mirroring Flow`  [EXTRACTED]
  SCORECARD.md → README.md

## Communities

### Community 0 - "Device Heartbeat Service"
Cohesion: 0.07
Nodes (1): DeviceHeartbeatService

### Community 1 - "Android Pairing Repository"
Cohesion: 0.09
Nodes (2): PairingRepository, PairingRepositoryImpl

### Community 2 - "Extension Background Worker"
Cohesion: 0.2
Nodes (19): cleanupFirestorePairing(), handleManualFetch(), handleWebLoginSuccess(), handleWebPairingSuccess(), hydrateAndPush(), performPairing(), performSignOut(), performUnpairOnly() (+11 more)

### Community 3 - "OTP Regex Logic"
Cohesion: 0.09
Nodes (1): OtpRegexTest

### Community 4 - "Extension Popup UI"
Cohesion: 0.14
Nodes (5): generateCaptcha(), showCaptchaModal(), showConnectingStatus(), updateBatteryDisplay(), updateConnectionStatus()

### Community 5 - "Web Dashboard Core"
Cohesion: 0.24
Nodes (13): el(), escapeHtml(), handleForcedUnpair(), handleSignOut(), isDeviceOnline(), loginWithGoogle(), renderPaired(), renderSignIn() (+5 more)

### Community 6 - "Android Main Activity"
Cohesion: 0.17
Nodes (1): MainActivity

### Community 7 - "Crypto Utility Testing"
Cohesion: 0.22
Nodes (1): CryptoUtilTest

### Community 8 - "QR Code Scan Activity"
Cohesion: 0.25
Nodes (1): PairingScannerActivity

### Community 9 - "OTP Uploader Component"
Cohesion: 0.29
Nodes (1): OtpUploader

### Community 10 - "Extension Pairing Manager"
Cohesion: 0.47
Nodes (3): setStatus(), statusArea(), statusText()

### Community 11 - "Android E2E Tests"
Cohesion: 0.33
Nodes (1): E2ETest

### Community 12 - "Manual Pairing Entry"
Cohesion: 0.33
Nodes (1): ManualCodeEntryActivity

### Community 13 - "Dependency Injection Module"
Cohesion: 0.33
Nodes (1): AppModule

### Community 14 - "Security & Monitoring Core"
Cohesion: 0.33
Nodes (6): AES-256-GCM Encryption, ECDH Key Agreement, Firebase Crashlytics Monitoring, Firebase Firestore, OTP Mirroring Flow, Presence Server

### Community 15 - "Upload Worker Tests"
Cohesion: 0.4
Nodes (1): UploadOtpWorkerTest

### Community 16 - "Cryptographic Helpers"
Cohesion: 0.4
Nodes (2): CryptoUtil, EncryptedData

### Community 17 - "QR Pairing Tests"
Cohesion: 0.5
Nodes (1): PairingActivityTest

### Community 18 - "Unit Tests"
Cohesion: 0.5
Nodes (1): ExampleUnitTest

### Community 19 - "OTP Extraction Logic"
Cohesion: 0.5
Nodes (1): OtpExtractor

### Community 20 - "OTP Receiver Analysis"
Cohesion: 0.67
Nodes (1): OtpReceiverTest

### Community 21 - "UI Navigation Tests"
Cohesion: 0.67
Nodes (1): MainActivityTest

### Community 22 - "Constants Configuration"
Cohesion: 0.67
Nodes (1): ConstantsTest

### Community 23 - "Worker Service logic"
Cohesion: 0.67
Nodes (1): UploadOtpWorker

### Community 24 - "App Lifecycle Management"
Cohesion: 0.67
Nodes (1): PinBridgeApp

### Community 25 - "SMS Permission Helpers"
Cohesion: 0.67
Nodes (1): SmsPermissionHelper

### Community 26 - "Android Broadcast Receivers"
Cohesion: 0.67
Nodes (1): OtpReceiver

### Community 27 - "SMS Fetching Service"
Cohesion: 0.67
Nodes (1): SmsRetriever

### Community 28 - "System Boot Receiver"
Cohesion: 0.67
Nodes (1): BootReceiver

### Community 29 - "Extension Configuration"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): Constants

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **6 isolated node(s):** `EncryptedData`, `Constants`, `Presence Server`, `AES-256-GCM Encryption`, `ECDH Key Agreement` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Extension Configuration`** (2 nodes): `isDashboardPage()`, `config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `autofill()`, `content.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `decryptOtp()`, `crypto.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `log()`, `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `validateOrigin()`, `index.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `Constants.kt`, `Constants`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `ConnectedScreen.kt`, `ConnectedView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `DisconnectedScreen.kt`, `DisconnectedView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `SignInScreen.kt`, `SignInView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `StatusItem.kt`, `StatusItem()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `HelpStepItem.kt`, `HelpStepItem()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `Theme.kt`, `PinBridgeTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `webpack.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `build.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `settings.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `build.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `playwright.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `dashboard.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `extension.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `EncryptedData`, `Constants`, `Presence Server` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Device Heartbeat Service` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Android Pairing Repository` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `OTP Regex Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Extension Popup UI` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._