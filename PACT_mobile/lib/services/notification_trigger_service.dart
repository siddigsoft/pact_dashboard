import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/notification_models.dart';
import 'notification_service.dart';

/// NotificationTriggerService - Comprehensive notification sending service
/// Handles all notification types across the PACT app with proper categorization
/// and priority management
class NotificationTriggerService {
  static final NotificationTriggerService _instance =
      NotificationTriggerService._internal();

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

      final prefs =
          response['notification_preferences'] as Map<String, dynamic>?;
      if (prefs == null) return true;

      final notifPrefs = NotificationPreferences.fromJson(prefs);

      // Check if notifications are enabled
      if (!notifPrefs.enabled) return false;

      // Check if this category is enabled
      final categoryStr = category.toString().split('.').last;
      if (!notifPrefs.categories.containsKey(categoryStr)) return false;
      if (!notifPrefs.categories[categoryStr]!) return false;

      // Check quiet hours (bypass for urgent)
      if (priority != NotificationPriority.urgent &&
          notifPrefs.quietHours != null) {
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

      // Insert notification into database and return inserted row so we have the ID
      final inserted = await _supabase
          .from('notifications')
          .insert({
            'user_id': options.userId,
            'title': options.title,
            if (options.titleAr != null) 'title_ar': options.titleAr,
            'message': options.message,
            if (options.messageAr != null) 'message_ar': options.messageAr,
            'type': options.type.toString().split('.').last,
            'category': options.category.toString().split('.').last,
            'priority': options.priority.toString().split('.').last,
            'link': options.link,
            'related_entity_id': options.relatedEntityId,
            'related_entity_type': options.relatedEntityType
                ?.toString()
                .split('.')
                .last,
            'target_roles': options.targetRoles,
            'project_id': options.projectId,
            'is_read': false,
          })
          .select('id')
          .maybeSingle();

      if (inserted != null && inserted['id'] != null) {
        await NotificationService.showUserNotification(
          notificationId: inserted['id'].toString(),
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
      final success = await send(options.copyWith(userId: userId));
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
        title: hoursUntilDeadline <= 0
            ? 'Site Visit Overdue'
            : 'Site Visit Reminder',
        titleAr: hoursUntilDeadline <= 0
            ? 'تأخر زيارة الموقع'
            : 'تذكير بزيارة الموقع',
        message: message,
        messageAr: hoursUntilDeadline <= 0
            ? 'تأخرت زيارة الموقع "$siteName"!'
            : 'يحين موعد زيارة الموقع "$siteName" خلال $hoursUntilDeadline ساعة',
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
  (NotificationPriority, NotificationType) _calculateUrgency(
    int hoursUntilDeadline,
  ) {
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
      final isDataCollector = [
        'data_collector',
        'enumerator',
        'dc',
      ].contains(claimerRole.toLowerCase());
      final isCoordinator = [
        'coordinator',
        'field_coordinator',
      ].contains(claimerRole.toLowerCase());

      final targetRoles = isDataCollector
          ? ['coordinator', 'supervisor', 'admin', 'super_admin']
          : isCoordinator
          ? ['admin', 'super_admin']
          : ['admin', 'super_admin'];

      final options = NotificationTriggerOptions(
        userId: '', // Will be set per user
        title: 'Site Claimed',
        titleAr: 'تم حجز الموقع',
        message: '$claimerName has claimed the site "$siteName"',
        messageAr: 'قام $claimerName بحجز الموقع "$siteName"',
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
                titleAr: 'تم حجز الموقع من قبل المنسق',
                message:
                    '$claimerName (Coordinator) has claimed the site "$siteName"',
                messageAr: 'قام $claimerName (منسق) بحجز الموقع "$siteName"',
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
    final feeInfoAr = enumeratorFee != null && transportFee != null
        ? ' الأجر: $enumeratorFee جنيه (للباحث) + $transportFee جنيه (للمواصلات)'
        : '';

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Site Assigned',
        titleAr: 'تم تعيين الموقع',
        message: 'You have been assigned to visit "$siteName".$feeInfo',
        messageAr: 'تم تعيينك لزيارة الموقع "$siteName".$feeInfoAr',
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
        titleAr: 'تم سحب الموقع',
        message:
            'Your claim on "$siteName" has been automatically released due to no confirmation before the deadline.',
        messageAr:
            'تم سحب حجزك للموقع "$siteName" تلقائياً بسبب عدم التأكيد قبل الموعد النهائي.',
        type: NotificationType.warning,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.high,
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Site visit completed notification (to coordinator/supervisor)
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
        titleAr: 'تم إكمال زيارة الموقع',
        message: '$collectorName has completed the visit to "$siteName"',
        messageAr: 'أكمل $collectorName الزيارة إلى "$siteName"',
        type: NotificationType.success,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.medium,
        link: '/mmp',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Notify the user who completed the visit (e.g. "You have completed site A").
  Future<void> siteVisitCompletedBySelf(
    String userId,
    String siteName,
    String siteId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Site Visit Completed',
        titleAr: 'تم إكمال زيارة الموقع',
        message: 'You have completed the visit to "$siteName".',
        messageAr: 'لقد قمت بإكمال زيارة الموقع "$siteName".',
        type: NotificationType.success,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.medium,
        link: '/site-visits?status=completed',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Notify the user who claimed the site (e.g. "You have claimed site A").
  Future<void> siteClaimedBySelf(
    String userId,
    String siteName,
    String siteId,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Site Claimed',
        titleAr: 'تم حجز الموقع',
        message: 'You have claimed the site "$siteName".',
        messageAr: 'لقد قمت بحجز الموقع "$siteName".',
        type: NotificationType.success,
        category: NotificationCategory.assignments,
        priority: NotificationPriority.medium,
        link: '/site-visits?status=dispatched',
        relatedEntityId: siteId,
        relatedEntityType: RelatedEntityType.siteVisit,
      ),
    );
  }

  /// Notify the user who requested a withdrawal (e.g. "You have requested a withdrawal of X SDG").
  Future<void> withdrawalRequestedBySelf(
    String userId,
    double amount,
    String currency,
  ) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Withdrawal Requested',
        titleAr: 'تم طلب سحب',
        message:
            'You have requested a withdrawal of $currency ${amount.toStringAsFixed(0)}.',
        messageAr:
            'لقد قمت بطلب سحب مبلغ ${amount.toStringAsFixed(0)} $currency.',
        type: NotificationType.info,
        category: NotificationCategory.financial,
        priority: NotificationPriority.medium,
        link: '/wallet',
        relatedEntityType: RelatedEntityType.wallet,
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
        titleAr: 'مطلوب موافقة',
        message: '$itemType "$itemName" requires your approval',
        messageAr: '$itemType "$itemName" يتطلب موافقتك',
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
    final (title, titleAr, message, messageAr, type, priority) =
        _getWithdrawalStatusMessage(status, amount);

    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: title,
        titleAr: titleAr,
        message: message,
        messageAr: messageAr,
        type: type,
        category: NotificationCategory.financial,
        priority: priority,
        link: '/wallet',
        sendEmail: true,
      ),
    );
  }

  (String, String, String, String, NotificationType, NotificationPriority)
  _getWithdrawalStatusMessage(String status, int amount) {
    switch (status) {
      case 'approved':
        return (
          'Withdrawal Approved',
          'تمت الموافقة على السحب',
          'Your withdrawal of SDG $amount has been approved',
          'تمت الموافقة على سحب مبلغ $amount جنيه',
          NotificationType.success,
          NotificationPriority.high,
        );
      case 'rejected':
        return (
          'Withdrawal Rejected',
          'تم رفض السحب',
          'Your withdrawal of SDG $amount has been rejected',
          'تم رفض سحب مبلغ $amount جنيه',
          NotificationType.error,
          NotificationPriority.high,
        );
      case 'pending_final':
        return (
          'Withdrawal Pending Final Approval',
          'السحب بانتظار الموافقة النهائية',
          'Your withdrawal of SDG $amount is pending final approval',
          'سحب مبلغ $amount جنيه بانتظار الموافقة النهائية',
          NotificationType.info,
          NotificationPriority.medium,
        );
      default:
        return (
          'Withdrawal Status Updated',
          'تم تحديث حالة السحب',
          'Your withdrawal of SDG $amount status has been updated',
          'تم تحديث حالة سحب مبلغ $amount جنيه',
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
        titleAr: percentUsed >= 100 ? 'تجاوز الميزانية' : 'تنبيه الميزانية',
        message: '$projectName has used $percentUsed% of its allocated budget',
        messageAr: 'استهلك $projectName $percentUsed% من ميزانيته المخصصة',
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
        titleAr: 'اكتمل رفع ملف MMP',
        message: 'Successfully uploaded "$mmpName" with $siteCount sites',
        messageAr: 'تم بنجاح رفع "$mmpName" مع $siteCount مواقع',
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
        titleAr: 'فشل رفع ملف MMP',
        message: 'Failed to upload "$fileName": $errorMessage',
        messageAr: 'فشل رفع "$fileName": $errorMessage',
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
        titleAr: 'مطلوب توقيع',
        message: 'Your signature is required for "$documentTitle"',
        messageAr: 'توقيعك مطلوب للإجراء: "$documentTitle"',
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
        titleAr: 'تم توقيع المعاملة',
        message:
            'Your transaction of $currency $amount has been digitally signed and recorded',
        messageAr: 'تم توقيع وتسجيل معاملتك بقيمة $amount $currency رقمياً',
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
        titleAr: 'رسالة جديدة',
        message: '$senderName: $preview',
        messageAr: '$senderName: $preview',
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

  /// Incoming call notification (Phase 8a: Enhanced with action context)
  Future<void> incomingCall(
    String userId,
    String callerName,
    String callerId, {
    bool isVideoCall = false,
    String? callerRole,
    String? callerAvatar,
  }) async {
    await send(
      NotificationTriggerOptions(
        userId: userId,
        title: 'Incoming ${isVideoCall ? 'Video' : 'Voice'} Call',
        titleAr: 'مكالمة ${isVideoCall ? 'فيديو' : 'صوتية'} واردة',
        message:
            '$callerName is calling you${callerRole != null ? ' ($callerRole)' : ''}',
        messageAr:
            'يتصل بك $callerName${callerRole != null ? ' ($callerRole)' : ''}',
        type: NotificationType.info,
        category: NotificationCategory.calls,
        priority: NotificationPriority.urgent,
        link: '/calls',
        relatedEntityId: callerId,
        relatedEntityType: RelatedEntityType.call,
      ),
    );
    // Phase 8a: Action buttons will be handled by notification_service listener
    // Maps to Answer/Decline buttons in native notification handlers
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
        titleAr: 'مكالمة فائتة',
        message: 'You missed a call from $callerName',
        messageAr: 'لديك مكالمة فائتة من $callerName',
        type: NotificationType.warning,
        category: NotificationCategory.calls,
        priority: NotificationPriority.high,
        link: '/calls',
        relatedEntityId: callerId,
        relatedEntityType: RelatedEntityType.call,
      ),
    );
  }

  // ==================== RECLAIM FINANCIAL GAP NOTIFICATIONS ====================

  /// Notify an enumerator that their advance was auto-cancelled because the
  /// site they were assigned to has been reclaimed.
  Future<bool> sendAdvanceAutoCancelledOnReclaim({
    required String enumeratorId,
    required String siteName,
    required double amount,
    required String reclaimReason,
  }) async {
    try {
      return await send(
        NotificationTriggerOptions(
          userId: enumeratorId,
          title: 'Advance Cancelled — Site Reclaimed',
          message:
              'Your transportation advance of SDG ${amount.toStringAsFixed(0)} '
              'for site "$siteName" has been automatically cancelled because '
              'the site was reclaimed. Reason: $reclaimReason. '
              'Please contact your supervisor for further information.',
          type: NotificationType.warning,
          category: NotificationCategory.financial,
          priority: NotificationPriority.high,
          link: '/advance-requests-report',
          relatedEntityType: RelatedEntityType.downPayment,
          sendEmail: false,
        ),
      );
    } catch (e) {
      debugPrint(
        '[Notification] Error sending advance auto-cancel notification: $e',
      );
      return false;
    }
  }

  /// Notify an enumerator that their advance was auto-cancelled due to site
  /// reclaim — Arabic version.
  Future<bool> sendAdvanceAutoCancelledOnReclaimArabic({
    required String enumeratorId,
    required String siteName,
    required double amount,
    required String reclaimReason,
  }) async {
    try {
      return await send(
        NotificationTriggerOptions(
          userId: enumeratorId,
          title: 'تم إلغاء السلفة — تم استرداد الموقع',
          message:
              'تم إلغاء سلفة النقل الخاصة بك البالغة ${amount.toStringAsFixed(0)} جنيه '
              'لموقع "$siteName" تلقائياً بسبب استرداد الموقع. '
              'السبب: $reclaimReason. '
              'يرجى التواصل مع مشرفك للحصول على مزيد من المعلومات.',
          type: NotificationType.warning,
          category: NotificationCategory.financial,
          priority: NotificationPriority.high,
          link: '/advance-requests-report',
          relatedEntityType: RelatedEntityType.downPayment,
          sendEmail: false,
        ),
      );
    } catch (e) {
      debugPrint(
        '[Notification] Error sending Arabic advance auto-cancel notification: $e',
      );
      return false;
    }
  }

  /// Alert financial admins/supervisors that a disbursed advance now requires
  /// manual reconciliation following a site reclaim.
  Future<bool> sendReclaimReconciliationAlert({
    required String recipientId,
    required String enumeratorName,
    required String siteName,
    required double amount,
    required String advanceId,
  }) async {
    try {
      return await send(
        NotificationTriggerOptions(
          userId: recipientId,
          title: 'Manual Reconciliation Required',
          message:
              'Advance of SDG ${amount.toStringAsFixed(0)} for $enumeratorName '
              '(site: $siteName) requires manual financial reconciliation after '
              'site reclaim. Please review in the Transportation Advance Report.',
          type: NotificationType.warning,
          category: NotificationCategory.financial,
          priority: NotificationPriority.urgent,
          link: '/advance-requests-report?tab=reclaimImpact',
          relatedEntityId: advanceId,
          relatedEntityType: RelatedEntityType.downPayment,
          sendEmail: true,
          emailActionUrl: '/advance-requests-report?tab=reclaimImpact',
          emailActionLabel: 'View Reclaim Impact Report',
        ),
      );
    } catch (e) {
      debugPrint('[Notification] Error sending reconciliation alert: $e');
      return false;
    }
  }

  /// Alert financial admins that an advance has been written off.
  Future<bool> sendAdvanceWrittenOffAlert({
    required String recipientId,
    required String enumeratorName,
    required String siteName,
    required double amount,
    required String writeOffReason,
    required String advanceId,
  }) async {
    try {
      return await send(
        NotificationTriggerOptions(
          userId: recipientId,
          title: 'Advance Written Off',
          message:
              'Advance of SDG ${amount.toStringAsFixed(0)} for $enumeratorName '
              '(site: $siteName) has been written off. '
              'Reason: $writeOffReason.',
          type: NotificationType.info,
          category: NotificationCategory.financial,
          priority: NotificationPriority.medium,
          link: '/advance-requests-report?tab=reclaimImpact',
          relatedEntityId: advanceId,
          relatedEntityType: RelatedEntityType.downPayment,
          sendEmail: false,
        ),
      );
    } catch (e) {
      debugPrint('[Notification] Error sending write-off alert: $e');
      return false;
    }
  }

  // ==================== SITE DISPATCH NOTIFICATIONS ====================

  /// Send bilingual site dispatch notification to field staff
  /// Shows notification in both English and Arabic with sound and vibration
  Future<bool> sendSiteDispatchedNotification({
    required String siteCode,
    required String siteName,
    required String location,
    required String budget,
  }) async {
    try {
      // Show the bilingual notification with high priority
      await NotificationService.showSiteDispatchedNotification(
        siteCode: siteCode,
        siteName: siteName,
        location: location,
        budget: budget,
      );

      debugPrint(
        '[Notification] Site dispatch notification sent for site $siteCode',
      );
      return true;
    } catch (e) {
      debugPrint('[Notification] Error sending site dispatch notification: $e');
      return false;
    }
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
