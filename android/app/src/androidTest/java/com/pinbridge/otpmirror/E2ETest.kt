package com.pinbridge.otpmirror

import android.content.Context
import android.util.Base64
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.google.common.truth.Truth.assertThat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class E2ETest {

    private lateinit var device: UiDevice
    private lateinit var context: Context

    @Before
    fun setup() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        context = InstrumentationRegistry.getInstrumentation().targetContext
        
        // Point to emulators
        FirebaseAuth.getInstance().useEmulator("10.0.2.2", 9099)
        FirebaseFirestore.getInstance().firestoreSettings = FirebaseFirestoreSettings.Builder()
            .setHost("10.0.2.2:8080")
            .setSslEnabled(false)
            .build()
    }

    @Test
    fun testFullFlow_OtpCaptureToFirestore() {
        ActivityScenario.launch(PairingActivity::class.java).use { scenario ->
            var qrText = ""
            scenario.onActivity { activity ->
                val imageView = activity.findViewById<android.widget.ImageView>(R.id.qrCodeImage)
                val bitmap = (imageView.drawable as android.graphics.drawable.BitmapDrawable).bitmap
                val intArray = IntArray(bitmap.width * bitmap.height)
                bitmap.getPixels(intArray, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
                val source = RGBLuminanceSource(bitmap.width, bitmap.height, intArray)
                val binaryBitmap = BinaryBitmap(HybridBinarizer(source))
                qrText = MultiFormatReader().decode(binaryBitmap).text
            }

            val payload = JSONObject(qrText)
            val deviceId = payload.getString("deviceId")
            val secret = payload.getString("secret")

            // 1. Call Cloud Function emulator to get custom token
            val client = OkHttpClient()
            val request = Request.Builder()
                .url("http://10.0.2.2:5001/{{FIREBASE_PROJECT_ID}}/us-central1/pair")
                .post(qrText.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            assertThat(response.isSuccessful).isTrue()
            val customToken = JSONObject(response.body?.string()!!).getString("customToken")

            // 2. Sign in with custom token (simulating extension pairing)
            FirebaseAuth.getInstance().signInWithCustomToken(customToken).await()
            val uid = FirebaseAuth.getInstance().currentUser!!.uid

            // 3. Inject SMS via ADB
            device.executeShellCommand("service call isms 7 i32 0 s16 \"com.android.mms\" s16 \"+15551234567\" s16 \"Your code is 123456\" s16 \"\" s16 \"\"")
            
            // 4. Wait for Firestore document
            val db = FirebaseFirestore.getInstance()
            var found = false
            for (i in 1..10) {
                val doc = db.collection("{{COLL_OTPS}}").document(uid).get().await()
                if (doc.exists()) {
                    val encryptedData = CryptoUtil.EncryptedData(
                        cipher = doc.getString("otp")!!,
                        iv = doc.getString("iv")!!
                    )
                    val decrypted = CryptoUtil.decrypt(encryptedData, Base64.decode(secret, Base64.NO_WRAP))
                    assertThat(decrypted).isEqualTo("123456")
                    found = true
                    break
                }
                Thread.sleep(2000)
            }
            assertThat(found).isTrue()
        }
    }
}
