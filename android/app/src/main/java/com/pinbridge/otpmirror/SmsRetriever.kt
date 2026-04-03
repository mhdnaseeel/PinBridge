package com.pinbridge.otpmirror

import android.content.Context
import android.net.Uri
import android.util.Log

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
                var bestMatch: Pair<String, Long>? = null

                while (it.moveToNext()) {
                    val body = it.getString(0) ?: continue
                    val timestamp = it.getLong(1)

                    // Use the shared OtpExtractor for consistent extraction logic
                    val otp = OtpExtractor.extractOtp(body)
                    if (otp != null) {
                        // Return the first high-confidence match (messages are ordered by date DESC)
                        Log.d(TAG, "OTP candidate found: ${otp.length} digits from message")
                        if (bestMatch == null) {
                            bestMatch = Pair(otp, timestamp)
                        }
                    }
                }

                if (bestMatch != null) {
                    Log.d(TAG, "Best OTP candidate: ${bestMatch!!.first.length} digits")
                }
                return bestMatch
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to query SMS: ${e.message}", e)
        }
        return null
    }
}
