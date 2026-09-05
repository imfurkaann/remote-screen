package com.signage.player.network

import com.signage.player.commands.CommandAckPayload
import com.signage.player.commands.CommandDispatchPayload
import com.signage.player.config.AppDefaults
import com.signage.player.sync.SyncContentPayload
import com.signage.player.sync.SyncContentItem
import android.util.Log
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import com.signage.player.storage.PendingCommandAckStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.URISyntaxException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min
import kotlin.random.Random

object SocketClientManager {
    private const val TAG = "SocketClientManager"
    private const val BASE_DELAY_MS = 1_000L
    private const val MAX_DELAY_MS = 30_000L
    private const val HEARTBEAT_INTERVAL_MS = 60_000L
    private val socketScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile var currentDeviceId: String = ""
        private set
    @Volatile private var currentMediaId: String? = null
    @Volatile private var playbackStartedAt: String? = null

    private var reconnectAttempt: Int = 0
    private var syncHandler: (suspend (SyncContentPayload) -> Unit)? = null
    private var commandHandler: (suspend (CommandDispatchPayload) -> Unit)? = null
    private var socket: Socket? = null
    private var heartbeatJob: kotlinx.coroutines.Job? = null
    private var appContext: android.content.Context? = null
    private var screenStateReceiver: android.content.BroadcastReceiver? = null
    private var pendingAckStore: PendingCommandAckStore? = null
    private val inFlightCommands = ConcurrentHashMap.newKeySet<String>()

    fun registerSyncHandler(handler: suspend (SyncContentPayload) -> Unit) {
        syncHandler = handler
    }

    fun registerCommandHandler(handler: suspend (CommandDispatchPayload) -> Unit) {
        commandHandler = handler
    }

    /** Keeps the most recent playback state for reconnects and emits a prompt update. */
    fun updatePlaybackState(mediaId: String?, startedAtEpochMs: Long?) {
        currentMediaId = mediaId?.takeIf { it.isNotBlank() }?.take(64)
        playbackStartedAt = startedAtEpochMs?.let { java.time.Instant.ofEpochMilli(it).toString() }

        val connectedSocket = socket?.takeIf { it.connected() } ?: return
        connectedSocket.emit("HEARTBEAT", JSONObject().apply {
            put("currentMediaId", currentMediaId ?: JSONObject.NULL)
            put("playbackStartedAt", playbackStartedAt ?: JSONObject.NULL)
        })
    }

    /**
     * Initialises (or reinitialises) the socket connection.
     *
     * Marked @Synchronized to prevent a race where two threads (e.g. a very
     * early BootReceiver and MainActivity.onCreate on a fast device) could
     * call this simultaneously, leading to two socket connections with the same
     * deviceId joining the same room and receiving duplicate SYNC_CONTENT events.
     *
     * After K1 (StartupCoordinator idempotency guard) this path is normally
     * called exactly once per process lifetime; the @Synchronized annotation is
     * a belt-and-suspenders safety net.
     */
    @Synchronized
    fun initialize(
        context: android.content.Context,
        deviceId: String,
        accessToken: String,
        socketBaseUrl: String = AppDefaults.BACKEND_BASE_URL
    ) {
        appContext = context.applicationContext
        registerScreenStateReceiver()
        pendingAckStore = PendingCommandAckStore(context)
        connect(deviceId, accessToken, socketBaseUrl)
    }

    private fun connect(deviceId: String, accessToken: String, socketBaseUrl: String) {
        if (deviceId.isBlank() || accessToken.isBlank()) {
            currentDeviceId = ""
            socket?.disconnect()
            socket?.off()
            socket = null
            return
        }
        currentDeviceId = deviceId

        socket?.disconnect()
        socket?.off()

        val socketTraceId = UUID.randomUUID().toString()
        val options = IO.Options.builder()
            .setAuth(mapOf("token" to accessToken, "trace_id" to socketTraceId))
            .setReconnection(true)
            .setReconnectionAttempts(Int.MAX_VALUE)
            .setReconnectionDelay(BASE_DELAY_MS)
            .setReconnectionDelayMax(MAX_DELAY_MS)
            .build()

        ConnectionDiagnostics.socketConnecting(socketTraceId)

        val newSocket = try {
            IO.socket("$socketBaseUrl/device", options)
        } catch (_: URISyntaxException) {
            Log.e(TAG, "Invalid socket URL: $socketBaseUrl")
            return
        }

        newSocket.on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Connected socket for device_id=$deviceId")
            ConnectionDiagnostics.socketConnected(socketTraceId)
            onConnected()
            startHeartbeat()
            flushPendingAcks(newSocket)
        }

        newSocket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            val message = args.firstOrNull()?.toString().orEmpty()
            Log.e(TAG, "Socket connect error: $message")
            ConnectionDiagnostics.socketFailed(
                socketTraceId,
                message.ifBlank { "Bilinmeyen socket bağlantı hatası" }
            )
            if (message.contains("Authentication", ignoreCase = true) ||
                message.contains("unauthorized", ignoreCase = true)
            ) {
                SessionManager.requestImmediateRefresh()
            }
        }

        newSocket.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.firstOrNull()?.toString().orEmpty().ifBlank { "Bilinmeyen ayrılma nedeni" }
            Log.w(TAG, "Socket disconnected: $reason")
            ConnectionDiagnostics.socketDisconnected(socketTraceId, reason)
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
            val pendingResult = pendingAckStore?.get(mapped.commandId)
            if (pendingResult != null) {
                Log.d(TAG, "Command already executed; resending durable ACK id=${mapped.commandId}")
                sendAck(newSocket, pendingResult)
                return@on
            }
            if (!inFlightCommands.add(mapped.commandId)) {
                Log.d(TAG, "Command already executing; duplicate ignored id=${mapped.commandId}")
                return@on
            }
            Log.d(TAG, "Received COMMAND_DISPATCH id=${mapped.commandId} type=${mapped.commandType}")
            socketScope.launch {
                try {
                    commandHandler?.invoke(mapped)
                } finally {
                    inFlightCommands.remove(mapped.commandId)
                }
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
            if (!ack.screenshotUrl.isNullOrBlank()) put("screenshot_url", ack.screenshotUrl)
            if (!ack.errorMessage.isNullOrBlank()) put("error_message", ack.errorMessage)
            if (ack.diagnostics != null) {
                val diagnosticsJson = JSONObject()
                ack.diagnostics.forEach { (key, value) ->
                    diagnosticsJson.put(key, if (value is Map<*, *>) JSONObject(value) else value)
                }
                put("diagnostics", diagnosticsJson)
            }
        }

        // Persist before emitting. Removal happens only after the backend confirms
        // that the ACK was committed to the command store.
        pendingAckStore?.put(ack.commandId, payload)
        val activeSocket = socket
        if (activeSocket?.connected() == true) sendAck(activeSocket, payload)
    }

    private fun flushPendingAcks(targetSocket: Socket) {
        pendingAckStore?.all()?.forEach { sendAck(targetSocket, it) }
    }

    private fun sendAck(targetSocket: Socket, payload: JSONObject) {
        val commandId = payload.optString("command_id")
        if (commandId.isBlank() || !targetSocket.connected()) return
        targetSocket.emit("COMMAND_ACK", payload, Ack { args ->
            val response = args.firstOrNull() as? JSONObject
            if (response?.optBoolean("accepted", false) == true) {
                pendingAckStore?.remove(commandId)
                Log.d(TAG, "Backend confirmed COMMAND_ACK id=$commandId")
            }
        })
    }
    @Synchronized
    fun reconnectNow() {
        val active = socket ?: return
        if (active.connected()) {
            flushPendingAcks(active)
        } else {
            Log.i(TAG, "Requesting immediate socket reconnect")
            active.connect()
        }
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

    private fun registerScreenStateReceiver() {
        if (screenStateReceiver != null) return
        val ctx = appContext ?: return
        val receiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
                if (intent?.action == android.content.Intent.ACTION_SCREEN_ON ||
                    intent?.action == android.content.Intent.ACTION_SCREEN_OFF
                ) {
                    emitScreenPowerHeartbeat()
                }
            }
        }
        val filter = android.content.IntentFilter().apply {
            addAction(android.content.Intent.ACTION_SCREEN_ON)
            addAction(android.content.Intent.ACTION_SCREEN_OFF)
        }
        ctx.registerReceiver(receiver, filter, android.content.Context.RECEIVER_NOT_EXPORTED)
        screenStateReceiver = receiver
    }

    private fun emitScreenPowerHeartbeat() {
        val ctx = appContext ?: return
        val connectedSocket = socket?.takeIf { it.connected() } ?: return
        val powerManager = ctx.getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
        connectedSocket.emit("HEARTBEAT", JSONObject().put("screenOn", powerManager?.isInteractive == true))
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = socketScope.launch {
            while (isActive) {
                val payload = JSONObject().apply {
                    put("currentMediaId", currentMediaId ?: JSONObject.NULL)
                    put("playbackStartedAt", playbackStartedAt ?: JSONObject.NULL)
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
                            val powerManager = ctx.getSystemService(android.content.Context.POWER_SERVICE) as? android.os.PowerManager
                            put("screenOn", powerManager?.isInteractive == true)
                        } catch (e: Exception) {
                            Log.e(TAG, "Error compiling heartbeat telemetry", e)
                        }
                    }
                }
                socket?.emit("HEARTBEAT", payload)
                socket?.let { if (it.connected()) flushPendingAcks(it) }
                Log.v(TAG, "HEARTBEAT emitted")
                // Per-device jitter prevents synchronized heartbeat bursts after
                // mass power restoration while keeping online detection prompt.
                val jitteredDelay = Random.nextLong(
                    HEARTBEAT_INTERVAL_MS - 5_000L,
                    HEARTBEAT_INTERVAL_MS + 5_001L
                )
                delay(jitteredDelay)
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

        val playlistId = if (json.isNull("playlist_id")) "" else json.optString("playlist_id").trim()
        if (playlistId.isBlank() && items.isNotEmpty()) return null

        return SyncContentPayload(
            playlistId = playlistId,
            playlistVersion = json.optInt("playlist_version", 1),
            checksumSha256 = json.optString("checksum_sha256"),
            items = items
        )
    }
}
