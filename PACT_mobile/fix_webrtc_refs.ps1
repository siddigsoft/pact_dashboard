# Comprehensive fix for all compilation errors

Write-Host "Fixing call_screen.dart imports and WebRTC references..."

# Fix call_screen.dart - remove flutter_webrtc and webrtc_service imports
$callScreen = "lib/screens/call_screen.dart"
if (Test-Path $callScreen) {
    $content = Get-Content $callScreen -Raw
    $content = $content -replace "import 'package:flutter_webrtc/flutter_webrtc\.dart';`r?`n", ""
    $content = $content -replace "import '\.\./services/webrtc_service\.dart';", "import '../services/jitsi_call_service.dart';"
    $content = $content -replace 'final WebRTCService _webrtcService = WebRTCService\(\);', 'final JitsiCallService _callService = JitsiCallService();'
    $content = $content -replace '_webrtcService', '_callService'
    $content = $content -replace 'final RTCVideoRenderer _localRenderer = RTCVideoRenderer\(\);`r?`n', ''
    $content = $content -replace 'final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer\(\);`r?`n', ''
    $content = $content -replace 'StreamSubscription<MediaStream\?>\? _localStreamSubscription;`r?`n', ''
    $content = $content -replace 'StreamSubscription<MediaStream\?>\? _remoteStreamSubscription;`r?`n', ''
    Set-Content $callScreen -Value $content -NoNewline
    Write-Host "Fixed $callScreen"
}

# Fix communications_screen.dart
$commsScreen = "lib/screens/communications_screen.dart"
if (Test-Path $commsScreen) {
    $content = Get-Content $commsScreen -Raw
    $content = $content -replace "import '\.\./services/webrtc_service\.dart';", "import '../services/jitsi_call_service.dart';"
    $content = $content -replace 'final WebRTCService _webrtcService = WebRTCService\(\);', 'final JitsiCallService _webrtcService = JitsiCallService();'
    $content = $content -replace 'WebRTCService _webrtcService', 'JitsiCallService _webrtcService'
    Set-Content $commsScreen -Value $content -NoNewline
    Write-Host "Fixed $commsScreen"
}

# Fix field_team_map_screen.dart
$fieldTeamScreen = "lib/screens/field_team_map_screen.dart"
if (Test-Path $fieldTeamScreen) {
    $content = Get-Content $fieldTeamScreen -Raw
    $content = $content -replace "import '\.\./services/webrtc_service\.dart';", "import '../services/jitsi_call_service.dart';"
    $content = $content -replace 'WebRTCService\(\)', 'JitsiCallService()'
    $content = $content -replace 'WebRTCService webRtcService', 'JitsiCallService webRtcService'
    $content = $content -replace 'final webRtcService = WebRTCService\(\);', 'final webRtcService = JitsiCallService();'
    Set-Content $fieldTeamScreen -Value $content -NoNewline
    Write-Host "Fixed $fieldTeamScreen"
}

Write-Host "All files fixed!"
