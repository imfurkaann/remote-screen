package com.signage.player.commands

data class CommandDispatchPayload(
    val commandId: String,
    val commandType: String,
    val payload: Map<String, Any?>,
    val timeoutMs: Long,
    val attempt: Int
)

data class CommandAckPayload(
    val deviceId: String,
    val commandId: String,
    val status: String,
    val screenshotUrl: String? = null,
    val errorMessage: String? = null,
    val diagnostics: Map<String, Any?>? = null
)
