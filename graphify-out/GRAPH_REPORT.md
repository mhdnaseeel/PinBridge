# Graph Report - .  (2026-04-12)

## Corpus Check
- Corpus is ~39,561 words - fits in a single context window. You may not need a graph.

## Summary
- 281 nodes · 270 edges · 57 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Chrome Extension Core|Chrome Extension Core]]
- [[_COMMUNITY_Android App Core|Android App Core]]
- [[_COMMUNITY_OTP Mirroring System|OTP Mirroring System]]
- [[_COMMUNITY_Cryptographic Utilities|Cryptographic Utilities]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Android Constants Testing|Android Constants Testing]]
- [[_COMMUNITY_OTP Upload Worker|OTP Upload Worker]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Architecture & Presence Server|Architecture & Presence Server]]
- [[_COMMUNITY_Community 29|Community 29]]
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
- [[_COMMUNITY_Security & Key Agreement|Security & Key Agreement]]
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
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]

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
- `Presence Server` --conceptually_related_to--> `Render/Firebase Deployment`  [INFERRED]
  technical_audit.md → RUNBOOK.md
- `Presence Server` --references--> `PinBridge System`  [EXTRACTED]
  technical_audit.md → README.md
- `ECDH Key Agreement` --rationale_for--> `Vulnerability V-04: Insecure Secret Exchange`  [EXTRACTED]
  docs/PAIRING_FLOW.md → security_audit.md

## Hyperedges (group relationships)
- **OTP Mirroring Flow** — readme_pinbridge, production_audit_work_manager, technical_audit_presence_server [EXTRACTED 1.00]

## Communities

### Community 0 - "Chrome Extension Core"
Cohesion: 0.07
Nodes (1): DeviceHeartbeatService

### Community 1 - "Android App Core"
Cohesion: 0.09
Nodes (2): PairingRepository, PairingRepositoryImpl

### Community 2 - "OTP Mirroring System"
Cohesion: 0.2
Nodes (19): cleanupFirestorePairing(), handleManualFetch(), handleWebLoginSuccess(), handleWebPairingSuccess(), hydrateAndPush(), performPairing(), performSignOut(), performUnpairOnly() (+11 more)

### Community 3 - "Cryptographic Utilities"
Cohesion: 0.09
Nodes (1): OtpRegexTest

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (5): generateCaptcha(), showCaptchaModal(), showConnectingStatus(), updateBatteryDisplay(), updateConnectionStatus()

### Community 5 - "Community 5"
Cohesion: 0.24
Nodes (13): el(), escapeHtml(), handleForcedUnpair(), handleSignOut(), isDeviceOnline(), loginWithGoogle(), renderPaired(), renderSignIn() (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (1): MainActivity

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (1): CryptoUtilTest

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (1): PairingScannerActivity

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (1): OtpUploader

### Community 10 - "Community 10"
Cohesion: 0.47
Nodes (3): setStatus(), statusArea(), statusText()

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (1): E2ETest

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (1): ManualCodeEntryActivity

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (1): AppModule

### Community 14 - "Community 14"
Cohesion: 0.4
Nodes (1): UploadOtpWorkerTest

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (2): CryptoUtil, EncryptedData

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (1): PairingActivityTest

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (1): ExampleUnitTest

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (1): OtpExtractor

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (1): OtpReceiverTest

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (1): MainActivityTest

### Community 21 - "Android Constants Testing"
Cohesion: 0.67
Nodes (1): ConstantsTest

### Community 22 - "OTP Upload Worker"
Cohesion: 0.67
Nodes (1): UploadOtpWorker

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (1): PinBridgeApp

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (1): SmsPermissionHelper

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (1): OtpReceiver

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (1): SmsRetriever

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): BootReceiver

### Community 28 - "Architecture & Presence Server"
Cohesion: 0.67
Nodes (3): PinBridge System, Render/Firebase Deployment, Presence Server

### Community 29 - "Community 29"
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

### Community 41 - "Security & Key Agreement"
Cohesion: 1.0
Nodes (2): ECDH Key Agreement, Vulnerability V-04: Insecure Secret Exchange

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

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Android WorkManager Implementation

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Playwright E2E Test Failure

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Sentry/Crashlytics Monitoring

## Knowledge Gaps
- **9 isolated node(s):** `EncryptedData`, `Constants`, `PinBridge System`, `Vulnerability V-04: Insecure Secret Exchange`, `ECDH Key Agreement` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 29`** (2 nodes): `isDashboardPage()`, `config.js`
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
- **Thin community `Security & Key Agreement`** (2 nodes): `ECDH Key Agreement`, `Vulnerability V-04: Insecure Secret Exchange`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `webpack.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `instrument.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `build.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `settings.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `build.gradle.kts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `playwright.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `dashboard.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `extension.spec.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Android WorkManager Implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Playwright E2E Test Failure`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Sentry/Crashlytics Monitoring`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `EncryptedData`, `Constants`, `PinBridge System` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chrome Extension Core` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Android App Core` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Cryptographic Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._