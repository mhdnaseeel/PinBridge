package com.pinbridge.otpmirror

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Tests for the OTP extraction logic in OtpExtractor.
 * Covers keyword scoring, currency/phone exclusion, and length preference.
 */
class OtpRegexTest {

    // ─── Positive Cases ────────────────────────────────────

    @Test
    fun `extracts 6-digit OTP from standard bank SMS`() {
        val sms = "Your OTP for HDFC Bank transaction is 847291. Do not share with anyone."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("847291")
    }

    @Test
    fun `extracts 4-digit code from short SMS`() {
        val sms = "Your verification code is 4829"
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("4829")
    }

    @Test
    fun `extracts 8-digit code`() {
        val sms = "Use 12345678 to verify your account."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("12345678")
    }

    @Test
    fun `extracts OTP from Google verification SMS`() {
        val sms = "G-482917 is your Google verification code."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("482917")
    }

    @Test
    fun `extracts OTP when multiple numbers present with keyword`() {
        val sms = "Your OTP is 951372. Valid for 5 minutes."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("951372")
    }

    @Test
    fun `extracts 5-digit code`() {
        val sms = "Your code: 38472"
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("38472")
    }

    @Test
    fun `extracts 7-digit code`() {
        val sms = "Enter 8374921 to continue."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("8374921")
    }

    @Test
    fun `prefers 6-digit code over 4-digit when no keywords`() {
        val sms = "Numbers: 1234 and 567890"
        // 567890 (6 digits, +5) should score higher than 1234 (4 digits, +3)
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("567890")
    }

    // ─── Keyword Scoring ────────────────────────────────────

    @Test
    fun `prefers OTP over earlier number when keywords are present`() {
        val sms = "Rs.5000.00 debited. OTP for reversal: 384721"
        // 384721 should be selected because it's near the OTP keyword
        // and 5000 is preceded by "Rs." which is a currency exclusion
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("384721")
    }

    @Test
    fun `extracts OTP when message has multiple keywords`() {
        val sms = "Your OTP verification code is 293847. Please verify within 10 minutes."
        // "OTP" + "verification" + "code" + "verify" = high keyword score
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("293847")
    }

    // ─── Currency Exclusion ────────────────────────────────

    @Test
    fun `excludes number preceded by rupee symbol`() {
        val sms = "₹5000 debited from account. Your OTP is 482917."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("482917")
    }

    @Test
    fun `excludes number preceded by dollar sign`() {
        val sms = "$1234 charged. Verification code: 847291"
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("847291")
    }

    @Test
    fun `excludes number preceded by Rs`() {
        val sms = "Rs.5000 debited. Your code is 384721"
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("384721")
    }

    @Test
    fun `excludes number preceded by INR`() {
        val sms = "INR 5000 debited. OTP: 293847"
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("293847")
    }

    // ─── Negative Cases ────────────────────────────────────

    @Test
    fun `does not extract from message with no numbers`() {
        val sms = "Welcome to our service. Please visit our website for more info."
        assertThat(OtpExtractor.extractOtp(sms)).isNull()
    }

    @Test
    fun `does not extract numbers shorter than 4 digits`() {
        val sms = "Your balance is low. Top up 10 now."
        assertThat(OtpExtractor.extractOtp(sms)).isNull()
    }

    @Test
    fun `does not extract numbers longer than 8 digits`() {
        val sms = "Your transaction ID: 123456789012"
        assertThat(OtpExtractor.extractOtp(sms)).isNull()
    }

    @Test
    fun `3-digit number is not extracted`() {
        val sms = "Call 911 for help."
        assertThat(OtpExtractor.extractOtp(sms)).isNull()
    }

    // ─── Edge Cases ────────────────────────────────────────

    @Test
    fun `extracts OTP followed by period`() {
        val sms = "OTP: 482913."
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("482913")
    }

    @Test
    fun `extracts OTP from multiline SMS`() {
        val sms = "Dear customer,\nYour OTP is 827364\nRegards, Bank"
        assertThat(OtpExtractor.extractOtp(sms)).isEqualTo("827364")
    }
}
