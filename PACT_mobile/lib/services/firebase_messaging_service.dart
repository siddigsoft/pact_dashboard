import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../services/agora_call_service.dart';
import '../services/background_call_router.dart';
import '../services/background_message_router.dart';

/// Firebase Cloud Messaging service for handling push notifications
class FirebaseMessagingService {
  static final FirebaseMessagingService _instance =
      FirebaseMessagingService._internal();

  factory FirebaseMessagingService() => _instance;
  FirebaseMessagingService._internal();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final BackgroundCallRouter _callRouter = BackgroundCallRouter();
  final BackgroundMessageRouter _messageRouter = BackgroundMessageRouter();

  bool _initialized = false;

  /// Initialize Firebase Messaging
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      debugPrint(
        '[Firebase] ========== INITIALIZING FIREBASE MESSAGING ==========',
      );

      // Initialize background call router
      await _callRouter.initialize();
      debugPrint('[Firebase] Call router initialized');

      // Initialize background message router
      await _messageRouter.initialize();
      debugPrint('[Firebase] Message router initialized');

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

      // Get FCM token
      final token = await _firebaseMessaging.getToken();
      debugPrint('[Firebase] FCM Token: $token');
      debugPrint('[Firebase] Send test messages using this token');

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
      final fcmToken = await getToken();
      debugPrint('[Firebase] FCM Token: $fcmToken');

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
    // This is called when user taps a notification while app is NOT running
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint('[Firebase] Message opened from background: ${message.data}');
      _handleMessageOpenedAppTap(message);
    });
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    // Check if this is an incoming call
    if (_callRouter.isIncomingCall(message)) {
      debugPrint(
        '[Firebase] Incoming call in foreground — pushing to AgoraCallService',
      );
      // Store call for recovery
      await _callRouter.handleIncomingCall(message);

      // Push directly to AgoraCallService so the incoming-call dialog shows
      // immediately (MainScreen is already listening on incomingCallStream).
      final agora = AgoraCallService();
      agora.pushIncomingCallFromFcm(message.data);

      // Show notification as well (call ringing notification)
      if (message.notification != null) {
        await _showNotification(
          message.notification!.title ?? 'Incoming Call',
          message.notification!.body ?? 'Someone is calling you',
          message.data,
        );
      }
      return;
    }

    // Check if this is an incoming message - show pop-up in foreground too
    if (_messageRouter.isIncomingMessage(message.data)) {
      debugPrint('[Firebase] Incoming message in foreground — showing pop-up');
      await _messageRouter.handleIncomingMessage(message.data);
      return;
    }

    // Non-call, non-message notifications
    if (message.notification != null) {
      await _showNotification(
        message.notification!.title ?? 'PACT',
        message.notification!.body ?? 'Incoming notification',
        message.data,
      );
    }
  }

  /// Handle notification tap - routes to appropriate screen
  Future<void> _handleMessageOpenedAppTap(RemoteMessage message) async {
    final type = message.data['type'];

    if (_callRouter.isIncomingCall(message)) {
      debugPrint('[Firebase] Handling incoming call tap from notification');
      // Store for recovery
      await _callRouter.handleIncomingCall(message);
      // Also push to Agora so the call dialog / screen opens
      final agora = AgoraCallService();
      agora.pushIncomingCallFromFcm(message.data);
    } else if (type == 'message') {
      debugPrint('[Firebase] Handling message tap');
      // Route to chat screen if needed
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
            'incoming_calls',
            'Incoming Calls',
            channelDescription: 'Notifications for incoming calls',
            importance: Importance.max,
            priority: Priority.high,
            fullScreenIntent: true,
            sound: RawResourceAndroidNotificationSound('notification_sound'),
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
  final router = BackgroundCallRouter();
  await router.initialize();

  if (router.isIncomingCall(message)) {
    debugPrint('[Firebase] Background call received - storing for recovery');
    // Extract and store call data for when app opens
    final call = router.extractCallData(message);
    if (call != null) {
      await router.handleIncomingCall(message);
    }
  }
}
