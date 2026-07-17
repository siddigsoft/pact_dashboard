import 'package:flutter/foundation.dart';
import 'persistent_message_state_service.dart';
import 'message_notification_service.dart';

/// Service for routing background FCM messages to appropriate handlers
/// Extracts message data and triggers pop-up notifications
class BackgroundMessageRouter {
  static final BackgroundMessageRouter _instance =
      BackgroundMessageRouter._internal();

  factory BackgroundMessageRouter() => _instance;
  BackgroundMessageRouter._internal();

  final _persistentMessageState = PersistentMessageStateService();
  final _messageNotification = MessageNotificationService();

  /// Initialize the router
  Future<void> initialize() async {
    try {
      await _persistentMessageState.initialize();
      await _messageNotification.initialize();
      debugPrint('[BackgroundMessageRouter] Initialized successfully');
    } catch (e) {
      debugPrint('[BackgroundMessageRouter] Initialization error: $e');
    }
  }

  /// Check if FCM payload is a message
  bool isIncomingMessage(Map<String, dynamic> data) {
    final type = data['type'] as String? ?? '';
    return type == 'message' ||
        type == 'chat_message' ||
        (data.containsKey('sender_id') && data.containsKey('message_body'));
  }

  /// Extract message data from FCM payload (with bilingual support)
  Map<String, dynamic> extractMessageData(Map<String, dynamic> data) {
    final messageId =
        data['message_id'] as String? ?? data['messageId'] as String? ?? '';
    final chatId =
        data['chat_id'] as String? ?? data['chatId'] as String? ?? '';
    final senderId =
        data['sender_id'] as String? ?? data['senderId'] as String? ?? '';
    final senderName =
        data['sender_name'] as String? ??
        data['senderName'] as String? ??
        'Someone';
    final senderNameAr =
        data['sender_name_ar'] as String? ?? data['senderNameAr'] as String?;
    final senderAvatar =
        data['sender_avatar'] as String? ?? data['senderAvatar'] as String?;
    final messageBody =
        data['message_body'] as String? ?? data['messageBody'] as String? ?? '';
    final messageBodyAr =
        data['message_body_ar'] as String? ?? data['messageBodyAr'] as String?;
    final messagePreview =
        data['message_preview'] as String? ??
        data['messagePreview'] as String? ??
        messageBody;
    final messagePreviewAr =
        data['message_preview_ar'] as String? ??
        data['messagePreviewAr'] as String? ??
        messageBodyAr;

    return {
      'messageId': messageId,
      'chatId': chatId,
      'senderId': senderId,
      'senderName': senderName,
      'senderNameAr': senderNameAr,
      'senderAvatar': senderAvatar,
      'messageBody': messageBody,
      'messageBodyAr': messageBodyAr,
      'messagePreview': messagePreview,
      'messagePreviewAr': messagePreviewAr,
    };
  }

  /// Handle incoming message - store and show pop-up (with bilingual support)
  Future<void> handleIncomingMessage(Map<String, dynamic> data) async {
    try {
      final messageData = extractMessageData(data);

      // Validate required fields
      if ((messageData['messageId'] as String).isEmpty ||
          (messageData['chatId'] as String).isEmpty) {
        debugPrint('[BackgroundMessageRouter] Invalid message data');
        return;
      }

      // Store message for pop-up recovery
      await _persistentMessageState.storeUnreadMessage(
        messageId: messageData['messageId'] as String,
        chatId: messageData['chatId'] as String,
        senderId: messageData['senderId'] as String,
        senderName: messageData['senderName'] as String,
        senderAvatar: messageData['senderAvatar'] as String? ?? '',
        messageBody: messageData['messageBody'] as String,
        messagePreview: messageData['messagePreview'] as String,
      );

      // Show pop-up notification with bilingual support
      await _messageNotification.showMessagePopUp(
        messageId: messageData['messageId'] as String,
        senderName: messageData['senderName'] as String,
        messagePreview: messageData['messagePreview'] as String,
        chatId: messageData['chatId'] as String,
        senderId: messageData['senderId'] as String,
        senderAvatar: messageData['senderAvatar'] as String?,
        senderNameAr: messageData['senderNameAr'] as String?,
        messagePreviewAr: messageData['messagePreviewAr'] as String?,
      );

      debugPrint(
        '[BackgroundMessageRouter] Message handled: from=${messageData['senderName']}',
      );
    } catch (e) {
      debugPrint('[BackgroundMessageRouter] Error handling message: $e');
    }
  }

  /// Handle notification tap - navigate to chat
  Future<void> handleMessageNotificationTap({
    required String chatId,
    required String senderId,
    required String messageId,
  }) async {
    try {
      // Remove from persistent storage
      await _persistentMessageState.removeMessage(messageId);

      // Dismiss notification
      await _messageNotification.dismissMessageNotification(messageId);

      debugPrint(
        '[BackgroundMessageRouter] Notification tap handled: chatId=$chatId',
      );
    } catch (e) {
      debugPrint('[BackgroundMessageRouter] Error on notification tap: $e');
    }
  }

  /// Get stored messages for pop-up display
  Future<List<Map<String, dynamic>>> getStoredMessages() async {
    return _persistentMessageState.getStoredMessages();
  }

  /// Clear stored messages
  Future<void> clearStoredMessages() async {
    await _persistentMessageState.clearStoredMessages();
    await _messageNotification.dismissAllMessageNotifications();
  }

  bool get isInitialized =>
      _persistentMessageState.isInitialized &&
      _messageNotification.isInitialized;
}
