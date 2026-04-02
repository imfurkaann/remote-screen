package com.signage.player.storage

import android.content.Context
import androidx.room.Room

object PlayerDatabaseProvider {
    @Volatile
    private var instance: PlayerDatabase? = null

    fun getDatabase(context: Context): PlayerDatabase {
        return instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                PlayerDatabase::class.java,
                "player-db"
            ).build().also { created ->
                instance = created
            }
        }
    }
}
