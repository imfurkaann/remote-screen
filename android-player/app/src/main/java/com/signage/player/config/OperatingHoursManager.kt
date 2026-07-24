package com.signage.player.config

import android.content.Context
import android.util.Log
import com.signage.player.storage.OperatingHoursStore
import com.signage.player.ui.PlayerUiStateStore
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

object OperatingHoursManager {
    private const val TAG = "OperatingHoursManager"

    fun checkAndApply(context: Context) {
        try {
            val config = OperatingHoursStore(context).getOperatingHours()
            Log.d(TAG, "Checking operating hours, active config: $config")
            
            if (config == "Always On") {
                PlayerUiStateStore.setScreenOff(false)
                return
            }
            
            val calendar = Calendar.getInstance()
            val dayOfWeek = calendar.getDisplayName(Calendar.DAY_OF_WEEK, Calendar.LONG, Locale.US)?.lowercase(Locale.US) ?: ""

            if (config == "Use Space's hours") {
                // Default space hours: 08:00:00 to 22:00:00 every day
                val nowHour = calendar.get(Calendar.HOUR_OF_DAY)
                val nowMinute = calendar.get(Calendar.MINUTE)
                val nowSecond = calendar.get(Calendar.SECOND)
                val nowInSeconds = nowHour * 3600 + nowMinute * 60 + nowSecond
                
                val startInSeconds = 8 * 3600 // 08:00
                val endInSeconds = 22 * 3600  // 22:00
                
                val isWithin = isWithinScheduleWindow(nowInSeconds, startInSeconds, endInSeconds)
                PlayerUiStateStore.setScreenOff(!isWithin)
                return
            }

            // Custom schedule JSON
            val json = JSONObject(config)
            val schedule = json.optJSONObject("schedule")
            if (schedule != null) {
                val dayConfig = schedule.optJSONObject(dayOfWeek)
                if (dayConfig != null) {
                    val enabled = dayConfig.optBoolean("enabled", false)
                    if (enabled) {
                        val startStr = dayConfig.optString("start", "00:00:00")
                        val endStr = dayConfig.optString("end", "23:59:59")
                        
                        val nowHour = calendar.get(Calendar.HOUR_OF_DAY)
                        val nowMinute = calendar.get(Calendar.MINUTE)
                        val nowSecond = calendar.get(Calendar.SECOND)
                        val nowInSeconds = nowHour * 3600 + nowMinute * 60 + nowSecond
                        
                        val startInSeconds = parseTimeToSeconds(startStr)
                        val endInSeconds = parseTimeToSeconds(endStr)
                        
                        val isWithin = isWithinScheduleWindow(nowInSeconds, startInSeconds, endInSeconds)
                        PlayerUiStateStore.setScreenOff(!isWithin)
                    } else {
                        PlayerUiStateStore.setScreenOff(true)
                    }
                } else {
                    PlayerUiStateStore.setScreenOff(true)
                }
            } else {
                PlayerUiStateStore.setScreenOff(true)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error applying operating hours", e)
            // Fallback: stay on
            PlayerUiStateStore.setScreenOff(false)
        }
    }

    private fun parseTimeToSeconds(timeStr: String): Int {
        val parts = timeStr.split(":")
        val hours = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val minutes = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val seconds = parts.getOrNull(2)?.toIntOrNull() ?: 0
        return hours * 3600 + minutes * 60 + seconds
    }
}
/** Supports both same-day (08:00-22:00) and overnight (22:00-06:00) windows. */
internal fun isWithinScheduleWindow(nowSeconds: Int, startSeconds: Int, endSeconds: Int): Boolean {
    val now = nowSeconds.coerceIn(0, 86_399)
    val start = startSeconds.coerceIn(0, 86_399)
    val end = endSeconds.coerceIn(0, 86_399)
    if (start == end) return true
    return if (start < end) now >= start && now < end else now >= start || now < end
}
