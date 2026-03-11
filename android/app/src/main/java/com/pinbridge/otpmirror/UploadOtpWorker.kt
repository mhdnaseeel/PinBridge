package com.pinbridge.otpmirror

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

class UploadOtpWorker(
    ctx: Context,
    params: WorkerParameters
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val otp = inputData.getString("otp") ?: return Result.failure()

        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        val sharedPrefs = EncryptedSharedPreferences.create(
            Constants.PREFS_NAME,
            masterKeyAlias,
            applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        val secret = sharedPrefs.getString(Constants.KEY_SECRET, null) ?: return Result.failure()
        val secretBytes = Base64.decode(secret, Base64.NO_WRAP)
        
        val encrypted = CryptoUtil.encrypt(otp, secretBytes)

        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return Result.retry()
        val db = FirebaseFirestore.getInstance()
        
        return try {
            db.collection(Constants.COLL_OTPS).document(uid).set(
                mapOf(
                    "otp" to encrypted.cipher,
                    "iv"  to encrypted.iv,
                    "ts"  to FieldValue.serverTimestamp()
                )
            ).await()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
