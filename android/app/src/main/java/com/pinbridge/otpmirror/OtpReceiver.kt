package com.pinbridge.otpmirror

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class OtpReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        try {
            if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

            val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            val body = msgs.joinToString(" ") { it.messageBody }
            val sender = msgs.firstOrNull()?.displayOriginatingAddress ?: "Unknown"
            val timestamp = msgs.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
            
            val pendingResult = goAsync()
            // Fix P1-3: Use a managed scope that is cancelled after work completes
            // to prevent coroutine leaks when multiple SMSes arrive rapidly.
            val scope = kotlinx.coroutines.CoroutineScope(
                kotlinx.coroutines.Dispatchers.Default + kotlinx.coroutines.SupervisorJob()
            )
            scope.launch {
                try {
                    // Fix 2.4: Use keyword-scored extraction with false-positive exclusion
                    // instead of the greedy \b\d{4,8}\b regex.
                    OtpExtractor.extractOtp(body)?.let { otp ->
                        withContext(kotlinx.coroutines.Dispatchers.Main) {
                            try {
                                kotlinx.coroutines.withTimeout(8000) {
                                    OtpUploader.directUpload(context, otp, sender, timestamp)
                                }
                            } catch (e: Exception) {
                                android.util.Log.w("OtpReceiver", "Direct upload failed, falling back to WorkManager", e)
                                OtpUploader.enqueue(context, otp, sender, timestamp)
                            }
                        }
                    }
                } finally {
                    pendingResult.finish()
                    scope.cancel() // Clean up to prevent leak
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("OtpReceiver", "Error in onReceive", e)
        }
    }
}
