package com.openclaw.console

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

class AssistantLaunch : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        finish()
    }
}
