package com.signage.player.network

import com.signage.player.commands.CommandAckPayload
import com.signage.player.commands.CommandDispatchPayload
import com.signage.player.sync.SyncContentPayload
import com.signage.player.sync.SyncContentItem
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URISyntaxException
import kotlin.math.min
import kotlin.random.Random

object SocketClientManager {
    private const val TAG = "SocketClientManager"
    private const val BASE_DELAY_MS = 1_000L
    private const val MAX_DELAY_MS = 30_000L
    private const val HEARTBEAT_INTERVAL_MS = 30_000L
    private val socketScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var reconnectAttempt: Int = 0
    private var syncHandler: (suspend (SyncContentPayload) -> Unit)? = null
    private var commandHandler: (suspend (CommandDispatchPayload) -> Unit)? = null
    private var socket: Socket? = null
    private var heartbeatJob: kotlinx.coroutines.Job? = null
    private var appContext: android.content.Context? = null

    fun registerSyncHandler(handler: suspend (SyncContentPayload) -> Unit) {
        syncHandler = handler
    }

    fun registerCommandHandler(handler: suspend (CommandDispatchPayload) -> Unit) {
        commandHandler = handler
    }

    fun initialize(context: android.content.Context, deviceId: String, socketBaseUrl: String = "http://10.0.2.2:4100") {
        appContext = context.applicationContext
        reconnectAttempt = 0
        connect(deviceId, socketBaseUrl)
    }

    private fun connect(deviceId: String, socketBaseUrl: String) {
        if (deviceId.isBlank()) {
            reconnectAttempt = 0
            return
        }

        socket?.disconnect()
        socket?.off()

        val options = IO.Options.builder()
            .setAuth(mapOf("device_id" to deviceId))
            .setQuery("device_id=$deviceId")
            .setReconnection(true)
            .setReconnectionAttempts(Int.MAX_VALUE)
            .setReconnectionDelay(BASE_DELAY_MS)
            .setReconnectionDelayMax(MAX_DELAY_MS)
            .build()

        val newSocket = try {
            IO.socket("$socketBaseUrl/device", options)
        } catch (_: URISyntaxException) {
            Log.e(TAG, "Invalid socket URL: $socketBaseUrl")
            return
        }

        newSocket.on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Connected socket for device_id=$deviceId")
            onConnected()
            startHeartbeat()
        }

        newSocket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e(TAG, "Socket connect error: ${args.firstOrNull()}")
        }

        newSocket.on(Socket.EVENT_DISCONNECT) { args ->
            Log.w(TAG, "Socket disconnected: ${args.firstOrNull()}")
            heartbeatJob?.cancel()
            heartbeatJob = null
        }

        newSocket.on("SYNC_CONTENT") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val mapped = mapSyncPayload(payload) ?: return@on
            Log.d(TAG, "Received SYNC_CONTENT playlist=${mapped.playlistId} items=${mapped.items.size}")
            socketScope.launch {
                syncHandler?.invoke(mapped)
            }
        }

        newSocket.on("COMMAND_DISPATCH") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val mapped = mapCommandPayload(payload) ?: return@on
            Log.d(TAG, "Received COMMAND_DISPATCH id=${mapped.commandId} type=${mapped.commandType}")
            socketScope.launch {
                commandHandler?.invoke(mapped)
            }
        }

        socket = newSocket
        newSocket.connect()
    }

    // Remove unused public dispatchers — sync and commands are handled via socket events only.
    // (Dead code removed: dispatchSyncPayload / dispatchCommandPayload)

    fun emitCommandAck(ack: CommandAckPayload) {
        val payload = JSONObject().apply {
            put("device_id", ack.deviceId)
            put("command_id", ack.commandId)
            put("status", ack.status)
            if (!ack.screenshotUrl.isNullOrBlank()) {
                put("screenshot_url", ack.screenshotUrl)
            }
            if (!ack.errorMessage.isNullOrBlank()) {
                put("error_message", ack.errorMessage)
            }
        }

        Log.d(TAG, "Emitting COMMAND_ACK id=${ack.commandId} status=${ack.status}")
        socket?.emit("COMMAND_ACK", payload)
    }

    fun nextReconnectDelayMs(): Long {
        val expDelay = BASE_DELAY_MS * (1L shl reconnectAttempt.coerceAtMost(10))
        val cappedDelay = min(expDelay, MAX_DELAY_MS)
        val jitter = Random.nextLong(0L, cappedDelay / 2 + 1)
        reconnectAttempt += 1
        return cappedDelay / 2 + jitter
    }

    fun onConnected() {
        reconnectAttempt = 0
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = socketScope.launch {
            while (isActive) {
                val payload = JSONObject().apply {
                    val ctx = appContext
                    if (ctx != null) {
                        try {
                            put("ipAddress", getIpAddress())
                            put("playerVersion", getPlayerVersion(ctx))
                            put("osVersion", "Android " + android.os.Build.VERSION.RELEASE + " (SDK " + android.os.Build.VERSION.SDK_INT + ")")
                            val metrics = ctx.resources.displayMetrics
                            put("resolution", "${metrics.widthPixels}x${metrics.heightPixels}")
                            val (total, used) = getMemoryInfo(ctx)
                            put("memoryTotal", total)
                            put("memoryUsed", used)
                        } catch (e: Exception) {
                            Log.e(TAG, "Error compiling heartbeat telemetry", e)
                        }
                    }
                }
                socket?.emit("HEARTBEAT", payload)
                Log.d(TAG, "HEARTBEAT emitted: $payload")
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private fun getIpAddress(): String {
        return try {
            val interfaces = java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())
            var ip = "Unknown"
            for (intf in interfaces) {
                val addrs = java.util.Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress) {
                        val sAddr = addr.hostAddress
                        if (sAddr != null) {
                            val isIPv4 = sAddr.indexOf(':') < 0
                            if (isIPv4) {
                                ip = sAddr
                                break
                            }
                        }
                    }
                }
            }
            ip
        } catch (ex: Exception) {
            "Unknown"
        }
    }

    private fun getPlayerVersion(context: android.content.Context): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "Unknown"
        } catch (e: Exception) {
            "Unknown"
        }
    }

    private fun getMemoryInfo(context: android.content.Context): Pair<String, String> {
        return try {
            val actManager = context.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val memInfo = android.app.ActivityManager.MemoryInfo()
            actManager.getMemoryInfo(memInfo)
            val totalGb = memInfo.totalMem.toDouble() / (1024 * 1024 * 1024)
            val availGb = memInfo.availMem.toDouble() / (1024 * 1024 * 1024)
            val usedGb = totalGb - availGb
            val totalStr = String.format(java.util.Locale.US, "%.1f GB", totalGb)
            val usedStr = String.format(java.util.Locale.US, "%.1f GB used", usedGb)
            Pair(totalStr, usedStr)
        } catch (e: Exception) {
            Pair("Unknown", "Unknown")
        }
    }

    private fun mapCommandPayload(json: JSONObject): CommandDispatchPayload? {
        val commandId = json.optString("command_id").trim()
        val commandType = json.optString("command_type").trim()
        if (commandId.isBlank() || commandType.isBlank()) {
            return null
        }

        val payloadObject = json.optJSONObject("payload")
        val payload = mutableMapOf<String, Any?>()
        if (payloadObject != null) {
            val keys = payloadObject.keys()
            while (keys.hasNext()) {
                val key = keys.next().toString()
                payload[key] = payloadObject.opt(key)
            }
        }

        return CommandDispatchPayload(
            commandId = commandId,
            commandType = commandType,
            payload = payload,
            timeoutMs = json.optLong("timeout_ms", 15000L),
            attempt = json.optInt("attempt", 1)
        )
    }

    private fun mapSyncPayload(json: JSONObject): SyncContentPayload? {
        val playlistId = json.optString("playlist_id").trim()
        if (playlistId.isBlank()) {
            return null
        }

        val items = mutableListOf<SyncContentItem>()
        val array = json.optJSONArray("items") ?: JSONArray()
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            items += SyncContentItem(
                mediaId = item.optString("media_id"),
                filename = item.optString("filename"),
                mediaUrl = item.optString("media_url"),
                checksumSha256 = item.optString("checksum_sha256"),
                mimeType = item.optString("mime_type"),
                durationMs = item.optLong("duration_ms", 0L),
                position = item.optInt("position", index)
            )
        }

        return SyncContentPayload(
            playlistId = playlistId,
            playlistVersion = json.optInt("playlist_version", 1),
            checksumSha256 = json.optString("checksum_sha256"),
            items = items
        )
    }
}
