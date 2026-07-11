import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import com.android.build.api.dsl.CommonExtension

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.pinbridge.otpmirror"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pinbridge.otpmirror"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "1.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
    
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
        jniLibs {
            useLegacyPackaging = false
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = true
        warningsAsErrors = false
    }
}

dependencies {
    // ── Version catalogue (local variables) ─────────────────────────────
    val coreKtxVersion          = "1.12.0"
    val lifecycleVersion        = "2.7.0"
    val activityComposeVersion  = "1.8.2"
    val coroutinesPlayVersion   = "1.9.0"
    val composeBomVersion       = "2024.02.01"
    val appcompatVersion        = "1.6.1"
    val materialVersion         = "1.11.0"
    val constraintLayoutVersion = "2.1.4"
    val workManagerVersion      = "2.9.0"
    val firebaseBomVersion      = "34.10.0"
    val playServicesAuthVersion = "21.0.0"
    val credentialsVersion      = "1.5.0-rc01"
    val googleIdVersion         = "1.1.1"
    val securityCryptoVersion   = "1.1.0-alpha06"
    val mlKitBarcodeVersion     = "17.3.0"
    val cameraxVersion          = "1.4.0"
    val junitVersion            = "4.13.2"
    val truthVersion            = "1.1.5"
    val mockitoVersion          = "5.5.0"
    val testCoreVersion         = "1.5.0"
    val testExtJunitVersion     = "1.2.1"
    val espressoVersion         = "3.6.0"
    val uiautomatorVersion      = "2.3.0"
    val composeTestVersion      = "1.6.6"
    val hiltVersion             = "2.51.1"
    val hiltWorkVersion         = "1.2.0"
    val socketIoVersion         = "2.1.0"

    // ── Implementation dependencies ─────────────────────────────────────
    // AndroidX Core
    implementation("androidx.core:core-ktx:$coreKtxVersion")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:$lifecycleVersion")
    implementation("androidx.activity:activity-compose:$activityComposeVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:$coroutinesPlayVersion")

    // Compose
    val composeBom = platform("androidx.compose:compose-bom:$composeBomVersion")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")

    // UI / Layout
    implementation("androidx.appcompat:appcompat:$appcompatVersion")
    implementation("com.google.android.material:material:$materialVersion")
    implementation("androidx.constraintlayout:constraintlayout:$constraintLayoutVersion")

    // WorkManager
    implementation("androidx.work:work-runtime-ktx:$workManagerVersion")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:$firebaseBomVersion"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-crashlytics")
    implementation("com.google.firebase:firebase-functions")
    implementation("com.google.firebase:firebase-appcheck-playintegrity")
    implementation("com.google.android.gms:play-services-auth:$playServicesAuthVersion")

    // Credential Manager (modern Google Sign-In replacement)
    implementation("androidx.credentials:credentials:$credentialsVersion")
    implementation("androidx.credentials:credentials-play-services-auth:$credentialsVersion")
    implementation("com.google.android.libraries.identity.googleid:googleid:$googleIdVersion")

    // Encryption
    implementation("androidx.security:security-crypto:$securityCryptoVersion")

    // ML Kit Barcode Scanning
    implementation("com.google.mlkit:barcode-scanning:$mlKitBarcodeVersion")

    // CameraX
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")

    // Hilt (DI)
    implementation("com.google.dagger:hilt-android:$hiltVersion")
    ksp("com.google.dagger:hilt-compiler:$hiltVersion")
    implementation("androidx.hilt:hilt-work:$hiltWorkVersion")
    ksp("androidx.hilt:hilt-compiler:$hiltWorkVersion")

    // Socket.IO
    implementation("io.socket:socket.io-client:$socketIoVersion")

    // ── Unit-test dependencies ──────────────────────────────────────────
    testImplementation("junit:junit:$junitVersion")
    testImplementation("com.google.truth:truth:$truthVersion")
    testImplementation("org.mockito:mockito-core:$mockitoVersion")
    testImplementation("androidx.test:core:$testCoreVersion")
    testImplementation("androidx.work:work-testing:$workManagerVersion")

    // ── Android-instrumentation (UI) test dependencies ──────────────────
    androidTestImplementation("androidx.test.ext:junit:$testExtJunitVersion")
    androidTestImplementation("androidx.test.espresso:espresso-core:$espressoVersion")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:$uiautomatorVersion")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:$composeTestVersion")
    androidTestImplementation("androidx.compose.ui:ui-test-manifest:$composeTestVersion")
    androidTestImplementation("com.google.truth:truth:$truthVersion")
    androidTestImplementation("androidx.work:work-testing:$workManagerVersion")
}


/**
 * Custom task that starts the Firebase emulators (functions, firestore, auth)
 * before any instrumentation test runs. The task blocks until the emulators are ready.
 */
tasks.register<Exec>("runEmulators") {
    group = "verification"
    description = "Starts Firebase emulators (functions, firestore, auth) before Android tests."
    commandLine("firebase", "emulators:start", "--only", "functions,firestore,auth")
}

// Make Android instrumentation tests depend on the emulator task
// Using matching().configureEach() to handle the task being added dynamically by AGP
tasks.matching { it.name == "connectedAndroidTest" }.configureEach {
    dependsOn("runEmulators")
}
