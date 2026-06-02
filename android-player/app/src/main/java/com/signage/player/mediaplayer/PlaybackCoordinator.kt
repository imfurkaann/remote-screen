package com.signage.player.mediaplayer

import android.content.Context
import com.signage.player.storage.PlaybackStateStore
import com.signage.player.storage.PlaylistRepository
import com.signage.player.ui.PlayerUiStateStore
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.cancelAndJoin
import kotlin.coroutines.resume
import androidx.media3.common.Player

class PlaybackCoordinator(
    context: Context,
    private val playlistRepository: PlaylistRepository,
    private val playerController: PlayerController = PlayerController(context),
    private val playbackStateStore: PlaybackStateStore = PlaybackStateStore(context),
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var playbackJob: Job? = null

    private fun isImagePath(path: String): Boolean {
        val lower = path.lowercase()
        return lower.endsWith(".png") ||
                lower.endsWith(".jpg") ||
                lower.endsWith(".jpeg") ||
                lower.endsWith(".webp") ||
                lower.endsWith(".gif") ||
                lower.endsWith(".bmp") ||
                lower.endsWith(".avif")
    }

    suspend fun restoreAndPlayFromCache() {
        // Cancel and wait for the previous job to fully stop before starting a new one.
        // This prevents double-playback when SYNC_CONTENT arrives while playback is running.
        playbackJob?.cancelAndJoin()

        playbackJob = scope.launch {
            try {
                val rows = playlistRepository.getPlaylist()
                val playlist = rows.sortedBy { it.position }

                if (playlist.isEmpty()) {
                    PlayerUiStateStore.setCurrentMedia(null, false)
                    return@launch
                }

                val state = playbackStateStore.load()
                var currentIndex = 0
                if (state.mediaIndex in playlist.indices) {
                    currentIndex = state.mediaIndex
                }

                while (isActive) {
                    val item = playlist[currentIndex]
                    val file = File(item.filePath)
                    if (!file.exists() || !file.isFile) {
                        // Skip missing files
                        currentIndex = (currentIndex + 1) % playlist.size
                        delay(1000)
                        continue
                    }

                    // Save state at the start of playing this item
                    playbackStateStore.save(currentIndex, 0)

                    val isImg = isImagePath(item.filePath)
                    if (isImg) {
                        PlayerUiStateStore.setCurrentMedia(item.filePath, true)
                        playerController.pause()
                        // Guard: minimum 1 second display time even if durationMs is 0 or missing
                        delay(item.durationMs.coerceAtLeast(1_000L))
                    } else {
                        PlayerUiStateStore.setCurrentMedia(item.filePath, false)
                        playerController.playVideoAndWait(item.filePath)
                    }

                    currentIndex = (currentIndex + 1) % playlist.size
                }
            } catch (error: Exception) {
                onError(
                    "playback_restore",
                    error.message ?: "Failed to restore and play",
                    emptyMap()
                )
            }
        }
    }

    suspend fun reloadAndPlayFromCache() {
        restoreAndPlayFromCache()
    }

    suspend fun persistSnapshot() {
        // Playback state is persisted automatically at the start of playing each item.
    }

    private suspend fun PlayerController.playVideoAndWait(filePath: String) {
        suspendCancellableCoroutine<Unit> { continuation ->
            val listener = object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) {
                        cleanup()
                        if (continuation.isActive) continuation.resume(Unit)
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    cleanup()
                    if (continuation.isActive) continuation.resume(Unit)
                }

                private fun cleanup() {
                    asExoPlayer().removeListener(this)
                }
            }

            asExoPlayer().addListener(listener)
            setSingleVideo(filePath)
            play()

            continuation.invokeOnCancellation {
                asExoPlayer().removeListener(listener)
                pause()
            }
        }
    }
}
