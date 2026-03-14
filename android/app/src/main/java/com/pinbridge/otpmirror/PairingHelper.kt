package com.pinbridge.otpmirror

import android.content.Context
import android.util.Log
import android.widget.Toast
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Small utility used by both PairingScannerActivity and ManualCodeEntryActivity.
 * It POSTS {deviceId, secret} to the Cloud Function “/pair” and signs‑in
 * with the returned custom token.
 */
object PairingHelper {

    private const val TAG = "PairingHelper"

    suspend fun callPairFunction(context: Context, deviceId: String, secret: String) {
        try {
            val payload = mapOf("deviceId" to deviceId, "secret" to secret)
            val functions = FirebaseFunctions.getInstance()
            // Cloud Functions emulator endpoint – the host is reachable from the device via 10.0.2.2
            // For production, comment out useEmulator
            functions.useEmulator("10.0.2.2", 5001)

            val result = functions
                .getHttpsCallable("pair")
                .call(payload)
                .await()

            val token = (result.data as Map<*, *>)["customToken"] as? String
                ?: throw IllegalStateException("customToken missing")

            // Sign in with the custom token
            FirebaseAuth.getInstance().signInWithCustomToken(token).await()

            Log.i(TAG, "Paired successfully – UID = ${FirebaseAuth.getInstance().currentUser?.uid}")
        } catch (e: Exception) {
            Log.e(TAG, "Pairing failed", e)
            throw e
        }
    }

    // Kotlin‑friendly wrapper for above (used from UI threads)
    fun callPairFunctionAsync(context: Context, deviceId: String, secret: String, onComplete: () -> Unit = {}) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                withContext(Dispatchers.IO) {
                    callPairFunction(context, deviceId, secret)
                }
                Toast.makeText(context, "Paired successfully", Toast.LENGTH_LONG).show()
                onComplete()
            } catch (ex: Exception) {
                Toast.makeText(context, "Pairing failed: ${ex.localizedMessage}", Toast.LENGTH_LONG).show()
            }
        }
    }

    /**
     * Fallback: Pair using only the 6‑digit code.
     * This requires the backend to have a temporary mapping of code -> {deviceId, secret}.
     */
    fun callPairFunctionAsyncWithCode(context: Context, code: String, onComplete: () -> Unit = {}) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val functions = FirebaseFunctions.getInstance()
                functions.useEmulator("10.0.2.2", 5001)

                val result = functions
                    .getHttpsCallable("pairWithCode")
                    .call(mapOf("code" to code))
                    .await()

                val data = result.data as Map<*, *>
                val token = data["customToken"] as String
                val deviceId = data["deviceId"] as String
                val secret = data["secret"] as String

                // Store credentials locally
                val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                val prefs = EncryptedSharedPreferences.create(
                    Constants.PREFS_NAME,
                    masterKeyAlias,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
                prefs.edit()
                    .putString(Constants.KEY_DEVICE_ID, deviceId)
                    .putString(Constants.KEY_SECRET, secret)
                    .apply()

                FirebaseAuth.getInstance().signInWithCustomToken(token).await()
                
                Toast.makeText(context, "Paired successfully with code", Toast.LENGTH_LONG).show()
                onComplete()
            } catch (ex: Exception) {
                Toast.makeText(context, "Code pairing failed: ${ex.localizedMessage}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
