package com.pinbridge.otpmirror

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.pinbridge.otpmirror.data.PairingRepository
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.inject.Inject

@AndroidEntryPoint
class PairingScannerActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: PairingRepository

    private val cameraPermission = Manifest.permission.CAMERA
    private var hasHandled = false
    private lateinit var cameraExecutor: ExecutorService

    private val requestPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera() else showPermissionDenied()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_pairing_scanner)

        cameraExecutor = Executors.newSingleThreadExecutor()

        findViewById<Button>(R.id.btnCancelScanner).setOnClickListener {
            finish()
        }

        findViewById<Button>(R.id.btnEnterManual).setOnClickListener {
            startActivity(Intent(this, ManualCodeEntryActivity::class.java))
            finish()
        }

        if (ContextCompat.checkSelfPermission(this, cameraPermission) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            requestPermission.launch(cameraPermission)
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider: ProcessCameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder()
                .build()
                .also {
                    it.setSurfaceProvider(findViewById<PreviewView>(R.id.cameraPreview).surfaceProvider)
                }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImageProxy(imageProxy)
                    }
                }

            val selector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(this, selector, preview, imageAnalyzer)
            } catch (exc: Exception) {
                Log.e("PairingScanner", "Use case binding failed", exc)
            }

        }, ContextCompat.getMainExecutor(this))
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun processImageProxy(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage != null && !hasHandled) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            val scanner = BarcodeScanning.getClient()

            scanner.process(image)
                .addOnSuccessListener { barcodes ->
                    for (barcode in barcodes) {
                        val rawValue = barcode.rawValue
                        if (rawValue != null) {
                            handleQrResult(rawValue)
                            break
                        }
                    }
                }
                .addOnFailureListener {
                    Log.e("PairingScanner", "Barcode scanning failed", it)
                }
                .addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    private fun handleQrResult(json: String) {
        if (hasHandled) return
        try {
            val payload = JSONObject(json)
            val deviceId = payload.getString("deviceId")
            val secret = payload.getString("secret")
            // pairingCode is optional in QR
            
            hasHandled = true
            lifecycleScope.launch {
                try {
                    pairingRepository.pairWithQr(deviceId, secret)
                    Toast.makeText(this@PairingScannerActivity, "Paired successfully", Toast.LENGTH_LONG).show()
                    finish()
                } catch (e: Exception) {
                    hasHandled = false
                    Toast.makeText(this@PairingScannerActivity, "Pairing failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        } catch (e: Exception) {
            // Not a valid PinBridge QR or other error
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
    }

    private fun showPermissionDenied() {
        Toast.makeText(this, "Camera permission is required for pairing.", Toast.LENGTH_LONG).show()
        finish()
    }
}
