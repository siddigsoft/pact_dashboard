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
}

/// Normalize signal type from web (kebab-case) to mobile (camelCase) format
/// Handles cross-platform compatibility between web and mobile apps
CallSignalType normalizeSignalType(String type) {
  const typeMap = <String, CallSignalType>{
    'call-request': CallSignalType.callRequest,
    'call-accepted': CallSignalType.callAccept,
    'call-rejected': CallSignalType.callReject,
    'call-ended': CallSignalType.callEnd,
    'call-busy': CallSignalType.callBusy,
    'ice-candidate': CallSignalType.iceCandidate,
    'callRequest': CallSignalType.callRequest,
    'callAccept': CallSignalType.callAccept,
    'callReject': CallSignalType.callReject,
    'callEnd': CallSignalType.callEnd,
    'callBusy': CallSignalType.callBusy,
    'iceCandidate': CallSignalType.iceCandidate,
    'offer': CallSignalType.offer,
    'answer': CallSignalType.answer,
  };
  
  return typeMap[type] ?? CallSignalType.callRequest;
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
      'isAudioOnly': isAudioOnly,
    };
  }

  factory CallSignal.fromJson(Map<String, dynamic> json) {
    final normalizedType = normalizeSignalType(json['type'] as String? ?? 'callRequest');
    
    return CallSignal(
      type: normalizedType,
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
      isAudioOnly: json['isAudioOnly'] as bool?,
    );
  }
}
