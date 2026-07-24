package com.signage.player.network

data class PairingRequest(
    val hardware_id: String,
    val device_proof: String,
    val tenant_id: String? = null
)

data class PairingResponse(
    val code: String,
    val expires_at: String,
    val device_id: String
)

data class DeviceSessionRequest(
    val hardware_id: String,
    val device_proof: String,
    val tenant_id: String? = null
)

data class DeviceSessionResponse(
    val paired: Boolean,
    val device_id: String,
    val tenant_id: String?,
    val access_token: String,
    val token_type: String,
    val expires_in: Int
)

data class TelemetryRequest(
    val kind: String,
    val correlation_id: String,
    val payload: Map<String, Any>
)

data class TelemetryIngestResponse(
    val accepted: Boolean,
    val correlation_id: String
)

data class UnpairRequest(
    val hardware_id: String
)

data class UnpairResponse(
    val unpaired: Boolean
)
