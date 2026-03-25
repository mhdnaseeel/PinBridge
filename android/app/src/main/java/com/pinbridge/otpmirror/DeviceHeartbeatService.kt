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

    private val TAG = "DeviceHeartbeatService"
    private val HEARTBEAT_INTERVAL_MS = 30_000L
    private val CHANNEL_ID = "PinBridgeHeartbeatChannel"
    private val NOTIFICATION_ID = 1001

    private var hasInternet = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var heartbeatJob: Job? = null
    private var deviceId: String? = null

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            hasInternet = true
            Log.d(TAG, "Network available")
        }

        override fun onLost(network: Network) {
            hasInternet = false
            Log.d(TAG, "Network lost")
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        
        // Initialize current state
        val activeNetwork = connectivityManager.activeNetwork
        val caps = connectivityManager.getNetworkCapabilities(activeNetwork)
        hasInternet = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        
        connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // ALWAYS call startForeground immediately to satisfy Android 8.0+ OS requirements and prevent ANR/crash loops
        startForeground(NOTIFICATION_ID, createNotification())

        deviceId = intent?.getStringExtra("deviceId") ?: prefs.getString(Constants.KEY_DEVICE_ID, null)
        
        if (deviceId == null) {
            Log.w(TAG, "No device ID found for heartbeat service. Stopping.")
            stopSelf()
            return START_NOT_STICKY
        }

        startHeartbeatLoop()
        
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

        return START_STICKY
    }

    private fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                sendHeartbeat()
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private suspend fun sendHeartbeat() {
        if (!hasInternet) {
            Log.w(TAG, "Skipping heartbeat: No internet")
            return
        }

        val id = deviceId ?: return
        
        try {
            pairingRepository.heartbeat()
            Log.d(TAG, "Heartbeat sent successfully to Firestore for $id")
        } catch (e: Exception) {
            Log.w(TAG, "Heartbeat error: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatJob?.cancel()
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
