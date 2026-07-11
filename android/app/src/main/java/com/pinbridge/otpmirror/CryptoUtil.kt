package com.pinbridge.otpmirror

import java.util.Base64
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-256-GCM encryption utility for OTP data.
 *
 * Security: Each encrypt() call generates a fresh 12-byte IV via SecureRandom,
 * ensuring nonce uniqueness as required by GCM mode (CWE-323 safe).
 */
// nosemgrep: kotlin.lang.security.gcm-detection.gcm-detection
object CryptoUtil {
    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val TAG_LENGTH_BIT = 128
    private const val IV_LENGTH_BYTE = 12

    data class EncryptedData(val cipher: String, val iv: String)

    fun encrypt(plaintext: String, secretKey: ByteArray): EncryptedData {
        val cipher = Cipher.getInstance(ALGORITHM) // nosemgrep: kotlin.lang.security.gcm-detection.gcm-detection
        val iv = ByteArray(IV_LENGTH_BYTE)
        SecureRandom().nextBytes(iv)
        
        val gcmSpec = GCMParameterSpec(TAG_LENGTH_BIT, iv) // nosemgrep: kotlin.lang.security.gcm-detection.gcm-detection
        val keySpec = SecretKeySpec(secretKey, "AES")
        
        cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)
        val cipherText = cipher.doFinal(plaintext.toByteArray())
        
        return EncryptedData(
            Base64.getEncoder().encodeToString(cipherText),
            Base64.getEncoder().encodeToString(iv)
        )
    }

    fun decrypt(encrypted: EncryptedData, secretKey: ByteArray): String {
        val cipher = Cipher.getInstance(ALGORITHM) // nosemgrep: kotlin.lang.security.gcm-detection.gcm-detection
        val iv = Base64.getDecoder().decode(encrypted.iv)
        val cipherText = Base64.getDecoder().decode(encrypted.cipher)
        
        val gcmSpec = GCMParameterSpec(TAG_LENGTH_BIT, iv) // nosemgrep: kotlin.lang.security.gcm-detection.gcm-detection
        val keySpec = SecretKeySpec(secretKey, "AES")
        
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)
        val plaintext = cipher.doFinal(cipherText)
        
        return String(plaintext, Charsets.UTF_8)
    }
}
