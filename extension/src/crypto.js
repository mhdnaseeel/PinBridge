/**
 * Decrypts an OTP using AES-GCM.
 * @param {Object} data The encrypted data containing {iv, otp}.
 * @param {string} b64Secret The base64-encoded secret key.
 * @returns {Promise<string>} The decrypted OTP string.
 */
export async function decryptOtp(data, b64Secret) {
    if (!data || !data.iv || !data.otp || !b64Secret) {
        throw new Error('Missing data or secret for decryption');
    }

    try {
        const secret = Uint8Array.from(atob(b64Secret), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
        const cipherText = Uint8Array.from(atob(data.otp), c => c.charCodeAt(0));
        
        const key = await crypto.subtle.importKey(
            "raw", 
            secret, 
            "AES-GCM", 
            false, 
            ["decrypt"]
        );
        
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, 
            key, 
            cipherText
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('[PinBridge] Decryption failed:', e);
        throw e;
    }
}
