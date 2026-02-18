import 'dart:async';
import 'package:flutter/foundation.dart';
import 'webrtc_call_service.dart' as webrtc;
import '../models/call_state.dart';

// Use CallState instead of CallStateData, or alias it for backward compatibility
typedef CallStateData = CallState;

class JitsiCallService {
  static final JitsiCallService _instance = JitsiCallService._internal();
  factory JitsiCallService() => _instance;
  JitsiCallService._internal();

  final webrtc.WebRTCCallService _webrtcService = webrtc.WebRTCCallService();

  final _callStatusController = StreamController<CallStatus>.broadcast();
  Stream<CallStatus> get callStatusStream => _callStatusController.stream;

  final _callStateController = StreamController<CallStateData>.broadcast();
  Stream<CallStateData> get callStateStream => _callStateController.stream;

  final _incomingCallController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get incomingCallStream =>
      _incomingCallController.stream;

  CallStatus _currentStatus = CallStatus.idle;
  CallStatus get currentStatus => _currentStatus;

  CallStateData _callState = CallStateData(status: CallStatus.idle);
  CallStateData get callState => _callState;

  String? _currentCallId;
  String? get currentCallId => _currentCallId;

  Map<String, dynamic>? _currentCallData;
  Map<String, dynamic>? get currentCallData => _currentCallData;

  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;
  bool get isFullyReady => _isInitialized;

  Future<void> initialize(
    String odId,
    String userName, [
    String? userAvatar,
  ]) async {
    if (_isInitialized) return;

    await _webrtcService.initialize(
      userId: odId,
      userName: userName,
      userAvatar: userAvatar,
    );

    _webrtcService.callStateStream.listen((state) {
      CallStatus status;
      switch (state) {
        case webrtc.CallState.idle:
          status = CallStatus.idle;
          break;
        case webrtc.CallState.outgoing:
        case webrtc.CallState.incoming:
          status = CallStatus.ringing;
          break;
        case webrtc.CallState.connecting:
          status = CallStatus.calling;
          break;
        case webrtc.CallState.connected:
          status = CallStatus.connected;
          break;
        case webrtc.CallState.ended:
          status = CallStatus.ended;
          break;
      }
      _updateStatus(status);
    });

    _webrtcService.incomingCallStream.listen((signal) {
      _currentCallData = {
        'targetUserId': signal.from,
        'targetUserName': signal.fromName,
        'targetUserAvatar': signal.fromAvatar,
        'isVideo': !(signal.isAudioOnly ?? true),
      };
      _currentCallId = signal.callId;
      _incomingCallController.add({
        'callerId': signal.from,
        'callerName': signal.fromName,
        'callerAvatar': signal.fromAvatar,
        'callId': signal.callId,
        'isVideoCall': !(signal.isAudioOnly ?? true),
      });
    });

    _isInitialized = true;
    debugPrint(
      '[JitsiCallService] Compatibility layer initialized (using WebRTC)',
    );
  }

  Future<bool> startCall({
    required String odId,
    required String targetUserId,
    required String targetUserName,
    String? targetUserAvatar,
    bool isVideo = false,
    bool isAudioOnly = true,
  }) async {
    final success = await _webrtcService.initiateCall(
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      targetUserAvatar: targetUserAvatar,
      isAudioOnly: isAudioOnly,
    );

    if (success) {
      _currentCallId = _webrtcService.currentCallId;
      _currentCallData = {
        'targetUserId': targetUserId,
        'targetUserName': targetUserName,
        'targetUserAvatar': targetUserAvatar,
        'isVideo': !isAudioOnly,
      };
    }

    return success;
  }

  Future<bool> initiateCall(
    String targetUserId,
    String targetUserName, {
    String? targetUserAvatar,
    bool isVideoCall = false,
    bool isAudioOnly = true,
  }) async {
    return startCall(
      odId: '',
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      targetUserAvatar: targetUserAvatar,
      isVideo: !isAudioOnly,
      isAudioOnly: isAudioOnly,
    );
  }

  Future<void> acceptCall() async {
    await _webrtcService.acceptCall();
  }

  Future<void> answerCall({bool videoEnabled = false}) async {
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

  void updateCallNotes(String notes) {
    // Implementation
  }

  Future<void> switchCamera() async {
    // Implementation
  }

  Future<void> toggleVideo() async {
    // Implementation
  }

  Future<void> toggleHold() async {
    // Implementation
  }

  Future<void> toggleRecording() async {
    // Implementation
  }

  Future<void> forceResetIfNotInActiveCall() async {
    // Implementation
  }

  Stream<String> get errorStream {
    // Implementation
    return Stream.empty();
  }

  bool get isSignalingReady {
    // Implementation
    return false;
  }

  void _updateStatus(CallStatus status) {
    _currentStatus = status;
    _callState = CallStateData(
      status: status,
      callId: _currentCallId,
      remoteUserId: _currentCallData?['targetUserId'] as String?,
      remoteUserName: _currentCallData?['targetUserName'] as String?,
      callToken: _currentCallId,
      isAudioOnly: !(_currentCallData?['isVideo'] == true),
    );
    _callStatusController.add(status);
    _callStateController.add(_callState);
  }

  Future<void> dispose() async {
    await _webrtcService.dispose();
    await _callStatusController.close();
    await _callStateController.close();
    await _incomingCallController.close();
  }
}
