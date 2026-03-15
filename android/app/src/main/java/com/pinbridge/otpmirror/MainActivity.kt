package com.pinbridge.otpmirror

import android.content.Intent
import android.os.Bundle
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
import com.pinbridge.otpmirror.data.PairingRepository
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: PairingRepository

    private lateinit var smsPermissionHelper: SmsPermissionHelper
    private var hasRequestedPermissionAfterPairing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        smsPermissionHelper = SmsPermissionHelper(this) { granted ->
             // Update UI or state if needed
        }

        setContent {
            PinBridgeTheme {
                MainScreen()
            }
        }
    }

    @Composable
    fun MainScreen() {
        val isPaired by pairingRepository.pairingStatus.collectAsState()
        
        // Automatically request permissions once when paired
        LaunchedEffect(isPaired) {
            if (isPaired && !hasRequestedPermissionAfterPairing) {
                smsPermissionHelper.requestPermissions()
                hasRequestedPermissionAfterPairing = true
            } else if (!isPaired) {
                hasRequestedPermissionAfterPairing = false
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color(0xFFF5F7FA), Color(0xFFC3CFE2))
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
            colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.7f)),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
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
                    status = "Monitoring...",
                    statusColor = Color(0xFF6366F1)
                )

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = { smsPermissionHelper.requestPermissions() },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                ) {
                    Text("Check Permissions")
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
