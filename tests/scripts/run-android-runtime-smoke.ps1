param(
    [string]$ReportDate = "2026-04-01",
    [string]$BaseUrl = "http://localhost:4100/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key",
    [string]$PackageName = "com.signage.player",
    [string]$SocketBaseUrl = "http://10.0.2.2:4100"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "android-runtime-smoke.md"

$lines = @()
$lines += "# Android Runtime Smoke Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Base URL: $BaseUrl"
$lines += "- Package: $PackageName"
$lines += "- Socket Base URL: $SocketBaseUrl"
$lines += ""

function Add-Section {
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

$script:lines = $lines

try {
    $adbPath = (Get-Command adb -ErrorAction Stop).Source
    Add-Section -Title "ADB" -Status "PASS" -Details @("path: $adbPath")

    $devicesRaw = & adb devices
    $deviceLines = $devicesRaw | Select-Object -Skip 1 | Where-Object { $_ -match "\sdevice$" }

    if (-not $deviceLines -or $deviceLines.Count -eq 0) {
        Add-Section -Title "Connected Device" -Status "BLOCKED" -Details @(
            "No connected Android device/emulator found.",
            "Start emulator or connect a device, then rerun this script."
        )

        $script:lines += "## Gate Decision"
        $script:lines += "- BLOCKED"
        $script:lines += "- Runtime smoke requires active Android target."
        $script:lines | Set-Content -Path $report -Encoding UTF8
        Get-Content $report
        exit 2
    }

    $firstDeviceLine = @($deviceLines)[0]
    $serial = (($firstDeviceLine -replace "\s+device$", "").Trim())
    Add-Section -Title "Connected Device" -Status "PASS" -Details @("serial: $serial")

    # Verify package presence.
    $pkgCheck = & adb -s $serial shell pm list packages $PackageName
    $pkgInstalled = ($pkgCheck -match [Regex]::Escape($PackageName))

    if (-not $pkgInstalled) {
        Add-Section -Title "App Package" -Status "BLOCKED" -Details @(
            "Package not installed on device.",
            "Install app package and rerun runtime smoke."
        )

        $script:lines += "## Gate Decision"
        $script:lines += "- BLOCKED"
        $script:lines += "- Android app package is required for runtime command validation."
        $script:lines | Set-Content -Path $report -Encoding UTF8
        Get-Content $report
        exit 3
    }

    Add-Section -Title "App Package" -Status "PASS" -Details @("installed: $PackageName")

    # Backend auth + pairing bootstrap for runtime test device id.
    $authBody = @{ email = "qa@demo.local"; tenant_id = "tenant-demo"; role = "tenant_admin" } | ConvertTo-Json
    $tokenResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/dev-token" -ContentType "application/json" -Body $authBody
    $userToken = $tokenResp.access_token
    $userHeaders = @{ Authorization = "Bearer $userToken"; "Content-Type" = "application/json" }

    $runtimeHardwareId = "HW-ANDROID-RUNTIME-SMOKE-001"
    $pairReqBody = @{ hardware_id = $runtimeHardwareId; tenant_id = "tenant-demo" } | ConvertTo-Json
    $bootstrapCandidates = @($BootstrapKey, "local-bootstrap-key") | Select-Object -Unique
    $pairReq = $null
    foreach ($candidateKey in $bootstrapCandidates) {
        try {
            $pairReq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/request-code" -Headers @{ "x-device-bootstrap-key" = $candidateKey; "Content-Type" = "application/json" } -Body $pairReqBody
            break
        }
        catch {
            if (-not $_.Exception.Message.Contains("(401)")) {
                throw
            }
        }
    }
    if (-not $pairReq) {
        throw "Pairing request failed for all bootstrap keys"
    }
    $pairConfirmBody = @{ pairing_code = $pairReq.code } | ConvertTo-Json
    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/confirm" -Headers $userHeaders -Body $pairConfirmBody

    $deviceId = $pairReq.device_id
    Add-Section -Title "Pairing Bootstrap" -Status "PASS" -Details @("device_id: $deviceId", "hardware_id: $runtimeHardwareId")

    $null = & adb -s $serial shell am force-stop $PackageName
    Start-Sleep -Milliseconds 500

    $launchArgs = @(
        "shell",
        "am",
        "start",
        "-n",
        "$PackageName/.MainActivity",
        "--es",
        "device_id",
        "$runtimeHardwareId",
        "--es",
        "socket_base_url",
        "$SocketBaseUrl"
    )
    $null = & adb -s $serial @launchArgs
    Start-Sleep -Seconds 6
    Add-Section -Title "Runtime Launch" -Status "PASS" -Details @("started MainActivity with device_id override")

    # Dispatch runtime command and poll for ACK/COMPLETED.
    $commandId = "cmd-android-runtime-smoke-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $dispatchBody = @{
        command_type = "SET_VOLUME"
        command_id = $commandId
        payload = @{ volume = 12 }
        timeout_ms = 10000
        max_attempts = 2
    } | ConvertTo-Json -Depth 5

    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers $userHeaders -Body $dispatchBody

    $seenAck = $false
    $seenCompleted = $false
    $statusValue = "unknown"

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 1000
        $statusResp = Invoke-RestMethod -Method Get -Uri "$BaseUrl/commands/devices/$deviceId/commands/$commandId" -Headers @{ Authorization = "Bearer $userToken" }
        $statusValue = [string]$statusResp.command.status

        if ($statusValue -eq "acknowledged") {
            $seenAck = $true
        }

        if ($statusValue -eq "completed") {
            $seenCompleted = $true
            break
        }

        if ($statusValue -in @("failed", "timeout")) {
            break
        }
    }

    if ($seenAck -or $seenCompleted) {
        Add-Section -Title "Runtime Command ACK" -Status "PASS" -Details @("final_status: $statusValue")
    }
    else {
        Add-Section -Title "Runtime Command ACK" -Status "BLOCKED" -Details @(
            "No ACK/COMPLETED observed.",
            "Check running Android client socket connection and command handler wiring.",
            "final_status: $statusValue"
        )

        $script:lines += "## Gate Decision"
        $script:lines += "- BLOCKED"
        $script:lines += "- Runtime command ACK evidence missing."
        $script:lines | Set-Content -Path $report -Encoding UTF8
        Get-Content $report
        exit 4
    }

    # Reconnect scenario: restart app process and ensure command channel recovers.
    $null = & adb -s $serial shell am force-stop $PackageName
    Start-Sleep -Seconds 1
    $null = & adb -s $serial @launchArgs
    Start-Sleep -Seconds 6

    $reconnectCommandId = "cmd-android-runtime-reconnect-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $reconnectBody = @{
        command_type = "SET_VOLUME"
        command_id = $reconnectCommandId
        payload = @{ volume = 18 }
        timeout_ms = 15000
        max_attempts = 3
    } | ConvertTo-Json -Depth 5

    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers $userHeaders -Body $reconnectBody

    $reconnectFinalStatus = "unknown"
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 1000
        $reconnectStatus = Invoke-RestMethod -Method Get -Uri "$BaseUrl/commands/devices/$deviceId/commands/$reconnectCommandId" -Headers @{ Authorization = "Bearer $userToken" }
        $reconnectFinalStatus = [string]$reconnectStatus.command.status
        if ($reconnectFinalStatus -in @("acknowledged", "completed", "failed", "timeout")) {
            if ($reconnectFinalStatus -eq "completed") {
                break
            }
        }
    }

    if ($reconnectFinalStatus -eq "completed") {
        Add-Section -Title "Reconnect Recovery" -Status "PASS" -Details @("final_status: $reconnectFinalStatus")
    }
    else {
        Add-Section -Title "Reconnect Recovery" -Status "BLOCKED" -Details @("final_status: $reconnectFinalStatus")
        $script:lines += "## Gate Decision"
        $script:lines += "- BLOCKED"
        $script:lines += "- Reconnect command channel did not recover to completed state."
        $script:lines | Set-Content -Path $report -Encoding UTF8
        Get-Content $report
        exit 5
    }

    $script:lines += "## Gate Decision"
    $script:lines += "- PASS"
    $script:lines += "- Android runtime smoke checks passed with connected target evidence."
}
catch {
    $script:lines += "## Failure"
    $script:lines += ("- FAIL: " + $_.Exception.Message)
    $script:lines += ""
    $script:lines += "## Gate Decision"
    $script:lines += "- BLOCKED"
    $script:lines | Set-Content -Path $report -Encoding UTF8
    Get-Content $report
    exit 1
}

$script:lines | Set-Content -Path $report -Encoding UTF8
Get-Content $report
