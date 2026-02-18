import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'notification_service.dart';

class RealtimeNotificationService {
  static final RealtimeNotificationService _instance =
      RealtimeNotificationService._internal();
  factory RealtimeNotificationService() => _instance;
  RealtimeNotificationService._internal();

  final SupabaseClient _supabase = Supabase.instance.client;
  RealtimeChannel? _chatChannel;
  RealtimeChannel? _mmpChannel;

  RealtimeChannel? _costChannel;
  RealtimeChannel? _notificationsChannel;

  String? _currentUserId;
  bool _isInitialized = false;

  Future<void> initialize() async {
    if (_isInitialized) return;

    _currentUserId = _supabase.auth.currentUser?.id;

    if (_currentUserId == null) {
      print('User not logged in, cannot initialize notifications');
      return;
    }

    await _setupChatListener();
    await _setupMMPFileListener();
    await _setupCostSubmissionListener();
    await _setupNotificationsListener();

    _isInitialized = true;
    print('Realtime notification service initialized');
  }

  // ==================== CHAT MESSAGE LISTENER ====================

  Future<void> _setupChatListener() async {
    try {
      // Subscribe to chat_messages table for new messages
      _chatChannel = _supabase
          .channel('chat_messages_notifications')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'chat_messages',
            callback: (payload) async {
              await _handleNewChatMessage(payload);
            },
          )
          .subscribe();

      print('Chat message listener started');
    } catch (e) {
      print('Error setting up chat listener: $e');
    }
  }

  Future<void> _handleNewChatMessage(PostgresChangePayload payload) async {
    try {
      final newMessage = payload.newRecord;

      // Don't notify for own messages
      if (newMessage['sender_id'] == _currentUserId) {
        return;
      }

      // Get sender information
      final senderResponse = await _supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', newMessage['sender_id'])
          .single();

      final senderName =
          senderResponse['full_name'] ?? senderResponse['email'] ?? 'Someone';

      final message = newMessage['content'] ?? 'Sent a message';
      final chatId = newMessage['chat_id'];

      // Show notification
      await NotificationService.showChatMessageNotification(
        senderName: senderName,
        message: message,
        chatId: chatId,
      );

      print('Chat notification sent for message from $senderName');
    } catch (e) {
      print('Error handling new chat message: $e');
    }
  }

  // ==================== MMP FILE LISTENER ====================

  Future<void> _setupMMPFileListener() async {
    try {
      // Subscribe to reports table for new MMP files
      _mmpChannel = _supabase
          .channel('mmp_files_notifications')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'reports',
            callback: (payload) async {
              await _handleNewMMPFile(payload);
            },
          )
          .subscribe();

      print('MMP file listener started');
    } catch (e) {
      print('Error setting up MMP file listener: $e');
    }
  }

  Future<void> _handleNewMMPFile(PostgresChangePayload payload) async {
    try {
      final newFile = payload.newRecord;

      // Don't notify for own uploads
      if (newFile['user_id'] == _currentUserId) {
        return;
      }

      // Get uploader information
      final uploaderResponse = await _supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', newFile['user_id'])
          .single();

      final uploaderName =
          uploaderResponse['full_name'] ??
          uploaderResponse['email'] ??
          'Someone';

      final fileName = newFile['title'] ?? 'New MMP File';
      final fileId = newFile['id'];

      // Show notification
      await NotificationService.showMMPFileNotification(
        title: 'New MMP File Available',
        body: '$uploaderName uploaded: $fileName',
        fileId: fileId,
        fileName: fileName,
      );

      print('MMP file notification sent for $fileName');
    } catch (e) {
      print('Error handling new MMP file: $e');
    }
  }

  // ==================== COST SUBMISSION LISTENER ====================

  Future<void> _setupCostSubmissionListener() async {
    try {
      _costChannel = _supabase
          .channel('cost_submissions_notifications')
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'operational_cost_submissions',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'user_id',
              value: _currentUserId!,
            ),
            callback: (payload) async {
              await _handleCostSubmissionUpdate(payload);
            },
          )
          .subscribe();

      print('Cost submission listener started');
    } catch (e) {
      print('Error setting up cost submission listener: $e');
    }
  }

  Future<void> _handleCostSubmissionUpdate(PostgresChangePayload payload) async {
    try {
      final updated = payload.newRecord;
      final old = payload.oldRecord;
      final submissionId = updated['id']?.toString() ?? '';

      final newStatus = updated['status']?.toString() ?? '';
      final oldStatus = old['status']?.toString() ?? '';

      final rawAmount = updated['amount_cents'] ?? updated['amount'];
      double amount = 0.0;
      if (rawAmount is int) {
        amount = rawAmount / 100.0;
      } else if (rawAmount is double) {
        amount = rawAmount < 1000 ? rawAmount : rawAmount / 100.0;
      }
      final currency = updated['currency']?.toString() ?? 'SDG';
      final category = updated['expense_category']?.toString() ?? '';

      final newT1 = updated['tier1_status']?.toString();
      final oldT1 = old['tier1_status']?.toString();
      final newT2 = updated['tier2_status']?.toString();
      final oldT2 = old['tier2_status']?.toString();
      final newT3 = updated['tier3_status']?.toString();
      final oldT3 = old['tier3_status']?.toString();

      if (newStatus == 'paid' && oldStatus != 'paid') {
        await NotificationService.showCostPaymentRecordedNotification(
          submissionId: submissionId,
          amount: amount,
          currency: currency,
          category: category,
        );
      } else if (_tierChanged(newT1, oldT1) || _tierChanged(newT2, oldT2) || _tierChanged(newT3, oldT3) || newStatus != oldStatus) {
        if (_isRejected(newT1, oldT1) || _isRejected(newT2, oldT2) || _isRejected(newT3, oldT3) || newStatus == 'rejected') {
          final reason = updated['rejection_reason']?.toString() ??
              updated['tier1_notes']?.toString() ??
              updated['tier2_notes']?.toString() ??
              updated['tier3_notes']?.toString() ??
              'No reason provided';
          await NotificationService.showCostSubmissionRejectedNotification(
            submissionId: submissionId,
            siteVisitId: submissionId,
            rejectionReason: reason,
          );
        } else if (_isApproved(newT1, oldT1) || _isApproved(newT2, oldT2) || _isApproved(newT3, oldT3) || newStatus == 'approved') {
          await NotificationService.showCostSubmissionApprovedNotification(
            submissionId: submissionId,
            siteVisitId: submissionId,
            approvedAmount: amount,
            currency: currency,
          );
        }
      }

      print('Cost submission update handled: $submissionId status=$newStatus');
    } catch (e) {
      print('Error handling cost submission update: $e');
    }
  }

  bool _tierChanged(String? newVal, String? oldVal) => newVal != null && newVal != oldVal;
  bool _isApproved(String? newVal, String? oldVal) => newVal == 'approved' && oldVal != 'approved';
  bool _isRejected(String? newVal, String? oldVal) => newVal == 'rejected' && oldVal != 'rejected';

  // ==================== GENERAL NOTIFICATIONS LISTENER ====================

  Future<void> _setupNotificationsListener() async {
    try {
      _notificationsChannel = _supabase
          .channel('user_notifications_realtime')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'notifications',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'user_id',
              value: _currentUserId!,
            ),
            callback: (payload) async {
              await _handleNewNotification(payload);
            },
          )
          .subscribe();

      print('Notifications listener started');
    } catch (e) {
      print('Error setting up notifications listener: $e');
    }
  }

  Future<void> _handleNewNotification(PostgresChangePayload payload) async {
    try {
      final record = payload.newRecord;
      final title = record['title']?.toString() ?? 'Notification';
      final message = record['message']?.toString() ?? '';
      final notifId = record['id']?.toString() ?? '';

      await NotificationService.showUserNotification(
        notificationId: notifId,
        title: title,
        body: message,
      );
    } catch (e) {
      print('Error handling new notification: $e');
    }
  }

  // ==================== UTILITY METHODS ====================

  void dispose() {
    _chatChannel?.unsubscribe();
    _mmpChannel?.unsubscribe();
    _costChannel?.unsubscribe();
    _notificationsChannel?.unsubscribe();
    _chatChannel = null;
    _mmpChannel = null;
    _costChannel = null;
    _notificationsChannel = null;
    _isInitialized = false;
    print('Realtime notification service disposed');
  }

  // Restart listeners (useful after re-login)
  Future<void> restart() async {
    dispose();
    await Future.delayed(const Duration(milliseconds: 500));
    await initialize();
  }

  // Check if listeners are active
  bool get isActive => _isInitialized;
}
