package com.pinbridge.otpmirror

import android.content.Context
import android.net.Uri
import android.util.Log
import java.util.regex.Pattern

object SmsRetriever {
    private const val TAG = "SmsRetriever"

    fun getLatestOtp(context: Context): Pair<String, Long>? {
        try {
            val cursor = context.contentResolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("body", "date"),
                null, null, "date DESC LIMIT 20"
            )

            cursor?.use {
                // Heuristic for finding OTPs: 4 to 8 digits
                val otpPattern = Pattern.compile("\\b\\d{4,8}\\b")
                
                while (it.moveToNext()) {
                    val body = it.getString(0) ?: continue
                    val timestamp = it.getLong(1)
                    val matcher = otpPattern.matcher(body)
                    if (matcher.find()) {
                        val otp = matcher.group()
                        Log.d(TAG, "Found potential OTP (${otp.length} digits)")
                        
                        // Specific priority for 6-digit codes
                        if (otp.length == 6) {
                            return Pair(otp, timestamp)
                        }
                        
                        // Fallback to first found match if no 6-digit code found in this message
                        return Pair(otp, timestamp)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query SMS: ${e.message}", e)
        }
        return null
    }
}
