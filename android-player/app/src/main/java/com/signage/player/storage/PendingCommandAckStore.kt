package com.signage.player.storage

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists command results until the backend confirms that they were committed.
 * This prevents a short socket outage or process restart from losing an ACK and
 * causing the dashboard to report a successfully executed command as timed out.
 */
class PendingCommandAckStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun put(commandId: String, payload: JSONObject) {
        if (commandId.isBlank()) return
        val encoded = payload.toString()
        if (encoded.toByteArray(Charsets.UTF_8).size > MAX_ACK_BYTES) return

        val entries = readEntries()
        entries.remove(commandId)
        entries[commandId] = encoded
        while (entries.size > MAX_ENTRIES) {
            entries.remove(entries.keys.first())
        }
        writeEntries(entries)
    }

    @Synchronized
    fun get(commandId: String): JSONObject? =
        readEntries()[commandId]?.let { runCatching { JSONObject(it) }.getOrNull() }

    @Synchronized
    fun all(): List<JSONObject> = readEntries().values.mapNotNull {
        runCatching { JSONObject(it) }.getOrNull()
    }

    @Synchronized
    fun remove(commandId: String) {
        val entries = readEntries()
        if (entries.remove(commandId) != null) writeEntries(entries)
    }

    private fun readEntries(): LinkedHashMap<String, String> {
        val result = linkedMapOf<String, String>()
        val raw = prefs.getString(KEY_ENTRIES, null) ?: return result
        val array = runCatching { JSONArray(raw) }.getOrNull() ?: return result
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val commandId = item.optString("command_id").trim()
            val payload = item.optString("payload")
            if (commandId.isNotBlank() && payload.isNotBlank()) result[commandId] = payload
        }
        return result
    }

    private fun writeEntries(entries: LinkedHashMap<String, String>) {
        val array = JSONArray()
        entries.forEach { (commandId, payload) ->
            array.put(JSONObject().put("command_id", commandId).put("payload", payload))
        }
        prefs.edit().putString(KEY_ENTRIES, array.toString()).commit()
    }

    companion object {
        private const val PREF_NAME = "pending_command_acks"
        private const val KEY_ENTRIES = "entries"
        private const val MAX_ENTRIES = 50
        private const val MAX_ACK_BYTES = 256 * 1024
    }
}