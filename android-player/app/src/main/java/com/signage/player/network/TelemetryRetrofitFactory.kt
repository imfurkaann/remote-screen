package com.signage.player.network

import com.squareup.moshi.KotlinJsonAdapterFactory
import com.squareup.moshi.Moshi
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

object TelemetryRetrofitFactory {
    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor(SafeTimeAndHttpInterceptor())
            .build()
    }

    fun create(baseUrl: String): TelemetryApiService {
        val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        val moshi = Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(normalizedBaseUrl)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()

        return retrofit.create(TelemetryApiService::class.java)
    }
}
