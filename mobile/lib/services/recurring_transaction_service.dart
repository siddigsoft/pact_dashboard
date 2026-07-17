import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Recurring transaction scheduling service for automated withdrawals and advances
class RecurringTransactionService {
  static final RecurringTransactionService _instance =
      RecurringTransactionService._internal();

  factory RecurringTransactionService() {
    return _instance;
  }

  RecurringTransactionService._internal();

  final String _tableName = 'recurring_transactions';

  /// Create recurring withdrawal
  Future<void> scheduleRecurringWithdrawal({
    required String userId,
    required double amount,
    required String paymentMethod,
    required String frequency, // 'weekly', 'bi-weekly', 'monthly'
    required int dayOfWeek, // 0=Monday, 6=Sunday
    String? reason,
  }) async {
    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'type': 'withdrawal',
        'amount': amount,
        'payment_method': paymentMethod,
        'frequency': frequency,
        'day_of_week': dayOfWeek,
        'reason': reason,
        'is_active': true,
        'metadata': {
          'created_at': now,
          'last_executed': null,
          'next_execution': _calculateNextExecution(frequency, dayOfWeek),
        },
        'created_at': now,
      });

      debugPrint('[RecurringTx] Withdrawal scheduled: $amount SDG $frequency');
    } catch (e) {
      debugPrint('[RecurringTx] Error scheduling withdrawal: $e');
    }
  }

  /// Get active recurring transactions
  Future<List<Map<String, dynamic>>> getActiveRecurring(String userId) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[RecurringTx] Error fetching recurring: $e');
      return [];
    }
  }

  /// Disable recurring transaction
  Future<void> disableRecurring(String recurringId) async {
    try {
      await Supabase.instance.client
          .from(_tableName)
          .update({'is_active': false})
          .eq('id', recurringId);

      debugPrint('[RecurringTx] Recurring transaction disabled');
    } catch (e) {
      debugPrint('[RecurringTx] Error disabling: $e');
    }
  }

  /// Calculate next execution date
  static String _calculateNextExecution(String frequency, int dayOfWeek) {
    final now = DateTime.now();
    DateTime next;

    if (frequency == 'weekly') {
      next = now.add(Duration(days: (dayOfWeek - now.weekday + 7) % 7 + 1));
    } else if (frequency == 'bi-weekly') {
      next = now.add(Duration(days: 14));
    } else {
      // monthly
      next = DateTime(now.year, now.month + 1, dayOfWeek);
      if (next.isBefore(now)) {
        next = DateTime(now.year, now.month + 2, dayOfWeek);
      }
    }

    return next.toIso8601String();
  }

  /// Execute pending recurring transactions
  Future<void> executePendingTransactions(String userId) async {
    try {
      final recurring = await getActiveRecurring(userId);

      for (final tx in recurring) {
        final nextExecution = tx['metadata']?['next_execution'] as String?;
        if (nextExecution == null) continue;

        final nextDate = DateTime.parse(nextExecution);
        if (nextDate.isBefore(DateTime.now())) {
          // Execute this transaction
          debugPrint('[RecurringTx] Executing recurring: ${tx['amount']}');
          // TODO: Implement actual execution logic
        }
      }
    } catch (e) {
      debugPrint('[RecurringTx] Error executing pending: $e');
    }
  }

  /// Get execution history
  Future<List<Map<String, dynamic>>> getExecutionHistory(
    String recurringId,
  ) async {
    try {
      final data = await Supabase.instance.client
          .from('${_tableName}_history')
          .select('*')
          .eq('recurring_id', recurringId)
          .order('executed_at', ascending: false)
          .limit(20);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[RecurringTx] Error fetching history: $e');
      return [];
    }
  }
}
