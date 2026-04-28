import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Expense sharing and splitting management
class ExpenseSharingService {
  static final ExpenseSharingService _instance =
      ExpenseSharingService._internal();

  factory ExpenseSharingService() {
    return _instance;
  }

  ExpenseSharingService._internal();

  final _supabase = Supabase.instance.client;

  /// Create a shared expense
  Future<bool> createSharedExpense(
    String userId,
    String title,
    double totalAmount,
    List<String> participantIds, {
    String description = '',
  }) async {
    try {
      final expense = {
        'creator_id': userId,
        'title': title,
        'total_amount': totalAmount,
        'description': description,
        'split_count': participantIds.length,
        'amount_per_person': totalAmount / participantIds.length,
        'status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('shared_expenses')
          .insert(expense)
          .select();

      if (response.isEmpty) return false;

      final expenseId = response[0]['id'];

      // Create share records for each participant
      final shares = participantIds.map((participantId) {
        return {
          'expense_id': expenseId,
          'user_id': participantId,
          'amount': totalAmount / participantIds.length,
          'status': participantId == userId ? 'paid' : 'pending',
          'created_at': DateTime.now().toIso8601String(),
        };
      }).toList();

      await _supabase.from('expense_shares').insert(shares);

      debugPrint('[ExpenseSharing] Shared expense created: $expenseId');
      return true;
    } catch (e) {
      debugPrint('[ExpenseSharing] Error creating shared expense: $e');
      return false;
    }
  }

  /// Get shared expenses for user
  Future<List<Map<String, dynamic>>> getSharedExpenses(String userId) async {
    try {
      final expenses = await _supabase
          .from('shared_expenses')
          .select()
          .or('creator_id.eq.$userId,participants.cs.{$userId}')
          .order('created_at', ascending: false);

      return expenses.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[ExpenseSharing] Error getting shared expenses: $e');
      return [];
    }
  }

  /// Get pending shares for user
  Future<List<Map<String, dynamic>>> getPendingShares(String userId) async {
    try {
      final shares = await _supabase
          .from('expense_shares')
          .select(
            'id, expense_id, amount, status, shared_expenses(title, created_at)',
          )
          .eq('user_id', userId)
          .eq('status', 'pending')
          .order('created_at', ascending: false);

      return shares.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[ExpenseSharing] Error getting pending shares: $e');
      return [];
    }
  }

  /// Settle a shared expense
  Future<bool> settleShare(String shareId, String userId) async {
    try {
      await _supabase
          .from('expense_shares')
          .update({
            'status': 'settled',
            'settled_at': DateTime.now().toIso8601String(),
          })
          .eq('id', shareId);

      // Create transaction record
      final share = await _supabase
          .from('expense_shares')
          .select('amount, expense_id')
          .eq('id', shareId)
          .single();

      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'amount': -(share['amount'] as num),
        'type': 'expense_settlement',
        'category': 'shared_expenses',
        'description': 'Settled shared expense #${share['expense_id']}',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[ExpenseSharing] Share settled: $shareId');
      return true;
    } catch (e) {
      debugPrint('[ExpenseSharing] Error settling share: $e');
      return false;
    }
  }

  /// Get expense summary for a shared expense
  Future<Map<String, dynamic>> getExpenseSummary(String expenseId) async {
    try {
      final expense = await _supabase
          .from('shared_expenses')
          .select()
          .eq('id', expenseId)
          .single();

      final shares = await _supabase
          .from('expense_shares')
          .select()
          .eq('expense_id', expenseId);

      final totalSettled = shares.fold<double>(0, (sum, share) {
        return sum +
            (share['status'] == 'settled'
                ? (share['amount'] as num).toDouble()
                : 0);
      });

      return {
        'title': expense['title'],
        'total_amount': expense['total_amount'],
        'settled_amount': totalSettled,
        'pending_amount': expense['total_amount'] - totalSettled,
        'participants_count': shares.length,
        'settled_count': shares.where((s) => s['status'] == 'settled').length,
        'shares': shares,
      };
    } catch (e) {
      debugPrint('[ExpenseSharing] Error getting summary: $e');
      return {};
    }
  }

  /// Get group summary (total owed/owing)
  Future<Map<String, dynamic>> getGroupBalances(
    String userId,
    List<String> groupMembers,
  ) async {
    try {
      final expenses = await _supabase
          .from('shared_expenses')
          .select('id, total_amount, created_at')
          .or('creator_id.eq.$userId,participants.cs.{$userId}');

      final balances = <String, double>{};
      for (final member in groupMembers) {
        balances[member] = 0;
      }

      for (final expense in expenses) {
        final shares = await _supabase
            .from('expense_shares')
            .select('user_id, amount, status')
            .eq('expense_id', expense['id']);

        for (final share in shares) {
          final status = (share['status'] as String?) ?? 'pending';
          final amount = (share['amount'] as num?)?.toDouble() ?? 0;
          final participantId = (share['user_id'] as String?) ?? '';

          if (status == 'pending' && groupMembers.contains(participantId)) {
            balances[participantId] = (balances[participantId] ?? 0) + amount;
          }
        }
      }

      return balances;
    } catch (e) {
      debugPrint('[ExpenseSharing] Error getting balances: $e');
      return {};
    }
  }

  /// Calculate who owes whom
  List<Map<String, dynamic>> calculateDebts(Map<String, double> balances) {
    final debts = <Map<String, dynamic>>[];
    final users = balances.entries.toList();

    for (int i = 0; i < users.length; i++) {
      for (int j = i + 1; j < users.length; j++) {
        final person1 = users[i];
        final person2 = users[j];

        if (person1.value > person2.value) {
          debts.add({
            'from': person2.key,
            'to': person1.key,
            'amount': person1.value - person2.value,
            'settled': false,
          });
        }
      }
    }

    return debts;
  }
}
