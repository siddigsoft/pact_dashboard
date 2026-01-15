import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'dart:async';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  // Notification channels
  static const String _chatChannelId = 'chat_messages';
  static const String _chatChannelName = 'Chat Messages';
  static const String _chatChannelDescription =
      'Notifications for new chat messages';

  static const String _mmpChannelId = 'mmp_files';
  static const String _mmpChannelName = 'MMP Files';
  static const String _mmpChannelDescription =
      'Notifications for new MMP file uploads';

  static const String _updateChannelId = 'app_updates';
  static const String _updateChannelName = 'App Updates';
  static const String _updateChannelDescription =
      'Notifications for app updates';

  static const String _userChannelId = 'user_notifications';
  static const String _userChannelName = 'User Notifications';
  static const String _userChannelDescription =
    'Notifications for account activity and alerts';

  // Callback for notification tap
  static void Function(NotificationResponse)? _onNotificationTap;

  static Future<void> initialize({
    void Function(NotificationResponse)? onNotificationTap,
  }) async {
    if (_initialized) return;

    _onNotificationTap = onNotificationTap;

    // Android initialization settings
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    // iOS initialization settings
    const DarwinInitializationSettings initializationSettingsIOS =
        DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    // macOS initialization settings
    const DarwinInitializationSettings initializationSettingsMacOS =
        DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const InitializationSettings initializationSettings =
        InitializationSettings(
      android: initializationSettingsAndroid,
      iOS: initializationSettingsIOS,
      macOS: initializationSettingsMacOS,
    );

    await _notifications.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: (details) {
        if (_onNotificationTap != null) {
          _onNotificationTap!(details);
        }
      },
    );

    // Request permissions for iOS
    await _requestPermissions();

    _initialized = true;
  }

  static Future<void> _requestPermissions() async {
    final bool? result = await _notifications
        .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );

    await _notifications
        .resolvePlatformSpecificImplementation<
            MacOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );
  }

  // ==================== CHAT MESSAGE NOTIFICATIONS ====================

  static Future<void> showChatMessageNotification({
    required String senderName,
    required String message,
    required String chatId,
    String? senderAvatar,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      _chatChannelId,
      _chatChannelName,
      channelDescription: _chatChannelDescription,
      importance: Importance.max,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      sound: RawResourceAndroidNotificationSound('notification_sound'),
      enableVibration: true,
      playSound: true,
      styleInformation: BigTextStyleInformation(''),
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      sound: 'notification_sound.aiff',
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
      macOS: iosDetails,
    );

    await _notifications.show(
      chatId.hashCode, // Use chat ID hash as notification ID
      senderName,
      message,
      platformDetails,
      payload: 'chat:$chatId', // For navigation when tapped
    );
  }

  // ==================== MMP FILE NOTIFICATIONS ====================

  static Future<void> showMMPFileNotification({
    required String title,
    required String body,
    required String fileId,
    String? fileName,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      _mmpChannelId,
      _mmpChannelName,
      channelDescription: _mmpChannelDescription,
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      enableVibration: true,
      playSound: true,
      styleInformation: BigTextStyleInformation(''),
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
      macOS: iosDetails,
    );

    await _notifications.show(
      fileId.hashCode, // Use file ID hash as notification ID
      title,
      body,
      platformDetails,
      payload: 'mmp:$fileId', // For navigation when tapped
    );
  }

  // ==================== USER NOTIFICATIONS ====================

  static Future<void> showUserNotification({
    required String notificationId,
    required String title,
    required String body,
    String type = 'info',
  }) async {
    await initialize();

    final Importance importance =
        type == 'warning' || type == 'error' ? Importance.max : Importance.high;

    final AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      _userChannelId,
      _userChannelName,
      channelDescription: _userChannelDescription,
      importance: importance,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      enableVibration: true,
      playSound: true,
      styleInformation: BigTextStyleInformation(body),
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
      macOS: iosDetails,
    );

    await _notifications.show(
      notificationId.hashCode,
      title,
      body,
      platformDetails,
      payload: 'notif:$notificationId',
    );
  }

  // ==================== APP UPDATE NOTIFICATIONS ====================

  static Future<void> showAppUpdateNotification({
    required String version,
    String? description,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      _updateChannelId,
      _updateChannelName,
      channelDescription: _updateChannelDescription,
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      enableVibration: true,
      playSound: true,
      ongoing: false, // User can dismiss
      autoCancel: true,
      styleInformation: BigTextStyleInformation(''),
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
      macOS: iosDetails,
    );

    await _notifications.show(
      999, // Fixed ID for updates - will replace previous update notification
      '🎉 App Update Available',
      description ??
          'A new version ($version) is ready to install. Tap to update now!',
      platformDetails,
      payload: 'update:$version',
    );
  }

  static Future<void> showUpdateDownloadingNotification() async {
    await initialize();

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      _updateChannelId,
      _updateChannelName,
      channelDescription: _updateChannelDescription,
      importance: Importance.low,
      priority: Priority.low,
      icon: '@mipmap/ic_launcher',
      ongoing: true, // Can't be dismissed while downloading
      autoCancel: false,
      showProgress: true,
      indeterminate: true,
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: false,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
      macOS: iosDetails,
    );

    await _notifications.show(
      998, // Fixed ID for download progress
      'Downloading Update',
      'Please wait while the update is being downloaded...',
      platformDetails,
    );
  }

  static Future<void> showUpdateInstalledNotification() async {
    await initialize();

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      _updateChannelId,
      _updateChannelName,
      channelDescription: _updateChannelDescription,
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      autoCancel: true,
    );

    const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
      macOS: iosDetails,
    );

    // Cancel download notification
    await _notifications.cancel(998);

    await _notifications.show(
      997, // Fixed ID for installed notification
      '✅ Update Installed Successfully',
      'Your app is now up to date. Restart to apply changes.',
      platformDetails,
    );
  }

  // ==================== COST SUBMISSION NOTIFICATIONS ====================

  static Future<void> showCostSubmissionApprovedNotification({
    required String submissionId,
    required String siteVisitId,
    required double approvedAmount,
    required String currency,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'cost_submission_approvals',
      'Cost Submission Approvals',
      channelDescription: 'Notifications for cost submission approval status',
      importance: Importance.max,
      priority: Priority.high,
      showWhen: true,
    );

    const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails();

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iOSDetails,
    );

    await _notifications.show(
      submissionId.hashCode,
      'Cost Submission Approved',
      'Your cost submission for site visit $siteVisitId has been approved. Amount: ${approvedAmount.toStringAsFixed(2)} $currency',
      platformDetails,
      payload: 'cost_submission_approved:$submissionId',
    );
  }

  static Future<void> showCostSubmissionRejectedNotification({
    required String submissionId,
    required String siteVisitId,
    required String rejectionReason,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'cost_submission_rejections',
      'Cost Submission Rejections',
      channelDescription: 'Notifications for cost submission rejection status',
      importance: Importance.max,
      priority: Priority.high,
      showWhen: true,
    );

    const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails();

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iOSDetails,
    );

    await _notifications.show(
      submissionId.hashCode,
      'Cost Submission Rejected',
      'Your cost submission for site visit $siteVisitId has been rejected. Reason: $rejectionReason',
      platformDetails,
      payload: 'cost_submission_rejected:$submissionId',
    );
  }

  static Future<void> showCostSubmissionRevisionRequestedNotification({
    required String submissionId,
    required String siteVisitId,
    required String revisionNotes,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'cost_submission_revisions',
      'Cost Submission Revisions',
      channelDescription: 'Notifications for cost submission revision requests',
      importance: Importance.max,
      priority: Priority.high,
      showWhen: true,
    );

    const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails();

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iOSDetails,
    );

    await _notifications.show(
      submissionId.hashCode,
      'Revision Requested',
      'Your cost submission for site visit $siteVisitId requires revision. Notes: $revisionNotes',
      platformDetails,
      payload: 'cost_submission_revision:$submissionId',
    );
  }

  static Future<void> showOfflineSyncCompletedNotification({
    required int syncedCount,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'offline_sync',
      'Offline Sync',
      channelDescription: 'Notifications for offline data synchronization',
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
      showWhen: true,
    );

    const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails();

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iOSDetails,
    );

    await _notifications.show(
      'offline_sync'.hashCode,
      'Offline Sync Completed',
      '$syncedCount cost submission(s) have been synchronized successfully.',
      platformDetails,
      payload: 'offline_sync_completed',
    );
  }

  static Future<void> showBudgetAlertNotification({
    required String siteVisitId,
    required double remainingBudget,
    required String currency,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'budget_alerts',
      'Budget Alerts',
      channelDescription: 'Notifications for budget-related alerts',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );

    const DarwinNotificationDetails iOSDetails = DarwinNotificationDetails();

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
      iOS: iOSDetails,
    );

    await _notifications.show(
      'budget_alert_$siteVisitId'.hashCode,
      'Budget Alert',
      'Your remaining budget for site visit $siteVisitId is ${remainingBudget.toStringAsFixed(2)} $currency. Consider reviewing your expenses.',
      platformDetails,
      payload: 'budget_alert:$siteVisitId',
    );
  }

  // ==================== UTILITY METHODS ====================

  Future<void> cancelNotification(int id) async {
    await _notifications.cancel(id);
  }

  Future<void> cancelAllNotifications() async {
    await _notifications.cancelAll();
  }

  Future<void> cancelChatNotifications() async {
    // This would require tracking notification IDs
    // For now, we'll use a simple approach
  }

  Future<int> getPendingNotificationCount() async {
    final pending = await _notifications.pendingNotificationRequests();
    return pending.length;
  }

  // Schedule a notification for future delivery
  Future<void> scheduleNotification({
    required int id,
    required String title,
    required String body,
    required DateTime scheduledDate,
    String? payload,
  }) async {
    await initialize();

    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
      'scheduled',
      'Scheduled Notifications',
      channelDescription: 'Scheduled notifications',
      importance: Importance.high,
      priority: Priority.high,
    );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
    );

    // Note: This requires additional setup for scheduling
    // You might need timezone package for proper scheduling
  }
}
