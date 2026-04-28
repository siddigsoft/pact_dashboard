import 'package:flutter/foundation.dart';

class WebNotificationService {
  Future<void> showMissedCallNotification({
    required String callerId,
    required String callerName,
  }) async {}
  static final WebNotificationService _instance =
      WebNotificationService._internal();
  factory WebNotificationService() => _instance;
  WebNotificationService._internal();

  Future<void> initialize() async {}
  Future<void> requestPermission() async {}
  Future<void> showCallNotification({
    required String callId,
    required String callerName,
    required String callType,
    String? callIcon,
  }) async {}

  Future<void> showMessageNotification({
    required String messageId,
    required String senderId,
    required String senderName,
    required String messagePreview,
    String? senderAvatar,
  }) async {}
}
