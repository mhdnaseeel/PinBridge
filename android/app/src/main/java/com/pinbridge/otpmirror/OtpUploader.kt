package com.pinbridge.otpmirror

import android.content.Context
import android.util.Base64
import androidx.work.*
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.tasks.await
import java.time.Duration

@EntryPoint
@InstallIn(SingletonComponent::class)
interface OtpUploaderEntryPoint {
    fun auth(): FirebaseAuth
    fun db(): FirebaseFirestore
    fun sharedPrefs(): android.content.SharedPreferences
}

object OtpUploader {
    private const val TAG = "OtpUpload"

    suspend fun directUpload(context: Context, otp: String, sender: String, smsTs: Long = System.currentTimeMillis()) {
        val entryPoint = EntryPointAccessors.fromApplication(context.applicationContext, OtpUploaderEntryPoint::class.java)
        val auth = entryPoint.auth()
        val db = entryPoint.db()
        val sharedPrefs = entryPoint.sharedPrefs()

        val deviceId = sharedPrefs.getString(Constants.KEY_DEVICE_ID, null) ?: throw Exception("Not paired")
        val secret = sharedPrefs.getString(Constants.KEY_SECRET, null) ?: throw Exception("No secret")
        val secretBytes = Base64.decode(secret, Base64.NO_WRAP)
        
        val encrypted = CryptoUtil.encrypt(otp, secretBytes)

        if (auth.currentUser == null) {
            auth.signInAnonymously().await()
        }
        
        db.collection(Constants.COLL_OTPS).document(deviceId).set(
            mapOf(
                "otp" to encrypted.cipher,
                "iv"  to encrypted.iv,
                "sender" to sender,
                "otpEventId" to java.util.UUID.randomUUID().toString(),
                "ts"  to FieldValue.serverTimestamp(),
                "smsTs" to smsTs,
                "uploaderUid" to (auth.currentUser?.uid ?: ""),
                "expiresAt" to com.google.firebase.Timestamp(
                    java.util.Date(System.currentTimeMillis() + 10 * 60 * 1000)
                )
            )
        ).await()
    }

    fun enqueue(context: Context, otp: String, sender: String, smsTs: Long = System.currentTimeMillis()) {
        val data = workDataOf(
            "otp" to otp,
            "sender" to sender,
            "smsTs" to smsTs
        )
        val request = OneTimeWorkRequestBuilder<UploadOtpWorker>()
            .setInputData(data)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                Duration.ofSeconds(30)
            )
            .addTag(TAG)
            .build()
            
        WorkManager.getInstance(context).enqueueUniqueWork(
            "upload_otp",
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request
        )
    }
}
