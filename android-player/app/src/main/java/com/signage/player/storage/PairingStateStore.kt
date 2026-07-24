package com.signage.player.storage

import android.content.Context

/**
 * Persists pairing state across app restarts so the device can immediately
 * resume content playback without waiting for a backend round-trip.
 *
 * Non-sensitive flags are stored in SharedPreferences. Access tokens and the
 * per-device proof are encrypted with an Android Keystore-backed key.
 */
class PairingStateStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val secureValues = SecureValueStore(context)

    /** Persist a successful pairing. Called after backend confirms the session. */
    fun savePaired(deviceId: String, accessToken: String) {
        prefs.edit()
            .putBoolean(KEY_IS_PAIRED, true)
            .putString(KEY_DEVICE_ID, deviceId)
            .putLong(KEY_TOKEN_OBTAINED_AT, System.currentTimeMillis())
            // Record the wall-clock time of the last successful backend verification.
            // Used by SessionManager's offline grace period logic.
            .putLong(KEY_LAST_VERIFIED_AT, System.currentTimeMillis())
            .commit()
        secureValues.put(KEY_ACCESS_TOKEN, accessToken)
    }

    fun getOrCreateDeviceProof(): String = secureValues.getOrCreateDeviceProof()

    /** Clear pairing state when backend definitively returns 404 or 409. */
    fun clearPaired() {
        prefs.edit()
            .putBoolean(KEY_IS_PAIRED, false)
            .remove(KEY_DEVICE_ID)
            .remove(KEY_TOKEN_OBTAINED_AT)
            .remove(KEY_LAST_VERIFIED_AT)
            .commit()
        secureValues.remove(KEY_ACCESS_TOKEN)
    }

    /** Load the last persisted state. Safe to call before network is available. */
    fun loadState(): PersistedPairingState = PersistedPairingState(
        isPaired = prefs.getBoolean(KEY_IS_PAIRED, false),
        deviceId = prefs.getString(KEY_DEVICE_ID, null),
        accessToken = secureValues.get(KEY_ACCESS_TOKEN),
        tokenObtainedAt = prefs.getLong(KEY_TOKEN_OBTAINED_AT, 0L),
        lastVerifiedAt = prefs.getLong(KEY_LAST_VERIFIED_AT, 0L)
    )

    companion object {
        private const val PREF_NAME = "player_pairing_state"
        private const val KEY_IS_PAIRED = "is_paired"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_TOKEN_OBTAINED_AT = "token_obtained_at"
        private const val KEY_LAST_VERIFIED_AT = "last_verified_at"
    }
}

data class PersistedPairingState(
    val isPaired: Boolean,
    val deviceId: String?,
    val accessToken: String?,
    val tokenObtainedAt: Long,
    /** Epoch ms of the last time the backend confirmed this device is paired. */
    val lastVerifiedAt: Long = 0L
)
