// lib/models/call_signal.dart

import 'package:flutter/foundation.dart';

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

/// Normalize signal type from web (kebab-case) to mobile (camelCase) format
/// Handles cross-platform compatibility between web and mobile apps
CallSignalType normalizeSignalType(String type) {
  // Map web format (kebab-case) to mobile format (camelCase)
  const typeMap = <String, CallSignalType>{
    // Web format -> Mobile format
    'call-request': CallSignalType.callRequest,
    'call-accepted': CallSignalType.callAccept,
    'call-rejected': CallSignalType.callReject,
    'call-ended': CallSignalType.callEnd,
    'call-busy': CallSignalType.callBusy,
    'ice-candidate': CallSignalType.iceCandidate,
    'jitsi-invite': CallSignalType.jitsiInvite,
    'jitsi-accepted': CallSignalType.jitsiAccept,
    'jitsi-rejected': CallSignalType.jitsiReject,
    // Mobile format also supported (pass-through)
    'callRequest': CallSignalType.callRequest,
    'callAccept': CallSignalType.callAccept,
    'callReject': CallSignalType.callReject,
    'callEnd': CallSignalType.callEnd,
    'callBusy': CallSignalType.callBusy,
    'iceCandidate': CallSignalType.iceCandidate,
    'offer': CallSignalType.offer,
    'answer': CallSignalType.answer,
    'jitsiInvite': CallSignalType.jitsiInvite,
    'jitsiAccept': CallSignalType.jitsiAccept,
    'jitsiReject': CallSignalType.jitsiReject,
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
    // Use normalizer for cross-platform compatibility (web uses kebab-case, mobile uses camelCase)
    final rawType = json['type'] as String? ?? 'callRequest';
    final normalizedType = normalizeSignalType(rawType);
    // Log Jitsi-related signals for call debugging
    if (normalizedType == CallSignalType.jitsiInvite ||
        normalizedType == CallSignalType.jitsiAccept ||
        normalizedType == CallSignalType.jitsiReject) {
      debugPrint('[JitsiCall] CallSignal.fromJson rawType=$rawType normalizedType=${normalizedType.name} from=${json['from']} to=${json['to']} callId=${json['callId']} jitsiRoom=${json['jitsiRoom']}');
    }

    // Tolerate nulls from web/Supabase (required fields get safe defaults)
    return CallSignal(
      type: normalizedType,
      from: json['from'] as String? ?? '',
      to: json['to'] as String? ?? '',
      fromName: json['fromName'] as String? ?? 'Unknown',
      fromAvatar: json['fromAvatar'] as String?,
      callId: json['callId'] as String?,
      callToken: json['callToken'] as String?,
      payload: json['payload'] is Map<String, Object?> ? (json['payload'] as Map<String, Object?>).cast<String, dynamic>() : null,
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now()
          : DateTime.now(),
      jitsiRoom: json['jitsiRoom'] as String?,
      isAudioOnly: json['isAudioOnly'] as bool?,
    );
  }
}
