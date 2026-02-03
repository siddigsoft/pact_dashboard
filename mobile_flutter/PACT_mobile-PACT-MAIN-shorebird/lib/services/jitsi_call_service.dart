// lib/services/jitsi_call_service.dart
// Compatibility layer for JitsiCallService using WebRTC

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'webrtc_service.dart';
import '../models/call_state.dart';

// Re-export CallState as CallStateData for backward compatibility
typedef CallStateData = CallState;

class JitsiCallService {
  static final JitsiCallService _instance = JitsiCallService._internal();
  factory JitsiCallService() => _instance;
  JitsiCallService._internal();

  final WebRTCService _webrtcService = WebRTCService();

  final _callStatusController = StreamController<CallStatus>.broadcast();
  Stream<CallStatus> get callStatusStream => _callStatusController.stream;

  final _callStateController = StreamController<CallState>.broadcast();
  Stream<CallState> get callStateStream => _callStateController.stream;

  final _incomingCallController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get incomingCallStream =>
      _incomingCallController.stream;

  CallStatus _currentStatus = CallStatus.idle;
  CallStatus get currentStatus => _currentStatus;

  CallState _callState = CallState();
  CallState get callState => _callState;
  
  /// Alias for callState to support legacy code
  CallState get currentState => _callState;

  String? _currentCallId;
  String? get currentCallId => _currentCallId;

  Map<String, dynamic>? _currentCallData;
  Map<String, dynamic>? get currentCallData => _currentCallData;

  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;
  bool get isFullyReady => _isInitialized;

  StreamSubscription<CallState>? _webrtcStateSubscription;

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

    _webrtcStateSubscription = _webrtcService.callStateStream.listen((state) {
      _callState = state;
      _currentStatus = state.status;
      _callStateController.add(state);
      _callStatusController.add(state.status);
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
    _currentCallData = {
      'targetUserId': targetUserId,
      'targetUserName': targetUserName,
      'targetUserAvatar': targetUserAvatar,
      'isVideo': isVideo,
    };

    final success = await _webrtcService.initiateCall(
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      targetUserAvatar: targetUserAvatar,
      isAudioOnly: isAudioOnly,
    );

    if (success) {
      _currentCallId = _webrtcService.callState.callId;
    }

    return success;
  }

  Future<void> answerCall({
    required String callId,
    required String callerId,
    String? callerName,
    String? callerAvatar,
    bool isVideo = false,
    bool isAudioOnly = true,
  }) async {
    _currentCallData = {
      'targetUserId': callerId,
      'targetUserName': callerName,
      'targetUserAvatar': callerAvatar,
      'isVideo': isVideo,
    };
    _currentCallId = callId;

    await _webrtcService.answerCall();
  }

  Future<void> endCall() async {
    await _webrtcService.endCall();
    _currentCallId = null;
    _currentCallData = null;
  }

  Future<void> rejectCall() async {
    await _webrtcService.rejectCall();
    _currentCallId = null;
    _currentCallData = null;
  }

  Future<void> toggleMute() async {
    await _webrtcService.toggleMute();
  }

  Future<void> toggleSpeaker() async {
    await _webrtcService.toggleSpeaker();
  }

  Future<void> toggleVideo() async {
    await _webrtcService.toggleVideo();
  }

  Future<void> toggleHold() async {
    await _webrtcService.toggleHold();
  }

  void setCallNotes(String notes) {
    _webrtcService.setCallNotes(notes);
  }

  Future<void> switchCamera() async {
    await _webrtcService.switchCamera();
  }

  void dispose() {
    _webrtcStateSubscription?.cancel();
    _callStatusController.close();
    _callStateController.close();
    _incomingCallController.close();
  }

  void _updateStatus(CallStatus status) {
    _currentStatus = status;
    _callState = _callState.copyWith(status: status);
    _callStatusController.add(status);
    _callStateController.add(_callState);
  }
}
