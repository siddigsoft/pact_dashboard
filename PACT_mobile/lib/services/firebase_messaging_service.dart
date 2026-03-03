import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Firebase Cloud Messaging service for handling push notifications
class FirebaseMessagingService {
  static final FirebaseMessagingService _instance =
      FirebaseMessagingService._internal();

  factory FirebaseMessagingService() => _instance;
  FirebaseMessagingService._internal();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;

  /// Initialize Firebase Messaging
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      // Request notification permissions
      final settings = await _firebaseMessaging.requestPermission(
        alert: true,
        announcement: true,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      debugPrint(
        '[Firebase] Permission status: ${settings.authorizationStatus}',
      );

      // Initialize local notifications
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

      // Set up message handlers
      _setupMessageHandlers();

      // Get and log FCM token
      final token = await getToken();
      debugPrint('[Firebase] FCM Token: $token');

      _initialized = true;
      debugPrint('[Firebase] Messaging initialized successfully');
    } catch (e) {
      debugPrint('[Firebase] Initialization error: $e');
    }
  }

  void _setupMessageHandlers() {
    // Handle notifications when app is in foreground
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint(
        '[Firebase] Foreground message: {title: ${message.notification?.title}, body: ${message.notification?.body}}',
      );
      _handleForegroundMessage(message);
    });

    // Handle notification tap when app is opened from background
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint('[Firebase] Message opened from background: ${message.data}');
      _handleMessageTap(message);
    });
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    // Show notification even when app is in foreground
    if (message.notification != null) {
      await _showNotification(
        message.notification!.title ?? 'PACT Call',
        message.notification!.body ?? 'Incoming notification',
        message.data,
      );
    }
  }

  Future<void> _handleMessageTap(RemoteMessage message) async {
    final type = message.data['type'];

    if (type == 'incoming_call') {
      debugPrint('[Firebase] Handling incoming call...');
      // Route to incoming call screen
    } else if (type == 'message') {
      debugPrint('[Firebase] Handling message...');
      // Route to chat screen
    }
  }

  Future<void> _showNotification(
    String title,
    String body,
    Map<String, dynamic> data,
  ) async {
    try {
      const AndroidNotificationDetails androidDetails =
          AndroidNotificationDetails(
            'pact_calls',
            'PACT Calls',
            channelDescription: 'Notifications for incoming calls',
            importance: Importance.max,
            priority: Priority.high,
            fullScreenIntent: true,
            sound: RawResourceAndroidNotificationSound('notification'),
            enableVibration: true,
            playSound: true,
          );

      const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        sound: 'notification.aiff',
      );

      final NotificationDetails notificationDetails = NotificationDetails(
        android: androidDetails,
        iOS: iOSDetails,
      );

      await _localNotifications.show(
        data.hashCode,
        title,
        body,
        notificationDetails,
        payload: data.toString(),
      );

      debugPrint('[Firebase] Notification shown');
    } catch (e) {
      debugPrint('[Firebase] Error showing notification: $e');
    }
  }

  /// Get FCM token
  Future<String?> getToken() async {
    try {
      return await _firebaseMessaging.getToken();
    } catch (e) {
      debugPrint('[Firebase] Error getting token: $e');
      return null;
    }
  }

  /// Subscribe to topic
  Future<void> subscribeToTopic(String topic) async {
    try {
      await _firebaseMessaging.subscribeToTopic(topic);
      debugPrint('[Firebase] Subscribed to topic: $topic');
    } catch (e) {
      debugPrint('[Firebase] Error subscribing to topic: $e');
    }
  }

  /// Unsubscribe from topic
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _firebaseMessaging.unsubscribeFromTopic(topic);
      debugPrint('[Firebase] Unsubscribed from topic: $topic');
    } catch (e) {
      debugPrint('[Firebase] Error unsubscribing from topic: $e');
    }
  }

  bool get isInitialized => _initialized;
}

/// Background message handler - runs outside app context
@pragma('vm:entry-point')
Future<void> firebaseBackgroundMessageHandler(RemoteMessage message) async {
  debugPrint(
    '[Firebase] Background message: {title: ${message.notification?.title}, body: ${message.notification?.body}}',
  );

  // Handle the message even when app is completely closed
  // This is important for missed calls and urgent messages
  final type = message.data['type'];

  if (type == 'incoming_call') {
    debugPrint('[Firebase] Background call received');
    // Mark as missed call in database
  }
}
