package com.signage.player

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val runtimeDeviceId = intent?.getStringExtra("device_id")?.trim().orEmpty().ifBlank { null }
        val socketBaseUrl = intent?.getStringExtra("socket_base_url")?.trim().orEmpty().ifBlank { null }
        StartupCoordinator.enqueueStartup(this, runtimeDeviceId, socketBaseUrl)
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
}

@Composable
fun PairingScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val hardwareId = remember(context) { HardwareIdStore(context).getOrCreateHardwareId() }
    val uiState by PlayerUiStateStore.state.collectAsState()

    var pairingCode by remember { mutableStateOf("------") }
    var isPaired by remember { mutableStateOf(false) }
    var lastPairingRequestAt by remember { mutableLongStateOf(0L) }

    androidx.compose.runtime.LaunchedEffect(hardwareId) {
        val api = RetrofitFactory.create(AppDefaults.BACKEND_BASE_URL)

        suspend fun requestFreshPairingCode() {
            val now = System.currentTimeMillis()
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
            }.onSuccess {
                isPaired = true
            }.onFailure { error ->
                if (error is HttpException && (error.code() == 404 || error.code() == 409)) {
                    // 404: device was deleted, 409: exists but currently unpaired.
                    isPaired = false
                    pairingCode = "------"
                    lastPairingRequestAt = 0L
                    requestFreshPairingCode()
                }
            }

            if (!isPaired) {
                if (pairingCode != "------" && now - lastPairingRequestAt >= 300_000L) {
                    pairingCode = "------"
                }

                // Keep validating/refreshing code every minute while unpaired.
                if (pairingCode == "------" || now - lastPairingRequestAt >= 60_000L) {
                    requestFreshPairingCode()
                }
            }

            delay(5000)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (!isPaired) {
            Text(
                text = pairingCode,
                fontSize = 64.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                lineHeight = 68.sp
            )
        } else {
            Text(
                text = "Medya bekleniyor",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }

        if (uiState.showConnectionInfo) {
            Column(
                modifier = Modifier.padding(top = 24.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = AppDefaults.BACKEND_BASE_URL, textAlign = TextAlign.Center)
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
