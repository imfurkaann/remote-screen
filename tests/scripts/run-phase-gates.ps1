param(
    [string]$ReportDate = "2026-04-01"
)

$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
$reportDir = Join-Path $root ("tests/reports/" + $ReportDate)

New-Item -Path $reportDir -ItemType Directory -Force | Out-Null

function Run-And-Capture {
    param(
        [string]$Name,
        [string]$Command
    )

    $logPath = Join-Path $reportDir ($Name + ".log")
    "# " + $Name + " - " + (Get-Date).ToString("s") | Out-File -FilePath $logPath -Encoding utf8
    "`n$ " + $Command + "`n" | Out-File -FilePath $logPath -Encoding utf8 -Append

    cmd /c $Command *>&1 | Tee-Object -FilePath $logPath -Append | Out-Null
    return $LASTEXITCODE
}

Push-Location $root

$lintExit = Run-And-Capture -Name "01-lint" -Command "npm run lint"
$testExit = Run-And-Capture -Name "02-test" -Command "npm run test"
$buildExit = Run-And-Capture -Name "03-build" -Command "npm run build"
$kotlinExit = Run-And-Capture -Name "04-kotlin" -Command "npm run check:kotlin"

$summaryPath = Join-Path $reportDir "summary.md"
@"
# Phase Gate Test Summary

- Date: $ReportDate
- Generated At: $(Get-Date -Format s)

## Command Results

- lint: $(if ($lintExit -eq 0) { "PASS" } else { "FAIL ($lintExit)" })
- test: $(if ($testExit -eq 0) { "PASS" } else { "FAIL ($testExit)" })
- build: $(if ($buildExit -eq 0) { "PASS" } else { "FAIL ($buildExit)" })
- check:kotlin: $(if ($kotlinExit -eq 0) { "PASS" } else { "FAIL ($kotlinExit)" })

## Log Files

- 01-lint.log
- 02-test.log
- 03-build.log
- 04-kotlin.log

## Gate Decision

$(if (($lintExit -eq 0) -and ($testExit -eq 0) -and ($buildExit -eq 0) -and ($kotlinExit -eq 0)) { "PASS" } else { "BLOCKED" })
"@ | Out-File -FilePath $summaryPath -Encoding utf8

Pop-Location

if (($lintExit -eq 0) -and ($testExit -eq 0) -and ($buildExit -eq 0) -and ($kotlinExit -eq 0)) {
    exit 0
}

exit 1
