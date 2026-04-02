package com.signage.player.storage

class PlaylistRepository(
    private val dao: PlaylistDao
) {
    suspend fun replacePlaylist(items: List<PlaylistEntity>) {
        dao.replaceAll(items)
    }

    suspend fun getPlaylist(): List<PlaylistEntity> = dao.getAll()
}
