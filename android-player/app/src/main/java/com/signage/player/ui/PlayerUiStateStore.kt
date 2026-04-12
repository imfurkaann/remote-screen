package com.signage.player.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlayerUiState(
    val showConnectionInfo: Boolean = false
)

object PlayerUiStateStore {
    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    fun setShowConnectionInfo(show: Boolean) {
        _state.value = _state.value.copy(showConnectionInfo = show)
    }
}
