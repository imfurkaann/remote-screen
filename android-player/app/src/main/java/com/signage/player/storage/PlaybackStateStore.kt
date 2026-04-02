package com.signage.player.storage

import android.content.Context

class PlaybackStateStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun save(mediaIndex: Int, positionMs: Long) {
        prefs.edit()
            .putInt(KEY_MEDIA_INDEX, mediaIndex)
            .putLong(KEY_POSITION_MS, positionMs)
            .apply()
    }

    fun load(): PlaybackState {
        return PlaybackState(
            mediaIndex = prefs.getInt(KEY_MEDIA_INDEX, 0),
            positionMs = prefs.getLong(KEY_POSITION_MS, 0L)
        )
    }

    companion object {
        private const val PREF_NAME = "player-playback-state"
        private const val KEY_MEDIA_INDEX = "media-index"
        private const val KEY_POSITION_MS = "position-ms"
    }
}

data class PlaybackState(
    val mediaIndex: Int,
    val positionMs: Long
)
