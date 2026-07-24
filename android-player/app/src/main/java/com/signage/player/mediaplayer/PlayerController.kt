package com.signage.player.mediaplayer

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import java.io.File

/**
 * Process-scoped ExoPlayer wrapper. Activity recreation must not release it.
 */
class PlayerController(context: Context) {
    private val player: ExoPlayer = ExoPlayer.Builder(context).build()
    private val appFilesPath = context.applicationContext.filesDir.canonicalPath

    fun setPlaylist(localFilePaths: List<String>) {
        val items = localFilePaths.map { path ->
            val file = File(path)
            require(file.exists() && file.isFile) { "Local media file not found: $path" }
            require(isInsideAppStorage(file)) {
                "Playback from non-local cache path is not allowed: $path"
            }
            MediaItem.fromUri(file.toURI().toString())
        }
        player.setMediaItems(items)
        player.repeatMode = Player.REPEAT_MODE_ALL
        player.prepare()
    }

    fun setSingleVideo(localFilePath: String) {
        val file = File(localFilePath)
        require(file.exists() && file.isFile) { "Local media file not found: $localFilePath" }
        require(isInsideAppStorage(file)) {
            "Playback from non-local cache path is not allowed: $localFilePath"
        }
        val item = MediaItem.fromUri(file.toURI().toString())
        player.setMediaItem(item)
        player.repeatMode = Player.REPEAT_MODE_OFF
        player.prepare()
    }

    fun play() {
        player.playWhenReady = true
    }

    fun pause() {
        player.playWhenReady = false
    }

    fun seekTo(mediaIndex: Int, positionMs: Long) {
        player.seekTo(mediaIndex, positionMs)
    }

    fun snapshot(): PlaybackSnapshot {
        return PlaybackSnapshot(
            mediaIndex = player.currentMediaItemIndex.coerceAtLeast(0),
            positionMs = player.currentPosition.coerceAtLeast(0L)
        )
    }

    /** Returns the current playback position in milliseconds. Thread-safe via ExoPlayer's internal handler. */
    fun getCurrentPosition(): Long = player.currentPosition.coerceAtLeast(0L)

    fun asExoPlayer(): ExoPlayer {
        return player
    }

    /** Only call when the application-level graph is intentionally torn down. */
    fun release() {
        player.release()
    }

    private fun isInsideAppStorage(file: File): Boolean {
        val path = file.canonicalPath
        return path == appFilesPath || path.startsWith(appFilesPath + File.separator)
    }
}

data class PlaybackSnapshot(
    val mediaIndex: Int,
    val positionMs: Long
)
