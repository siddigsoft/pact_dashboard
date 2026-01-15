// lib/models/call_state.dart

/// Call state enum
enum CallStatus {
  idle,
  calling,
  ringing,
  connected,
  ended,
  rejected,
  busy,
}

/// Call state model
class CallState {
  final CallStatus status;
  final String? callId;
  final String? callToken;
  final String? remoteUserId;
  final String? remoteUserName;
  final String? remoteUserAvatar;
  final bool isVideoEnabled;
  final bool isMuted;
  final DateTime? startTime;
  final String? jitsiRoom;
  final bool isAudioOnly;

  CallState({
    this.status = CallStatus.idle,
    this.callId,
    this.callToken,
    this.remoteUserId,
    this.remoteUserName,
    this.remoteUserAvatar,
    this.isVideoEnabled = false,
    this.isMuted = false,
    this.startTime,
    this.jitsiRoom,
    this.isAudioOnly = false,
  });

  bool get isInCall =>
      status == CallStatus.calling ||
      status == CallStatus.ringing ||
      status == CallStatus.connected;

  CallState copyWith({
    CallStatus? status,
    String? callId,
    String? callToken,
    String? remoteUserId,
    String? remoteUserName,
    String? remoteUserAvatar,
    bool? isVideoEnabled,
    bool? isMuted,
    DateTime? startTime,
    String? jitsiRoom,
    bool? isAudioOnly,
  }) {
    return CallState(
      status: status ?? this.status,
      callId: callId ?? this.callId,
      callToken: callToken ?? this.callToken,
      remoteUserId: remoteUserId ?? this.remoteUserId,
      remoteUserName: remoteUserName ?? this.remoteUserName,
      remoteUserAvatar: remoteUserAvatar ?? this.remoteUserAvatar,
      isVideoEnabled: isVideoEnabled ?? this.isVideoEnabled,
      isMuted: isMuted ?? this.isMuted,
      startTime: startTime ?? this.startTime,
      jitsiRoom: jitsiRoom ?? this.jitsiRoom,
      isAudioOnly: isAudioOnly ?? this.isAudioOnly,
    );
  }
}
