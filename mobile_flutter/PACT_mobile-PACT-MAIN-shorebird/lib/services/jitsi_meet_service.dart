// lib/services/jitsi_meet_service.dart
// DEPRECATED: All calls now use WebRTC directly. Jitsi Meet integration has been removed.
// This file is kept as a stub for backward compatibility during migration.
// You can safely delete this file after removing all imports referencing it.

import 'dart:async';
import 'package:flutter/foundation.dart';

@Deprecated('Use WebRTCService directly instead. Jitsi Meet has been removed.')
class JitsiMeetService {
  static final JitsiMeetService _instance = JitsiMeetService._internal();
  factory JitsiMeetService() => _instance;
  JitsiMeetService._internal() {
    debugPrint('[JitsiMeetService] DEPRECATED - Use WebRTCService directly');
  }

  Future<void> initialize({
    required String userId,
    required String userName,
    String? userAvatar,
    String? userEmail,
    String? customServerUrl,
  }) async {
    debugPrint('[JitsiMeetService] DEPRECATED - calls now use WebRTC');
  }

  bool get isInCall => false;
  String? get currentRoomName => null;
  String get serverUrl => '';
  String? get remoteUserName => null;
  String? get remoteUserAvatar => null;

  void dispose() {}
}

@Deprecated('Use WebRTC call state instead')
enum JitsiCallStatus {
  idle,
  calling,
  ringing,
  accepted,
  connected,
  ended,
  rejected,
  busy,
  failed,
}

@Deprecated('Use WebRTC CallState instead')
class JitsiCallState {
  final JitsiCallStatus status;
  final String? roomName;
  final String? remoteUserName;
  final String? error;
  
  JitsiCallState({
    this.status = JitsiCallStatus.idle,
    this.roomName,
    this.remoteUserName,
    this.error,
  });
}

@Deprecated('Use WebRTC incoming call handling instead')
class JitsiIncomingCall {
  final String callId;
  final String roomName;
  final String callerId;
  final String callerName;
  final String? callerAvatar;
  final bool isAudioOnly;
  
  JitsiIncomingCall({
    required this.callId,
    required this.roomName,
    required this.callerId,
    required this.callerName,
    this.callerAvatar,
    this.isAudioOnly = false,
  });
}

@Deprecated('Use WebRTC call result instead')
class JitsiCallResult {
  final bool success;
  final String? roomName;
  final String? serverUrl;
  final String? error;
  
  JitsiCallResult({
    required this.success,
    this.roomName,
    this.serverUrl,
    this.error,
  });
  
  String get meetingUrl => '$serverUrl/$roomName';
}
