param(
    [string]$ReportDate = "2026-04-02",
    [string]$BaseUrl = "http://localhost:4100/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "support-drill.md"

$lines = @()
$lines += "# Support Drill Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Base URL: $BaseUrl"
$lines += "- Objective: Reproduce issue, trace with correlation_id, and close with RCA"
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

    $hardwareId = "HW-SUPPORT-DRILL-001"
    $pairReqBody = @{ hardware_id = $hardwareId; tenant_id = "tenant-demo" } | ConvertTo-Json
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

    $pairConfirmBody = @{ pairing_code = $pairCode } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/confirm" -Headers $userHeaders -Body $pairConfirmBody | Out-Null

    $deviceSessionBody = @{ hardware_id = $hardwareId; tenant_id = "tenant-demo" } | ConvertTo-Json
    $deviceSession = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/device-session" -Headers @{ "x-device-bootstrap-key" = $activeBootstrap; "Content-Type" = "application/json" } -Body $deviceSessionBody
    $deviceToken = $deviceSession.access_token
    $deviceHeaders = @{ Authorization = "Bearer $deviceToken"; "Content-Type" = "application/json" }

    $lines += "## Pairing and Device Session"
    $lines += "- PASS"
    $lines += ("- bootstrap_key_used: " + $activeBootstrap)
    $lines += ("- device_id: " + $deviceId)
    $lines += ("- hardware_id: " + $hardwareId)
    $lines += ""

    $correlationIds = @(
        "drill-sync-001",
        "drill-playback-001",
        "drill-command-001"
    )

    $errorPayloads = @(
        @{ source = "sync_download"; message = "Injected sync failure"; status = "failed"; retry_count = 2; playlist_id = "pl-drill-01" },
        @{ source = "playback_restore"; message = "Injected playback restore failure"; status = "failed"; media_index = 1 },
        @{ source = "command_execute"; message = "Injected command execution failure"; status = "failed"; command_id = "cmd-drill-01" }
    )

    for ($index = 0; $index -lt $errorPayloads.Count; $index++) {
        $telemetryBody = @{
            kind = "error"
            correlation_id = $correlationIds[$index]
            payload = $errorPayloads[$index]
        } | ConvertTo-Json -Depth 8

        $resp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/devices/$deviceId/telemetry" -Headers $deviceHeaders -Body $telemetryBody
        if (-not $resp.accepted) {
            throw "Telemetry ingest was not accepted for index $index"
        }
    }

    $syncTelemetryBody = @{
        kind = "sync"
        correlation_id = "drill-sync-status-001"
        payload = @{ source = "sync_download"; status = "failed"; result = "checksum_failed"; playlist_id = "pl-drill-01" }
    } | ConvertTo-Json -Depth 8
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/devices/$deviceId/telemetry" -Headers $deviceHeaders -Body $syncTelemetryBody | Out-Null

    $lines += "## Reproduce Controlled Failures"
    $lines += "- PASS"
    $lines += ("- injected_error_events: " + $errorPayloads.Count)
    $lines += ("- correlation_ids: " + ($correlationIds -join ", "))
    $lines += ""

    Start-Sleep -Milliseconds 400

    $troubleshoot = Invoke-RestMethod -Method Get -Uri "$BaseUrl/ops/devices/$deviceId/troubleshoot?command_limit=20&telemetry_limit=100" -Headers @{ Authorization = "Bearer $token" }
    $bundle = Invoke-RestMethod -Method Get -Uri "$BaseUrl/ops/support-bundle?device_id=$deviceId&command_limit=20&telemetry_limit=100" -Headers @{ Authorization = "Bearer $token" }
    $alerts = Invoke-RestMethod -Method Get -Uri "$BaseUrl/ops/alerts/evaluate?window_minutes=15" -Headers @{ Authorization = "Bearer $token" }

    $observedCorrelations = @($troubleshoot.recent_errors | ForEach-Object { $_.correlation_id })
    $missingInTroubleshoot = @($correlationIds | Where-Object { $_ -notin $observedCorrelations })
    if ($missingInTroubleshoot.Count -gt 0) {
        throw "Missing correlation IDs in troubleshoot response: $($missingInTroubleshoot -join ', ')"
    }

    $bundleCorrelationIds = @($bundle.correlation_ids)
    $missingInBundle = @($correlationIds | Where-Object { $_ -notin $bundleCorrelationIds })
    if ($missingInBundle.Count -gt 0) {
        throw "Missing correlation IDs in support bundle: $($missingInBundle -join ', ')"
    }

    $syncAlert = $alerts.alerts | Where-Object { $_.rule -eq "sync_failure_spike" } | Select-Object -First 1
    if (-not $syncAlert) {
        throw "sync_failure_spike alert not found"
    }

    $lines += "## Correlation Traceability"
    $lines += "- PASS"
    $lines += ("- troubleshoot_recent_errors: " + $troubleshoot.recent_errors.Count)
    $lines += ("- support_bundle_correlation_count: " + $bundle.correlation_ids.Count)
    $lines += ""

    $lines += "## Alert Threshold Check"
    $lines += "- PASS"
    $lines += ("- sync_failure_spike severity: " + $syncAlert.severity)
    $lines += ("- sync_failure_spike observed: " + $syncAlert.observed + " " + $syncAlert.unit)
    $lines += ""

    $lines += "## RCA"
    $lines += "- Incident: Simulated player failures on sync/playback/command paths."
    $lines += "- Root Cause: Controlled injection (test scenario) created error telemetry and sync failure status to validate supportability pipeline."
    $lines += "- Impact: Limited to drill device; no production customer impact."
    $lines += "- Detection: Ops troubleshoot and alerts/evaluate endpoints identified failure pattern via correlation IDs."
    $lines += "- Resolution: Support bundle exported, correlations traced end-to-end, and alert thresholds confirmed active."
    $lines += "- Prevention: Keep drill script in regression cadence for Phase 17 exit gate."
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
