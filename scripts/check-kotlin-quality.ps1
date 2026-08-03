$ErrorActionPreference = 'Stop'

$gradlewPath = Join-Path $PSScriptRoot "..\android-player\gradlew.bat"
if (Test-Path $gradlewPath) {
  Push-Location (Join-Path $PSScriptRoot "..\android-player")
  try {
    .\gradlew.bat :app:lintDebug :app:testDebugUnitTest :app:assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }

    Write-Host "Kotlin quality gate passed: Android Lint, unit tests, and debug APK build succeeded."
  }
  finally {
    Pop-Location
  }
  exit 0
}

Write-Error "Android Gradle wrapper not found: $gradlewPath"
