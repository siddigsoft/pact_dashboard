// DEPRECATED: This file redirects to ActiveCallScreen (WebRTC-based).
// You can safely replace all JitsiCallScreen references with ActiveCallScreen
// and then delete this file.

import 'package:flutter/material.dart';
import 'calls/active_call_screen.dart';

@Deprecated('Use ActiveCallScreen directly instead')
class JitsiCallScreen extends StatelessWidget {
  final String odId;
  final String odName;
  final String? avatarUrl;
  final bool isVideoCall;
  final bool isIncoming;

  const JitsiCallScreen({
    super.key,
    required this.odId,
    required this.odName,
    this.avatarUrl,
    this.isVideoCall = false,
    this.isIncoming = false,
  });

  @override
  Widget build(BuildContext context) {
    return ActiveCallScreen(
      participantId: odId,
      participantName: odName,
      participantAvatar: avatarUrl,
      isVideoCall: isVideoCall,
    );
  }
}
