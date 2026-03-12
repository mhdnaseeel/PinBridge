package com.pinbridge.otpmirror

import android.graphics.Bitmap
import android.os.Bundle
import android.util.Base64
import androidx.appcompat.app.AppCompatActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.google.firebase.firestore.FirebaseFirestore
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeEncoder
import com.pinbridge.otpmirror.databinding.ActivityPairingBinding
import java.security.SecureRandom
import java.util.*

class PairingActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPairingBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPairingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupPairing()
    }

    private fun setupPairing() {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        val sharedPrefs = EncryptedSharedPreferences.create(
            Constants.PREFS_NAME,
            masterKeyAlias,
            this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        var deviceId = sharedPrefs.getString(Constants.KEY_DEVICE_ID, null)
        var secret = sharedPrefs.getString(Constants.KEY_SECRET, null)

        if (deviceId == null || secret == null) {
            deviceId = UUID.randomUUID().toString()
            val secretBytes = ByteArray(32)
            SecureRandom().nextBytes(secretBytes)
            secret = Base64.encodeToString(secretBytes, Base64.NO_WRAP)

            sharedPrefs.edit().apply {
                putString(Constants.KEY_DEVICE_ID, deviceId)
                putString(Constants.KEY_SECRET, secret)
                apply()
            }
        }

        binding.pairingInfo.text = "Device ID: $deviceId"

        // Register pairing in Firestore
        val auth = FirebaseAuth.getInstance()
        val db = FirebaseFirestore.getInstance()
        
        fun savePairing() {
            db.collection(Constants.COLL_PAIRINGS).document(deviceId).set(
                mapOf(
                    "secret" to secret,
                    "createdAt" to com.google.firebase.Timestamp.now()
                )
            )
        }

        if (auth.currentUser == null) {
            auth.signInAnonymously().addOnSuccessListener { savePairing() }
        } else {
            savePairing()
        }

        // Generate QR Code
        val qrData = "{\"deviceId\":\"$deviceId\",\"secret\":\"$secret\"}"
        try {
            val barcodeEncoder = BarcodeEncoder()
            val bitmap: Bitmap = barcodeEncoder.encodeBitmap(qrData, BarcodeFormat.QR_CODE, 400, 400)
            binding.qrCodeImage.setImageBitmap(bitmap)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
