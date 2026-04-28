import 'package:flutter/material.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../models/agora_incoming_call.dart';
import '../screens/agora_call_screen.dart';
import 'persistent_call_state_service.dart';

/// Service for routing Firebase messages to appropriate app screens
/// Handles detection and routing of incoming calls from notifications
class BackgroundCallRouter {
  static final BackgroundCallRouter _instance =
      BackgroundCallRouter._internal();

  factory BackgroundCallRouter() => _instance;
  BackgroundCallRouter._internal();

  final _callStateService = PersistentCallStateService();

  /// Initialize the router
  Future<void> initialize() async {
    await _callStateService.initialize();
  }

  /// Check if a Firebase message is an incoming call
  bool isIncomingCall(RemoteMessage message) {
    return message.data['type'] == 'incoming_call' ||
        message.data['notification_type'] == 'call';
  }

  /// Extract call data from Firebase message
  AgoraIncomingCall? extractCallData(RemoteMessage message) {
    try {
      final data = message.data;

      // Check required fields
      if (data['call_id'] == null ||
          data['channel_name'] == null ||
          data['caller_id'] == null ||
          data['caller_name'] == null) {
        debugPrint(
          '[BackgroundCallRouter] Missing required call fields in FCM payload',
        );
        return null;
      }

      final call = AgoraIncomingCall(
        callId: data['call_id'] as String,
        channelName: data['channel_name'] as String,
        callerId: data['caller_id'] as String,
        callerName: data['caller_name'] as String,
        callerAvatar: data['caller_avatar'] as String?,
        isAudioOnly: (data['is_audio_only'] as String?) == 'true',
      );

      debugPrint(
        '[BackgroundCallRouter] Extracted call: callId=${call.callId} from=${call.callerName}',
      );

      return call;
    } catch (e) {
      debugPrint('[BackgroundCallRouter] Error extracting call data: $e');
      return null;
    }
  }

  /// Handle incoming call notification tap
  /// Stores call state and returns page to navigate to
  Future<Widget?> handleCallNotificationTap(RemoteMessage message) async {
    debugPrint('[BackgroundCallRouter] Handling call notification tap');

    // Extract call data from message
    final call = extractCallData(message);
    if (call == null) {
      debugPrint('[BackgroundCallRouter] Failed to extract call data');
      return null;
    }

    // Store call for persistence
    await _callStateService.storeIncomingCall(call);

    // Return call screen with the call data
    return AgoraCallScreen(
      channelName: call.channelName,
      remoteUserId: call.callerId,
      remoteUserName: call.callerName,
      remoteUserAvatar: call.callerAvatar,
      isAudioOnly: call.isAudioOnly,
      isOutgoing: false,
    );
  }

  /// Handle incoming call when app is in foreground
  /// Stores call for MainScreen to display dialog
  Future<void> handleIncomingCall(RemoteMessage message) async {
    debugPrint('[BackgroundCallRouter] Handling foreground incoming call');

    final call = extractCallData(message);
    if (call != null) {
      await _callStateService.storeIncomingCall(call);
    }
  }

  /// Get stored call for recovery (e.g., after app restart)
  Future<AgoraIncomingCall?> getStoredCall() async {
    return _callStateService.getStoredIncomingCall();
  }

  /// Clear stored call
  Future<void> clearStoredCall() async {
    await _callStateService.clearStoredCall();
  }
}
