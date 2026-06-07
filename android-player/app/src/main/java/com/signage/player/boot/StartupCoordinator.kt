package com.signage.player.boot

import android.content.Context
import com.signage.player.commands.CommandDispatchPayload
import com.signage.player.commands.CommandExecutor
import com.signage.player.config.AppDefaults
import com.signage.player.mediaplayer.PlaybackCoordinator
import com.signage.player.mediaplayer.PlayerController
import com.signage.player.network.RetrofitFactory
import com.signage.player.network.SessionManager
import com.signage.player.network.SocketClientManager
import com.signage.player.storage.PlayerDatabaseProvider
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
            tenantId = AppDefaults.TENANT_ID,
            api = pairingApi
        )
        val telemetryReporter = DeviceTelemetryReporter(
            baseUrl = resolvedSocketBaseUrl,
            bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
            tenantId = AppDefaults.TENANT_ID,
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
