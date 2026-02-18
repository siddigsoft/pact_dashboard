import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vibration/vibration.dart';

class CallNotificationService {
  static final CallNotificationService _instance =
      CallNotificationService._internal();
  factory CallNotificationService() => _instance;
  CallNotificationService._internal();

  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();

  static const _incomingCallChannelId = 'incoming_calls';
  static const _incomingCallChannelName = 'Incoming Calls';
  static const _incomingCallChannelDesc =
      'Notifications for incoming voice and video calls';

  static const _callNotificationId = 9999;

  Timer? _vibrationTimer;
  bool _isShowingCallNotification = false;

  Future<void> initialize() async {
    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _notifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
      onDidReceiveBackgroundNotificationResponse: _onBackgroundNotificationTap,
    );

    if (Platform.isAndroid) {
      final androidPlugin = _notifications
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();

      if (androidPlugin != null) {
        await androidPlugin.createNotificationChannel(
          const AndroidNotificationChannel(
            _incomingCallChannelId,
            _incomingCallChannelName,
            description: _incomingCallChannelDesc,
            importance: Importance.max,
            playSound: true,
            enableVibration: true,
            showBadge: true,
          ),
        );
      }
    }

    debugPrint('[CallNotification] Service initialized');
  }

  void _onNotificationTap(NotificationResponse response) {
    debugPrint('[CallNotification] Notification tapped: ${response.payload}');
  }

  @pragma('vm:entry-point')
  static void _onBackgroundNotificationTap(NotificationResponse response) {
    debugPrint(
      '[CallNotification] Background notification tapped: ${response.payload}',
    );
  }

  Future<void> showIncomingCallNotification({
    required String callerId,
    required String callerName,
    String? callerAvatar,
    bool isVideoCall = false,
  }) async {
    if (_isShowingCallNotification) return;
    _isShowingCallNotification = true;

    _startVibration();

    final androidDetails = AndroidNotificationDetails(
      _incomingCallChannelId,
      _incomingCallChannelName,
      channelDescription: _incomingCallChannelDesc,
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: true,
      ongoing: true,
      autoCancel: false,
      visibility: NotificationVisibility.public,
      actions: [
        const AndroidNotificationAction(
          'accept',
          'Accept',
          showsUserInterface: true,
          cancelNotification: true,
        ),
        const AndroidNotificationAction(
          'decline',
          'Decline',
          showsUserInterface: true,
          cancelNotification: true,
        ),
      ],
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      interruptionLevel: InterruptionLevel.critical,
    );

    final details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _notifications.show(
      _callNotificationId,
      isVideoCall ? 'Incoming Video Call' : 'Incoming Voice Call',
      '$callerName is calling...',
      details,
      payload: '$callerId|$callerName|${isVideoCall ? 'video' : 'audio'}',
    );

    debugPrint(
      '[CallNotification] Showing incoming call notification for: $callerName',
    );
  }

  Future<void> dismissIncomingCallNotification() async {
    _isShowingCallNotification = false;
    _stopVibration();
    await _notifications.cancel(_callNotificationId);
    debugPrint('[CallNotification] Dismissed incoming call notification');
  }

  Future<void> showMissedCallNotification({
    required String callerId,
    required String callerName,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'missed_calls',
      'Missed Calls',
      channelDescription: 'Notifications for missed calls',
      importance: Importance.high,
      priority: Priority.high,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _notifications.show(
      callerId.hashCode,
      'Missed Call',
      'You missed a call from $callerName',
      details,
      payload: '$callerId|$callerName|missed',
    );

    debugPrint(
      '[CallNotification] Showing missed call notification for: $callerName',
    );
  }

  void _startVibration() async {
    final hasVibrator = await Vibration.hasVibrator() ?? false;
    if (!hasVibrator) return;

    _vibrationTimer?.cancel();
    _vibrationTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      await Vibration.vibrate(duration: 500, amplitude: 128);
    });

    await Vibration.vibrate(duration: 500, amplitude: 128);
  }

  void _stopVibration() {
    _vibrationTimer?.cancel();
    _vibrationTimer = null;
    Vibration.cancel();
  }

  void dispose() {
    _stopVibration();
  }
}
