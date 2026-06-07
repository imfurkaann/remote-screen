package com.signage.player.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PlayerUiState(
    val showConnectionInfo: Boolean = false,
    val currentMediaFilePath: String? = null,
    val currentMediaIsImage: Boolean = false,
    val isScreenOff: Boolean = false,
    val orientation: Int = 0,
    val scaleMode: String = "fit",
    /** 0f = fully transparent (mid-transition), 1f = fully visible (steady state). */
    val transitionAlpha: Float = 1f
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

    fun setScaleMode(mode: String) {
        _state.value = _state.value.copy(scaleMode = mode)
    }

    /**
     * Called at the beginning of a media transition (fade-out phase).
     * Sets alpha to 0 so Compose animates toward invisible.
     */
    fun beginTransition() {
        _state.value = _state.value.copy(transitionAlpha = 0f)
    }

    /**
     * Called after the new media path has been set (fade-in phase).
     * Sets alpha to 1 so Compose animates back to fully visible.
     */
    fun endTransition() {
        _state.value = _state.value.copy(transitionAlpha = 1f)
    }
}
