import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'notification_gap_fixer_service.dart';
import 'notification_permission_cache_service.dart';
import 'web_notification_service.dart';

/// Service for managing message notifications with pop-up style
/// Displays messages as full-screen pop-ups (similar to WhatsApp/Messenger)
class MessageNotificationService {
  static final MessageNotificationService _instance =
      MessageNotificationService._internal();

  factory MessageNotificationService() => _instance;
  MessageNotificationService._internal();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  final Map<String, int> _activeMessageNotifications = {};
  final Map<String, bool> _messageVibrating = {};
  bool _initialized = false;

  /// Initialize the service
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      // GAP #1 FIX: Initialize gap fixer to detect API level
      final gapFixer = NotificationGapFixerService();
      await gapFixer.initialize();

      // GAP #4 FIX: Initialize web notifications
      if (kIsWeb) {
        final webService = WebNotificationService();
        await webService.initialize();
        debugPrint('[MessageNotification] Web notifications initialized');
      }

      const AndroidInitializationSettings androidSettings =
          AndroidInitializationSettings('@mipmap/ic_launcher');

      const DarwinInitializationSettings iOSSettings =
          DarwinInitializationSettings(
            requestAlertPermission: true,
            requestBadgePermission: true,
            requestSoundPermission: true,
          );

      final InitializationSettings initSettings = InitializationSettings(
        android: androidSettings,
        iOS: iOSSettings,
      );

      await _localNotifications.initialize(initSettings);

      // Create high-priority notification channel for messages
      await _createMessageChannel();

      _initialized = true;
      debugPrint('[MessageNotification] Initialized successfully');
    } catch (e) {
      debugPrint('[MessageNotification] Initialization error: $e');
    }
  }

  /// Create high-priority notification channel for messages
  Future<void> _createMessageChannel() async {
    try {
      const AndroidNotificationChannel channel = AndroidNotificationChannel(
        'message_channel_v2',
        'Messages',
        description: 'Incoming message notifications',
        importance: Importance.max,
        enableVibration: true,
        playSound: true,
        sound: RawResourceAndroidNotificationSound('notification_sound'),
      );

      await _localNotifications
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(channel);

      debugPrint('[MessageNotification] Message channel created');
    } catch (e) {
      debugPrint('[MessageNotification] Error creating channel: $e');
    }
  }

  /// Show message as pop-up notification (with bilingual support)
  Future<void> showMessagePopUp({
    required String messageId,
    required String senderName,
    required String messagePreview,
    required String chatId,
    required String senderId,
    String? senderAvatar,
    String? senderNameAr,
    String? messagePreviewAr,
  }) async {
    if (!_initialized) {
      debugPrint('[MessageNotification] Not initialized');
      return;
    }

    try {
      // Generate unique notification ID per message
      final notificationId = _generateNotificationId(messageId);
      _activeMessageNotifications[messageId] = notificationId;

      // GAP #1 FIX: Use safe fullScreenIntent
      final gapFixer = NotificationGapFixerService();

      // GAP #2 FIX: Build proper payload for tap routing
      final payload =
          NotificationGapFixerService.buildMessageNotificationPayload(
            messageId: messageId,
            chatId: chatId,
            senderId: senderId,
          );

      // Get bilingual app locale (English by default if not AR)
      final _isArabic = _getAppLocale() == 'ar';

      // Compose bilingual text for title and preview
      final displaySenderName =
          _isArabic && senderNameAr != null && senderNameAr.isNotEmpty
          ? senderNameAr
          : senderName;
      final displayMessagePreview =
          _isArabic && messagePreviewAr != null && messagePreviewAr.isNotEmpty
          ? messagePreviewAr
          : messagePreview;

      // Bilingual action button labels
      final openChatLabel = _isArabic ? 'فتح الدردشة' : 'Open Chat';
      final dismissLabel = _isArabic ? 'تجاهل' : 'Dismiss';

      // Android full-screen intent (pop-up style)
      final androidDetails = AndroidNotificationDetails(
        'message_channel_v2',
        'Messages',
        channelDescription: 'Incoming messages',
        importance: Importance.max,
        priority: Priority.high,
        fullScreenIntent: gapFixer
            .getSafeFullScreenIntent(), // GAP #1: API-safe
        groupKey: NotificationGapFixerService.getMessageGroupKey(
          senderId,
        ), // GAP #5: Group by sender
        setAsGroupSummary: false,
        enableVibration: true,
        vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
        playSound: true,
        autoCancel: false,
        // Enhanced styling - bigger and more modern
        styleInformation: BigTextStyleInformation(
          displayMessagePreview,
          contentTitle: '$displaySenderName 💬',
          summaryText: _isArabic ? 'رسالة جديدة' : 'New message',
          htmlFormatBigText: true,
          htmlFormatContentTitle: true,
          htmlFormatSummaryText: true,
        ),
        color: Color(0xFF2196F3), // Modern blue
        colorized: true,
        largeIcon: null, // Can add avatar if available
        ticker: _isArabic
            ? 'رسالة جديدة من $displaySenderName'
            : 'New message from $displaySenderName',
        sound: RawResourceAndroidNotificationSound('notification_sound'),
        actions: [
          AndroidNotificationAction(
            'open_chat',
            openChatLabel,
            cancelNotification: true,
          ),
          AndroidNotificationAction(
            'dismiss',
            dismissLabel,
            cancelNotification: true,
          ),
        ],
      );

      // iOS notification
      const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );

      final NotificationDetails details = NotificationDetails(
        android: androidDetails,
        iOS: iOSDetails,
      );

      debugPrint(
        '[MessageNotification] Showing pop-up: from=$senderName, message=$messagePreview',
      );

      // Show notification with extended payload
      await _localNotifications.show(
        notificationId,
        senderName,
        messagePreview,
        details,
        payload: payload, // GAP #2: Use structured payload
      );

      // Trigger vibration on Android
      _messageVibrating[messageId] = true;

      debugPrint(
        '[MessageNotification] Showing pop-up: id=$notificationId from=$senderName, fullScreenIntent=${gapFixer.getSafeFullScreenIntent()}, group=${NotificationGapFixerService.getMessageGroupKey(senderId)}',
      );

      // GAP #4 FIX: Show web notification
      if (kIsWeb) {
        try {
          final webService = WebNotificationService();
          await webService.showMessageNotification(
            messageId: messageId,
            senderId: senderId,
            senderName: senderName,
            messagePreview: messagePreview,
          );
        } catch (e) {
          debugPrint(
            '[MessageNotification] Error showing web notification: $e',
          );
        }
      }

      // GAP #3 FIX: Cache message if permission denied (for fallback)
      _cacheMessageIfNeeded(
        messageId: messageId,
        senderId: senderId,
        senderName: senderName,
        messagePreview: messagePreview,
        chatId: chatId,
      );
    } catch (e) {
      debugPrint('[MessageNotification] Error showing notification: $e');
    }
  }

  /// GAP #3: Cache message if notification permission denied
  Future<void> _cacheMessageIfNeeded({
    required String messageId,
    required String senderId,
    required String senderName,
    required String messagePreview,
    required String chatId,
  }) async {
    try {
      final cacheService = NotificationPermissionCacheService();
      if (cacheService.isPermissionDenied()) {
        await cacheService.cacheMessage(
          messageId: messageId,
          senderId: senderId,
          senderName: senderName,
          messagePreview: messagePreview,
          chatId: chatId,
          timestamp: DateTime.now(),
        );
        debugPrint(
          '[MessageNotification] Cached message from $senderName (permission denied)',
        );
      }
    } catch (e) {
      debugPrint('[MessageNotification] Error caching message: $e');
    }
  }

  /// Dismiss message notification
  Future<void> dismissMessageNotification(String messageId) async {
    if (!_initialized) return;

    try {
      final notificationId = _activeMessageNotifications[messageId];
      if (notificationId != null) {
        await _localNotifications.cancel(notificationId);
        _activeMessageNotifications.remove(messageId);
        _messageVibrating.remove(messageId);

        debugPrint('[MessageNotification] Dismissed: $messageId');
      }
    } catch (e) {
      debugPrint('[MessageNotification] Error dismissing notification: $e');
    }
  }

  /// Dismiss all message notifications
  Future<void> dismissAllMessageNotifications() async {
    if (!_initialized) return;

    try {
      await _localNotifications.cancelAll();
      _activeMessageNotifications.clear();
      _messageVibrating.clear();

      debugPrint('[MessageNotification] Dismissed all notifications');
    } catch (e) {
      debugPrint('[MessageNotification] Error dismissing all: $e');
    }
  }

  /// Generate unique notification ID from messageId hash
  int _generateNotificationId(String messageId) {
    // Use hashCode to generate unique ID (1 to 262143 = ~18 bits)
    // This ensures up to 262,143 concurrent message notifications
    return (messageId.hashCode.abs() % 0x40000) + 1;
  }

  /// Get current app locale for bilingual support
  String _getAppLocale() {
    try {
      // Try to get from SharedPreferences via SettingsService pattern
      // For now, return 'en' as default
      // This should be connected to app's locale switcher
      return 'en';
    } catch (e) {
      return 'en';
    }
  }

  /// Get count of active message notifications
  int get activeMessageCount => _activeMessageNotifications.length;

  /// Check if message is vibrating
  bool isMessageVibrating(String messageId) =>
      _messageVibrating[messageId] ?? false;

  bool get isInitialized => _initialized;
}
