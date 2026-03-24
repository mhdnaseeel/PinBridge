package com.pinbridge.otpmirror

object Constants {
    const val PREFS_NAME = "pinbridge_prefs"
    const val KEY_DEVICE_ID = "device_id"
    const val KEY_SECRET = "pairing_secret"
    const val KEY_IS_PAIRED = "is_paired"
    const val KEY_PAIRING_CODE = "pairing_code"
    
    // Firestore collection names
    const val COLL_PAIRINGS = "pairings"
    const val COLL_OTPS = "otps"
}
