package com.openclaw.console.service

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

open class SecureStorage(
    private val prefs: SharedPreferences,
    private val gatewayPrefs: SharedPreferences
) {

    /** Production constructor using EncryptedSharedPreferences. */
    constructor(context: Context) : this(
        prefs = createEncryptedPrefs(context, "openclaw_secure_prefs"),
        gatewayPrefs = createEncryptedPrefs(context, "openclaw_gateway_prefs")
    )

    fun saveToken(gatewayId: String, token: String) {
        prefs.edit().putString("token_$gatewayId", token).apply()
    }

    fun getToken(gatewayId: String): String? {
        return prefs.getString("token_$gatewayId", null)
    }

    fun deleteToken(gatewayId: String) {
        prefs.edit().remove("token_$gatewayId").apply()
    }

    fun saveActiveGatewayId(gatewayId: String) {
        prefs.edit().putString("active_gateway_id", gatewayId).apply()
    }

    fun getActiveGatewayId(): String? {
        return prefs.getString("active_gateway_id", null)
    }

    fun saveGatewayMeta(key: String, value: String) {
        gatewayPrefs.edit().putString(key, value).apply()
    }

    fun getGatewayMeta(key: String): String? {
        return gatewayPrefs.getString(key, null)
    }

    fun removeGatewayMeta(key: String) {
        gatewayPrefs.edit().remove(key).apply()
    }

    fun getAllGatewayMetaKeys(): Set<String> {
        return gatewayPrefs.all.keys
    }

    companion object {
        private fun createEncryptedPrefs(context: Context, name: String): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                name,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
    }
}
