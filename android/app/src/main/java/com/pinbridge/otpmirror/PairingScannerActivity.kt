package com.pinbridge.otpmirror

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Camera
import android.os.Bundle
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.Button
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.google.zxing.BinaryBitmap
import com.google.zxing.LuminanceSource
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.json.JSONObject

class PairingScannerActivity : ComponentActivity() {

    private val cameraPermission = Manifest.permission.CAMERA
    private var hasHandled = false
    private var camera: Camera? = null

    private val requestPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCameraPreview() else showPermissionDenied()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_pairing_scanner)

        findViewById<Button>(R.id.btnEnterManual).setOnClickListener {
            startActivity(Intent(this, ManualCodeEntryActivity::class.java))
            finish()
        }

        if (ContextCompat.checkSelfPermission(this, cameraPermission) == PackageManager.PERMISSION_GRANTED) {
            startCameraPreview()
        } else {
            requestPermission.launch(cameraPermission)
        }
    }

    private fun startCameraPreview() {
        val preview = findViewById<SurfaceView>(R.id.cameraPreview)
        val holder = preview.holder

        holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(surfaceHolder: SurfaceHolder) {
                try {
                    camera = Camera.open()
                    camera?.setPreviewDisplay(surfaceHolder)
                    camera?.setPreviewCallback { data, cam ->
                        val parameters = cam.parameters
                        val width = parameters.previewSize.width
                        val height = parameters.previewSize.height
                        processFrame(data, width, height)
                    }
                    camera?.startPreview()
                } catch (e: Exception) {
                    Toast.makeText(this@PairingScannerActivity, "Failed to open camera", Toast.LENGTH_SHORT).show()
                }
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                releaseCamera()
            }
        })
    }

    private fun processFrame(data: ByteArray, width: Int, height: Int) {
        if (hasHandled) return

        val source: LuminanceSource = PlanarYUVLuminanceSource(
            data, width, height, 0, 0, width, height, false
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))

        try {
            val result = QRCodeReader().decode(bitmap)
            val json = result.text
            val payload = JSONObject(json)

            val deviceId = payload.getString("deviceId")
            val secret = payload.getString("secret")
            
            // Note: The pairingCode is generated on Chrome and matched in ManualCodeEntryActivity.
            // When scanning QR, we don't necessarily need it unless we want to store it for reference.
            val pairingCode = payload.optString("pairingCode", "")

            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            val prefs = EncryptedSharedPreferences.create(
                Constants.PREFS_NAME,
                masterKeyAlias,
                this,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            prefs.edit()
                .putString(Constants.KEY_DEVICE_ID, deviceId)
                .putString(Constants.KEY_SECRET, secret)
                .putString(Constants.KEY_PAIRING_CODE, pairingCode)
                .apply()

            hasHandled = true
            PairingHelper.callPairFunctionAsync(this, deviceId, secret) {
                finish()
            }
        } catch (e: Exception) {
            // No QR found or parse error
        }
    }

    private fun releaseCamera() {
        camera?.stopPreview()
        camera?.setPreviewCallback(null)
        camera?.release()
        camera = null
    }

    override fun onPause() {
        super.onPause()
        releaseCamera()
    }

    private fun showPermissionDenied() {
        Toast.makeText(this, "Camera permission is required for pairing.", Toast.LENGTH_LONG).show()
        finish()
    }
}
