package com.signage.player.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface PlaylistDao {
    @Query("SELECT * FROM playlist_items ORDER BY position ASC")
    suspend fun getAll(): List<PlaylistEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<PlaylistEntity>)

    @Query("DELETE FROM playlist_items")
    suspend fun clear()

    @Transaction
    suspend fun replaceAll(items: List<PlaylistEntity>) {
        clear()
        upsertAll(items)
    }
}
