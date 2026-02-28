import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:io' show Platform;

class BilingualNotificationService {
  static final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static String _currentLocale = 'en';

  // ── PACT Android notification channel definitions ──────────────────────────
  // These IDs must match the channel_id values sent from the send-fcm-push edge function.
  static const String _channelUrgent    = 'pact_urgent';
  static const String _channelBroadcast = 'pact_broadcast';
  static const String _channelApprovals = 'pact_approvals';
  static const String _channelFinance   = 'pact_finance';
  static const String _channelDefault   = 'pact_default';

  static final List<AndroidNotificationChannel> _pactChannels = [
    AndroidNotificationChannel(
      _channelUrgent,
      'Urgent Alerts / تنبيهات عاجلة',
      description: 'High-priority system alerts that require immediate attention',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      showBadge: true,
    ),
    AndroidNotificationChannel(
      _channelBroadcast,
      'Admin Announcements / إعلانات الإدارة',
      description: 'Broadcast messages from administrators',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
      showBadge: true,
    ),
    AndroidNotificationChannel(
      _channelApprovals,
      'Approvals / الموافقات',
      description: 'Approval decisions for submissions and requests',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
      showBadge: true,
    ),
    AndroidNotificationChannel(
      _channelFinance,
      'Finance / المالية',
      description: 'Payment and advance notifications',
      importance: Importance.high,
      playSound: true,
      enableVibration: true,
      showBadge: true,
    ),
    AndroidNotificationChannel(
      _channelDefault,
      'General / عام',
      description: 'General app notifications',
      importance: Importance.defaultImportance,
      playSound: true,
      enableVibration: false,
      showBadge: true,
    ),
  ];

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
    'tap_to_view_details': {'en': 'Tap to view details', 'ar': 'اضغط لعرض التفاصيل'},
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

    await _notifications.initialize(initializationSettings);

    // Register all PACT channels on Android (required on API 26+).
    // Without this, FCM cannot deliver heads-up notifications on the custom channels.
    try {
      if (Platform.isAndroid) {
        final androidPlugin = _notifications
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>();
        if (androidPlugin != null) {
          for (final channel in _pactChannels) {
            await androidPlugin.createNotificationChannel(channel);
          }
        }
      }
    } catch (_) {}

    await _loadLocale();
    _initialized = true;
  }

  static Future<void> _loadLocale() async {
    try {
      final box = await Hive.openBox('settings');
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
    String text = _bodyTranslations[key]?[_currentLocale] ??
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
  }) async {
    await initialize();

    final title = _translate('new_message');
    final body = '$senderName: $message';

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

    final title =
        success ? _translate('sync_complete') : _translate('sync_failed');
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

  static Future<void> showIncomingCallNotification({
    required String callerName,
    required String callId,
  }) async {
    await initialize();

    final title = _translate('incoming_call');
    final body = _translateBody('call_from', params: {'name': callerName});

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      'calls',
      'Calls',
      channelDescription: 'Incoming call notifications',
      importance: Importance.max,
      priority: Priority.max,
      icon: '@mipmap/ic_launcher',
      enableVibration: true,
      playSound: true,
      fullScreenIntent: true,
      category: AndroidNotificationCategory.call,
      visibility: NotificationVisibility.public,
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      sound: 'ringtone.aiff',
    );

    final NotificationDetails platformDetails = const NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _notifications.show(
      callId.hashCode,
      title,
      body,
      platformDetails,
      payload: 'call:$callId',
    );
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
  /// Used for broadcasts and approval updates where the text is already composed.
  /// [channelId] should be one of the PACT channel IDs defined in [_pactChannels].
  static Future<void> showRawNotification({
    required String title,
    required String body,
    String payload = 'notifications',
    int? id,
    String channelId = _channelBroadcast,
    Importance importance = Importance.high,
    Priority priority = Priority.high,
  }) async {
    await initialize();

    final resolvedId = id ?? DateTime.now().millisecondsSinceEpoch.remainder(100000);

    final AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      channelId,
      _channelDisplayName(channelId),
      importance: importance,
      priority: priority,
      icon: '@mipmap/ic_launcher',
      enableVibration: importance.index >= Importance.high.index,
      playSound: true,
      showWhen: true,
      visibility: importance == Importance.max
          ? NotificationVisibility.public
          : NotificationVisibility.private,
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    await _notifications.show(
      resolvedId,
      title,
      body,
      NotificationDetails(android: androidDetails, iOS: iosDetails),
      payload: payload,
    );
  }

  /// Returns the human-readable display name for a PACT channel ID.
  static String _channelDisplayName(String channelId) {
    switch (channelId) {
      case _channelUrgent:    return _currentLocale == 'ar' ? 'تنبيهات عاجلة' : 'Urgent Alerts';
      case _channelBroadcast: return _currentLocale == 'ar' ? 'إعلانات الإدارة' : 'Admin Announcements';
      case _channelApprovals: return _currentLocale == 'ar' ? 'الموافقات' : 'Approvals';
      case _channelFinance:   return _currentLocale == 'ar' ? 'المالية' : 'Finance';
      default:                return _currentLocale == 'ar' ? 'عام' : 'General';
    }
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
