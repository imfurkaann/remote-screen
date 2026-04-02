param(
    [string]$ReportDate = "2026-04-01",
    [string]$BaseUrl = "http://localhost:4000/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "api-smoke.md"

$lines = @()
$lines += "# API Smoke Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Base URL: $BaseUrl"
$lines += ""

$bootstrapCandidates = @($BootstrapKey, "local-bootstrap-key") | Select-Object -Unique

try {
    $health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
    $lines += "## Health"
    $lines += "- PASS"
    $lines += ("- Response: " + ($health | ConvertTo-Json -Compress))
    $lines += ""

    $authBody = @{ email = "qa@demo.local"; tenant_id = "tenant-demo"; role = "tenant_admin" } | ConvertTo-Json
    $tokenResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/dev-token" -ContentType "application/json" -Body $authBody
    $token = $tokenResp.access_token
    $userHeaders = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

    $lines += "## Auth Dev Token"
    $lines += "- PASS"
    $lines += ("- User: " + $tokenResp.user.email)
    $lines += ""

    $pairReqBody = @{ hardware_id = "HW-SMOKE-001"; tenant_id = "tenant-demo" } | ConvertTo-Json
    $pairReq = $null
    $activeBootstrap = $null

    foreach ($candidateKey in $bootstrapCandidates) {
        try {
            $pairReq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/request-code" -Headers @{ "x-device-bootstrap-key" = $candidateKey; "Content-Type" = "application/json" } -Body $pairReqBody
            $activeBootstrap = $candidateKey
            break
        }
        catch {
            if (-not $_.Exception.Message.Contains("(401)")) {
                throw
            }
        }
    }

    if (-not $pairReq) {
        throw "Pairing request failed for all bootstrap key candidates"
    }

    $deviceId = $pairReq.device_id
    $pairCode = $pairReq.code

    $lines += "## Pairing Request Code"
    $lines += "- PASS"
    $lines += ("- bootstrap_key_used: " + $activeBootstrap)
    $lines += ("- device_id: " + $deviceId)
    $lines += ("- code: " + $pairCode)
    $lines += ""

    $pairConfirmBody = @{ pairing_code = $pairCode } | ConvertTo-Json
    $pairConfirm = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/confirm" -Headers $userHeaders -Body $pairConfirmBody

    $lines += "## Pairing Confirm"
    $lines += "- PASS"
    $lines += ("- linked: " + $pairConfirm.linked)
    $lines += ""

    $deviceSessionBody = @{ hardware_id = "HW-SMOKE-001"; tenant_id = "tenant-demo" } | ConvertTo-Json
    $deviceSession = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/device-session" -Headers @{ "x-device-bootstrap-key" = $activeBootstrap; "Content-Type" = "application/json" } -Body $deviceSessionBody
    $deviceToken = $deviceSession.access_token
    $deviceHeaders = @{ Authorization = "Bearer $deviceToken"; "Content-Type" = "application/json" }

    $lines += "## Device Session Refresh"
    $lines += "- PASS"
    $lines += ("- paired: " + $deviceSession.paired)
    $lines += ""

    $telemetryBody = @{ kind = "heartbeat"; payload = @{ source = "smoke"; status = "online" }; correlation_id = "smoke-telemetry-001" } | ConvertTo-Json -Depth 5
    $telemetryPost = Invoke-RestMethod -Method Post -Uri "$BaseUrl/devices/$deviceId/telemetry" -Headers $deviceHeaders -Body $telemetryBody
    $telemetryGet = Invoke-RestMethod -Method Get -Uri "$BaseUrl/devices/$deviceId/telemetry?kind=heartbeat&limit=1" -Headers @{ Authorization = "Bearer $token" }

    $lines += "## Telemetry Ingest and Query"
    $lines += "- PASS"
    $lines += ("- accepted: " + $telemetryPost.accepted)
    $lines += ("- query_count: " + $telemetryGet.telemetry.Count)
    $lines += ""

    $commandBody = @{ command_type = "SET_VOLUME"; command_id = "cmd-smoke-001"; payload = @{ volume = 20 }; timeout_ms = 5000; max_attempts = 1 } | ConvertTo-Json -Depth 5
    $commandDispatch = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers $userHeaders -Body $commandBody
    $commandStatus = Invoke-RestMethod -Method Get -Uri "$BaseUrl/commands/devices/$deviceId/commands/cmd-smoke-001" -Headers @{ Authorization = "Bearer $token" }

    $lines += "## Command Dispatch and Status"
    $lines += "- PASS"
    $lines += ("- dispatch_status: " + $commandDispatch.command.status)
    $lines += ("- get_status: " + $commandStatus.command.status)
    $lines += ""

    $lines += "## Gate Decision"
    $lines += "- PASS"
}
catch {
    $lines += "## Failure"
    $lines += ("- FAIL: " + $_.Exception.Message)
    $lines += ""
    $lines += "## Gate Decision"
    $lines += "- BLOCKED"
}

$lines | Set-Content -Path $report -Encoding UTF8
Get-Content $report
