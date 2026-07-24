package com.signage.player.telemetry

import android.content.Context
import android.util.Log
import com.signage.player.network.DevicePairingState
import com.signage.player.network.SessionManager
import com.signage.player.network.TelemetryApiService
import com.signage.player.network.TelemetryRequest
import com.signage.player.network.TelemetryRetrofitFactory
import com.signage.player.storage.PairingStateStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Reports errors using the single device session owned by SessionManager.
 * It never creates a second token-refresh loop, which keeps reconnect storms
 * bounded and guarantees socket, screenshots and telemetry use one identity.
 */
class DeviceTelemetryReporter(
    context: Context,
    baseUrl: String,
    private var tenantId: String?,
    private val hardwareId: String
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val telemetryApi: TelemetryApiService = TelemetryRetrofitFactory.create(baseUrl)
    private val pairingStore = PairingStateStore(context)
    private val lastReportedAt = ConcurrentHashMap<String, Long>()

    companion object {
        private const val TAG = "DeviceTelemetryReporter"
        private const val MIN_REPEAT_INTERVAL_MS = 5 * 60 * 1_000L
    }

    suspend fun getAccessToken(): String? = currentSession().first

    suspend fun getDeviceId(): String? = currentSession().second

    fun reportError(source: String, message: String, details: Map<String, Any?> = emptyMap()) {
        scope.launch {
            val (token, deviceId) = currentSession()
            if (token.isNullOrBlank() || deviceId.isNullOrBlank()) {
                Log.w(TAG, "Telemetry skipped: no verified or cached device session")
                return@launch
            }

            try {
                telemetryApi.postTelemetry(
                    deviceId = deviceId,
                    authorization = "Bearer $token",
                    request = TelemetryRequest(
                        kind = "error",
                        correlation_id = UUID.randomUUID().toString(),
                        payload = sanitizePayload(source, message, details)
                    )
                )
            } catch (error: Exception) {
                if (error is HttpException && error.code() == 401) {
                    SessionManager.requestImmediateRefresh()
                }
                Log.w(TAG, "Failed to post telemetry to backend: ${error.message}")
            }
        }
    }

    private fun currentSession(): Pair<String?, String?> {
        val active = SessionManager.state.value
        if (active is DevicePairingState.Paired) return active.token to active.deviceId

        val persisted = pairingStore.loadState()
        return if (persisted.isPaired) persisted.accessToken to persisted.deviceId else null to null
    }

    private fun sanitizePayload(source: String, message: String, details: Map<String, Any?>): Map<String, Any> {
        val payload = linkedMapOf<String, Any>(
            "source" to source.take(128),
            "message" to message.take(2_048),
            "hardware_id" to hardwareId,
            "tenant_id" to (tenantId ?: "")
        )

        details.entries.take(50).forEach { (key, value) ->
            payload[key.take(64)] = when (value) {
                null -> "null"
                is String -> value.take(4_096)
                is Number, is Boolean -> value
                else -> value.toString().take(4_096)
            }
        }
        return payload
    }
}