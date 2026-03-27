import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import com.android.build.api.dsl.CommonExtension

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
    id("io.sentry.android.gradle")
}

sentry {
    includeProguardMapping = true
    autoUploadProguardMapping = true
    uploadNativeSymbols = true
    includeNativeSources = true
    tracingInstrumentation {
        enabled = true
    }
}

android {
    namespace = "com.pinbridge.otpmirror"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.pinbridge.otpmirror"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

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

    @Suppress("UnstableApiUsage")
    kotlin {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
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
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    
    // Compose
    val composeBom = platform("androidx.compose:compose-bom:2024.02.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    
    // WorkManager
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    
    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:34.10.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-database")
    implementation("com.google.firebase:firebase-functions")
    implementation("com.google.android.gms:play-services-auth:21.0.0")
    
    // Encryption
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    
    // ML Kit Barcode Scanning (Replaces ZXing)
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    // CameraX
    val camerax_version = "1.4.0"
    implementation("androidx.camera:camera-core:$camerax_version")
    implementation("androidx.camera:camera-camera2:$camerax_version")
    implementation("androidx.camera:camera-lifecycle:$camerax_version")
    implementation("androidx.camera:camera-view:$camerax_version")

    // ----- Unit-test dependencies -----
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.google.truth:truth:1.1.5")
    testImplementation("org.mockito:mockito-core:5.5.0")
    testImplementation("androidx.test:core:1.5.0")
    testImplementation("androidx.work:work-testing:2.9.0")

    // ----- Android-instrumentation (UI) dependencies -----
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.0")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.6.6")
    androidTestImplementation("androidx.compose.ui:ui-test-manifest:1.6.6")
    androidTestImplementation("com.google.truth:truth:1.1.5")
    androidTestImplementation("androidx.work:work-testing:2.9.0")

    // Hilt
    implementation("com.google.dagger:hilt-android:2.59.2")
    ksp("com.google.dagger:hilt-compiler:2.59.2")
    implementation("androidx.hilt:hilt-work:1.2.0")
    ksp("androidx.hilt:hilt-compiler:1.2.0")

    // Socket.IO
    implementation("io.socket:socket.io-client:2.1.0")

    // Sentry
    implementation("io.sentry:sentry-android:7.2.0")
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
