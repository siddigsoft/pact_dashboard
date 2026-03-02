param([string]$Target = "")

# Paths (script lives in scripts\, config lives one level up in project root)
$ROOT    = Join-Path $PSScriptRoot ".."
$PUBSPEC = Join-Path $ROOT "pubspec.yaml"
$VFILE   = Join-Path $ROOT "version.json"

# ── Read version.json ──────────────────────────────────────────────────────
$v = Get-Content $VFILE -Raw | ConvertFrom-Json

$major          = [int]$v.major
$minor          = $v.minor          # e.g. "01"
$build          = [int]$v.build
$buildsPerVer   = [int]$v.buildsPerVersion   # default 9

# ── Auto-increment build ───────────────────────────────────────────────────
$build++

# ── Auto-bump major version every N builds ────────────────────────────────
if ($build -gt $buildsPerVer) {
    $major++
    $build = 1
    Write-Host "" 
    Write-Host "*** VERSION BUMPED → PACT v${major}.${minor} ***" -ForegroundColor Magenta
    Write-Host ""
}

# ── Save updated counters back to version.json ────────────────────────────
$v.major = $major
$v.build = $build
$v | ConvertTo-Json | Set-Content $VFILE

# ── Stamp pubspec.yaml ────────────────────────────────────────────────────
$versionName   = "${major}.${minor}.0"
$fullVersion   = "${versionName}+${build}"
$pubContent    = Get-Content $PUBSPEC -Raw
$pubContent    = $pubContent -replace '(?m)^version: .*', "version: $fullVersion"
Set-Content $PUBSPEC $pubContent -NoNewline

# ── Summary ───────────────────────────────────────────────────────────────
$remaining = $buildsPerVer - $build
Write-Host "[OK] PACT v${major}.${minor}  |  Build $build of $buildsPerVer  |  $remaining build(s) until v$($major+1).${minor}" -ForegroundColor Green

# ── Optional build target ─────────────────────────────────────────────────
switch ($Target.ToLower()) {
    "android"   { Write-Host "[->] Building Android APK..."         -ForegroundColor Cyan; flutter build apk --release }
    "bundle"    { Write-Host "[->] Building Android App Bundle..."  -ForegroundColor Cyan; flutter build appbundle --release }
    "ios"       { Write-Host "[->] Building iOS IPA..."             -ForegroundColor Cyan; flutter build ipa --release }
    "shorebird" { Write-Host "[->] Shorebird patch release..."      -ForegroundColor Cyan; shorebird patch android }
    default     { Write-Host "Tip: add android | bundle | ios | shorebird to also build" -ForegroundColor Yellow }
}
