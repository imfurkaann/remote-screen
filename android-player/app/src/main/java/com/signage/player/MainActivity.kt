package com.signage.player

import android.os.Bundle
import android.net.Uri
import android.widget.ImageView
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.ui.PlayerView
import com.signage.player.boot.StartupCoordinator
import com.signage.player.config.AppDefaults
import com.signage.player.network.DeviceSessionRequest
import com.signage.player.network.PairingRequest
import com.signage.player.network.RetrofitFactory
import com.signage.player.storage.HardwareIdStore
import com.signage.player.ui.PlayerUiStateStore
import com.signage.player.ui.theme.SignageplayerTheme
import kotlinx.coroutines.delay
import retrofit2.HttpException
import java.io.File

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
    }
}

@Composable
fun PairingScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val hardwareId = remember(context) { HardwareIdStore(context).getOrCreateHardwareId() }
    val uiState by PlayerUiStateStore.state.collectAsState()
    val playerController = remember { StartupCoordinator.getPlayerController() }

    var pairingCode by remember { mutableStateOf("------") }
    var isPaired by remember { mutableStateOf(false) }
    var lastPairingRequestAt by remember { mutableLongStateOf(0L) }

    androidx.compose.runtime.LaunchedEffect(hardwareId) {
        val backendUrl = StartupCoordinator.getBackendBaseUrl()
        val api = RetrofitFactory.create(backendUrl)
        Log.d("PairingScreen", "Initializing pairing APIs against base URL: $backendUrl")

        suspend fun requestFreshPairingCode() {
            val now = System.currentTimeMillis()
            Log.d("PairingScreen", "Requesting fresh pairing code...")
            runCatching {
                api.requestPairingCode(
                    bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
                    request = PairingRequest(
                        hardware_id = hardwareId,
                        tenant_id = AppDefaults.TENANT_ID
                    )
                )
            }.onSuccess { response ->
                pairingCode = response.code
                lastPairingRequestAt = now
                Log.d("PairingScreen", "Retrieved fresh pairing code: ${response.code}")
            }.onFailure { error ->
                Log.e("PairingScreen", "Pairing code request failed", error)
            }
        }

        while (true) {
            val now = System.currentTimeMillis()

            runCatching {
                api.refreshDeviceSession(
                    bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
                    request = DeviceSessionRequest(
                        hardware_id = hardwareId,
                        tenant_id = AppDefaults.TENANT_ID
                    )
                )
            }.onSuccess { response ->
                isPaired = true
                Log.d("PairingScreen", "Device session refreshed successfully. Device is paired.")
            }.onFailure { error ->
                if (error is HttpException && (error.code() == 404 || error.code() == 409)) {
                    isPaired = false
                    Log.d("PairingScreen", "Device session refresh: device is unpaired or not found (HTTP ${error.code()})")
                } else {
                    isPaired = false
                    Log.e("PairingScreen", "Unexpected error refreshing device session", error)
                }
            }

            if (!isPaired) {
                // If code is older than 5 minutes, clear it
                if (pairingCode != "------" && now - lastPairingRequestAt >= 300_000L) {
                    pairingCode = "------"
                }

                // If code is empty or needs refresh (every 60 seconds), request a new one
                if (pairingCode == "------" || now - lastPairingRequestAt >= 60_000L) {
                    requestFreshPairingCode()
                }
            }

            delay(5000)
        }
    }

    if (uiState.isScreenOff) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black)
        )
        return
    }

    if (!isPaired) {
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = pairingCode,
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
                    Text(text = AppDefaults.BOOTSTRAP_KEY, textAlign = TextAlign.Center)
                    Text(text = AppDefaults.TENANT_ID, textAlign = TextAlign.Center)
                }
            }
        }
        return
    }

    Box(modifier = modifier.fillMaxSize()) {
        val mediaPath = uiState.currentMediaFilePath
        if (!mediaPath.isNullOrBlank() && uiState.currentMediaIsImage) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { androidContext ->
                    ImageView(androidContext).apply {
                        scaleType = ImageView.ScaleType.FIT_CENTER
                        adjustViewBounds = true
                    }
                },
                update = { imageView ->
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
                    }
                },
                update = { view ->
                    view.player = playerController.asExoPlayer()
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

        if (uiState.showConnectionInfo) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = StartupCoordinator.getBackendBaseUrl(), textAlign = TextAlign.Center)
                Text(text = AppDefaults.BOOTSTRAP_KEY, textAlign = TextAlign.Center)
                Text(text = AppDefaults.TENANT_ID, textAlign = TextAlign.Center)
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
