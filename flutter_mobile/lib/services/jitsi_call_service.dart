import 'dart:async';
import 'package:flutter/foundation.dart';
import 'webrtc_call_service.dart';
import '../models/call_state.dart';

class JitsiCallService {
  static final JitsiCallService _instance = JitsiCallService._internal();
  factory JitsiCallService() => _instance;
  JitsiCallService._internal();

  final WebRTCCallService _webrtcService = WebRTCCallService();

  final _callStatusController = StreamController<CallStatus>.broadcast();
  Stream<CallStatus> get callStatusStream => _callStatusController.stream;
  
  final _incomingCallController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get incomingCallStream => _incomingCallController.stream;

  CallStatus _currentStatus = CallStatus.idle;
  CallStatus get currentStatus => _currentStatus;

  String? _currentCallId;
  String? get currentCallId => _currentCallId;

  Map<String, dynamic>? _currentCallData;
  Map<String, dynamic>? get currentCallData => _currentCallData;

  bool _isInitialized = false;

  Future<void> initialize({
    required String odId,
    required String userName,
    String? userAvatar,
  }) async {
    if (_isInitialized) return;

    await _webrtcService.initialize(
      userId: odId,
      userName: userName,
      userAvatar: userAvatar,
    );

    _webrtcService.callStateStream.listen((state) {
      switch (state) {
        case CallState.idle:
          _updateStatus(CallStatus.idle);
          break;
        case CallState.outgoing:
        case CallState.incoming:
          _updateStatus(CallStatus.ringing);
          break;
        case CallState.connecting:
        case CallState.connected:
          _updateStatus(CallStatus.inProgress);
          break;
        case CallState.ended:
          _updateStatus(CallStatus.ended);
          break;
      }
    });

    _webrtcService.incomingCallStream.listen((signal) {
      _incomingCallController.add({
        'callerId': signal.from,
        'callerName': signal.fromName,
        'callerAvatar': signal.fromAvatar,
        'callId': signal.callId,
        'isVideoCall': !(signal.isAudioOnly ?? true),
      });
    });

    _isInitialized = true;
    debugPrint('[JitsiCallService] Compatibility layer initialized (using WebRTC)');
  }

  Future<bool> startCall({
    required String odId,
    required String targetUserId,
    required String targetUserName,
    String? targetUserAvatar,
    bool isVideo = false,
  }) async {
    final success = await _webrtcService.initiateCall(
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      targetUserAvatar: targetUserAvatar,
      isAudioOnly: !isVideo,
    );

    if (success) {
      _currentCallId = _webrtcService.currentCallId;
      _currentCallData = {
        'targetUserId': targetUserId,
        'targetUserName': targetUserName,
        'targetUserAvatar': targetUserAvatar,
        'isVideo': isVideo,
      };
    }

    return success;
  }

  Future<bool> initiateCall({
    required String targetUserId,
    required String targetUserName,
    String? targetUserAvatar,
    bool isVideoCall = false,
  }) async {
    return startCall(
      odId: '',
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      targetUserAvatar: targetUserAvatar,
      isVideo: isVideoCall,
    );
  }

  Future<void> acceptCall() async {
    await _webrtcService.acceptCall();
  }

  Future<void> rejectCall() async {
    await _webrtcService.rejectCall();
    _currentCallId = null;
    _currentCallData = null;
  }

  Future<void> endCall() async {
    await _webrtcService.endCall();
    _currentCallId = null;
    _currentCallData = null;
  }

  Future<void> hangUp() async {
    await endCall();
  }

  void toggleMute() {
    _webrtcService.toggleMute();
  }

  void toggleSpeaker() {
    _webrtcService.toggleSpeaker();
  }

  void toggleVideo() {
    _webrtcService.toggleVideo();
  }

  bool get isMuted => _webrtcService.isMuted;
  bool get isVideoEnabled => _webrtcService.isVideoEnabled;

  void _updateStatus(CallStatus status) {
    _currentStatus = status;
    _callStatusController.add(status);
  }

  Future<void> dispose() async {
    await _webrtcService.dispose();
    await _callStatusController.close();
    await _incomingCallController.close();
  }
}
