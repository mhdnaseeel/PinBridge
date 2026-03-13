package com.pinbridge.otpmirror

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiSelector
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Base64
import java.util.UUID

/**
 * End‑to‑end test that exercises the full flow:
 *   1️⃣ Launch PairingActivity → read QR → POST to /pair (Functions emulator)
 *   2️⃣ Sign‑in with the returned custom token
 *   3️⃣ Inject a fake SMS into the Android emulator
 *   4️⃣ Verify the OTP appears in Firestore (emulator) and decrypts to the original value
 */
@RunWith(AndroidJUnit4::class)
class E2ETest {

    private lateinit var context: Context
    private lateinit var uiDevice: UiDevice
    private val testOtp = "123456"

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        uiDevice = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Initialise Firebase
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId("test-project")
                .setApplicationId("1:1234567890:android:deadbeef")
                .setApiKey("fake-api-key")
                .build()
            FirebaseApp.initializeApp(context, options)
        }
        
        FirebaseAuth.getInstance().useEmulator("10.0.2.2", 9099)
    }

    @After
    fun tearDown() {
        FirebaseAuth.getInstance().signOut()
    }

    @Test
    fun `full flow from pairing QR to OTP appears in Firestore`() = runBlocking {
        // 1️⃣ Launch PairingActivity and extract the QR payload
        val scenario = androidx.test.core.app.ActivityScenario.launch(PairingActivity::class.java)
        var qrJson: String? = null
        scenario.onActivity { act ->
            val imageView = act.findViewById<android.widget.ImageView>(R.id.qrCodeImage)
            val bitmap = (imageView.drawable as android.graphics.drawable.BitmapDrawable).bitmap
            qrJson = decodeQr(bitmap)
        }
        
        assertThat(qrJson).isNotNull()
        val payload = JSONObject(qrJson!!)

        // 2️⃣ POST payload to the /pair Cloud Function (running on the emulator)
        val projectId = "{{FIREBASE_PROJECT_ID}}"
        val url = "http://10.0.2.2:5001/$projectId/us-central1/pair"

        val client = OkHttpClient()
        val body = payload.toString().toRequestBody("application/json".toMediaTypeOrNull())
        val request = Request.Builder().url(url).post(body).build()

        val response = client.newCall(request).execute()
        assertThat(response.isSuccessful).isTrue()
        val customToken = JSONObject(response.body?.string() ?: "").getString("customToken")

        // 3️⃣ Sign‑in with the custom token
        FirebaseAuth.getInstance().signInWithCustomToken(customToken).await()
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        assertThat(uid).isNotEmpty()

        // 4️⃣ Inject fake SMS (requires emulator)
        val smsCommand = "service call isms 7 i32 0 s16 \"com.android.mms\" s16 \"+15551234567\" s16 \"Your PinBridge code is $testOtp\" s16 \"\" s16 \"\""
        uiDevice.executeShellCommand(smsCommand)

        // 5️⃣ Wait for processing
        Thread.sleep(8000)

        // 6️⃣ Verify Firestore document via emulator REST API OR SDK
        val db = com.google.firebase.firestore.FirebaseFirestore.getInstance()
        db.useEmulator("10.0.2.2", 8080)
        
        val docSnap = db.collection("{{COLL_OTPS}}").document(uid!!).get().await()
        assertThat(docSnap.exists()).isTrue()
        
        val encryptedOtp = docSnap.getString("otp")!!
        val iv = docSnap.getString("iv")!!
        val secretB64 = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
            .getString(Constants.KEY_SECRET, null)!!

        val decrypted = CryptoUtil.decrypt(
            CryptoUtil.EncryptedData(cipher = encryptedOtp, iv = iv),
            Base64.getDecoder().decode(secretB64)
        )
        assertThat(decrypted).isEqualTo(testOtp)
        scenario.close()
    }

    private fun decodeQr(bitmap: android.graphics.Bitmap): String? {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val source = com.google.zxing.RGBLuminanceSource(width, height, pixels)
        val binaryBitmap = com.google.zxing.BinaryBitmap(com.google.zxing.common.HybridBinarizer(source))
        return try { com.google.zxing.qrcode.QRCodeReader().decode(binaryBitmap).text } catch (e: Exception) { null }
    }
}
