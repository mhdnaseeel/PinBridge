package com.pinbridge.otpmirror

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.pinbridge.otpmirror.data.PairingRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class ManualCodeEntryActivity : AppCompatActivity() {

    @Inject
    lateinit var pairingRepository: PairingRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_manual_code_entry)

        val etCode = findViewById<EditText>(R.id.etPairingCode)
        val btnPair = findViewById<Button>(R.id.btnConfirm)
        val backBtn = findViewById<Button>(R.id.btnBackToScan)

        backBtn.setOnClickListener {
            startActivity(Intent(this, PairingScannerActivity::class.java))
            finish()
        }

        btnPair.setOnClickListener {
            val code = etCode.text.toString().trim()
            if (code.length == 6) {
                performPairing(code)
            } else {
                Toast.makeText(this, "Enter a valid 6-digit code", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun performPairing(code: String) {
        lifecycleScope.launch {
            try {
                pairingRepository.pairWithCode(code)
                Toast.makeText(this@ManualCodeEntryActivity, "Paired successfully", Toast.LENGTH_LONG).show()
                finish()
            } catch (e: Exception) {
                Toast.makeText(this@ManualCodeEntryActivity, "Pairing failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
