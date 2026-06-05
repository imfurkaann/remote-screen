package com.signage.player.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlayerUiState(
    val showConnectionInfo: Boolean = false,
    val currentMediaFilePath: String? = null,
    val currentMediaIsImage: Boolean = false,
    val isScreenOff: Boolean = false,
    val orientation: Int = 0
)

object PlayerUiStateStore {
    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    fun setShowConnectionInfo(show: Boolean) {
        _state.value = _state.value.copy(showConnectionInfo = show)
    }

    fun setCurrentMedia(filePath: String?, isImage: Boolean) {
        _state.value = _state.value.copy(
            currentMediaFilePath = filePath,
            currentMediaIsImage = isImage
        )
    }

    fun setScreenOff(off: Boolean) {
        _state.value = _state.value.copy(isScreenOff = off)
    }

    fun setOrientation(angle: Int) {
        _state.value = _state.value.copy(orientation = angle)
    }
}
