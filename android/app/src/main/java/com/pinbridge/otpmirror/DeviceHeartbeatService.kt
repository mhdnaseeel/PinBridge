package com.pinbridge.otpmirror

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
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
    private var wakeLock: PowerManager.WakeLock? = null

    // Exponential backoff for socket reconnection
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    private val maxReconnectDelay = 60_000L // 60 seconds max

    private fun getReconnectDelay(): Long {
        val delay = when (reconnectAttempt) {
            0 -> 3_000L
            1 -> 5_000L
            2 -> 10_000L
            3 -> 30_000L
            else -> maxReconnectDelay
        }
        reconnectAttempt++
        return delay
    }

    private fun resetReconnectBackoff() {
        reconnectAttempt = 0
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "PinBridge::HeartbeatWakeLock"
            ).apply {
                setReferenceCounted(false)
            }
        }
        if (wakeLock?.isHeld != true) {
            // Acquire for 10 minutes max — will re-acquire on each heartbeat cycle
            wakeLock?.acquire(10 * 60 * 1000L)
            Log.d(TAG, "WakeLock acquired")
        }
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
            Log.d(TAG, "WakeLock released")
        }
    }

    private fun connectSocket() {
        val id = deviceId ?: return
        if (socket?.connected() == true) return

        // Cancel any pending reconnect before starting a new attempt
        reconnectJob?.cancel()

        scope.launch {
            try {
                acquireWakeLock()
                Log.d(TAG, "Fetching auth token for handshake...")
                val token = auth.currentUser?.getIdToken(true)?.await()?.token
                if (token == null) {
                    Log.e(TAG, "No Firebase user or token available")
                    scheduleReconnect()
                    return@launch
                }

                val opts = IO.Options().apply {
                    forceNew = true
                    reconnection = true
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
                    resetReconnectBackoff()
                    startHeartbeatLoop()
                }

                socket?.on(Socket.EVENT_DISCONNECT) {
                    Log.w(TAG, "Socket disconnected! Reason: $it")
                    scheduleReconnect()
                }

                socket?.on(Socket.EVENT_CONNECT_ERROR) {
                    val err = it?.getOrNull(0)
                    Log.e(TAG, "Socket connection error: $err")
                    // Don't schedule reconnect here — Socket.IO's built-in reconnection
                    // handles transient errors; only schedule on full disconnect
                }

                socket?.connect()
            } catch (e: Exception) {
                Log.e(TAG, "Fatal error during socket setup: ${e.message}")
                scheduleReconnect()
            }
        }
    }

    private fun scheduleReconnect() {
        val id = deviceId ?: return
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            val delay = getReconnectDelay()
            Log.d(TAG, "Scheduling socket reconnect in ${delay}ms (attempt #$reconnectAttempt)")
            delay(delay)
            if (isActive && isInternetAvailable()) {
                disconnectSocket()
                connectSocket()
            } else {
                Log.d(TAG, "Skipping reconnect — no internet or job cancelled")
            }
        }
    }

    private var heartbeatJob: Job? = null
    private fun startHeartbeatLoop() {
        Log.d(TAG, "Starting heartbeat loop (15s interval)")
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && socket?.connected() == true) {
                acquireWakeLock()
                Log.v(TAG, "Emitting heartbeat to server...")
                socket?.emit("heartbeat")
                delay(15000) // Every 15 seconds (Server TTL is 35s, Watchdog is 40s)
            }
            Log.d(TAG, "Heartbeat loop stopped (socket disconnected or job cancelled)")
        }
    }

    private fun disconnectSocket() {
        heartbeatJob?.cancel()
        reconnectJob?.cancel()
        socket?.off() // Remove all listeners to prevent leak
        socket?.disconnect()
        socket = null
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            Log.d(TAG, "Network available - Connecting socket")
            resetReconnectBackoff()
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
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)
        // Detach the notification from the foreground service so the user can swipe it away.
        // The service continues running as a background service with START_STICKY.
        stopForeground(STOP_FOREGROUND_DETACH)
        // Re-post the same notification as a regular (dismissible) notification
        val nm = getSystemService(NotificationManager::class.java)
        nm?.notify(NOTIFICATION_ID, notification)

        val intentDeviceId = intent?.getStringExtra("deviceId")
        if (intentDeviceId != null && intentDeviceId != deviceId) {
            Log.i(TAG, "Device ID changed from $deviceId to $intentDeviceId — reconnecting socket")
            deviceId = intentDeviceId
            disconnectSocket()
        } else if (intentDeviceId != null) {
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

    /**
     * Called when the user swipes the app away from recents.
     * Re-schedule the service immediately so it survives app-kill on most OEMs.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.i(TAG, "App swiped away — scheduling service restart")
        val restartIntent = Intent(applicationContext, DeviceHeartbeatService::class.java).apply {
            putExtra("deviceId", deviceId)
        }
        val pendingIntent = PendingIntent.getService(
            applicationContext,
            1,
            restartIntent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.set(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + 2000, // Restart in 2 seconds
            pendingIntent
        )
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
        releaseWakeLock()
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivityManager.unregisterNetworkCallback(networkCallback)
        scope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "PinBridge Sync",
                NotificationManager.IMPORTANCE_MIN // Silent — no sound, no popup, just status bar icon
            ).apply {
                description = "Keeps PinBridge running to receive OTPs"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(): Notification {
        // PendingIntent to open the main app when notification is tapped
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingTapIntent = PendingIntent.getActivity(
            this,
            0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PinBridge Active")
            .setContentText("Securely syncing OTPs in the background")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setPriority(NotificationCompat.PRIORITY_MIN) // Lowest priority — no popup
            .setOngoing(false) // Dismissible — user can swipe it away
            .setShowWhen(false) // No timestamp
            .setCategory(NotificationCompat.CATEGORY_SERVICE) // System knows it's a service
            .setContentIntent(pendingTapIntent) // Open app on tap
            .setSilent(true) // No sound or vibration
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
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
