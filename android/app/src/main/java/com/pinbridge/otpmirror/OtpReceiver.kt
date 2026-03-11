package com.pinbridge.otpmirror

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class OtpReceiver : BroadcastReceiver() {
    private val otpRegex = Regex("""\b\d{4,8}\b""")

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val body = msgs.joinToString(" ") { it.messageBody }
        
        otpRegex.find(body)?.value?.let { otp ->
            OtpUploader.enqueue(context, otp)
        }
    }
}
