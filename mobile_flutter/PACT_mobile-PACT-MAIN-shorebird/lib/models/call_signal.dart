// lib/models/call_signal.dart

/// Call signal types for WebRTC signaling
enum CallSignalType {
  callRequest,
  callAccept,
  callReject,
  callEnd,
  callBusy,
  offer,
  answer,
  iceCandidate,
  jitsiInvite,
  jitsiAccept,
  jitsiReject,
}

/// Call signal message for WebRTC signaling
class CallSignal {
  final CallSignalType type;
  final String from;
  final String to;
  final String fromName;
  final String? fromAvatar;
  final String? callId;
  final String? callToken;
  final Map<String, dynamic>? payload;
  final DateTime timestamp;
  final String? jitsiRoom;
  final bool? isAudioOnly;

  CallSignal({
    required this.type,
    required this.from,
    required this.to,
    required this.fromName,
    this.fromAvatar,
    this.callId,
    this.callToken,
    this.payload,
    DateTime? timestamp,
    this.jitsiRoom,
    this.isAudioOnly,
  }) : timestamp = timestamp ?? DateTime.now();

  Map<String, dynamic> toJson() {
    return {
      'type': type.name,
      'from': from,
      'to': to,
      'fromName': fromName,
      'fromAvatar': fromAvatar,
      'callId': callId,
      'callToken': callToken,
      'payload': payload,
      'timestamp': timestamp.toIso8601String(),
      'jitsiRoom': jitsiRoom,
      'isAudioOnly': isAudioOnly,
    };
  }

  factory CallSignal.fromJson(Map<String, dynamic> json) {
    return CallSignal(
      type: CallSignalType.values.firstWhere(
        (e) => e.name == json['type'],
        orElse: () => CallSignalType.callRequest,
      ),
      from: json['from'] as String,
      to: json['to'] as String,
      fromName: json['fromName'] as String,
      fromAvatar: json['fromAvatar'] as String?,
      callId: json['callId'] as String?,
      callToken: json['callToken'] as String?,
      payload: json['payload'] as Map<String, dynamic>?,
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'] as String)
          : DateTime.now(),
      jitsiRoom: json['jitsiRoom'] as String?,
      isAudioOnly: json['isAudioOnly'] as bool?,
    );
  }
}
