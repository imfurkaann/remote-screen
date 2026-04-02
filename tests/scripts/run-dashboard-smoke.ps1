param(
    [string]$ReportDate = "2026-04-01",
    [string]$DashboardBaseUrl = "http://localhost:3001",
    [string]$BackendBaseUrl = "http://localhost:4100/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "dashboard-interaction-smoke.md"

$lines = @()
$lines += "# Dashboard Interaction Smoke Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Dashboard: $DashboardBaseUrl"
$lines += "- Backend: $BackendBaseUrl"
$lines += ""

try {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    # 1) Login through dashboard route to set auth cookies.
    $loginForm = @{ email = "qa@demo.local"; password = "secret"; redirect = "/screens/pair" }
    $loginResponse = $null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $loginResponse = Invoke-WebRequest -Method Post -Uri "$DashboardBaseUrl/api/auth/login" -Body $loginForm -WebSession $session -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing
        if ($loginResponse.StatusCode -eq 307) {
            break
        }

        Start-Sleep -Seconds 2
    }

    if ($loginResponse.StatusCode -ne 307) {
        throw "Expected 307 from /api/auth/login, got $($loginResponse.StatusCode)"
    }

    $hasAccessCookie = $session.Cookies.GetCookies($DashboardBaseUrl) | Where-Object { $_.Name -eq "dashboard_access_token" }
    if (-not $hasAccessCookie) {
        throw "dashboard_access_token cookie not set after login"
    }

    $lines += "## Login Route"
    $lines += "- PASS"
    $lines += "- Redirect status: 307"
    $lines += "- Access cookie set: true"
    $lines += ""

    # 2) Generate pairing code from backend then confirm through dashboard route.
    $pairReqBody = @{ hardware_id = "HW-DASH-SMOKE-001"; tenant_id = "tenant-demo" } | ConvertTo-Json
    $pairReq = Invoke-RestMethod -Method Post -Uri "$BackendBaseUrl/pairing/request-code" -Headers @{ "x-device-bootstrap-key" = $BootstrapKey; "Content-Type" = "application/json" } -Body $pairReqBody

    $pairForm = @{ pairingCode = $pairReq.code }
    $pairConfirmResponse = Invoke-WebRequest -Method Post -Uri "$DashboardBaseUrl/api/pairing/confirm" -Body $pairForm -WebSession $session -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing
    if ($pairConfirmResponse.StatusCode -ne 307) {
        throw "Expected 307 from /api/pairing/confirm, got $($pairConfirmResponse.StatusCode)"
    }

    $redirectLocation = $pairConfirmResponse.Headers.Location
    if (-not $redirectLocation -or $redirectLocation -notlike "*status=ok*") {
        throw "Pairing confirm did not redirect to success state"
    }

    $lines += "## Pairing Confirm Route"
    $lines += "- PASS"
    $lines += ("- Redirect location: " + $redirectLocation)
    $lines += ""

    # 3) Dispatch command through dashboard proxy route.
    $dispatchBody = @{ device_id = $pairReq.device_id; command_type = "SET_VOLUME"; command_id = "cmd-dash-smoke-001"; payload = @{ volume = 15 } } | ConvertTo-Json -Depth 5
    $dispatchResponse = Invoke-WebRequest -Method Post -Uri "$DashboardBaseUrl/api/commands/dispatch" -ContentType "application/json" -Body $dispatchBody -WebSession $session -UseBasicParsing
    if ($dispatchResponse.StatusCode -lt 200 -or $dispatchResponse.StatusCode -ge 300) {
        throw "Command dispatch returned status $($dispatchResponse.StatusCode)"
    }

    $dispatchJson = $dispatchResponse.Content | ConvertFrom-Json
    if (-not $dispatchJson.command) {
        throw "Dispatch response missing command object"
    }

    $lines += "## Command Dispatch Route"
    $lines += "- PASS"
    $lines += ("- Command status: " + $dispatchJson.command.status)
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
