package com.signage.player.network

import android.content.Context
import android.util.Log
import com.signage.player.config.AppDefaults
import com.signage.player.storage.PairingStateStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import kotlin.math.min
import kotlin.random.Random

/**
 * Singleton responsible for the full lifecycle of a device session:
 *
 *  1. Reads the last persisted pairing state on startup and immediately emits
 *     an optimistic [DevicePairingState] so the UI can show content without
 *     waiting for a network round-trip.
 *  2. Runs a background loop that:
 *       • Verifies/refreshes the session with the backend.
 *       • Proactively renews the JWT every [TOKEN_REFRESH_INTERVAL_MS] while
 *         paired, so tokens never expire in normal operation.
 *       • Fetches and rotates pairing codes (60-second TTL) when unpaired,
 *         polling every [UNPAIRED_POLL_INTERVAL_MS] for a confirmation signal.
 *       • Uses **full-jitter exponential back-off** on transient network
 *         errors so that a backend restart does not cause a thundering herd
 *         from thousands of devices simultaneously.
 *  3. Transitions to [DevicePairingState.Unpaired] **only** on explicit HTTP
 *     404 / 409 responses — never on network timeouts or other transient
 *     failures. Content keeps playing through connectivity blips.
 *
 * ## Thread safety
 * [state] is a [StateFlow] backed by [MutableStateFlow], which is thread-safe.
 * The background coroutine runs on [Dispatchers.IO]. UI collectors should use
 * their own dispatcher (Compose handles this automatically via `collectAsState`).
 *
 * ## Scalability notes (10 000+ screens)
 * Back-off ceiling: 5 minutes ± full jitter. After a backend restart, 10 000
 * devices with random jitter spread their reconnects over ~5–6 minutes,
 * producing a steady ~30 req/s rather than a spike of thousands per second.
 */
object SessionManager {

    private const val TAG = "SessionManager"

    // -- Timing constants (all in milliseconds) --------------------------------

    /** Token lifetime is 48 h; refresh every 6 h to keep it fresh with minimal backend load.
     *  6 h × 8 = 48 h full coverage. At 10 000 devices: 10 000 / 6 h ≈ 28 req/s vs 333 req/s. */
    private const val TOKEN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1_000L

    /** Backend issues pairing codes valid for 5 min; we request a new one every 60 s. */
    private const val PAIRING_CODE_REFRESH_MS = 60_000L

    /** How often we call device-session while waiting for the user to pair. */
    private const val UNPAIRED_POLL_INTERVAL_MS = 10_000L

    /** Starting delay for exponential back-off on network errors. */
    private const val BACKOFF_BASE_MS = 2_000L

    /** Maximum delay cap for exponential back-off (5 minutes). */
    private const val BACKOFF_MAX_MS = 300_000L

    // -- Public state ----------------------------------------------------------

    private val _state = MutableStateFlow<DevicePairingState>(
        DevicePairingState.Unpaired("------")
    )

    /** Observe this from any Composable or service that needs the pairing state. */
    val state: StateFlow<DevicePairingState> = _state.asStateFlow()

    // -- Internal fields -------------------------------------------------------

    @Volatile private var sessionScope: CoroutineScope? = null
    @Volatile private var storeRef: PairingStateStore? = null

    // -------------------------------------------------------------------------

    /**
     * (Re-)starts the session management loop. Safe to call multiple times;
     * cancels the previous loop before starting a new one.
     *
     * Should be called once from [com.signage.player.boot.StartupCoordinator]
     * after hardware identity and backend URL have been resolved.
     *
     * @param context     Application context (used for [PairingStateStore]).
     * @param hardwareId  Stable device identity from [com.signage.player.storage.HardwareIdStore].
     * @param tenantId    Tenant the device belongs to.
     * @param api         Configured [PairingApiService] instance.
     */
    fun start(
        context: Context,
        hardwareId: String,
        tenantId: String,
        api: PairingApiService
    ) {
        val store = PairingStateStore(context)
        storeRef = store

        // --- Optimistic initial state -----------------------------------------
        // Emit immediately, before any network call, so the UI can render
        // without a blank screen or a premature pairing code flash.
        val persisted = store.loadState()
        _state.value = if (persisted.isPaired) {
            Log.d(TAG, "Cached pairing found — starting optimistically as VerifyingSession")
            DevicePairingState.VerifyingSession
        } else {
            Log.d(TAG, "No cached pairing — starting as Unpaired")
            DevicePairingState.Unpaired("------")
        }

        // --- Start background loop -------------------------------------------
        sessionScope?.cancel()
        sessionScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        sessionScope!!.launch {
            runSessionLoop(store, hardwareId, tenantId, api)
        }
    }

    /** Cancel the session loop (e.g. when the app is being torn down in tests). */
    fun stop() {
        sessionScope?.cancel()
        sessionScope = null
        Log.d(TAG, "SessionManager stopped")
    }

    // -------------------------------------------------------------------------

    private suspend fun runSessionLoop(
        store: PairingStateStore,
        hardwareId: String,
        tenantId: String,
        api: PairingApiService
    ) {
        var retryAttempt = 0
        var lastPairingCodeRequestAt = 0L

        while (true) {
            val currentState = _state.value

            // -----------------------------------------------------------------
            // Attempt to refresh / verify the device session with the backend.
            // -----------------------------------------------------------------
            val sessionResult = runCatching {
                api.refreshDeviceSession(
                    bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
                    request = DeviceSessionRequest(
                        hardware_id = hardwareId,
                        tenant_id = tenantId
                    )
                )
            }

            val sessionResponse = sessionResult.getOrNull()
            val sessionError = sessionResult.exceptionOrNull()

            when {
                // ✅ Paired and verified
                sessionResponse != null -> {
                    retryAttempt = 0
                    store.savePaired(sessionResponse.device_id, sessionResponse.access_token)
                    _state.value = DevicePairingState.Paired(
                        token = sessionResponse.access_token,
                        deviceId = sessionResponse.device_id
                    )
                    Log.d(TAG, "Session verified — paired (deviceId=${sessionResponse.device_id})")
                    delay(TOKEN_REFRESH_INTERVAL_MS)
                }

                // ❌ Definitively not paired (backend says so explicitly)
                sessionError is HttpException &&
                        (sessionError.code() == 404 || sessionError.code() == 409) -> {

                    retryAttempt = 0
                    store.clearPaired()

                    // Determine whether we need a fresh pairing code
                    val now = System.currentTimeMillis()
                    val existingCode = (currentState as? DevicePairingState.Unpaired)
                        ?.pairingCode
                        ?.takeIf { it != "------" }
                    val needsNewCode = existingCode == null ||
                            now - lastPairingCodeRequestAt >= PAIRING_CODE_REFRESH_MS

                    val displayCode: String = if (needsNewCode) {
                        Log.d(TAG, "Fetching new pairing code (HTTP ${sessionError.code()})")
                        fetchPairingCode(api, hardwareId, tenantId)
                            ?.also { lastPairingCodeRequestAt = now }
                            ?: existingCode
                            ?: "------"
                    } else {
                        existingCode ?: "------"
                    }

                    _state.value = DevicePairingState.Unpaired(pairingCode = displayCode)
                    Log.d(TAG, "Device unpaired — polling for confirmation in ${UNPAIRED_POLL_INTERVAL_MS}ms")
                    delay(UNPAIRED_POLL_INTERVAL_MS)
                }

                // ⚠️ Transient error (network, timeout, 5xx, …)
                // Keep the current state — do NOT flash the pairing screen.
                else -> {
                    val delayMs = nextBackoffDelay(retryAttempt)
                    retryAttempt = (retryAttempt + 1).coerceAtMost(8)
                    Log.w(
                        TAG,
                        "Session refresh failed (transient) — retry in ${delayMs}ms " +
                                "(attempt $retryAttempt): ${sessionError?.message}"
                    )
                    delay(delayMs)
                }
            }
        }
    }

    // -------------------------------------------------------------------------

    private suspend fun fetchPairingCode(
        api: PairingApiService,
        hardwareId: String,
        tenantId: String
    ): String? = runCatching {
        api.requestPairingCode(
            bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
            request = PairingRequest(hardware_id = hardwareId, tenant_id = tenantId)
        )
    }.onFailure { error ->
        Log.e(TAG, "Pairing code request failed: ${error.message}")
    }.getOrNull()?.code

    /**
     * Full-jitter exponential back-off.
     *
     * Attempt → approximate delay:
     *   0 → 1–2 s
     *   1 → 2–4 s
     *   2 → 4–8 s
     *   ...
     *   7+ → 2.5–5 min  (capped at [BACKOFF_MAX_MS])
     *
     * Full jitter (random in [cap/2, cap]) prevents correlated retries when
     * thousands of devices restart simultaneously.
     */
    private fun nextBackoffDelay(attempt: Int): Long {
        val exp = BACKOFF_BASE_MS * (1L shl attempt.coerceAtMost(7))
        val capped = min(exp, BACKOFF_MAX_MS)
        return Random.nextLong(capped / 2, capped + 1)
    }
}
