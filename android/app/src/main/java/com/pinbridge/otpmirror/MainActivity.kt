package com.pinbridge.otpmirror

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.google.firebase.auth.FirebaseAuth
import com.pinbridge.otpmirror.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        updateUi()

        binding.btnPair.setOnClickListener {
            startActivity(Intent(this, PairingActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        updateUi()
    }

    private fun updateUi() {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        val sharedPrefs = EncryptedSharedPreferences.create(
            Constants.PREFS_NAME,
            masterKeyAlias,
            this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        val isPaired = sharedPrefs.getBoolean(Constants.KEY_IS_PAIRED, false)
        val user = FirebaseAuth.getInstance().currentUser

        if (user != null) {
            binding.statusText.text = "Status: Authenticated (${user.uid})"
            binding.btnPair.text = "View Pairing QR"
        } else {
            binding.statusText.text = "Status: Not Authenticated"
            binding.btnPair.text = "Start Pairing"
        }
    }
}
