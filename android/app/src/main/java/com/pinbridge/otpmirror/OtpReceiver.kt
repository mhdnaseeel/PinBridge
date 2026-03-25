package com.pinbridge.otpmirror

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class OtpReceiver : BroadcastReceiver() {
    private val otpRegex = Regex("""\b\d{4,8}\b""")

    override fun onReceive(context: Context, intent: Intent?) {
        try {
            if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

            val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            val body = msgs.joinToString(" ") { it.messageBody }
            val sender = msgs.firstOrNull()?.displayOriginatingAddress ?: "Unknown"
            val timestamp = msgs.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
            
            val pendingResult = goAsync()
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Default).launch {
                try {
                    otpRegex.find(body)?.value?.let { otp ->
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
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("OtpReceiver", "Error in onReceive", e)
        }
    }
}
