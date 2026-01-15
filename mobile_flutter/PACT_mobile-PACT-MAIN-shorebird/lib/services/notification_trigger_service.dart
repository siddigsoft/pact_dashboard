import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/notification_models.dart';
import 'notification_service.dart';

/// NotificationTriggerService - Comprehensive notification sending service
/// Handles all notification types across the PACT app with proper categorization
/// and priority management
class NotificationTriggerService {
  static final NotificationTriggerService _instance = NotificationTriggerService._internal();

  factory NotificationTriggerService() => _instance;

  NotificationTriggerService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;

  // Check if notification should be sent based on quiet hours and settings
  Future<bool> _shouldSendNotification(
    String userId,
    NotificationCategory category,
    NotificationPriority priority,
  ) async {
    try {
      // Get user settings from database
      final response = await _supabase
          .from('user_settings')
          .select('notification_preferences')
          .eq('user_id', userId)
          .maybeSingle();

      if (response == null) return true;

      final prefs = response['notification_preferences'] as Map<String, dynamic>?;
      if (prefs == null) return true;

      final notifPrefs = NotificationPreferences.fromJson(prefs);

      // Check if notifications are enabled
      if (!notifPrefs.enabled) return false;

      // Check if this category is enabled
      final categoryStr = category.toString().split('.').last;
      if (!notifPrefs.categories.containsKey(categoryStr)) return false;
      if (!notifPrefs.categories[categoryStr]!) return false;

      // Check quiet hours (bypass for urgent)
      if (priority != NotificationPriority.urgent && notifPrefs.quietHours != null) {
        if (notifPrefs.quietHours!.isWithinQuietHours()) {
          return false;
        }
      }

      return true;
    } catch (e) {
      debugPrint('Error checking notification settings: $e');
      return true; // Default to sending if check fails
    }
  }

  /// Send a notification with comprehensive options
  Future<bool> send(NotificationTriggerOptions options) async {
    try {
      final shouldSend = await _shouldSendNotification(
        options.userId,
        options.category,
        options.priority,
      );

      if (!shouldSend) {
        debugPrint(
          '[Notification] Notification suppressed for user ${options.userId}: ${options.title}',
        );
        return false;
      }

      // Insert notification into database
      final response = await _supabase.from('notifications').insert({
        'user_id': options.userId,
        'title': options.title,
        'message': options.message,
        'type': options.type.toString().split('.').last,
        'category': options.category.toString().split('.').last,
        'priority': options.priority.toString().split('.').last,
        'link': options.link,
        'related_entity_id': options.relatedEntityId,
        'related_entity_type': options.relatedEntityType?.toString().split('.').last,
        'target_roles': options.targetRoles,
        'project_id': options.projectId,
        'is_read': false,
      });

      if (response != null) {
        // Show local notification
        await NotificationService.showUserNotification(
          notificationId: response['id'] ?? '',
          title: options.title,
          body: options.message,
          type: options.type.toString().split('.').last,
        );

        // Send email if high priority or explicitly requested
        if (options.sendEmail || 
            options.priority == NotificationPriority.urgent ||
            options.priority == NotificationPriority.high) {
          await _sendEmailNotification(
            options.userId,
            options.title,
            options.message,
            options.emailActionUrl,
            options.emailActionLabel,
          );
        }

        return true;
      }

      return false;
    } catch (e) {
      debugPrint('[Notification] Error sending notification: $e');
      return false;
    }
  }

  /// Send bulk notifications to multiple users
  Future<int> sendBulk(
    List<String> userIds,
    NotificationTriggerOptions options,
  ) async {
    int successCount = 0;

    for (final userId in userIds) {
      final success = await send(
        options.copyWith(userId: userId),
      );
      if (success) successCount++;
    }

    return successCount;
  }

  /// Send notifications to all users with specific roles
  Future<int> sendToRoles(
    List<String> roles,
    NotificationTriggerOptions options,
  ) async {
    try {
      // Fetch users with specified roles
      final response = await _supabase
          .from('profiles')
          .select('id')
          .filter('role', 'in', '(${roles.join(',')})');

      if (response.isEmpty) return 0;

      final userIds = (response as List)
          .map((u) => (u as Map<String, dynamic>)['id'] as String)
          .toList();

      return await sendBulk(userIds, options);
    } catch (e) {
      debugPrint('[Notification] Error sending role-based notifications: $e');
      return 0;
    }
  }

  /// Send notifications to all members of a project team
  Future<int> sendToProjectTeam(
    String projectId,
    NotificationTriggerOptions options,
  ) async {
    try {
      final response = await _supabase
          .from('team_members')
          .select('user_id')
          .eq('project_id', projectId);

      if (response.isEmpty) return 0;

      final userIds = (response as List)
          .map((m) => (m as Map<String, dynamic>)['user_id'] as String)
          .toList();

      return await sendBulk(userIds, options.copyWith(projectId: projectId));
    } catch (e) {
      debugPrint('[Notification] Error sending project team notifications: $e');
      return 0;
    }
  }

  // ==================== SITE VISIT NOTIFICATIONS ====================


  /// Send site visit reminder with urgency based on deadline
  Future<void> siteVisitReminder(
    String userId,
    String siteName,
    int hoursUntilDeadline,
    String siteId,
  ) async {
    final (urgency, type) = _calculateUrgency(hoursUntilDeadline);
    final message = hoursUntilDeadline <= 0
        ? 'Site visit to "$siteName" is overdue!'
        : 'Site visit to "$siteName" is due in $hoursUntilDeadline hours';

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: hoursUntilDeadline <= 0 ? 'Site Visit Overdue' : 'Site Visit Reminder',
        message: message,
        type: type,
        category: NotificationCategory.assignments,
        priority: urgency,
        link: '/site-visits/$siteId',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Calculate urgency level and notification type based on hours
  (NotificationPriority, NotificationType) _calculateUrgency(int hoursUntilDeadline) {
    if (hoursUntilDeadline <= 0) {
      return (NotificationPriority.urgent, NotificationType.error);
    } else if (hoursUntilDeadline <= 4) {
      return (NotificationPriority.urgent, NotificationType.error);
    } else if (hoursUntilDeadline <= 24) {
      return (NotificationPriority.high, NotificationType.warning);
    } else {
      return (NotificationPriority.medium, NotificationType.info);
    }
  }

  /// Site claim notification with role-based fanout
  Future<int> siteClaimNotification(
    String claimerUserId,
    String claimerName,
    String claimerRole,
    String siteName,
    String siteId,
    String? hubId,
    String? projectId,
  ) async {
    try {
      final isDataCollector = ['data_collector', 'enumerator', 'dc']
          .contains(claimerRole.toLowerCase());
      final isCoordinator = ['coordinator', 'field_coordinator']
          .contains(claimerRole.toLowerCase());

      final targetRoles = isDataCollector
          ? ['coordinator', 'supervisor', 'admin', 'super_admin']
          : isCoordinator
              ? ['admin', 'super_admin']
              : ['admin', 'super_admin'];

      final options = NotificationTriggerOptions(
        userId: '', // Will be set per user
        title: 'Site Claimed',
        message: '$claimerName has claimed the site "$siteName"',
        type: NotificationType.info,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.medium,
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
        projectId: projectId,
      );

      int successCount = await sendToRoles(targetRoles, options);

      // Also notify hub supervisors if coordinator
      if (isCoordinator && hubId != null) {
        final supervisors = await _supabase
            .from('profiles')
            .select('id')
            .eq('hub_id', hubId)
            .eq('role', 'supervisor');

        if (supervisors.isNotEmpty) {
          final supervisorIds = (supervisors as List)
              .map((s) => s['id'] as String)
              .toList();

          for (final supervisorId in supervisorIds) {
            await send(
              NotificationTriggerOptions(
                userId: supervisorId,
                title: 'Site Claimed by Coordinator',
                message: '$claimerName (Coordinator) has claimed the site "$siteName"',
                type: NotificationType.info,
                category: NotificationCategory.assignments,
                priority: NotificationPriority.medium,
                link: '/mmp',
                relatedEntityId: siteId,
                relatedEntityType: RelatedEntityType.siteVisit,
                projectId: projectId,
              ),
            );
            successCount++;
          }
        }
      }

      return successCount;
    } catch (e) {
      debugPrint('[Notification] Error sending site claim notifications: $e');
      return 0;
    }
  }

  /// Site assigned to collector - notify them of new assignment
  Future<void> siteAssigned(
    String userId,
    String siteName,
    String siteId, {
    double? enumeratorFee,
    double? transportFee,
    String? assignedBy,
  }) async {
    final feeInfo = enumeratorFee != null && transportFee != null
        ? ' Fee: $enumeratorFee SDG (enumerator) + $transportFee SDG (transport)'
        : '';

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Site Assigned',
        message: 'You have been assigned to visit "$siteName".$feeInfo',
        type: NotificationType.info,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.high,
        link: '/site-visits?status=dispatched',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Site auto-release notification
  Future<void> siteAutoReleased(
    String userId,
    String siteName,
    String siteId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Site Released',
        message: 'Your claim on "$siteName" has been automatically released due to no confirmation before the deadline.',
        type: NotificationType.warning,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.high,
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Site visit completed notification
  Future<void> siteVisitCompleted(
    String userId,
    String siteName,
    String collectorName,
    String siteId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Site Visit Completed',
        message: '$collectorName has completed the visit to "$siteName"',
        type: NotificationType.success,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.medium,
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  // ==================== APPROVAL NOTIFICATIONS ====================

  /// Request approval from user
  Future<void> approvalRequired(
    String userId,
    String itemType,
    String itemName,
    String link,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Approval Required',
        message: '$itemType "$itemName" requires your approval',
        type: NotificationType.warning,
        category: NotificationCategory.approvals,
        priority: NotificationPriority.high,
        link: link,
        sendEmail: true,
      ),
    );
  }

  // ==================== FINANCIAL NOTIFICATIONS ====================

  /// Notify user about withdrawal status change
  Future<void> withdrawalStatusChanged(
    String userId,
    String status,
    int amount,
  ) async {
    final (title, message, type, priority) = _getWithdrawalStatusMessage(status, amount);

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: title,
        message: message,
        type: type,
        category: NotificationCategory.financial,
        priority: priority,
        link: '/wallet',
        sendEmail: true,
      ),
    );
  }

  (String, String, NotificationType, NotificationPriority)
      _getWithdrawalStatusMessage(String status, int amount) {
    switch (status) {
      case 'approved':
        return (
          'Withdrawal Approved',
          'Your withdrawal of SDG $amount has been approved',
          NotificationType.success,
          NotificationPriority.high,
        );
      case 'rejected':
        return (
          'Withdrawal Rejected',
          'Your withdrawal of SDG $amount has been rejected',
          NotificationType.error,
          NotificationPriority.high,
        );
      case 'pending_final':
        return (
          'Withdrawal Pending Final Approval',
          'Your withdrawal of SDG $amount is pending final approval',
          NotificationType.info,
          NotificationPriority.medium,
        );
      default:
        return (
          'Withdrawal Status Updated',
          'Your withdrawal of SDG $amount status has been updated',
          NotificationType.info,
          NotificationPriority.medium,
        );
    }
  }

  /// Budget threshold alert
  Future<void> budgetThresholdAlert(
    String userId,
    String projectName,
    int percentUsed,
  ) async {
    final (type, priority) = percentUsed >= 100
        ? (NotificationType.error, NotificationPriority.urgent)
        : percentUsed >= 90
            ? (NotificationType.warning, NotificationPriority.high)
            : (NotificationType.info, NotificationPriority.medium);

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: percentUsed >= 100 ? 'Budget Exceeded' : 'Budget Alert',
        message: '$projectName has used $percentUsed% of its allocated budget',
        type: type,
        category: NotificationCategory.financial,
        priority: priority,
        link: '/budget',
      ),
    );
  }

  // ==================== FILE UPLOAD NOTIFICATIONS ====================

  /// MMP file upload completed successfully
  Future<void> mmpUploadComplete(
    String userId,
    String mmpName,
    int siteCount,
    String mmpId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'MMP Upload Complete',
        message: 'Successfully uploaded "$mmpName" with $siteCount sites',
        type: NotificationType.success,
        category: NotificationCategory.system,
        priority: NotificationPriority.medium,
        link: '/mmp/$mmpId',
        relatedEntityId: mmpId,
        relatedEntityType: RelatedEntityType.mmpFile,
      ),
    );
  }

  /// MMP file upload failed
  Future<void> mmpUploadFailed(
    String userId,
    String fileName,
    String errorMessage,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'MMP Upload Failed',
        message: 'Failed to upload "$fileName": $errorMessage',
        type: NotificationType.error,
        category: NotificationCategory.system,
        priority: NotificationPriority.high,
      ),
    );
  }

  // ==================== SIGNATURE NOTIFICATIONS ====================

  /// Signature required notification
  Future<void> signatureRequired(
    String userId,
    String documentTitle,
    String documentId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Signature Required',
        message: 'Your signature is required for "$documentTitle"',
        type: NotificationType.warning,
        category: NotificationCategory.signatures,
        priority: NotificationPriority.high,
        link: '/signatures',
        relatedEntityId: documentId,
        relatedEntityType: RelatedEntityType.document,
      ),
    );
  }

  /// Transaction signed notification
  Future<void> transactionSigned(
    String userId,
    String transactionId,
    int amount,
    String currency,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Transaction Signed',
        message: 'Your transaction of $currency $amount has been digitally signed and recorded',
        type: NotificationType.success,
        category: NotificationCategory.signatures,
        priority: NotificationPriority.medium,
        link: '/wallet',
        relatedEntityId: transactionId,
        relatedEntityType: RelatedEntityType.transaction,
      ),
    );
  }

  // ==================== MESSAGE NOTIFICATIONS ====================

  /// New message notification
  Future<void> newMessage(
    String userId,
    String senderName,
    String messagePreview,
    String? chatId,
  ) async {
    final preview = messagePreview.length > 50
        ? '${messagePreview.substring(0, 50)}...'
        : messagePreview;

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'New Message',
        message: '$senderName: $preview',
        type: NotificationType.info,
        category: NotificationCategory.messages,
        priority: NotificationPriority.medium,
        link: chatId != null ? '/chat?userId=$chatId' : '/chat',
        relatedEntityId: chatId,
        relatedEntityType: RelatedEntityType.chat,
      ),
    );
  }

  // ==================== CALL NOTIFICATIONS ====================

  /// Incoming call notification
  Future<void> incomingCall(
    String userId,
    String callerName,
    String callerId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Incoming Call',
        message: '$callerName is calling you',
        type: NotificationType.info,
        category: NotificationCategory.calls,
        priority: NotificationPriority.urgent,
        link: '/calls',
        relatedEntityId: callerId,
        relatedEntityType: RelatedEntityType.call,
      ),
    );
  }

  /// Missed call notification
  Future<void> missedCall(
    String userId,
    String callerName,
    String callerId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Missed Call',
        message: 'You missed a call from $callerName',
        type: NotificationType.warning,
        category: NotificationCategory.calls,
        priority: NotificationPriority.high,
        link: '/calls',
        relatedEntityId: callerId,
        relatedEntityType: RelatedEntityType.call,
      ),
    );
  }

  // ==================== HELPER METHODS ====================

  Future<void> _sendEmailNotification(
    String userId,
    String title,
    String message,
    String? actionUrl,
    String? actionLabel,
  ) async {
    try {
      // Get user email from profiles
      final userResponse = await _supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .maybeSingle();

      final email = (userResponse?['email']) as String?;
      if (email == null) return;

      // TODO: Implement email sending via your email service
      // This is a placeholder for integration with a real email service
      debugPrint('[Notification] Email notification queued for $email');
    } catch (e) {
      debugPrint('[Notification] Error sending email notification: $e');
    }
  }
}

extension on NotificationTriggerOptions {
  NotificationTriggerOptions copyWith({
    String? userId,
    String? title,
    String? message,
    NotificationType? type,
    NotificationCategory? category,
    NotificationPriority? priority,
    String? link,
    String? relatedEntityId,
    RelatedEntityType? relatedEntityType,
    List<String>? targetRoles,
    String? projectId,
    bool? sendEmail,
    String? emailActionUrl,
    String? emailActionLabel,
  }) {
    return NotificationTriggerOptions(
      userId: userId ?? this.userId,
      title: title ?? this.title,
      message: message ?? this.message,
      type: type ?? this.type,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      link: link ?? this.link,
      relatedEntityId: relatedEntityId ?? this.relatedEntityId,
      relatedEntityType: relatedEntityType ?? this.relatedEntityType,
      targetRoles: targetRoles ?? this.targetRoles,
      projectId: projectId ?? this.projectId,
      sendEmail: sendEmail ?? this.sendEmail,
      emailActionUrl: emailActionUrl ?? this.emailActionUrl,
      emailActionLabel: emailActionLabel ?? this.emailActionLabel,
    );
  }
}
