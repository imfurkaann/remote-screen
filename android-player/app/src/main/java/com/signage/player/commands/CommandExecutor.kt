package com.signage.player.commands

import android.content.Context
import android.media.AudioManager
import android.net.wifi.WifiManager
import com.signage.player.ui.PlayerUiStateStore
import com.signage.player.boot.StartupCoordinator
import java.io.File
import java.io.FileOutputStream
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
                    // Restart the app by launching a fresh instance of the main activity
                    // and killing the current process cleanly.
                    val intent = appContext.packageManager
                        .getLaunchIntentForPackage(appContext.packageName)
                        ?.apply {
                            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                                     android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK)
                        }
                    if (intent != null) {
                        appContext.startActivity(intent)
                    }
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        android.os.Process.killProcess(android.os.Process.myPid())
                    }, 500)
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
                                val wifiManager = appContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as android.net.wifi.WifiManager
                                val info = wifiManager.connectionInfo
                                if (info != null) {
                                    val rssi = info.rssi
                                    val level = android.net.wifi.WifiManager.calculateSignalLevel(rssi, 100)
                                    diagnostics["wifi_rssi"] = rssi
                                    diagnostics["wifi_signal_level"] = level
                                    diagnostics["wifi_ssid"] = info.ssid
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
                    val fileToUpload = if (screenshotFile == null) {
                        writePlaceholderScreenshot(deviceId, command.commandId)
                        File(File(appContext.filesDir, "screenshots"), "$deviceId-${command.commandId}.png")
                    } else {
                        screenshotFile
                    }

                    var finalUrl: String? = null
                    try {
                        val backendUrl = StartupCoordinator.getBackendBaseUrl()
                        val api = com.signage.player.network.RetrofitFactory.create(backendUrl)
                        val reporter = StartupCoordinator.getTelemetryReporter()
                        val token = reporter?.getAccessToken()
                        val resolvedDeviceId = reporter?.getDeviceId() ?: deviceId

                        if (!token.isNullOrBlank()) {
                            val requestFile = fileToUpload.asRequestBody("image/png".toMediaTypeOrNull())
                            val multipartBody = okhttp3.MultipartBody.Part.createFormData("file", fileToUpload.name, requestFile)
                            val response = api.uploadScreenshot(
                                deviceId = resolvedDeviceId,
                                authorization = "Bearer $token",
                                file = multipartBody
                            )
                            finalUrl = response.screenshot_url
                        }
                    } catch (e: Exception) {
                        onError("screenshot_upload", e.message ?: "Failed to upload screenshot", emptyMap())
                    }

                    if (finalUrl == null) {
                        finalUrl = fileToUpload.toURI().toString()
                    } else {
                        if (fileToUpload.name.startsWith("screenshot_")) {
                            fileToUpload.delete()
                        }
                    }

                    CommandAckPayload(
                        deviceId = deviceId,
                        commandId = command.commandId,
                        status = "COMPLETED",
                        screenshotUrl = finalUrl
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
        val screenshotFile = File(screenshotDir, "$deviceId-$commandId.png")
        try {
            val bitmap = android.graphics.Bitmap.createBitmap(800, 600, android.graphics.Bitmap.Config.ARGB_8888)
            val canvas = android.graphics.Canvas(bitmap)
            val paint = android.graphics.Paint()
            
            paint.color = android.graphics.Color.DKGRAY
            canvas.drawRect(0f, 0f, 800f, 600f, paint)
            
            paint.color = android.graphics.Color.WHITE
            paint.textSize = 36f
            paint.isAntiAlias = true
            canvas.drawText("Device Screenshot", 50f, 100f, paint)
            
            paint.color = android.graphics.Color.LTGRAY
            paint.textSize = 24f
            canvas.drawText("Device ID: $deviceId", 50f, 180f, paint)
            canvas.drawText("Command ID: $commandId", 50f, 230f, paint)
            canvas.drawText("Timestamp: ${java.util.Date()}", 50f, 280f, paint)
            
            paint.color = android.graphics.Color.GREEN
            canvas.drawCircle(700f, 100f, 30f, paint)
            
            FileOutputStream(screenshotFile).use { out ->
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
            }
        } catch (e: Exception) {
            val txtFile = File(screenshotDir, "$deviceId-$commandId.txt")
            txtFile.writeText("SCREENSHOT_FALLBACK_PLACEHOLDER")
            return txtFile.toURI().toString()
        }
        return screenshotFile.toURI().toString()
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
