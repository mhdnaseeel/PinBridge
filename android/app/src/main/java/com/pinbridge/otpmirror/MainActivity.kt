package com.pinbridge.otpmirror

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import android.content.SharedPreferences
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: com.pinbridge.otpmirror.data.PairingRepository

    private lateinit var smsPermissionHelper: SmsPermissionHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        smsPermissionHelper = SmsPermissionHelper(this) { granted ->
            if (!granted) {
                // Handle denial
            }
        }
        smsPermissionHelper.requestPermissions()

        setContent {
            PinBridgeTheme {
                MainScreen()
            }
        }
    }

    @Composable
    fun MainScreen() {
        val isPaired by pairingRepository.pairingStatus.collectAsState()
        
        val statusText = if (isPaired) "Status: Connected" else "Status: Not Connected"
        val buttonText = if (isPaired) "View Pairing QR" else "Start Pairing"

        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = statusText, style = MaterialTheme.typography.bodyLarge)
                Spacer(modifier = Modifier.height(24.dp))
                Button(onClick = {
                    startActivity(Intent(this@MainActivity, PairingScannerActivity::class.java))
                }) {
                    Text(text = buttonText)
                }
                Spacer(modifier = Modifier.height(16.dp))
                TextButton(onClick = {
                    startActivity(Intent(this@MainActivity, ManualCodeEntryActivity::class.java))
                }) {
                    Text(text = "Enter Code Manually")
                }
            }
        }
    }
}

@Composable
fun PinBridgeTheme(content: @Composable () -> Unit) {
    MaterialTheme(content = content)
}
