package com.pinbridge.otpmirror

import android.app.Application
import com.google.firebase.FirebaseApp

class PinBridgeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
    }
}
