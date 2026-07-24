package com.signage.player

import android.annotation.SuppressLint
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Brush
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import androidx.media3.ui.AspectRatioFrameLayout
import com.signage.player.boot.PlayerForegroundService
import com.signage.player.boot.StartupCoordinator
import com.signage.player.network.DevicePairingState
import com.signage.player.network.SessionManager
import com.signage.player.ui.PlayerUiStateStore
import com.signage.player.ui.theme.SignageplayerTheme
import java.io.File
import android.graphics.Bitmap
import android.view.KeyEvent
import android.view.PixelCopy
import android.view.Window
import android.view.WindowManager
import java.io.FileOutputStream
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : ComponentActivity() {
    private var keyPressCount = 0
    private var lastKeyPressTime = 0L
    private var onResetRequested: (() -> Unit)? = null

    fun setOnResetRequestedListener(listener: (() -> Unit)?) {
        onResetRequested = listener
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK || 
            keyCode == KeyEvent.KEYCODE_MENU || 
            keyCode == KeyEvent.KEYCODE_SETTINGS) {
            
            val now = System.currentTimeMillis()
            if (now - lastKeyPressTime < 1200L) {
                keyPressCount++
            } else {
                keyPressCount = 1
            }
            lastKeyPressTime = now

            if (keyPressCount >= 3) {
                keyPressCount = 0
                runOnUiThread {
                    onResetRequested?.invoke()
                }
            }
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val runtimeDeviceId = intent?.getStringExtra("device_id")?.trim().orEmpty().ifBlank { null }
        val socketBaseUrl = intent?.getStringExtra("socket_base_url")?.trim().orEmpty().ifBlank { null }
        StartupCoordinator.enqueueStartup(this, runtimeDeviceId, socketBaseUrl)
        // Keep static image/web signage awake; ExoPlayer wake locks only cover video.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        // O1: Clean up stale screenshot files from previous sessions.
        // Screenshots accumulate in cacheDir when SCREENSHOT commands are frequent.
        // We delete files older than 1 hour on every startup to prevent storage bloat.
        try {
            val maxAgeMs = 60 * 60 * 1_000L // 1 hour
            val now = System.currentTimeMillis()
            cacheDir.listFiles { f -> f.name.startsWith("screenshot_") && f.name.endsWith(".png") }
                ?.filter { f -> now - f.lastModified() > maxAgeMs }
                ?.forEach { f -> f.delete() }
        } catch (_: Exception) { /* non-critical — ignore */ }

        // Register screenshot provider
        StartupCoordinator.registerScreenshotProvider(this) {
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
        hideSystemUI()
        setContent {
            SignageplayerTheme {
                PairingScreen(
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Guarantee the foreground service is alive every time the Activity
        // becomes visible — covers the case where RAM pressure killed the
        // service while the Activity was paused (e.g. another app in focus).
        PlayerForegroundService.start(this)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        // singleTop: if BootReceiver or a deep-link relaunches us while we are
        // already in the foreground, accept the new intent and bring to front
        // without creating a duplicate Activity on the back stack.
        setIntent(intent)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    private fun hideSystemUI() {
        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
    }

    override fun onDestroy() {
        super.onDestroy()
        StartupCoordinator.unregisterScreenshotProvider(this)
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
@androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PairingScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val activity = context as? MainActivity
    var showResetDialog by remember { mutableStateOf(false) }
    val uiState by PlayerUiStateStore.state.collectAsState()
    val playerController = remember { StartupCoordinator.getPlayerController() }
    val pairingState by SessionManager.state.collectAsState()

    val hardwareId = remember { com.signage.player.storage.HardwareIdStore(context).getOrCreateHardwareId() }
    val ipAddress = remember { getLocalIpAddress() }
    val backendUrl = remember { StartupCoordinator.getBackendBaseUrl() }

    DisposableEffect(activity) {
        activity?.setOnResetRequestedListener { showResetDialog = true }
        onDispose { activity?.setOnResetRequestedListener(null) }
    }

    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text(text = "Reset Screen?") },
            text = { Text(text = "This will unpair the screen, clear all cached content, and generate a new pairing code.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showResetDialog = false
                        StartupCoordinator.forceReset(context)
                    }
                ) {
                    Text("Reset")
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Screen-off takes priority over everything else (except when unpaired, so the pairing screen is always accessible).
    if (uiState.isScreenOff && pairingState !is DevicePairingState.Unpaired) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            showResetDialog = true
                        }
                    )
                }
        )
        return
    }

    // The only state that shows the pairing code screen is an explicit Unpaired
    // signal from SessionManager (backed by a definitive 404/409 from backend).
    // VerifyingSession falls through to the content block below so content
    // keeps playing while the session is being verified in the background.
    if (pairingState is DevicePairingState.Unpaired) {
        val code = (pairingState as DevicePairingState.Unpaired).pairingCode
        val isLoading = code == "------"
        
        val backgroundGradient = Brush.verticalGradient(
            colors = listOf(
                Color(0xFF0F0C1B),
                Color(0xFF05030A)
            )
        )

        Column(
            modifier = modifier
                .fillMaxSize()
                .background(backgroundGradient)
                .padding(32.dp)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = {
                            showResetDialog = true
                        }
                    )
                },
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Ekranı Eşleştirin",
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            Text(
                text = if (isLoading) "Eşleştirme kodu oluşturuluyor..." else "Lütfen bu kodu kontrol panelindeki ekran ekleme alanına girin.",
                color = Color(0xFF9E95B8),
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 48.dp)
            )

            Box(
                modifier = Modifier
                    .border(
                        width = 1.5.dp,
                        brush = Brush.radialGradient(
                            colors = listOf(Color.White.copy(alpha = 0.25f), Color.White.copy(alpha = 0.05f))
                        ),
                        shape = RoundedCornerShape(24.dp)
                    )
                    .background(
                        color = Color.White.copy(alpha = 0.03f),
                        shape = RoundedCornerShape(24.dp)
                    )
                    .padding(horizontal = 32.dp, vertical = 16.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = code,
                    color = if (isLoading) Color(0xFF5A526E) else Color(0xFF10B981),
                    fontSize = 54.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 4.sp,
                    textAlign = TextAlign.Center,
                    lineHeight = 58.sp,
                    maxLines = 1
                )
            }

            Spacer(modifier = Modifier.height(48.dp))

            if (uiState.showConnectionInfo) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Sunucu Adresi:",
                        color = Color(0xFF5A526E),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = StartupCoordinator.getBackendBaseUrl(),
                        color = Color(0xFF9E95B8),
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center
                    )
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
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = {
                        showResetDialog = true
                    }
                )
            },
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
                if (!mediaPath.isNullOrBlank() && (mediaPath.startsWith("http://") || mediaPath.startsWith("https://"))) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { androidContext ->
                            android.webkit.WebView(androidContext).apply {
                                layoutParams = android.view.ViewGroup.LayoutParams(
                                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                                    android.view.ViewGroup.LayoutParams.MATCH_PARENT
                                )
                                // Managed web content needs JavaScript, but the view exposes no
                                // native bridge and cannot read local files/content providers.
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.javaScriptCanOpenWindowsAutomatically = false
                                settings.setSupportMultipleWindows(false)
                                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                settings.safeBrowsingEnabled = true
                                settings.useWideViewPort = true
                                settings.loadWithOverviewMode = false
                                settings.mediaPlaybackRequiresUserGesture = false
                                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                                webViewClient = object : android.webkit.WebViewClient() {
                                    // Y1: recover from WebView GPU process crash without
                                    // killing the host application. Returning true from
                                    // onRenderProcessGone signals we have handled the crash.
                                    // We destroy the crashed view; Compose will recreate it
                                    // on the next recomposition via PlayerUiStateStore reset.
                                    @Suppress("OVERRIDE_DEPRECATION")
                                    override fun onRenderProcessGone(
                                        view: android.webkit.WebView,
                                        detail: android.webkit.RenderProcessGoneDetail?
                                    ): Boolean {
                                        Log.e("WebViewCrash",
                                            "Render process gone (crashed=${detail?.didCrash()}) — recovering")
                                        try {
                                            view.destroy()
                                        } catch (_: Exception) {}
                                        // Force Compose to rebuild by momentarily clearing the
                                        // media path and then restoring it on the next frame.
                                        val currentPath = PlayerUiStateStore.state.value.currentMediaFilePath
                                        PlayerUiStateStore.setCurrentMedia(null, false)
                                        android.os.Handler(android.os.Looper.getMainLooper())
                                            .postDelayed({
                                                PlayerUiStateStore.setCurrentMedia(currentPath, false)
                                            }, 500L)
                                        return true  // do NOT crash the app
                                    }
                                }
                            }
                        },
                        update = { webView ->
                            if (webView.url != mediaPath) {
                                webView.loadUrl(mediaPath)
                            }
                        }
                    )
                } else if (!mediaPath.isNullOrBlank() && uiState.currentMediaIsImage) {
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
                            if (imageView.tag != mediaPath) {
                                imageView.setImageURI(Uri.fromFile(File(mediaPath)))
                                imageView.tag = mediaPath
                            }
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
                    val backgroundGradient = Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFF0F0C1B),
                            Color(0xFF05030A)
                        )
                    )
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(backgroundGradient)
                            .padding(32.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        // Glowing status indicator
                        val indicatorColor = if (uiState.errorMessage != null) Color(0xFFF59E0B) else Color(0xFF10B981)
                        val indicatorText = if (uiState.errorMessage != null) "Sistem Uyarı / Eksik İçerik" else "Sistem Bağlı / Çevrimiçi"
                        
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                            modifier = Modifier
                                .background(indicatorColor.copy(alpha = 0.1f), shape = RoundedCornerShape(16.dp))
                                .border(1.5.dp, indicatorColor.copy(alpha = 0.3f), shape = RoundedCornerShape(16.dp))
                                .padding(horizontal = 14.dp, vertical = 8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .background(indicatorColor, shape = androidx.compose.foundation.shape.CircleShape)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = indicatorText,
                                color = indicatorColor,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.height(24.dp))

                        Text(
                            text = "Remote Screen",
                            color = Color.White,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )

                        Text(
                            text = uiState.errorMessage ?: "Cihaz başarıyla eşleştirildi. Oynatma listesi atanması bekleniyor. Lütfen kontrol panelinizden içerik gönderin.",
                            color = Color(0xFF9E95B8),
                            fontSize = 15.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 24.dp)
                        )

                        Spacer(modifier = Modifier.height(40.dp))

                        // Diagnostics Card
                        Column(
                            modifier = Modifier
                                .fillMaxWidth(0.85f)
                                .background(Color.White.copy(alpha = 0.02f), shape = RoundedCornerShape(16.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.05f), shape = RoundedCornerShape(16.dp))
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = "Cihaz Tanı Bilgileri",
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(bottom = 4.dp)
                            )
                            
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(text = "IP Adresi:", color = Color(0xFF5A526E), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text(text = ipAddress, color = Color(0xFF9E95B8), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                            
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(text = "Cihaz Kimliği:", color = Color(0xFF5A526E), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text(text = hardwareId, color = Color(0xFF9E95B8), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                            
                            Row(
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(text = "Sunucu:", color = Color(0xFF5A526E), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                Text(text = backendUrl, color = Color(0xFF9E95B8), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                        }
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
                    Text(
                        text = StartupCoordinator.getBackendBaseUrl(),
                        color = Color.White,
                        textAlign = TextAlign.Center
                    )
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

fun getLocalIpAddress(): String {
    try {
        val interfaces = java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())
        for (intf in interfaces) {
            val addrs = java.util.Collections.list(intf.inetAddresses)
            for (addr in addrs) {
                if (!addr.isLoopbackAddress) {
                    val sAddr = addr.hostAddress ?: ""
                    val isIPv4 = sAddr.indexOf(':') < 0
                    if (isIPv4) return sAddr
                }
            }
        }
    } catch (e: Exception) {
        Log.e("MainActivity", "Failed to resolve local IP", e)
    }
    return "Bilinmiyor"
}
