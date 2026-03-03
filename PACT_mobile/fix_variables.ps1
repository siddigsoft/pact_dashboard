# Fix remaining variable declaration issues

$fixes = @{
    "lib/screens/field_operations_enhanced_screen.dart" = @(
        @{ From = 'final JitsiCallService = JitsiCallService\(\);'; To = 'final jitsiCallService = JitsiCallService();' },
        @{ From = 'webrtcService'; To = 'jitsiCallService' }
    )
    "lib/screens/chat_screen.dart" = @(
        @{ From = 'final JitsiCallService = JitsiCallService\(\);'; To = 'final jitsiCallService = JitsiCallService();' },
        @{ From = 'webrtcService'; To = 'jitsiCallService' }
    )
    "lib/screens/help_support_screen.dart" = @(
        @{ From = 'final JitsiCallService = JitsiCallService\(\);'; To = 'final jitsiCallService = JitsiCallService();' },
        @{ From = 'webRtcService'; To = 'jitsiCallService' }
    )
    "lib/screens/field_team_map_screen.dart" = @(
        @{ From = 'webRtcService'; To = 'jitsiCallService' }
    )
}

foreach ($file in $fixes.Keys) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        foreach ($fix in $fixes[$file]) {
            $content = $content -replace $fix.From, $fix.To
        }
        Set-Content $file -Value $content -NoNewline
        Write-Host "Fixed variable names in $file"
    }
}

Write-Host "Done!"
