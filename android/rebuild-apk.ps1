# PowerShell script to rebuild web app and create Android APK
# Run this from the android directory

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "PACT Dashboard - APK Build Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Navigate to parent directory
Write-Host "[1/4] Navigating to project root..." -ForegroundColor Yellow
Set-Location ..

# Step 2: Build the web app
Write-Host "[2/4] Building web application..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web build failed!" -ForegroundColor Red
    exit 1
}

# Step 3: Sync to Android
Write-Host "[3/4] Syncing web assets to Android..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Capacitor sync failed!" -ForegroundColor Red
    exit 1
}

# Step 4: Build Android APK
Write-Host "[4/4] Building Android APK..." -ForegroundColor Yellow
Set-Location android
.\gradlew.bat assembleRelease

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "SUCCESS! APK built successfully!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your APK files are located at:" -ForegroundColor Cyan
    Write-Host "android\app\build\outputs\apk\release\" -ForegroundColor White
    Write-Host ""
    Write-Host "Files:" -ForegroundColor Cyan
    Get-ChildItem "app\build\outputs\apk\release\*.apk" | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.Name) ($size MB)" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "ERROR: Android build failed!" -ForegroundColor Red
    exit 1
}

