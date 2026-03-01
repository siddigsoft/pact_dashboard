param(
    [string]$Target = ""
)

$VERSION_NAME = "1.01.0"
$PUBSPEC = Join-Path $PSScriptRoot "..\pubspec.yaml"

# Auto build number from git commit count
$BUILD_NUMBER = & git rev-list --count HEAD 2>$null
if (-not $BUILD_NUMBER) { $BUILD_NUMBER = "1" }
$BUILD_NUMBER = $BUILD_NUMBER.Trim()

# Stamp pubspec.yaml
$content = Get-Content $PUBSPEC -Raw
$content = $content -replace '(?m)^version: .*', "version: ${VERSION_NAME}+${BUILD_NUMBER}"
Set-Content $PUBSPEC $content -NoNewline

Write-Host "[OK] Version set to PACT v$VERSION_NAME (build $BUILD_NUMBER)" -ForegroundColor Green

switch ($Target.ToLower()) {
    "android" {
        Write-Host "[->] Building Android APK..." -ForegroundColor Cyan
        flutter build apk --release
    }
    "bundle" {
        Write-Host "[->] Building Android App Bundle..." -ForegroundColor Cyan
        flutter build appbundle --release
    }
    "ios" {
        Write-Host "[->] Building iOS IPA..." -ForegroundColor Cyan
        flutter build ipa --release
    }
    "shorebird" {
        Write-Host "[->] Shorebird patch release..." -ForegroundColor Cyan
        shorebird patch android
    }
    default {
        Write-Host "Usage: .\scripts\set_version.ps1 [android|bundle|ios|shorebird]" -ForegroundColor Yellow
    }
}
