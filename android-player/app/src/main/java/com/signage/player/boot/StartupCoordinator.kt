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

object StartupCoordinator {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile
    private var playerControllerRef: PlayerController? = null
    @Volatile
    private var backendBaseUrl: String = AppDefaults.BACKEND_BASE_URL
    @Volatile
    private var telemetryReporterRef: DeviceTelemetryReporter? = null

    fun getPlayerController(): PlayerController? = playerControllerRef
    fun getBackendBaseUrl(): String = backendBaseUrl
    fun getTelemetryReporter(): DeviceTelemetryReporter? = telemetryReporterRef

    fun forceReset(context: Context) {
        appScope.launch {
            try {
                Log.d("StartupCoordinator", "Forcing device unpair and clearing all local caches...")
                
                // 0. Stop SessionManager first to prevent background thread race conditions
                SessionManager.stop()

                // 1. Call backend unpair API
                val resolvedSocketBaseUrl = getBackendBaseUrl()
                val pairingApi = RetrofitFactory.create(resolvedSocketBaseUrl)
                val hardwareId = HardwareIdStore(context).getOrCreateHardwareId()
                try {
                    pairingApi.unpairDevice(
                        bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
                        request = UnpairRequest(hardware_id = hardwareId)
                    )
                    Log.d("StartupCoordinator", "Backend unpair completed successfully")
                } catch (e: Exception) {
                    Log.e("StartupCoordinator", "Failed to call backend unpair API", e)
                }

                // 2. Clear pairing state in store
                val store = PairingStateStore(context)
                store.clearPaired()

                // 3. Clear database playlist
                val db = PlayerDatabaseProvider.getDatabase(context)
                val playlistRepository = PlaylistRepository(db.playlistDao())
                playlistRepository.replacePlaylist(emptyList())

                // 4. Delete cached media files on disk
                val contentRoot = File(context.filesDir, "content")
                if (contentRoot.exists()) {
                    contentRoot.deleteRecursively()
                }

                // 5. Force pause player controller reference so playback stops
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                    playerControllerRef?.pause()
                }

                // 6. Restart SessionManager in unpaired state
                val activePairingApi = RetrofitFactory.create(getBackendBaseUrl())
                SessionManager.start(
                    context = context,
                    hardwareId = HardwareIdStore(context).getOrCreateHardwareId(),
                    api = activePairingApi
                )
            } catch (e: Exception) {
                Log.e("StartupCoordinator", "Failed to force reset", e)
            }
        }
    }

    private var screenshotProvider: (suspend () -> File?)? = null

    fun registerScreenshotProvider(provider: suspend () -> File?) {
        screenshotProvider = provider
    }

    fun unregisterScreenshotProvider() {
        screenshotProvider = null
    }

    suspend fun takeScreenshot(): File? {
        return screenshotProvider?.invoke()
    }

    fun enqueueStartup(
        context: Context,
        runtimeDeviceId: String? = null,
        socketBaseUrl: String? = null
    ) {
        // Ensure the foreground service is running so the OS does not kill the
        // process during startup (e.g. while SessionManager is doing its first
        // network handshake). This is idempotent — safe to call multiple times.
        PlayerForegroundService.start(context)

        val hardwareId = HardwareIdStore(context).getOrCreateHardwareId()
        val socketDeviceId = runtimeDeviceId ?: hardwareId
        val resolvedSocketBaseUrl = socketBaseUrl ?: AppDefaults.BACKEND_BASE_URL
        backendBaseUrl = resolvedSocketBaseUrl

        // Start the session manager early — before any UI is built — so the
        // optimistic state is ready the moment PairingScreen first composes.
        val pairingApi = RetrofitFactory.create(resolvedSocketBaseUrl)
        SessionManager.start(
            context = context,
            hardwareId = hardwareId,
            api = pairingApi
        )
        val telemetryReporter = DeviceTelemetryReporter(
            baseUrl = resolvedSocketBaseUrl,
            bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
            tenantId = null,
            hardwareId = hardwareId,
            deviceIdHint = runtimeDeviceId
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
            playerController = playerController
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
            playbackCoordinator.restoreAndPlayFromCache()
        }

        appScope.launch {
            com.signage.player.config.OperatingHoursManager.checkAndApply(context)
            while (true) {
                kotlinx.coroutines.delay(10000)
                com.signage.player.config.OperatingHoursManager.checkAndApply(context)
            }
        }

        SocketClientManager.registerSyncHandler { payload ->
            try {
                syncManager.applySyncPayload(payload)
                // Improvement 4: graceful reload — give the current item up to
                // GRACE_PERIOD_MS to finish naturally before swapping the playlist.
                // On 1 000+ devices this prevents a simultaneous hard-cut on all screens.
                playbackCoordinator.gracefulReload(PlaybackCoordinator.GRACE_PERIOD_MS)
                playbackCoordinator.persistSnapshot()
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
            val ackPayload = commandExecutor.execute(socketDeviceId, payload)
            SocketClientManager.emitCommandAck(ackPayload)
        }

        SocketClientManager.initialize(context, socketDeviceId, resolvedSocketBaseUrl)
    }
}
