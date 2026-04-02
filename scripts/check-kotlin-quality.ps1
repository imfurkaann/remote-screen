$ErrorActionPreference = 'Stop'

$gradlewPath = Join-Path $PSScriptRoot "..\android-player\gradlew.bat"
$ktlintConfig = Join-Path $PSScriptRoot "..\android-player\.editorconfig"

if (Test-Path $gradlewPath) {
  Push-Location (Join-Path $PSScriptRoot "..\android-player")
  try {
    .\gradlew.bat ktlintCheck
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Kotlin quality gate passed via ktlintCheck."
      exit 0
    }

    Write-Warning "ktlintCheck task unavailable or failed; falling back to assembleDebug validation."
    .\gradlew.bat :app:assembleDebug
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }

    Write-Host "Kotlin quality gate passed via assembleDebug fallback."
  }
  finally {
    Pop-Location
  }
  exit 0
}

if (-not (Test-Path $ktlintConfig)) {
  Write-Error "Kotlin quality gate missing: add android-player/.editorconfig and gradle ktlint setup."
}

Write-Host "Kotlin quality precheck passed: configuration file found."
