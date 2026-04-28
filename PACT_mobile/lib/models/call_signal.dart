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
CallSignalType? normalizeSignalType(String type) {
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

  // Do NOT default unknown types (e.g. Supabase 'broadcast' wrapper) to
  // callRequest — that causes echo messages to be treated as incoming calls.
  return typeMap[type];
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
      // 'signalType' is a stable copy of the type that Supabase cannot
      // overwrite (Supabase only overwrites 'type' with 'broadcast').
      'signalType': type.name,
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

  /// Returns null when the signal type is unrecognised, so callers can discard
  /// it without misrouting.
  ///
  /// Supabase overwrites the signal's 'type' field with 'broadcast' before
  /// delivery, so we:
  ///  1. Check 'signalType' (a stable field we add to every outgoing message).
  ///  2. Fall back to the regular 'type' field for any client that doesn't yet
  ///     send 'signalType'.
  ///  3. As a last resort, infer callRequest from the nested payload when it
  ///     contains a 'channelName' — that field is unique to callRequest.
  static CallSignal? tryFromJson(Map<String, dynamic> json) {
    final rawType =
        json['signalType'] as String? ?? json['type'] as String? ?? '';
    CallSignalType? normalizedType = normalizeSignalType(rawType);

    if (normalizedType == null) {
      // Infer callRequest from nested payload structure (backward compat with
      // clients that don't send 'signalType' and whose 'type' was overwritten).
      final nested = json['payload'];
      if (nested is Map && nested.containsKey('channelName')) {
        normalizedType = CallSignalType.callRequest;
      } else {
        return null;
      }
    }

    return CallSignal._fromJsonWithType(json, normalizedType);
  }

  factory CallSignal.fromJson(Map<String, dynamic> json) {
    // Use normalizer for cross-platform compatibility (web uses kebab-case, mobile uses camelCase)
    final rawType = json['type'] as String? ?? 'callRequest';
    // Fall back to callRequest only when the type field is absent/empty.
    final normalizedType =
        normalizeSignalType(rawType) ?? CallSignalType.callRequest;
    // Log Jitsi-related signals for call debugging
    if (normalizedType == CallSignalType.jitsiInvite ||
        normalizedType == CallSignalType.jitsiAccept ||
        normalizedType == CallSignalType.jitsiReject) {
      debugPrint(
        '[JitsiCall] CallSignal.fromJson rawType=$rawType normalizedType=${normalizedType.name} from=${json['from']} to=${json['to']} callId=${json['callId']} jitsiRoom=${json['jitsiRoom']}',
      );
    }

    return CallSignal._fromJsonWithType(json, normalizedType);
  }

  factory CallSignal._fromJsonWithType(
    Map<String, dynamic> json,
    CallSignalType normalizedType,
  ) {
    // Tolerate nulls from web/Supabase (required fields get safe defaults)
    return CallSignal(
      type: normalizedType,
      from: json['from'] as String? ?? '',
      to: json['to'] as String? ?? '',
      fromName: json['fromName'] as String? ?? 'Unknown',
      fromAvatar: json['fromAvatar'] as String?,
      callId: json['callId'] as String?,
      callToken: json['callToken'] as String?,
      payload: json['payload'] is Map<String, Object?>
          ? (json['payload'] as Map<String, Object?>).cast<String, dynamic>()
          : null,
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'] as String) ?? DateTime.now()
          : DateTime.now(),
      jitsiRoom: json['jitsiRoom'] as String?,
      isAudioOnly: json['isAudioOnly'] as bool?,
    );
  }
}
