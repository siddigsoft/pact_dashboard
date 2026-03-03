import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import './ringtone_service.dart';
import './bilingual_notification_service.dart';

/// Enhanced notification routing service for handling all types of notifications
class NotificationRoutingService {
  static final NotificationRoutingService _instance =
      NotificationRoutingService._internal();

  factory NotificationRoutingService() => _instance;
  NotificationRoutingService._internal();

  final RingtoneService _ringtoneService = RingtoneService();
  final _supabase = Supabase.instance.client;

  bool _isInitialized = false;

  // Callback for navigation when notification is tapped
  void Function(String route, Map<String, dynamic> params)? _onNotificationTap;

  /// Initialize the notification routing service
  Future<void> initialize({
    void Function(String route, Map<String, dynamic> params)? onNotificationTap,
  }) async {
    if (_isInitialized) return;

    try {
      await _ringtoneService.initialize().timeout(
        const Duration(seconds: 5),
        onTimeout: () =>
            debugPrint('[NotificationRouting] RingtoneService init timeout'),
      );
      // BilingualNotificationService will be initialized by BackgroundNotificationHandler
      // to avoid duplicate initialization
      await BilingualNotificationService.initialize().timeout(
        const Duration(seconds: 5),
        onTimeout: () =>
            debugPrint('[NotificationRouting] BilingualService init timeout'),
      );

      _onNotificationTap = onNotificationTap;
      _isInitialized = true;

      debugPrint('[NotificationRouting] Service initialized');
    } catch (e) {
      _isInitialized = true; // Mark as initialized even if failed
      debugPrint('[NotificationRouting] Initialization error: $e');
    }
  }

  /// Handle incoming call notification
  Future<void> handleIncomingCall({
    required String callerId,
    required String callerName,
    required String callId,
    String? callerAvatar,
    bool isVideoCall = false,
  }) async {
    try {
      // Play ringtone
      await _ringtoneService.playIncomingCallRingtone();

      // Show notification
      await BilingualNotificationService.showIncomingCallNotification(
        callerName: callerName,
        callId: callId,
      );

      debugPrint(
        '[NotificationRouting] Incoming call handled: $callerName (callId: $callId)',
      );
    } catch (e) {
      debugPrint('[NotificationRouting] Error handling incoming call: $e');
    }
  }

  /// Handle new message notification
  Future<void> handleNewMessage({
    required String senderId,
    required String senderName,
    required String messagePreview,
    String? senderAvatar,
  }) async {
    try {
      // Play message ringtone
      await _ringtoneService.playMessageRingtone();

      // Show notification
      await BilingualNotificationService.showRawNotification(
        title: senderName,
        body: messagePreview,
        payload: 'chat:$senderId',
      );

      debugPrint('[NotificationRouting] Message handled: from $senderName');
    } catch (e) {
      debugPrint('[NotificationRouting] Error handling message: $e');
    }
  }

  /// Handle generic notification
  Future<void> handleNotification({
    required String type,
    required String title,
    required String body,
    required Map<String, dynamic> data,
    String? payload,
  }) async {
    try {
      // Play notification ringtone
      await _ringtoneService.playNotificationRingtone();

      // Show notification
      await BilingualNotificationService.showRawNotification(
        title: title,
        body: body,
        payload: payload ?? type,
      );

      // Log notification
      await _logNotification(type, title, body);

      debugPrint('[NotificationRouting] Notification handled: $type - $title');
    } catch (e) {
      debugPrint('[NotificationRouting] Error handling notification: $e');
    }
  }

  /// Handle notification tap
  void handleNotificationTap({
    required String payload,
    String? title,
    String? body,
  }) {
    try {
      // Stop ringtone if playing
      _ringtoneService.stopRingtone();

      // Route based on payload
      if (payload.startsWith('chat:')) {
        final userId = payload.replaceFirst('chat:', '');
        _navigate('chat', {'userId': userId});
      } else if (payload.startsWith('call:')) {
        final callId = payload.replaceFirst('call:', '');
        _navigate('call', {'callId': callId});
      } else if (payload == 'communications') {
        _navigate('communications', {});
      } else if (payload == 'wallet:advances') {
        _navigate('wallet', {'tab': 'advances'});
      } else if (payload == 'wallet:cost_payments') {
        _navigate('wallet', {'tab': 'cost_payments'});
      } else if (payload == 'notifications') {
        _navigate('notifications', {});
      } else {
        _navigate('home', {});
      }

      debugPrint('[NotificationRouting] Notification tap handled: $payload');
    } catch (e) {
      debugPrint('[NotificationRouting] Error handling tap: $e');
    }
  }

  /// Stop all active sounds (called when user answers/declines call)
  Future<void> stopAllSounds() async {
    try {
      await _ringtoneService.stopRingtone();
      debugPrint('[NotificationRouting] All sounds stopped');
    } catch (e) {
      debugPrint('[NotificationRouting] Error stopping sounds: $e');
    }
  }

  /// Internal: Navigate and call callback
  void _navigate(String route, Map<String, dynamic> params) {
    _onNotificationTap?.call(route, params);
  }

  /// Log notification to database for history/analytics
  Future<void> _logNotification(String type, String title, String body) async {
    try {
      final currentUser = _supabase.auth.currentUser;
      if (currentUser == null) return;

      await _supabase.from('notification_logs').insert({
        'user_id': currentUser.id,
        'type': type,
        'title': title,
        'body': body,
        'received_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('[NotificationRouting] Error logging notification: $e');
    }
  }

  /// Dispose resources
  Future<void> dispose() async {
    await _ringtoneService.dispose();
    debugPrint('[NotificationRouting] Service disposed');
  }
}
