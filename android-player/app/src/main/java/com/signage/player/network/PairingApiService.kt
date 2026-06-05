package com.signage.player.network

import okhttp3.MultipartBody
import retrofit2.http.Header
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Multipart
import retrofit2.http.Part
import retrofit2.http.Path

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

    @Multipart
    @POST("/api/v1/commands/devices/{deviceId}/screenshot")
    suspend fun uploadScreenshot(
        @Path("deviceId") deviceId: String,
        @Header("Authorization") authorization: String,
        @Part file: MultipartBody.Part
    ): ScreenshotUploadResponse
}

data class ScreenshotUploadResponse(
    val screenshot_url: String
)
