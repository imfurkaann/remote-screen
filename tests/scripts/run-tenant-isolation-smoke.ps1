param(
    [string]$ReportDate = "2026-04-01",
    [string]$BaseUrl = "http://localhost:4200/api/v1",
    [string]$BootstrapKey = "test-bootstrap-key"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)
New-Item -Path $reportDir -ItemType Directory -Force | Out-Null
$report = Join-Path $reportDir "tenant-isolation-smoke.md"

$lines = @()
$lines += "# Tenant Isolation Smoke Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Base URL: $BaseUrl"
$lines += ""

try {
    $tenantAAuth = @{ email = "owner-a@demo.local"; tenant_id = "tenant-a"; role = "tenant_admin" } | ConvertTo-Json
    $tenantBAuth = @{ email = "owner-b@demo.local"; tenant_id = "tenant-b"; role = "tenant_admin" } | ConvertTo-Json

    $tokenA = (Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/dev-token" -ContentType "application/json" -Body $tenantAAuth).access_token
    $tokenB = (Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/dev-token" -ContentType "application/json" -Body $tenantBAuth).access_token

    $tenantAHeaders = @{ Authorization = "Bearer $tokenA"; "Content-Type" = "application/json" }
    $tenantBHeaders = @{ Authorization = "Bearer $tokenB"; "Content-Type" = "application/json" }

    # Create a device under tenant-a
    $pairReqBody = @{ hardware_id = "HW-TENANT-A-001"; tenant_id = "tenant-a" } | ConvertTo-Json
    $pairReq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/request-code" -Headers @{ "x-device-bootstrap-key" = $BootstrapKey; "Content-Type" = "application/json" } -Body $pairReqBody
    $deviceId = $pairReq.device_id

    $pairConfirmBody = @{ pairing_code = $pairReq.code } | ConvertTo-Json
    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/confirm" -Headers $tenantAHeaders -Body $pairConfirmBody

    # Tenant-b must not access tenant-a device command list.
    $listResp = Invoke-RestMethod -Method Get -Uri "$BaseUrl/commands/devices/$deviceId/commands" -Headers @{ Authorization = "Bearer $tokenB" }
    if (@($listResp.commands).Count -ne 0) {
        throw "Expected empty cross-tenant command list, got count=$(@($listResp.commands).Count)"
    }

    # Tenant-b must not export tenant-a audit data scope (it only sees own tenant records).
    $exportA = Invoke-RestMethod -Method Get -Uri "$BaseUrl/ops/audit/export?kind=pairing&format=json&limit=200" -Headers @{ Authorization = "Bearer $tokenA" }
    $exportB = Invoke-RestMethod -Method Get -Uri "$BaseUrl/ops/audit/export?kind=pairing&format=json&limit=200" -Headers @{ Authorization = "Bearer $tokenB" }

    $tenantAHasDevice = $false
    foreach ($row in $exportA.rows) {
        if ($row.device_id -eq $deviceId) {
            $tenantAHasDevice = $true
            break
        }
    }

    $tenantBLeaksDevice = $false
    foreach ($row in $exportB.rows) {
        if ($row.device_id -eq $deviceId) {
            $tenantBLeaksDevice = $true
            break
        }
    }

    if (-not $tenantAHasDevice) {
        throw "Tenant-A export missing expected device audit rows"
    }

    if ($tenantBLeaksDevice) {
        throw "Tenant-B export leaked tenant-a device audit rows"
    }

    $lines += "## Cross-Tenant Access"
    $lines += "- PASS"
    $lines += "- command list cross-tenant leak count: 0"
    $lines += "- tenant-a audit contains target device: true"
    $lines += "- tenant-b audit leak for target device: false"
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
