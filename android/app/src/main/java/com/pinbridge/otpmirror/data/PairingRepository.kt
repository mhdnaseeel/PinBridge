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
    fun isPaired(): Boolean
    fun getDeviceId(): String?
    fun getSecret(): String?
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
    private var lastFetchRequested: com.google.firebase.Timestamp? = null

    init {
        startStatusListener()
        startHeartbeatIfPaired()
    }

    private fun startHeartbeatIfPaired() {
        val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null)
        if (isPaired() && deviceId != null) {
            Log.i(TAG, "Device is already paired. Starting heartbeat service on initialization.")
            DeviceHeartbeatService.start(context, deviceId)
        }
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
                    // Only unpair if we were previously paired, the document is truly gone from the server, and this isn't a stale cached read
                    if (_pairingStatus.value && snapshot?.metadata?.isFromCache == false && snapshot.metadata?.hasPendingWrites() != true) {
                        Log.i(TAG, "Triggering local unpair due to missing Firestore document.")
                        clearLocalCredentials()
                    }
                } else if (snapshot.getBoolean("paired") != true) {
                    Log.i(TAG, "Snapshot exists but 'paired' field is false/missing for $deviceId.")
                    if (_pairingStatus.value && snapshot.metadata.isFromCache == false && snapshot.metadata.hasPendingWrites() != true) {
                        Log.i(TAG, "Triggering local unpair due to 'paired' field change.")
                        clearLocalCredentials()
                    }
                } else if (snapshot.contains("fetchRequested")) {
                    val newTs = snapshot.getTimestamp("fetchRequested")
                    if (newTs != null && (lastFetchRequested == null || newTs.compareTo(lastFetchRequested!!) > 0)) {
                        lastFetchRequested = newTs
                        Log.i(TAG, "Remote fetch request signal received (new timestamp).")
                        CoroutineScope(Dispatchers.Main).launch {
                            _remoteFetchRequest.emit(Unit)
                        }
                    } else {
                        Log.d(TAG, "fetchRequested field exists but has not changed or is in the past. Ignoring.")
                    }
                }
            }
    }

    private fun clearLocalCredentials() {
        Log.i(TAG, "Clearing local credentials and stopping listeners.")
        statusListener?.remove()
        statusListener = null
        // Stop the heartbeat service — device is no longer paired
        DeviceHeartbeatService.stop(context)
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

            // Validate Google account match
            val pairingDoc = db.collection(Constants.COLL_PAIRINGS).document(deviceId).get().await()
            val extensionGoogleUid = pairingDoc.getString("googleUid")
            validateGoogleAccountMatch(extensionGoogleUid)

            completePairing(deviceId, secret)
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

            // Validate Google account match
            val extensionGoogleUid = doc.getString("googleUid")
            validateGoogleAccountMatch(extensionGoogleUid)

            completePairing(deviceId, secret)
            Log.i(TAG, "Code pairing successfully – DeviceID = $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "Code pairing failed", e)
            throw e
        }
    }

    /**
     * Validates that the current Firebase user's Google UID matches the extension's UID.
     * Throws if there's a mismatch.
     */
    private fun validateGoogleAccountMatch(extensionGoogleUid: String?) {
        val googleUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
        val isGoogleSignedIn = googleUser != null && googleUser.isAnonymous == false
        if (extensionGoogleUid != null && isGoogleSignedIn && extensionGoogleUid != googleUser?.uid) {
            throw Exception("Account mismatch. The extension is signed in with a different Google account. Please use the same account on both devices.")
        }
    }

    /**
     * Shared pairing completion logic used by both pairWithQr and pairWithCode.
     * Writes pairing data to Firestore, saves credentials locally, syncs to cloud,
     * starts the status listener, and starts the heartbeat service.
     */
    private suspend fun completePairing(deviceId: String, secret: String) {
        val pairingData = hashMapOf(
            "paired" to true,
            "pairedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
            "secret" to secret
        )
        db.collection(Constants.COLL_PAIRINGS).document(deviceId)
            .set(pairingData, com.google.firebase.firestore.SetOptions.merge())
            .await()

        // Security (V-19): Remove secret from Firestore after both sides have it.
        // The secret should only exist in local encrypted storage, not in the database.
        try {
            db.collection(Constants.COLL_PAIRINGS).document(deviceId)
                .update("secret", com.google.firebase.firestore.FieldValue.delete())
                .await()
            Log.i(TAG, "Secret removed from Firestore pairing document (V-19)")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to remove secret from Firestore (non-critical)", e)
        }

        saveCredentials(deviceId, secret)
        syncPairingToCloud(deviceId, secret)
        startStatusListener()
        DeviceHeartbeatService.start(context, deviceId)
    }

    override suspend fun unpair() {
        val deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null) ?: return
        try {
            // Stop heartbeat service
            DeviceHeartbeatService.stop(context)
            // Remove from Firestore
            db.collection(Constants.COLL_PAIRINGS).document(deviceId).delete().await()
            db.collection(Constants.COLL_OTPS).document(deviceId).delete().await()
            // Remove cloud sync document so reinstalling won't auto-pair from stale data
            deleteCloudSyncDoc()
            Log.i(TAG, "Unpaired from Firestore: $deviceId")
        } catch (e: Exception) {
            Log.e(TAG, "Error unpairing from Firestore", e)
        } finally {
            clearLocalCredentials()
        }
    }

    override fun isPaired(): Boolean {
        return prefs.getBoolean(Constants.KEY_IS_PAIRED, false)
    }

    override fun getDeviceId(): String? {
        return prefs.getString(Constants.KEY_DEVICE_ID, null)
    }

    override fun getSecret(): String? {
        return prefs.getString(Constants.KEY_SECRET, null)
    }

    private fun saveCredentials(deviceId: String, secret: String) {
        prefs.edit()
            .putString(Constants.KEY_DEVICE_ID, deviceId)
            .putString(Constants.KEY_SECRET, secret)
            .putBoolean(Constants.KEY_IS_PAIRED, true)
            .apply()
        _pairingStatus.value = true
    }

    /**
     * Writes pairing data to Firestore under the signed-in user's UID
     * so other platforms (extension, web) can auto-pair via cloud sync.
     */
    private fun syncPairingToCloud(deviceId: String, secret: String) {
        val uid = auth.currentUser?.uid ?: return
        // Only sync for non-anonymous (Google sign-in) users
        if (auth.currentUser?.isAnonymous == true) return
        try {
            val syncData = hashMapOf(
                "deviceId" to deviceId,
                "secret" to secret,
                "pairedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp()
            )
            db.collection("users").document(uid)
                .collection("mirroring").document("active")
                .set(syncData)
                .addOnSuccessListener { Log.i(TAG, "Cloud sync: pairing data written for UID=$uid") }
                .addOnFailureListener { Log.w(TAG, "Cloud sync failed", it) }
        } catch (e: Exception) {
            Log.w(TAG, "Cloud sync error", e)
        }
    }

    /**
     * Deletes the cloud sync document so reinstalling the app with the same
     * Google account won't auto-pair from stale data.
     */
    private fun deleteCloudSyncDoc() {
        val uid = auth.currentUser?.uid ?: return
        if (auth.currentUser?.isAnonymous == true) return
        try {
            db.collection("users").document(uid)
                .collection("mirroring").document("active")
                .delete()
                .addOnSuccessListener { Log.i(TAG, "Cloud sync doc deleted for UID=$uid") }
                .addOnFailureListener { Log.w(TAG, "Failed to delete cloud sync doc", it) }
        } catch (e: Exception) {
            Log.w(TAG, "Error deleting cloud sync doc", e)
        }
    }
}
