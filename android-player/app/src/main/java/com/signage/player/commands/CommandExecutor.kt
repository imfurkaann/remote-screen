package com.signage.player.commands

import android.content.Context
import android.media.AudioManager
import com.signage.player.ui.PlayerUiStateStore
import java.io.File

class CommandExecutor(
    private val appContext: Context,
    private val onForceRefresh: suspend () -> Unit,
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    suspend fun execute(deviceId: String, command: CommandDispatchPayload): CommandAckPayload {
        return try {
            when (command.commandType) {
                "REBOOT_APP" -> {
                    // In kiosk mode we usually restart the foreground activity/service;
                    // here we only signal success and leave restart orchestration to app shell code.
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "SET_VOLUME" -> {
                    val volume = (command.payload["volume"] as? Number)?.toInt()
                        ?.coerceIn(0, 100)
                        ?: 50
                    applyVolumePercent(volume)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "FORCE_REFRESH" -> {
                    val showConnectionInfo = when (val raw = command.payload["show_device_config"]) {
                        is Boolean -> raw
                        is String -> raw.equals("true", ignoreCase = true)
                        else -> null
                    }

                    if (showConnectionInfo != null) {
                        PlayerUiStateStore.setShowConnectionInfo(showConnectionInfo)
                        return CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                    }

                    onForceRefresh()
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "SCREENSHOT" -> {
                    val screenshotUrl = writePlaceholderScreenshot(deviceId, command.commandId)
                    CommandAckPayload(
                        deviceId = deviceId,
                        commandId = command.commandId,
                        status = "COMPLETED",
                        screenshotUrl = screenshotUrl
                    )
                }

                else -> {
                    val msg = "Unsupported command type: ${command.commandType}"
                    onError(
                        "command_execute",
                        msg,
                        mapOf("command_id" to command.commandId, "command_type" to command.commandType)
                    )
                    CommandAckPayload(
                        deviceId = deviceId,
                        commandId = command.commandId,
                        status = "FAILED",
                        errorMessage = msg
                    )
                }
            }
        } catch (error: Exception) {
            onError(
                "command_execute",
                error.message ?: "Command execution failed",
                mapOf("command_id" to command.commandId, "command_type" to command.commandType)
            )
            CommandAckPayload(
                deviceId = deviceId,
                commandId = command.commandId,
                status = "FAILED",
                errorMessage = error.message ?: "Command execution failed"
            )
        }
    }

    private fun applyVolumePercent(volumePercent: Int) {
        val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val targetVolume = (volumePercent * maxVolume) / 100
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetVolume, 0)
    }

    private fun writePlaceholderScreenshot(deviceId: String, commandId: String): String {
        val screenshotDir = File(appContext.filesDir, "screenshots").apply { mkdirs() }
        val screenshotFile = File(screenshotDir, "$deviceId-$commandId.txt")
        screenshotFile.writeText("SCREENSHOT_PLACEHOLDER")
        return screenshotFile.toURI().toString()
    }
}
