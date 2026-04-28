import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:convert';
import './ringtone_service.dart';
import './bilingual_notification_service.dart';
import './agora_call_service.dart';

/// Enhanced notification routing service for handling all types of notifications
class NotificationRoutingService {
  static final NotificationRoutingService _instance =
      NotificationRoutingService._internal();

  factory NotificationRoutingService() => _instance;
  NotificationRoutingService._internal();

  final RingtoneService _ringtoneService = RingtoneService();

  bool _isInitialized = false;
  GlobalKey<NavigatorState>? _navigatorKey;

  // Public getter for initialization status
  bool get isInitialized => _isInitialized;

  // Callback for navigation when notification is tapped
  void Function(String route, Map<String, dynamic> params)? _onNotificationTap;

  /// Register the navigator key for notification routing
  void setNavigatorKey(GlobalKey<NavigatorState> key) {
    _navigatorKey = key;
    debugPrint(
      '[NotificationRouting] NavigatorKey registered for notification routing',
    );
  }

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
  /// [callPayload] when set is stored in the notification so opening the app from the notification shows the call UI (background/killed).
  /// Note: Ringtone should already be playing from BackgroundNotificationHandler._handleIncomingCall (STEP 1)
  Future<void> handleIncomingCall({
    required String callerId,
    required String callerName,
    required String callId,
    String? callerAvatar,
    bool isVideoCall = false,
    Map<String, dynamic>? callPayload,
  }) async {
    try {
      // NOTE: CallNotificationService already shows the incoming call notification
      // So we don't need to show it again here. Just store the payload for later use.

      final payload =
          callPayload ??
          {
            'call_id': callId,
            'from': callerId,
            'caller_name': callerName,
            'caller_avatar': callerAvatar,
            'is_audio_only': !isVideoCall,
          };

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

  /// Handle message notification tap - navigate to chat
  void handleMessageNotificationTap({
    required String chatId,
    required String senderId,
    required String messageId,
  }) {
    try {
      debugPrint(
        '[NotificationRouting] Message tap: chatId=$chatId senderId=$senderId messageId=$messageId',
      );

      // Stop ringtone if playing
      _ringtoneService.stopRingtone();

      // Navigate to chat screen
      _navigate('chat', {
        'chatId': chatId,
        'senderId': senderId,
        'messageId': messageId,
      });

      debugPrint('[NotificationRouting] Navigated to chat: $chatId');
    } catch (e) {
      debugPrint('[NotificationRouting] Error on message tap: $e');
    }
  }

  /// Handle monitoring notification tap - navigate to monitoring dashboard
  void handleMonitoringNotificationTap({
    required String actionId,
    required String category,
  }) {
    try {
      debugPrint(
        '[NotificationRouting] Monitoring action tap: actionId=$actionId category=$category',
      );

      // Stop ringtone if playing
      _ringtoneService.stopRingtone();

      // Navigate to monitoring dashboard
      _navigate('admin_monitoring', {
        'actionId': actionId,
        'category': category,
      });

      debugPrint('[NotificationRouting] Navigated to monitoring: $actionId');
    } catch (e) {
      debugPrint('[NotificationRouting] Error on monitoring tap: $e');
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

      // Support JSON payloads (used by incoming call notifications so channel_name/call_id survives killed-state).
      // If this is an incoming-call payload, stash it for MainLayout to consume and open call UI.
      final trimmed = payload.trimLeft();
      if (trimmed.startsWith('{')) {
        try {
          final decoded = jsonDecode(payload);
          if (decoded is Map<String, dynamic>) {
            final hasChannel =
                decoded['channel_name'] != null ||
                decoded['channelName'] != null;
            final hasCallId =
                decoded['call_id'] != null || decoded['callId'] != null;
            final hasFrom =
                decoded['from'] != null ||
                decoded['caller_id'] != null ||
                decoded['callerId'] != null;
            if (hasChannel && hasCallId && hasFrom) {
              AgoraCallService().setPendingFcmCall(decoded);
              _navigate('call', {
                'callId': (decoded['call_id'] ?? decoded['callId']).toString(),
              });
              debugPrint('[NotificationRouting] Call JSON payload handled');
              return;
            }
          }
        } catch (_) {
          // Fall through to legacy payload routing.
        }
      }

      // Route based on payload
      if (payload.startsWith('call:')) {
        // Format: "call:callId:callerId|callerName|videoFlag"
        try {
          final callParts = payload.split(':');
          if (callParts.length >= 3) {
            final callId = callParts[1];
            debugPrint(
              '[NotificationRouting] Call payload handled: callId=$callId',
            );
            _navigate('call', {'callId': callId});
            return;
          }
        } catch (e) {
          debugPrint('[NotificationRouting] Error parsing call payload: $e');
        }
      } else if (payload.startsWith('message:')) {
        // Format: "message:chatId:senderId:messageId"
        try {
          final parts = payload.split(':');
          if (parts.length >= 4) {
            final chatId = parts[1];
            final senderId = parts[2];
            _navigate('chat', {'chatId': chatId, 'senderId': senderId});
            debugPrint(
              '[NotificationRouting] Message payload handled: chatId=$chatId senderId=$senderId',
            );
            return;
          }
        } catch (e) {
          debugPrint('[NotificationRouting] Error parsing message payload: $e');
        }
      } else if (payload.startsWith('chat:')) {
        final userId = payload.replaceFirst('chat:', '');
        _navigate('chat', {'userId': userId});
      } else if (payload.startsWith('missed_call:')) {
        final callId = payload.replaceFirst('missed_call:', '');
        _navigate('communications', {'callId': callId, 'missed': true});
      } else if (payload == 'communications') {
        _navigate('communications', {});
      } else if (payload == 'wallet:advances') {
        _navigate('wallet', {'tab': 'advances'});
      } else if (payload == 'wallet:cost_payments') {
        _navigate('wallet', {'tab': 'cost_payments'});
      } else if (payload == 'notifications') {
        _navigate('notifications', {});
      } else if (payload.startsWith('monitoring:')) {
        // Format: "monitoring:actionId:category"
        try {
          final parts = payload.split(':');
          if (parts.length >= 3) {
            final actionId = parts[1];
            final category = parts[2];
            _navigate('admin_monitoring', {
              'actionId': actionId,
              'category': category,
            });
            debugPrint(
              '[NotificationRouting] Monitoring payload handled: actionId=$actionId category=$category',
            );
            return;
          }
        } catch (e) {
          debugPrint(
            '[NotificationRouting] Error parsing monitoring payload: $e',
          );
        }
      } else if (payload == 'admin_monitoring') {
        _navigate('admin_monitoring', {});
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
    // First try the callback if registered
    if (_onNotificationTap != null) {
      _onNotificationTap!(route, params);
      return;
    }

    // Fall back to direct navigation using NavigatorKey
    if (_navigatorKey?.currentState == null) {
      debugPrint(
        '[NotificationRouting] ⚠️ Cannot navigate: no navigatorKey or navigator state',
      );
      return;
    }

    try {
      switch (route) {
        case 'chat':
          // Support both chatId and userId
          final chatId = params['chatId'] as String?;
          final userId = params['userId'] as String?;
          final navigateId = chatId ?? userId;

          if (navigateId != null) {
            debugPrint(
              '[NotificationRouting] Navigating to chat with id: $navigateId',
            );
            _navigatorKey!.currentState!.pushNamed(
              '/chat',
              arguments: navigateId, // Pass as string (can be chatId or userId)
            );
          }
          break;
        case 'call':
          final callId = params['callId'] as String?;
          if (callId != null) {
            debugPrint('[NotificationRouting] Navigating to call: $callId');
            _navigatorKey!.currentState!.pushNamed(
              '/call',
              arguments: {'callId': callId},
            );
          }
          break;
        case 'communications':
          debugPrint('[NotificationRouting] Navigating to communications');
          _navigatorKey!.currentState!.pushNamed(
            '/communications',
            arguments: params,
          );
          break;
        case 'wallet':
          debugPrint(
            '[NotificationRouting] Navigating to wallet: ${params['tab']}',
          );
          _navigatorKey!.currentState!.pushNamed('/wallet', arguments: params);
          break;
        case 'notifications':
          debugPrint('[NotificationRouting] Navigating to notifications');
          _navigatorKey!.currentState!.pushNamed('/notifications');
          break;
        case 'admin_monitoring':
          debugPrint(
            '[NotificationRouting] Navigating to admin monitoring: ${params['actionId']}',
          );
          _navigatorKey!.currentState!.pushNamed(
            '/admin_monitoring',
            arguments: params,
          );
          break;
        default:
          debugPrint('[NotificationRouting] Navigating to home');
          _navigatorKey!.currentState!.pushNamed('/main');
      }
    } catch (e) {
      debugPrint('[NotificationRouting] Error during navigation: $e');
    }
  }

  /// Log notification to database for history/analytics
  Future<void> _logNotification(String type, String title, String body) async {
    try {
      // Supabase.instance throws if not initialized, so guard it.
      final client = Supabase.instance.client;
      final currentUser = client.auth.currentUser;
      if (currentUser == null) return;

      await client.from('notification_logs').insert({
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
