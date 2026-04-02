param(
    [string]$ReportDate = "2026-04-01",
    [string]$BaseUrl = "http://localhost:4100/api/v1",
    [string]$DashboardBaseUrl = "http://localhost:3001",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root

function Run-Smoke {
    param(
        [string]$Name,
        [string]$Command
    )

    Write-Host "`n=== $Name ==="
    Invoke-Expression $Command | Out-Host
    return [int]$LASTEXITCODE
}

function Restart-DashboardServer {
    param(
        [string]$DashboardRoot,
        [string]$BackendBaseUrl,
        [string]$Port = "3001"
    )

    $listenConn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listenConn) {
        Stop-Process -Id $listenConn.OwningProcess -Force
    }

    Remove-Item -Recurse -Force (Join-Path $DashboardRoot ".next") -ErrorAction SilentlyContinue

    $dashboardLaunch = "Set-Location '$DashboardRoot'; `$env:BACKEND_BASE_URL='$BackendBaseUrl'; npx next dev -p $Port"
    $null = Start-Process -FilePath powershell.exe -ArgumentList @("-ExecutionPolicy", "Bypass", "-Command", $dashboardLaunch) -WindowStyle Hidden

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                return
            }
        }
        catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "Dashboard server did not become ready after restart."
}

Push-Location $root

$phaseGate = Run-Smoke -Name "Phase Gates" -Command "powershell.exe -ExecutionPolicy Bypass -File tests/scripts/run-phase-gates.ps1 -ReportDate $ReportDate"
Restart-DashboardServer -DashboardRoot (Join-Path $root "dashboard") -BackendBaseUrl "http://localhost:4100"
$dashboardSmoke = Run-Smoke -Name "Dashboard Smoke" -Command "powershell.exe -ExecutionPolicy Bypass -File tests/scripts/run-dashboard-smoke.ps1 -ReportDate $ReportDate -DashboardBaseUrl $DashboardBaseUrl -BackendBaseUrl $BaseUrl -BootstrapKey $BootstrapKey"
$dashboardBrowserE2E = Run-Smoke -Name "Dashboard Browser E2E" -Command "powershell.exe -ExecutionPolicy Bypass -File tests/scripts/run-dashboard-browser-e2e.ps1 -ReportDate $ReportDate -DashboardBaseUrl $DashboardBaseUrl -BackendBaseUrl $BaseUrl -BootstrapKey $BootstrapKey"
$apiSmoke = Run-Smoke -Name "API Smoke" -Command "powershell.exe -ExecutionPolicy Bypass -File tests/scripts/run-api-smoke.ps1 -ReportDate $ReportDate -BaseUrl $BaseUrl -BootstrapKey $BootstrapKey"
$socketSmoke = Run-Smoke -Name "Socket Smoke" -Command "powershell.exe -ExecutionPolicy Bypass -File tests/scripts/run-socket-smoke.ps1 -ReportDate $ReportDate -BaseUrl $BaseUrl -BootstrapKey $BootstrapKey"
$androidSmoke = Run-Smoke -Name "Android Runtime Smoke" -Command "powershell.exe -ExecutionPolicy Bypass -File tests/scripts/run-android-runtime-smoke.ps1 -ReportDate $ReportDate -BaseUrl $BaseUrl -BootstrapKey $BootstrapKey"

Write-Host "`n=== Smoke Summary ==="
Write-Host "Phase Gates: $phaseGate"
Write-Host "Dashboard Smoke: $dashboardSmoke"
Write-Host "Dashboard Browser E2E: $dashboardBrowserE2E"
Write-Host "API Smoke: $apiSmoke"
Write-Host "Socket Smoke: $socketSmoke"
Write-Host "Android Runtime Smoke: $androidSmoke"

Pop-Location

if (($phaseGate -eq 0) -and ($dashboardSmoke -eq 0) -and ($dashboardBrowserE2E -eq 0) -and ($apiSmoke -eq 0) -and ($socketSmoke -eq 0) -and ($androidSmoke -eq 0)) {
    exit 0
}

exit 1
