package com.signage.player.commands

import android.content.Context
import android.media.AudioManager
import com.signage.player.ui.PlayerUiStateStore
import com.signage.player.boot.StartupCoordinator
import java.io.File
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.asRequestBody

class CommandExecutor(
    private val appContext: Context,
    private val onForceRefresh: suspend () -> Unit,
    private val onError: (source: String, message: String, details: Map<String, Any?>) -> Unit = { _, _, _ -> }
) {
    suspend fun execute(deviceId: String, command: CommandDispatchPayload): CommandAckPayload {
        return try {
            when (command.commandType) {
                "REBOOT_APP" -> {
                    // ACK is persisted by SocketClientManager before this delayed
                    // process exit. The watchdog then restores service + visible UI.
                    com.signage.player.boot.PlayerForegroundService.scheduleRestart(appContext, 2_500L)
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        android.os.Process.killProcess(android.os.Process.myPid())
                    }, 1_500L)
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

                "SCREEN_OFF" -> {
                    PlayerUiStateStore.setScreenOff(true)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "SCREEN_ON" -> {
                    PlayerUiStateStore.setScreenOff(false)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "SET_ORIENTATION" -> {
                    val angle = (command.payload["orientation"] as? Number)?.toInt() ?: 0
                    PlayerUiStateStore.setOrientation(angle)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "SET_SCALE_MODE" -> {
                    val scaleMode = command.payload["scale_mode"] as? String ?: "fit"
                    PlayerUiStateStore.setScaleMode(scaleMode)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "SET_OPERATING_HOURS" -> {
                    val config = command.payload["operating_hours"] as? String ?: "Always On"
                    com.signage.player.storage.OperatingHoursStore(appContext).saveOperatingHours(config)
                    com.signage.player.config.OperatingHoursManager.checkAndApply(appContext)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "CLEAR_CACHE" -> {
                    // Delete active content, temp cache, and DB playlist, then trigger refetch.
                    val contentRoot = File(appContext.filesDir, "content")
                    if (contentRoot.exists()) {
                        contentRoot.deleteRecursively()
                    }
                    val db = com.signage.player.storage.PlayerDatabaseProvider.getDatabase(appContext)
                    com.signage.player.storage.PlaylistRepository(db.playlistDao()).replacePlaylist(emptyList())
                    onForceRefresh()
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "FACTORY_RESET" -> {
                    // Trigger unpair and factory reset of application configurations
                    StartupCoordinator.forceReset(appContext)
                    CommandAckPayload(deviceId, command.commandId, "COMPLETED")
                }

                "GET_DIAGNOSTICS" -> {
                    val diagnostics = mutableMapOf<String, Any?>()
                    
                    // 1. Storage Diagnostics
                    try {
                        val stat = android.os.StatFs(appContext.filesDir.path)
                        val blockSize = stat.blockSizeLong
                        val totalBlocks = stat.blockCountLong
                        val availableBlocks = stat.availableBlocksLong
                        
                        val totalBytes = totalBlocks * blockSize
                        val freeBytes = availableBlocks * blockSize
                        val usedBytes = totalBytes - freeBytes
                        val usagePercent = if (totalBytes > 0) (usedBytes * 100) / totalBytes else 0
                        
                        diagnostics["storage_total_mb"] = totalBytes / (1024 * 1024)
                        diagnostics["storage_free_mb"] = freeBytes / (1024 * 1024)
                        diagnostics["storage_usage_percent"] = usagePercent
                    } catch (e: Exception) {
                        diagnostics["storage_error"] = e.message
                    }
                    
                    // 2. Network / Wi-Fi Diagnostics
                    try {
                        val connManager = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
                        val activeNetwork = connManager.activeNetwork
                        val capabilities = connManager.getNetworkCapabilities(activeNetwork)
                        
                        if (capabilities != null) {
                            val isWifi = capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
                            val isEthernet = capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET)
                            val isCellular = capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR)
                            
                            diagnostics["network_type"] = when {
                                isWifi -> "WIFI"
                                isEthernet -> "ETHERNET"
                                isCellular -> "CELLULAR"
                                else -> "UNKNOWN"
                            }
                            
                            if (isWifi) {
                                val wifiManager = appContext.applicationContext
                                    .getSystemService(android.net.wifi.WifiManager::class.java)
                                val info = capabilities.transportInfo as? android.net.wifi.WifiInfo
                                if (info != null) {
                                    val rssi = info.rssi
                                    diagnostics["wifi_rssi"] = rssi
                                    diagnostics["wifi_signal_level"] = wifiManager.calculateSignalLevel(rssi)
                                }
                            }
                        } else {
                            diagnostics["network_type"] = "DISCONNECTED"
                        }
                    } catch (e: Exception) {
                        diagnostics["network_error"] = e.message
                    }

                    // 3. Memory Diagnostics
                    try {
                        val actManager = appContext.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
                        val memInfo = android.app.ActivityManager.MemoryInfo()
                        actManager.getMemoryInfo(memInfo)
                        
                        val totalGb = memInfo.totalMem.toDouble() / (1024 * 1024 * 1024)
                        val availGb = memInfo.availMem.toDouble() / (1024 * 1024 * 1024)
                        val usedGb = totalGb - availGb
                        val usagePercent = if (memInfo.totalMem > 0) ((memInfo.totalMem - memInfo.availMem) * 100) / memInfo.totalMem else 0
                        
                        diagnostics["memory_total_gb"] = String.format(java.util.Locale.US, "%.2f", totalGb)
                        diagnostics["memory_free_gb"] = String.format(java.util.Locale.US, "%.2f", availGb)
                        diagnostics["memory_used_gb"] = String.format(java.util.Locale.US, "%.2f", usedGb)
                        diagnostics["memory_usage_percent"] = usagePercent
                    } catch (e: Exception) {
                        diagnostics["memory_error"] = e.message
                    }

                    // 4. Logcat Logs (Last 60 lines)
                    try {
                        diagnostics["logs"] = getRecentLogcat()
                    } catch (e: Exception) {
                        diagnostics["logs"] = "Error reading logcat: ${e.message}"
                    }

                    CommandAckPayload(
                        deviceId = deviceId,
                        commandId = command.commandId,
                        status = "COMPLETED",
                        diagnostics = diagnostics
                    )
                }

                "SCREENSHOT" -> {
                    val screenshotFile = StartupCoordinator.takeScreenshot()
                        ?: return CommandAckPayload(
                            deviceId = deviceId,
                            commandId = command.commandId,
                            status = "FAILED",
                            errorMessage = "Screenshot unavailable because the player UI is not visible"
                        )

                    var finalUrl: String? = null
                    var uploadError = "Screenshot upload failed"
                    try {
                        val backendUrl = StartupCoordinator.getBackendBaseUrl()
                        val api = com.signage.player.network.RetrofitFactory.create(backendUrl)
                        val reporter = StartupCoordinator.getTelemetryReporter()
                        val token = reporter?.getAccessToken()
                        val resolvedDeviceId = reporter?.getDeviceId() ?: deviceId
                        if (token.isNullOrBlank()) {
                            uploadError = "No authenticated device session for screenshot upload"
                        } else {
                            val requestFile = screenshotFile.asRequestBody("image/png".toMediaTypeOrNull())
                            val multipartBody = okhttp3.MultipartBody.Part.createFormData(
                                "file", screenshotFile.name, requestFile
                            )
                            finalUrl = api.uploadScreenshot(
                                deviceId = resolvedDeviceId,
                                authorization = "Bearer $token",
                                file = multipartBody
                            ).screenshot_url
                        }
                    } catch (error: Exception) {
                        uploadError = error.message ?: uploadError
                        onError("screenshot_upload", uploadError, emptyMap())
                    }

                    if (finalUrl.isNullOrBlank()) {
                        CommandAckPayload(
                            deviceId = deviceId,
                            commandId = command.commandId,
                            status = "FAILED",
                            errorMessage = uploadError
                        )
                    } else {
                        screenshotFile.delete()
                        CommandAckPayload(
                            deviceId = deviceId,
                            commandId = command.commandId,
                            status = "COMPLETED",
                            screenshotUrl = finalUrl
                        )
                    }
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

    private fun getRecentLogcat(): String {
        return try {
            val process = Runtime.getRuntime().exec("logcat -d -t 60 *:I")
            val reader = java.io.BufferedReader(java.io.InputStreamReader(process.inputStream))
            val log = StringBuilder()
            var line: String? = reader.readLine()
            while (line != null) {
                log.append(line).append("\n")
                line = reader.readLine()
            }
            reader.close()
            log.toString().ifBlank { "Logcat stream is empty or permission denied." }
        } catch (e: Exception) {
            "Failed to fetch logcat: ${e.message}"
        }
    }
}
