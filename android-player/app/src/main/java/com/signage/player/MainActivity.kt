package com.signage.player

import android.graphics.BitmapFactory
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.tooling.preview.Preview
import com.signage.player.boot.StartupCoordinator
import com.signage.player.network.PairingRequest
import com.signage.player.network.RetrofitFactory
import com.signage.player.ui.theme.SignageplayerTheme
import com.signage.player.storage.HardwareIdStore
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.launch
import java.io.File

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
    val coroutineScope = rememberCoroutineScope()
    val hardwareId = remember(context) { HardwareIdStore(context).getOrCreateHardwareId() }

    var backendBaseUrl by remember { mutableStateOf("http://10.0.2.2:4100") }
    var bootstrapKey by remember { mutableStateOf("test-bootstrap-key") }
    var tenantId by remember { mutableStateOf("tenant-demo") }
    var pairingCode by remember { mutableStateOf<String?>(null) }
    var expiresAt by remember { mutableStateOf<String?>(null) }
    var deviceId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var activeMediaPath by remember { mutableStateOf<String?>(null) }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) {
            activeMediaPath = findActiveMediaPath(context)
            withFrameNanos { }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(text = "Remote Screen Player", fontWeight = FontWeight.Bold)
        Text(text = "Generate a pairing code from the backend and display it here.")

        Text(text = "Hardware ID", fontWeight = FontWeight.Bold)
        Text(text = hardwareId)

        OutlinedTextField(
            value = backendBaseUrl,
            onValueChange = { backendBaseUrl = it },
            label = { Text("Backend Base URL") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = bootstrapKey,
            onValueChange = { bootstrapKey = it },
            label = { Text("Bootstrap Key") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        OutlinedTextField(
            value = tenantId,
            onValueChange = { tenantId = it },
            label = { Text("Tenant ID") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Button(
            onClick = {
                loading = true
                errorMessage = null
                pairingCode = null
                expiresAt = null
                deviceId = null

                coroutineScope.launch {
                    try {
                        val api = RetrofitFactory.create(backendBaseUrl.trim())
                        val response = api.requestPairingCode(
                            bootstrapKey = bootstrapKey.trim(),
                            request = PairingRequest(
                                hardware_id = hardwareId,
                                tenant_id = tenantId.trim()
                            )
                        )
                        pairingCode = response.code
                        expiresAt = response.expires_at
                        deviceId = response.device_id
                    } catch (error: Exception) {
                        errorMessage = error.message ?: error::class.java.simpleName
                    } finally {
                        loading = false
                    }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp))
                Text(text = "  Requesting pairing code")
            } else {
                Text(text = "Generate Pairing Code")
            }
        }

        pairingCode?.let { code ->
            Text(text = "Pairing Code", fontWeight = FontWeight.Bold)
            Text(text = code, fontWeight = FontWeight.Bold)
            Text(text = "Device ID: ${deviceId.orEmpty()}")
            Text(text = "Expires At: ${expiresAt.orEmpty()}")
        }

        activeMediaPath?.let { mediaPath ->
            val mediaFile = remember(mediaPath) { File(mediaPath) }
            val bitmap = remember(mediaPath, mediaFile.lastModified(), mediaFile.length()) {
                runCatching { decodePreviewBitmap(mediaPath, maxDimension = 2048) }.getOrNull()
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(text = "Active Media Preview", fontWeight = FontWeight.Bold)
                    Text(text = mediaPath)
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "Synced media preview",
                            modifier = Modifier.fillMaxWidth(),
                            contentScale = ContentScale.Fit
                        )
                    } else {
                        Text(text = "Synced file is not an image or failed to decode.")
                    }
                }
            }
        }

        errorMessage?.let { message ->
            Text(text = "Error: $message")
        }

        TextButton(onClick = {
            backendBaseUrl = "http://10.0.2.2:4100"
            bootstrapKey = "test-bootstrap-key"
            tenantId = "tenant-demo"
        }) {
            Text("Reset Defaults")
        }
    }
}

private fun findActiveMediaPath(context: android.content.Context): String? {
    val activeDir = File(context.filesDir, "content/active")
    if (!activeDir.exists()) {
        return null
    }

    return activeDir
        .listFiles()
        ?.filter { it.isFile }
        ?.sortedByDescending { it.lastModified() }
        ?.firstOrNull()
        ?.absolutePath
}

private fun decodePreviewBitmap(path: String, maxDimension: Int): android.graphics.Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)

    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        return BitmapFactory.decodeFile(path)
    }

    val sampleSize = calculateInSampleSize(bounds.outWidth, bounds.outHeight, maxDimension, maxDimension)
    val options = BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inPreferredConfig = android.graphics.Bitmap.Config.RGB_565
    }

    return BitmapFactory.decodeFile(path, options)
}

private fun calculateInSampleSize(sourceWidth: Int, sourceHeight: Int, targetWidth: Int, targetHeight: Int): Int {
    var sampleSize = 1
    var halfHeight = sourceHeight / 2
    var halfWidth = sourceWidth / 2

    while ((halfHeight / sampleSize) >= targetHeight && (halfWidth / sampleSize) >= targetWidth) {
        sampleSize *= 2
    }

    return sampleSize.coerceAtLeast(1)
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    SignageplayerTheme {
        PairingScreen()
    }
}
