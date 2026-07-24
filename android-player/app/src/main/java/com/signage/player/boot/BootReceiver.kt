package com.signage.player.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.signage.player.MainActivity

/**
 * Receives device boot broadcasts and restores full player operation without
 * any user interaction. Handles three scenarios:
 *
 *  1. Normal Android boot     — ACTION_BOOT_COMPLETED
 *  2. Samsung/HTC fast-boot   — QUICKBOOT_POWERON
 *  3. Huawei fast-boot        — com.htc.intent.action.QUICKBOOT_POWERON
 *
 * Boot sequence:
 *  a) Enqueue background startup work (SessionManager, SocketClient, etc.)
 *  b) Start the Foreground Service so the process is pinned in memory
 *  c) Launch MainActivity to put the player on screen
 *
 * Network availability:
 *  Android does not guarantee the network is ready at BOOT_COMPLETED time.
 *  This is intentional — SessionManager's exponential-backoff retry loop
 *  handles transient network failures gracefully. If the device was already
 *  paired, the cached token allows immediate local playback while the session
 *  is being verified in the background.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"

        private val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_USER_UNLOCKED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON"
        )
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in BOOT_ACTIONS) return

        Log.d(TAG, "Boot broadcast received: $action — starting player")

        // Step 1: Initialize background services (SessionManager, sync, socket…)
        val canStartMediaServiceFromBoot = android.os.Build.VERSION.SDK_INT < 35
        StartupCoordinator.enqueueStartup(
            context = context,
            ensureForegroundService = canStartMediaServiceFromBoot
        )

        // Step 2: Pin the process in memory via foreground service.
        // Must be called before starting the Activity so the process priority
        // is already elevated when the Activity is created.
        if (canStartMediaServiceFromBoot) PlayerForegroundService.start(context)

        // Step 3: Bring the player UI to the foreground.
        // FLAG_ACTIVITY_NEW_TASK is mandatory when starting an Activity from
        // a non-Activity context (BroadcastReceiver).
        // Wrapped in try-catch because Android 10+ enforces background activity launch restrictions.
        // If the OS blocks it, we catch the SecurityException silently so the background
        // service (PlayerForegroundService) is still kept running.
        try {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(launchIntent)
            Log.d(TAG, "Player startup sequence dispatched after boot")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity from BootReceiver due to system restrictions: ${e.message}")
        }
    }
}
