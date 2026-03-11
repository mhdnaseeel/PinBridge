async function decryptOtp(doc, b64Secret) {
  const secret = Uint8Array.from(atob(b64Secret), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(doc.iv), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(doc.otp), c => c.charCodeAt(0));

  const alg = { name: "AES-GCM", iv: iv };
  const key = await crypto.subtle.importKey('raw', secret, alg, false, ['decrypt']);
  
  try {
    const plaintext = await crypto.subtle.decrypt(alg, key, cipher);
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (e) {
    throw new Error('Decryption failed: ' + e.message);
  }
}
