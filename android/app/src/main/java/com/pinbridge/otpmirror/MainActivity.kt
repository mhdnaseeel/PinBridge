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
import kotlinx.coroutines.tasks.await
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.pinbridge.otpmirror.data.PairingRepository
import com.pinbridge.otpmirror.OtpUploader
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.lifecycle.lifecycleScope
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: PairingRepository

    private var isExplicitPermissionCheck = false

    private val firebaseAuth by lazy { FirebaseAuth.getInstance() }
    private val firestore by lazy { FirebaseFirestore.getInstance() }

    private val credentialManager by lazy { CredentialManager.create(this) }

    private val WEB_CLIENT_ID = "475556984962-jekqarbki0ob5s1una398poptimup0eq.apps.googleusercontent.com"

    private fun checkCloudSync(uid: String) {
        firestore.collection("users").document(uid)
            .collection("mirroring").document("active")
            .get()
            .addOnSuccessListener { doc ->
                if (doc.exists()) {
                    val deviceId = doc.getString("deviceId")
                    val secret = doc.getString("secret")
                    if (deviceId != null && secret != null) {
                        // Validate that the pairing is still active in Firestore before auto-pairing
                        firestore.collection(Constants.COLL_PAIRINGS).document(deviceId)
                            .get()
                            .addOnSuccessListener { pairingDoc ->
                                if (pairingDoc.exists() && pairingDoc.getBoolean("paired") == true) {
                                    // Pairing is still valid on the server — auto-pair
                                    lifecycleScope.launch {
                                        try {
                                            pairingRepository.pairWithQr(deviceId, secret)
                                            Toast.makeText(this@MainActivity, "Cloud Sync activated! Device paired.", Toast.LENGTH_LONG).show()
                                        } catch (e: Exception) {
                                            Toast.makeText(this@MainActivity, "Pairing failed: ${e.message}", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                } else {
                                    // Stale cloud sync data — the pairing no longer exists on the server
                                    Log.w("MainActivity", "Cloud sync data is stale (pairing doc missing or unpaired). Cleaning up.")
                                    firestore.collection("users").document(uid)
                                        .collection("mirroring").document("active")
                                        .delete()
                                        .addOnSuccessListener { Log.i("MainActivity", "Stale cloud sync document cleaned up.") }
                                        .addOnFailureListener { Log.w("MainActivity", "Failed to clean up stale cloud sync.", it) }
                                    Toast.makeText(this@MainActivity, "Previous pairing expired. Please pair again.", Toast.LENGTH_LONG).show()
                                }
                            }
                            .addOnFailureListener {
                                Log.w("MainActivity", "Failed to validate pairing document.", it)
                                Toast.makeText(this@MainActivity, "Could not verify pairing status.", Toast.LENGTH_SHORT).show()
                            }
                    } else {
                        Toast.makeText(this, "Cloud Sync data incomplete.", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(this, "No cloud sync found. Pair your browser extension first.", Toast.LENGTH_LONG).show()
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "Failed to read cloud sync data.", Toast.LENGTH_SHORT).show()
            }
    }

    private fun startGoogleSignIn() {
        lifecycleScope.launch {
            try {
                val googleIdOption = GetGoogleIdOption.Builder()
                    .setServerClientId(WEB_CLIENT_ID)
                    .setFilterByAuthorizedAccounts(false)
                    .setAutoSelectEnabled(false)
                    .build()

                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(googleIdOption)
                    .build()

                val result = credentialManager.getCredential(
                    context = this@MainActivity,
                    request = request
                )

                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(result.credential.data)
                val idToken = googleIdTokenCredential.idToken

                val firebaseCredential = GoogleAuthProvider.getCredential(idToken, null)
                val authResult = firebaseAuth.signInWithCredential(firebaseCredential).await()
                
                if (authResult.user != null) {
                    val uid = authResult.user!!.uid
                    checkCloudSync(uid)
                } else {
                    Toast.makeText(this@MainActivity, "Google Sign-In failed", Toast.LENGTH_SHORT).show()
                }
            } catch (e: GetCredentialException) {
                Log.e("MainActivity", "Credential Manager error", e)
                Toast.makeText(this@MainActivity, "Sign-in cancelled or failed", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Log.e("MainActivity", "Google Sign-In error", e)
                Toast.makeText(this@MainActivity, "Sign-in failed: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

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
    
    private var hasRequestedPermissionAfterPairing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PinBridgeTheme {
                MainScreen()
            }
        }
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
        val isOnline = isInternetAvailable()
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
        var currentUser by remember { mutableStateOf(firebaseAuth.currentUser) }
        val isPaired by pairingRepository.pairingStatus.collectAsState()

        DisposableEffect(firebaseAuth) {
            val listener = FirebaseAuth.AuthStateListener { auth ->
                currentUser = auth.currentUser
            }
            firebaseAuth.addAuthStateListener(listener)
            onDispose { firebaseAuth.removeAuthStateListener(listener) }
        }

        LaunchedEffect(isPaired) {
            if (isPaired) {
                if (!hasRequestedPermissionAfterPairing) {
                    isExplicitPermissionCheck = false
                    smsPermissionHelper.requestPermissions()
                    hasRequestedPermissionAfterPairing = true
                }
            } else {
                hasRequestedPermissionAfterPairing = false
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = Brush.verticalGradient(
                        colors = if (currentUser == null) {
                            listOf(Color(0xFFF5F7FA), Color(0xFFC3CFE2)) // Light theme for Signed Out
                        } else if (isPaired) {
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
                    targetState = Pair(currentUser != null, isPaired),
                    transitionSpec = {
                        fadeIn() + expandVertically() togetherWith fadeOut() + shrinkVertically()
                    },
                    label = "StateTransition"
                ) { (isSignedIn, paired) ->
                    if (!isSignedIn) {
                        SignInView()
                    } else if (paired) {
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
                                scope.launch { pairingRepository.unpair() }
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

                val activeId = pairingRepository.getDeviceId() ?: "Unknown"
                StatusItem(
                    icon = Icons.Default.Info,
                    label = "Device ID",
                    status = activeId.take(8) + "...",
                    statusColor = Color(0xFF6B7280)
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                StatusItem(
                    icon = Icons.Default.Info,
                    label = "SMS Service",
                    status = if (isInternetAvailable()) "Monitoring..." else "Offline",
                    statusColor = if (isInternetAvailable()) Color(0xFF6366F1) else Color(0xFFEF4444)
                )

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
                    onClick = { 
                        signOut()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Sign Out", color = Color(0xFF9CA3AF), fontWeight = FontWeight.Medium)
                }
            }
        }
    }

    private fun signOut() {
        firebaseAuth.signOut()
        lifecycleScope.launch {
            try {
                credentialManager.clearCredentialState(ClearCredentialStateRequest())
            } catch (e: Exception) {
                Log.w("MainActivity", "Failed to clear credential state", e)
            }
            pairingRepository.unpair()
        }
    }

    @Composable
    fun SignInView() {
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
                    onClick = {
                        startGoogleSignIn()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)) // Green auth look
                ) {
                    Text("Sign in with Google", fontWeight = FontWeight.SemiBold)
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

                Spacer(modifier = Modifier.height(8.dp))

                val currentUser = firebaseAuth.currentUser
                if (currentUser != null) {
                    Text(
                        text = "Signed in as ${currentUser.email}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF10B981),
                        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                    )
                }

                TextButton(
                    onClick = { signOut() },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Sign Out", color = Color(0xFF9CA3AF), fontWeight = FontWeight.Medium)
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
