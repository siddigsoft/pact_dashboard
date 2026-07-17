import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Budget management service for spending caps and alerts
class BudgetManagementService {
  static final BudgetManagementService _instance =
      BudgetManagementService._internal();

  factory BudgetManagementService() {
    return _instance;
  }

  BudgetManagementService._internal();

  final String _tableName = 'wallet_budgets';

  /// Create or update budget
  Future<void> setBudget({
    required String userId,
    required String category, // 'withdrawals', 'advances', 'all'
    required double limit,
    required String period, // 'weekly', 'monthly', 'yearly'
  }) async {
    try {
      final now = DateTime.now().toIso8601String();

      // Check if budget exists
      final existing = await Supabase.instance.client
          .from(_tableName)
          .select('id')
          .eq('user_id', userId)
          .eq('category', category)
          .eq('period', period);

      if ((existing as List).isNotEmpty) {
        // Update existing
        await Supabase.instance.client
            .from(_tableName)
            .update({'limit': limit, 'updated_at': now})
            .eq('user_id', userId)
            .eq('category', category)
            .eq('period', period);
      } else {
        // Create new
        await Supabase.instance.client.from(_tableName).insert({
          'user_id': userId,
          'category': category,
          'period': period,
          'limit': limit,
          'spent': 0,
          'alert_threshold': 80, // Alert at 80%
          'is_active': true,
          'created_at': now,
          'updated_at': now,
        });
      }

      debugPrint('[BudgetManager] Budget set for $category: $limit SDG');
    } catch (e) {
      debugPrint('[BudgetManager] Error setting budget: $e');
    }
  }

  /// Get budget for category
  Future<Map<String, dynamic>?> getBudget({
    required String userId,
    required String category,
    required String period,
  }) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .eq('category', category)
          .eq('period', period)
          .single();

      return data;
    } catch (e) {
      debugPrint('[BudgetManager] Error fetching budget: $e');
      return null;
    }
  }

  /// Get all budgets for user
  Future<List<Map<String, dynamic>>> getAllBudgets(String userId) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[BudgetManager] Error fetching budgets: $e');
      return [];
    }
  }

  /// Update spent amount for budget
  Future<void> updateSpent({
    required String userId,
    required String category,
    required double amount,
    required String period,
  }) async {
    try {
      final budget = await getBudget(
        userId: userId,
        category: category,
        period: period,
      );

      if (budget == null) return;

      final newSpent = ((budget['spent'] as num?)?.toDouble() ?? 0) + amount;

      await Supabase.instance.client
          .from(_tableName)
          .update({'spent': newSpent})
          .eq('user_id', userId)
          .eq('category', category)
          .eq('period', period);

      debugPrint('[BudgetManager] Updated spent: $newSpent SDG');
    } catch (e) {
      debugPrint('[BudgetManager] Error updating spent: $e');
    }
  }

  /// Check if spending exceeds budget
  Future<bool> exceedsBudget({
    required String userId,
    required String category,
    required double newAmount,
    required String period,
  }) async {
    try {
      final budget = await getBudget(
        userId: userId,
        category: category,
        period: period,
      );

      if (budget == null) return false;

      final spent = ((budget['spent'] as num?)?.toDouble() ?? 0) + newAmount;
      final limit = (budget['limit'] as num?)?.toDouble() ?? double.infinity;

      return spent > limit;
    } catch (e) {
      debugPrint('[BudgetManager] Error checking budget: $e');
      return false;
    }
  }

  /// Get budget percentage usage
  Future<double> getBudgetUsagePercentage({
    required String userId,
    required String category,
    required String period,
  }) async {
    try {
      final budget = await getBudget(
        userId: userId,
        category: category,
        period: period,
      );

      if (budget == null) return 0;

      final spent = (budget['spent'] as num?)?.toDouble() ?? 0;
      final limit = (budget['limit'] as num?)?.toDouble() ?? 1;

      return ((spent / limit) * 100).clamp(0, 100);
    } catch (e) {
      debugPrint('[BudgetManager] Error calculating percentage: $e');
      return 0;
    }
  }

  /// Reset budget spent for new period
  Future<void> resetBudgetPeriod({
    required String userId,
    required String period,
  }) async {
    try {
      await Supabase.instance.client
          .from(_tableName)
          .update({'spent': 0})
          .eq('user_id', userId)
          .eq('period', period);

      debugPrint('[BudgetManager] Budget reset for period: $period');
    } catch (e) {
      debugPrint('[BudgetManager] Error resetting budget: $e');
    }
  }

  /// Delete budget
  Future<void> deleteBudget({
    required String userId,
    required String category,
    required String period,
  }) async {
    try {
      await Supabase.instance.client
          .from(_tableName)
          .delete()
          .eq('user_id', userId)
          .eq('category', category)
          .eq('period', period);

      debugPrint('[BudgetManager] Budget deleted');
    } catch (e) {
      debugPrint('[BudgetManager] Error deleting budget: $e');
    }
  }

  /// Get budgets needing alert
  Future<List<Map<String, dynamic>>> getBudgetsNeedingAlert(
    String userId,
  ) async {
    try {
      final budgets = await getAllBudgets(userId);
      final alerts = <Map<String, dynamic>>[];

      for (final budget in budgets) {
        final threshold = (budget['alert_threshold'] as num?)?.toDouble() ?? 80;
        final spent = (budget['spent'] as num?)?.toDouble() ?? 0;
        final limit = (budget['limit'] as num?)?.toDouble() ?? 1;
        final percentage = (spent / limit) * 100;

        if (percentage >= threshold) {
          alerts.add({...budget, 'percentage': percentage});
        }
      }

      return alerts;
    } catch (e) {
      debugPrint('[BudgetManager] Error getting alerts: $e');
      return [];
    }
  }
}
