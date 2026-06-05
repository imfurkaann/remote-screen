package com.signage.player.telemetry

import android.util.Log
import com.signage.player.network.DeviceSessionRequest
import com.signage.player.network.PairingApiService
import com.signage.player.network.RetrofitFactory
import com.signage.player.network.TelemetryApiService
import com.signage.player.network.TelemetryRequest
import com.signage.player.network.TelemetryRetrofitFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.UUID

class DeviceTelemetryReporter(
    baseUrl: String,
    private val bootstrapKey: String,
    private val tenantId: String,
    private val hardwareId: String,
    private var deviceIdHint: String? = null
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pairingApi: PairingApiService = RetrofitFactory.create(baseUrl)
    private val telemetryApi: TelemetryApiService = TelemetryRetrofitFactory.create(baseUrl)

    @Volatile
    private var accessToken: String? = null

    suspend fun getAccessToken(): String? {
        try {
            ensureDeviceSession()
        } catch (_: Exception) {}
        return accessToken
    }

    suspend fun getDeviceId(): String? {
        try {
            ensureDeviceSession()
        } catch (_: Exception) {}
        return deviceIdHint
    }

    fun reportError(source: String, message: String, details: Map<String, Any?> = emptyMap()) {
        scope.launch {
            try {
                if (!ensureDeviceSession()) {
                    return@launch
                }

                val deviceId = deviceIdHint ?: return@launch
                val token = accessToken ?: return@launch
                val payload = sanitizePayload(source, message, details)

                telemetryApi.postTelemetry(
                    deviceId = deviceId,
                    authorization = "Bearer $token",
                    request = TelemetryRequest(
                        kind = "error",
                        correlation_id = UUID.randomUUID().toString(),
                        payload = payload
                    )
                )
            } catch (error: Exception) {
                Log.w(TAG, "Failed to report telemetry error: ${error.message}")
            }
        }
    }

    private suspend fun ensureDeviceSession(): Boolean {
        if (!accessToken.isNullOrBlank() && !deviceIdHint.isNullOrBlank()) {
            return true
        }

        val response = pairingApi.refreshDeviceSession(
            bootstrapKey = bootstrapKey,
            request = DeviceSessionRequest(
                hardware_id = hardwareId,
                tenant_id = tenantId
            )
        )

        accessToken = response.access_token
        deviceIdHint = response.device_id
        return !accessToken.isNullOrBlank() && !deviceIdHint.isNullOrBlank()
    }

    private fun sanitizePayload(source: String, message: String, details: Map<String, Any?>): Map<String, Any> {
        val payload = linkedMapOf<String, Any>(
            "source" to source,
            "message" to message,
            "hardware_id" to hardwareId,
            "tenant_id" to tenantId
        )

        for ((key, value) in details) {
            when (value) {
                null -> payload[key] = "null"
                is String, is Number, is Boolean -> payload[key] = value
                else -> payload[key] = value.toString()
            }
        }

        return payload
    }

    companion object {
        private const val TAG = "DeviceTelemetryReporter"
    }
}
