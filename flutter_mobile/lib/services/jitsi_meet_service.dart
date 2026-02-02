import 'dart:async';
import 'package:flutter/foundation.dart';
import 'webrtc_call_service.dart';

class JitsiMeetService {
  static final JitsiMeetService _instance = JitsiMeetService._internal();
  factory JitsiMeetService() => _instance;
  JitsiMeetService._internal();

  final WebRTCCallService _webrtcService = WebRTCCallService();

  bool _isInMeeting = false;
  bool get isInMeeting => _isInMeeting;

  String? _currentRoomName;
  String? get currentRoomName => _currentRoomName;

  final _meetingStatusController = StreamController<bool>.broadcast();
  Stream<bool> get meetingStatusStream => _meetingStatusController.stream;

  Future<void> joinMeeting({
    required String roomName,
    required String displayName,
    String? email,
    String? avatarUrl,
    bool audioMuted = false,
    bool videoMuted = true,
  }) async {
    debugPrint('[JitsiMeetService] joinMeeting called - using WebRTC instead');
    debugPrint('[JitsiMeetService] Room: $roomName, User: $displayName');
    
    _currentRoomName = roomName;
    _isInMeeting = true;
    _meetingStatusController.add(true);
  }

  Future<void> leaveMeeting() async {
    await _webrtcService.endCall();
    _isInMeeting = false;
    _currentRoomName = null;
    _meetingStatusController.add(false);
  }

  Future<void> toggleAudio() async {
    _webrtcService.toggleMute();
  }

  Future<void> toggleVideo() async {
    _webrtcService.toggleVideo();
  }

  Future<void> dispose() async {
    await _meetingStatusController.close();
  }
}
