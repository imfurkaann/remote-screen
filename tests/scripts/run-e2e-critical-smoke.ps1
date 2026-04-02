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
$report = Join-Path $reportDir "e2e-critical-smoke.md"

$lines = @()
$lines += "# E2E Critical Flow Smoke Report"
$lines += ""
$lines += "- Date: $ReportDate"
$lines += "- Base URL: $BaseUrl"
$lines += ""

try {
    Add-Type -AssemblyName System.Net.Http

    $authBody = @{ email = "e2e@demo.local"; tenant_id = "tenant-demo"; role = "tenant_admin" } | ConvertTo-Json
    $token = (Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/dev-token" -ContentType "application/json" -Body $authBody).access_token
    $headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

    $pairReqBody = @{ hardware_id = "HW-E2E-001"; tenant_id = "tenant-demo" } | ConvertTo-Json
    $pairReq = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/request-code" -Headers @{ "x-device-bootstrap-key" = $BootstrapKey; "Content-Type" = "application/json" } -Body $pairReqBody
    $null = Invoke-RestMethod -Method Post -Uri "$BaseUrl/pairing/confirm" -Headers $headers -Body (@{ pairing_code = $pairReq.code } | ConvertTo-Json)

    $uploadPath = Join-Path $env:TEMP "e2e-smoke-file.txt"
    "E2E_CONTENT" | Set-Content -Path $uploadPath -Encoding utf8

    $uploadUri = "$BaseUrl/content/media/upload"
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $fileBytes = [System.IO.File]::ReadAllBytes($uploadPath)
    $fileContent = New-Object System.Net.Http.ByteArrayContent(,([byte[]]$fileBytes))
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/plain")
    $multipart.Add($fileContent, "file", "e2e-smoke-file.txt")

    $uploadHttpResponse = $httpClient.PostAsync($uploadUri, $multipart).GetAwaiter().GetResult()
    $uploadRaw = $uploadHttpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $uploadHttpResponse.IsSuccessStatusCode) {
        throw "Upload failed with status $($uploadHttpResponse.StatusCode): $uploadRaw"
    }

    $uploadResp = $uploadRaw | ConvertFrom-Json

    $playlistBody = @{
        name = "E2E Playlist"
        items = @(
            @{
                media_id = $uploadResp.media.id
                duration_ms = 5000
                position = 0
            }
        )
    } | ConvertTo-Json -Depth 5
    $playlistResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/content/playlists" -Headers $headers -Body $playlistBody

    $publishBody = @{ device_ids = @($pairReq.device_id) } | ConvertTo-Json
    $publishResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/content/playlists/$($playlistResp.playlist.id)/publish" -Headers $headers -Body $publishBody

    $commandId = "cmd-e2e-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $commandBody = @{
        command_type = "SET_VOLUME"
        command_id = $commandId
        payload = @{ volume = 20 }
        timeout_ms = 5000
        max_attempts = 1
    } | ConvertTo-Json -Depth 5
    $dispatch = Invoke-RestMethod -Method Post -Uri "$BaseUrl/commands/devices/$($pairReq.device_id)/commands" -Headers $headers -Body $commandBody

    $lines += "## Pairing"
    $lines += "- PASS"
    $lines += "- device_id: $($pairReq.device_id)"
    $lines += ""

    $lines += "## Content Sync"
    $lines += "- PASS"
    $lines += "- uploaded_media_id: $($uploadResp.media.id)"
    $lines += "- playlist_id: $($playlistResp.playlist.id)"
    $lines += "- published_device_count: $($publishResp.device_count)"
    $lines += ""

    $lines += "## Remote Command"
    $lines += "- PASS"
    $lines += "- command_status_initial: $($dispatch.command.status)"
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
