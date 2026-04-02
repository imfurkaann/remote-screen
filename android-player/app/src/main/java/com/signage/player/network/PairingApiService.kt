package com.signage.player.network

import retrofit2.http.Header
import retrofit2.http.Body
import retrofit2.http.POST

interface PairingApiService {
    @POST("/api/v1/pairing/request-code")
    suspend fun requestPairingCode(
        @Header("x-bootstrap-key") bootstrapKey: String,
        @Body request: PairingRequest
    ): PairingResponse

    @POST("/api/v1/pairing/device-session")
    suspend fun refreshDeviceSession(
        @Header("x-bootstrap-key") bootstrapKey: String,
        @Body request: DeviceSessionRequest
    ): DeviceSessionResponse
}
