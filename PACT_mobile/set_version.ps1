# Create scripts folder
New-Item -ItemType Directory -Force -Path scripts | Out-Null

# Create version.json
@'
{
  "major": 1,
  "minor": "01",
  "build": 0,
  "buildsPerVersion": 9
}
'@ | Set-Content version.json

# Create set_version.ps1
@'
param([string]$Target = "")

$ROOT    = Split-Path -Parent $PSScriptRoot
$PUBSPEC = Join-Path $ROOT "pubspec.yaml"
$VFILE   = Join-Path $ROOT "version.json"

$v             = Get-Content $VFILE -Raw | ConvertFrom-Json
$major         = [int]$v.major
$minor         = $v.minor
$build         = [int]$v.build
$buildsPerVer  = [int]$v.buildsPerVersion

$build++

if ($build -gt $buildsPerVer) {
    $major++
    $build = 1
    Write-Host ""
    Write-Host "*** VERSION BUMPED -> PACT v${major}.${minor} ***" -ForegroundColor Magenta
    Write-Host ""
}

$v.major = $major
$v.build = $build
$v | ConvertTo-Json | Set-Content $VFILE

$fullVersion = "${major}.${minor}.0+${build}"
(Get-Content $PUBSPEC -Raw) -replace '(?m)^version: .*', "version: $fullVersion" | Set-Content $PUBSPEC -NoNewline

$remaining = $buildsPerVer - $build
Write-Host "[OK] PACT v${major}.${minor}  |  Build $build of $buildsPerVer  |  $remaining build(s) until v$($major+1).${minor}" -ForegroundColor Green

switch ($Target.ToLower()) {
    "android"   { flutter build apk --release }
    "bundle"    { flutter build appbundle --release }
    "ios"       { flutter build ipa --release }
    "shorebird" { shorebird patch android }
    default     { Write-Host "Tip: add android | bundle | ios | shorebird to build" -ForegroundColor Yellow }
}
'@ | Set-Content scripts\set_version.ps1

Write-Host "[OK] Files created successfully!" -ForegroundColor Green
Write-Host "     scripts\set_version.ps1" -ForegroundColor White
Write-Host "     version.json" -ForegroundColor White
Write-Host ""
Write-Host "Now run:  .\scripts\set_version.ps1 android" -ForegroundColor Cyan