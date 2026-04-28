import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vibration/vibration.dart';
import './agora_call_service.dart';
import './call_diagnostics_store.dart';
import '../models/agora_incoming_call.dart';
import 'notification_gap_fixer_service.dart';
import 'notification_permission_cache_service.dart';
import 'web_notification_service.dart';

class CallNotificationService {
  static final CallNotificationService _instance =
      CallNotificationService._internal();
  factory CallNotificationService() => _instance;
  CallNotificationService._internal();

  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();

  // Channel ID bumped to v2 to force Android to recreate the channel
  // with the correct notification_sound raw resource.
  static const _incomingCallChannelId = 'incoming_calls_v2';
  static const _incomingCallChannelName = 'Incoming Calls';
  static const _incomingCallChannelDesc =
      'Notifications for incoming voice and video calls';

  // Map to track active call notifications by callId
  final Map<String, int> _activeCallNotifications = {};
  Timer? _vibrationTimer;

  // Track vibration for each call separately
  final Map<String, bool> _callVibrating = {};

  Future<void> initialize() async {
    // GAP #1 FIX: Initialize gap fixer to detect API level
    final gapFixer = NotificationGapFixerService();
    await gapFixer.initialize();

    // GAP #4 FIX: Initialize web notifications
    if (kIsWeb) {
      final webService = WebNotificationService();
      await webService.initialize();
      debugPrint('[CallNotification] Web notifications initialized');
    }

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
    debugPrint(
      '[CallNotification] Notification tapped: ${response.payload}, actionId: ${response.actionId}',
    );

    // Handle action button taps (Accept/Decline)
    final actionId = response.actionId ?? '';
    final payload = response.payload ?? '';
    if (actionId.startsWith('accept_')) {
      final callId = actionId.replaceFirst('accept_', '');
      _handleAcceptCallAction(callId, payload);
    } else if (actionId.startsWith('decline_')) {
      final callId = actionId.replaceFirst('decline_', '');
      _handleDeclineCallAction(callId, payload);
    }
    // Handle regular tap (open app)
    else {
      _handleNotificationTap(payload);
    }
  }

  // Helper to handle async action processing in background
  void _processActionInBackground(Future<void> Function() action) {
    // Fire and forget - process in background
    Future.microtask(() async {
      try {
        await action();
      } catch (e) {
        debugPrint('[CallNotification] Error processing action: $e');
      }
    });
  }

  void _handleAcceptCallAction(String callId, String notificationPayload) {
    _processActionInBackground(() async {
      try {
        debugPrint(
          '[CallNotification] Accept button tapped for callId: $callId',
        );

        final agoraService = AgoraCallService();
        AgoraIncomingCall? incomingCall = agoraService.getIncomingCallById(
          callId,
        );

        // If call is not in memory (app was backgrounded/killed), recover from diagnostics store
        if (incomingCall == null) {
          debugPrint(
            '[CallNotification] Call not in memory, recovering from diagnostics store...',
          );
          incomingCall = await recoverIncomingCallFromStore(
            callId,
            autoAccept: true,
          );
        }

        // Fallback: parse the notification payload directly (covers case where
        // diagnostics store has stale/different call data)
        if (incomingCall == null && notificationPayload.isNotEmpty) {
          debugPrint(
            '[CallNotification] Diagnostics store failed, parsing notification payload...',
          );
          incomingCall = _recoverCallFromPayload(
            notificationPayload,
            callId,
            autoAccept: true,
          );
        }

        if (incomingCall == null) {
          debugPrint(
            '[CallNotification] Cannot recover call data for callId: $callId',
          );
          return;
        }

        // Push as auto-accept call so the UI opens the call screen and accepts immediately
        final autoAcceptCall = AgoraIncomingCall(
          callId: incomingCall.callId,
          channelName: incomingCall.channelName,
          callerId: incomingCall.callerId,
          callerName: incomingCall.callerName,
          callerAvatar: incomingCall.callerAvatar,
          isAudioOnly: incomingCall.isAudioOnly,
          autoAccept: true,
        );
        agoraService.pushAutoAcceptCall(autoAcceptCall);
        debugPrint('[CallNotification] Auto-accept call pushed: $callId');

        // Dismiss the notification
        await dismissIncomingCallNotification(callId);
      } catch (e) {
        debugPrint('[CallNotification] Error accepting call: $e');
      }
    });
  }

  void _handleDeclineCallAction(String callId, String notificationPayload) {
    _processActionInBackground(() async {
      try {
        debugPrint(
          '[CallNotification] Decline button tapped for callId: $callId',
        );

        // Dismiss the notification and stop vibration/ringtone
        await dismissIncomingCallNotification(callId);

        // Try to decline via AgoraCallService (in-memory call)
        final agoraService = AgoraCallService();
        AgoraIncomingCall? incomingCall = agoraService.getIncomingCallById(
          callId,
        );

        // If not in memory, recover from diagnostics store
        if (incomingCall == null) {
          incomingCall = await recoverIncomingCallFromStore(callId);
        }

        // Fallback: parse the notification payload directly
        if (incomingCall == null && notificationPayload.isNotEmpty) {
          incomingCall = _recoverCallFromPayload(notificationPayload, callId);
        }

        if (incomingCall != null) {
          await agoraService.rejectCall(incomingCall);
          debugPrint('[CallNotification] Call declined: $callId');
        } else {
          // Last resort: try sendCallDecline which also checks in-memory
          try {
            await agoraService.sendCallDecline(callId);
            debugPrint(
              '[CallNotification] Call declined via sendCallDecline: $callId',
            );
          } catch (e) {
            debugPrint(
              '[CallNotification] Could not decline call (no call data): $e',
            );
          }
        }

        // Clear stored call data
        await CallDiagnosticsStore.clearLastIncomingInvite();
      } catch (e) {
        debugPrint('[CallNotification] Error declining call: $e');
      }
    });
  }

  void _handleNotificationTap(String payload) {
    debugPrint('[CallNotification] Notification body tap: $payload');
    // When user taps the notification body, set pending FCM call so
    // MainLayout opens the incoming call dialog on resume.
    if (payload.isNotEmpty) {
      try {
        // First try structured payload format: call:CALLID:CALLERID|NAME|TYPE|CHANNEL
        final parsed = NotificationGapFixerService.parseNotificationPayload(
          payload,
        );
        if (parsed['type'] == 'call') {
          final callData = <String, dynamic>{
            'call_id': parsed['callId'] ?? '',
            'from': parsed['callerId'] ?? '',
            'caller_name': parsed['callerName'] ?? 'Unknown',
            'channel_name': parsed['channelName'] ?? '',
            'is_audio_only': parsed['isVideoCall'] != 'true',
          };
          AgoraCallService().setPendingFcmCall(callData);
          debugPrint(
            '[CallNotification] Set pending call from parsed payload: $callData',
          );
          return;
        }

        // Legacy: try JSON payload
        final trimmed = payload.trimLeft();
        if (trimmed.startsWith('{')) {
          final decoded = jsonDecode(payload);
          if (decoded is Map<String, dynamic>) {
            AgoraCallService().setPendingFcmCall(decoded);
          }
        }
      } catch (e) {
        debugPrint(
          '[CallNotification] Error parsing notification tap payload: $e',
        );
      }
    }
  }

  @pragma('vm:entry-point')
  static void _onBackgroundNotificationTap(NotificationResponse response) {
    debugPrint(
      '[CallNotification] Background notification tapped: ${response.payload}, actionId: ${response.actionId}',
    );

    // When action buttons are pressed in background, save a pending action
    // so the foreground isolate can pick it up when it resumes.
    final actionId = response.actionId ?? '';
    if (actionId.startsWith('accept_') || actionId.startsWith('decline_')) {
      final callId = actionId.contains('_')
          ? actionId.substring(actionId.indexOf('_') + 1)
          : '';
      final action = actionId.startsWith('accept_') ? 'accept' : 'decline';

      // Save pending action to SharedPreferences (survives isolate boundaries)
      CallDiagnosticsStore.savePendingCallAction(
        actionId: action,
        callData: {'call_id': callId, 'payload': response.payload ?? ''},
      );
      debugPrint(
        '[CallNotification] Saved pending $action action for callId: $callId',
      );
    }
  }

  /// Recover incoming call data from CallDiagnosticsStore (SharedPreferences).
  /// Used when notification action is pressed but the call is not in AgoraCallService memory.
  static Future<AgoraIncomingCall?> recoverIncomingCallFromStore(
    String callId, {
    bool autoAccept = false,
  }) async {
    try {
      final raw = await CallDiagnosticsStore.loadLastIncomingInviteRaw();
      if (raw == null) return null;

      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;

      final data = decoded['data'] as Map<String, dynamic>?;
      if (data == null) return null;

      // The FCM data is nested inside 'data' key
      final fcmData = data['data'] as Map<String, dynamic>? ?? data;

      final storedCallId = (fcmData['call_id'] ?? fcmData['callId'] ?? '')
          .toString();
      // Verify the callId matches (or accept any if callId is empty)
      if (callId.isNotEmpty &&
          storedCallId.isNotEmpty &&
          storedCallId != callId) {
        debugPrint(
          '[CallNotification] Stored call ID mismatch: $storedCallId != $callId',
        );
        return null;
      }

      final channelName =
          (fcmData['channel_name'] ?? fcmData['channelName'] ?? '').toString();
      final callerId =
          (fcmData['from'] ?? fcmData['caller_id'] ?? fcmData['callerId'] ?? '')
              .toString();
      final callerName =
          (fcmData['caller_name'] ??
                  fcmData['fromName'] ??
                  fcmData['callerName'] ??
                  'Unknown')
              .toString();
      final callerAvatar =
          fcmData['caller_avatar']?.toString() ??
          fcmData['fromAvatar']?.toString();
      final rawAudioOnly = (fcmData['is_audio_only'] ?? '')
          .toString()
          .toLowerCase();
      final isAudioOnly = rawAudioOnly == 'true' || rawAudioOnly == '1';

      if (channelName.isEmpty || callerId.isEmpty) {
        debugPrint(
          '[CallNotification] Recovered call missing channelName or callerId',
        );
        return null;
      }

      debugPrint(
        '[CallNotification] Recovered call from store: callId=$storedCallId channel=$channelName caller=$callerName',
      );

      return AgoraIncomingCall(
        callId: storedCallId.isNotEmpty ? storedCallId : callId,
        channelName: channelName,
        callerId: callerId,
        callerName: callerName,
        callerAvatar: callerAvatar,
        isAudioOnly: isAudioOnly,
        autoAccept: autoAccept,
      );
    } catch (e) {
      debugPrint('[CallNotification] Error recovering call from store: $e');
      return null;
    }
  }

  /// Recover call data by parsing the notification payload string directly.
  /// Format: call:CALL_ID:CALLER_ID|CALLER_NAME|audio_or_video|CHANNEL_NAME
  static AgoraIncomingCall? _recoverCallFromPayload(
    String payload,
    String expectedCallId, {
    bool autoAccept = false,
  }) {
    try {
      final parsed = NotificationGapFixerService.parseNotificationPayload(
        payload,
      );
      if (parsed['type'] != 'call') return null;

      final callId = parsed['callId'] ?? expectedCallId;
      final callerId = parsed['callerId'] ?? '';
      final callerName = parsed['callerName'] ?? 'Unknown';
      final channelName = parsed['channelName'] ?? '';
      final isVideoCall = parsed['isVideoCall'] == 'true';

      if (callerId.isEmpty) {
        debugPrint('[CallNotification] Payload missing callerId');
        return null;
      }

      // channelName may be empty for older notifications; still try
      debugPrint(
        '[CallNotification] Recovered call from payload: callId=$callId channel=$channelName caller=$callerName',
      );

      return AgoraIncomingCall(
        callId: callId,
        channelName: channelName,
        callerId: callerId,
        callerName: callerName,
        isAudioOnly: !isVideoCall,
        autoAccept: autoAccept,
      );
    } catch (e) {
      debugPrint('[CallNotification] Error parsing payload: $e');
      return null;
    }
  }

  Future<void> showIncomingCallNotification({
    required String callId,
    required String callerId,
    required String callerName,
    String? callerAvatar,
    bool isVideoCall = false,
    String channelName = '',
  }) async {
    // Generate unique notification ID from callId
    final notificationId = _generateNotificationId(callId);

    // Track this notification
    _activeCallNotifications[callId] = notificationId;
    _callVibrating[callId] = true;

    _startVibration(callId);

    // GAP #1 FIX: Use safe fullScreenIntent based on API level
    final gapFixer = NotificationGapFixerService();

    // GAP #2 FIX: Build proper payload for tap routing
    final payload = NotificationGapFixerService.buildCallNotificationPayload(
      callId: callId,
      callerId: callerId,
      callerName: callerName,
      isVideoCall: isVideoCall,
      channelName: channelName,
    );

    final androidDetails = AndroidNotificationDetails(
      _incomingCallChannelId,
      _incomingCallChannelName,
      channelDescription: _incomingCallChannelDesc,
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: gapFixer
          .getSafeFullScreenIntent(), // GAP #1: API-safe value
      groupKey:
          NotificationGapFixerService.getCallGroupKey(), // GAP #5: Grouping
      setAsGroupSummary: false,
      ongoing: true,
      autoCancel: false,
      visibility: NotificationVisibility.public,
      // Enhanced styling - bigger and more modern
      color: Color(0xFF2196F3),
      colorized: true,
      styleInformation: BigTextStyleInformation(
        isVideoCall ? 'Incoming Video Call 📹' : 'Incoming Voice Call ☎️',
        contentTitle: '$callerName is calling',
        summaryText: isVideoCall ? 'Video Call' : 'Voice Call',
        htmlFormatBigText: true,
        htmlFormatContentTitle: true,
        htmlFormatSummaryText: true,
      ),
      sound: RawResourceAndroidNotificationSound('notification_sound'),
      ticker: '$callerName is calling...',
      actions: [
        AndroidNotificationAction(
          'accept_$callId',
          'Accept',
          showsUserInterface: true,
          cancelNotification: true,
        ),
        AndroidNotificationAction(
          'decline_$callId',
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

    try {
      await _notifications.show(
        notificationId,
        isVideoCall ? 'Incoming Video Call' : 'Incoming Voice Call',
        '$callerName is calling...',
        details,
        payload: payload, // GAP #2: Use structured payload
      );
    } catch (e) {
      // If notification fails (e.g. invalid sound resource), retry without custom sound
      debugPrint(
        '[CallNotification] Notification failed, retrying without custom sound: $e',
      );
      final fallbackAndroidDetails = AndroidNotificationDetails(
        _incomingCallChannelId,
        _incomingCallChannelName,
        channelDescription: _incomingCallChannelDesc,
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.call,
        fullScreenIntent: gapFixer.getSafeFullScreenIntent(),
        ongoing: true,
        autoCancel: false,
        visibility: NotificationVisibility.public,
        color: Color(0xFF2196F3),
        colorized: true,
        ticker: '$callerName is calling...',
        actions: [
          AndroidNotificationAction(
            'accept_$callId',
            'Accept',
            showsUserInterface: true,
            cancelNotification: true,
          ),
          AndroidNotificationAction(
            'decline_$callId',
            'Decline',
            showsUserInterface: true,
            cancelNotification: true,
          ),
        ],
      );
      final fallbackDetails = NotificationDetails(
        android: fallbackAndroidDetails,
        iOS: iosDetails,
      );
      await _notifications.show(
        notificationId,
        isVideoCall ? 'Incoming Video Call' : 'Incoming Voice Call',
        '$callerName is calling...',
        fallbackDetails,
        payload: payload,
      );
    }

    debugPrint(
      '[CallNotification] Showing incoming call notification for: $callerName (ID: $notificationId, callId: $callId, fullScreenIntent: ${gapFixer.getSafeFullScreenIntent()})',
    );

    // GAP #4 FIX: Show web notification
    if (kIsWeb) {
      try {
        final webService = WebNotificationService();
        await webService.showCallNotification(
          callId: callId,
          callerName: callerName,
          callType: isVideoCall ? 'video' : 'voice',
          callIcon: callerAvatar,
        );
      } catch (e) {
        debugPrint('[CallNotification] Error showing web notification: $e');
      }
    }

    // GAP #3 FIX: Cache call if permission denied (for fallback)
    _cacheCallIfNeeded(
      callId: callId,
      callerId: callerId,
      callerName: callerName,
      isVideoCall: isVideoCall,
    );
  }

  /// GAP #3: Cache call if notification permission denied
  Future<void> _cacheCallIfNeeded({
    required String callId,
    required String callerId,
    required String callerName,
    required bool isVideoCall,
  }) async {
    try {
      final cacheService = NotificationPermissionCacheService();
      if (cacheService.isPermissionDenied()) {
        await cacheService.cacheCall(
          callId: callId,
          callerId: callerId,
          callerName: callerName,
          isVideoCall: isVideoCall,
          timestamp: DateTime.now(),
        );
        debugPrint(
          '[CallNotification] Cached call from $callerName (permission denied)',
        );
      }
    } catch (e) {
      debugPrint('[CallNotification] Error caching call: $e');
    }
  }

  Future<void> dismissIncomingCallNotification(String callId) async {
    final notificationId = _activeCallNotifications.remove(callId);
    _callVibrating.remove(callId);
    _stopVibration(callId);

    // Always cancel: use tracked ID or regenerate from callId
    final idToCancel = notificationId ?? _generateNotificationId(callId);
    await _notifications.cancel(idToCancel);
    debugPrint(
      '[CallNotification] Dismissed incoming call notification (ID: $idToCancel, callId: $callId, fromMap: ${notificationId != null})',
    );
  }

  /// Dismiss all active call notifications
  Future<void> dismissAllIncomingCallNotifications() async {
    final ids = _activeCallNotifications.values.toList();
    _activeCallNotifications.clear();
    _callVibrating.clear();
    _stopVibrationAll();

    for (final id in ids) {
      await _notifications.cancel(id);
    }

    debugPrint(
      '[CallNotification] Dismissed all incoming call notifications (${ids.length} total)',
    );
  }

  Future<void> showMissedCallNotification({
    required String callerId,
    required String callerName,
  }) async {
    if (kIsWeb) {
      try {
        final webService = WebNotificationService();
        await webService.showMissedCallNotification(
          callerId: callerId,
          callerName: callerName,
        );
        debugPrint(
          '[CallNotification] Showing missed call notification for: $callerName (web)',
        );
        return;
      } catch (e) {
        debugPrint(
          '[CallNotification] Error showing missed call notification (web): $e',
        );
      }
    }

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

  void _startVibration(String callId) async {
    final hasVibrator = await Vibration.hasVibrator() ?? false;
    if (!hasVibrator) return;

    _vibrationTimer?.cancel();
    _vibrationTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      // Only vibrate if this call is still active
      if (_callVibrating[callId] == true) {
        await Vibration.vibrate(duration: 500, amplitude: 128);
      }
    });

    await Vibration.vibrate(duration: 500, amplitude: 128);
  }

  void _stopVibration(String callId) {
    _callVibrating[callId] = false;
    // Only cancel timer if no other calls are vibrating
    if (!_callVibrating.containsValue(true)) {
      _vibrationTimer?.cancel();
      _vibrationTimer = null;
      Vibration.cancel();
    }
  }

  void _stopVibrationAll() {
    _vibrationTimer?.cancel();
    _vibrationTimer = null;
    Vibration.cancel();
  }

  /// Generate unique notification ID from callId
  /// Uses hash to ensure consistency and distribute IDs across range
  int _generateNotificationId(String callId) {
    // Use absolute value of hash to ensure positive ID, then mask to 18-bit positive range
    // This gives us IDs from 1 to 262143 (more than enough for concurrent calls)
    return (callId.hashCode.abs() % 0x40000) + 1;
  }
}
