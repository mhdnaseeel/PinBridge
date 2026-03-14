package com.pinbridge.otpmirror

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.testing.WorkManagerTestInitHelper
import com.google.common.truth.Truth.assertThat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.Base64
import java.util.UUID

class UploadOtpWorkerTest {

    private lateinit var context: Context
    private lateinit var firestore: FirebaseFirestore
    private lateinit var auth: FirebaseAuth

    private val testDeviceId = "test-uid"
    private val testSecret = ByteArray(32).apply { java.security.SecureRandom().nextBytes(this) }
    private val testSecretB64 = Base64.getEncoder().encodeToString(testSecret)

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()

        // Initialise Firebase with dummy options (required for SDK init)
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId("test-project")
                .setApplicationId("1:1234567890:android:deadbeef")
                .setApiKey("fake-api-key")
                .build()
            FirebaseApp.initializeApp(context, options)
        }

        // Point Auth to the emulator
        auth = FirebaseAuth.getInstance()
        auth.useEmulator("10.0.2.2", 9099)

        // Point to Firestore emulator
        firestore = FirebaseFirestore.getInstance()
        firestore.useEmulator("10.0.2.2", 8080)
        
        val settings = FirebaseFirestoreSettings.Builder()
            .setHost("10.0.2.2:8080")
            .setSslEnabled(false)
            .build()
        firestore.firestoreSettings = settings

        // Store the secret and deviceId in EncryptedSharedPreferences (real implementation)
        val masterKeyAlias = androidx.security.crypto.MasterKeys.getOrCreate(androidx.security.crypto.MasterKeys.AES256_GCM_SPEC)
        val prefs = androidx.security.crypto.EncryptedSharedPreferences.create(
            Constants.PREFS_NAME,
            masterKeyAlias,
            context,
            androidx.security.crypto.EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            androidx.security.crypto.EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        prefs.edit()
            .putString(Constants.KEY_DEVICE_ID, testDeviceId)
            .putString(Constants.KEY_SECRET, testSecretB64)
            .commit()

        // Initialise WorkManager in a test configuration
        val config = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.DEBUG)
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)
    }

    @After
    fun tearDown() {
        // Clean up Firestore document (if any)
        runBlocking {
            try { firestore.collection(Constants.COLL_OTPS).document(testDeviceId).delete().await() } catch (e: Exception) {}
        }
    }

    @Test
    fun `worker uploads encrypted otp and can be decrypted correctly`() = runBlocking {
        val testOtp = "987654"

        // Build input data for the worker
        val input = androidx.work.Data.Builder()
            .putString("otp", testOtp)
            .build()

        // Build and run the worker synchronously
        val worker = androidx.work.TestListenableWorkerBuilder<UploadOtpWorker>(
            context = context,
            inputData = input
        ).build()
        
        val result = worker.doWork()
        assertThat(result).isEqualTo(androidx.work.ListenableWorker.Result.success())

        // Verify Firestore document exists (Note: UploadOtpWorker uses currentUser UID, which might be different if emulator seeds UID)
        // For testing stability, ensure user is signed in
        auth.signInAnonymously().await()
        val uid = auth.currentUser?.uid ?: testDeviceId
        
        val docSnap = firestore.collection("otps")
            .document(uid).get().await()
        
        assertThat(docSnap.exists()).isTrue()
        val data = docSnap.data!!
        assertThat(data).containsKey("otp")
        assertThat(data).containsKey("iv")
        assertThat(data).containsKey("ts")

        // Decrypt and verify OTP
        val encrypted = CryptoUtil.EncryptedData(
            cipher = data["otp"] as String,
            iv = data["iv"] as String
        )
        val decrypted = CryptoUtil.decrypt(encrypted, testSecret)
        assertThat(decrypted).isEqualTo(testOtp)
    }
}
