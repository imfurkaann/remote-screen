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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.security.MessageDigest
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
 *  3. Transitions to [DevicePairingState.Unpaired] on explicit HTTP 401 / 404 /
 *     409 responses; network timeouts and 5xx failures preserve the current state.
 *     Content keeps playing through connectivity blips.
 *  4. **Offline grace period:** if the backend returns 404/409 but the last
 *     successful verification was within [OFFLINE_GRACE_PERIOD_MS] (7 days),
 *     the device assumes the backend is temporarily inconsistent (e.g. a
 *     deployment glitch) and retries [GRACE_RETRY_ATTEMPTS] more times before
 *     actually transitioning to Unpaired. This prevents a signage screen from
 *     showing a pairing code just because the backend had a momentary hiccup
 *     after a long internet outage.
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

    /**
     * Offline grace period: if the last successful backend verification was
     * within 7 days, a 404/409 response is treated as a potential backend
     * inconsistency rather than a permanent unpair signal.
     *
     * Rationale: after a long internet outage (e.g. 3 days), the device
     * reconnects and the backend may momentarily return 404 due to a cache
     * miss, a rolling deploy, or a temporary DB inconsistency. Without this
     * grace period the screen would flash the pairing code in front of hotel
     * guests / retail customers for no good reason.
     *
     * 7 days covers the worst-case "long weekend + travel" scenario while
     * still eventually forcing a re-pair if the device truly was deleted.
     */
    private const val OFFLINE_GRACE_PERIOD_MS = 7L * 24 * 60 * 60 * 1_000L

    /**
     * Number of additional retry attempts before accepting a 404/409 as
     * definitive when the device is within the grace period. Each retry uses
     * standard exponential back-off so 3 retries ≈ 2 + 4 + 8 = ~14 s total.
     */
    private const val GRACE_RETRY_ATTEMPTS = 6

    // -- Public state ----------------------------------------------------------

    private val _state = MutableStateFlow<DevicePairingState>(
        DevicePairingState.Unpaired("------")
    )

    /** Observe this from any Composable or service that needs the pairing state. */
    val state: StateFlow<DevicePairingState> = _state.asStateFlow()

    // -- Internal fields -------------------------------------------------------

    @Volatile private var sessionScope: CoroutineScope? = null
    @Volatile private var storeRef: PairingStateStore? = null
    private val immediateRefresh = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

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
     * @param api         Configured [PairingApiService] instance.
     */
    fun start(
        context: Context,
        hardwareId: String,
        api: PairingApiService
    ) {
        val store = PairingStateStore(context)
        val deviceProof = store.getOrCreateDeviceProof()
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
            runSessionLoop(store, hardwareId, deviceProof, api)
        }
    }

    /** Ask the loop to replace the device token now (e.g. socket auth rejection). */
    fun requestImmediateRefresh() {
        immediateRefresh.tryEmit(Unit)
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
        deviceProof: String,
        api: PairingApiService
    ) {
        var retryAttempt = 0
        var lastPairingCodeRequestAt = 0L
        // Track how many consecutive 404/409 responses we've received while
        // within the grace period. Reset to 0 on any successful verification.
        var gracePeriodRetryCount = 0

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
                        device_proof = deviceProof,
                        tenant_id = null
                    )
                )
            }

            val sessionResponse = sessionResult.getOrNull()
            val sessionError = sessionResult.exceptionOrNull()

            when {
                // ✅ Paired and verified
                sessionResponse != null && sessionResponse.paired -> {
                    retryAttempt = 0
                    gracePeriodRetryCount = 0
                    store.savePaired(sessionResponse.device_id, sessionResponse.access_token)
                    _state.value = DevicePairingState.Paired(
                        token = sessionResponse.access_token,
                        deviceId = sessionResponse.device_id
                    )
                    Log.d(TAG, "Session verified — paired (deviceId=${sessionResponse.device_id})")
                    waitForRefreshOrTimeout(TOKEN_REFRESH_INTERVAL_MS)
                }

                // ❌ Definitive "not paired" signal from backend (HTTP 404/409 or paired=false)
                (sessionResponse != null && !sessionResponse.paired) ||
                        (sessionError is HttpException && (sessionError.code() == 404 || sessionError.code() == 409)) -> {

                    val httpCode = if (sessionError is HttpException) sessionError.code() else null
                    val persisted = store.loadState()
                    val now = System.currentTimeMillis()
                    val withinGracePeriod = persisted.lastVerifiedAt > 0 &&
                            (now - persisted.lastVerifiedAt) < OFFLINE_GRACE_PERIOD_MS

                    if (withinGracePeriod && gracePeriodRetryCount < GRACE_RETRY_ATTEMPTS) {
                        // Within the 7-day grace window — treat this as a transient
                        // backend inconsistency and retry before showing pairing screen.
                        gracePeriodRetryCount++
                        val ageHours = (now - persisted.lastVerifiedAt) / (1000 * 60 * 60)
                        val delayMs = nextBackoffDelay(gracePeriodRetryCount)
                        Log.w(
                            TAG,
                            "Received ${httpCode ?: "unpaired"} but within grace period " +
                                    "(last verified ${ageHours}h ago, grace retry $gracePeriodRetryCount/$GRACE_RETRY_ATTEMPTS) " +
                                    "— retrying in ${delayMs}ms"
                        )
                        waitForRefreshOrTimeout(delayMs)
                        continue
                    }

                    // Either outside grace period or exceeded grace retries — accept as definitive.
                    gracePeriodRetryCount = 0
                    retryAttempt = 0
                    store.clearPaired()

                    val isResponseUnpaired = sessionResponse != null && !sessionResponse.paired

                    // Determine whether we need a fresh pairing code
                    val existingCode = (currentState as? DevicePairingState.Unpaired)
                        ?.pairingCode
                        ?.takeIf { it != "------" }
                    val needsNewCode = existingCode == null ||
                            now - lastPairingCodeRequestAt >= PAIRING_CODE_REFRESH_MS

                    var displayCode = existingCode ?: "------"
                    var connectionError: String? = null
                    if (needsNewCode) {
                        val reason = if (isResponseUnpaired) "paired=false" else "HTTP $httpCode"
                        Log.d(TAG, "Fetching new pairing code ($reason)")
                        val pairingAttempt = fetchPairingCode(api, hardwareId, deviceProof)
                        pairingAttempt.onSuccess { code ->
                            displayCode = code
                            lastPairingCodeRequestAt = now
                        }.onFailure { error ->
                            connectionError = pairingFailureMessage(error)
                        }
                    }

                    _state.value = DevicePairingState.Unpaired(
                        pairingCode = displayCode,
                        connectionError = connectionError
                    )
                    Log.d(TAG, "Device unpaired — polling for confirmation in ${UNPAIRED_POLL_INTERVAL_MS}ms")
                    waitForRefreshOrTimeout(UNPAIRED_POLL_INTERVAL_MS)
                }

                // ⚠️ Transient error (network, timeout, 5xx, …)
                // Keep the current state — do NOT flash the pairing screen.
                else -> {
                    // A reinstall keeps ANDROID_ID but rotates the Keystore-backed
                    // device proof. Ask for a physical recovery code on HTTP 401;
                    // the backend still requires an authorized dashboard user to
                    // confirm it before rotating the stored credential.
                    if (sessionError is HttpException && sessionError.code() == 401) {
                        val recoveryAttempt = fetchPairingCode(api, hardwareId, deviceProof)
                        val recoveryCode = recoveryAttempt.getOrNull()
                        if (recoveryCode != null) {
                            store.clearPaired()
                            retryAttempt = 0
                            lastPairingCodeRequestAt = System.currentTimeMillis()
                            _state.value = DevicePairingState.Unpaired(pairingCode = recoveryCode)
                            Log.w(TAG, "Device credential recovery code issued after HTTP 401")
                            waitForRefreshOrTimeout(UNPAIRED_POLL_INTERVAL_MS)
                            continue
                        }

                        // A wrong bootstrap key rejects both calls. Surface the
                        // diagnostic even when a stale paired state was cached;
                        // otherwise the display could remain on an endless
                        // "verifying" screen with no actionable information.
                        _state.value = DevicePairingState.Unpaired(
                            pairingCode = "------",
                            connectionError = pairingFailureMessage(recoveryAttempt.exceptionOrNull())
                        )
                        waitForRefreshOrTimeout(nextBackoffDelay(retryAttempt))
                        retryAttempt = (retryAttempt + 1).coerceAtMost(8)
                        continue
                    }

                    val delayMs = nextBackoffDelay(retryAttempt)
                    retryAttempt = (retryAttempt + 1).coerceAtMost(8)
                    if (currentState is DevicePairingState.Unpaired) {
                        _state.value = currentState.copy(connectionError = pairingFailureMessage(sessionError))
                    }
                    Log.w(
                        TAG,
                        "Session refresh failed (transient) — retry in ${delayMs}ms " +
                                "(attempt $retryAttempt): ${sessionError?.message}"
                    )
                    waitForRefreshOrTimeout(delayMs)
                }
            }
        }
    }

    // -------------------------------------------------------------------------

    private suspend fun fetchPairingCode(
        api: PairingApiService,
        hardwareId: String,
        deviceProof: String
    ): Result<String> = runCatching {
        api.requestPairingCode(
            bootstrapKey = AppDefaults.BOOTSTRAP_KEY,
            request = PairingRequest(hardware_id = hardwareId, device_proof = deviceProof, tenant_id = null)
        ).code
    }.onFailure { error ->
        Log.e(TAG, "Pairing code request failed: ${error.message}")
    }

    private fun pairingFailureMessage(error: Throwable?): String {
        if (error is HttpException && error.code() == 401) {
            val serverFingerprint = error.response()
                ?.headers()
                ?.get("X-Device-Bootstrap-Fingerprint")
                ?: "unknown"
            val localFingerprint = MessageDigest.getInstance("SHA-256")
                .digest(AppDefaults.BOOTSTRAP_KEY.toByteArray(Charsets.UTF_8))
                .joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }
                .take(12)
            return "Sunucu anahtarı eşleşmiyor (cihaz: $localFingerprint, sunucu: $serverFingerprint)."
        }
        if (error is HttpException) {
            return "Eşleştirme servisi HTTP ${error.code()} hatası döndürdü."
        }
        return "Sunucuya bağlanılamıyor. Ağ bağlantısını ve sunucu adresini kontrol edin."
    }

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
    private suspend fun waitForRefreshOrTimeout(timeoutMs: Long) {
        withTimeoutOrNull(timeoutMs) { immediateRefresh.first() }
    }
    private fun nextBackoffDelay(attempt: Int): Long {
        val exp = BACKOFF_BASE_MS * (1L shl attempt.coerceAtMost(7))
        val capped = min(exp, BACKOFF_MAX_MS)
        return Random.nextLong(capped / 2, capped + 1)
    }
}
