package com.signage.player.boot

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.signage.player.MainActivity

/**
 * Foreground service that keeps the player process alive regardless of:
 *  - User pressing Home or Back
 *  - System RAM pressure (low-memory trimming)
 *  - Screen being off for extended periods
 *
 * Why a Foreground Service?
 * ─────────────────────────
 * Android aggressively kills background processes to reclaim RAM. A Foreground
 * Service posts a persistent notification that signals to the OS: "this app is
 * doing something the user cares about — do not kill it". On signage/TV devices
 * the notification is typically invisible to end users (no notification bar).
 *
 * START_STICKY ensures the service is automatically restarted by the OS if it
 * is killed due to resource pressure, with the last delivered Intent replayed.
 *
 * Lifecycle:
 *  Boot → BootReceiver → startForegroundService() → onStartCommand() → running
 *  App open → MainActivity.onResume() → start() companion → no-op if running
 *  RAM pressure kill → OS restarts service automatically (START_STICKY)
 */
class PlayerForegroundService : Service() {

    companion object {
        private const val TAG = "PlayerForegroundService"
        private const val CHANNEL_ID = "player_foreground_channel"
        private const val NOTIFICATION_ID = 1001

        /**
         * Starts the service as a foreground service. Safe to call multiple
         * times — Android deduplicates service starts automatically.
         */
        fun start(context: Context) {
            val intent = Intent(context, PlayerForegroundService::class.java)
            try {
                context.startForegroundService(intent)
                Log.d(TAG, "startForegroundService() called")
            } catch (e: Exception) {
                // Extremely rare — only happens if the app is in a fully stopped state
                // on some heavily modified OEM ROMs. Log and continue; the Activity
                // will retry on next onResume().
                Log.e(TAG, "Failed to start foreground service", e)
            }
        }

        /** Graceful stop — called only on factory reset / uninstall flows. */
        fun stop(context: Context) {
            context.stopService(Intent(context, PlayerForegroundService::class.java))
            Log.d(TAG, "stopService() called")
        }
    }

    // -------------------------------------------------------------------------
    // Service lifecycle
    // -------------------------------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand — promoting to foreground")
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID, 
                buildNotification(), 
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }

        // START_STICKY: if the OS kills this service due to low memory, it will
        // automatically restart it as soon as resources are available, replaying
        // the last non-null intent. This is the correct mode for a persistent
        // media player watchdog.
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Called when the user swipes the app away from the Recents screen.
        // On a signage device this should never stop the player — restart
        // the service to keep media running in the background.
        super.onTaskRemoved(rootIntent)
        Log.d(TAG, "Task removed — scheduling service restart")
        val restartIntent = Intent(applicationContext, PlayerForegroundService::class.java)
        startForegroundService(restartIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // -------------------------------------------------------------------------
    // Notification helpers
    // -------------------------------------------------------------------------

    /**
     * Creates the notification channel required on Android 8+.
     * IMPORTANCE_MIN keeps the notification completely silent and collapsed —
     * it will not pop up or make sounds on consumer devices, and on TV/signage
     * devices (no notification bar) it is invisible entirely.
     */
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Signage Player",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "Keeps the signage player running continuously"
            setShowBadge(false)
        }
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(channel)
        Log.d(TAG, "Notification channel created")
    }

    private fun buildNotification() = run {
        // Tapping the notification opens the player Activity.
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Signage Player")
            .setContentText("Running")
            // Use a built-in system icon to avoid requiring an extra drawable resource.
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            // Ongoing = user cannot dismiss it; critical for a watchdog service.
            .setOngoing(true)
            // Silent: no sound, no vibration.
            .setSilent(true)
            // PRIORITY_MIN keeps it completely out of the heads-up notification area.
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }
}
