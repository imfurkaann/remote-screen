package com.signage.player.storage

import android.content.Context
import android.provider.Settings
import android.util.Log
import java.util.UUID

/**
 * Provides a stable hardware identity for this device.
 *
 * ## Identity strategy
 *
 * Primary: [Settings.Secure.ANDROID_ID]
 *   - Scoped to app + user since Android 8.0
 *   - Survives: app reinstall, app update, device reboot, emulator restart
 *   - Changes on: factory reset, "Wipe Data" in AVD Manager
 *   - This is the right choice for signage players on dedicated hardware
 *
 * Fallback: random UUID persisted to SharedPreferences
 *   - Used only when ANDROID_ID is null/blank (extremely rare edge case)
 *   - Survives: reboots (SharedPreferences are on internal storage)
 *   - Changes on: factory reset, "Wipe Data" in AVD Manager, manual app data clear
 *
 * ## Emulator note
 * "Cold boot" in Android Studio does NOT wipe data by default.
 * Only "Wipe Data" explicitly resets the emulator storage — which is equivalent
 * to a factory reset on a physical device and is expected to require re-pairing.
 */
class HardwareIdStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun getOrCreateHardwareId(): String {
        // 1. Try ANDROID_ID (stable across reinstalls on real devices and emulators)
        val androidId = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
            // "9774d56d682e549c" is a known buggy ANDROID_ID on some old/emulated devices
            return androidId
        }

        // 2. Fallback: UUID cached in SharedPreferences
        Log.w(TAG, "ANDROID_ID unavailable or known-bad — falling back to generated UUID")
        val cached = prefs.getString(KEY_FALLBACK_UUID, null)
        if (!cached.isNullOrBlank()) return cached

        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_FALLBACK_UUID, generated).apply()
        Log.d(TAG, "Generated new fallback UUID: $generated")
        return generated
    }

    companion object {
        private const val TAG = "HardwareIdStore"
        private const val PREF_NAME = "player_prefs"
        private const val KEY_FALLBACK_UUID = "hardware_id_fallback_uuid"
    }
}
