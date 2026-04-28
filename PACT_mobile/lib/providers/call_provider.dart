import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/webrtc_call_service.dart';
import '../services/background_call_handler.dart';
import '../services/call_notification_service.dart';

final callServiceProvider = Provider<WebRTCCallService>((ref) {
  return WebRTCCallService();
});

final backgroundCallHandlerProvider = Provider<BackgroundCallHandler>((ref) {
  return BackgroundCallHandler();
});

class CallStateNotifier extends StateNotifier<CallStateData> {
  final WebRTCCallService _callService;
  final BackgroundCallHandler _backgroundHandler;

  StreamSubscription? _callStateSubscription;
  StreamSubscription? _remoteParticipantSubscription;
  StreamSubscription? _remoteStreamSubscription;
  StreamSubscription? _localStreamSubscription;
  StreamSubscription? _incomingCallSubscription;
  StreamSubscription? _backgroundCallSubscription;

  CallStateNotifier(this._callService, this._backgroundHandler)
    : super(CallStateData()) {
    _setupListeners();
  }

  void _setupListeners() {
    _callStateSubscription = _callService.callStateStream.listen((callState) {
      state = state.copyWith(callState: callState);

      if (callState == CallState.connected) {
        if (state.incomingCallId != null) {
          CallNotificationService().dismissIncomingCallNotification(
            state.incomingCallId!,
          );
        } else {
          CallNotificationService().dismissAllIncomingCallNotifications();
        }
      }
    });

    _remoteParticipantSubscription = _callService.remoteParticipantStream
        .listen((participant) {
          state = state.copyWith(remoteParticipant: participant);
        });

    _remoteStreamSubscription = _callService.remoteStreamStream.listen((
      stream,
    ) {
      state = state.copyWith(remoteStream: stream);
    });

    _localStreamSubscription = _callService.localStreamStream.listen((stream) {
      state = state.copyWith(localStream: stream);
    });

    _incomingCallSubscription = _callService.incomingCallStream.listen((
      signal,
    ) {
      state = state.copyWith(
        callState: CallState.incoming,
        incomingCallerId: signal.from,
        incomingCallerName: signal.fromName,
        incomingCallerAvatar: signal.fromAvatar,
        isAudioOnly: signal.isAudioOnly ?? true,
      );
    });

    _backgroundCallSubscription = _backgroundHandler.incomingCallStream.listen((
      payload,
    ) {
      final fromName = payload['fromName'] as String? ?? 'Unknown';
      final from = payload['from'] as String? ?? '';
      final fromAvatar = payload['fromAvatar'] as String?;
      final isAudioOnly = payload['isAudioOnly'] as bool? ?? true;
      final callId = payload['callId'] as String?;

      state = state.copyWith(
        callState: CallState.incoming,
        incomingCallerId: from,
        incomingCallerName: fromName,
        incomingCallerAvatar: fromAvatar,
        isAudioOnly: isAudioOnly,
        incomingCallId: callId,
      );
    });
  }

  Future<void> initialize({
    required String userId,
    required String userName,
    String? userAvatar,
  }) async {
    await _callService.initialize(
      userId: userId,
      userName: userName,
      userAvatar: userAvatar,
    );

    await _backgroundHandler.initialize(userId: userId, userName: userName);

    state = state.copyWith(isInitialized: true);
  }

  Future<bool> initiateCall({
    required String targetUserId,
    required String targetUserName,
    String? targetUserAvatar,
    bool isAudioOnly = true,
  }) async {
    final success = await _callService.initiateCall(
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      targetUserAvatar: targetUserAvatar,
      isAudioOnly: isAudioOnly,
    );

    if (success) {
      state = state.copyWith(isAudioOnly: isAudioOnly);
    }

    return success;
  }

  Future<void> acceptCall() async {
    if (state.incomingCallId != null) {
      await CallNotificationService().dismissIncomingCallNotification(
        state.incomingCallId!,
      );
    } else {
      await CallNotificationService().dismissAllIncomingCallNotifications();
    }
    await _callService.acceptCall();
  }

  Future<void> rejectCall() async {
    if (state.incomingCallId != null) {
      await CallNotificationService().dismissIncomingCallNotification(
        state.incomingCallId!,
      );
    } else {
      await CallNotificationService().dismissAllIncomingCallNotifications();
    }
    await _callService.rejectCall();

    if (state.incomingCallerId != null && state.incomingCallerName != null) {
      await _backgroundHandler.showMissedCall(
        state.incomingCallerId!,
        state.incomingCallerName!,
      );
    }

    _resetState();
  }

  Future<void> endCall() async {
    await _callService.endCall();
    _resetState();
  }

  void toggleMute() {
    _callService.toggleMute();
    state = state.copyWith(isMuted: _callService.isMuted);
  }

  void toggleSpeaker() {
    _callService.toggleSpeaker();
    state = state.copyWith(isSpeakerOn: !state.isSpeakerOn);
  }

  void toggleVideo() {
    _callService.toggleVideo();
    state = state.copyWith(isVideoEnabled: _callService.isVideoEnabled);
  }

  void _resetState() {
    state = CallStateData(isInitialized: state.isInitialized);
  }

  @override
  void dispose() {
    _callStateSubscription?.cancel();
    _remoteParticipantSubscription?.cancel();
    _remoteStreamSubscription?.cancel();
    _localStreamSubscription?.cancel();
    _incomingCallSubscription?.cancel();
    _backgroundCallSubscription?.cancel();
    super.dispose();
  }
}

class CallStateData {
  final CallState callState;
  final CallParticipant? remoteParticipant;
  final MediaStream? remoteStream;
  final MediaStream? localStream;
  final bool isMuted;
  final bool isSpeakerOn;
  final bool isVideoEnabled;
  final bool isAudioOnly;
  final bool isInitialized;
  final String? incomingCallerId;
  final String? incomingCallerName;
  final String? incomingCallerAvatar;
  final String? incomingCallId;

  CallStateData({
    this.callState = CallState.idle,
    this.remoteParticipant,
    this.remoteStream,
    this.localStream,
    this.isMuted = false,
    this.isSpeakerOn = true,
    this.isVideoEnabled = false,
    this.isAudioOnly = true,
    this.isInitialized = false,
    this.incomingCallerId,
    this.incomingCallerName,
    this.incomingCallerAvatar,
    this.incomingCallId,
  });

  CallStateData copyWith({
    CallState? callState,
    CallParticipant? remoteParticipant,
    MediaStream? remoteStream,
    MediaStream? localStream,
    bool? isMuted,
    bool? isSpeakerOn,
    bool? isVideoEnabled,
    bool? isAudioOnly,
    bool? isInitialized,
    String? incomingCallerId,
    String? incomingCallerName,
    String? incomingCallerAvatar,
    String? incomingCallId,
  }) {
    return CallStateData(
      callState: callState ?? this.callState,
      remoteParticipant: remoteParticipant ?? this.remoteParticipant,
      remoteStream: remoteStream ?? this.remoteStream,
      localStream: localStream ?? this.localStream,
      isMuted: isMuted ?? this.isMuted,
      isSpeakerOn: isSpeakerOn ?? this.isSpeakerOn,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      isAudioOnly: isAudioOnly ?? this.isAudioOnly,
      isInitialized: isInitialized ?? this.isInitialized,
      incomingCallerId: incomingCallerId ?? this.incomingCallerId,
      incomingCallerName: incomingCallerName ?? this.incomingCallerName,
      incomingCallerAvatar: incomingCallerAvatar ?? this.incomingCallerAvatar,
      incomingCallId: incomingCallId ?? this.incomingCallId,
    );
  }
}

final callStateProvider =
    StateNotifierProvider<CallStateNotifier, CallStateData>((ref) {
      final callService = ref.watch(callServiceProvider);
      final backgroundHandler = ref.watch(backgroundCallHandlerProvider);
      return CallStateNotifier(callService, backgroundHandler);
    });
