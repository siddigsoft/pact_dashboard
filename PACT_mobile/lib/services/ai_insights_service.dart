import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'dart:math';

/// AI-powered insights and personalized financial advice
class AIInsightsService {
  static final AIInsightsService _instance = AIInsightsService._internal();

  factory AIInsightsService() {
    return _instance;
  }

  AIInsightsService._internal();

  final _supabase = Supabase.instance.client;

  /// Get personalized financial advice
  Future<List<Map<String, dynamic>>> getPersonalizedAdvice(
    String userId,
    double currentBalance,
    double monthlyEarnings,
    double monthlySpending,
    List<Map<String, dynamic>> transactions, {
    required bool isArabic,
  }) async {
    try {
      final advice = _generateAdvice(
        currentBalance,
        monthlyEarnings,
        monthlySpending,
        transactions,
        isArabic,
      );

      // Save insights
      await _supabase
          .from('user_insights')
          .insert({
            'user_id': userId,
            'insight_type': 'ai_advice',
            'data': advice,
            'created_at': DateTime.now().toIso8601String(),
          })
          .onError((error, stackTrace) {
            debugPrint('[AIInsights] Error saving insights: $error');
            return null;
          });

      return advice;
    } catch (e) {
      debugPrint('[AIInsights] Error generating advice: $e');
      return [];
    }
  }

  /// Get spending habits analysis
  Future<Map<String, dynamic>> getSpendingHabitsAnalysis(
    String userId,
    List<Map<String, dynamic>> transactions, {
    bool isArabic = false,
  }) async {
    try {
      final analysis = _analyzeSpendingHabits(transactions, isArabic);

      return analysis;
    } catch (e) {
      debugPrint('[AIInsights] Error analyzing habits: $e');
      return {};
    }
  }

  /// Get financial health score
  Future<Map<String, dynamic>> getFinancialHealthScore(
    String userId,
    double currentBalance,
    double monthlyEarnings,
    double monthlySpending,
    List<Map<String, dynamic>> transactions,
  ) async {
    try {
      final score = _calculateHealthScore(
        currentBalance,
        monthlyEarnings,
        monthlySpending,
        transactions,
      );

      return score;
    } catch (e) {
      debugPrint('[AIInsights] Error calculating health score: $e');
      return {'score': 0, 'grade': 'F', 'components': {}};
    }
  }

  /// Generate personalized advice
  List<Map<String, dynamic>> _generateAdvice(
    double currentBalance,
    double monthlyEarnings,
    double monthlySpending,
    List<Map<String, dynamic>> transactions,
    bool isArabic,
  ) {
    final advice = <Map<String, dynamic>>[];
    final savingsRate = monthlyEarnings > 0
        ? ((monthlyEarnings - monthlySpending) / monthlyEarnings)
        : 0;

    // Advice 1: Savings rate
    if (savingsRate < 0.1) {
      advice.add({
        'title': isArabic ? '💰 زيادة المدخرات' : '💰 Increase Savings',
        'priority': 'high',
        'description': isArabic
            ? 'معدل المدخرات متدني جداً. حاول زيادة المدخرات إلى 10-20% من الدخل'
            : 'Your savings rate is very low. Try to save 10-20% of monthly earnings.',
        'action': isArabic ? 'ضع حد للإنفاق' : 'Set spending limit',
      });
    } else if (savingsRate >= 0.2) {
      advice.add({
        'title': isArabic ? '🌟 متدخر رائع!' : '🌟 Great Saver!',
        'priority': 'low',
        'description': isArabic
            ? 'معدل المدخرات ممتاز! استمر في هذا الاتجاه'
            : 'Excellent savings rate! Keep it up.',
        'action': isArabic ? 'استثمر المدخرات' : 'Invest savings',
      });
    }

    // Advice 2: Emergency fund
    if (currentBalance < monthlyEarnings) {
      advice.add({
        'title': isArabic ? '🆘 صندوق الطوارئ' : '🆘 Emergency Fund',
        'priority': 'high',
        'description': isArabic
            ? 'يجب أن يكون لديك صندوق طوارئ = 3-6 أشهر من الدخل'
            : 'Build an emergency fund equal to 3-6 months of income.',
        'action': isArabic ? 'ابدأ الآن' : 'Start now',
      });
    }

    // Advice 3: Spending patterns
    final categorySpending = _getCategorySpending(transactions);
    final topCategory = categorySpending.entries.reduce(
      (a, b) => a.value > b.value ? a : b,
    );

    if (topCategory.value > monthlyEarnings * 0.3) {
      advice.add({
        'title': isArabic ? '⚠️ قيود الإنفاق' : '⚠️ Spending Alert',
        'priority': 'medium',
        'description': isArabic
            ? 'تنفق ${(topCategory.value / monthlyEarnings * 100).toStringAsFixed(0)}% على ${topCategory.key}. قد تكون عالية جداً'
            : 'You spend ${(topCategory.value / monthlyEarnings * 100).toStringAsFixed(0)}% on ${topCategory.key}. Consider reducing.',
        'action': isArabic ? 'قلل الإنفاق' : 'Reduce spending',
      });
    }

    // Advice 4: Income growth
    if (monthlyEarnings < 5000) {
      advice.add({
        'title': isArabic ? '📈 زيادة الدخل' : '📈 Boost Income',
        'priority': 'medium',
        'description': isArabic
            ? 'من الممكن زيادة الدخل من خلال مشاريع إضافية'
            : 'Consider additional income streams to accelerate wealth building.',
        'action': isArabic ? 'استكشف الفرص' : 'Explore opportunities',
      });
    }

    return advice;
  }

  /// Analyze spending habits
  Map<String, dynamic> _analyzeSpendingHabits(
    List<Map<String, dynamic>> transactions,
    bool isArabic,
  ) {
    final daily = <String, List<double>>{};
    final hourly = <int, List<double>>{};

    for (final tx in transactions) {
      if (tx['type'] == 'earning' || tx['type'] == 'down_payment') continue;

      final date = DateTime.parse(tx['created_at'] as String).toLocal();
      final dayOfWeek = [
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
      ][date.weekday % 7];
      final amount = (tx['amount'] as num?)?.toDouble() ?? 0;

      daily.putIfAbsent(dayOfWeek, () => []).add(amount.abs());
      hourly.putIfAbsent(date.hour, () => []).add(amount.abs());
    }

    final avgByDay = <String, double>{};
    for (final entry in daily.entries) {
      avgByDay[entry.key] =
          entry.value.reduce((a, b) => a + b) / entry.value.length;
    }

    final peakHour = hourly.entries.reduce((a, b) {
      final aAvg = a.value.reduce((x, y) => x + y) / a.value.length;
      final bAvg = b.value.reduce((x, y) => x + y) / b.value.length;
      return aAvg > bAvg ? a : b;
    });

    final spendingDayOfWeek = avgByDay.entries.reduce(
      (a, b) => a.value > b.value ? a : b,
    );

    return {
      'spendingByDay': avgByDay,
      'peakDay': spendingDayOfWeek.key,
      'peakDayAmount': spendingDayOfWeek.value,
      'peakHour': '${peakHour.key}:00',
      'habit': isArabic ? 'مدرس منتظم للإنفاق' : 'Regular spending pattern',
    };
  }

  /// Calculate financial health score
  Map<String, dynamic> _calculateHealthScore(
    double currentBalance,
    double monthlyEarnings,
    double monthlySpending,
    List<Map<String, dynamic>> transactions,
  ) {
    var score = 50.0;
    final components = <String, double>{};

    // Balance score (0-20)
    final balanceScore =
        (currentBalance / monthlyEarnings / 3).clamp(0, 1) * 20;
    components['Balance'] = balanceScore;
    score += balanceScore;

    // Savings rate (0-30)
    final savingsRate = monthlyEarnings > 0
        ? ((monthlyEarnings - monthlySpending) / monthlyEarnings).clamp(0, 1)
        : 0;
    final savingsScore = savingsRate * 30;
    components['Savings'] = savingsScore;
    score += savingsScore;

    // Spending consistency (0-20)
    final amounts = transactions
        .where(
          (tx) =>
              tx['type'] != 'earning' &&
              tx['type'] != 'down_payment' &&
              tx['type'] != 'advance',
        )
        .map((tx) => (tx['amount'] as num?)?.toDouble() ?? 0)
        .toList();

    if (amounts.isNotEmpty) {
      final avg = amounts.reduce((a, b) => a + b) / amounts.length;
      final variance =
          amounts.map((x) => (x - avg) * (x - avg)).reduce((a, b) => a + b) /
          amounts.length;
      final coefficient = (variance.squareRoot() / avg).clamp(0, 2);
      final consistency = (1 - (coefficient / 2)) * 20;
      components['Consistency'] = consistency;
      score += consistency;
    }

    // Calculate grade
    String grade;
    if (score >= 90) {
      grade = 'A';
    } else if (score >= 75) {
      grade = 'B';
    } else if (score >= 60) {
      grade = 'C';
    } else if (score >= 45) {
      grade = 'D';
    } else {
      grade = 'F';
    }

    return {
      'score': score.toStringAsFixed(1),
      'grade': grade,
      'components': components,
      'recommendation': grade == 'A'
          ? 'Excellent'
          : grade == 'B'
          ? 'Good'
          : 'Needs improvement',
    };
  }

  /// Get category spending
  Map<String, double> _getCategorySpending(
    List<Map<String, dynamic>> transactions,
  ) {
    final categorySpending = <String, double>{};

    for (final tx in transactions) {
      if (tx['type'] == 'earning' || tx['type'] == 'down_payment') continue;

      final category = (tx['category'] as String?) ?? 'Other';
      final amount = (tx['amount'] as num?)?.toDouble() ?? 0;
      categorySpending[category] =
          (categorySpending[category] ?? 0) + amount.abs();
    }

    return categorySpending;
  }
}

extension on double {
  double squareRoot() => pow(this, 0.5);
}
