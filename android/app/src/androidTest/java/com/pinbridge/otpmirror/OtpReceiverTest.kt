package com.pinbridge.otpmirror

import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OtpReceiverTest {

    @Test
    fun testCurrencyExclusionAndOtpExtraction() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val receiver = OtpReceiver()

        // Test 6: Advanced OTP Extraction & Currency Rejection
        val mockSmsBody = "INR 5000 debited from account. Use pin 2849 to approve."

        // In a true mocked environment we'd construct a Telephony SMS Object array, 
        // but for unit validation we ensure OtpExtractor handles the body directly
        val extracted = OtpExtractor.extractOtp(mockSmsBody)
        
        // Ensure that 5000 is rejected due to INR keyword, and 2849 is captured via 'pin' keyword
        assertEquals("2849", extracted)

        // The intent test logic would proceed to verify enqueue/upload handling
        // receiver.onReceive(context, simulatedIntent) 
    }
}
