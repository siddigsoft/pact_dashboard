@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM PACT Mobile — Auto Version Stamper (Windows)
REM Sets version: 1.01.0+<git-commit-count> in pubspec.yaml before every build.
REM Usage:
REM   scripts\set_version.bat           → stamp only
REM   scripts\set_version.bat android   → stamp + build APK
REM   scripts\set_version.bat ios       → stamp + build IPA
REM   scripts\set_version.bat bundle    → stamp + build App Bundle
REM ─────────────────────────────────────────────────────────────────────────────

set VERSION_NAME=1.01.0

REM Get git commit count as build number
for /f %%i in ('git rev-list --count HEAD 2^>nul') do set BUILD_NUMBER=%%i
if "%BUILD_NUMBER%"=="" set BUILD_NUMBER=1

REM Stamp pubspec.yaml using PowerShell
set PUBSPEC=%~dp0..\pubspec.yaml
powershell -Command "(Get-Content '%PUBSPEC%') -replace '^version: .*', 'version: %VERSION_NAME%+%BUILD_NUMBER%' | Set-Content '%PUBSPEC%'"

echo [OK] Version set to PACT v%VERSION_NAME% (build %BUILD_NUMBER%)

REM Optional build target
if "%1"=="android" (
    echo [->] Building Android APK...
    flutter build apk --release
) else if "%1"=="ios" (
    echo [->] Building iOS IPA...
    flutter build ipa --release
) else if "%1"=="bundle" (
    echo [->] Building Android App Bundle...
    flutter build appbundle --release
)
