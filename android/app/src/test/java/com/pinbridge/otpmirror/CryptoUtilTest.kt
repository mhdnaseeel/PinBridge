package com.pinbridge.otpmirror

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.security.SecureRandom
import android.util.Base64

class CryptoUtilTest {

    @Test
    fun testEncryptDecrypt_RandomSecret() {
        val originalOtp = "123456"
        val secret = ByteArray(32)
        SecureRandom().nextBytes(secret)

        val encrypted = CryptoUtil.encrypt(originalOtp, secret)
        
        assertThat(encrypted.cipher).isNotEmpty()
        assertThat(encrypted.iv).isNotEmpty()
        
        val ivBytes = Base64.decode(encrypted.iv, Base64.NO_WRAP)
        assertThat(ivBytes.size).isEqualTo(12)

        val decrypted = CryptoUtil.decrypt(encrypted, secret)
        assertThat(decrypted).isEqualTo(originalOtp)
    }

    @Test
    fun testEncryptDecrypt_FixedSecret() {
        // Hex: 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
        val secret = byteArrayOf(
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
            0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
            0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f
        )
        val originalOtp = "123456"

        val encrypted = CryptoUtil.encrypt(originalOtp, secret)
        val decrypted = CryptoUtil.decrypt(encrypted, secret)
        
        assertThat(decrypted).isEqualTo(originalOtp)
    }
}
