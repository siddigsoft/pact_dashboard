import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Financial goals and savings targets service
class FinancialGoalsService {
  static final FinancialGoalsService _instance =
      FinancialGoalsService._internal();

  factory FinancialGoalsService() {
    return _instance;
  }

  FinancialGoalsService._internal();

  final String _tableName = 'financial_goals';

  /// Create new savings goal
  Future<void> createGoal({
    required String userId,
    required String name,
    required double targetAmount,
    required DateTime deadline,
    String? description,
    String? category, // 'emergency_fund', 'vacation', 'education', 'home'
  }) async {
    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'name': name,
        'target_amount': targetAmount,
        'current_amount': 0,
        'deadline': deadline.toIso8601String(),
        'category': category ?? 'general',
        'description': description,
        'is_active': true,
        'created_at': now,
        'updated_at': now,
      });

      debugPrint('[FinancialGoals] Goal created: $name - $targetAmount SDG');
    } catch (e) {
      debugPrint('[FinancialGoals] Error creating goal: $e');
    }
  }

  /// Get all goals for user
  Future<List<Map<String, dynamic>>> getUserGoals(String userId) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('deadline', ascending: true);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[FinancialGoals] Error fetching goals: $e');
      return [];
    }
  }

  /// Update goal progress
  Future<void> updateGoalProgress(String goalId, double currentAmount) async {
    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client
          .from(_tableName)
          .update({'current_amount': currentAmount, 'updated_at': now})
          .eq('id', goalId);

      debugPrint('[FinancialGoals] Goal progress updated');
    } catch (e) {
      debugPrint('[FinancialGoals] Error updating progress: $e');
    }
  }

  /// Mark goal as completed
  Future<void> completeGoal(String goalId) async {
    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client
          .from(_tableName)
          .update({'is_active': false, 'completed_at': now, 'updated_at': now})
          .eq('id', goalId);

      debugPrint('[FinancialGoals] Goal completed');
    } catch (e) {
      debugPrint('[FinancialGoals] Error completing goal: $e');
    }
  }

  /// Delete goal
  Future<void> deleteGoal(String goalId) async {
    try {
      await Supabase.instance.client.from(_tableName).delete().eq('id', goalId);

      debugPrint('[FinancialGoals] Goal deleted');
    } catch (e) {
      debugPrint('[FinancialGoals] Error deleting goal: $e');
    }
  }

  /// Calculate progress percentage
  static double calculateProgress({
    required double currentAmount,
    required double targetAmount,
  }) {
    if (targetAmount == 0) return 0;
    return (currentAmount / targetAmount * 100).clamp(0, 100);
  }

  /// Calculate days remaining
  static int daysRemaining(DateTime deadline) {
    return deadline.difference(DateTime.now()).inDays;
  }

  /// Calculate monthly savings required
  static double monthlySavingsRequired({
    required double currentAmount,
    required double targetAmount,
    required DateTime deadline,
  }) {
    final remaining = targetAmount - currentAmount;
    final monthsLeft = deadline.difference(DateTime.now()).inDays / 30;

    if (monthsLeft <= 0) return 0;
    return remaining / monthsLeft;
  }

  /// Get goal insights
  static Map<String, dynamic> getGoalInsights(Map<String, dynamic> goal) {
    final currentAmount = (goal['current_amount'] as num?)?.toDouble() ?? 0;
    final targetAmount = (goal['target_amount'] as num?)?.toDouble() ?? 1;
    final deadlineStr = goal['deadline'] as String?;
    final deadline = deadlineStr != null
        ? DateTime.parse(deadlineStr)
        : DateTime.now();

    return {
      'progress': calculateProgress(
        currentAmount: currentAmount,
        targetAmount: targetAmount,
      ),
      'daysRemaining': daysRemaining(deadline),
      'amountRemaining': (targetAmount - currentAmount).clamp(
        0,
        double.infinity,
      ),
      'monthlySavingsRequired': monthlySavingsRequired(
        currentAmount: currentAmount,
        targetAmount: targetAmount,
        deadline: deadline,
      ),
    };
  }

  /// Get goal status string
  static String getGoalStatus(Map<String, dynamic> goal, bool isArabic) {
    final progress = calculateProgress(
      currentAmount: (goal['current_amount'] as num?)?.toDouble() ?? 0,
      targetAmount: (goal['target_amount'] as num?)?.toDouble() ?? 1,
    );

    if (progress >= 100) {
      return isArabic ? 'مكتمل' : 'Completed';
    } else if (progress >= 75) {
      return isArabic ? 'قريب جداً' : 'Almost there';
    } else if (progress >= 50) {
      return isArabic ? 'في المنتصف' : 'Half way';
    } else if (progress >= 25) {
      return isArabic ? 'تم البدء' : 'Started';
    } else {
      return isArabic ? 'نقطة البداية' : 'Just started';
    }
  }
}
