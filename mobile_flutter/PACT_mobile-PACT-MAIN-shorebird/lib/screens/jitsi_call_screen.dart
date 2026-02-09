// lib/screens/jitsi_call_screen.dart
// DEPRECATED: All calls now use WebRTC directly via call_screen.dart.
// This file is kept as a stub for backward compatibility during migration.
// You can safely delete this file after removing all imports referencing it.

import 'package:flutter/material.dart';
import 'call_screen.dart';

@Deprecated('Use CallScreen (WebRTC) directly instead')
class JitsiCallScreen extends StatelessWidget {
  final String roomName;
  final String serverUrl;
  final String? remoteUserName;
  final String? remoteUserAvatar;
  final bool isAudioOnly;
  final bool isOutgoing;

  const JitsiCallScreen({
    super.key,
    required this.roomName,
    required this.serverUrl,
    this.remoteUserName,
    this.remoteUserAvatar,
    this.isAudioOnly = false,
    this.isOutgoing = true,
  });

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text(
          'Jitsi Meet has been removed.\nPlease use the WebRTC call system.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16),
        ),
      ),
    );
  }
}
