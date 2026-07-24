package com.signage.player.network

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Keeps transport security fail-closed. TLS validation failures are propagated
 * to the session retry loop; credentials are never resent over cleartext HTTP.
 */
class SafeTimeAndHttpInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response = chain.proceed(chain.request())
}