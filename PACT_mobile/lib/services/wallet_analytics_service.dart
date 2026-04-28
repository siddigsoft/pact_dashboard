import 'package:flutter/foundation.dart';

/// Wallet analytics and insights service for spending patterns
class WalletAnalyticsService {
  static final WalletAnalyticsService _instance =
      WalletAnalyticsService._internal();

  factory WalletAnalyticsService() {
    return _instance;
  }

  WalletAnalyticsService._internal();

  /// Calculate spending by category
  Map<String, double> calculateSpendingByCategory(
    List<Map<String, dynamic>> transactions,
  ) {
    final byCategory = <String, double>{};

    for (final tx in transactions) {
      final type = (tx['type'] as String?) ?? 'other';
      final amount = (tx['amount'] as num?)?.toDouble().abs() ?? 0;

      if (amount <= 0) continue; // Only count expenses

      final category = _categorizeTransaction(type);
      byCategory[category] = (byCategory[category] ?? 0) + amount;
    }

    return byCategory;
  }

  /// Calculate monthly spending trend
  Map<String, double> calculateMonthlyTrend(
    List<Map<String, dynamic>> transactions,
  ) {
    final byMonth = <String, double>{};

    for (final tx in transactions) {
      final dateStr = tx['created_at'] as String?;
      if (dateStr == null) continue;

      try {
        final date = DateTime.parse(dateStr).toLocal();
        final monthKey =
            '${date.year}-${date.month.toString().padLeft(2, '0')}';
        final amount = (tx['amount'] as num?)?.toDouble().abs() ?? 0;

        if (amount > 0) {
          byMonth[monthKey] = (byMonth[monthKey] ?? 0) + amount;
        }
      } catch (e) {
        debugPrint('[Analytics] Error parsing date: $e');
      }
    }

    return byMonth;
  }

  /// Calculate average transaction
  double calculateAverageTransaction(List<Map<String, dynamic>> transactions) {
    if (transactions.isEmpty) return 0;

    double total = 0;
    int count = 0;

    for (final tx in transactions) {
      final amount = (tx['amount'] as num?)?.toDouble().abs() ?? 0;
      if (amount > 0) {
        total += amount;
        count++;
      }
    }

    return count > 0 ? total / count : 0;
  }

  /// Get spending forecast for next month
  double forecastNextMonthSpending(
    List<Map<String, dynamic>> transactions, {
    int monthsToAnalyze = 3,
  }) {
    final monthlyTrend = calculateMonthlyTrend(transactions);

    if (monthlyTrend.isEmpty) return 0;

    final recentMonths = monthlyTrend.values.toList().sublist(
      0,
      monthlyTrend.length < monthsToAnalyze
          ? monthlyTrend.length
          : monthsToAnalyze,
    );

    if (recentMonths.isEmpty) return 0;

    final average = recentMonths.reduce((a, b) => a + b) / recentMonths.length;
    return average;
  }

  /// Get most active transaction category
  String getMostActivecategory(List<Map<String, dynamic>> transactions) {
    final byCategory = calculateSpendingByCategory(transactions);
    if (byCategory.isEmpty) return 'General';

    String topCategory = 'General';
    double maxAmount = 0;

    byCategory.forEach((category, amount) {
      if (amount > maxAmount) {
        maxAmount = amount;
        topCategory = category;
      }
    });

    return topCategory;
  }

  /// Calculate savings rate (earnings vs withdrawals)
  double calculateSavingsRate(double totalEarnings, double totalWithdrawn) {
    if (totalEarnings == 0) return 0;
    final saved = totalEarnings - totalWithdrawn;
    return (saved / totalEarnings * 100).clamp(0, 100);
  }

  /// Get spending insights
  Map<String, dynamic> getInsights(
    List<Map<String, dynamic>> transactions,
    double totalEarnings,
    double totalWithdrawn,
  ) {
    return {
      'totalEarnings': totalEarnings,
      'totalWithdrawn': totalWithdrawn,
      'savingsRate': calculateSavingsRate(totalEarnings, totalWithdrawn),
      'averageTransaction': calculateAverageTransaction(transactions),
      'spendingByCategory': calculateSpendingByCategory(transactions),
      'monthlyTrend': calculateMonthlyTrend(transactions),
      'topCategory': getMostActivecategory(transactions),
      'forecast': forecastNextMonthSpending(transactions),
      'lastUpdated': DateTime.now().toIso8601String(),
    };
  }

  /// Categorize transaction by type
  String _categorizeTransaction(String type) {
    switch (type.toLowerCase()) {
      case 'withdrawal':
        return 'Withdrawals';
      case 'down_payment':
      case 'advance_deduction':
        return 'Advances';
      case 'site_visit_fee':
      case 'visit_completion':
      case 'earning':
        return 'Earnings';
      case 'bonus':
        return 'Bonuses';
      case 'penalty':
      case 'fine':
        return 'Penalties';
      case 'transfer':
        return 'Transfers';
      default:
        return 'Other';
    }
  }

  /// Get spending recommendation
  String getSpendingRecommendation(Map<String, dynamic> insights) {
    final savingsRate = (insights['savingsRate'] as num?)?.toDouble() ?? 0;
    final forecast = (insights['forecast'] as num?)?.toDouble() ?? 0;
    final totalEarnings = (insights['totalEarnings'] as num?)?.toDouble() ?? 0;

    if (savingsRate < 20) {
      return 'Consider reducing withdrawals to increase savings';
    } else if (savingsRate > 80) {
      return 'Great savings rate! You\'re building wealth';
    } else if (forecast > totalEarnings * 0.8) {
      return 'Spending is trending upward, monitor your budget';
    } else {
      return 'Your spending is balanced and sustainable';
    }
  }
}
