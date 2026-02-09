// lib/widgets/jitsi_incoming_call_dialog.dart
// DEPRECATED: All calls now use WebRTC directly via incoming_call_overlay.dart.
// This file is kept as a stub for backward compatibility during migration.
// You can safely delete this file after removing all imports referencing it.

import 'package:flutter/material.dart';
import '../services/jitsi_meet_service.dart';

@Deprecated('Use IncomingCallOverlay (WebRTC) directly instead')
class JitsiIncomingCallDialog extends StatelessWidget {
  final JitsiIncomingCall incomingCall;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const JitsiIncomingCallDialog({
    super.key,
    required this.incomingCall,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
