package com.pinbridge.otpmirror

import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import kotlinx.coroutines.tasks.await
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Context
import android.widget.Toast
import kotlinx.coroutines.launch
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.pinbridge.otpmirror.data.PairingRepository
import com.pinbridge.otpmirror.ui.theme.PinBridgeTheme
import com.pinbridge.otpmirror.ui.screens.SignInView
import com.pinbridge.otpmirror.ui.screens.ConnectedView
import com.pinbridge.otpmirror.ui.screens.DisconnectedView
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.lifecycle.lifecycleScope
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: PairingRepository

    private var isExplicitPermissionCheck = false
    private var isSigningIn = false

    private val firebaseAuth by lazy { FirebaseAuth.getInstance() }
    private val firestore by lazy { FirebaseFirestore.getInstance() }

    private val credentialManager by lazy { CredentialManager.create(this) }

    private val WEB_CLIENT_ID = "475556984962-jekqarbki0ob5s1una398poptimup0eq.apps.googleusercontent.com"

    // ─── Cloud Sync ─────────────────────────────────────────────

    private fun checkCloudSync(uid: String) {
        firestore.collection("users").document(uid)
            .collection("mirroring").document("active")
            .get()
            .addOnSuccessListener { doc ->
                if (doc.exists()) {
                    val deviceId = doc.getString("deviceId")
                    val secret = doc.getString("secret")
                    if (deviceId != null && secret != null) {
                        val localDeviceId = pairingRepository.getDeviceId()
                        if (localDeviceId == null) {
                            Log.i("MainActivity", "Fresh install detected — cleaning up stale cloud sync.")
                            firestore.collection("users").document(uid)
                                .collection("mirroring").document("active")
                                .delete()
                                .addOnSuccessListener { Log.i("MainActivity", "Stale cloud sync cleaned up.") }
                                .addOnFailureListener { Log.w("MainActivity", "Failed to clean up stale cloud sync.", it) }
                            Toast.makeText(this@MainActivity, "Signed in! Please pair your browser extension.", Toast.LENGTH_LONG).show()
                            return@addOnSuccessListener
                        }

                        firestore.collection(Constants.COLL_PAIRINGS).document(deviceId)
                            .get()
                            .addOnSuccessListener { pairingDoc ->
                                if (pairingDoc.exists() && pairingDoc.getBoolean("paired") == true) {
                                    lifecycleScope.launch {
                                        try {
                                            pairingRepository.pairWithQr(deviceId, secret)
                                            Toast.makeText(this@MainActivity, "Cloud Sync activated! Device paired.", Toast.LENGTH_LONG).show()
                                        } catch (e: Exception) {
                                            Toast.makeText(this@MainActivity, "Pairing failed: ${e.message}", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                } else {
                                    Log.w("MainActivity", "Cloud sync data is stale. Cleaning up.")
                                    firestore.collection("users").document(uid)
                                        .collection("mirroring").document("active")
                                        .delete()
                                        .addOnSuccessListener { Log.i("MainActivity", "Stale cloud sync cleaned up.") }
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

    // ─── Authentication ─────────────────────────────────────────

    private suspend fun attemptGoogleSignIn(filterByAuthorized: Boolean): Boolean {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setServerClientId(WEB_CLIENT_ID)
            .setFilterByAuthorizedAccounts(filterByAuthorized)
            .setAutoSelectEnabled(filterByAuthorized)
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
            return true
        }
        return false
    }

    private fun startGoogleSignIn() {
        if (isSigningIn) return
        isSigningIn = true
        lifecycleScope.launch {
            try {
                try {
                    if (attemptGoogleSignIn(filterByAuthorized = true)) return@launch
                } catch (e: NoCredentialException) {
                    Log.i("MainActivity", "No previously authorized account, showing full picker")
                } catch (e: GetCredentialCancellationException) {
                    Log.i("MainActivity", "Auto-select cancelled, showing full picker")
                }

                if (!attemptGoogleSignIn(filterByAuthorized = false)) {
                    Toast.makeText(this@MainActivity, "Google Sign-In failed", Toast.LENGTH_SHORT).show()
                }
            } catch (e: GetCredentialCancellationException) {
                Log.i("MainActivity", "User cancelled sign-in")
                Toast.makeText(this@MainActivity, "Sign-in cancelled", Toast.LENGTH_SHORT).show()
            } catch (e: NoCredentialException) {
                Log.e("MainActivity", "No credentials available", e)
                Toast.makeText(this@MainActivity, "No Google accounts found. Please add a Google account in Settings.", Toast.LENGTH_LONG).show()
            } catch (e: GetCredentialException) {
                Log.e("MainActivity", "Credential Manager error: type=${e.type}, message=${e.message}", e)
                Toast.makeText(this@MainActivity, "Sign-in failed. Please try again.", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Log.e("MainActivity", "Google Sign-In error: class=${e::class.qualifiedName}, message=${e.message}", e)
                Toast.makeText(this@MainActivity, "Sign-in failed: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                isSigningIn = false
            }
        }
    }

    // ─── Permissions ────────────────────────────────────────────

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

    // ─── Utility Methods ────────────────────────────────────────

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

    // ─── Main Screen Composable (orchestrator only) ─────────────

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
                            listOf(Color(0xFFF5F7FA), Color(0xFFC3CFE2))
                        } else if (isPaired) {
                            listOf(Color(0xFF1E293B), Color(0xFF0F172A))
                        } else {
                            listOf(Color(0xFFF5F7FA), Color(0xFFC3CFE2))
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
                        SignInView(onSignIn = { startGoogleSignIn() })
                    } else if (paired) {
                        ConnectedView(
                            deviceId = pairingRepository.getDeviceId() ?: "Unknown",
                            isInternetAvailable = isInternetAvailable(),
                            onUnpair = { pairingRepository.unpair() },
                            onEnableBackground = { requestIgnoreBatteryOptimizations() },
                            onFetchSms = { fetchSmsAndUpload() },
                            onCheckPermissions = {
                                isExplicitPermissionCheck = true
                                smsPermissionHelper.requestPermissions()
                            },
                            onSignOut = { signOut() }
                        )
                    } else {
                        DisconnectedView(
                            userEmail = firebaseAuth.currentUser?.email,
                            onScanQr = { startActivity(Intent(this@MainActivity, PairingScannerActivity::class.java)) },
                            onManualCode = { startActivity(Intent(this@MainActivity, ManualCodeEntryActivity::class.java)) },
                            onSignOut = { signOut() }
                        )
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
}
