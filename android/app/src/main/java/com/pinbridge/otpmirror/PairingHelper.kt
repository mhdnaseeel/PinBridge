package com.pinbridge.otpmirror

import android.content.Context
import android.util.Log
import android.widget.Toast
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.Timestamp
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
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
            // With Spark Plan / Functionless, we rely on Anonymous Auth
            val auth = FirebaseAuth.getInstance()
            if (auth.currentUser == null) {
                auth.signInAnonymously().await()
            }
            // Logic: The QR code already contains the deviceId and secret. 
            // We just need to be authenticated to read/write the 'otps' collection later.
            Log.i(TAG, "Paired via QR successfully – DeviceID = $deviceId")
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
     * We query Firestore 'pairings' collection for a document with this code.
     */
    fun callPairFunctionAsyncWithCode(context: Context, code: String, onComplete: () -> Unit = {}) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val db = FirebaseFirestore.getInstance()
                val auth = FirebaseAuth.getInstance()
                
                if (auth.currentUser == null) {
                    auth.signInAnonymously().await()
                }

                // Query for the pairing code
                val query = db.collection(Constants.COLL_PAIRINGS)
                    .whereEqualTo("pairingCode", code)
                    .limit(1)
                    .get()
                    .await()

                if (query.isEmpty) {
                    throw Exception("Invalid code or pairing session expired.")
                }

                val doc = query.documents[0]
                val deviceId = doc.id
                val secret = doc.getString("secret") ?: throw Exception("Secret missing from pairing session.")

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

                Toast.makeText(context, "Paired successfully with code", Toast.LENGTH_LONG).show()
                onComplete()
            } catch (ex: Exception) {
                Log.e(TAG, "Code mapping failed", ex)
                Toast.makeText(context, "Code pairing failed: ${ex.localizedMessage}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
