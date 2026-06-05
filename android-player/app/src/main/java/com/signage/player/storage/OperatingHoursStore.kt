package com.signage.player.storage

import android.content.Context

class OperatingHoursStore(context: Context) {
    private val prefs = context.getSharedPreferences("player_prefs", Context.MODE_PRIVATE)

    fun saveOperatingHours(config: String) {
        prefs.edit().putString(KEY_OPERATING_HOURS, config).apply()
    }

    fun getOperatingHours(): String {
        return prefs.getString(KEY_OPERATING_HOURS, "Always On") ?: "Always On"
    }

    companion object {
        private const val KEY_OPERATING_HOURS = "operating_hours"
    }
}
