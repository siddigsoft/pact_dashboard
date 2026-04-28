import 'package:flutter/foundation.dart';

/// Smart recommendation engine for intelligent financial suggestions
class SmartRecommendationEngine {
  static final SmartRecommendationEngine _instance =
      SmartRecommendationEngine._internal();

  factory SmartRecommendationEngine() {
    return _instance;
  }

  SmartRecommendationEngine._internal();

  /// Get personalized recommendations based on spending patterns
  List<Map<String, dynamic>> getRecommendations({
    required double netBalance,
    required double savingsRate,
    required double monthlyEarnings,
    required double monthlyWithdrawals,
    required Map<String, double> spendingByCategory,
    required List<Map<String, dynamic>> transactions,
    bool isArabic = false,
  }) {
    final recommendations = <Map<String, dynamic>>[];

    // Recommendation 1: Emergency Fund
    if (netBalance < monthlyEarnings * 3) {
      recommendations.add({
        'id': 'emergency_fund',
        'type': 'savings',
        'priority': 'high',
        'title_en': 'Build Emergency Fund',
        'title_ar': 'بناء صندوق الطوارئ',
        'description_en':
            'You should have 3 months of expenses saved. Current coverage: ${(netBalance / (monthlyEarnings * 3) * 100).toStringAsFixed(0)}%',
        'description_ar':
            'يجب أن يكون لديك نفقات تغطي 3 أشهر. التغطية الحالية: ${(netBalance / (monthlyEarnings * 3) * 100).toStringAsFixed(0)}%',
        'action_en': 'Start saving',
        'action_ar': 'ابدأ الادخار',
      });
    }

    // Recommendation 2: Savings Rate Too Low
    if (savingsRate < 20) {
      recommendations.add({
        'id': 'increase_savings',
        'type': 'spending',
        'priority': 'high',
        'title_en': 'Increase Savings Rate',
        'title_ar': 'زيادة معدل التوفير',
        'description_en':
            'Your savings rate is ${savingsRate.toStringAsFixed(0)}%. Aim for at least 20%',
        'description_ar':
            'معدل التوفير الخاص بك ${savingsRate.toStringAsFixed(0)}%. اهدف إلى 20% على الأقل',
        'action_en': 'Set budget limits',
        'action_ar': 'تعيين حدود الميزانية',
      });
    }

    // Recommendation 3: Spending Pattern Alert
    final topCategory = spendingByCategory.entries
        .reduce((a, b) => a.value > b.value ? a : b)
        .key;
    final topCategoryAmount = spendingByCategory[topCategory] ?? 0;

    if (topCategoryAmount > monthlyEarnings * 0.5) {
      recommendations.add({
        'id': 'reduce_spending',
        'type': 'spending',
        'priority': 'medium',
        'title_en': 'Review $topCategory Spending',
        'title_ar': 'راجع نفقات $topCategory',
        'description_en':
            'You\'re spending ${(topCategoryAmount / monthlyEarnings * 100).toStringAsFixed(0)}% of earnings on $topCategory',
        'description_ar':
            'تنفق ${(topCategoryAmount / monthlyEarnings * 100).toStringAsFixed(0)}% من أرباحك على $topCategory',
        'action_en': 'Review details',
        'action_ar': 'راجع التفاصيل',
      });
    }

    // Recommendation 4: Withdrawal Patterns
    if (monthlyWithdrawals > monthlyEarnings * 0.8) {
      recommendations.add({
        'id': 'reduce_withdrawals',
        'type': 'spending',
        'priority': 'high',
        'title_en': 'High Withdrawal Rate',
        'title_ar': 'معدل سحب مرتفع',
        'description_en':
            'You\'re withdrawing ${(monthlyWithdrawals / monthlyEarnings * 100).toStringAsFixed(0)}% of earnings',
        'description_ar':
            'تسحب ${(monthlyWithdrawals / monthlyEarnings * 100).toStringAsFixed(0)}% من أرباحك',
        'action_en': 'Create recurring plan',
        'action_ar': 'أنشئ خطة متكررة',
      });
    }

    // Recommendation 5: Set Financial Goals
    if (savingsRate > 30) {
      recommendations.add({
        'id': 'set_goals',
        'type': 'growth',
        'priority': 'medium',
        'title_en': 'Set Financial Goals',
        'title_ar': 'حدد الأهداف المالية',
        'description_en':
            'Your good savings rate can help achieve financial goals',
        'description_ar':
            'معدل التوفير الجيد لديك يمكن أن يساعد في تحقيق الأهداف',
        'action_en': 'Create goals',
        'action_ar': 'أنشئ أهدافاً',
      });
    }

    // Recommendation 6: Transaction Frequency
    final avgDaysSinceTx = getAverageDaysBetweenTransactions(transactions);
    if (avgDaysSinceTx > 14) {
      recommendations.add({
        'id': 'activity_low',
        'type': 'activity',
        'priority': 'low',
        'title_en': 'Increased Activity',
        'title_ar': 'نشاط متزايد',
        'description_en':
            'Your activity has been lower recently. Keep engaging!',
        'description_ar': 'كان نشاطك منخفضاً مؤخراً. استمر في المشاركة!',
        'action_en': 'View details',
        'action_ar': 'عرض التفاصيل',
      });
    }

    return recommendations;
  }

  /// Get average days between transactions
  static double getAverageDaysBetweenTransactions(
    List<Map<String, dynamic>> transactions,
  ) {
    if (transactions.length < 2) return 0;

    DateTime? prevDate;
    double totalDays = 0;
    int count = 0;

    for (final tx in transactions) {
      final dateStr = tx['created_at'] as String?;
      if (dateStr == null) continue;

      try {
        final date = DateTime.parse(dateStr).toLocal();
        if (prevDate != null) {
          totalDays += prevDate.difference(date).inDays.abs().toDouble();
          count++;
        }
        prevDate = date;
      } catch (e) {
        debugPrint('[Recommendations] Error parsing date: $e');
      }
    }

    return count > 0 ? totalDays / count : 0;
  }

  /// Get recommendation color based on priority
  static String getColorForPriority(String priority) {
    switch (priority) {
      case 'high':
        return '#FF6B6B';
      case 'medium':
        return '#FFA500';
      case 'low':
        return '#4CAF50';
      default:
        return '#2196F3';
    }
  }

  /// Get icon for recommendation type
  static String getIconForType(String type) {
    switch (type) {
      case 'savings':
        return '🏦';
      case 'spending':
        return '💸';
      case 'growth':
        return '📈';
      case 'activity':
        return '📊';
      default:
        return '💡';
    }
  }
}
