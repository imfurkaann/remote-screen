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

/**
 * Reports device telemetry and errors to the backend.
 *
 * ## Y2 fix — no more silent exception swallowing
 * The previous implementation swallowed all exceptions inside [ensureDeviceSession]
 * and [getAccessToken] without logging, meaning an expired or invalid token would
 * silently disable all telemetry. Production operators had no visibility into why
 * error events stopped arriving.
 *
 * Changes:
 *  - [ensureDeviceSession] now logs every exception with its full message.
 *  - Token is considered expired after [TOKEN_TTL_MS] (7 hours) and is refreshed
 *    proactively so that long-running devices never silently stop reporting.
 *  - [reportError] retries the session once if the first attempt fails before
 *    giving up, so a transient network hiccup doesn't lose the error record.
 */
class DeviceTelemetryReporter(
    baseUrl: String,
    private val bootstrapKey: String,
    private var tenantId: String?,
    private val hardwareId: String,
    private var deviceIdHint: String? = null
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pairingApi: PairingApiService = RetrofitFactory.create(baseUrl)
    private val telemetryApi: TelemetryApiService = TelemetryRetrofitFactory.create(baseUrl)

    @Volatile private var accessToken: String? = null

    /**
     * Wall-clock time (ms) when [accessToken] was last successfully obtained.
     * The token is proactively refreshed after [TOKEN_TTL_MS] to avoid silent
     * failures when the device has been running for many hours without a restart.
     */
    @Volatile private var tokenFetchedAtMs: Long = 0L

    companion object {
        private const val TAG = "DeviceTelemetryReporter"

        /**
         * Proactive token refresh threshold.
         * Backend JWTs are typically valid for 8 hours; we refresh at 7 hours
         * so there is always a 1-hour buffer before the token actually expires.
         */
        private const val TOKEN_TTL_MS = 7L * 60 * 60 * 1_000L
    }

    suspend fun getAccessToken(): String? {
        return try {
            ensureDeviceSession()
            accessToken
        } catch (e: Exception) {
            Log.w(TAG, "getAccessToken: session refresh failed — ${e.message}")
            null
        }
    }

    suspend fun getDeviceId(): String? {
        return try {
            ensureDeviceSession()
            deviceIdHint
        } catch (e: Exception) {
            Log.w(TAG, "getDeviceId: session refresh failed — ${e.message}")
            null
        }
    }

    fun reportError(source: String, message: String, details: Map<String, Any?> = emptyMap()) {
        scope.launch {
            var sessionOk = false
            try {
                sessionOk = ensureDeviceSession()
            } catch (e: Exception) {
                Log.w(TAG, "reportError: first session attempt failed (${e.message}) — retrying once")
                try {
                    // Force a fresh token fetch on retry.
                    accessToken = null
                    sessionOk = ensureDeviceSession()
                } catch (e2: Exception) {
                    Log.e(TAG, "reportError: retry also failed — dropping telemetry: ${e2.message}")
                }
            }

            if (!sessionOk) return@launch

            val deviceId = deviceIdHint ?: return@launch
            val token = accessToken ?: return@launch
            val payload = sanitizePayload(source, message, details)

            try {
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
                Log.w(TAG, "Failed to post telemetry to backend: ${error.message}")
            }
        }
    }

    /**
     * Ensures a valid device session (access token + device ID) is in memory.
     *
     * Returns true if both [accessToken] and [deviceIdHint] are non-blank.
     * Throws the original network/parsing exception on failure (callers decide
     * whether to retry or swallow).
     *
     * Token is refreshed if:
     *  - It has never been fetched ([accessToken] is null/blank), OR
     *  - It is older than [TOKEN_TTL_MS] (proactive refresh before expiry).
     */
    private suspend fun ensureDeviceSession(): Boolean {
        val tokenAge = System.currentTimeMillis() - tokenFetchedAtMs
        val tokenValid = !accessToken.isNullOrBlank() &&
            !deviceIdHint.isNullOrBlank() &&
            tokenAge < TOKEN_TTL_MS

        if (tokenValid) return true

        Log.d(TAG, "Refreshing device session (tokenAge=${tokenAge}ms)")

        val response = pairingApi.refreshDeviceSession(
            bootstrapKey = bootstrapKey,
            request = DeviceSessionRequest(
                hardware_id = hardwareId,
                tenant_id = null
            )
        )

        accessToken = response.access_token
        deviceIdHint = response.device_id
        tenantId = response.tenant_id
        tokenFetchedAtMs = System.currentTimeMillis()

        val success = !accessToken.isNullOrBlank() && !deviceIdHint.isNullOrBlank()
        if (success) {
            Log.d(TAG, "Device session refreshed — deviceId=$deviceIdHint")
        } else {
            Log.w(TAG, "Device session refresh returned empty token or deviceId")
        }
        return success
    }

    private fun sanitizePayload(source: String, message: String, details: Map<String, Any?>): Map<String, Any> {
        val payload = linkedMapOf<String, Any>(
            "source" to source,
            "message" to message,
            "hardware_id" to hardwareId,
            "tenant_id" to (tenantId ?: "")
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
}
