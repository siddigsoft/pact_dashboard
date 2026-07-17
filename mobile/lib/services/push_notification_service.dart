import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/chat_message.dart';

// Top-level callback for background messages
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('[FCM Background] Message received: ${message.messageId}');
  debugPrint('[FCM Background] Data: ${message.data}');

  // Handle notification while in background
  await PushNotificationService.instance.handleBackgroundMessage(message);
}

/// Handles all push notifications and background messaging
class PushNotificationService {
  static final PushNotificationService _instance =
      PushNotificationService._internal();

  factory PushNotificationService() => _instance;

  PushNotificationService._internal();

  static PushNotificationService get instance => _instance;

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  late FlutterLocalNotificationsPlugin _localNotifications;

  bool _isInitialized = false;

  StreamController<NotificationPayload> notificationStream =
      StreamController<NotificationPayload>.broadcast();

  Future<void> initialize() async {
    if (_isInitialized) return;

    debugPrint('[PushNotificationService] Initializing...');

    try {
      // Request permissions
      await _requestNotificationPermissions();

      // Initialize local notifications
      _initializeLocalNotifications();

      // Set up FCM callbacks
      _setupFCMCallbacks();

      // Get initial message if app was opened from notification
      final initialMessage = await _fcm.getInitialMessage();
      if (initialMessage != null) {
        debugPrint(
          '[PushNotificationService] Initial message: ${initialMessage.messageId}',
        );
        _handleMessage(initialMessage);
      }

      _isInitialized = true;
      debugPrint('[PushNotificationService] Initialized successfully');
    } catch (e) {
      debugPrint('[PushNotificationService] Error during initialization: $e');
    }
  }

  Future<void> _requestNotificationPermissions() async {
    final settings = await _fcm.requestPermission(
      alert: true,
      announcement: true,
      badge: true,
      criticalAlert: true,
      provisional: false,
      sound: true,
    );

    debugPrint(
      '[PushNotificationService] Permission status: ${settings.authorizationStatus}',
    );
  }

  void _initializeLocalNotifications() {
    _localNotifications = FlutterLocalNotificationsPlugin();

    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const DarwinInitializationSettings initializationSettingsIOS =
        DarwinInitializationSettings(
          requestAlertPermission: true,
          requestBadgePermission: true,
          requestSoundPermission: true,
        );

    const InitializationSettings initializationSettings =
        InitializationSettings(
          android: initializationSettingsAndroid,
          iOS: initializationSettingsIOS,
        );

    _localNotifications.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        if (response.payload != null) {
          final payload = NotificationPayload.fromJson(response.payload!);
          notificationStream.add(payload);
        }
      },
    );
  }

  void _setupFCMCallbacks() {
    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('[FCM Foreground] Message received: ${message.messageId}');
      _handleMessage(message);
    });

    // Handle background messages
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint('[FCM Opened] Message received: ${message.messageId}');
      _handleMessage(message);
    });

    // Set background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  }

  void _handleMessage(RemoteMessage message) {
    final type = message.data['type'] ?? 'message';
    final title = message.notification?.title ?? 'New Notification';
    final body = message.notification?.body ?? '';

    debugPrint('[PushNotificationService] Handling message type: $type');

    // Create payload
    final payload = NotificationPayload(
      type: type,
      title: title,
      body: body,
      senderId: message.data['sender_id'] ?? '',
      chatId: message.data['chat_id'] ?? '',
      callId: message.data['call_id'] ?? '',
      data: message.data,
    );

    // Show local notification
    _showLocalNotification(payload);

    // Emit to stream
    notificationStream.add(payload);
  }

  Future<void> _showLocalNotification(NotificationPayload payload) async {
    try {
      final isCallNotification = payload.type == 'call';
      const soundName = 'notification_sound';

      final androidNotificationDetails = AndroidNotificationDetails(
        isCallNotification ? 'call_channel_v2' : 'message_channel_v2',
        isCallNotification ? 'Incoming Calls' : 'Messages',
        channelDescription: isCallNotification
            ? 'Notifications for incoming calls'
            : 'Notifications for new messages',
        importance: isCallNotification ? Importance.max : Importance.high,
        priority: isCallNotification ? Priority.max : Priority.high,
        enableVibration: true,
        playSound: true,
        sound: RawResourceAndroidNotificationSound(soundName),
        fullScreenIntent: isCallNotification,
      );

      const iosNotificationDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );

      final notificationDetails = NotificationDetails(
        android: androidNotificationDetails,
        iOS: iosNotificationDetails,
      );

      await _localNotifications.show(
        payload.hashCode,
        payload.title,
        payload.body,
        notificationDetails,
        payload: payload.toJson(),
      );
    } catch (e) {
      debugPrint('[PushNotificationService] Error showing notification: $e');
    }
  }

  /// Handle background message - called from background handler
  Future<void> handleBackgroundMessage(RemoteMessage message) async {
    try {
      debugPrint('[FCM Background Handler] Processing: ${message.messageId}');
      _handleMessage(message);
    } catch (e) {
      debugPrint('[FCM Background Handler] Error: $e');
    }
  }

  /// Get FCM token
  Future<String?> getToken() async {
    try {
      final token = await _fcm.getToken();
      debugPrint('[PushNotificationService] FCM Token: $token');
      return token;
    } catch (e) {
      debugPrint('[PushNotificationService] Error getting token: $e');
      return null;
    }
  }

  /// Subscribe to topic
  Future<void> subscribeToTopic(String topic) async {
    try {
      await _fcm.subscribeToTopic(topic);
      debugPrint('[PushNotificationService] Subscribed to topic: $topic');
    } catch (e) {
      debugPrint('[PushNotificationService] Error subscribing to topic: $e');
    }
  }

  /// Unsubscribe from topic
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _fcm.unsubscribeFromTopic(topic);
      debugPrint('[PushNotificationService] Unsubscribed from topic: $topic');
    } catch (e) {
      debugPrint(
        '[PushNotificationService] Error unsubscribing from topic: $e',
      );
    }
  }

  void dispose() {
    notificationStream.close();
  }
}

/// Payload for handling notifications
class NotificationPayload {
  final String type; // 'call', 'message', 'broadcast'
  final String title;
  final String body;
  final String senderId;
  final String chatId;
  final String callId;
  final Map<String, dynamic> data;

  NotificationPayload({
    required this.type,
    required this.title,
    required this.body,
    required this.senderId,
    required this.chatId,
    required this.callId,
    required this.data,
  });

  factory NotificationPayload.fromJson(String jsonData) {
    try {
      final data = jsonData.split('|');
      return NotificationPayload(
        type: data.length > 0 ? data[0] : 'message',
        title: data.length > 1 ? data[1] : 'Notification',
        body: data.length > 2 ? data[2] : '',
        senderId: data.length > 3 ? data[3] : '',
        chatId: data.length > 4 ? data[4] : '',
        callId: data.length > 5 ? data[5] : '',
        data: {},
      );
    } catch (e) {
      return NotificationPayload(
        type: 'message',
        title: 'Notification',
        body: '',
        senderId: '',
        chatId: '',
        callId: '',
        data: {},
      );
    }
  }

  String toJson() => '$type|$title|$body|$senderId|$chatId|$callId';
}
