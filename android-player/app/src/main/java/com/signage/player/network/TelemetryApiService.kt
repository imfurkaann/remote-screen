package com.signage.player.network

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface TelemetryApiService {
    @POST("/api/v1/devices/{deviceId}/telemetry")
    suspend fun postTelemetry(
        @Path("deviceId") deviceId: String,
        @Header("authorization") authorization: String,
        @Body request: TelemetryRequest
    ): TelemetryIngestResponse
}
