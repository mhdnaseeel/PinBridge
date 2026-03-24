package com.pinbridge.otpmirror

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * Utility class to request READ_SMS & RECEIVE_SMS permissions at runtime.
 */
class SmsPermissionHelper(
    private val activity: ComponentActivity,
    private val onResult: (granted: Boolean) -> Unit
) {
    private val permissionLauncher: ActivityResultLauncher<Array<String>> = 
        activity.registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { permissions ->
            val granted = permissions[Manifest.permission.READ_SMS] == true &&
                    permissions[Manifest.permission.RECEIVE_SMS] == true
            onResult(granted)
        }

    fun requestPermissions() {
        val readSmsGranted = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED

        val receiveSmsGranted = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.RECEIVE_SMS
        ) == PackageManager.PERMISSION_GRANTED

        if (readSmsGranted && receiveSmsGranted) {
            onResult(true)
        } else {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.READ_SMS,
                    Manifest.permission.RECEIVE_SMS
                )
            )
        }
    }
}
