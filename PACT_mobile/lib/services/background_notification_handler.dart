import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_core/firebase_core.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import './notification_routing_service.dart';
import './bilingual_notification_service.dart';
import './debug_log_service.dart';
import './call_diagnostics_store.dart';
import './agora_call_service.dart';
import './background_message_router.dart';
import './call_notification_service.dart';
import './ringtone_service.dart';

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
  final BackgroundMessageRouter _messageRouter = BackgroundMessageRouter();

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
      debugLog('BackgroundHandler', 'initialize() ENTER');

      // Ensure Firebase is initialized before touching FirebaseMessaging.instance.
      // This can be called from both foreground and background isolates.
      if (!kIsWeb) {
        try {
          await Firebase.initializeApp().timeout(const Duration(seconds: 8));
          debugLog('BackgroundHandler', 'Firebase.initializeApp() OK');
        } catch (e) {
          // It's OK if it's already initialized; log for diagnostics either way.
          debugLog(
            'BackgroundHandler',
            'Firebase.initializeApp() skipped/failed: $e',
          );
        }
      }

      // Initialize services with timeout
      try {
        await BilingualNotificationService.initialize().timeout(
          const Duration(seconds: 5),
        );
      } catch (e) {
        debugPrint('[BackgroundHandler] BilingualService init error: $e');
        debugLog('BackgroundHandler', 'BilingualService init error: $e');
      }

      // Initialize message router
      try {
        await _messageRouter.initialize().timeout(const Duration(seconds: 5));
        debugPrint('[BackgroundHandler] Message router initialized');
      } catch (e) {
        debugPrint('[BackgroundHandler] Message router init error: $e');
      }

      // Initialize NotificationRoutingService (for handling notifications and showing dialogs)
      // This is critical for background and foreground message handling
      try {
        await _routingService.initialize().timeout(const Duration(seconds: 5));
        debugPrint(
          '[BackgroundHandler] NotificationRoutingService initialized',
        );
        debugLog('BackgroundHandler', 'NotificationRoutingService initialized');
      } catch (e) {
        debugPrint(
          '[BackgroundHandler] NotificationRoutingService init error: $e',
        );
        debugLog(
          'BackgroundHandler',
          'NotificationRoutingService init error: $e',
        );
      }

      // Note: NotificationRoutingService may also be initialized in main.dart with navigation
      // callback for better routing, but we initialize it here too to ensure it's available
      // in background isolates where main.dart doesn't run

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
          debugLog(
            'BackgroundHandler',
            'Permission status: ${settings.authorizationStatus}',
          );
        } on TimeoutException {
          debugPrint('[BackgroundHandler] Permission request timeout');
          debugLog('BackgroundHandler', 'Permission request timeout');
        } catch (e) {
          debugPrint('[BackgroundHandler] Permission request error: $e');
          debugLog('BackgroundHandler', 'Permission request error: $e');
        }

        // Setup all message handlers
        _setupForegroundHandler();
        _setupBackgroundHandler();
        _setupTerminatedStateHandler();

        // Get, log, and persist FCM token (with timeout)
        try {
          final token = await _firebaseMessaging.getToken().timeout(
            const Duration(seconds: 10),
          );
          if (token != null) {
            debugPrint('[BackgroundHandler] FCM Token: $token');
            debugLog('FCM', 'Token: $token');
            // Save token to profiles.fcm_tokens so the Edge Function can reach this device
            _saveFcmTokenToProfile(token);
          }
        } on TimeoutException {
          debugPrint('[BackgroundHandler] FCM getToken timeout');
          debugLog('FCM', 'getToken timeout');
        } catch (e) {
          debugPrint('[BackgroundHandler] Error getting FCM token: $e');
          debugLog('FCM', 'getToken error: $e');
        }

        // Listen for token refreshes
        _firebaseMessaging.onTokenRefresh.listen((newToken) {
          debugLog('FCM', 'Token refreshed: ${newToken.substring(0, 20)}...');
          _saveFcmTokenToProfile(newToken);
        });
      } else {
        debugPrint(
          '[BackgroundHandler] Running on web - Firebase operations skipped',
        );
        debugLog('BackgroundHandler', 'Web: Firebase ops skipped');
      }

      _isInitialized = true;
      debugPrint(
        '[BackgroundHandler] ========== INITIALIZED SUCCESSFULLY ==========',
      );
      debugPrint('[BackgroundHandler] Ready to receive:');
      debugPrint(
        '[BackgroundHandler]   - Incoming calls (type: incoming_call)',
      );
      debugPrint('[BackgroundHandler]   - Missed calls (type: missed_call)');
      debugPrint('[BackgroundHandler]   - Messages (type: message)');
      debugLog('BackgroundHandler', 'Initialized successfully');
    } catch (e) {
      _isInitialized =
          true; // Mark as initialized even if failed to prevent retries
      debugPrint('[BackgroundHandler] Initialization error: $e');
      debugLog('BackgroundHandler', 'Initialization error: $e');
    }
  }

  /// Setup foreground message handler (app is open and in focus)
  void _setupForegroundHandler() {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint(
        '[BackgroundHandler] Foreground message: ${message.notification?.title}',
      );
      debugLog(
        'FCM',
        'onMessage (foreground) messageId=${message.messageId} '
            'title=${message.notification?.title} data=${message.data}',
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
      debugLog(
        'FCM',
        'onMessageOpenedApp (tap) messageId=${message.messageId} '
            'title=${message.notification?.title} data=${message.data}',
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
      debugLog(
        'FCM',
        'getInitialMessage (terminated tap) messageId=${initialMessage.messageId} '
            'title=${initialMessage.notification?.title} data=${initialMessage.data}',
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
      debugPrint(
        '[BackgroundHandler] handleMessage ENTER isBackground=$isBackground '
        'messageId=${message.messageId} sentTime=${message.sentTime} '
        'rawType=${data['type'] ?? data['notification_type'] ?? data['event']} '
        'data=${message.data}',
      );
      debugLog(
        'BackgroundHandler',
        'handleMessage isBackground=$isBackground messageId=${message.messageId} '
            'sentTime=${message.sentTime} data=$data',
      );
      final type = _resolveNotificationType(message, data);
      debugPrint('[BackgroundHandler] Resolved type: "$type"');
      debugLog('BackgroundHandler', 'Resolved type="$type"');

      if (_shouldSkipMessage(message, type, data)) {
        debugPrint(
          '[BackgroundHandler] Message skipped by dedup/throttle. '
          'type=$type messageId=${message.messageId}',
        );
        debugLog(
          'BackgroundHandler',
          'Skipped by dedup/throttle type=$type messageId=${message.messageId}',
        );
        return;
      }

      debugPrint(
        '[BackgroundHandler] Processing message type: $type, isBackground: $isBackground',
      );

      // ───────────────────────────────────────────────────────────────
      // 🔴 CRITICAL: HIGH PRIORITY MISSED CALL DETECTION
      // Check FIRST with aggressive detection for all missed call variations
      // ───────────────────────────────────────────────────────────────
      if (_isMissedCall(type, data)) {
        debugPrint(
          '[BackgroundHandler] 🔴 HIGH PRIORITY: MISSED CALL DETECTED',
        );
        debugLog(
          'BackgroundHandler',
          '🔴 MISSED CALL: Showing notification immediately',
        );
        await _handleMissedCall(message, data);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // INCOMING CALL (highest priority)
      // ───────────────────────────────────────────────────────────────
      if (_isIncomingCall(type, data)) {
        await CallDiagnosticsStore.saveLastIncomingInvite({
          'source': isBackground ? 'fcm_background' : 'fcm_foreground',
          'messageId': message.messageId,
          'sentTime': message.sentTime?.toIso8601String(),
          'data': data,
        });

        // When app is in foreground, Supabase Realtime already delivers the
        // call invite and shows the dialog. Skip the FCM duplicate to prevent
        // ghost calls (double ring, double notification, double reject).
        if (!isBackground) {
          final callId = (data['call_id'] ?? data['callId'] ?? '').toString();
          if (callId.isNotEmpty &&
              AgoraCallService().isCallAlreadyProcessed(callId)) {
            debugPrint(
              '[BackgroundHandler] SKIP foreground FCM call — already handled by Realtime callId=$callId',
            );
            debugLog(
              'BackgroundHandler',
              'SKIP foreground FCM call — already handled by Realtime callId=$callId',
            );
            return;
          }
        }

        await _handleIncomingCall(message, data);
        return;
      }

      // ───────────────────────────────────────────────────────────────
      // 🔴 CRITICAL: HIGH PRIORITY MESSAGE DETECTION
      // Check with aggressive detection for all message variations
      // ───────────────────────────────────────────────────────────────
      if (_isNewMessage(type, data)) {
        debugPrint('[BackgroundHandler] 🔴 HIGH PRIORITY: MESSAGE DETECTED');
        debugLog(
          'BackgroundHandler',
          '🔴 MESSAGE: Showing notification immediately',
        );
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
      debugLog('BackgroundHandler', 'Error handling message: $e');
    }
  }

  Map<String, dynamic> _normalizeCallPayload(
    Map<String, dynamic> data,
    String callerName,
    String callId,
    dynamic callerAvatar,
    bool isVideoCall,
  ) {
    return {
      'call_id': callId,
      'channel_name': data['channel_name'] ?? data['channelName'] ?? '',
      'from': data['from'] ?? data['caller_id'] ?? '',
      'caller_name': callerName,
      'caller_avatar': callerAvatar?.toString(),
      'is_audio_only': !isVideoCall,
    };
  }

  /// Handle incoming call notification
  Future<void> _handleIncomingCall(
    RemoteMessage message,
    Map<String, dynamic> data,
  ) async {
    try {
      debugPrint(
        '[BackgroundHandler] _handleIncomingCall ENTER '
        'messageId=${message.messageId} data=$data',
      );
      debugLog(
        'CALL',
        'Incoming call detected messageId=${message.messageId} data=$data',
      );
      final callerName =
          data['caller_name'] ??
          data['fromName'] ??
          message.notification?.title ??
          'Unknown Caller';
      final callId = (data['call_id'] ?? data['callId'] ?? '').toString();
      final callerAvatar = data['caller_avatar'] ?? data['fromAvatar'];
      // FCM data values are always strings; parse is_audio_only correctly
      final rawAudioOnly = (data['is_audio_only'] ?? '')
          .toString()
          .toLowerCase();
      final isAudioOnly = rawAudioOnly == 'true' || rawAudioOnly == '1';
      final isVideoCall =
          !isAudioOnly &&
          (data['is_video_call'] ?? data['callType'] ?? '')
                  .toString()
                  .toLowerCase() ==
              'video';

      // Pass full data as callPayload so notification tap opens app with channel_name etc. for background/killed
      final normalizedPayload = _normalizeCallPayload(
        data,
        callerName,
        callId,
        callerAvatar,
        isVideoCall,
      );
      debugPrint(
        '[BackgroundHandler] Normalized call payload for routing: '
        'callId=$callId channel=${normalizedPayload['channel_name']} '
        'from=${normalizedPayload['from']} isAudioOnly=${normalizedPayload['is_audio_only']}',
      );
      debugLog(
        'CALL',
        'Normalized payload callId=$callId channel=${normalizedPayload['channel_name']} '
            'from=${normalizedPayload['from']} isAudioOnly=${normalizedPayload['is_audio_only']}',
      );

      // ========================================
      // STEP 1: Initialize RingtoneService and play ringtone immediately
      // ========================================
      try {
        final ringtone = RingtoneService();
        await ringtone.initialize();
        debugPrint(
          '[BackgroundHandler] RingtoneService initialized, starting playback...',
        );
        await ringtone.playIncomingCallRingtone();
        debugPrint('[BackgroundHandler] ✅ RINGTONE PLAYING');
        debugLog('CALL', 'Ringtone started');
      } catch (e) {
        debugPrint('[BackgroundHandler] ⚠️ Error playing ringtone: $e');
        debugLog('CALL', 'Ringtone error: $e');
      }

      // ========================================
      // STEP 2: Show incoming call notification (system notification)
      // ========================================
      try {
        final callNotificationService = CallNotificationService();
        await callNotificationService.initialize();
        await callNotificationService.showIncomingCallNotification(
          callId: callId,
          callerId: (data['from'] ?? data['caller_id'] ?? '').toString(),
          callerName: callerName,
          callerAvatar: callerAvatar as String?,
          isVideoCall: isVideoCall,
          channelName: (data['channel_name'] ?? data['channelName'] ?? '')
              .toString(),
        );
        debugPrint('[BackgroundHandler] ✅ CALL NOTIFICATION DISPLAYED');
        debugLog('CALL', 'Call notification shown');
      } catch (e) {
        debugPrint(
          '[BackgroundHandler] ⚠️ Error showing call notification: $e',
        );
        debugLog('CALL', 'Notification error: $e');
      }

      // ========================================
      // STEP 3: Handle through routing service (for dialogs and UI)
      // ========================================
      try {
        // Ensure routing service is initialized
        if (!_routingService.isInitialized) {
          await _routingService.initialize();
        }

        await _routingService.handleIncomingCall(
          callerId: (data['from'] ?? data['caller_id'] ?? '').toString(),
          callerName: callerName,
          callId: callId,
          callerAvatar: callerAvatar,
          isVideoCall: isVideoCall,
          callPayload: normalizedPayload,
        );
        debugPrint('[BackgroundHandler] ✅ ROUTING SERVICE HANDLED CALL');
      } catch (e) {
        debugPrint('[BackgroundHandler] ⚠️ Error in routing service: $e');
        debugLog('CALL', 'Routing error: $e');
      }

      // Log incoming call
      await _logActivity('incoming_call', callerName, 'Received incoming call');

      debugPrint('[BackgroundHandler] ✅ INCOMING CALL FULLY PROCESSED');
      debugLog('CALL', 'Incoming call fully processed');
    } catch (e) {
      debugPrint('[BackgroundHandler] ❌ Error handling incoming call: $e');
      debugLog('CALL', 'Error handling incoming call: $e');
    }
  }

  /// Handle missed call notification with enhanced logging
  Future<void> _handleMissedCall(
    RemoteMessage message,
    Map<String, dynamic> data,
  ) async {
    try {
      final callerName =
          data['caller_name'] ??
          data['fromName'] ??
          data['sender_name'] ??
          message.notification?.title ??
          'Unknown Caller';
      final payload = (data['payload'] ?? '').toString();
      String callId =
          (data['call_id'] ?? data['callId'] ?? data['related_id'] ?? '')
              .toString();
      if (callId.isEmpty && payload.toLowerCase().startsWith('missed_call:')) {
        callId = payload.split(':').skip(1).join(':');
      }

      debugPrint('[BackgroundHandler] ✅ MISSED CALL: Showing notification');
      debugPrint('[BackgroundHandler]    Caller: $callerName');
      debugPrint('[BackgroundHandler]    Call ID: $callId');
      debugLog(
        'BackgroundHandler',
        'MISSED CALL handler: $callerName callId=$callId',
      );

      await BilingualNotificationService.showMissedCallNotification(
        callerName: callerName,
        callId: callId,
      );

      debugPrint('[BackgroundHandler] ✅ MISSED CALL notification displayed');

      await _logActivity('missed_call', callerName, 'Missed call notification');
    } catch (e) {
      debugPrint('[BackgroundHandler] ⚠️ Error handling missed call: $e');
      debugLog('BackgroundHandler', 'Error handling missed call: $e');
    }
  }

  /// Handle new message notification with enhanced logging
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
      final chatId = data['chat_id'] ?? data['chatId'] ?? senderId;
      final messageId = data['message_id'] ?? data['messageId'] ?? '';

      debugPrint('[BackgroundHandler] ✅ MESSAGE: Showing notification');
      debugPrint('[BackgroundHandler]    From: $senderName (ID: $senderId)');
      debugPrint('[BackgroundHandler]    Preview: $messagePreview');
      debugLog(
        'BackgroundHandler',
        'MESSAGE handler: from=$senderName preview=$messagePreview',
      );

      // Route through background message router for persistent storage and pop-up
      if (_messageRouter.isIncomingMessage(data)) {
        await _messageRouter.handleIncomingMessage(data);
        debugPrint(
          '[BackgroundHandler] ✅ Message routed through BackgroundMessageRouter (handles notification display)',
        );
      }

      debugPrint('[BackgroundHandler] ✅ MESSAGE notification displayed');

      // Log message received
      await _logActivity('message_received', senderName, messagePreview);
    } catch (e) {
      debugPrint('[BackgroundHandler] ⚠️ Error handling message: $e');
      debugLog('BackgroundHandler', 'Error handling message: $e');
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

      // Build payload from notification type or data
      String payload = '';

      // Check for specific payload
      if (data['payload'] != null) {
        payload = data['payload'].toString();
      } else {
        // Build payload from type
        final type = _resolveNotificationType(message, data);

        if (type.contains('incoming_call') || type.contains('call')) {
          if (data['call_id'] != null) {
            payload = 'call:${data['call_id']}';
          } else {
            payload = 'call:incoming';
          }
        } else if (type.contains('missed_call') || type.contains('missed')) {
          if (data['call_id'] != null) {
            payload = 'missed_call:${data['call_id']}';
          } else {
            payload = 'missed_call';
          }
        } else if (type.contains('message') || type.contains('chat')) {
          if (data['sender_id'] != null) {
            payload = 'chat:${data['sender_id']}';
          } else if (data['user_id'] != null) {
            payload = 'chat:${data['user_id']}';
          } else {
            payload = 'chat';
          }
        } else if (type.contains('advance_disbursed') ||
            type.contains('fund_receipt')) {
          payload = 'wallet:advances';
        } else if (type.contains('cost_submission') || type.contains('cost')) {
          payload = 'wallet:cost_payments';
        } else if (type.contains('broadcast')) {
          payload = 'notifications';
        } else if (type == 'communications') {
          payload = 'communications';
        } else {
          payload = type.isNotEmpty ? type : 'notifications';
        }
      }

      debugPrint(
        '[BackgroundHandler] Handling notification tap: type=${data['type']}, payload=$payload, title=${message.notification?.title}',
      );

      // Route the notification tap
      _routingService.handleNotificationTap(
        payload: payload,
        title: message.notification?.title,
        body: message.notification?.body,
      );
    } catch (e) {
      debugPrint('[BackgroundHandler] Error handling tap: $e');
    }
  }

  /// Check if message is an incoming call
  bool _isIncomingCall(String type, Map<String, dynamic> data) {
    final normalizedType = type.toLowerCase();
    final payload = (data['payload'] ?? '').toString().toLowerCase();
    final event = (data['event'] ?? '').toString().toLowerCase();

    if (normalizedType.contains('missed')) {
      return false;
    }
    if (payload.startsWith('missed_call')) {
      return false;
    }
    if (event.contains('missed')) {
      return false;
    }

    return normalizedType == 'incoming_call' ||
        normalizedType == 'call' ||
        payload.startsWith('call:') ||
        event.contains('incoming') ||
        data['call_id'] != null ||
        data['callId'] != null ||
        data['caller_id'] != null;
  }

  bool _isMissedCall(String type, Map<String, dynamic> data) {
    final normalizedType = type.toLowerCase();
    final payload = (data['payload'] ?? '').toString().toLowerCase();
    final status = (data['status'] ?? '').toString().toLowerCase();
    final reason = (data['reason'] ?? '').toString().toLowerCase();
    final event = (data['event'] ?? '').toString().toLowerCase();
    final title = (data['title'] ?? '').toString().toLowerCase();
    final body = (data['body'] ?? '').toString().toLowerCase();
    final callReason = (data['call_reason'] ?? '').toString().toLowerCase();
    final callStatus = (data['call_status'] ?? '').toString().toLowerCase();

    // PRIMARY CHECKS - Direct type indicators
    if (normalizedType == 'missed_call' ||
        normalizedType == 'call_missed' ||
        normalizedType.contains('missed_call')) {
      return true;
    }

    // SECONDARY CHECKS - Status and reason fields
    if (status == 'missed' ||
        callStatus == 'missed' ||
        reason.contains('missed') ||
        callReason.contains('missed')) {
      return true;
    }

    // TERTIARY CHECKS - Event and payload fields
    if (event.contains('missed') ||
        payload.startsWith('missed_call') ||
        payload.contains('missed')) {
      return true;
    }

    // QUATERNARY CHECKS - Content fields
    if (title.contains('missed') ||
        body.contains('missed') ||
        body.contains('no answer')) {
      return true;
    }

    // FALLBACK - If has call_id but status indicates end/terminate, likely missed
    if (data['call_id'] != null) {
      final isTerminated =
          normalizedType.contains('terminate') ||
          normalizedType.contains('end') ||
          normalizedType.contains('expire');
      if (isTerminated && normalizedType != 'incoming_call') {
        return true;
      }
    }

    return false;
  }

  String _resolveNotificationType(
    RemoteMessage message,
    Map<String, dynamic> data,
  ) {
    final rawType =
        (data['notification_type'] ??
                data['type'] ??
                data['event'] ??
                data['category'] ??
                '')
            .toString()
            .toLowerCase()
            .trim();

    if (rawType.isNotEmpty) {
      debugPrint(
        '[BackgroundHandler] _resolveNotificationType rawType="$rawType"',
      );
      return rawType;
    }

    final payload = (data['payload'] ?? '').toString().toLowerCase().trim();
    if (payload.contains(':')) {
      final prefix = payload.split(':').first;
      if (prefix.isNotEmpty) {
        debugPrint(
          '[BackgroundHandler] _resolveNotificationType prefix-from-payload="$prefix" '
          'payload="$payload"',
        );
        return prefix;
      }
    }
    if (payload.isNotEmpty) {
      debugPrint(
        '[BackgroundHandler] _resolveNotificationType payload-as-type "$payload"',
      );
      return payload;
    }

    final title = (message.notification?.title ?? '').toLowerCase();
    final body = (message.notification?.body ?? '').toLowerCase();

    if (title.contains('missed call') || body.contains('missed call')) {
      debugPrint(
        '[BackgroundHandler] _resolveNotificationType inferred "missed_call" from '
        'title/body: title="$title" body="$body"',
      );
      return 'missed_call';
    }
    if (title.contains('incoming call') || body.contains('incoming call')) {
      debugPrint(
        '[BackgroundHandler] _resolveNotificationType inferred "incoming_call" from '
        'title/body: title="$title" body="$body"',
      );
      return 'incoming_call';
    }

    debugPrint(
      '[BackgroundHandler] _resolveNotificationType could not determine type; defaulting to empty. '
      'dataKeys=${data.keys.toList()} title="$title" body="$body"',
    );
    return '';
  }

  /// Check if message is a new message
  bool _isNewMessage(String type, Map<String, dynamic> data) {
    final normalizedType = type.toLowerCase();

    // PRIMARY CHECKS - Direct type indicators
    if (normalizedType == 'message' ||
        normalizedType == 'chat' ||
        normalizedType == 'new_message' ||
        normalizedType == 'text_message') {
      return true;
    }

    // SECONDARY CHECKS - Content fields
    if (data['message'] != null ||
        data['body'] != null ||
        data['message_text'] != null) {
      // Must have sender info too
      if (data['sender_id'] != null ||
          data['sender_name'] != null ||
          data['from'] != null) {
        return true;
      }
    }

    // TERTIARY CHECKS - Sender fields alone (implies message)
    if (data['sender_id'] != null || data['from'] != null) {
      // If has sender_id/from and either message or chat_id, it's a message
      if (data['message'] != null ||
          data['chat_id'] != null ||
          data['chatId'] != null ||
          data['message_id'] != null) {
        return true;
      }
    }

    return false;
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
    debugPrint(
      '[BackgroundHandler] _shouldSkipMessage ENTER '
      'messageId=${message.messageId} type=$type dataFingerprintKeys=${data.keys}',
    );
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

  /// Save FCM token to profiles.fcm_tokens so the Edge Function can deliver
  /// push notifications to this device. Retries with delays for auth timing.
  void _saveFcmTokenToProfile(String token) {
    Future<void>.microtask(() async {
      int retryCount = 0;
      const maxRetries = 5;
      const delayMs = 500;

      while (retryCount < maxRetries) {
        try {
          final supabase = Supabase.instance.client;
          final userId = supabase.auth.currentUser?.id;

          if (userId == null) {
            debugLog(
              'FCM',
              'Retry $retryCount: No authenticated user yet, retrying...',
            );
            await Future.delayed(Duration(milliseconds: delayMs));
            retryCount++;
            continue;
          }

          // Successfully got user, now save token
          final profileData = await supabase
              .from('profiles')
              .select('fcm_tokens')
              .eq('id', userId)
              .maybeSingle();

          final currentTokens = List<String>.from(
            (profileData?['fcm_tokens'] as List?) ?? [],
          );

          if (!currentTokens.contains(token)) {
            currentTokens.add(token);
            // Keep only the 5 most recent tokens
            final trimmed = currentTokens.length > 5
                ? currentTokens.sublist(currentTokens.length - 5)
                : currentTokens;
            await supabase.from('profiles').update({
              'fcm_tokens': trimmed,
              'fcm_token': token,
              'fcm_token_updated_at': DateTime.now().toIso8601String(),
            }).eq('id', userId);
            debugPrint('[FCM] ✅ Token saved for user $userId');
            debugLog(
              'FCM',
              '✅ Token saved to profiles.fcm_tokens + fcm_token for user $userId',
            );
          } else {
            // Ensure legacy column is synced
            await supabase.from('profiles').update({
              'fcm_token': token,
              'fcm_token_updated_at': DateTime.now().toIso8601String(),
            }).eq('id', userId);
            debugLog('FCM', 'Token already in array; synced fcm_token for user $userId');
          }
          return; // Success, exit function
        } catch (e) {
          debugPrint('[FCM] Attempt $retryCount error: $e');
          debugLog('FCM', 'Save attempt $retryCount failed: $e');

          if (retryCount < maxRetries - 1) {
            await Future.delayed(
              Duration(milliseconds: delayMs * (retryCount + 1)),
            );
            retryCount++;
          } else {
            debugPrint(
              '[FCM] ❌ Failed to save token after $maxRetries attempts',
            );
            debugLog('FCM', '❌ Final error after $maxRetries retries: $e');
            return;
          }
        }
      }
    });
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
