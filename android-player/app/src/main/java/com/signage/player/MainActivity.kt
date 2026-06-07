package com.signage.player

import android.os.Bundle
import android.net.Uri
import android.widget.ImageView
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import androidx.media3.ui.AspectRatioFrameLayout
import com.signage.player.boot.StartupCoordinator
import com.signage.player.network.DevicePairingState
import com.signage.player.network.SessionManager
import com.signage.player.ui.PlayerUiStateStore
import com.signage.player.ui.theme.SignageplayerTheme
import java.io.File
import android.graphics.Bitmap
import android.view.PixelCopy
import android.view.Window
import java.io.FileOutputStream
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val runtimeDeviceId = intent?.getStringExtra("device_id")?.trim().orEmpty().ifBlank { null }
        val socketBaseUrl = intent?.getStringExtra("socket_base_url")?.trim().orEmpty().ifBlank { null }
        StartupCoordinator.enqueueStartup(this, runtimeDeviceId, socketBaseUrl)
        // Register PlayerController as lifecycle observer so ExoPlayer is paused/released
        // with this Activity's lifecycle. Observer is removed in onDestroy to prevent leak
        // when the system recreates the Activity (e.g. config change).
        StartupCoordinator.getPlayerController()?.let { lifecycle.addObserver(it) }

        // Register screenshot provider
        StartupCoordinator.registerScreenshotProvider {
            val bitmap = captureWindow(window) ?: return@registerScreenshotProvider null
            val file = File(cacheDir, "screenshot_${System.currentTimeMillis()}.png")
            try {
                FileOutputStream(file).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                }
                file
            } catch (e: Exception) {
                null
            }
        }

        enableEdgeToEdge()
        setContent {
            SignageplayerTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    PairingScreen(
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        // Remove the observer so the old PlayerController is not retained after Activity death.
        StartupCoordinator.getPlayerController()?.let { lifecycle.removeObserver(it) }
        StartupCoordinator.unregisterScreenshotProvider()
    }

    private suspend fun captureWindow(window: Window): Bitmap? = suspendCancellableCoroutine { continuation ->
        try {
            val view = window.decorView
            if (view.width <= 0 || view.height <= 0) {
                if (continuation.isActive) continuation.resume(null)
                return@suspendCancellableCoroutine
            }
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            PixelCopy.request(
                window,
                bitmap,
                { copyResult ->
                    if (copyResult == PixelCopy.SUCCESS) {
                        if (continuation.isActive) continuation.resume(bitmap)
                    } else {
                        if (continuation.isActive) continuation.resume(null)
                    }
                },
                android.os.Handler(android.os.Looper.getMainLooper())
            )
        } catch (e: Exception) {
            if (continuation.isActive) continuation.resume(null)
        }
    }
}

/**
 * Root composable that selects the correct screen based on [SessionManager.state].
 *
 * This composable is intentionally a pure view — it contains **zero** business
 * logic. All session / pairing decisions are made inside [SessionManager] and
 * emitted as a [DevicePairingState] via a [StateFlow]. The composable simply
 * renders the correct branch.
 *
 * State transitions:
 *   [DevicePairingState.VerifyingSession] → show content (optimistic)
 *   [DevicePairingState.Paired]           → show content
 *   [DevicePairingState.Unpaired]         → show pairing code
 */
@Composable
fun PairingScreen(modifier: Modifier = Modifier) {
    val uiState by PlayerUiStateStore.state.collectAsState()
    val playerController = remember { StartupCoordinator.getPlayerController() }
    val pairingState by SessionManager.state.collectAsState()

    // Screen-off takes priority over everything else.
    if (uiState.isScreenOff) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black)
        )
        return
    }

    // The only state that shows the pairing code screen is an explicit Unpaired
    // signal from SessionManager (backed by a definitive 404/409 from backend).
    // VerifyingSession falls through to the content block below so content
    // keeps playing while the session is being verified in the background.
    if (pairingState is DevicePairingState.Unpaired) {
        val code = (pairingState as DevicePairingState.Unpaired).pairingCode
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = code,
                fontSize = 64.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                lineHeight = 68.sp
            )

            if (uiState.showConnectionInfo) {
                Column(
                    modifier = Modifier.padding(top = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = StartupCoordinator.getBackendBaseUrl(), textAlign = TextAlign.Center)
                }
            }
        }
        return
    }

    // VerifyingSession or Paired: render content.
    //
    // Improvement 1 — Crossfade animation:
    // PlaybackCoordinator drives `transitionAlpha` via PlayerUiStateStore.
    // When a new item begins, alpha is set to 0 (fade out), content is swapped,
    // then alpha is set back to 1 (fade in). Compose animates the float value
    // with a tween so the transition is smooth even on lower-end hardware.
    val animatedAlpha by animateFloatAsState(
        targetValue = uiState.transitionAlpha,
        animationSpec = tween(durationMillis = 300),
        label = "media_crossfade"
    )

    BoxWithConstraints(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        val isLandscape = uiState.orientation == 90 || uiState.orientation == 270
        val width = if (isLandscape) maxHeight else maxWidth
        val height = if (isLandscape) maxWidth else maxHeight

        Box(
            modifier = Modifier
                .size(width, height)
                .rotate(uiState.orientation.toFloat())
        ) {
            val mediaPath = uiState.currentMediaFilePath

            // Inner Box carries the crossfade alpha so pairing / connection overlays
            // are never accidentally made transparent during transitions.
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .alpha(animatedAlpha)
            ) {
                if (!mediaPath.isNullOrBlank() && uiState.currentMediaIsImage) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { androidContext ->
                            ImageView(androidContext).apply {
                                scaleType = when (uiState.scaleMode) {
                                    "fill" -> ImageView.ScaleType.CENTER_CROP
                                    "stretch" -> ImageView.ScaleType.FIT_XY
                                    else -> ImageView.ScaleType.FIT_CENTER
                                }
                                adjustViewBounds = true
                            }
                        },
                        update = { imageView ->
                            imageView.scaleType = when (uiState.scaleMode) {
                                "fill" -> ImageView.ScaleType.CENTER_CROP
                                "stretch" -> ImageView.ScaleType.FIT_XY
                                else -> ImageView.ScaleType.FIT_CENTER
                            }
                            imageView.setImageURI(Uri.fromFile(File(mediaPath)))
                        }
                    )
                } else if (!mediaPath.isNullOrBlank() && !uiState.currentMediaIsImage && playerController != null) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { androidContext ->
                            PlayerView(androidContext).apply {
                                useController = false
                                player = playerController.asExoPlayer()
                                resizeMode = when (uiState.scaleMode) {
                                    "fill" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                                    "stretch" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                                    else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                                }
                            }
                        },
                        update = { view ->
                            view.player = playerController.asExoPlayer()
                            view.resizeMode = when (uiState.scaleMode) {
                                "fill" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                                "stretch" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                                else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                            }
                        }
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Medya bekleniyor",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // Connection info overlay — always fully visible, outside the alpha Box.
            if (uiState.showConnectionInfo) {
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = StartupCoordinator.getBackendBaseUrl(), textAlign = TextAlign.Center)
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    SignageplayerTheme {
        PairingScreen()
    }
}
