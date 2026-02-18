# Fix build errors script

# Replace WebRTCService with JitsiCallService
$files = @(
    "lib/screens/communications_screen.dart",
    "lib/screens/main_screen.dart",
    "lib/screens/chat_screen.dart",
    "lib/screens/field_operations_enhanced_screen.dart",
    "lib/screens/help_support_screen.dart",
    "lib/screens/field_team_map_screen.dart",
    "lib/widgets/incoming_call_dialog.dart"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace 'WebRTCService\(\)', 'JitsiCallService()'
        $content = $content -replace 'final WebRTCService', 'final JitsiCallService'
        $content = $content -replace 'WebRTCService _webrtcService', 'JitsiCallService _webrtcService'
        $content = $content -replace 'WebRTCService webrtcService', 'JitsiCallService webrtcService'
        $content = $content -replace 'WebRTCService webRtcService', 'JitsiCallService webRtcService'
        Set-Content $file -Value $content -NoNewline
        Write-Host "Fixed $file"
    }
}

# Fix CallScreen parameter names
$callScreenFiles = @(
    "lib/screens/chat_screen.dart",
    "lib/screens/field_operations_enhanced_screen.dart",
    "lib/screens/help_support_screen.dart",
    "lib/screens/communications_screen.dart",
    "lib/widgets/incoming_call_dialog.dart"
)

foreach ($file in $callScreenFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace 'remoteUserName:', 'targetUserName:'
        $content = $content -replace 'remoteUserAvatar:', 'targetUserAvatar:'
        Set-Content $file -Value $content -NoNewline
        Write-Host "Fixed CallScreen parameters in $file"
    }
}

Write-Host "Done!"
