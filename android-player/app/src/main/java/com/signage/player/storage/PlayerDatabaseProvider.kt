package com.signage.player.storage

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase

object PlayerDatabaseProvider {
    @Volatile
    private var instance: PlayerDatabase? = null

    fun getDatabase(context: Context): PlayerDatabase {
        return instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                PlayerDatabase::class.java,
                "player-db"
            )
                .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                .build().also { created ->
                instance = created
            }
        }
    }
}
