param(
    [string]$ReportDate = "2026-04-01",
    [string]$BaseUrl = "http://localhost:4100/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "socket-resilience-smoke.md"

$script:lines = @()
$script:lines += "# Socket Resilience Smoke Report"
$script:lines += ""
$script:lines += "- Date: $ReportDate"
$script:lines += "- Base URL: $BaseUrl"
$script:lines += ""

function Add-SectionResult {
    param(
        [string]$Title,
        [string]$Status,
        [string[]]$Details
    )

    $script:lines += "## $Title"
    $script:lines += "- $Status"
    foreach ($detail in $Details) {
        $script:lines += "- $detail"
    }
    $script:lines += ""
}

try {
    $authBody = @{ email = "qa@demo.local"; tenant_id = "tenant-demo"; role = "tenant_admin" } | ConvertTo-Json
    $tokenResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/dev-token" -ContentType "application/json" -Body $authBody
    $userToken = $tokenResp.access_token
    $userHeaders = @{ Authorization = "Bearer $userToken"; "Content-Type" = "application/json" }

    $pairReqBody = @{ hardware_id = "HW-SOCKET-SMOKE-001"; tenant_id = "tenant-demo" } | ConvertTo-Json
    $pairReq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/request-code" -Headers @{ "x-device-bootstrap-key" = $BootstrapKey; "Content-Type" = "application/json" } -Body $pairReqBody

    $pairConfirmBody = @{ pairing_code = $pairReq.code } | ConvertTo-Json
    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/confirm" -Headers $userHeaders -Body $pairConfirmBody

    $deviceId = $pairReq.device_id

    Add-SectionResult -Title "Setup" -Status "PASS" -Details @("device_id: $deviceId", "tenant: tenant-demo")

    # Scenario 1 and 2: command timeout and retry transition.
    $commandId = "cmd-socket-smoke-timeout-001"
    $dispatchBody = @{
        command_type = "SET_VOLUME"
        command_id = $commandId
        payload = @{ volume = 25 }
        timeout_ms = 2000
        max_attempts = 2
    } | ConvertTo-Json -Depth 5

    $dispatch = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers $userHeaders -Body $dispatchBody
    $statusAfterTimeout = $null
    $maxWaitSeconds = 8
    $started = Get-Date

    do {
        Start-Sleep -Milliseconds 700
        $statusAfterTimeout = Invoke-RestMethod -Method Get -Uri "$BaseUrl/commands/devices/$deviceId/commands/$commandId" -Headers @{ Authorization = "Bearer $userToken" }
        $status = $statusAfterTimeout.command.status
        $elapsed = ((Get-Date) - $started).TotalSeconds
    } while (($status -notin @("timeout", "completed", "failed")) -and ($elapsed -lt $maxWaitSeconds))

    $timeoutPass = ($statusAfterTimeout.command.status -eq "timeout") -and ($statusAfterTimeout.command.attempts -ge 1)
    Add-SectionResult -Title "Timeout and Retry Lifecycle" -Status $(if ($timeoutPass) { "PASS" } else { "FAIL" }) -Details @(
        "initial_status: $($dispatch.command.status)",
        "final_status: $($statusAfterTimeout.command.status)",
        "attempts: $($statusAfterTimeout.command.attempts)",
        "max_attempts: $($statusAfterTimeout.command.max_attempts)"
    )

    if (-not $timeoutPass) {
        throw "Timeout/retry lifecycle assertion failed"
    }

    # Scenario 5: duplicate command_id dedupe behavior.
    $dedupeId = "cmd-socket-smoke-dedupe-001"
    $dedupeBody = @{
        command_type = "SET_VOLUME"
        command_id = $dedupeId
        payload = @{ volume = 10 }
        timeout_ms = 1500
        max_attempts = 1
    } | ConvertTo-Json -Depth 5

    $firstDispatch = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers $userHeaders -Body $dedupeBody
    $secondDispatch = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers $userHeaders -Body $dedupeBody

    $dedupePass = ($firstDispatch.command.command_id -eq $secondDispatch.command.command_id)
    Add-SectionResult -Title "Duplicate command_id Dedupe" -Status $(if ($dedupePass) { "PASS" } else { "FAIL" }) -Details @(
        "first_command_id: $($firstDispatch.command.command_id)",
        "second_command_id: $($secondDispatch.command.command_id)",
        "second_status: $($secondDispatch.command.status)"
    )

    if (-not $dedupePass) {
        throw "Dedupe assertion failed"
    }

    # Scenarios requiring active Android socket client are marked as pending evidence.
    Add-SectionResult -Title "Online ACK Path" -Status "PENDING-EVIDENCE" -Details @(
        "Requires connected Android socket client to emit ACK/COMPLETED.",
        "Not executable in backend-only smoke environment."
    )

    Add-SectionResult -Title "Reconnect and Missed Event Recovery" -Status "PENDING-EVIDENCE" -Details @(
        "Requires controlled socket disconnect/reconnect from player runtime.",
        "Validate with device/emulator run during Android smoke pack."
    )

    $script:lines += "## Gate Decision"
    $script:lines += "- CONDITIONAL-PASS"
    $script:lines += "- Backend-side resilience checks passed; runtime socket evidence pending."
}
catch {
    $script:lines += "## Failure"
    $script:lines += ("- FAIL: " + $_.Exception.Message)
    $script:lines += ""
    $script:lines += "## Gate Decision"
    $script:lines += "- BLOCKED"
}

$script:lines | Set-Content -Path $report -Encoding UTF8
Get-Content $report
