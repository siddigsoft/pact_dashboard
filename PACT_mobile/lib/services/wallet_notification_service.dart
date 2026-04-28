import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Real-time wallet notification service for instant alerts
class WalletNotificationService {
  static final WalletNotificationService _instance =
      WalletNotificationService._internal();

  factory WalletNotificationService() {
    return _instance;
  }

  WalletNotificationService._internal();

  final String _tableName = 'wallet_notifications';

  /// Send withdrawal notification
  Future<void> notifyWithdrawalRequested({
    required String userId,
    required double amount,
    required String paymentMethod,
  }) async {
    try {
      final now = DateTime.now().toIso8601String();
      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'type': 'withdrawal_requested',
        'title_en': 'Withdrawal Requested',
        'title_ar': 'تم طلب السحب',
        'message_en':
            'You requested to withdraw $amount SDG via $paymentMethod',
        'message_ar': 'لقد طلبت سحب $amount SDG عبر $paymentMethod',
        'amount': amount,
        'metadata': {'payment_method': paymentMethod, 'status': 'pending'},
        'is_read': false,
        'created_at': now,
      });

      debugPrint('[WalletNotification] Withdrawal notification sent');
    } catch (e) {
      debugPrint(
        '[WalletNotification] Error sending withdrawal notification: $e',
      );
    }
  }

  /// Send earnings notification
  Future<void> notifyEarningsReceived({
    required String userId,
    required double amount,
    required String siteName,
  }) async {
    try {
      final now = DateTime.now().toIso8601String();
      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'type': 'earnings_received',
        'title_en': 'Earnings Received',
        'title_ar': 'تم استقبال الأرباح',
        'message_en': 'You earned $amount SDG from $siteName',
        'message_ar': 'حصلت على $amount SDG من $siteName',
        'amount': amount,
        'metadata': {'site_name': siteName, 'status': 'credited'},
        'is_read': false,
        'created_at': now,
      });

      debugPrint('[WalletNotification] Earnings notification sent');
    } catch (e) {
      debugPrint(
        '[WalletNotification] Error sending earnings notification: $e',
      );
    }
  }

  /// Send advance approved notification
  Future<void> notifyAdvanceApproved({
    required String userId,
    required double amount,
  }) async {
    try {
      final now = DateTime.now().toIso8601String();
      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'type': 'advance_approved',
        'title_en': 'Advance Approved',
        'title_ar': 'تمت الموافقة على السلفة',
        'message_en': 'Your advance of $amount SDG has been approved',
        'message_ar': 'تمت الموافقة على سلفتك بقيمة $amount SDG',
        'amount': amount,
        'metadata': {'status': 'approved'},
        'is_read': false,
        'created_at': now,
      });

      debugPrint('[WalletNotification] Advance approved notification sent');
    } catch (e) {
      debugPrint('[WalletNotification] Error sending advance notification: $e');
    }
  }

  /// Send budget limit warning
  Future<void> notifyBudgetWarning({
    required String userId,
    required double spent,
    required double limit,
    required String category,
  }) async {
    try {
      final percentage = ((spent / limit) * 100).toStringAsFixed(0);
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'type': 'budget_warning',
        'title_en': 'Budget Alert',
        'title_ar': 'تنبيه الميزانية',
        'message_en': 'You\'ve spent $percentage% of your $category budget',
        'message_ar': 'لقد أنفقت $percentage% من ميزانيتك ل $category',
        'amount': spent,
        'metadata': {
          'category': category,
          'limit': limit,
          'percentage': int.parse(percentage),
        },
        'is_read': false,
        'created_at': now,
      });

      debugPrint('[WalletNotification] Budget warning sent');
    } catch (e) {
      debugPrint('[WalletNotification] Error sending budget warning: $e');
    }
  }

  /// Get notifications for user
  Future<List<Map<String, dynamic>>> getUserNotifications({
    required String userId,
    bool unreadOnly = false,
    int limit = 20,
  }) async {
    try {
      var query = Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(limit);

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      final data = await query;
      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[WalletNotification] Error fetching notifications: $e');
      return [];
    }
  }

  /// Mark notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await Supabase.instance.client
          .from(_tableName)
          .update({'is_read': true})
          .eq('id', notificationId);

      debugPrint('[WalletNotification] Marked notification as read');
    } catch (e) {
      debugPrint('[WalletNotification] Error marking as read: $e');
    }
  }

  /// Get unread count
  Future<int> getUnreadCount(String userId) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('id', const FetchOptions(count: CountOption.exact))
          .eq('user_id', userId)
          .eq('is_read', false);

      return (data as List).length;
    } catch (e) {
      debugPrint('[WalletNotification] Error getting unread count: $e');
      return 0;
    }
  }

  /// Clear all notifications for user
  Future<void> clearAllNotifications(String userId) async {
    try {
      await Supabase.instance.client
          .from(_tableName)
          .delete()
          .eq('user_id', userId);

      debugPrint('[WalletNotification] All notifications cleared');
    } catch (e) {
      debugPrint('[WalletNotification] Error clearing notifications: $e');
    }
  }
}
