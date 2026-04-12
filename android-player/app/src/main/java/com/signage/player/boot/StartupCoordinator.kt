package com.signage.player.boot

import android.content.Context
import com.signage.player.commands.CommandDispatchPayload
import com.signage.player.commands.CommandExecutor
import com.signage.player.config.AppDefaults
import com.signage.player.mediaplayer.PlaybackCoordinator
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

object StartupCoordinator {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun enqueueStartup(
        context: Context,
        runtimeDeviceId: String? = null,
        socketBaseUrl: String? = null
    ) {
        val hardwareId = HardwareIdStore(context).getOrCreateHardwareId()
        val socketDeviceId = runtimeDeviceId ?: hardwareId
        val resolvedSocketBaseUrl = socketBaseUrl ?: AppDefaults.BACKEND_BASE_URL
        val telemetryReporter = DeviceTelemetryReporter(
            baseUrl = resolvedSocketBaseUrl,
            bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
            tenantId = AppDefaults.TENANT_ID,
            hardwareId = hardwareId,
            deviceIdHint = runtimeDeviceId
        )
        val db = PlayerDatabaseProvider.getDatabase(context)
        val playlistRepository = PlaylistRepository(db.playlistDao())
        val syncManager = ContentSyncManager(context, playlistRepository) { source, message, details ->
            telemetryReporter.reportError(source, message, details)
        }
        val playbackCoordinator = PlaybackCoordinator(context, playlistRepository) { source, message, details ->
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

        SocketClientManager.registerSyncHandler { payload ->
            try {
                syncManager.applySyncPayload(payload)
                playbackCoordinator.reloadAndPlayFromCache()
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

        SocketClientManager.initialize(socketDeviceId, resolvedSocketBaseUrl)
    }
}
