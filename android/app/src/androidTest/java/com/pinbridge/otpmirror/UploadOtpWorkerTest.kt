package com.pinbridge.otpmirror

import android.content.Context
import android.util.Base64
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.ListenableWorker
import androidx.work.TestingBuildInstance
import androidx.work.WorkManager
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import com.google.common.truth.Truth.assertThat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UploadOtpWorkerTest {

    private lateinit var context: Context

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        
        // Point to emulators
        val auth = FirebaseAuth.getInstance()
        auth.useEmulator("10.0.2.2", 9099)
        
        val firestore = FirebaseFirestore.getInstance()
        firestore.firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setHost("10.0.2.2:8080")
            .setSslEnabled(false)
            .build()
    }

    @Test
    fun testUploadOtpWorker_uploadsEncryptedDataToFirestore() = runBlocking {
        val testOtp = "987654"
        val testSecret = ByteArray(32) { it.toByte() }
        val testSecretB64 = Base64.encodeToString(testSecret, Base64.NO_WRAP)
        
        // Seed secret in prefs
        val sharedPrefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
        sharedPrefs.edit().putString(Constants.KEY_SECRET, testSecretB64).commit()

        val worker = TestListenableWorkerBuilder<UploadOtpWorker>(
            context = context,
            inputData = workDataOf("otp" to testOtp)
        ).build()

        val result = worker.doWork()
        assertThat(result).isEqualTo(ListenableWorker.Result.success())

        // Verify in Firestore emulator
        val auth = FirebaseAuth.getInstance()
        val uid = auth.currentUser?.uid ?: "test-uid"
        
        val db = FirebaseFirestore.getInstance()
        val doc = db.collection("{{COLL_OTPS}}").document(uid).get().await()
        
        assertThat(doc.exists()).isTrue()
        val encryptedData = CryptoUtil.EncryptedData(
            cipher = doc.getString("otp")!!,
            iv = doc.getString("iv")!!
        )
        
        val decrypted = CryptoUtil.decrypt(encryptedData, testSecret)
        assertThat(decrypted).isEqualTo(testOtp)
    }
}
