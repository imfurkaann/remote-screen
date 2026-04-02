package com.signage.player.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "playlist_items")
data class PlaylistEntity(
    @PrimaryKey val mediaId: String,
    val filePath: String,
    val position: Int,
    val checksumSha256: String,
    val durationMs: Long
)
