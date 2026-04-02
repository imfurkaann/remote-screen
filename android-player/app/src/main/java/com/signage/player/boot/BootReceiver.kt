package com.signage.player.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts player startup flow after device boot.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            StartupCoordinator.enqueueStartup(context)
        }
    }
}
