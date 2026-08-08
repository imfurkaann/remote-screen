package com.signage.player.ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.WebView

/**
 * WebView tuned for low-end Android TV firmware.
 *
 * Some vendor WebView/GPU combinations paint the first DOM frame but stop
 * presenting later JavaScript-driven changes. Software compositing avoids that
 * failure, while the native heartbeat keeps managed widgets moving even when
 * the firmware throttles JavaScript timers.
 */
class SignageWebView(context: Context) : WebView(context) {
    private val heartbeatHandler = Handler(Looper.getMainLooper())
    private val heartbeat = object : Runnable {
        override fun run() {
            if (isAttachedToWindow) {
                if (windowVisibility == View.VISIBLE && isShown) {
                    evaluateJavascript(
                        "if(typeof window.__remoteScreenTick==='function'){window.__remoteScreenTick();}" +
                            "try{window.dispatchEvent(new Event('remote-screen-tick'));}catch(e){}",
                        null
                    )
                    invalidate()
                }
                heartbeatHandler.postDelayed(this, HEARTBEAT_MS)
            }
        }
    }

    init {
        setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        onResume()
        resumeTimers()
        heartbeatHandler.removeCallbacks(heartbeat)
        heartbeatHandler.post(heartbeat)
    }

    override fun onDetachedFromWindow() {
        heartbeatHandler.removeCallbacks(heartbeat)
        onPause()
        super.onDetachedFromWindow()
    }

    override fun destroy() {
        heartbeatHandler.removeCallbacks(heartbeat)
        super.destroy()
    }

    companion object {
        private const val HEARTBEAT_MS = 1_000L
    }
}
