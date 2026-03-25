package com.pinbridge.otpmirror

import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Context
import android.widget.Toast
import androidx.compose.material.icons.filled.Refresh
import kotlinx.coroutines.launch
import com.pinbridge.otpmirror.data.PairingRepository
import com.pinbridge.otpmirror.OtpUploader
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.lifecycle.lifecycleScope

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: PairingRepository

    private var isExplicitPermissionCheck = false

    private val smsPermissionHelper =
        SmsPermissionHelper(this) { granted ->
            if (granted) {
                val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
                if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                    requestIgnoreBatteryOptimizations()
                } else if (isExplicitPermissionCheck) {
                    Toast.makeText(this, "All permissions are accepted!", Toast.LENGTH_SHORT).show()
                }
            } else if (isExplicitPermissionCheck) {
                Toast.makeText(this, "SMS permissions are required.", Toast.LENGTH_SHORT).show()
            }
            isExplicitPermissionCheck = false
        }
    
    private var isOnline by mutableStateOf(true)
    private var hasRequestedPermissionAfterPairing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        registerConnectivityCallback()
        
        setContent {
            PinBridgeTheme {
                MainScreen()
            }
        }
    }

    private fun registerConnectivityCallback() {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        
        // Initial check
        isOnline = isInternetAvailable()

        connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (!isOnline) { // Only update if state actually changed
                    isOnline = true
                    lifecycleScope.launch {
                        pairingRepository.setOnlineStatusAtomically(true)
                    }
                }
            }
            override fun onLost(network: Network) {
                if (isOnline) { // Only update if state actually changed
                    isOnline = false
                    lifecycleScope.launch {
                        pairingRepository.setOnlineStatusAtomically(false)
                    }
                }
            }
        })
    }

    private fun isInternetAvailable(): Boolean {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun requestIgnoreBatteryOptimizations() {
        val intent = Intent().apply {
            action = android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
            data = android.net.Uri.parse("package:$packageName")
        }
        val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(intent)
        }
    }


    private fun fetchSmsAndUpload() {
        if (!isOnline) {
            Toast.makeText(this, "Fetch Failed: No Internet Connection", Toast.LENGTH_SHORT).show()
            Log.w("MainActivity", "Fetch aborted: Device is offline")
            return
        }
        val result = SmsRetriever.getLatestOtp(this)
        if (result != null) {
            val (otp, timestamp) = result
            Toast.makeText(this, "OTP found and uploaded", Toast.LENGTH_SHORT).show()
            OtpUploader.enqueue(this, otp, "Manual Fetch", timestamp)
        } else {
            Toast.makeText(this, "No valid OTP found", Toast.LENGTH_SHORT).show()
        }
    }

    @Composable
    fun MainScreen() {
        val isPaired by pairingRepository.pairingStatus.collectAsState()
        
        LaunchedEffect(isPaired) {
            if (isPaired) {
                if (!hasRequestedPermissionAfterPairing) {
                    isExplicitPermissionCheck = false
                    smsPermissionHelper.requestPermissions()
                    hasRequestedPermissionAfterPairing = true
                }
                // Ensure heartbeat service is running
                // Better yet, let PairingRepository handle starting the service if paired on init.
            } else {
                hasRequestedPermissionAfterPairing = false
            }
        }


        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.verticalGradient(
                        colors = if (isPaired) {
                            listOf(Color(0xFF1E293B), Color(0xFF0F172A)) // Dark theme for Paired
                        } else {
                            listOf(Color(0xFFF5F7FA), Color(0xFFC3CFE2)) // Light theme for Unpaired
                        }
                    )
                )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Header()
                
                Spacer(modifier = Modifier.weight(1f))
                
                AnimatedContent(
                    targetState = isPaired,
                    transitionSpec = {
                        fadeIn() + expandVertically() togetherWith fadeOut() + shrinkVertically()
                    },
                    label = "StateTransition"
                ) { paired ->
                    if (paired) {
                        ConnectedView()
                    } else {
                        DisconnectedView()
                    }
                }
                
                Spacer(modifier = Modifier.weight(1.2f))
            }
        }
    }

    @Composable
    fun Header() {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "PinBridge",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.ExtraBold,
                    brush = Brush.linearGradient(
                        colors = listOf(Color(0xFF6366F1), Color(0xFFA855F7))
                    ),
                    letterSpacing = (-0.5).sp
                )
            )
        }
    }

    @Composable
    fun ConnectedView() {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.95f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(32.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = Color(0xFF10B981),
                    modifier = Modifier.size(64.dp)
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Text(
                    text = "Successfully Paired!",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = Color(0xFF1F2937)
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = "Your device is securely connected and ready to sync OTPs.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF6B7280),
                    textAlign = TextAlign.Center
                )
                
                Spacer(modifier = Modifier.height(32.dp))
                
                StatusItem(
                    icon = Icons.Default.Lock,
                    label = "Encryption",
                    status = "AES-GCM Active",
                    statusColor = Color(0xFF6366F1)
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                StatusItem(
                    icon = Icons.Default.Info,
                    label = "SMS Service",
                    status = if (isOnline) "Monitoring..." else "Offline",
                    statusColor = if (isOnline) Color(0xFF6366F1) else Color(0xFFEF4444)
                )

                Spacer(modifier = Modifier.height(24.dp))

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = { 
                            requestIgnoreBatteryOptimizations() 
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6B7280))
                    ) {
                        Text("Enable BG", fontSize = 13.sp)
                    }

                    Button(
                        onClick = { 
                            fetchSmsAndUpload()
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
                    ) {
                        Icon(Icons.Default.Refresh, null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Fetch", fontSize = 13.sp)
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = { 
                        isExplicitPermissionCheck = true
                        smsPermissionHelper.requestPermissions() 
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                ) {
                    Text("Check Permissions")
                }

                Spacer(modifier = Modifier.height(12.dp))

                val scope = rememberCoroutineScope()
                TextButton(
                    onClick = { 
                        scope.launch { pairingRepository.unpair() }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Unpair This Device", color = Color(0xFFEF4444), fontWeight = FontWeight.Medium)
                }
            }
        }
    }

    @Composable
    fun DisconnectedView() {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.7f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(32.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "📱",
                    fontSize = 48.sp
                )
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Text(
                    text = "Device Not Paired",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = Color(0xFF1F2937)
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = "Pair with your browser extension to start mirroring OTPs securely.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF6B7280),
                    textAlign = TextAlign.Center
                )
                
                Spacer(modifier = Modifier.height(32.dp))
                
                Button(
                    onClick = {
                        startActivity(Intent(this@MainActivity, PairingScannerActivity::class.java))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                ) {
                    Text("Start Pairing QR", fontWeight = FontWeight.SemiBold)
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                
                TextButton(
                    onClick = {
                        startActivity(Intent(this@MainActivity, ManualCodeEntryActivity::class.java))
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        "Enter Code Manually",
                        color = Color(0xFF6B7280),
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }

    @Composable
    fun StatusItem(icon: ImageVector, label: String, status: String, statusColor: Color) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color(0xFF6B7280),
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF1F2937),
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = status,
                style = MaterialTheme.typography.bodySmall,
                color = statusColor,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
fun PinBridgeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF6366F1),
            secondary = Color(0xFFA855F7),
            background = Color(0xFFF5F7FA)
        ),
        content = content
    )
}
