import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'notification_routing_service.dart';
import 'agora_call_service.dart';
import '../models/agora_incoming_call.dart';
import 'debug_log_service.dart';
import 'call_diagnostics_store.dart';
import 'notification_gap_fixer_service.dart';

class BilingualNotificationService {
  static final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static String _currentLocale = 'en';

  static const Map<String, Map<String, String>> _translations = {
    'new_message': {'en': 'New Message', 'ar': 'رسالة جديدة'},
    'new_site_assigned': {'en': 'New Site Assigned', 'ar': 'موقع جديد مُعين'},
    'site_visit_reminder': {
      'en': 'Site Visit Reminder',
      'ar': 'تذكير بالزيارة الميدانية',
    },
    'payment_received': {'en': 'Payment Received', 'ar': 'تم استلام الدفعة'},
    'payment_pending': {'en': 'Payment Pending', 'ar': 'دفعة معلقة'},
    'sync_complete': {'en': 'Sync Complete', 'ar': 'اكتملت المزامنة'},
    'sync_failed': {'en': 'Sync Failed', 'ar': 'فشلت المزامنة'},
    'mmp_uploaded': {'en': 'MMP File Uploaded', 'ar': 'تم رفع ملف MMP'},
    'mmp_approved': {'en': 'MMP Approved', 'ar': 'تمت الموافقة على MMP'},
    'mmp_rejected': {'en': 'MMP Rejected', 'ar': 'تم رفض MMP'},
    'visit_started': {'en': 'Visit Started', 'ar': 'بدأت الزيارة'},
    'visit_completed': {'en': 'Visit Completed', 'ar': 'اكتملت الزيارة'},
    'cost_submitted': {'en': 'Cost Submitted', 'ar': 'تم تقديم التكلفة'},
    'cost_approved': {'en': 'Cost Approved', 'ar': 'تمت الموافقة على التكلفة'},
    'cost_rejected': {'en': 'Cost Rejected', 'ar': 'تم رفض التكلفة'},
    'account_updated': {'en': 'Account Updated', 'ar': 'تم تحديث الحساب'},
    'new_assignment': {'en': 'New Assignment', 'ar': 'مهمة جديدة'},
    'deadline_approaching': {
      'en': 'Deadline Approaching',
      'ar': 'الموعد النهائي يقترب',
    },
    'deadline_passed': {'en': 'Deadline Passed', 'ar': 'انتهى الموعد النهائي'},
    'signature_requested': {'en': 'Signature Requested', 'ar': 'مطلوب توقيع'},
    'document_signed': {'en': 'Document Signed', 'ar': 'تم توقيع المستند'},
    'incoming_call': {'en': 'Incoming Call', 'ar': 'مكالمة واردة'},
    'missed_call': {'en': 'Missed Call', 'ar': 'مكالمة فائتة'},
    'data_sync_required': {
      'en': 'Data Sync Required',
      'ar': 'مطلوب مزامنة البيانات',
    },
    'offline_data_pending': {
      'en': 'Offline Data Pending',
      'ar': 'بيانات غير متصلة معلقة',
    },
    'location_sharing_enabled': {
      'en': 'Location Sharing Enabled',
      'ar': 'تم تفعيل مشاركة الموقع',
    },
    'location_sharing_disabled': {
      'en': 'Location Sharing Disabled',
      'ar': 'تم إيقاف مشاركة الموقع',
    },
    'permit_approved': {
      'en': 'Permit Approved',
      'ar': 'تمت الموافقة على التصريح',
    },
    'permit_rejected': {'en': 'Permit Rejected', 'ar': 'تم رفض التصريح'},
    'update_available': {'en': 'Update Available', 'ar': 'تحديث متاح'},
    'update_installed': {'en': 'Update Installed', 'ar': 'تم تثبيت التحديث'},
    'advance_disbursed': {
      'en': '💰 Transport Advance Disbursed',
      'ar': '💰 تم صرف سلفة المواصلات',
    },
    'receipt_confirmed': {
      'en': '✅ Receipt Confirmed',
      'ar': '✅ تم تأكيد الاستلام',
    },
    'tap_to_view_details': {
      'en': 'Tap to view details',
      'ar': 'اضغط لعرض التفاصيل',
    },
  };

  static const Map<String, Map<String, String>> _bodyTranslations = {
    'you_have_new_message': {
      'en': 'You have a new message from {name}',
      'ar': 'لديك رسالة جديدة من {name}',
    },
    'site_assigned_to_you': {
      'en': 'Site {site} has been assigned to you',
      'ar': 'تم تعيين الموقع {site} لك',
    },
    'visit_scheduled_for': {
      'en': 'Visit scheduled for {date}',
      'ar': 'الزيارة مجدولة في {date}',
    },
    'you_received_payment': {
      'en': 'You received {amount} SDG',
      'ar': 'استلمت {amount} جنيه سوداني',
    },
    'your_data_synced': {
      'en': 'Your data has been synced successfully',
      'ar': 'تمت مزامنة بياناتك بنجاح',
    },
    'sync_error_occurred': {
      'en': 'An error occurred while syncing. Tap to retry',
      'ar': 'حدث خطأ أثناء المزامنة. اضغط للمحاولة مرة أخرى',
    },
    'mmp_file_uploaded_by': {
      'en': 'MMP file {file} uploaded by {name}',
      'ar': 'تم رفع ملف MMP {file} بواسطة {name}',
    },
    'tap_to_view_details': {
      'en': 'Tap to view details',
      'ar': 'اضغط لعرض التفاصيل',
    },
    'deadline_in_days': {
      'en': 'Deadline in {days} days',
      'ar': 'الموعد النهائي بعد {days} أيام',
    },
    'pending_items_to_sync': {
      'en': 'You have {count} pending items to sync',
      'ar': 'لديك {count} عناصر معلقة للمزامنة',
    },
    'call_from': {'en': 'Call from {name}', 'ar': 'مكالمة من {name}'},
    'missed_call_from': {
      'en': 'Missed call from {name}',
      'ar': 'مكالمة فائتة من {name}',
    },
    'signature_requested_for': {
      'en': 'Your signature is requested for {document}',
      'ar': 'مطلوب توقيعك على {document}',
    },
    'document_signed_successfully': {
      'en': 'Document {document} signed successfully',
      'ar': 'تم توقيع المستند {document} بنجاح',
    },
    'new_version_available': {
      'en': 'A new version of PACT Mobile is available. Tap to update',
      'ar': 'إصدار جديد من PACT Mobile متاح. اضغط للتحديث',
    },
    'update_installed_restart': {
      'en': 'Update installed. The app will restart with new features',
      'ar': 'تم تثبيت التحديث. سيتم إعادة تشغيل التطبيق بميزات جديدة',
    },
  };

  static Future<void> initialize() async {
    if (_initialized) return;

    try {
      // Only initialize on mobile platforms
      if (!kIsWeb) {
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

        await _notifications
            .initialize(
              initializationSettings,
              onDidReceiveNotificationResponse: _onNotificationTap,
              onDidReceiveBackgroundNotificationResponse:
                  _onNotificationTapBackground,
            )
            .timeout(const Duration(seconds: 5), onTimeout: () => null);
      }
      await _loadLocale();
      _initialized = true;
    } catch (e) {
      // Even if initialization fails, mark as initialized to prevent retries
      _initialized = true;
    }
  }

  /// Handle notification tap / action button press in foreground
  static void _onNotificationTap(NotificationResponse response) {
    try {
      final payload = response.payload;
      final actionId = response.actionId;
      // #region agent log
      debugLog(
        'CALL_DIAG',
        '[H4] _onNotificationTap actionId=$actionId payload=$payload',
      );
      // #endregion
      debugPrint(
        '[BilingualNotification] Notification response: actionId=$actionId payload=$payload',
      );

      // Handle call action buttons (can be generic 'accept_call'/'reject_call' or specific to callId)
      if (actionId == acceptActionId ||
          actionId == rejectActionId ||
          actionId?.startsWith('accept_') == true ||
          actionId?.startsWith('decline_') == true) {
        _handleCallAction(actionId!, payload);
        return;
      }

      // Handle message action buttons
      if (actionId == 'open_chat' || actionId == 'dismiss') {
        _handleMessageAction(actionId!, payload);
        return;
      }

      // Regular tap — route to the relevant screen
      if (payload != null && payload.isNotEmpty) {
        Future.delayed(const Duration(milliseconds: 100), () {
          _handleNotificationRoute(payload);
        });
      }
    } catch (e) {
      debugPrint('[BilingualNotification] Error handling tap: $e');
    }
  }

  /// Handle Accept/Reject action from the notification
  static void _handleCallAction(String actionId, String? payload) {
    try {
      if (payload == null || payload.isEmpty) return;
      // #region agent log
      debugLog(
        'CALL_DIAG',
        '[H4] _handleCallAction actionId=$actionId payload=$payload',
      );
      // #endregion

      Map<String, dynamic>? callData;
      try {
        callData = jsonDecode(payload) as Map<String, dynamic>?;
      } catch (_) {
        // #region agent log
        debugLog(
          'CALL_DIAG',
          '[H1] _handleCallAction jsonDecode failed actionId=$actionId '
              'payloadIsEmpty=false',
        );
        // #endregion
        // payload might be "call:<callId>" format
        return;
      }
      if (callData == null) return;

      final callId = (callData['call_id'] ?? callData['callId'] ?? '')
          .toString();
      final channelName =
          (callData['channel_name'] ?? callData['channelName'] ?? '')
              .toString();
      final callerId = (callData['from'] ?? callData['caller_id'] ?? '')
          .toString();
      final callerName = (callData['caller_name'] ?? 'Unknown').toString();
      final callerAvatar = callData['caller_avatar']?.toString();
      final rawAudioOnly =
          callData['is_audio_only'] ?? callData['isAudioOnly'] ?? false;
      final isAudioOnly =
          rawAudioOnly == true ||
          rawAudioOnly.toString().toLowerCase() == 'true' ||
          rawAudioOnly.toString() == '1';

      debugLog('Notification', '$actionId callId=$callId from=$callerName');

      // #region agent log
      debugLog(
        'CALL_DIAG',
        '[H5] About to create AgoraCallService in _handleCallAction actionId=$actionId callId=$callId',
      );
      // #endregion
      final agora = AgoraCallService();
      // #region agent log
      debugLog(
        'CALL_DIAG',
        '[H5] Created AgoraCallService in _handleCallAction actionId=$actionId callId=$callId',
      );
      // #endregion
      final incomingCall = AgoraIncomingCall(
        callId: callId,
        channelName: channelName,
        callerId: callerId,
        callerName: callerName,
        callerAvatar: callerAvatar,
        isAudioOnly: isAudioOnly,
      );

      if (actionId == rejectActionId || actionId.startsWith('decline_')) {
        CallDiagnosticsStore.savePendingCallAction(
          actionId: actionId,
          callData: callData,
        );
        agora.rejectCall(incomingCall);
      } else if (actionId == acceptActionId || actionId.startsWith('accept_')) {
        // Persist accept intent so launch-from-notification reliably auto-answers.
        callData['auto_accept'] = true;
        CallDiagnosticsStore.savePendingCallAction(
          actionId: actionId,
          callData: callData,
        );
        agora.setPendingFcmCall(callData);

        // Push with autoAccept so the dialog immediately accepts and opens call screen
        final autoAcceptCall = AgoraIncomingCall(
          callId: callId,
          channelName: channelName,
          callerId: callerId,
          callerName: callerName,
          callerAvatar: callerAvatar,
          isAudioOnly: isAudioOnly,
          autoAccept: true,
        );
        agora.pushAutoAcceptCall(autoAcceptCall);
      }
    } catch (e) {
      debugPrint('[BilingualNotification] Error handling call action: $e');
      debugLog('Notification', 'Error handling call action: $e');
    }
  }

  /// Handle message action buttons (Open Chat / Dismiss)
  static void _handleMessageAction(String actionId, String? payload) {
    try {
      debugPrint(
        '[BilingualNotification] Message action: actionId=$actionId payload=$payload',
      );

      // Parse the payload to extract chatId and senderId
      Map<String, dynamic>? messageData;
      if (payload != null && payload.isNotEmpty) {
        try {
          // Try to parse as JSON first
          messageData = jsonDecode(payload) as Map<String, dynamic>?;
        } catch (_) {
          // payload might be "chat:<chatId>" format
          if (payload.startsWith('chat:')) {
            messageData = {'chatId': payload.substring(5)};
          }
        }
      }

      if (actionId == 'open_chat') {
        // Navigate to chat screen
        if (messageData != null && messageData.containsKey('chatId')) {
          final chatId = messageData['chatId'] as String;
          final senderId = messageData['senderId'] as String?;

          debugPrint('[BilingualNotification] Routing to chat: chatId=$chatId');

          // Route via NotificationRoutingService to handle navigation
          final routingService = NotificationRoutingService();
          routingService.handleMessageNotificationTap(
            chatId: chatId,
            senderId: senderId ?? '',
            messageId: messageData['messageId'] as String? ?? '',
          );
        }
      } else if (actionId == 'dismiss') {
        // Just dismiss the notification - clear any UI state if needed
        debugPrint('[BilingualNotification] Dismissing message notification');

        // Optionally mark the message as read/dismissed in storage
        final messageId = messageData?['messageId'] as String?;
        if (messageId != null && messageId.isNotEmpty) {
          // Could remove from PersistentMessageStateService if needed
          debugPrint(
            '[BilingualNotification] Message marked as dismissed: $messageId',
          );
        }
      }
    } catch (e) {
      debugPrint('[BilingualNotification] Error handling message action: $e');
    }
  }

  /// Handle notification tap in background/killed isolate.
  /// In a background isolate, NotificationRoutingService has no navigation
  /// callback, so we cannot route here. Instead, the payload is preserved by
  /// flutter_local_notifications and picked up via
  /// getNotificationAppLaunchDetails() in MainLayout when the app opens.
  @pragma('vm:entry-point')
  static void _onNotificationTapBackground(NotificationResponse response) {
    try {
      final actionId = response.actionId;
      // #region agent log
      debugLog(
        'CALL_DIAG',
        '[H4] _onNotificationTapBackground actionId=$actionId payload=${response.payload}',
      );
      // #endregion
      debugPrint(
        '[BilingualNotification] Background notification response: '
        'actionId=$actionId payload=${response.payload} '
        '(will be handled on app launch via getNotificationAppLaunchDetails)',
      );

      // Persist call actions in background isolate; app startup will consume them.
      if (actionId == rejectActionId ||
          actionId == acceptActionId ||
          actionId?.startsWith('decline_') == true ||
          actionId?.startsWith('accept_') == true) {
        if (response.payload != null) {
          _handleCallAction(actionId!, response.payload);
          return;
        }
        // #region agent log
        debugLog(
          'CALL_DIAG',
          '[H1] _onNotificationTapBackground actionId=$actionId but payload is null',
        );
        // #endregion
      }

      // Accept and regular taps: handled when app launches via
      // getNotificationAppLaunchDetails() in MainLayout
    } catch (e) {
      debugPrint('[BilingualNotification] Error handling background tap: $e');
    }
  }

  /// Route notification based on payload
  static void _handleNotificationRoute(String payload) {
    try {
      // Access the singleton instance of NotificationRoutingService
      final routingService = NotificationRoutingService();
      routingService.handleNotificationTap(payload: payload);
      debugPrint('[BilingualNotification] Routed notification: $payload');
    } catch (e) {
      debugPrint('[BilingualNotification] Error routing notification: $e');
    }
  }

  static Future<void> _loadLocale() async {
    try {
      // Only try to open if not already open
      Box<dynamic>? box;
      try {
        box = Hive.box('settings');
      } catch (_) {
        box = await Hive.openBox('settings');
      }
      _currentLocale = box.get('locale', defaultValue: 'en') as String;
    } catch (e) {
      _currentLocale = 'en';
    }
  }

  static void setLocale(String locale) {
    _currentLocale = locale;
  }

  static String _translate(String key) {
    return _translations[key]?[_currentLocale] ??
        _translations[key]?['en'] ??
        key;
  }

  static String _translateBody(String key, {Map<String, String>? params}) {
    String text =
        _bodyTranslations[key]?[_currentLocale] ??
        _bodyTranslations[key]?['en'] ??
        key;

    if (params != null) {
      params.forEach((k, v) {
        text = text.replaceAll('{$k}', v);
      });
    }

    return text;
  }

  static Future<void> showBilingualNotification({
    required String titleKey,
    required String bodyKey,
    String? payload,
    Map<String, String>? bodyParams,
    NotificationImportance importance = NotificationImportance.high,
  }) async {
    await initialize();

    final title = _translate(titleKey);
    final body = _translateBody(bodyKey, params: bodyParams);

    final AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'bilingual_notifications',
          _currentLocale == 'ar' ? 'الإشعارات' : 'Notifications',
          channelDescription: 'Bilingual app notifications',
          importance: _getAndroidImportance(importance),
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          enableVibration: true,
          playSound: true,
        );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _notifications.show(
      DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title,
      body,
      platformDetails,
      payload: payload,
    );
  }

  static Future<void> showNewMessageNotification({
    required String senderName,
    required String message,
    required String chatId,
    String? senderNameAr,
    String? messageAr,
  }) async {
    await initialize();

    final title = _translate('new_message');
    // Compose bilingual body: use AR if available and locale is AR, otherwise use EN
    final displaySenderName =
        _currentLocale == 'ar' &&
            senderNameAr != null &&
            senderNameAr.isNotEmpty
        ? senderNameAr
        : senderName;
    final displayMessage =
        _currentLocale == 'ar' && messageAr != null && messageAr.isNotEmpty
        ? messageAr
        : message;
    final body = '$displaySenderName: $displayMessage';

    await _showNotification(
      id: chatId.hashCode,
      title: title,
      body: body,
      channelId: 'messages',
      channelName: _currentLocale == 'ar' ? 'الرسائل' : 'Messages',
      payload: 'chat:$chatId',
    );
  }

  static Future<void> showSiteAssignmentNotification({
    required String siteName,
    required String siteId,
  }) async {
    await initialize();

    final title = _translate('new_site_assigned');
    final body = _translateBody(
      'site_assigned_to_you',
      params: {'site': siteName},
    );

    await _showNotification(
      id: siteId.hashCode,
      title: title,
      body: body,
      channelId: 'assignments',
      channelName: _currentLocale == 'ar' ? 'المهام' : 'Assignments',
      payload: 'site:$siteId',
    );
  }

  static Future<void> showPaymentNotification({
    required String amount,
    required String transactionId,
  }) async {
    await initialize();

    final title = _translate('payment_received');
    final body = _translateBody(
      'you_received_payment',
      params: {'amount': amount},
    );

    await _showNotification(
      id: transactionId.hashCode,
      title: title,
      body: body,
      channelId: 'payments',
      channelName: _currentLocale == 'ar' ? 'المدفوعات' : 'Payments',
      payload: 'payment:$transactionId',
    );
  }

  static Future<void> showSyncNotification({
    required bool success,
    int? pendingCount,
  }) async {
    await initialize();

    final title = success
        ? _translate('sync_complete')
        : _translate('sync_failed');
    final body = success
        ? _translateBody('your_data_synced')
        : pendingCount != null
        ? _translateBody(
            'pending_items_to_sync',
            params: {'count': pendingCount.toString()},
          )
        : _translateBody('sync_error_occurred');

    await _showNotification(
      id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title: title,
      body: body,
      channelId: 'sync',
      channelName: _currentLocale == 'ar' ? 'المزامنة' : 'Sync',
    );
  }

  /// [callPayload] when provided is stored as the notification payload so opening the app from the notification shows the incoming call UI (e.g. when app was killed).
  /// Action IDs for incoming call notification buttons
  static const String acceptActionId = 'accept_call';
  static const String rejectActionId = 'reject_call';

  static Future<void> showIncomingCallNotification({
    required String callerName,
    required String callId,
    Map<String, dynamic>? callPayload,
  }) async {
    await initialize();

    final title = _translate('incoming_call');
    final body = _translateBody('call_from', params: {'name': callerName});

    // Ensure payload is properly encoded (critical for call recovery)
    final String payload = callPayload != null
        ? jsonEncode(callPayload)
        : jsonEncode({'call_id': callId, 'caller_name': callerName});

    // Create action IDs that include the callId for proper identification
    final String acceptActionWithId = 'accept_$callId';
    final String declineActionWithId = 'decline_$callId';

    // Get API-safe full screen intent value
    final gapFixer = NotificationGapFixerService();
    await gapFixer.initialize();
    final safeFullScreenIntent = gapFixer.getSafeFullScreenIntent();

    final AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'calls',
          'Incoming Calls',
          channelDescription: 'Incoming call notifications - answer or decline',
          importance: Importance.max,
          priority: Priority.max,
          icon: '@mipmap/ic_launcher',
          enableVibration: true,
          playSound: true,
          fullScreenIntent: safeFullScreenIntent,
          category: AndroidNotificationCategory.call,
          visibility: NotificationVisibility.public,
          // Professional styling with big text for call notifications
          styleInformation: BigTextStyleInformation(
            'Incoming Call from $callerName',
            contentTitle: 'Answer Call?',
            summaryText: 'Tap to answer or decline',
            htmlFormatBigText: true,
            htmlFormatContentTitle: true,
            htmlFormatSummaryText: true,
          ),
          // Sound and vibration for alert
          sound: RawResourceAndroidNotificationSound('notification_sound'),
          vibrationPattern: Int64List.fromList([0, 250, 250, 250]),
          color: const Color(0xFF2196F3),
          colorized: true,
          ticker: '$callerName is calling...',
          ongoing: true,
          autoCancel: false,
          actions: <AndroidNotificationAction>[
            AndroidNotificationAction(
              declineActionWithId,
              'Decline',
              icon: DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
              showsUserInterface: false,
              cancelNotification: true,
            ),
            AndroidNotificationAction(
              acceptActionWithId,
              'Accept',
              icon: DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
              showsUserInterface: true,
              cancelNotification: true,
            ),
          ],
        );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      sound: 'ringtone.aiff',
      categoryIdentifier: 'incoming_call',
      interruptionLevel: InterruptionLevel.critical,
    );

    final NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    try {
      await _notifications.show(
        callId.hashCode,
        title,
        body,
        platformDetails,
        payload: payload,
      );
      debugPrint(
        '[BilingualNotification] Incoming call notification shown: callId=$callId, '
        'caller=$callerName, fullScreenIntent=$safeFullScreenIntent',
      );
    } catch (e) {
      debugPrint('[BilingualNotification] Error showing call notification: $e');
      // Retry without custom sound as fallback
      try {
        final fallbackDetails = NotificationDetails(
          android: AndroidNotificationDetails(
            'calls',
            'Incoming Calls',
            channelDescription:
                'Incoming call notifications - answer or decline',
            importance: Importance.max,
            priority: Priority.max,
            fullScreenIntent: safeFullScreenIntent,
            category: AndroidNotificationCategory.call,
            visibility: NotificationVisibility.public,
            color: const Color(0xFF2196F3),
            colorized: true,
            ticker: '$callerName is calling...',
            ongoing: true,
            autoCancel: false,
            actions: <AndroidNotificationAction>[
              AndroidNotificationAction(
                declineActionWithId,
                'Decline',
                showsUserInterface: false,
                cancelNotification: true,
              ),
              AndroidNotificationAction(
                acceptActionWithId,
                'Accept',
                showsUserInterface: true,
                cancelNotification: true,
              ),
            ],
          ),
          iOS: iosDetails,
        );
        await _notifications.show(
          callId.hashCode,
          title,
          body,
          fallbackDetails,
          payload: payload,
        );
        debugPrint(
          '[BilingualNotification] Fallback notification shown (no custom sound): callId=$callId',
        );
      } catch (e2) {
        debugPrint(
          '[BilingualNotification] Fallback notification also failed: $e2',
        );
      }
    }
  }

  /// Cancel the incoming call notification (e.g., when call is answered/rejected via dialog)
  static Future<void> cancelCallNotification(String callId) async {
    await _notifications.cancel(callId.hashCode);
  }

  static Future<void> showUpdateNotification({required bool installed}) async {
    await initialize();

    final title = installed
        ? _translate('update_installed')
        : _translate('update_available');
    final body = installed
        ? _translateBody('update_installed_restart')
        : _translateBody('new_version_available');

    await _showNotification(
      id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title: title,
      body: body,
      channelId: 'updates',
      channelName: _currentLocale == 'ar' ? 'التحديثات' : 'Updates',
    );
  }

  static Future<void> showSignatureRequestNotification({
    required String documentName,
    required String documentId,
  }) async {
    await initialize();

    final title = _translate('signature_requested');
    final body = _translateBody(
      'signature_requested_for',
      params: {'document': documentName},
    );

    await _showNotification(
      id: documentId.hashCode,
      title: title,
      body: body,
      channelId: 'signatures',
      channelName: _currentLocale == 'ar' ? 'التوقيعات' : 'Signatures',
      payload: 'signature:$documentId',
    );
  }

  static Future<void> showMissedCallNotification({
    required String callerName,
    required String callId,
  }) async {
    await initialize();

    final title = _translate('missed_call');
    final body = _translateBody(
      'missed_call_from',
      params: {'name': callerName},
    );

    await _showNotification(
      id: callId.hashCode,
      title: title,
      body: body,
      channelId: 'calls',
      channelName: _currentLocale == 'ar' ? 'المكالمات' : 'Calls',
      payload: 'missed_call:$callId',
    );
  }

  /// Show a notification with a raw (already-translated) title and body.
  /// Used for broadcasts where the admin has already written the text.
  static Future<void> showRawNotification({
    required String title,
    required String body,
    String payload = 'broadcast',
    int? id,
  }) async {
    // Generate unique ID based on payload and timestamp if not provided
    final notificationId = id ?? (payload.hashCode.abs() % 100000) + 1000;

    await _showNotification(
      id: notificationId,
      title: title,
      body: body,
      channelId: 'general',
      channelName: _currentLocale == 'ar' ? 'عام' : 'General',
      payload: payload,
    );
  }

  static Future<void> _showNotification({
    required int id,
    required String title,
    required String body,
    required String channelId,
    required String channelName,
    String? payload,
  }) async {
    final AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          channelId,
          channelName,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          enableVibration: true,
          playSound: true,
        );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _notifications.show(
      id,
      title,
      body,
      platformDetails,
      payload: payload,
    );
  }

  static Importance _getAndroidImportance(NotificationImportance importance) {
    switch (importance) {
      case NotificationImportance.low:
        return Importance.low;
      case NotificationImportance.normal:
        return Importance.defaultImportance;
      case NotificationImportance.high:
        return Importance.high;
      case NotificationImportance.max:
        return Importance.max;
    }
  }

  static Future<void> cancelNotification(int id) async {
    await _notifications.cancel(id);
  }

  static Future<void> cancelAllNotifications() async {
    await _notifications.cancelAll();
  }
}

enum NotificationImportance { low, normal, high, max }
