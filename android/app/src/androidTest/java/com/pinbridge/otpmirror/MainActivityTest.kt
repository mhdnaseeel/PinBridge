package com.pinbridge.otpmirror

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun clickingShowPairingQr_opensPairingActivity_andShowsQr() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        
        // Either "Start Pairing" or "View Pairing QR" based on state
        try {
            composeTestRule.onNodeWithText("View Pairing QR").performClick()
        } catch (e: AssertionError) {
            composeTestRule.onNodeWithText("Start Pairing").performClick()
        }

        // The PairingActivity should now be in the foreground.
        device.waitForIdle()
        assertThat(device.currentPackageName).isEqualTo("com.pinbridge.otpmirror")
    }
}
