package com.signage.player.sync

data class SyncContentItem(
    val mediaId: String,
    val filename: String,
    val mediaUrl: String,
    val checksumSha256: String,
    val mimeType: String,
    val durationMs: Long,
    val position: Int
)

data class SyncContentPayload(
    val playlistId: String,
    val playlistVersion: Int,
    val checksumSha256: String,
    val items: List<SyncContentItem>
)
