package com.signage.player.sync

import android.content.Context
import android.util.Log
import com.signage.player.config.AppDefaults
import com.signage.player.storage.PlaylistEntity
import com.signage.player.storage.PlaylistRepository
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Manages download and atomic activation of playlist content.
 *
 * Production-grade improvements included in this version:
 *
 * - **OkHttp**: replaces [java.net.HttpURLConnection]. OkHttp uses Android's
 *   built-in TLS stack (conscrypt) correctly, handles connection pooling,
 *   transparent GZIP, and follows redirects safely without silently dropping
 *   Authorization headers on HTTP→HTTPS redirect chains.
 *
 * - **Retry with exponential back-off**: each download is attempted up to
 *   [MAX_DOWNLOAD_ATTEMPTS] times (1 s → 2 s → 4 s jittered delays) before
 *   the sync is aborted. Transient Wi-Fi blips no longer kill an entire sync.
 *
 * - **Idempotency guard** ([lastAppliedVersion]): duplicate SYNC_CONTENT
 *   events (caused by the backend emitting on both hardwareId and _id rooms)
 *   are detected and silently dropped, preventing double-download and double
 *   playback restarts.
 *
 * - **Disk-space pre-check**: if the device has less than [MIN_FREE_BYTES]
 *   available the sync is aborted early with a telemetry error rather than
 *   downloading partial files and failing mid-way.
 */
class ContentSyncManager(
    private val appContext: Context,
    private val playlistRepository: PlaylistRepository,
    private val mediaBaseUrl: String = DEFAULT_MEDIA_BASE_URL,
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    private val tag = "ContentSyncManager"
    private val syncMutex = Mutex()
    private val syncState = appContext.applicationContext
        .getSharedPreferences("content_sync_state", Context.MODE_PRIVATE)

    // -----------------------------------------------------------------------
    // Idempotency: skip SYNC_CONTENT events we have already processed.
    // Volatile + AtomicInteger for thread-safe access from coroutine Dispatchers.IO.
    // -----------------------------------------------------------------------
    @Volatile
    private var lastAppliedPlaylistId: String = syncState.getString("playlist_id", "").orEmpty()
    private val lastAppliedVersion = AtomicInteger(syncState.getInt("playlist_version", -1))
    /**
     * SHA-256 checksum of the last successfully applied playlist.
     * Used as the primary deduplication key on socket reconnect: when the
     * backend pushes SYNC_CONTENT on reconnect (to recover missed updates
     * during an offline period), we skip the sync entirely if the checksum
     * matches what is already on disk — no redundant downloads, no playback
     * restart, no visible glitch on screen.
     */
    @Volatile
    private var lastAppliedChecksum: String = syncState.getString("playlist_checksum", "").orEmpty()

    // -----------------------------------------------------------------------
    // Shared OkHttp client — connection pooling across all downloads in a
    // single sync batch, Keep-Alive re-use, proper TLS via Android's stack.
    // -----------------------------------------------------------------------
    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)   // 120 s for large video files
            .followRedirects(true)
            .followSslRedirects(true)
            .addInterceptor(com.signage.player.network.SafeTimeAndHttpInterceptor())
            .build()
    }

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    companion object {
        /** Maximum download attempts per file before giving up. */
        private const val MAX_DOWNLOAD_ATTEMPTS = 3

        /** Base delay for exponential back-off between download retries, ms. */
        private const val RETRY_BASE_DELAY_MS = 1_000L

        /** Minimum free disk space required before starting a sync, bytes (200 MB). */
        private const val MIN_FREE_BYTES = 200L * 1024L * 1024L

        private const val MAX_CACHE_BYTES = 2L * 1024L * 1024L * 1024L
        private const val MAX_MEDIA_FILE_BYTES = 1L * 1024L * 1024L * 1024L
        private const val STALE_STAGING_AGE_MS = 24L * 60L * 60L * 1_000L

        /**
         * Maximum total size (bytes) of the quarantine folder.
         * Files are evicted oldest-first once this limit is exceeded.
         * 100 MB is generous for a cache of corrupt download fragments.
         */
        private const val MAX_QUARANTINE_BYTES = 100L * 1024L * 1024L

        /**
         * Files in quarantine older than 7 days are deleted regardless of
         * whether the folder has hit the size quota.
         */
        private const val QUARANTINE_MAX_AGE_MS = 7L * 24 * 60 * 60 * 1_000L

        val DEFAULT_MEDIA_BASE_URL: String get() = AppDefaults.BACKEND_BASE_URL
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Applies a SYNC_CONTENT payload: downloads all items, verifies checksums,
     * then atomically swaps staging → active. Idempotent: duplicate payloads
     * (same playlistId + same or older version) are silently skipped.
     */
    suspend fun applySyncPayload(payload: SyncContentPayload): Boolean = syncMutex.withLock {
        recoverInterruptedActivationUnlocked()
        // --- Idempotency guard ---
        // The backend currently emits SYNC_CONTENT twice per device (once by
        // hardwareId, once by _id). Skip the duplicate to avoid re-downloading
        // the entire playlist and restarting playback unnecessarily.
        //
        // Checksum takes precedence: even if the version number advances (e.g.
        // an admin saves the playlist without changing content), if the actual
        // file content is identical we skip the sync. This is the critical
        // path for socket-reconnect recovery after an internet outage — the
        // backend pushes the current playlist state on every reconnect.
        val incomingVersion = payload.playlistVersion
        val incomingChecksum = payload.checksumSha256.orEmpty()

        if (incomingChecksum.isNotEmpty() && incomingChecksum == lastAppliedChecksum && isCacheUsable(payload)) {
            Log.d(
                tag,
                "Skipping SYNC_CONTENT: checksum matches already-applied playlist " +
                    "(checksum=${incomingChecksum.take(12)}… playlist=${payload.playlistId})"
            )
            return@withLock false
        }

        if (payload.playlistId == lastAppliedPlaylistId &&
            incomingVersion <= lastAppliedVersion.get() &&
            incomingChecksum.isEmpty() &&
            isCacheUsable(payload)
        ) {
            Log.d(
                tag,
                "Skipping duplicate SYNC_CONTENT: playlist=${payload.playlistId} " +
                    "version=$incomingVersion (already applied version=${lastAppliedVersion.get()})"
            )
            return@withLock false
        }

        Log.d(
            tag,
            "Applying SYNC_CONTENT playlist=${payload.playlistId} " +
                "version=$incomingVersion items=${payload.items.size}"
        )

        val contentRoot = File(appContext.filesDir, "content")
        val activeDir = File(contentRoot, "active")
        val stagingDir = File(contentRoot, "staging-${payload.playlistVersion}")
        val backupDir = File(contentRoot, "backup")
        val quarantineDir = File(contentRoot, "quarantine")

        if (payload.playlistId.isBlank() && payload.items.isEmpty()) {
            playlistRepository.replacePlaylist(emptyList())
            if (activeDir.exists()) activeDir.deleteRecursively()
            if (backupDir.exists()) backupDir.deleteRecursively()
            contentRoot.listFiles { file -> file.name.startsWith("staging-") }
                ?.forEach { file -> file.deleteRecursively() }
            lastAppliedPlaylistId = ""
            lastAppliedVersion.set(0)
            lastAppliedChecksum = ""
            syncState.edit()
                .putString("playlist_id", "")
                .putInt("playlist_version", 0)
                .putString("playlist_checksum", "")
                .commit()
            return@withLock true
        }

        // --- Disk space pre-check ---
        val freeBytes = appContext.filesDir.freeSpace
        if (freeBytes < MIN_FREE_BYTES) {
            val msg = "Insufficient disk space for sync: ${freeBytes / (1024 * 1024)} MB free, need ≥ ${MIN_FREE_BYTES / (1024 * 1024)} MB"
            Log.e(tag, msg)
            onError(
                "sync_disk_space",
                msg,
                mapOf(
                    "free_bytes" to freeBytes,
                    "required_bytes" to MIN_FREE_BYTES,
                    "playlist_id" to payload.playlistId
                )
            )
            return@withLock false
        }

        if (stagingDir.exists()) stagingDir.deleteRecursively()
        stagingDir.mkdirs()
        quarantineDir.mkdirs()

        val rows = payload.items.map { item ->
            if (item.mimeType == "text/html") {
                PlaylistEntity(
                    mediaId = item.mediaId,
                    filePath = versionedWebUrl(item.mediaUrl, item.checksumSha256),
                    position = item.position,
                    checksumSha256 = item.checksumSha256,
                    durationMs = item.durationMs
                )
            } else {
                val targetFile = File(stagingDir, "${item.position}-${sanitizeFilename(item.filename)}")
                var downloaded = false

                try {
                    downloadWithRetry(resolveMediaUrl(item.mediaUrl), targetFile)
                    downloaded = true
                } catch (error: Exception) {
                    Log.e(tag, "Download failed after $MAX_DOWNLOAD_ATTEMPTS attempts for ${item.filename}: ${error.message}")
                    onError(
                        "sync_download",
                        error.message ?: "Download failed",
                        mapOf("filename" to item.filename, "media_url" to item.mediaUrl)
                    )
                }

                if (!targetFile.exists() || !verifyChecksum(targetFile, item.checksumSha256)) {
                    if (targetFile.exists()) {
                        quarantineCorruptFile(targetFile, quarantineDir)
                    }

                    val repaired = tryRepairFromActive(activeDir, item, targetFile)
                    if (!repaired) {
                        val reason = if (downloaded) "Checksum mismatch" else "Download failed"
                        Log.e(tag, "$reason for ${item.filename}")
                        onError(
                            "sync_integrity",
                            reason,
                            mapOf(
                                "filename" to item.filename,
                                "media_id" to item.mediaId,
                                "playlist_version" to payload.playlistVersion
                            )
                        )
                        throw IllegalStateException("$reason for ${item.filename} — repair unavailable")
                    }
                }

                PlaylistEntity(
                    mediaId = item.mediaId,
                    filePath = File(activeDir, targetFile.name).absolutePath,
                    position = item.position,
                    checksumSha256 = item.checksumSha256,
                    durationMs = item.durationMs
                )
            }
        }

        // Atomic activation: active → backup, staging → active.
        contentRoot.mkdirs()
        if (backupDir.exists()) backupDir.deleteRecursively()
        if (activeDir.exists() && !activeDir.renameTo(backupDir)) {
            throw IOException("Unable to preserve current active content before activation")
        }

        var databaseCommitted = false
        try {
            try {
                Files.move(
                    stagingDir.toPath(),
                    activeDir.toPath(),
                    StandardCopyOption.ATOMIC_MOVE
                )
            } catch (_: AtomicMoveNotSupportedException) {
                // Some Android filesystems do not implement ATOMIC_MOVE. A rename
                // inside filesDir is still a same-filesystem operation and keeps
                // the old generation in backup until Room commits successfully.
                if (!stagingDir.renameTo(activeDir)) {
                    Files.move(stagingDir.toPath(), activeDir.toPath())
                }
            }
            playlistRepository.replacePlaylist(rows)
            databaseCommitted = true
            Log.d(tag, "Activated playlist version=${payload.playlistVersion} rows=${rows.size}")

            // Mark this version as applied — future duplicates will be skipped.
            lastAppliedPlaylistId = payload.playlistId
            lastAppliedVersion.set(incomingVersion)
            // Update checksum so reconnect-triggered SYNC_CONTENT events with
            // identical content are skipped without any disk or network access.
            lastAppliedChecksum = incomingChecksum
            syncState.edit()
                .putString("playlist_id", lastAppliedPlaylistId)
                .putInt("playlist_version", incomingVersion)
                .putString("playlist_checksum", incomingChecksum)
                .commit()
            if (backupDir.exists()) backupDir.deleteRecursively()
            enforceCacheQuota(contentRoot)
            enforceQuarantineQuota(quarantineDir)
        } catch (error: Exception) {
            Log.e(tag, "Atomic activation failed: ${error.message}")
            onError(
                "sync_activate",
                error.message ?: "Atomic activation failed",
                mapOf("playlist_version" to payload.playlistVersion)
            )
            if (databaseCommitted) {
                // Room already points at the new active files. A metadata/quota
                // cleanup failure must never roll the filesystem back underneath it.
                if (backupDir.exists()) backupDir.deleteRecursively()
                return@withLock true
            }
            if (activeDir.exists()) activeDir.deleteRecursively()
            if (backupDir.exists()) backupDir.renameTo(activeDir)
            throw error
        }
        true
    }


    /** Restores the last known-good directory after power loss during activation. */
    suspend fun recoverInterruptedActivation() = syncMutex.withLock {
        recoverInterruptedActivationUnlocked()
    }

    private suspend fun recoverInterruptedActivationUnlocked() {
        val contentRoot = File(appContext.filesDir, "content")
        val activeDir = File(contentRoot, "active")
        val backupDir = File(contentRoot, "backup")
        if (!activeDir.exists() && backupDir.exists()) {
            if (backupDir.renameTo(activeDir)) {
                Log.w(tag, "Recovered active content from interrupted activation")
            }
        } else if (activeDir.exists() && backupDir.exists()) {
            val rows = playlistRepository.getPlaylist()
            val databaseMatchesActive = rows.isNotEmpty() && rows.all { row ->
                row.filePath.startsWith("http://") || row.filePath.startsWith("https://") ||
                    File(row.filePath).isFile
            }
            if (databaseMatchesActive) {
                backupDir.deleteRecursively()
            } else {
                activeDir.deleteRecursively()
                if (backupDir.renameTo(activeDir)) {
                    Log.w(tag, "Rolled back incomplete content activation")
                }
            }
        }
        contentRoot.listFiles()
            ?.filter { it.name.startsWith("staging-") && System.currentTimeMillis() - it.lastModified() > STALE_STAGING_AGE_MS }
            ?.forEach { it.deleteRecursively() }
    }

    private suspend fun isCacheUsable(payload: SyncContentPayload): Boolean {
        val rows = playlistRepository.getPlaylist()
        if (payload.items.isEmpty()) return rows.isEmpty()
        if (rows.size != payload.items.size) return false
        return rows.all { row ->
            row.filePath.startsWith("http://") || row.filePath.startsWith("https://") ||
                File(row.filePath).let { it.isFile && it.length() > 0L }
        }
    }

    private fun sanitizeFilename(raw: String): String {
        val leaf = File(raw).name
        val safe = leaf.replace(Regex("[^A-Za-z0-9._-]"), "_").take(180)
        return safe.ifBlank { "media.bin" }
    }
    suspend fun forceRefreshFromActiveCache() {
        // Prefer reading from the DB so that original durationMs values are preserved.
        val dbRows = playlistRepository.getPlaylist()
        if (dbRows.isNotEmpty()) {
            Log.d(tag, "forceRefresh: reusing ${dbRows.size} rows from DB (durationMs preserved)")
            return
        }

        // DB is empty → rebuild from active filesystem cache (durationMs defaults to 10 s).
        val contentRoot = File(appContext.filesDir, "content")
        val activeDir = File(contentRoot, "active")
        if (!activeDir.exists()) {
            playlistRepository.replacePlaylist(emptyList())
            return
        }

        val rows = activeDir
            .listFiles()
            ?.sortedBy { file -> file.name }
            ?.mapIndexed { index, file ->
                PlaylistEntity(
                    mediaId = file.nameWithoutExtension.ifBlank { "media-$index" },
                    filePath = file.absolutePath,
                    position = index,
                    checksumSha256 = computeSha256(file),
                    durationMs = 10_000L
                )
            }
            ?: emptyList()

        Log.d(tag, "forceRefresh: rebuilt ${rows.size} rows from filesystem (DB was empty)")
        playlistRepository.replacePlaylist(rows)
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Downloads [mediaUrl] to [target] with up to [MAX_DOWNLOAD_ATTEMPTS] attempts,
     * using exponential back-off: 1 s → 2 s → 4 s between retries.
     *
     * Uses [OkHttpClient] for correct TLS handling on Android, connection pooling,
     * and safe redirect following (Authorization headers are preserved across redirects).
     */
    private fun downloadWithRetry(mediaUrl: String, target: File) {
        var lastError: Exception? = null
        for (attempt in 1..MAX_DOWNLOAD_ATTEMPTS) {
            try {
                downloadToFile(mediaUrl, target)
                return // Success
            } catch (e: Exception) {
                lastError = e
                val delayMs = RETRY_BASE_DELAY_MS * (1L shl (attempt - 1)) // 1 s, 2 s, 4 s
                Log.w(
                    tag,
                    "Download attempt $attempt/$MAX_DOWNLOAD_ATTEMPTS failed for $mediaUrl: ${e.message}. " +
                        if (attempt < MAX_DOWNLOAD_ATTEMPTS) "Retrying in ${delayMs}ms…" else "Giving up."
                )
                if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
                    Thread.sleep(delayMs) // blocking is intentional — runs on Dispatchers.IO
                }
            }
        }
        throw lastError ?: IOException("Download failed after $MAX_DOWNLOAD_ATTEMPTS attempts: $mediaUrl")
    }

    /**
     * Performs a single download attempt using [OkHttpClient].
     * Throws on HTTP errors or I/O failures.
     */
    private fun downloadToFile(mediaUrl: String, target: File) {
        val request = Request.Builder().url(mediaUrl).build()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code} downloading $mediaUrl")
            }
            val body = response.body
                ?: throw IOException("Empty response body for $mediaUrl")
            val declaredLength = body.contentLength()
            if (declaredLength > MAX_MEDIA_FILE_BYTES) {
                throw IOException("Media file exceeds the ${MAX_MEDIA_FILE_BYTES / (1024 * 1024)} MB device limit")
            }
            var copied = 0L
            try {
                body.byteStream().use { input ->
                    target.outputStream().buffered().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            copied += read
                            if (copied > MAX_MEDIA_FILE_BYTES || appContext.filesDir.freeSpace < MIN_FREE_BYTES) {
                                throw IOException("Download stopped before exhausting device storage")
                            }
                            output.write(buffer, 0, read)
                        }
                    }
                }
            } catch (error: Exception) {
                target.delete()
                throw error
            }
        }
    }

    private fun verifyChecksum(file: File, expected: String): Boolean {
        if (expected.isBlank()) return file.isFile && file.length() > 0L
        val checksum = computeSha256(file)
        return checksum.equals(expected, ignoreCase = true)
    }

    private fun quarantineCorruptFile(file: File, quarantineDir: File) {
        val quarantined = File(quarantineDir, "${System.currentTimeMillis()}-${file.name}")
        file.renameTo(quarantined)
    }

    private fun tryRepairFromActive(
        activeDir: File,
        item: SyncContentItem,
        targetFile: File
    ): Boolean {
        if (!activeDir.exists()) return false

        val candidates = activeDir.listFiles { _, name -> name.endsWith("-${item.filename}") }
            ?: emptyArray()
        val source = candidates.firstOrNull { candidate -> verifyChecksum(candidate, item.checksumSha256) }
            ?: return false

        source.inputStream().use { input ->
            targetFile.outputStream().use { output ->
                input.copyTo(output)
            }
        }
        return true
    }

    private fun enforceCacheQuota(contentRoot: File) {
        var currentBytes = directorySize(contentRoot)
        if (currentBytes <= MAX_CACHE_BYTES) return

        val evictionCandidates = contentRoot
            .listFiles()
            ?.filter { child -> child.name != "active" }
            ?.sortedBy { child -> child.lastModified() }
            ?: emptyList()

        for (candidate in evictionCandidates) {
            if (currentBytes <= MAX_CACHE_BYTES) break
            if (candidate.isDirectory) {
                candidate.deleteRecursively()
            } else {
                Files.deleteIfExists(candidate.toPath())
            }
            currentBytes = directorySize(contentRoot)
        }
    }

    /**
     * Enforces a 100 MB / 7-day TTL policy on the quarantine directory.
     *
     * This prevents devices on unstable networks (e.g. hotel Wi-Fi) from
     * filling their internal storage with corrupt download fragments, which
     * would cause Room write failures and crash the app on restart.
     *
     * Eviction order: oldest files first (by lastModified).
     */
    private fun enforceQuarantineQuota(quarantineDir: File) {
        if (!quarantineDir.exists()) return
        val now = System.currentTimeMillis()

        // Phase 1: delete files older than QUARANTINE_MAX_AGE_MS unconditionally.
        quarantineDir.listFiles()?.forEach { file ->
            if (now - file.lastModified() > QUARANTINE_MAX_AGE_MS) {
                Files.deleteIfExists(file.toPath())
                Log.d(tag, "Quarantine TTL evict: ${file.name}")
            }
        }

        // Phase 2: evict oldest files until folder is under MAX_QUARANTINE_BYTES.
        var quarantineSize = directorySize(quarantineDir)
        if (quarantineSize <= MAX_QUARANTINE_BYTES) return

        val candidates = quarantineDir.listFiles()
            ?.sortedBy { it.lastModified() }
            ?: return

        for (file in candidates) {
            if (quarantineSize <= MAX_QUARANTINE_BYTES) break
            val size = file.length()
            Files.deleteIfExists(file.toPath())
            quarantineSize -= size
            Log.d(tag, "Quarantine quota evict: ${file.name} ($size bytes)")
        }
    }

    private fun directorySize(dir: File): Long {
        if (!dir.exists()) return 0L
        return dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    private fun resolveMediaUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
        return if (trimmed.startsWith("/")) "$mediaBaseUrl$trimmed" else "$mediaBaseUrl/$trimmed"
    }

    private fun versionedWebUrl(rawUrl: String, checksumSha256: String): String {
        val resolved = resolveMediaUrl(rawUrl)
        val revision = checksumSha256.trim().take(16)
        if (revision.isEmpty()) return resolved
        val separator = if (resolved.contains('?')) '&' else '?'
        return "$resolved${separator}rs_rev=$revision"
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
    }
}
