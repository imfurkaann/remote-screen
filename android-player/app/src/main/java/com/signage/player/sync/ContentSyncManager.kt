package com.signage.player.sync

import android.content.Context
import android.util.Log
import com.signage.player.config.AppDefaults
import com.signage.player.storage.PlaylistEntity
import com.signage.player.storage.PlaylistRepository
import java.io.File
import java.io.FileOutputStream
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

class ContentSyncManager(
    private val appContext: Context,
    private val playlistRepository: PlaylistRepository,
    private val mediaBaseUrl: String = DEFAULT_MEDIA_BASE_URL,
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    private val tag = "ContentSyncManager"

    suspend fun applySyncPayload(payload: SyncContentPayload) {
        Log.d(tag, "Applying SYNC_CONTENT playlist=${payload.playlistId} version=${payload.playlistVersion} items=${payload.items.size}")
        val contentRoot = File(appContext.filesDir, "content")
        val activeDir = File(contentRoot, "active")
        val stagingDir = File(contentRoot, "staging-${payload.playlistVersion}")
        val backupDir = File(contentRoot, "backup")
        val quarantineDir = File(contentRoot, "quarantine")

        if (stagingDir.exists()) {
            stagingDir.deleteRecursively()
        }
        stagingDir.mkdirs()
        quarantineDir.mkdirs()

        val rows = payload.items.map { item ->
            val targetFile = File(stagingDir, "${item.position}-${item.filename}")
            var downloaded = false
            try {
                downloadToFile(resolveMediaUrl(item.mediaUrl), targetFile)
                downloaded = true
            } catch (error: Exception) {
                Log.e(tag, "Download failed for ${item.filename}: ${error.message}")
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
                    throw IllegalStateException("$reason for ${item.filename} and no repair candidate found")
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

        // Atomic activation: active -> backup, staging -> active.
        contentRoot.mkdirs()
        if (backupDir.exists()) {
            backupDir.deleteRecursively()
        }
        if (activeDir.exists()) {
            activeDir.renameTo(backupDir)
        }

        try {
            java.nio.file.Files.move(
                stagingDir.toPath(),
                activeDir.toPath(),
                StandardCopyOption.ATOMIC_MOVE
            )
            playlistRepository.replacePlaylist(rows)
            Log.d(tag, "Activated playlist version=${payload.playlistVersion} rows=${rows.size}")
            if (backupDir.exists()) {
                backupDir.deleteRecursively()
            }
            enforceCacheQuota(contentRoot)
        } catch (error: Exception) {
            Log.e(tag, "Atomic activation failed: ${error.message}")
            onError(
                "sync_activate",
                error.message ?: "Atomic activation failed",
                mapOf("playlist_version" to payload.playlistVersion)
            )
            if (activeDir.exists()) {
                activeDir.deleteRecursively()
            }
            if (backupDir.exists()) {
                backupDir.renameTo(activeDir)
            }
            throw error
        }
    }

    private fun verifyChecksum(file: File, expected: String): Boolean {
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
        if (!activeDir.exists()) {
            return false
        }

        val candidates = activeDir.listFiles { _, name -> name.endsWith("-${item.filename}") } ?: emptyArray()
        val source = candidates.firstOrNull { candidate -> verifyChecksum(candidate, item.checksumSha256) }
            ?: return false

        source.inputStream().use { input ->
            FileOutputStream(targetFile).use { output ->
                input.copyTo(output)
            }
        }
        return true
    }

    private fun enforceCacheQuota(contentRoot: File) {
        val maxBytes = MAX_CACHE_BYTES
        var currentBytes = directorySize(contentRoot)
        if (currentBytes <= maxBytes) {
            return
        }

        val evictionCandidates = contentRoot
            .listFiles()
            ?.filter { child -> child.name != "active" }
            ?.sortedBy { child -> child.lastModified() }
            ?: emptyList()

        for (candidate in evictionCandidates) {
            if (currentBytes <= maxBytes) {
                break
            }
            if (candidate.isDirectory) {
                candidate.deleteRecursively()
            } else {
                Files.deleteIfExists(candidate.toPath())
            }
            currentBytes = directorySize(contentRoot)
        }
    }

    private fun directorySize(dir: File): Long {
        if (!dir.exists()) {
            return 0L
        }
        return dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    private fun downloadToFile(mediaUrl: String, target: File) {
        val connection = URL(mediaUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 60_000
        connection.instanceFollowRedirects = true

        try {
            connection.connect()
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException("Download failed with HTTP ${connection.responseCode}")
            }

            target.outputStream().use { output ->
                connection.inputStream.use { input ->
                    input.copyTo(output)
                }
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun resolveMediaUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim()
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed
        }

        return if (trimmed.startsWith("/")) {
            "$mediaBaseUrl$trimmed"
        } else {
            "$mediaBaseUrl/$trimmed"
        }
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) {
                    break
                }
                digest.update(buffer, 0, read)
            }
        }

        return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
    }

    suspend fun forceRefreshFromActiveCache() {
        // Prefer reading from the DB so that original durationMs values are preserved.
        // Filesystem fallback is only used when the DB is empty (first boot or after wipe).
        val dbRows = playlistRepository.getPlaylist()
        if (dbRows.isNotEmpty()) {
            Log.d(tag, "forceRefresh: reusing ${dbRows.size} rows from DB (durationMs preserved)")
            return  // DB already has correct state; PlaybackCoordinator will reload from it
        }

        // DB is empty → rebuild from active filesystem cache (durationMs defaults to 10s)
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

    companion object {
        private const val MAX_CACHE_BYTES = 2L * 1024L * 1024L * 1024L
        // Default falls back to AppDefaults so there is a single source of truth for the backend URL.
        val DEFAULT_MEDIA_BASE_URL: String get() = AppDefaults.BACKEND_BASE_URL
    }
}
