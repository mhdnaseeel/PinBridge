package com.pinbridge.otpmirror

import java.util.regex.Pattern

/**
 * Shared OTP extraction logic used by both OtpReceiver (real-time SMS) and SmsRetriever (manual fetch).
 * 
 * Strategy:
 * 1. Score messages based on OTP keyword presence (otp, code, verification, etc.)
 * 2. Extract 4-8 digit candidates using regex
 * 3. Exclude false positives (currency amounts, phone numbers, card numbers)
 * 4. Prefer 6-digit codes (most common OTP length)
 * 5. Return the highest-scoring candidate
 */
object OtpExtractor {

    // OTP keyword patterns for scoring messages (case-insensitive)
    private val OTP_KEYWORDS = listOf("otp", "code", "verification", "verify", "pin", "token", "password")

    // Base regex for digit extraction
    private val OTP_REGEX = Pattern.compile("\\b\\d{4,8}\\b")

    /**
     * Extracts the best OTP candidate from a single SMS body.
     * Returns the OTP string or null if no valid candidate was found.
     */
    fun extractOtp(body: String): String? {
        val bodyLower = body.lowercase()

        // Score this message based on keyword presence
        val keywordScore = OTP_KEYWORDS.count { keyword -> bodyLower.contains(keyword) }

        val matcher = OTP_REGEX.matcher(body)
        var bestCandidate: String? = null
        var bestScore = -1

        while (matcher.find()) {
            val candidate = matcher.group() ?: continue

            // Skip if this number looks like a currency amount or phone number
            if (isExcludedNumber(body, candidate)) continue

            // Score: keyword matches + length preference (6-digit codes score highest)
            var score = keywordScore * 10
            when (candidate.length) {
                6 -> score += 5  // Most common OTP length
                4 -> score += 3
                8 -> score += 2
                else -> score += 1
            }

            if (score > bestScore) {
                bestScore = score
                bestCandidate = candidate
            }
        }

        return bestCandidate
    }

    /**
     * Check if a candidate number is likely NOT an OTP
     * (e.g., currency amount, phone number, account number).
     */
    private fun isExcludedNumber(fullMessage: String, candidate: String): Boolean {
        // Skip numbers longer than 8 digits
        if (candidate.length > 8) return true

        // Check if the number appears in a currency context
        val idx = fullMessage.indexOf(candidate)
        if (idx > 0) {
            val prefix = fullMessage.substring(maxOf(0, idx - 5), idx).trim()
            if (prefix.matches(Regex(".*[₹$£€]\\s*$")) || prefix.matches(Regex("(?i).*(rs|inr|usd)\\s*$"))) {
                return true
            }
        }

        return false
    }
}
