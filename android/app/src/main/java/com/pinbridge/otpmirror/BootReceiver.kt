package com.pinbridge.otpmirror

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Restarts the DeviceHeartbeatService after device reboot.
 * Only starts the service if the user was previously paired.
 */
class BootReceiver : BroadcastReceiver() {

    private val TAG = "BootReceiver"

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

        Log.i(TAG, "Device rebooted — checking pairing status")

        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            val prefs = EncryptedSharedPreferences.create(
                context,
                Constants.PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )

            val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null)
            val isPaired = prefs.getBoolean(Constants.KEY_IS_PAIRED, false)

            if (isPaired && deviceId != null) {
                Log.i(TAG, "Device is paired (ID: ${deviceId.take(8)}...) — starting heartbeat service")
                DeviceHeartbeatService.start(context, deviceId)
            } else {
                Log.i(TAG, "Device is not paired — skipping service start")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check pairing status on boot", e)
        }
    }
}
