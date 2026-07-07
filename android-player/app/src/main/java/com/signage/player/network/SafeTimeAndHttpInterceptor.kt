package com.signage.player.network

import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.security.cert.CertificateException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException

/**
 * Task 4: SSL Resilience and HTTP Fallback Interceptor.
 *
 * When an Android TV/device loses power, its hardware clock can reset to 1970 or 2000.
 * In this state, SSL certificates cannot be validated, causing SSLHandshakeException
 * and blocking all HTTPS API calls.
 *
 * This interceptor catches SSL validation exceptions. If an HTTPS call fails due to
 * SSL issues, it transforms the request URL to plain "http" and retries. This ensures
 * that 1,000+ screens can maintain connection and synchronization even with incorrect
 * system clocks, without requiring manual technician visits.
 */
class SafeTimeAndHttpInterceptor : Interceptor {
    companion object {
        private const val TAG = "SafeTimeAndHttpInterceptor"
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val originalUrl = request.url

        // Proceed with original request
        try {
            return chain.proceed(request)
        } catch (e: Exception) {
            // Check if the exception is SSL-related
            val isSslError = isSslException(e)
            
            if (isSslError && originalUrl.isHttps) {
                Log.w(TAG, "SSL Handshake failed for ${originalUrl.host}. System clock might be incorrect. Falling back to HTTP...")
                
                // Fallback: Rewrite scheme from HTTPS to HTTP
                val fallbackUrl = originalUrl.newBuilder()
                    .scheme("http")
                    .build()
                
                val fallbackRequest = request.newBuilder()
                    .url(fallbackUrl)
                    .build()
                
                try {
                    return chain.proceed(fallbackRequest)
                } catch (fallbackError: Exception) {
                    Log.e(TAG, "HTTP Fallback also failed: ${fallbackError.message}")
                    throw fallbackError
                }
            }
            
            // Re-throw original exception if it wasn't SSL-related or fallback also failed
            throw e
        }
    }

    private fun isSslException(e: Exception): Boolean {
        var cause: Throwable? = e
        while (cause != null) {
            if (cause is SSLHandshakeException ||
                cause is SSLPeerUnverifiedException ||
                cause is CertificateException ||
                (cause is IOException && cause.message?.contains("validation", ignoreCase = true) == true)
            ) {
                return true
            }
            cause = cause.cause
        }
        return false
    }
}
