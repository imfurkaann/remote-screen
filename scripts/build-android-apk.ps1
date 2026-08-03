param(
    [string]$BackendBaseUrl,
    [string]$BootstrapKey
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$composePath = Join-Path $repoRoot "docker-compose.yml"
$composeText = [IO.File]::ReadAllText($composePath)

if ([string]::IsNullOrWhiteSpace($BackendBaseUrl)) {
    $urlMatch = [regex]::Match(
        $composeText,
        '(?m)^\s*NEXT_PUBLIC_BACKEND_SOCKET_URL:\s*(?<value>\S+)\s*$'
    )
    if (-not $urlMatch.Success) {
        throw "Public backend URL was not found in docker-compose.yml. Pass -BackendBaseUrl explicitly."
    }
    $BackendBaseUrl = $urlMatch.Groups['value'].Value.Trim()
}

if ([string]::IsNullOrWhiteSpace($BootstrapKey)) {
    $keyMatch = [regex]::Match(
        $composeText,
        '(?m)^\s*-\s*DEVICE_BOOTSTRAP_KEY=(?<value>\S+)\s*$'
    )
    if (-not $keyMatch.Success -or $keyMatch.Groups['value'].Value.Contains('${')) {
        throw "A literal bootstrap key was not found in docker-compose.yml. Pass -BootstrapKey explicitly."
    }
    $BootstrapKey = $keyMatch.Groups['value'].Value.Trim()
}

if (-not $BackendBaseUrl.StartsWith('http://') -and -not $BackendBaseUrl.StartsWith('https://')) {
    throw "BackendBaseUrl must start with http:// or https://."
}
if ($BootstrapKey.Length -lt 32) {
    throw "BootstrapKey must contain at least 32 characters."
}

$androidRoot = Join-Path $repoRoot "android-player"
$gradle = Join-Path $androidRoot "gradlew.bat"
Push-Location $androidRoot
try {
    & $gradle "-PBACKEND_BASE_URL=$BackendBaseUrl" "-PBOOTSTRAP_KEY=$BootstrapKey" clean assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}

$buildConfig = Join-Path $androidRoot "app\build\generated\source\buildConfig\debug\com\signage\player\BuildConfig.java"
$generated = [IO.File]::ReadAllText($buildConfig)
if (-not $generated.Contains("BACKEND_BASE_URL = `"$BackendBaseUrl`"")) {
    throw "Generated APK backend URL verification failed."
}
if (-not $generated.Contains("BOOTSTRAP_KEY = `"$BootstrapKey`"")) {
    throw "Generated APK bootstrap key verification failed."
}

$sourceApk = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"
$targetApk = Join-Path $repoRoot "app-debug.apk"
Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force

$sha = [Security.Cryptography.SHA256]::Create()
$keyHash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($BootstrapKey)))).Replace('-', '').ToLower()
$apkHash = (Get-FileHash -LiteralPath $targetApk -Algorithm SHA256).Hash

Write-Host "APK ready: $targetApk"
Write-Host "Backend URL: $BackendBaseUrl"
Write-Host "Bootstrap fingerprint: $($keyHash.Substring(0, 12))"
Write-Host "APK SHA-256: $apkHash"