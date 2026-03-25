package com.pinbridge.otpmirror

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import com.pinbridge.otpmirror.data.PairingRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

@AndroidEntryPoint
class DeviceHeartbeatService : Service() {

    @Inject
    lateinit var auth: FirebaseAuth
    
    @Inject
    lateinit var pairingRepository: PairingRepository

    @Inject
    lateinit var prefs: android.content.SharedPreferences

    @Inject
    lateinit var rtdb: FirebaseDatabase

    private val TAG = "DeviceHeartbeatService"
    private val CHANNEL_ID = "PinBridgeHeartbeatChannel"
    private val NOTIFICATION_ID = 1001

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var deviceId: String? = null

    private fun updateStatus(online: Boolean) {
        val id = deviceId ?: return
        val statusRef = rtdb.getReference("status/$id")
        if (online) {
            statusRef.onDisconnect().setValue(
                mapOf(
                    "state" to "offline",
                    "last_changed" to ServerValue.TIMESTAMP
                )
            )
            statusRef.setValue(
                mapOf(
                    "state" to "online",
                    "last_changed" to ServerValue.TIMESTAMP
                )
            )
        } else {
            statusRef.setValue(
                mapOf(
                    "state" to "offline",
                    "last_changed" to ServerValue.TIMESTAMP
                )
            )
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.d(TAG, "Network validated and available")
            updateStatus(true)
        }

        override fun onLost(network: Network) {
            Log.d(TAG, "Network lost - Relying on Server-side onDisconnect for status precision")
            // REMOVED explicit updateStatus(false) to prevent 'offline jitter' during blips.
            // The Firebase server will trigger onDisconnect if the connection is truly lost.
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        
        // Initialize deviceId early to avoid race conditions with network callbacks
        deviceId = prefs.getString(Constants.KEY_DEVICE_ID, null)
        
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            .build()
        
        connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
        
        // Listen for remote fetch requests from the Extension
        scope.launch {
            pairingRepository.remoteFetchRequest.collect {
                Log.d(TAG, "Remote fetch request received for: $deviceId")
                val result = SmsRetriever.getLatestOtp(this@DeviceHeartbeatService)
                if (result != null) {
                    val (otp, timestamp) = result
                    OtpUploader.enqueue(this@DeviceHeartbeatService, otp, "Remote Fetch", timestamp)
                } else {
                    Log.w(TAG, "No OTP found for remote fetch request")
                }
            }
        }
    }

    private var heartbeatJob: Job? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // ALWAYS call startForeground immediately
        startForeground(NOTIFICATION_ID, createNotification())

        val intentDeviceId = intent?.getStringExtra("deviceId")
        if (intentDeviceId != null) {
            deviceId = intentDeviceId
        }
        
        if (deviceId == null) {
            Log.w(TAG, "No device ID found for heartbeat service. Stopping.")
            stopSelf()
            return START_NOT_STICKY
        }

        // 1. Initial manual check and immediate announcement
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = connectivityManager.activeNetwork
        val caps = connectivityManager.getNetworkCapabilities(activeNetwork)
        val isInitiallyOnline = caps != null && 
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && 
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        
        updateStatus(isInitiallyOnline)
        
        // 2. Proactive Heartbeat Loop (Protects against accidental onDisconnect server triggers)
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                if (isInternetAvailable()) {
                    Log.d(TAG, "Periodic heartbeat: Re-asserting online status")
                    updateStatus(true)
                }
                delay(20_000) // 20 seconds
            }
        }
        
        return START_STICKY
    }

    private fun isInternetAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && 
               capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    override fun onDestroy() {
        super.onDestroy()
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "PinBridge Heartbeat",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PinBridge Service")
            .setContentText("Monitoring connectivity...")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        fun start(context: Context, deviceId: String) {
            val intent = Intent(context, DeviceHeartbeatService::class.java).apply {
                putExtra("deviceId", deviceId)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, DeviceHeartbeatService::class.java)
            context.stopService(intent)
        }
    }
}
