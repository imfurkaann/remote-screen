package com.signage.player.storage

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [PlaylistEntity::class], version = 1, exportSchema = false)
abstract class PlayerDatabase : RoomDatabase() {
    abstract fun playlistDao(): PlaylistDao
}
