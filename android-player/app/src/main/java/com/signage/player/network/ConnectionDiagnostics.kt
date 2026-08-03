package com.signage.player.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.util.UUID

data class ConnectionDiagnosticState(
    val phase: String = "Uygulama başlatıldı; ilk bağlantı bekleniyor",
    val endpoint: String? = null,
    val correlationId: String? = null,
    val httpStatus: Int? = null,
    val detail: String? = null,
    val socketConnected: Boolean = false,
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Small, non-sensitive connection trace that can be shown directly on a remote
 * screen. The correlation id is also sent to the backend request logger, so an
 * operator can match one Android attempt to one server log line.
 */
object ConnectionDiagnostics {
    private val _state = MutableStateFlow(ConnectionDiagnosticState())
    val state: StateFlow<ConnectionDiagnosticState> = _state.asStateFlow()

    fun request(endpoint: String, correlationId: String) {
        _state.value = _state.value.copy(
            phase = "Backend isteği gönderiliyor",
            endpoint = endpoint,
            correlationId = correlationId,
            httpStatus = null,
            detail = null,
            updatedAt = System.currentTimeMillis()
        )
    }

    fun response(endpoint: String, correlationId: String, status: Int) {
        _state.value = _state.value.copy(
            phase = if (status in 200..299) "Backend yanıt verdi" else "Backend isteği reddetti",
            endpoint = endpoint,
            correlationId = correlationId,
            httpStatus = status,
            detail = "HTTP $status",
            updatedAt = System.currentTimeMillis()
        )
    }

    fun failure(endpoint: String, correlationId: String, error: IOException) {
        _state.value = _state.value.copy(
            phase = "Backend'e ulaşılamadı",
            endpoint = endpoint,
            correlationId = correlationId,
            detail = error.javaClass.simpleName + (error.message?.let { ": ${it.take(120)}" } ?: ""),
            updatedAt = System.currentTimeMillis()
        )
    }

    fun socketConnecting(correlationId: String) {
        _state.value = _state.value.copy(
            phase = "Cihaz canlı bağlantısı kuruluyor",
            endpoint = "/device",
            correlationId = correlationId,
            httpStatus = null,
            detail = "Socket.IO connecting",
            socketConnected = false,
            updatedAt = System.currentTimeMillis()
        )
    }

    fun socketConnected(correlationId: String) {
        _state.value = _state.value.copy(
            phase = "Cihaz canlı bağlantısı kuruldu",
            endpoint = "/device",
            correlationId = correlationId,
            detail = "Socket.IO connected",
            socketConnected = true,
            updatedAt = System.currentTimeMillis()
        )
    }

    fun socketFailed(correlationId: String, message: String) {
        _state.value = _state.value.copy(
            phase = "Cihaz canlı bağlantısı kurulamadı",
            endpoint = "/device",
            correlationId = correlationId,
            detail = message.take(160),
            socketConnected = false,
            updatedAt = System.currentTimeMillis()
        )
    }

    fun socketDisconnected(correlationId: String, reason: String) {
        _state.value = _state.value.copy(
            phase = "Cihaz canlı bağlantısı kesildi",
            endpoint = "/device",
            correlationId = correlationId,
            detail = reason.take(160),
            socketConnected = false,
            updatedAt = System.currentTimeMillis()
        )
    }
}

class ConnectionTraceInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val correlationId = UUID.randomUUID().toString()
        val original = chain.request()
        val endpoint = original.url.encodedPath
        val tracedRequest = original.newBuilder()
            .header("x-correlation-id", correlationId)
            .build()

        ConnectionDiagnostics.request(endpoint, correlationId)
        return try {
            chain.proceed(tracedRequest).also { response ->
                ConnectionDiagnostics.response(endpoint, correlationId, response.code)
            }
        } catch (error: IOException) {
            ConnectionDiagnostics.failure(endpoint, correlationId, error)
            throw error
        }
    }
}
