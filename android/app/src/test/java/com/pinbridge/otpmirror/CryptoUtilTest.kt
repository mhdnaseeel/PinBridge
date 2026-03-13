package com.pinbridge.otpmirror

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.security.SecureRandom
import android.util.Base64

class CryptoUtilTest {

    @Test
    fun `encrypt and decrypt with random secret returns original OTP`() {
        val secret = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val otp = "842159"

        val encrypted = CryptoUtil.encrypt(otp, secret)

        // ciphertext & iv must be non‑empty
        assertThat(encrypted.cipher).isNotEmpty()
        assertThat(encrypted.iv).isNotEmpty()

        val decrypted = CryptoUtil.decrypt(encrypted, secret)
        assertThat(decrypted).isEqualTo(otp)
    }

    @Test
    fun `encrypt and decrypt with fixed secret returns original OTP`() {
        // Fixed 256‑bit secret (hex → bytes)
        val fixedHex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
        val secret = fixedHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val otp = "123456"

        val encrypted = CryptoUtil.encrypt(otp, secret)
        assertThat(encrypted.cipher).isNotEmpty()
        assertThat(encrypted.iv).isNotEmpty()

        val decrypted = CryptoUtil.decrypt(encrypted, secret)
        assertThat(decrypted).isEqualTo(otp)
    }
}
