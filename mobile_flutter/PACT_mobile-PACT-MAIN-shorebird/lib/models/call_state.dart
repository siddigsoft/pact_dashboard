// lib/models/call_state.dart

/// Call state enum
enum CallStatus {
  idle,
  calling,
  incomingCall,
  connected,
  disconnected,
  failed,
  ringing,
  onHold,
  reconnecting,
  unreachable,
  busy,
  rejected,
  ended,
}

/// Call quality level (1-5, 5 being best)
enum CallQuality {
  excellent, // 5 bars
  good, // 4 bars
  fair, // 3 bars
  poor, // 2 bars
  veryPoor, // 1 bar
  unknown,
}

/// Audio output device
enum AudioOutputDevice { earpiece, speaker, bluetooth, wiredHeadset }

/// Call state model
class CallState {
  CallStatus _status = CallStatus.idle;
  String? _remoteUserId;
  String? _remoteUserName;
  bool _isAudioOnly = true;
  bool _isAudioEnabled = true;
  bool _isVideoEnabled = true;

  CallStatus get status => _status;
  bool get isInCall =>
      _status == CallStatus.connected || _status == CallStatus.calling;
  String? get remoteUserId => _remoteUserId;
  String? get remoteUserName => _remoteUserName;
  bool get isAudioOnly => _isAudioOnly;
  bool get isAudioEnabled => _isAudioEnabled;
  bool get isVideoEnabled => _isVideoEnabled;

  void updateStatus(CallStatus newStatus) {
    _status = newStatus;
  }

  void setRemoteUser(String userId, String userName) {
    _remoteUserId = userId;
    _remoteUserName = userName;
  }

  void clearRemoteUser() {
    _remoteUserId = null;
    _remoteUserName = null;
  }

  void setAudioOnly(bool value) {
    _isAudioOnly = value;
  }

  void setAudioEnabled(bool enabled) {
    _isAudioEnabled = enabled;
  }

  void setVideoEnabled(bool enabled) {
    _isVideoEnabled = enabled;
  }

  // Enhanced call features
  bool isOnHold = false;
  bool isRecording = false;
  bool isNoiseSuppressed = true;
  bool isScreenSharing = false;
  CallQuality callQuality = CallQuality.unknown;
  AudioOutputDevice audioDevice = AudioOutputDevice.earpiece;
  int reconnectAttempts = 0;
  String? callNotes;
  double? packetLoss;
  int? latencyMs;
  int? bitrate;
  int? jitterMs;

  // Constructor parameters
  String? callId;
  String? callToken;
  String? remoteUserAvatar;
  bool isMuted = false;
  bool isSpeakerOn = false;
  DateTime? startTime;
  String? jitsiRoom;

  CallState({
    CallStatus status = CallStatus.idle,
    this.callId,
    this.callToken,
    String? remoteUserId,
    String? remoteUserName,
    this.remoteUserAvatar,
    bool isVideoEnabled = false,
    this.isMuted = false,
    this.isSpeakerOn = false,
    this.startTime,
    this.jitsiRoom,
    bool isAudioOnly = false,
    this.isOnHold = false,
    this.isRecording = false,
    this.isNoiseSuppressed = true,
    this.isScreenSharing = false,
    this.callQuality = CallQuality.unknown,
    this.audioDevice = AudioOutputDevice.earpiece,
    this.reconnectAttempts = 0,
    this.callNotes,
    this.packetLoss,
    this.latencyMs,
    this.bitrate,
    this.jitterMs,
  }) {
    _status = status;
    _isVideoEnabled = isVideoEnabled;
    _remoteUserId = remoteUserId;
    _remoteUserName = remoteUserName;
    _isAudioOnly = isAudioOnly;
  }

  // Convenience getters for backward compatibility
  bool get isActive => isInCall;
  String? get roomName => jitsiRoom;
  String? get callerId => remoteUserId;
  String? get targetUserName => remoteUserName;
  String? get targetUserId => remoteUserId;
  String? get callerName => remoteUserName;
  String? get callerAvatar => remoteUserAvatar;
  bool get isAudioMuted => isMuted;
  bool get isVideoMuted => !isVideoEnabled;
  bool get isConnected => status == CallStatus.connected;
  bool get isConnecting => status == CallStatus.calling;
  bool get isIncoming => false; // Determined by other factors
  bool get isOutgoing => false; // Determined by other factors
  String? get callType => isAudioOnly ? 'audio' : 'video';

  bool get shouldShowCallScreen =>
      status == CallStatus.calling ||
      status == CallStatus.ringing ||
      status == CallStatus.connected ||
      status == CallStatus.onHold ||
      status == CallStatus.reconnecting ||
      status == CallStatus.unreachable ||
      status == CallStatus.failed ||
      status == CallStatus.busy ||
      status == CallStatus.rejected;

  /// Get quality as number of bars (1-5)
  int get qualityBars {
    switch (callQuality) {
      case CallQuality.excellent:
        return 5;
      case CallQuality.good:
        return 4;
      case CallQuality.fair:
        return 3;
      case CallQuality.poor:
        return 2;
      case CallQuality.veryPoor:
        return 1;
      case CallQuality.unknown:
        return 0;
    }
  }

  CallState copyWith({
    CallStatus? status,
    String? callId,
    String? callToken,
    String? remoteUserId,
    String? remoteUserName,
    String? remoteUserAvatar,
    bool? isVideoEnabled,
    bool? isMuted,
    bool? isSpeakerOn,
    DateTime? startTime,
    String? jitsiRoom,
    bool? isAudioOnly,
    bool? isOnHold,
    bool? isRecording,
    bool? isNoiseSuppressed,
    bool? isScreenSharing,
    CallQuality? callQuality,
    AudioOutputDevice? audioDevice,
    int? reconnectAttempts,
    String? callNotes,
    double? packetLoss,
    int? latencyMs,
    int? bitrate,
    int? jitterMs,
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
      isSpeakerOn: isSpeakerOn ?? this.isSpeakerOn,
      startTime: startTime ?? this.startTime,
      jitsiRoom: jitsiRoom ?? this.jitsiRoom,
      isAudioOnly: isAudioOnly ?? this.isAudioOnly,
      isOnHold: isOnHold ?? this.isOnHold,
      isRecording: isRecording ?? this.isRecording,
      isNoiseSuppressed: isNoiseSuppressed ?? this.isNoiseSuppressed,
      isScreenSharing: isScreenSharing ?? this.isScreenSharing,
      callQuality: callQuality ?? this.callQuality,
      audioDevice: audioDevice ?? this.audioDevice,
      reconnectAttempts: reconnectAttempts ?? this.reconnectAttempts,
      callNotes: callNotes ?? this.callNotes,
      packetLoss: packetLoss ?? this.packetLoss,
      latencyMs: latencyMs ?? this.latencyMs,
      bitrate: bitrate ?? this.bitrate,
      jitterMs: jitterMs ?? this.jitterMs,
    );
  }
}

/// Call history entry
class CallHistoryEntry {
  final String id;
  final String? callId;
  final String remoteUserId;
  final String remoteUserName;
  final String? remoteUserAvatar;
  final bool isOutgoing;
  final bool isVideoCall;
  final CallStatus endStatus;
  final DateTime startTime;
  final DateTime? endTime;
  final Duration? duration;
  final String? notes;
  final bool wasRecorded;

  CallHistoryEntry({
    required this.id,
    this.callId,
    required this.remoteUserId,
    required this.remoteUserName,
    this.remoteUserAvatar,
    required this.isOutgoing,
    this.isVideoCall = false,
    required this.endStatus,
    required this.startTime,
    this.endTime,
    this.duration,
    this.notes,
    this.wasRecorded = false,
  });

  bool get isMissed =>
      !isOutgoing &&
      endStatus != CallStatus.connected &&
      endStatus != CallStatus.rejected;

  Map<String, dynamic> toJson() => {
    'id': id,
    'call_id': callId,
    'remote_user_id': remoteUserId,
    'remote_user_name': remoteUserName,
    'remote_user_avatar': remoteUserAvatar,
    'is_outgoing': isOutgoing,
    'is_video_call': isVideoCall,
    'end_status': endStatus.name,
    'start_time': startTime.toIso8601String(),
    'end_time': endTime?.toIso8601String(),
    'duration_seconds': duration?.inSeconds,
    'notes': notes,
    'was_recorded': wasRecorded,
  };

  factory CallHistoryEntry.fromJson(Map<String, dynamic> json) {
    return CallHistoryEntry(
      id: json['id'] as String,
      callId: json['call_id'] as String?,
      remoteUserId: json['remote_user_id'] as String,
      remoteUserName: json['remote_user_name'] as String,
      remoteUserAvatar: json['remote_user_avatar'] as String?,
      isOutgoing: json['is_outgoing'] as bool? ?? true,
      isVideoCall: json['is_video_call'] as bool? ?? false,
      endStatus: CallStatus.values.firstWhere(
        (e) => e.name == json['end_status'],
        orElse: () => CallStatus.ended,
      ),
      startTime: DateTime.parse(json['start_time'] as String),
      endTime: json['end_time'] != null
          ? DateTime.parse(json['end_time'] as String)
          : null,
      duration: json['duration_seconds'] != null
          ? Duration(seconds: json['duration_seconds'] as int)
          : null,
      notes: json['notes'] as String?,
      wasRecorded: json['was_recorded'] as bool? ?? false,
    );
  }
}
