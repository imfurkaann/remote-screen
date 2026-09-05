package com.signage.player.boot

import android.content.Context
import android.util.Log
import com.signage.player.commands.CommandDispatchPayload
import com.signage.player.commands.CommandExecutor
import com.signage.player.config.AppDefaults
import com.signage.player.mediaplayer.PlaybackCoordinator
import com.signage.player.mediaplayer.PlayerController
import com.signage.player.network.RetrofitFactory
import com.signage.player.network.SessionManager
import com.signage.player.network.NetworkMonitor
import com.signage.player.network.SocketClientManager
import com.signage.player.network.UnpairRequest
import com.signage.player.storage.PlayerDatabaseProvider
import com.signage.player.storage.PairingStateStore
import com.signage.player.storage.HardwareIdStore
import com.signage.player.storage.PlaylistRepository
import com.signage.player.sync.ContentSyncManager
import com.signage.player.telemetry.DeviceTelemetryReporter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Application-level singleton that owns the entire player service graph.
 *
 * ## Idempotency guarantee (fixes K1 / Y5)
 * [enqueueStartup] is called from three entry points:
 *  - [MainActivity.onCreate]
 *  - [BootReceiver.onReceive]
 *  - Occasionally from test harnesses
 *
 * Without an idempotency guard every call creates a second [PlayerController],
 * [PlaybackCoordinator], and [SocketClientManager], leaving orphaned coroutine
 * scopes, unreleased ExoPlayer instances, and duplicate socket connections.
 *
 * The [started] flag (AtomicBoolean) makes the first call perform the full
 * setup and all subsequent calls a no-op. [forceReset] resets pairing state
 * without rebuilding the long-lived service graph.
 */
object StartupCoordinator {
    private const val TAG = "StartupCoordinator"

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Guards against duplicate initialisation.  Set to true after the first
     * successful [enqueueStartup] call and never reset during the process lifetime.
     */
    private val started = AtomicBoolean(false)

    @Volatile private var playerControllerRef: PlayerController? = null
    @Volatile private var backendBaseUrl: String = AppDefaults.BACKEND_BASE_URL
    @Volatile private var telemetryReporterRef: DeviceTelemetryReporter? = null

    fun getPlayerController(): PlayerController? = playerControllerRef
    fun isStarted(): Boolean = started.get()
    fun getBackendBaseUrl(): String = backendBaseUrl
    fun getTelemetryReporter(): DeviceTelemetryReporter? = telemetryReporterRef

    // -------------------------------------------------------------------------
    // Screenshot provider
    // -------------------------------------------------------------------------

    @Volatile private var screenshotProvider: (suspend () -> File?)? = null
    private var screenshotProviderOwner: Any? = null

    @Synchronized
    fun registerScreenshotProvider(owner: Any, provider: suspend () -> File?) {
        screenshotProviderOwner = owner
        screenshotProvider = provider
    }

    @Synchronized
    fun unregisterScreenshotProvider(owner: Any) {
        if (screenshotProviderOwner === owner) {
            screenshotProviderOwner = null
            screenshotProvider = null
        }
    }

    suspend fun takeScreenshot(): File? = screenshotProvider?.invoke()

    // -------------------------------------------------------------------------
    // Force reset (unpair + clear)
    // -------------------------------------------------------------------------

    fun forceReset(context: Context) {
        appScope.launch {
            try {
                Log.d(TAG, "Forcing device unpair and clearing all local caches…")


                // 0. Stop SessionManager first to prevent background thread race conditions.
                SessionManager.stop()

                // 1. Call backend unpair API.
                val resolvedUrl = getBackendBaseUrl()
                val pairingApi = RetrofitFactory.create(resolvedUrl)
                val hardwareId = HardwareIdStore(context).getOrCreateHardwareId()
                try {
                    val accessToken = PairingStateStore(context).loadState().accessToken
                    if (!accessToken.isNullOrBlank()) {
                        pairingApi.unpairDevice(
                            authorization = "Bearer " + accessToken,
                            request = UnpairRequest(hardware_id = hardwareId)
                        )
                        Log.d(TAG, "Backend unpair completed successfully")
                    } else {
                        Log.w(TAG, "No active device session; backend unpair skipped")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to call backend unpair API", e)
                }

                // 2. Clear pairing state.
                PairingStateStore(context).clearPaired()

                // 3. Clear playlist from database.
                val db = PlayerDatabaseProvider.getDatabase(context)
                PlaylistRepository(db.playlistDao()).replacePlaylist(emptyList())

                // 4. Delete cached media files from disk.
                val contentRoot = File(context.filesDir, "content")
                if (contentRoot.exists()) contentRoot.deleteRecursively()

                // 5. Pause current playback on Main thread to stop audio/video output.
                kotlinx.coroutines.withContext(Dispatchers.Main) {
                    playerControllerRef?.pause()
                }

                // 6. Restart SessionManager in Unpaired state so the pairing screen appears.
                val freshApi = RetrofitFactory.create(getBackendBaseUrl())
                SessionManager.start(
                    context = context,
                    hardwareId = HardwareIdStore(context).getOrCreateHardwareId(),
                    api = freshApi
                )

                Log.d(TAG, "Force reset completed — device is now unpaired")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to force reset", e)
            }
        }
    }

    // -------------------------------------------------------------------------
    // Startup
    // -------------------------------------------------------------------------

    /**
     * Initialises the full player service graph exactly once per process lifetime.
     *
     * Subsequent calls (e.g. from [MainActivity.onCreate] on config-change or
     * from [BootReceiver] if the Activity is already alive) are **silently
     * ignored** thanks to the [started] AtomicBoolean guard.
     *
     * Call [forceReset] to allow a fresh initialisation (e.g. after unpair).
     */
    fun enqueueStartup(
        context: Context,
        runtimeDeviceId: String? = null,
        socketBaseUrl: String? = null,
        ensureForegroundService: Boolean = true
    ) {
        // Idempotency guard — only the very first caller proceeds.
        if (!started.compareAndSet(false, true)) {
            Log.d(TAG, "enqueueStartup called but already initialised — skipping")
            // Always guarantee the foreground service is alive on every call
            // even if the rest of the setup is already done.
            if (ensureForegroundService) PlayerForegroundService.start(context)
            return
        }

        Log.d(TAG, "enqueueStartup — first call, performing full setup")

        // Ensure the foreground service is running so the OS does not kill the
        // process during startup (e.g. while SessionManager is doing its first
        // network handshake).
        if (ensureForegroundService) PlayerForegroundService.start(context)

        val hardwareId = HardwareIdStore(context).getOrCreateHardwareId()
        val socketDeviceId = runtimeDeviceId ?: hardwareId
        val prefs = context.getSharedPreferences("signage_player_config", Context.MODE_PRIVATE)
        if (!socketBaseUrl.isNullOrBlank()) {
            prefs.edit().putString("backend_base_url", socketBaseUrl).apply()
        }
        val savedUrl = prefs.getString("backend_base_url", null)
        val resolvedSocketBaseUrl = socketBaseUrl ?: savedUrl ?: AppDefaults.BACKEND_BASE_URL
        backendBaseUrl = resolvedSocketBaseUrl

        // Start the session manager early — before any UI is built — so the
        // optimistic state is ready the moment PairingScreen first composes.
        val pairingApi = RetrofitFactory.create(resolvedSocketBaseUrl)
        NetworkMonitor.start(context)
        SessionManager.start(
            context = context,
            hardwareId = hardwareId,
            api = pairingApi
        )

        val telemetryReporter = DeviceTelemetryReporter(
            context = context,
            baseUrl = resolvedSocketBaseUrl,
            tenantId = null,
            hardwareId = hardwareId
        )
        telemetryReporterRef = telemetryReporter

        val db = PlayerDatabaseProvider.getDatabase(context)
        val playlistRepository = PlaylistRepository(db.playlistDao())

        val syncManager = ContentSyncManager(
            appContext = context,
            playlistRepository = playlistRepository,
            mediaBaseUrl = resolvedSocketBaseUrl
        ) { source, message, details ->
            telemetryReporter.reportError(source, message, details)
        }


        val playerController = PlayerController(context)
        playerControllerRef = playerController

        val playbackCoordinator = PlaybackCoordinator(
            context = context,
            playlistRepository = playlistRepository,
            playerController = playerController,
            onPlaybackChanged = { mediaId, startedAtEpochMs ->
                SocketClientManager.updatePlaybackState(mediaId, startedAtEpochMs)
            }
        ) { source, message, details ->
            telemetryReporter.reportError(source, message, details)
        }

        val commandExecutor = CommandExecutor(
            appContext = context,
            onForceRefresh = {
                syncManager.forceRefreshFromActiveCache()
                playbackCoordinator.reloadAndPlayFromCache()
                playbackCoordinator.persistSnapshot()
            },
            onError = { source, message, details ->
                telemetryReporter.reportError(source, message, details)
            }
        )

        appScope.launch {
            syncManager.recoverInterruptedActivation()
            playbackCoordinator.restoreAndPlayFromCache()
        }

        appScope.launch {
            com.signage.player.config.OperatingHoursManager.checkAndApply(context)
            while (true) {
                kotlinx.coroutines.delay(60_000)
                com.signage.player.config.OperatingHoursManager.checkAndApply(context)
            }
        }

        SocketClientManager.registerSyncHandler { payload ->
            try {
                if (syncManager.applySyncPayload(payload)) {
                    playbackCoordinator.gracefulReload(PlaybackCoordinator.GRACE_PERIOD_MS)
                    playbackCoordinator.persistSnapshot()
                }
            } catch (error: Exception) {
                telemetryReporter.reportError(
                    "sync_handler",
                    "Unhandled sync handler exception",
                    mapOf(
                        "playlist_id" to payload.playlistId,
                        "error" to (error.message ?: error::class.java.simpleName)
                    )
                )
            }
        }

        SocketClientManager.registerCommandHandler { payload: CommandDispatchPayload ->
            val activeId = SocketClientManager.currentDeviceId.ifBlank { socketDeviceId }
            val timeoutMs = payload.timeoutMs.coerceIn(1_000L, 120_000L)
            val ackPayload = kotlinx.coroutines.withTimeoutOrNull(timeoutMs) {
                commandExecutor.execute(activeId, payload)
            } ?: com.signage.player.commands.CommandAckPayload(
                deviceId = activeId,
                commandId = payload.commandId,
                status = "FAILED",
                errorMessage = "Command timed out after ${timeoutMs}ms"
            )
            SocketClientManager.emitCommandAck(ackPayload)
        }

        // Dynamically track pairing state changes to re-initialize the socket with the
        // correct Mongo device ID when paired, or fallback to hardwareId when unpaired.
        // This ensures the device's WebSocket room membership matches the backend database state
        // instantly after pairing, preventing first-publish content synchronization failures.
        appScope.launch {
            var currentSocketId = socketDeviceId
            var currentSocketToken = PairingStateStore(context).loadState().accessToken.orEmpty()
            com.signage.player.network.SessionManager.state.collect { state ->
                val targetSocketId = when (state) {
                    is com.signage.player.network.DevicePairingState.Paired -> state.deviceId
                    else -> hardwareId
                }
                val targetToken = when (state) {
                    is com.signage.player.network.DevicePairingState.Paired -> state.token
                    else -> ""
                }
                if (targetSocketId != currentSocketId || targetToken != currentSocketToken) {
                    Log.i(TAG, "Pairing state changed — re-initialising authenticated socket")
                    currentSocketId = targetSocketId
                    currentSocketToken = targetToken
                    SocketClientManager.initialize(
                        context,
                        targetSocketId,
                        targetToken,
                        resolvedSocketBaseUrl
                    )
                }
            }
        }

        val initialToken = PairingStateStore(context).loadState().accessToken.orEmpty()
        SocketClientManager.initialize(context, socketDeviceId, initialToken, resolvedSocketBaseUrl)

        Log.d(TAG, "enqueueStartup — setup complete")
    }
}
