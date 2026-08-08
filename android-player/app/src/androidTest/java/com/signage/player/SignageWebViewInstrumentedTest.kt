package com.signage.player

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.signage.player.ui.SignageWebView
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SignageWebViewInstrumentedTest {
    @Test
    fun nativeHeartbeatKeepsDynamicWidgetsUpdating() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            lateinit var webView: SignageWebView
            scenario.onActivity { activity ->
                webView = SignageWebView(activity)
                activity.setContentView(webView)
                webView.settings.javaScriptEnabled = true
                webView.loadDataWithBaseURL(
                    "https://example.invalid/",
                    """<!doctype html><html><body>0<script>
                        window.tickCount=0;
                        window.__remoteScreenTick=function(){
                          window.tickCount+=1;
                          document.body.textContent=String(window.tickCount);
                        };
                    </script></body></html>""",
                    "text/html",
                    "utf-8",
                    null
                )
            }

            Thread.sleep(2_500L)
            val resultReady = CountDownLatch(1)
            var tickCount = 0
            scenario.onActivity {
                webView.evaluateJavascript("String(window.tickCount||0)") { value ->
                    tickCount = value.trim('"').toIntOrNull() ?: 0
                    resultReady.countDown()
                }
            }

            assertTrue("Web widget heartbeat did not advance", resultReady.await(5, TimeUnit.SECONDS))
            assertTrue("Expected at least two native widget ticks, got $tickCount", tickCount >= 2)
        }
    }
}
