// lib/services/jitsi_meet_service.dart
// DEPRECATED: This file is no longer needed. All calls now use WebRTC directly.
// This file is kept as an empty stub for backward compatibility during migration.
// You can safely delete this file after removing all imports referencing it.

import 'package:flutter/foundation.dart';

@Deprecated('Use WebRTCCallService directly instead')
class JitsiMeetService {
  static final JitsiMeetService _instance = JitsiMeetService._internal();
  factory JitsiMeetService() => _instance;
  JitsiMeetService._internal() {
    debugPrint('[JitsiMeetService] DEPRECATED - Use WebRTCCallService directly');
  }
}
