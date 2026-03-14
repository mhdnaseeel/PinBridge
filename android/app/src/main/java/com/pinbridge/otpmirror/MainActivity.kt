package com.pinbridge.otpmirror

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.google.firebase.auth.FirebaseAuth

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PinBridgeTheme {
                MainScreen()
            }
        }
    }

    @Composable
    fun MainScreen() {
        var statusText by remember { mutableStateOf("Checking status...") }
        var buttonText by remember { mutableStateOf("Start Pairing") }
        
        LaunchedEffect(Unit) {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            val sharedPrefs = EncryptedSharedPreferences.create(
                Constants.PREFS_NAME,
                masterKeyAlias,
                this@MainActivity,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )

            val user = FirebaseAuth.getInstance().currentUser
            if (user != null) {
                statusText = "Status: Authenticated (${user.uid})"
                buttonText = "View Pairing QR"
            } else {
                statusText = "Status: Not Authenticated"
                buttonText = "Start Pairing"
            }
        }

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
            }
        }
    }
}

@Composable
fun PinBridgeTheme(content: @Composable () -> Unit) {
    MaterialTheme(content = content)
}
