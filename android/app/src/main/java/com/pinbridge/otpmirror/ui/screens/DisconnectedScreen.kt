package com.pinbridge.otpmirror.ui.screens


import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun DisconnectedView(
    userEmail: String?,
    onScanQr: () -> Unit,
    onManualCode: () -> Unit,
    onSignOut: () -> Unit
) {
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
                onClick = onScanQr,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
            ) {
                Text("Start Pairing QR", fontWeight = FontWeight.SemiBold)
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            TextButton(
                onClick = onManualCode,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    "Enter Code Manually",
                    color = Color(0xFF6B7280),
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (userEmail != null) {
                Text(
                    text = "Signed in as $userEmail",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF10B981),
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                )
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
