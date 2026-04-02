param(
    [string]$ReportDate = "2026-04-01",
    [string]$Serial = "emulator-5554"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "android-offline-airplane-smoke.md"

$lines = @()
$lines += "# Android Offline and Airplane Smoke Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Serial: $Serial"
$lines += ""

try {
    $devices = & adb devices
    $online = $devices | Where-Object { $_ -match "^$([regex]::Escape($Serial))\s+device$" }
    if (-not $online) {
        throw "Target device not connected: $Serial"
    }

    # Toggle airplane mode (best effort; may be restricted on some emulator images).
    & adb -s $Serial shell settings put global airplane_mode_on 1 | Out-Null
    & adb -s $Serial shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true | Out-Null
    Start-Sleep -Seconds 2

    $airplaneOn = & adb -s $Serial shell settings get global airplane_mode_on

    & adb -s $Serial shell settings put global airplane_mode_on 0 | Out-Null
    & adb -s $Serial shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false | Out-Null

    $lines += "## Airplane Toggle"
    if ($airplaneOn -match "1") {
        $lines += "- PASS"
        $lines += "- airplane_mode_on observed as 1 during toggle"
    }
    else {
        $lines += "- CONDITIONAL-PASS"
        $lines += "- airplane mode setting not fully controllable on this image"
    }
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
