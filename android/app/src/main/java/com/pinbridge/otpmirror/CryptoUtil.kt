package com.pinbridge.otpmirror

import android.util.Base64
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object CryptoUtil {
    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val TAG_LENGTH_BIT = 128
    private const val IV_LENGTH_BYTE = 12

    data class EncryptedData(val cipher: String, val iv: String)

    fun encrypt(plaintext: String, secretKey: ByteArray): EncryptedData {
        val cipher = Cipher.getInstance(ALGORITHM)
        val iv = ByteArray(IV_LENGTH_BYTE)
        SecureRandom().nextBytes(iv)
        
        val gcmSpec = GCMParameterSpec(TAG_LENGTH_BIT, iv)
        val keySpec = SecretKeySpec(secretKey, "AES")
        
        cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)
        val cipherText = cipher.doFinal(plaintext.toByteArray())
        
        return EncryptedData(
            Base64.encodeToString(cipherText, Base64.NO_WRAP),
            Base64.encodeToString(iv, Base64.NO_WRAP)
        )
    }

    fun decrypt(encrypted: EncryptedData, secretKey: ByteArray): String {
        val cipher = Cipher.getInstance(ALGORITHM)
        val iv = Base64.decode(encrypted.iv, Base64.NO_WRAP)
        val cipherText = Base64.decode(encrypted.cipher, Base64.NO_WRAP)
        
        val gcmSpec = GCMParameterSpec(TAG_LENGTH_BIT, iv)
        val keySpec = SecretKeySpec(secretKey, "AES")
        
        cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)
        val plaintext = cipher.doFinal(cipherText)
        
        return plaintext.toString(Charsets.UTF_8)
    }
}
