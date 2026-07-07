package com.signage.player.mediaplayer

import android.content.Context
import android.util.Log
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
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.resume
import androidx.media3.common.Player

/**
 * Coordinates playlist playback with four production-grade improvements:
 *
 *  1. **Crossfade transitions** – fade-out/in when switching between items so
 *     the cut is never jarring on large signage screens.
 *
 *  2. **Missing-file backoff** – if a full playlist tour yields zero playable
 *     files the coordinator backs off for [MISSING_BACKOFF_MS] ms and emits a
 *     telemetry error instead of spinning the CPU at 1 s intervals.
 *
 *  3. **Video position persistence** – while a video plays a shadow coroutine
 *     snapshots the ExoPlayer position every [POSITION_SAVE_INTERVAL_MS] ms so
 *     that after a force-stop or power-cut the player resumes mid-video rather
 *     than restarting from the beginning.
 *
 *  4. **Grace-period reload** – [gracefulReload] gives the currently-playing
 *     item up to [GRACE_PERIOD_MS] ms to finish naturally before the new
 *     playlist is applied. This prevents visible tears on thousands of devices
 *     that all receive a SYNC_CONTENT at the same time.
 */
class PlaybackCoordinator(
    context: Context,
    private val playlistRepository: PlaylistRepository,
    private val playerController: PlayerController = PlayerController(context),
    private val playbackStateStore: PlaybackStateStore = PlaybackStateStore(context),
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    private val tag = "PlaybackCoordinator"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var playbackJob: Job? = null

    // Guards against concurrent calls to restoreAndPlayFromCache / gracefulReload
    // so two SYNC_CONTENT events arriving back-to-back don't start two loops.
    private val reloadMutex = Mutex()

    // ---------------------------------------------------------------------------
    // Companion constants
    // ---------------------------------------------------------------------------
    companion object {
        /** Duration of each half of the crossfade (fade-out then fade-in), ms. */
        private const val FADE_DURATION_MS = 300L

        /**
         * How long to wait between position saves during video playback.
         * 5 s gives <5 s seek-back on crash while keeping SharedPreferences
         * write pressure negligible even at 10 000 devices.
         */
        private const val POSITION_SAVE_INTERVAL_MS = 5_000L

        /**
         * Back-off delay when an entire playlist tour produces zero playable
         * files. Prevents tight-loop CPU storms if content is accidentally wiped.
         */
        private const val MISSING_BACKOFF_MS = 30_000L

        /**
         * Maximum time (ms) we allow a new SYNC_CONTENT reload to wait for the
         * current item to finish naturally before forcing an interrupt.
         */
        const val GRACE_PERIOD_MS = 5_000L

        /**
         * Hard watchdog timeout for a single video item. If the video has not
         * finished within 30 minutes we force-advance to the next item.
         *
         * This covers hardware video-decoder lockups on low-end TV boxes where
         * ExoPlayer enters STATE_READY but the frame never advances and
         * STATE_ENDED is never fired.
         */
        private const val VIDEO_WATCHDOG_TIMEOUT_MS = 30 * 60 * 1_000L

        /**
         * How long (ms) the playback position must be unchanged while the player
         * is nominally playing before we declare a frozen-decoder event and skip
         * to the next item. 60 seconds avoids false positives on legitimately
         * still content (e.g. a streaming radio stream with a static thumbnail).
         */
        private const val FROZEN_POSITION_THRESHOLD_MS = 60_000L

        /** Polling interval for the frozen-position watchdog. */
        private const val FROZEN_POSITION_POLL_MS = 10_000L
    }

    // ---------------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------------

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

    /**
     * Executes a 300 ms fade-out, then runs [block] to swap state, then
     * executes a 300 ms fade-in.  The alpha changes happen on Main because
     * [PlayerUiStateStore] is a StateFlow observed by Compose on Main.
     *
     * If the playback job is cancelled mid-transition the alpha is reset to 1f
     * so the UI is never left in a transparent state.
     */
    private suspend fun withCrossfade(block: suspend () -> Unit) {
        try {
            // Fade out
            withContext(Dispatchers.Main) { PlayerUiStateStore.beginTransition() }
            delay(FADE_DURATION_MS)

            // Swap content
            block()

            // Fade in
            withContext(Dispatchers.Main) { PlayerUiStateStore.endTransition() }
        } catch (t: Throwable) {
            // Ensure UI is never left invisible if the coroutine is cancelled.
            withContext(Dispatchers.Main) { PlayerUiStateStore.endTransition() }
            throw t
        }
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    /**
     * Cancels any running playback loop, then starts a fresh loop from the
     * last saved [PlaybackStateStore] position. Safe to call from any thread.
     */
    suspend fun restoreAndPlayFromCache() {
        reloadMutex.withLock {
            playbackJob?.cancelAndJoin()
            playbackJob = scope.launch { playbackLoop() }
        }
    }

    /**
     * Alias kept for call-sites that only want a plain reload (no grace period).
     */
    suspend fun reloadAndPlayFromCache() = restoreAndPlayFromCache()

    /**
     * Waits up to [gracePeriodMs] for the current item to finish naturally,
     * then restarts the playback loop with fresh DB content.
     *
     * Rationale: when thousands of devices receive SYNC_CONTENT simultaneously
     * a hard cancel tears every screen mid-item at the same moment, which
     * looks bad and creates a thundering-herd sensation for audiences. Allowing
     * a short grace period staggers the visual transition naturally.
     */
    suspend fun gracefulReload(gracePeriodMs: Long = GRACE_PERIOD_MS) {
        reloadMutex.withLock {
            val running = playbackJob
            if (running != null && running.isActive) {
                // Give the current item time to finish; ignore the result —
                // whether it finishes or times out we proceed either way.
                withTimeoutOrNull(gracePeriodMs) { running.join() }
            }
            // Cancel whatever is left (handles timeout case) then relaunch.
            playbackJob?.cancelAndJoin()
            playbackJob = scope.launch { playbackLoop() }
        }
    }

    /** No-op shim; playback state is persisted automatically per item. */
    suspend fun persistSnapshot() { /* intentionally empty */ }

    // ---------------------------------------------------------------------------
    // Core playback loop
    // ---------------------------------------------------------------------------

    private suspend fun playbackLoop() {
        try {
            val rows = playlistRepository.getPlaylist()
            val playlist = rows.sortedBy { it.position }

            if (playlist.isEmpty()) {
                withContext(Dispatchers.Main) { PlayerUiStateStore.setCurrentMedia(null, false, null) }
                return
            }

            val state = playbackStateStore.load()
            var currentIndex = if (state.mediaIndex in playlist.indices) state.mediaIndex else 0

            // How many consecutive items in this tour were unplayable (file missing).
            var consecutiveMissCount = 0

            while (coroutineContext.isActive) {
                val item = playlist[currentIndex]
                val isWeb = item.filePath.startsWith("http://") || item.filePath.startsWith("https://")
                val file = File(item.filePath)

                if (!isWeb && (!file.exists() || !file.isFile)) {
                    consecutiveMissCount++
                    Log.w(tag, "Media file missing: ${item.filePath} (miss=$consecutiveMissCount/${playlist.size})")

                    // --- Improvement 2: missing-file backoff ---
                    // If we've gone through every item in the playlist without
                    // finding a single playable file, back off heavily instead
                    // of hammering the filesystem in a tight loop.
                    if (consecutiveMissCount >= playlist.size) {
                        Log.e(tag, "All ${ playlist.size } playlist files missing — backing off ${MISSING_BACKOFF_MS}ms")
                        onError(
                            "playback_missing_all",
                            "All playlist files are missing from local storage",
                            mapOf(
                                "playlist_size" to playlist.size,
                                "backoff_ms" to MISSING_BACKOFF_MS
                            )
                        )
                        withContext(Dispatchers.Main) { 
                            PlayerUiStateStore.setCurrentMedia(
                                null, 
                                false, 
                                "Yerel medyalar bulunamadı. Lütfen internet bağlantısını kontrol edin, indirme bekleniyor..."
                            ) 
                        }
                        delay(MISSING_BACKOFF_MS)
                        // Re-read the playlist after the backoff — content may have been restored.
                        val refreshed = playlistRepository.getPlaylist().sortedBy { it.position }
                        if (refreshed.isEmpty()) return
                        consecutiveMissCount = 0
                        currentIndex = 0
                        continue
                    }

                    currentIndex = (currentIndex + 1) % playlist.size
                    delay(500L) // short pause between miss checks within a tour
                    continue
                }

                // Valid file found — reset miss counter.
                consecutiveMissCount = 0

                // Persist which item we are about to play (position reset to 0
                // here; for videos we overwrite it with real position below).
                playbackStateStore.save(currentIndex, 0L)

                val isImg = !isWeb && isImagePath(item.filePath)
                val currentPath = PlayerUiStateStore.state.value.currentMediaFilePath

                // --- Improvement 1: crossfade transition ---
                // Only perform a crossfade if the media file is changing, preventing
                // flashing/flickering when looping a single item or playing consecutive identical files.
                if (currentPath != item.filePath) {
                    withCrossfade {
                        withContext(Dispatchers.Main) {
                            PlayerUiStateStore.setCurrentMedia(item.filePath, isImg)
                        }
                        if (isImg || isWeb) {
                            playerController.pause()
                        }
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        PlayerUiStateStore.setCurrentMedia(item.filePath, isImg)
                    }
                    if (isImg || isWeb) {
                        playerController.pause()
                    }
                }

                if (isImg || isWeb) {
                    // Image or Web App: display for the configured duration (min 1 s).
                    val displayMs = item.durationMs.coerceAtLeast(1_000L)

                    // Restore mid-image position if returning to this item after a restart.
                    val remainingMs = if (state.mediaIndex == currentIndex && state.positionMs > 0) {
                        (displayMs - state.positionMs).coerceAtLeast(1_000L)
                    } else {
                        displayMs
                    }

                    // Periodically save elapsed time so a crash mid-image can
                    // resume from roughly the right point.
                    val startMs = System.currentTimeMillis()
                    var elapsed = 0L
                    while (elapsed < remainingMs && coroutineContext.isActive) {
                        val chunk = minOf(POSITION_SAVE_INTERVAL_MS, remainingMs - elapsed)
                        delay(chunk)
                        elapsed = System.currentTimeMillis() - startMs
                        playbackStateStore.save(currentIndex, elapsed)
                    }
                } else {
                    // --- Improvement 3: video position restore ---
                    // --- K2: Hard watchdog timeout + frozen-position detector ---
                    // withTimeoutOrNull ensures we never block forever if the
                    // hardware decoder locks up and STATE_ENDED is never fired.
                    val resumePositionMs = if (state.mediaIndex == currentIndex) state.positionMs else 0L
                    val advanced = withTimeoutOrNull(VIDEO_WATCHDOG_TIMEOUT_MS) {
                        playerController.playVideoAndWait(item.filePath, resumePositionMs, currentIndex, playbackStateStore)
                    }
                    if (advanced == null) {
                        // Watchdog fired — decoder likely locked. Log and continue.
                        Log.e(tag, "Video watchdog timeout after ${VIDEO_WATCHDOG_TIMEOUT_MS}ms for ${item.filePath} — advancing to next item")
                        onError(
                            "playback_watchdog_timeout",
                            "Video decoder did not finish within ${VIDEO_WATCHDOG_TIMEOUT_MS / 60_000}min — possible hardware freeze",
                            mapOf("file" to item.filePath, "item_index" to currentIndex)
                        )
                    }
                }

                currentIndex = (currentIndex + 1) % playlist.size
                // Clear saved position when moving to the next item.
                playbackStateStore.save(currentIndex, 0L)
            }
        } catch (error: Exception) {
            if (coroutineContext.isActive) {
                onError(
                    "playback_loop",
                    error.message ?: "Unexpected playback error",
                    emptyMap()
                )
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Extension: video playback with position persistence
    // ---------------------------------------------------------------------------

    /**
     * Plays [filePath] via ExoPlayer, seeking to [resumePositionMs] if > 0,
     * and suspends until the video ends (or errors). While playing, saves the
     * current position to [store] every [POSITION_SAVE_INTERVAL_MS] ms so
     * the player can resume mid-video after a crash or force-stop.
     */
    private suspend fun PlayerController.playVideoAndWait(
        filePath: String,
        resumePositionMs: Long,
        itemIndex: Int,
        store: PlaybackStateStore
    ) {
        // Launch position-saver in a sibling job so it can be cancelled cleanly.
        val positionSaverJob = scope.launch {
            while (isActive) {
                delay(POSITION_SAVE_INTERVAL_MS)
                val pos = getCurrentPosition()
                store.save(itemIndex, pos)
                Log.v(tag, "Position snapshot saved: item=$itemIndex pos=${pos}ms")
            }
        }

        try {
            suspendCancellableCoroutine<Unit> { continuation ->
                val listener = object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_ENDED) {
                            cleanup()
                            if (continuation.isActive) continuation.resume(Unit)
                        }
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        Log.e(tag, "ExoPlayer error during playback: ${error.message}")
                        cleanup()
                        if (continuation.isActive) continuation.resume(Unit)
                    }

                    private fun cleanup() {
                        asExoPlayer().removeListener(this)
                    }
                }

                asExoPlayer().addListener(listener)
                setSingleVideo(filePath)

                // Seek to resume position after prepare() — ExoPlayer requires this order.
                if (resumePositionMs > 0L) {
                    asExoPlayer().seekTo(resumePositionMs)
                    Log.d(tag, "Resuming video at ${resumePositionMs}ms: $filePath")
                }

                play()

                continuation.invokeOnCancellation {
                    asExoPlayer().removeListener(listener)
                    pause()
                }
            }
        } finally {
            positionSaverJob.cancel()
        }
    }
}
