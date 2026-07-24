package com.signage.player.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android Keystore-backed value store. Only ciphertext and IV are persisted;
 * the AES key never leaves the Android keystore.
 */
internal class SecureValueStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun put(key: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString("${key}_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("${key}_value", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .commit()
    }

    fun get(key: String): String? {
        val iv = prefs.getString("${key}_iv", null) ?: return null
        val encrypted = prefs.getString("${key}_value", null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
            )
            cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    fun remove(key: String) {
        prefs.edit().remove("${key}_iv").remove("${key}_value").commit()
    }

    fun getOrCreateDeviceProof(): String {
        get(KEY_DEVICE_PROOF)?.takeIf { it.length >= 32 }?.let { return it }
        val proof = UUID.randomUUID().toString().replace("-", "") +
            UUID.randomUUID().toString().replace("-", "")
        put(KEY_DEVICE_PROOF, proof)
        return proof
    }

    @Synchronized
    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREF_NAME = "player_secure_values"
        private const val KEY_ALIAS = "remote_screen_device_key_v1"
        private const val KEY_DEVICE_PROOF = "device_proof"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}