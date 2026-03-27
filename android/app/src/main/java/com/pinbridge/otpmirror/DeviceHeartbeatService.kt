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
import com.pinbridge.otpmirror.data.PairingRepository
import dagger.hilt.android.AndroidEntryPoint
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
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
    private val CHANNEL_ID = "PinBridgeHeartbeatChannel"
    private val NOTIFICATION_ID = 1001

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var deviceId: String? = null
    private var socket: Socket? = null

    private fun connectSocket() {
        val id = deviceId ?: return
        if (socket?.connected() == true) return

        scope.launch {
            try {
                Log.d(TAG, "Fetching auth token for handshake...")
                val token = auth.currentUser?.getIdToken(true)?.await()?.token
                if (token == null) {
                    Log.e(TAG, "No Firebase user or token available")
                    return@launch
                }

                val opts = IO.Options().apply {
                    forceNew = true
                    reconnection = true
                    // Handshake data
                    auth = mapOf(
                        "token" to token,
                        "deviceId" to id,
                        "clientType" to "device"
                    )
                }
                
                Log.d(TAG, "Initiating socket connection to ${Constants.SOCKET_SERVER_URL} with deviceId: $id")
                socket = IO.socket(Constants.SOCKET_SERVER_URL, opts)

                socket?.on(Socket.EVENT_CONNECT) {
                    Log.d(TAG, "SUCCESS: Socket connected & authenticated via handshake")
                    startHeartbeatLoop()
                }

                socket?.on(Socket.EVENT_DISCONNECT) {
                    Log.w(TAG, "Socket disconnected! Reason: $it")
                }

                socket?.on(Socket.EVENT_CONNECT_ERROR) {
                    val err = it?.getOrNull(0)
                    Log.e(TAG, "Socket connection error: $err")
                }

                socket?.connect()
            } catch (e: Exception) {
                Log.e(TAG, "Fatal error during socket setup: ${e.message}")
            }
        }
    }

    private var heartbeatJob: Job? = null
    private fun startHeartbeatLoop() {
        Log.d(TAG, "Starting heartbeat loop (15s interval)")
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && socket?.connected() == true) {
                Log.v(TAG, "Emitting heartbeat to server...")
                socket?.emit("heartbeat")
                delay(15000) // Every 15 seconds (Server TTL is 35s, Watchdog is 40s)
            }
            Log.d(TAG, "Heartbeat loop stopped (socket disconnected or job cancelled)")
        }
    }

    private fun disconnectSocket() {
        heartbeatJob?.cancel()
        socket?.disconnect()
        socket = null
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.d(TAG, "Network available - Connecting socket")
            connectSocket()
        }

        override fun onLost(network: Network) {
            Log.d(TAG, "Network lost - Disconnecting socket")
            disconnectSocket()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        
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
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, createNotification())

        val intentDeviceId = intent?.getStringExtra("deviceId")
        if (intentDeviceId != null) {
            deviceId = intentDeviceId
        }
        
        if (deviceId == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (isInternetAvailable()) {
            connectSocket()
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
        disconnectSocket()
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivityManager.unregisterNetworkCallback(networkCallback)
        scope.cancel()
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
            .setContentText("Monitoring connectivity via Socket.IO...")
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
