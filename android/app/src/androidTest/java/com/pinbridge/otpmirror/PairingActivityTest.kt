package com.pinbridge.otpmirror

import android.graphics.drawable.BitmapDrawable
import android.widget.ImageView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.common.truth.Truth.assertThat
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PairingActivityTest {

    @Test
    fun testPairingQr_containsValidJsonPayload() {
        ActivityScenario.launch(PairingActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val imageView = activity.findViewById<ImageView>(R.id.qrCodeImage)
                val drawable = imageView.drawable as BitmapDrawable
                val bitmap = drawable.bitmap
                
                assertThat(bitmap).isNotNull()
                assertThat(bitmap.width).isGreaterThan(0)
                
                // Decode QR
                val intArray = IntArray(bitmap.width * bitmap.height)
                bitmap.getPixels(intArray, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
                val source = RGBLuminanceSource(bitmap.width, bitmap.height, intArray)
                val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
                val result = MultiFormatReader().decode(binaryBitmap)
                
                val payload = JSONObject(result.text)
                
                // Assert deviceId is UUID
                val deviceId = payload.getString("deviceId")
                assertThat(deviceId).matches("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
                
                // Assert secret is Base64 44-char (256-bit)
                val secret = payload.getString("secret")
                assertThat(secret.length).isEqualTo(44)
            }
        }
    }
}
