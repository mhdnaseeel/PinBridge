package com.pinbridge.otpmirror

import org.junit.Assert.assertEquals
import org.junit.Test

class OtpReceiverTest {

    @Test
    fun testCurrencyExclusionAndOtpExtraction() {
        // Test 6: Advanced OTP Extraction & Currency Rejection
        val mockSmsBody = "INR 5000 debited from account. Use pin 2849 to approve."

        // In a true mocked environment we'd construct a Telephony SMS Object array, 
        // but for unit validation we ensure OtpExtractor handles the body directly
        val extracted = OtpExtractor.extractOtp(mockSmsBody)
        
        // Ensure that 5000 is rejected due to INR keyword, and 2849 is captured via 'pin' keyword
        assertEquals("2849", extracted)

        // The intent test logic would proceed to verify enqueue/upload handling
    }
}
