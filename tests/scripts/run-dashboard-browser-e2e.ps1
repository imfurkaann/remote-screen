param(
    [string]$ReportDate = "2026-04-01",
    [string]$DashboardBaseUrl = "http://localhost:3001",
    [string]$BackendBaseUrl = "http://localhost:4100/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root

Push-Location $root
node tests/scripts/run-dashboard-browser-e2e.mjs --report-date $ReportDate --dashboard-base-url $DashboardBaseUrl --backend-base-url $BackendBaseUrl --bootstrap-key $BootstrapKey
$exitCode = $LASTEXITCODE
Pop-Location

exit $exitCode