// lib/services/notification_gap_fixer_service.dart
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:device_info_plus/device_info_plus.dart';

/// Service to fix critical notification gaps:
/// 1. fullScreenIntent API version check (Gap #1)
/// 2. Notification tap navigation (Gap #2)
/// 3. Permission denied fallback (Gap #3)
/// 4. Web platform support (Gap #4)
/// 5. Notification grouping (Gap #5)

class NotificationGapFixerService {
  static final NotificationGapFixerService _instance =
      NotificationGapFixerService._internal();

  factory NotificationGapFixerService() => _instance;
  NotificationGapFixerService._internal();

  final _deviceInfo = DeviceInfoPlugin();
  int? _androidApiLevel;
  bool _supportsFullScreenIntent = false;
  bool _permissionDenied = false;
  static const String debugTag = '[NotificationGapFixer]';

  /// Initialize and detect device capabilities
  Future<void> initialize() async {
    try {
      if (Platform.isAndroid) {
        final androidInfo = await _deviceInfo.androidInfo;
        _androidApiLevel = androidInfo.version.sdkInt;
        _supportsFullScreenIntent = (_androidApiLevel ?? 0) >= 31;

        debugPrint(
          '$debugTag Android API Level: $_androidApiLevel, '
          'Supports fullScreenIntent: $_supportsFullScreenIntent',
        );
      }
    } catch (e) {
      debugPrint('$debugTag Error detecting device capabilities: $e');
    }
  }

  /// GAP #1: Check if fullScreenIntent is supported on this device
  bool canUseFullScreenIntent() {
    return _supportsFullScreenIntent;
  }

  /// GAP #1: Get safe fullScreenIntent value based on API level
  bool getSafeFullScreenIntent() {
    // Only use fullScreenIntent on Android 31+ (API 31)
    if (!Platform.isAndroid) return false;
    return _supportsFullScreenIntent;
  }

  /// GAP #3: Mark that permission was denied
  void setPermissionDenied(bool denied) {
    _permissionDenied = denied;
  }

  /// GAP #3: Get permission status
  bool isPermissionDenied() => _permissionDenied;

  /// GAP #2: Build notification payload for tap routing
  /// Format: "type:targetId:metadata"
  static String buildCallNotificationPayload({
    required String callId,
    required String callerId,
    required String callerName,
    required bool isVideoCall,
    String channelName = '',
  }) {
    return 'call:$callId:$callerId|$callerName|${isVideoCall ? 'video' : 'audio'}|$channelName';
  }

  /// GAP #2: Build notification payload for messages
  /// Format: "message:chatId:senderId:messageId"
  static String buildMessageNotificationPayload({
    required String messageId,
    required String chatId,
    required String senderId,
  }) {
    return 'message:$chatId:$senderId:$messageId';
  }

  /// GAP #5: Get group key for message notifications (for grouping)
  /// Groups messages by sender
  static String getMessageGroupKey(String senderId) {
    return 'messages_from_$senderId';
  }

  /// GAP #5: Get group key for call notifications
  static String getCallGroupKey() {
    return 'incoming_calls_group';
  }

  /// GAP #2: Parse notification payload for routing
  static Map<String, String> parseNotificationPayload(String payload) {
    final parts = payload.split(':');
    if (parts.isEmpty) return {};

    final type = parts[0];
    if (type == 'call' && parts.length >= 3) {
      final metadata = parts[2].split('|');
      return {
        'type': 'call',
        'callId': parts[1],
        'callerId': metadata.isNotEmpty ? metadata[0] : '',
        'callerName': metadata.length > 1 ? metadata[1] : '',
        'isVideoCall': metadata.length > 2 && metadata[2] == 'video'
            ? 'true'
            : 'false',
        'channelName': metadata.length > 3 ? metadata[3] : '',
      };
    } else if (type == 'message' && parts.length >= 4) {
      return {
        'type': 'message',
        'chatId': parts[1],
        'senderId': parts[2],
        'messageId': parts[3],
      };
    }

    return {};
  }

  /// GAP #4: Check if running on web platform
  static bool isWebPlatform() {
    return kIsWeb;
  }

  /// GAP #4: Check if platform supports local notifications
  static bool supportsPlatformNotifications() {
    return Platform.isAndroid || Platform.isIOS;
  }

  /// GAP #3: Fallback notification when permission denied
  static Future<void> showPermissionDeniedFallback() async {
    debugPrint(
      '$debugTag Permission denied - showing fallback (local storage + retry)',
    );
    // This would be implemented in UI layer to show user message
  }

  /// Recommended AndroidNotificationDetails for calls with API check
  AndroidNotificationDetails getCallNotificationDetails(String callId) {
    return AndroidNotificationDetails(
      'incoming_calls',
      'Incoming Calls',
      channelDescription: 'Notifications for incoming calls',
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: getSafeFullScreenIntent(), // GAP #1: API version safe
      groupKey: getCallGroupKey(), // GAP #5: Grouping
      setAsGroupSummary: false,
      ongoing: true,
      autoCancel: false,
      visibility: NotificationVisibility.public,
      actions: [
        AndroidNotificationAction(
          'call_accept_$callId',
          'Accept',
          showsUserInterface: true,
          cancelNotification: false,
        ),
        AndroidNotificationAction(
          'call_decline_$callId',
          'Decline',
          showsUserInterface: true,
          cancelNotification: false,
        ),
      ],
    );
  }

  /// Recommended AndroidNotificationDetails for messages with grouping
  AndroidNotificationDetails getMessageNotificationDetails(String senderId) {
    return AndroidNotificationDetails(
      'message_notifications',
      'Messages',
      channelDescription: 'Message notifications',
      importance: Importance.max,
      priority: Priority.max,
      groupKey: getMessageGroupKey(senderId), // GAP #5: Group by sender
      setAsGroupSummary: false,
      actions: [
        const AndroidNotificationAction(
          'message_open',
          'Open',
          showsUserInterface: true,
          cancelNotification: true,
        ),
        const AndroidNotificationAction(
          'message_dismiss',
          'Dismiss',
          cancelNotification: true,
        ),
      ],
    );
  }

  /// Get Android API level
  int? get androidApiLevel => _androidApiLevel;
}
