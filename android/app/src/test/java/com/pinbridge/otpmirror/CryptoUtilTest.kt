package com.pinbridge.otpmirror

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.security.SecureRandom
import javax.crypto.AEADBadTagException

class CryptoUtilTest {

    private fun randomSecret(): ByteArray = ByteArray(32).also { SecureRandom().nextBytes(it) }

    @Test
    fun `encrypt and decrypt with random secret returns original OTP`() {
        val secret = randomSecret()
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

    @Test
    fun `encrypt and decrypt empty string`() {
        val secret = randomSecret()
        val encrypted = CryptoUtil.encrypt("", secret)
        val decrypted = CryptoUtil.decrypt(encrypted, secret)
        assertThat(decrypted).isEmpty()
    }

    @Test
    fun `encrypt and decrypt long input`() {
        val secret = randomSecret()
        val longOtp = "1".repeat(1000)
        val encrypted = CryptoUtil.encrypt(longOtp, secret)
        val decrypted = CryptoUtil.decrypt(encrypted, secret)
        assertThat(decrypted).isEqualTo(longOtp)
    }

    @Test(expected = AEADBadTagException::class)
    fun `decrypt with wrong key throws`() {
        val secret1 = randomSecret()
        val secret2 = randomSecret()
        val encrypted = CryptoUtil.encrypt("123456", secret1)
        CryptoUtil.decrypt(encrypted, secret2)
    }

    @Test
    fun `two encryptions of the same plaintext produce different ciphertext`() {
        val secret = randomSecret()
        val otp = "654321"
        val e1 = CryptoUtil.encrypt(otp, secret)
        val e2 = CryptoUtil.encrypt(otp, secret)
        // Different IVs should produce different ciphertext
        assertThat(e1.iv).isNotEqualTo(e2.iv)
        assertThat(e1.cipher).isNotEqualTo(e2.cipher)
        // Both should decrypt to the same value
        assertThat(CryptoUtil.decrypt(e1, secret)).isEqualTo(otp)
        assertThat(CryptoUtil.decrypt(e2, secret)).isEqualTo(otp)
    }
}
