package com.pinbridge.otpmirror.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pinbridge.otpmirror.ui.components.HelpStepItem

@Composable
fun SignInView(onSignIn: () -> Unit) {
    var showHowItWorks by rememberSaveable { mutableStateOf(false) }

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
                text = "🔒",
                fontSize = 48.sp
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Text(
                text = "Sign in First",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = Color(0xFF1F2937)
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Sign in with Google to sync OTPs safely avoiding manual QR scanning.",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF6B7280),
                textAlign = TextAlign.Center
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Button(
                onClick = onSignIn,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981))
            ) {
                Text("Sign in with Google", fontWeight = FontWeight.SemiBold)
            }

            Spacer(modifier = Modifier.height(16.dp))

            TextButton(
                onClick = { showHowItWorks = !showHowItWorks },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = Color(0xFF6366F1),
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (showHowItWorks) "Hide Guide" else "How It Works",
                    color = Color(0xFF6366F1),
                    fontWeight = FontWeight.Medium
                )
            }

            AnimatedVisibility(
                visible = showHowItWorks,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                ) {
                    HelpStepItem(
                        step = "1",
                        emoji = "🔑",
                        title = "Sign In",
                        desc = "Sign in with your Google account on both the Android app and the Chrome extension."
                    )
                    HelpStepItem(
                        step = "2",
                        emoji = "🧩",
                        title = "Install Extension",
                        desc = "Install the PinBridge Chrome extension from the Chrome Web Store or load it manually."
                    )
                    HelpStepItem(
                        step = "3",
                        emoji = "📷",
                        title = "Pair Devices",
                        desc = "Scan the QR code shown in the extension with your Android app, or enter the pairing code manually."
                    )
                    HelpStepItem(
                        step = "4",
                        emoji = "✅",
                        title = "Auto-Sync OTPs",
                        desc = "OTPs received on your phone are encrypted and synced to your browser instantly. Auto-fill works on most websites."
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                Color(0xFF6366F1).copy(alpha = 0.08f),
                                RoundedCornerShape(12.dp)
                            )
                            .padding(12.dp)
                    ) {
                        Text(
                            text = "🔐 Your OTPs are encrypted with AES-256 before leaving your phone. The server never sees them in plaintext.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF4B5563),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}
