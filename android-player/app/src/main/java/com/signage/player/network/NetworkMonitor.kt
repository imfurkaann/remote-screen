package com.signage.player.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Wakes long back-off loops immediately when usable internet returns. */
object NetworkMonitor {
    private const val TAG = "NetworkMonitor"
    private const val SIGNAL_DEBOUNCE_MS = 2_000L
    private val started = AtomicBoolean(false)
    private val lastSignalAt = AtomicLong(0L)

    fun start(context: Context) {
        if (!started.compareAndSet(false, true)) return
        val manager = context.applicationContext
            .getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = signalRecovery()

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                ) signalRecovery()
            }
        }
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            manager.registerNetworkCallback(request, callback)
        } catch (error: Exception) {
            started.set(false)
            Log.e(TAG, "Unable to register connectivity callback", error)
        }
    }

    private fun signalRecovery() {
        val now = android.os.SystemClock.elapsedRealtime()
        val previous = lastSignalAt.get()
        if (now - previous < SIGNAL_DEBOUNCE_MS || !lastSignalAt.compareAndSet(previous, now)) return
        Log.i(TAG, "Usable network detected; waking session and socket reconnect")
        SessionManager.requestImmediateRefresh()
        SocketClientManager.reconnectNow()
    }
}