package com.pinbridge.otpmirror

import android.content.Context
import androidx.work.*
import java.time.Duration

object OtpUploader {
    private const val TAG = "OtpUpload"

    fun enqueue(context: Context, otp: String) {
        val data = workDataOf("otp" to otp)
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
