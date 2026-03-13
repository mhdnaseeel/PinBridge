package com.pinbridge.otpmirror

import android.graphics.Bitmap
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import com.google.zxing.BinaryBitmap
import com.google.zxing.LuminanceSource
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.util.regex.Pattern

@RunWith(AndroidJUnit4::class)
class PairingActivityTest {

    @Test
    fun `qr code contains valid deviceId and secret`() {
        ActivityScenario.launch(PairingActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->

                // Grab the bitmap from the ImageView (ID: qrCodeImage as per PairingActivity.kt)
                val iv = activity.findViewById<android.widget.ImageView>(R.id.qrCodeImage)
                val bitmap = (iv.drawable as android.graphics.drawable.BitmapDrawable).bitmap
                assertThat(bitmap).isNotNull()

                // Decode QR using ZXing
                val decoded = decodeQr(bitmap)
                assertThat(decoded).isNotNull()

                // Verify JSON structure
                val json = JSONObject(decoded!!)
                assertThat(json.has("deviceId")).isTrue()
                assertThat(json.has("secret")).isTrue()

                // deviceId must be a UUID
                val uuidPattern = Pattern.compile(
                    "^[0-9a-fA-F]{8}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{12}\$"
                )
                val deviceId = json.getString("deviceId")
                assertThat(uuidPattern.matcher(deviceId).matches()).isTrue()

                // secret must be a Base64 string (44 chars for 32‑byte secret)
                val secret = json.getString("secret")
                assertThat(secret.length).isAtLeast(44)
                // Simple Base64 validation
                assertThat(secret.matches(Regex("^[A-Za-z0-9+/=]+\$"))).isTrue()
            }
        }
    }

    private fun decodeQr(bitmap: Bitmap): String? {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val source: LuminanceSource = RGBLuminanceSource(width, height, pixels)
        val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
        return try {
            QRCodeReader().decode(binaryBitmap).text
        } catch (e: Exception) {
            null
        }
    }
}
