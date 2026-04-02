package com.signage.player.storage

import android.content.Context
import java.util.UUID

class HardwareIdStore(context: Context) {
    private val prefs = context.getSharedPreferences("player_prefs", Context.MODE_PRIVATE)

    fun getOrCreateHardwareId(): String {
        val existing = prefs.getString(KEY_HARDWARE_ID, null)
        if (!existing.isNullOrBlank()) return existing

        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_HARDWARE_ID, generated).apply()
        return generated
    }

    companion object {
        private const val KEY_HARDWARE_ID = "hardware_id"
    }
}
