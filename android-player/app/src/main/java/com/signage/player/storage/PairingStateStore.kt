package com.signage.player.storage

import android.content.Context

/**
 * Persists pairing state across app restarts so the device can immediately
 * resume content playback without waiting for a backend round-trip.
 *
 * SharedPreferences is appropriate here because:
 *  - The data is small and rarely written (only on pairing events)
 *  - It survives process death and app restarts
 *
 * Future: migrate access_token encryption to Android Keystore for production hardening.
 */
class PairingStateStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    /** Persist a successful pairing. Called after backend confirms the session. */
    fun savePaired(deviceId: String, accessToken: String) {
        prefs.edit()
            .putBoolean(KEY_IS_PAIRED, true)
            .putString(KEY_DEVICE_ID, deviceId)
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putLong(KEY_TOKEN_OBTAINED_AT, System.currentTimeMillis())
            .apply()
    }

    /** Clear pairing state when backend definitively returns 404 or 409. */
    fun clearPaired() {
        prefs.edit()
            .putBoolean(KEY_IS_PAIRED, false)
            .remove(KEY_DEVICE_ID)
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_TOKEN_OBTAINED_AT)
            .apply()
    }

    /** Load the last persisted state. Safe to call before network is available. */
    fun loadState(): PersistedPairingState = PersistedPairingState(
        isPaired = prefs.getBoolean(KEY_IS_PAIRED, false),
        deviceId = prefs.getString(KEY_DEVICE_ID, null),
        accessToken = prefs.getString(KEY_ACCESS_TOKEN, null),
        tokenObtainedAt = prefs.getLong(KEY_TOKEN_OBTAINED_AT, 0L)
    )

    companion object {
        private const val PREF_NAME = "player_pairing_state"
        private const val KEY_IS_PAIRED = "is_paired"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_TOKEN_OBTAINED_AT = "token_obtained_at"
    }
}

data class PersistedPairingState(
    val isPaired: Boolean,
    val deviceId: String?,
    val accessToken: String?,
    val tokenObtainedAt: Long
)
