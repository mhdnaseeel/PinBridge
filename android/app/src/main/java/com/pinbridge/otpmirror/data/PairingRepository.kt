package com.pinbridge.otpmirror.data

import android.content.SharedPreferences
import android.content.Context
import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.pinbridge.otpmirror.Constants
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.pinbridge.otpmirror.DeviceHeartbeatService
import javax.inject.Inject

interface PairingRepository {
    val pairingStatus: StateFlow<Boolean>
    suspend fun pairWithQr(deviceId: String, secret: String)
    suspend fun pairWithCode(code: String)
    suspend fun unpair()
    suspend fun heartbeat()
    suspend fun setOnlineStatus(online: Boolean)
    suspend fun setOnlineStatusAtomically(online: Boolean)
    fun isPaired(): Boolean
    val remoteFetchRequest: SharedFlow<Unit>
}

class PairingRepositoryImpl constructor(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
    private val prefs: SharedPreferences,
    private val context: Context
) : PairingRepository {

    private val TAG = "PairingRepository"
    
    private val _pairingStatus = MutableStateFlow(isPaired())
    override val pairingStatus = _pairingStatus.asStateFlow()

    private val _remoteFetchRequest = MutableSharedFlow<Unit>(replay = 0)
    override val remoteFetchRequest = _remoteFetchRequest.asSharedFlow()

    private var statusListener: com.google.firebase.firestore.ListenerRegistration? = null

    init {
        startStatusListener()
    }

    private fun startStatusListener() {
        val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null) ?: return
        statusListener?.remove()
        statusListener = db.collection(Constants.COLL_PAIRINGS).document(deviceId)
            .addSnapshotListener { snapshot, e ->
                if (e != null) {
                    Log.w(TAG, "Listen failed for device $deviceId", e)
                    return@addSnapshotListener
                }

                if (snapshot == null || !snapshot.exists()) {
                    Log.i(TAG, "Snapshot for device $deviceId does not exist or was deleted.")
                    // Only unpair if we were previously paired and the document is truly gone from the server
                    if (_pairingStatus.value && snapshot?.metadata?.hasPendingWrites() != true) {
                        Log.i(TAG, "Triggering local unpair due to missing Firestore document.")
                        clearLocalCredentials()
                    }
                } else if (snapshot.getBoolean("paired") != true) {
                    Log.i(TAG, "Snapshot exists but 'paired' field is false/missing for $deviceId.")
                    if (_pairingStatus.value && snapshot.metadata.hasPendingWrites() != true) {
                        Log.i(TAG, "Triggering local unpair due to 'paired' field change.")
                        clearLocalCredentials()
                    }
                } else if (snapshot.contains("fetchRequested")) {
                    Log.i(TAG, "Remote fetch request signal received.")
                    CoroutineScope(Dispatchers.Main).launch {
                        _remoteFetchRequest.emit(Unit)
                    }
                }
            }
    }

    private fun clearLocalCredentials() {
        Log.i(TAG, "Clearing local credentials and stopping listeners.")
        statusListener?.remove()
        statusListener = null
        prefs.edit()
            .remove(Constants.KEY_DEVICE_ID)
            .remove(Constants.KEY_SECRET)
            .putBoolean(Constants.KEY_IS_PAIRED, false)
            .apply()
        _pairingStatus.value = false
        Log.i(TAG, "Local credentials cleared. pairingStatus flow updated to 'false'.")
    }

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
            startStatusListener()
            // Start heartbeat service
            DeviceHeartbeatService.start(context, deviceId)
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
            startStatusListener()
            // Start heartbeat service
            DeviceHeartbeatService.start(context, deviceId)
            Log.i(TAG, "Code pairing successfully – DeviceID = $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "Code pairing failed", e)
            throw e
        }
    }

    override suspend fun unpair() {
        val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null) ?: return
        try {
            // Stop heartbeat service
            DeviceHeartbeatService.stop(context)
            // Remove from Firestore
            db.collection(Constants.COLL_PAIRINGS).document(deviceId).delete().await()
            db.collection(Constants.COLL_OTPS).document(deviceId).delete().await()
            Log.i(TAG, "Unpaired from Firestore: $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "Error unpairing from Firestore", e)
        } finally {
            clearLocalCredentials()
        }
    }

    private var lastHeartbeatTimestamp: Long = 0

    override suspend fun heartbeat() {
        val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null) ?: return
        val now = System.currentTimeMillis()
        // Skip if a heartbeat was sent less than 25s ago (interval is 30s)
        if (now - lastHeartbeatTimestamp < 25_000) return
        try {
            db.collection(Constants.COLL_PAIRINGS).document(deviceId)
                .update(
                    "lastSeen", com.google.firebase.firestore.FieldValue.serverTimestamp(),
                    "isOnline", true
                )
                .await()
            lastHeartbeatTimestamp = now
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat failed", e)
        }
    }

    override suspend fun setOnlineStatus(online: Boolean) {
        setOnlineStatusAtomically(online)
    }

    override suspend fun setOnlineStatusAtomically(online: Boolean) {
        val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null) ?: return
        try {
            val data = hashMapOf<String, Any>(
                "isOnline" to online,
                "lastSeen" to if (online) com.google.firebase.firestore.FieldValue.serverTimestamp() else com.google.firebase.firestore.FieldValue.delete()
            )
            db.collection(Constants.COLL_PAIRINGS)
                .document(deviceId)
                .update(data)
                .await()
            Log.i(TAG, "Set online status atomically to $online for $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set online status atomically", e)
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
