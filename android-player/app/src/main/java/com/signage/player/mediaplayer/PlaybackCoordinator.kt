package com.signage.player.mediaplayer

import android.content.Context
import com.signage.player.storage.PlaybackStateStore
import com.signage.player.storage.PlaylistRepository
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PlaybackCoordinator(
    context: Context,
    private val playlistRepository: PlaylistRepository,
    private val playerController: PlayerController = PlayerController(context),
    private val playbackStateStore: PlaybackStateStore = PlaybackStateStore(context),
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    suspend fun restoreAndPlayFromCache() {
        try {
            val rows = playlistRepository.getPlaylist()
            val playable = rows
                .sortedBy { it.position }
                .map { it.filePath }
                .filter { path -> File(path).exists() }

            if (playable.isEmpty()) {
                return
            }

            val state = playbackStateStore.load()
            withContext(Dispatchers.Main.immediate) {
                playerController.setPlaylist(playable)

                if (state.mediaIndex in playable.indices) {
                    playerController.seekTo(state.mediaIndex, state.positionMs)
                }

                playerController.play()
            }
        } catch (error: Exception) {
            onError(
                "playback_restore",
                error.message ?: "Failed to restore and play",
                emptyMap()
            )
            throw error
        }
    }

    suspend fun reloadAndPlayFromCache() {
        restoreAndPlayFromCache()
    }

    suspend fun persistSnapshot() {
        val snapshot = withContext(Dispatchers.Main.immediate) {
            playerController.snapshot()
        }
        playbackStateStore.save(snapshot.mediaIndex, snapshot.positionMs)
    }
}
