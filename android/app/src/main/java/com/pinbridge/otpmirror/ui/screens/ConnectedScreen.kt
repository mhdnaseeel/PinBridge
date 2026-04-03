package com.pinbridge.otpmirror.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinbridge.otpmirror.ui.components.StatusItem
import kotlinx.coroutines.launch

@Composable
fun ConnectedView(
    deviceId: String,
    isInternetAvailable: Boolean,
    onUnpair: suspend () -> Unit,
    onEnableBackground: () -> Unit,
    onFetchSms: () -> Unit,
    onCheckPermissions: () -> Unit,
    onSignOut: () -> Unit
) {
    val scope = rememberCoroutineScope()
    
    // CAPTCHA state for unpair verification
    var showUnpairCaptcha by remember { mutableStateOf(false) }
    var captchaCode by remember { mutableStateOf("") }
    var captchaInput by remember { mutableStateOf("") }
    var captchaError by remember { mutableStateOf(false) }

    // Generate a new 4-digit CAPTCHA code
    fun generateCaptcha(): String {
        return (1000 + (Math.random() * 9000).toInt()).toString()
    }

    // CAPTCHA Dialog
    if (showUnpairCaptcha) {
        AlertDialog(
            onDismissRequest = {
                showUnpairCaptcha = false
                captchaInput = ""
                captchaError = false
            },
            title = {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("🔓", fontSize = 32.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Confirm Unpair",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        color = Color(0xFF1F2937)
                    )
                }
            },
            text = {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        "Enter the 4-digit code below to confirm you want to unpair this device.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF6B7280),
                        textAlign = TextAlign.Center
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // CAPTCHA code display
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                brush = Brush.linearGradient(
                                    colors = listOf(Color(0xFFEEF2FF), Color(0xFFE8E0F7))
                                ),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .padding(vertical = 14.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = captchaCode,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 10.sp,
                            color = Color(0xFF6366F1)
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Input field
                    OutlinedTextField(
                        value = captchaInput,
                        onValueChange = { newValue ->
                            if (newValue.length <= 4 && newValue.all { it.isDigit() }) {
                                captchaInput = newValue
                                captchaError = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        textStyle = androidx.compose.ui.text.TextStyle(
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            letterSpacing = 8.sp
                        ),
                        placeholder = {
                            Text(
                                "····",
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center,
                                fontSize = 24.sp,
                                color = Color(0xFFD1D5DB)
                            )
                        },
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true,
                        isError = captchaError,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFF6366F1),
                            unfocusedBorderColor = Color(0xFFE2E8F0),
                            errorBorderColor = Color(0xFFEF4444),
                            cursorColor = Color(0xFF6366F1)
                        )
                    )
                    
                    if (captchaError) {
                        Text(
                            "Incorrect code. Please try again.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFEF4444),
                            modifier = Modifier.padding(top = 6.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (captchaInput == captchaCode) {
                            showUnpairCaptcha = false
                            captchaInput = ""
                            captchaError = false
                            scope.launch { onUnpair() }
                        } else {
                            captchaError = true
                            captchaInput = ""
                        }
                    },
                    enabled = captchaInput.length == 4,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFEF4444),
                        disabledContainerColor = Color(0xFFEF4444).copy(alpha = 0.4f)
                    )
                ) {
                    Text("Unpair", fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showUnpairCaptcha = false
                        captchaInput = ""
                        captchaError = false
                    }
                ) {
                    Text("Cancel", color = Color(0xFF6B7280))
                }
            },
            shape = RoundedCornerShape(20.dp),
            containerColor = Color.White
        )
    }

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

            StatusItem(
                icon = Icons.Default.Info,
                label = "Device ID",
                status = deviceId.take(8) + "...",
                statusColor = Color(0xFF6B7280)
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            StatusItem(
                icon = Icons.Default.Info,
                label = "SMS Service",
                status = if (isInternetAvailable) "Monitoring..." else "Offline",
                statusColor = if (isInternetAvailable) Color(0xFF6366F1) else Color(0xFFEF4444)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = onEnableBackground,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6B7280))
                ) {
                    Text("Enable BG", fontSize = 13.sp)
                }

                Button(
                    onClick = onFetchSms,
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
                onClick = onCheckPermissions,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
            ) {
                Text("Check Permissions")
            }


            Spacer(modifier = Modifier.height(12.dp))

            TextButton(
                onClick = { 
                    // Show CAPTCHA verification before unpairing
                    captchaCode = generateCaptcha()
                    captchaInput = ""
                    captchaError = false
                    showUnpairCaptcha = true
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Unpair This Device", color = Color(0xFFEF4444), fontWeight = FontWeight.Medium)
            }
            
            TextButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Sign Out", color = Color(0xFF9CA3AF), fontWeight = FontWeight.Medium)
            }
        }
    }
}
