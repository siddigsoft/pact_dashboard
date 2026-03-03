param([string]$Target = "")
$v = "1.01.0"
$b = (git rev-list --count HEAD).Trim()
if (-not $b) { $b = "1" }
(Get-Content pubspec.yaml -Raw) -replace '(?m)^version: .*',"version: ${v}+${b}" | Set-Content pubspec.yaml -NoNewline
Write-Host "[OK] PACT v$v (build $b)" -ForegroundColor Green
switch ($Target.ToLower()) {
    "android" { flutter build apk --release }
    "bundle"  { flutter build appbundle --release }
    "ios"     { flutter build ipa --release }
    "shorebird" { shorebird patch android }
    default   { Write-Host "Done. Add: android / bundle / ios / shorebird" -ForegroundColor Yellow }
}
