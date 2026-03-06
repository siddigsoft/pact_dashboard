import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:supabase_flutter/supabase_flutter.dart';
import './notification_routing_service.dart';
import './bilingual_notification_service.dart';

/// Enhanced background notification handler for FCM messages
/// Handles all notifications regardless of app state (foreground, background, terminated)
class BackgroundNotificationHandler {
  static final BackgroundNotificationHandler _instance =
      BackgroundNotificationHandler._internal();

  factory BackgroundNotificationHandler() => _instance;
  BackgroundNotificationHandler._internal();

  late final FirebaseMessaging _firebaseMessaging;
  final NotificationRoutingService _routingService =
      NotificationRoutingService();

  bool _isInitialized = false;
  final Map<String, DateTime> _recentMessageFingerprints = {};
  final Map<String, DateTime> _throttleKeys = {};

  static const Duration _dedupWindow = Duration(seconds: 45);
  static const Duration _defaultThrottleWindow = Duration(seconds: 3);
  static const Duration _broadcastThrottleWindow = Duration(seconds: 8);
  static const Duration _callThrottleWindow = Duration(seconds: 2);

  /// Initialize Firebase messaging lazily (only on mobile)
  FirebaseMessaging _getFirebaseMessaging() {
    if (kIsWeb) {
      throw UnsupportedError('Firebase messaging not available on web');
    }
    return FirebaseMessaging.instance;
  }

  /// Initialize background notification handling
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      // Initialize services with timeout
      try {
        await BilingualNotificationService.initialize().timeout(
          const Duration(seconds: 5),
        );
      } catch (e) {
        debugPrint('[BackgroundHandler] BilingualService init error: $e');
      }

      try {
        await _routingService.initialize().timeout(const Duration(seconds: 5));
      } catch (e) {
        debugPrint('[BackgroundHandler] RoutingService init error: $e');
      }

      // Skip Firebase operations on web (FCM not supported)
      if (!kIsWeb) {
        _firebaseMessaging = _getFirebaseMessaging();

        // Request notification permissions (with timeout)
        try {
          final settings = await _firebaseMessaging
              .requestPermission(
                alert: true,
                announcement: true,
                badge: true,
                carPlay: false,
                criticalAlert: true,
                provisional: false,
                sound: true,
              )
              .timeout(const Duration(seconds: 10));

          debugPrint(
            '[BackgroundHandler] Permission status: ${settings.authorizationStatus}',
          );
        } on TimeoutException {
          debugPrint('[BackgroundHandler] Permission request timeout');
        } catch (e) {
          debugPrint('[BackgroundHandler] Permission request error: $e');
        }

        // Setup all message handlers
        _setupForegroundHandler();
        _setupBackgroundHandler();
        _setupTerminatedStateHandler();

        // Get and log FCM token (with timeout)
        try {
          final token = await _firebaseMessaging.getToken().timeout(
            const Duration(seconds: 10),
          );
          if (token != null) {
            debugPrint('[BackgroundHandler] FCM Token: $token');
          }
        } on TimeoutException {
          debugPrint('[BackgroundHandler] FCM getToken timeout');
        } catch (e) {
          debugPrint('[BackgroundHandler] Error getting FCM token: $e');
        }
      } else {
        debugPrint(
          '[BackgroundHandler] Running on web - Firebase operations skipped',
        );
      }

      _isInitialized = true;
      debugPrint('[BackgroundHandler] Initialized successfully');
    } catch (e) {
      _isInitialized =
          true; // Mark as initialized even if failed to prevent retries
      debugPrint('[BackgroundHandler] Initialization error: $e');
    }
  }

  /// Setup foreground message handler (app is open and in focus)
  void _setupForegroundHandler() {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint(
        '[BackgroundHandler] Foreground message: ${message.notification?.title}',
      );
      handleMessage(message, isBackground: false);
    });
  }

  /// Setup background handler (app is backgrounded but running)
  void _setupBackgroundHandler() {
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint(
        '[BackgroundHandler] Message opened from background: ${message.notification?.title}',
      );
      _handleNotificationTap(message);
    });
  }

  /// Setup terminated state handler (app was killed, user tapped notification)
  void _setupTerminatedStateHandler() async {
    final initialMessage = await _firebaseMessaging.getInitialMessage();
    if (initialMessage != null) {
      debugPrint(
        '[BackgroundHandler] App launched from terminated state: ${initialMessage.notification?.title}',
      );
      Future.delayed(const Duration(milliseconds: 500), () {
        _handleNotificationTap(initialMessage);
      });
    }
  }

  /// Handle all message types (foreground + background)
  Future<void> handleMessage(
    RemoteMessage message, {
    bool isBackground = true,
  }) async {
    try {
      final data = message.data;
      final type = (data['notification_type'] ?? data['type'] ?? '')
          .toString()
          .toLowerCase();

      if (_shouldSkipMessage(message, type, data)) {
        return;
      }

      debugPrint(
        '[BackgroundHandler] Processing message type: $type, isBackground: $isBackground',
      );

      // ───────────────────────────────────────────────────────────────
      // INCOMING CALL (highest priority)
      // ───────────────────────────────────────────────────────────────
      if (_isIncomingCall(type, data)) {
        await _handleIncomingCall(message, data);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // NEW MESSAGE
      // ───────────────────────────────────────────────────────────────
      if (_isNewMessage(type, data)) {
        await _handleNewMessage(message, data);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // ADMIN BROADCAST
      // ───────────────────────────────────────────────────────────────
      if (type == 'broadcast') {
        await _handleBroadcast(message);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // FINANCIAL NOTIFICATIONS
      // ───────────────────────────────────────────────────────────────
      if (_isFinancialNotification(type)) {
        await _handleFinancialNotification(message, data, type);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // FALLBACK: Generic notification
      // ───────────────────────────────────────────────────────────────
      await _handleGenericNotification(message);
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling message: $e');
    }
  }

  /// Handle incoming call notification
  Future<void> _handleIncomingCall(
    RemoteMessage message,
    Map<String, dynamic> data,
  ) async {
    try {
      final callerName =
          data['caller_name'] ??
          data['fromName'] ??
          message.notification?.title ??
          'Unknown Caller';
      final callId = data['call_id'] ?? data['callId'] ?? '';
      final callerAvatar = data['caller_avatar'] ?? data['fromAvatar'];
      final isVideoCall =
          (data['is_video_call'] ?? data['callType'] ?? '')
              .toString()
              .toLowerCase() ==
          'video';

      await _routingService.handleIncomingCall(
        callerId: data['from'] ?? data['caller_id'] ?? '',
        callerName: callerName,
        callId: callId,
        callerAvatar: callerAvatar,
        isVideoCall: isVideoCall,
      );

      // Log incoming call
      await _logActivity('incoming_call', callerName, 'Received incoming call');
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling incoming call: $e');
    }
  }

  /// Handle new message notification
  Future<void> _handleNewMessage(
    RemoteMessage message,
    Map<String, dynamic> data,
  ) async {
    try {
      final senderName =
          data['sender_name'] ?? message.notification?.title ?? 'Unknown';
      final senderId = data['sender_id'] ?? data['from'] ?? '';
      final messagePreview =
          message.notification?.body ?? data['message'] ?? 'New message';
      final senderAvatar = data['sender_avatar'];

      await _routingService.handleNewMessage(
        senderId: senderId,
        senderName: senderName,
        messagePreview: messagePreview,
        senderAvatar: senderAvatar,
      );

      // Log message received
      await _logActivity('message_received', senderName, messagePreview);
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling message: $e');
    }
  }

  /// Handle broadcast notification
  Future<void> _handleBroadcast(RemoteMessage message) async {
    try {
      final fcmTitle = _composeBilingualText(
        primary: message.notification?.title,
        secondary: message.data['title_ar']?.toString(),
        fallbackPrimary: message.data['title']?.toString(),
        fallbackSecondary: message.data['title_en']?.toString(),
      );
      final fcmBody = _composeBilingualText(
        primary: message.notification?.body,
        secondary: message.data['message_ar']?.toString(),
        fallbackPrimary: message.data['body']?.toString(),
        fallbackSecondary: message.data['message_en']?.toString(),
      );

      if (fcmTitle.isNotEmpty || fcmBody.isNotEmpty) {
        await _routingService.handleNotification(
          type: 'broadcast',
          title: fcmTitle,
          body: fcmBody,
          data: message.data,
          payload: 'notifications',
        );
      }
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling broadcast: $e');
    }
  }

  /// Handle financial notifications
  Future<void> _handleFinancialNotification(
    RemoteMessage message,
    Map<String, dynamic> data,
    String type,
  ) async {
    try {
      final fcmTitle = message.notification?.title ?? '';
      final fcmBody = message.notification?.body ?? '';
      late String payload;
      late String? titleKey;
      late String? bodyKey;

      if (type.contains('fund_receipt') || type.contains('advance_disbursed')) {
        titleKey = 'advance_disbursed';
        bodyKey = 'tap_to_view_details';
        payload = 'wallet:advances';
      } else if (type.contains('cost_submission')) {
        titleKey = null;
        payload = 'wallet:cost_payments';
      } else if (type.contains('withdrawal') || type.contains('payment')) {
        titleKey = null;
        payload = 'wallet:advances';
      }

      if (titleKey != null) {
        await BilingualNotificationService.showBilingualNotification(
          titleKey: titleKey,
          bodyKey: bodyKey ?? 'tap_to_view_details',
          payload: payload,
        );
      } else if (fcmTitle.isNotEmpty || fcmBody.isNotEmpty) {
        await BilingualNotificationService.showRawNotification(
          title: fcmTitle.isNotEmpty ? fcmTitle : 'Payment Update',
          body: fcmBody,
          payload: payload,
        );
      }

      await _logActivity(type, 'Financial Update', fcmBody);
    } catch (e) {
      debugPrint(
        '[BackgroundHandler] Error handling financial notification: $e',
      );
    }
  }

  /// Handle generic notification
  Future<void> _handleGenericNotification(RemoteMessage message) async {
    try {
      final title = _composeBilingualText(
        primary: message.notification?.title,
        secondary: message.data['title_ar']?.toString(),
        fallbackPrimary: message.data['title']?.toString(),
        fallbackSecondary: message.data['title_en']?.toString(),
      );
      final body = _composeBilingualText(
        primary: message.notification?.body,
        secondary: message.data['message_ar']?.toString(),
        fallbackPrimary: message.data['body']?.toString(),
        fallbackSecondary: message.data['message_en']?.toString(),
      );

      if (title.isNotEmpty || body.isNotEmpty) {
        await _routingService.handleNotification(
          type: 'notification',
          title: title,
          body: body,
          data: message.data,
          payload: 'notifications',
        );
      }

      await _logActivity('notification', title, body);
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling generic notification: $e');
    }
  }

  /// Handle notification tap
  void _handleNotificationTap(RemoteMessage message) {
    try {
      final data = message.data;
      final payload =
          data['payload'] ??
          data['notification_type'] ??
          data['type'] ??
          'home';

      _routingService.handleNotificationTap(
        payload: payload.toString(),
        title: message.notification?.title,
        body: message.notification?.body,
      );
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling tap: $e');
    }
  }

  /// Check if message is an incoming call
  bool _isIncomingCall(String type, Map<String, dynamic> data) {
    return type == 'incoming_call' ||
        type == 'call' ||
        data['call_id'] != null ||
        data['callId'] != null ||
        data['caller_id'] != null;
  }

  /// Check if message is a new message
  bool _isNewMessage(String type, Map<String, dynamic> data) {
    return type == 'message' ||
        type == 'chat' ||
        data['message'] != null ||
        data['sender_id'] != null;
  }

  /// Check if message is a financial notification
  bool _isFinancialNotification(String type) {
    return type.contains('fund_receipt') ||
        type.contains('advance') ||
        type.contains('cost_submission') ||
        type.contains('withdrawal') ||
        type.contains('payment');
  }

  bool _shouldSkipMessage(
    RemoteMessage message,
    String type,
    Map<String, dynamic> data,
  ) {
    _cleanupDedupState();

    final fingerprint = _messageFingerprint(message, type, data);
    final now = DateTime.now();
    final previousSeenAt = _recentMessageFingerprints[fingerprint];

    if (previousSeenAt != null &&
        now.difference(previousSeenAt) <= _dedupWindow) {
      debugPrint(
        '[BackgroundHandler] Duplicate message suppressed: $fingerprint',
      );
      return true;
    }

    _recentMessageFingerprints[fingerprint] = now;

    final throttleKey = _throttleKey(type, data);
    final throttleWindow = _throttleWindowForType(type);
    final previousThrottleAt = _throttleKeys[throttleKey];
    if (previousThrottleAt != null &&
        now.difference(previousThrottleAt) <= throttleWindow) {
      debugPrint(
        '[BackgroundHandler] Throttled message suppressed: $throttleKey',
      );
      return true;
    }

    _throttleKeys[throttleKey] = now;
    return false;
  }

  void _cleanupDedupState() {
    final cutoffDedup = DateTime.now().subtract(_dedupWindow);
    _recentMessageFingerprints.removeWhere((_, t) => t.isBefore(cutoffDedup));

    final cutoffThrottle = DateTime.now().subtract(_broadcastThrottleWindow);
    _throttleKeys.removeWhere((_, t) => t.isBefore(cutoffThrottle));
  }

  Duration _throttleWindowForType(String type) {
    if (_isIncomingCall(type, const {})) return _callThrottleWindow;
    if (type == 'broadcast') return _broadcastThrottleWindow;
    return _defaultThrottleWindow;
  }

  String _throttleKey(String type, Map<String, dynamic> data) {
    final sender = (data['sender_id'] ?? data['from'] ?? '').toString();
    final callId = (data['call_id'] ?? data['callId'] ?? '').toString();
    final broadcastId = (data['broadcast_id'] ?? '').toString();
    return '$type|$sender|$callId|$broadcastId';
  }

  String _messageFingerprint(
    RemoteMessage message,
    String type,
    Map<String, dynamic> data,
  ) {
    final messageId = message.messageId ?? '';
    final sentAt = message.sentTime?.millisecondsSinceEpoch.toString() ?? '';
    final callId = (data['call_id'] ?? data['callId'] ?? '').toString();
    final sender =
        (data['sender_id'] ?? data['from'] ?? data['caller_id'] ?? '')
            .toString();
    final title = (message.notification?.title ?? data['title'] ?? '')
        .toString();
    final body =
        (message.notification?.body ?? data['body'] ?? data['message'] ?? '')
            .toString();

    return '$messageId|$type|$callId|$sender|$title|$body|$sentAt';
  }

  String _composeBilingualText({
    String? primary,
    String? secondary,
    String? fallbackPrimary,
    String? fallbackSecondary,
  }) {
    final first = (primary?.trim().isNotEmpty ?? false)
        ? primary!.trim()
        : (fallbackPrimary?.trim() ?? '');
    final secondSource = (secondary?.trim().isNotEmpty ?? false)
        ? secondary!.trim()
        : (fallbackSecondary?.trim() ?? '');

    if (first.isEmpty) return secondSource;
    if (secondSource.isEmpty) return first;
    if (first == secondSource) return first;
    return '$first\n$secondSource';
  }

  /// Log activity to database
  Future<void> _logActivity(String type, String title, String body) async {
    try {
      final supabase = Supabase.instance.client;
      final currentUser = supabase.auth.currentUser;
      if (currentUser == null) return;

      await supabase.from('notification_activity_logs').insert({
        'user_id': currentUser.id,
        'notification_type': type,
        'title': title,
        'body': body,
        'logged_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('[BackgroundHandler] Error logging activity: $e');
    }
  }

  /// Dispose resources
  Future<void> dispose() async {
    await _routingService.dispose();
    debugPrint('[BackgroundHandler] Service disposed');
  }
}
