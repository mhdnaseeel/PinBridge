package com.pinbridge.otpmirror.data

import android.content.SharedPreferences
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.pinbridge.otpmirror.Constants
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

interface PairingRepository {
    val pairingStatus: StateFlow<Boolean>
    suspend fun pairWithQr(deviceId: String, secret: String)
    suspend fun pairWithCode(code: String)
    fun isPaired(): Boolean
}

class PairingRepositoryImpl constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val prefs: SharedPreferences
) : PairingRepository {

    private val TAG = "PairingRepository"
    
    private val _pairingStatus = MutableStateFlow(isPaired())
    override val pairingStatus = _pairingStatus.asStateFlow()

    override suspend fun pairWithQr(deviceId: String, secret: String) {
        try {
            if (auth.currentUser == null) {
                auth.signInAnonymously().await()
            }
            // Mark as paired in Firestore
            db.collection(Constants.COLL_PAIRINGS).document(deviceId)
                .update("paired", true, "pairedAt", com.google.firebase.firestore.FieldValue.serverTimestamp())
                .await()
            
            saveCredentials(deviceId, secret)
            Log.i(TAG, "Paired via QR successfully – DeviceID = $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "QR Pairing failed", e)
            throw e
        }
    }

    override suspend fun pairWithCode(code: String) {
        try {
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
 
            // Mark as paired in Firestore
            db.collection(Constants.COLL_PAIRINGS).document(deviceId)
                .update("paired", true, "pairedAt", com.google.firebase.firestore.FieldValue.serverTimestamp())
                .await()

            saveCredentials(deviceId, secret)
            Log.i(TAG, "Paired via Code successfully – DeviceID = $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "Code pairing failed", e)
            throw e
        }
    }

    override fun isPaired(): Boolean {
        return prefs.getBoolean(Constants.KEY_IS_PAIRED, false)
    }

    private fun saveCredentials(deviceId: String, secret: String) {
        prefs.edit()
            .putString(Constants.KEY_DEVICE_ID, deviceId)
            .putString(Constants.KEY_SECRET, secret)
            .putBoolean(Constants.KEY_IS_PAIRED, true)
            .apply()
        _pairingStatus.value = true
    }
    }
}
