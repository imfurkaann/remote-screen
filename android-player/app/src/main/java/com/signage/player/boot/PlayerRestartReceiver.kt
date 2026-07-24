package com.signage.player.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.signage.player.MainActivity

/** Internal watchdog alarm target used after the task is removed. */
class PlayerRestartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_RESTART_PLAYER) return
        Log.w(TAG, "Watchdog alarm fired; restoring player runtime")
        PlayerForegroundService.start(context)
        StartupCoordinator.enqueueStartup(context)
        try {
            context.startActivity(Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
        } catch (error: Exception) {
            Log.w(TAG, "System blocked watchdog UI launch", error)
        }
    }

    companion object {
        const val ACTION_RESTART_PLAYER = "com.signage.player.action.RESTART_PLAYER"
        private const val TAG = "PlayerRestartReceiver"
    }
}