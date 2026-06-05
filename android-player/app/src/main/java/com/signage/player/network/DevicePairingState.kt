package com.signage.player.network

/**
 * Sealed class modelling every valid state the device can be in with respect
 * to its pairing / session lifecycle.
 *
 * Design principles:
 *  - States are determined **only** by definitive backend signals, never by
 *    transient network errors. A WiFi blip must never cause a transition to
 *    [Unpaired] — content must keep playing.
 *  - [VerifyingSession] enables "optimistic rendering": if the device was
 *    previously paired, the UI immediately shows content while the session is
 *    being confirmed in the background. The user (and the audience in front of
 *    the screen) sees zero interruption.
 *  - [Unpaired.pairingCode] is owned by this sealed class, not by the UI,
 *    keeping the composable a pure view of whatever [SessionManager] emits.
 */
sealed class DevicePairingState {

    /**
     * The app has just started. A previously-paired session was found in local
     * storage, so the UI optimistically shows the last content while
     * [SessionManager] validates the session in the background.
     *
     * If validation succeeds  → transitions to [Paired].
     * If validation returns 404/409 → transitions to [Unpaired].
     * If a network error occurs     → stays in [VerifyingSession] and retries
     *                                  with exponential back-off.
     */
    data object VerifyingSession : DevicePairingState()

    /**
     * Backend has confirmed the device is paired. Content plays normally.
     * [SessionManager] will proactively refresh the token before it expires.
     *
     * @param token   Current bearer JWT (12 h lifetime).
     * @param deviceId MongoDB document _id assigned to this device.
     */
    data class Paired(val token: String, val deviceId: String) : DevicePairingState()

    /**
     * Backend returned HTTP 404 (device not found) or 409 (device exists but
     * has no [pairedOwnerUserId]). This is the only way to reach the pairing
     * code screen — transient network errors must never trigger this state.
     *
     * @param pairingCode 6-digit code to display. "------" while the first
     *                    code is being fetched from the backend.
     */
    data class Unpaired(val pairingCode: String) : DevicePairingState()
}
