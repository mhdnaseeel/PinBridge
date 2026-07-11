package com.pinbridge.otpmirror

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.tasks.await

@HiltWorker
class UploadOtpWorker @AssistedInject constructor(
    @Assisted ctx: Context,
    @Assisted params: WorkerParameters,
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val sharedPrefs: SharedPreferences
) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val otp = inputData.getString("otp") ?: return Result.failure()
        val smsTs = inputData.getLong("smsTs", System.currentTimeMillis())
        val otpEventId = inputData.getString("otpEventId") ?: java.util.UUID.randomUUID().toString()

        // Drop the upload if the OTP has already expired (SMS arrived >10 min ago).
        // No point pushing a stale OTP that the extension will ignore anyway.
        val otpTtlMs = 10 * 60 * 1000L
        if (System.currentTimeMillis() > smsTs + otpTtlMs) {
            android.util.Log.w("UploadOtpWorker", "OTP expired before upload (smsTs=$smsTs). Dropping.")
            return Result.failure()
        }

        val deviceId = sharedPrefs.getString(Constants.KEY_DEVICE_ID, null) ?: return Result.failure()
        val secret = sharedPrefs.getString(Constants.KEY_SECRET, null) ?: return Result.failure()
        val secretBytes = Base64.decode(secret, Base64.NO_WRAP)

        val encrypted = CryptoUtil.encrypt(otp, secretBytes)

        if (auth.currentUser == null) {
            try {
                auth.signInAnonymously().await()
            } catch (e: Exception) {
                return Result.retry()
            }
        }

        return try {
            db.collection(Constants.COLL_OTPS).document(deviceId).set(
                mapOf(
                    "otp" to encrypted.cipher,
                    "iv"  to encrypted.iv,
                    "sender" to (inputData.getString("sender") ?: "Unknown"),
                    "otpEventId" to otpEventId,
                    "ts"  to FieldValue.serverTimestamp(),
                    "smsTs" to smsTs,
                    "uploaderUid" to (auth.currentUser?.uid ?: ""),
                    // Expiry is 10 min from when the SMS arrived, not from upload time.
                    // If the phone was offline for 5 min, the OTP gets only 5 min remaining.
                    "expiresAt" to run {
                        val expiryMs = smsTs + otpTtlMs
                        com.google.firebase.Timestamp(expiryMs / 1000, ((expiryMs % 1000) * 1_000_000).toInt())
                    }
                )
            ).await()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
