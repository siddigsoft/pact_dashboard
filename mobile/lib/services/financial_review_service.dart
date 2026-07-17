import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

/// Financial review and reporting service
class FinancialReviewService {
  static final FinancialReviewService _instance =
      FinancialReviewService._internal();

  factory FinancialReviewService() {
    return _instance;
  }

  FinancialReviewService._internal();

  final _supabase = Supabase.instance.client;

  /// Generate monthly financial report
  Future<Map<String, dynamic>> getMonthlyReport({
    required String userId,
    int month = 0,
    int year = 0,
  }) async {
    try {
      final now = DateTime.now();
      final reportMonth = month == 0 ? now.month : month;
      final reportYear = year == 0 ? now.year : year;

      final firstDay = DateTime(reportYear, reportMonth, 1);
      final lastDay = DateTime(reportYear, reportMonth + 1, 0);

      // Get all transactions for the month
      final transactions = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .gte('created_at', firstDay.toIso8601String())
          .lte('created_at', lastDay.toIso8601String());

      double totalIncome = 0;
      double totalExpenses = 0;
      final Map<String, double> expensesByType = {};
      final List<Map<String, dynamic>> transactionList = [];

      for (final tx in transactions as List) {
        final amount = (tx['amount'] as num?)?.toDouble() ?? 0;
        final type = (tx['type'] as String?) ?? 'other';
        final description = (tx['description'] as String?) ?? '';

        transactionList.add(tx as Map<String, dynamic>);

        // Income types
        if ([
          'earning',
          'bonus',
          'site_visit_fee',
          'visit_completion',
          'p2p_received',
        ].contains(type)) {
          totalIncome += amount.abs();
        }
        // Expense types
        else if ([
          'withdrawal',
          'p2p_transfer',
          'challenge_savings',
          'bill_payment',
          'subscription_payment',
        ].contains(type)) {
          totalExpenses += amount.abs();
          expensesByType[type] = (expensesByType[type] ?? 0) + amount.abs();
        }
      }

      final netIncome = totalIncome - totalExpenses;
      final savingsRate = totalIncome > 0
          ? ((totalIncome - totalExpenses) / totalIncome * 100).clamp(0, 100)
          : 0.0;

      return {
        'month': reportMonth,
        'year': reportYear,
        'total_income': totalIncome,
        'total_expenses': totalExpenses,
        'net_income': netIncome,
        'savings_rate': savingsRate,
        'transaction_count': transactions.length,
        'expenses_by_type': expensesByType,
        'transactions': transactionList,
      };
    } catch (e) {
      debugPrint('[FinancialReview] Error generating monthly report: $e');
      return {};
    }
  }

  /// Generate yearly financial report
  Future<Map<String, dynamic>> getYearlyReport({
    required String userId,
    int? year,
  }) async {
    try {
      final reportYear = year ?? DateTime.now().year;
      final firstDay = DateTime(reportYear, 1, 1);
      final lastDay = DateTime(reportYear, 12, 31);

      // Get all transactions for the year
      final transactions = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .gte('created_at', firstDay.toIso8601String())
          .lte('created_at', lastDay.toIso8601String());

      double totalIncome = 0;
      double totalExpenses = 0;
      final Map<int, Map<String, dynamic>> monthlyData = {};

      // Initialize monthly data
      for (int m = 1; m <= 12; m++) {
        monthlyData[m] = {'income': 0.0, 'expenses': 0.0, 'net': 0.0};
      }

      for (final tx in transactions as List) {
        final amount = (tx['amount'] as num?)?.toDouble() ?? 0;
        final type = (tx['type'] as String?) ?? 'other';
        final createdAt = DateTime.parse(tx['created_at'] as String);
        final month = createdAt.month;

        if ([
          'earning',
          'bonus',
          'site_visit_fee',
          'visit_completion',
          'p2p_received',
        ].contains(type)) {
          totalIncome += amount.abs();
          monthlyData[month]!['income'] =
              (monthlyData[month]!['income'] as double) + amount.abs();
        } else if ([
          'withdrawal',
          'p2p_transfer',
          'challenge_savings',
          'bill_payment',
          'subscription_payment',
        ].contains(type)) {
          totalExpenses += amount.abs();
          monthlyData[month]!['expenses'] =
              (monthlyData[month]!['expenses'] as double) + amount.abs();
        }
      }

      // Calculate monthly net
      for (int m = 1; m <= 12; m++) {
        final income = monthlyData[m]!['income'] as double;
        final expenses = monthlyData[m]!['expenses'] as double;
        monthlyData[m]!['net'] = income - expenses;
      }

      final netIncome = totalIncome - totalExpenses;
      final averageMonthlyIncome = totalIncome / 12;
      final averageMonthlyExpense = totalExpenses / 12;

      return {
        'year': reportYear,
        'total_income': totalIncome,
        'total_expenses': totalExpenses,
        'net_income': netIncome,
        'average_monthly_income': averageMonthlyIncome,
        'average_monthly_expense': averageMonthlyExpense,
        'savings_rate': totalIncome > 0
            ? ((totalIncome - totalExpenses) / totalIncome * 100).clamp(0, 100)
            : 0.0,
        'transaction_count': transactions.length,
        'monthly_breakdown': monthlyData,
      };
    } catch (e) {
      debugPrint('[FinancialReview] Error generating yearly report: $e');
      return {};
    }
  }

  /// Get spending trends
  Future<Map<String, dynamic>> getSpendingTrends(String userId) async {
    try {
      // Last 6 months
      final now = DateTime.now();
      final sixMonthsAgo = DateTime(now.year, now.month - 6, 1);

      final transactions = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .gte('created_at', sixMonthsAgo.toIso8601String())
          .lte('created_at', now.toIso8601String());

      final Map<String, double> monthlyExpenses = {};
      final Map<String, double> monthlyIncome = {};

      for (final tx in transactions as List) {
        final amount = (tx['amount'] as num?)?.toDouble() ?? 0;
        final type = (tx['type'] as String?) ?? 'other';
        final createdAt = DateTime.parse(tx['created_at'] as String);
        final monthKey =
            '${createdAt.year}-${createdAt.month.toString().padLeft(2, '0')}';

        if ([
          'earning',
          'bonus',
          'site_visit_fee',
          'visit_completion',
          'p2p_received',
        ].contains(type)) {
          monthlyIncome[monthKey] =
              (monthlyIncome[monthKey] ?? 0) + amount.abs();
        } else if ([
          'withdrawal',
          'p2p_transfer',
          'challenge_savings',
          'bill_payment',
          'subscription_payment',
        ].contains(type)) {
          monthlyExpenses[monthKey] =
              (monthlyExpenses[monthKey] ?? 0) + amount.abs();
        }
      }

      return {
        'monthly_income': monthlyIncome,
        'monthly_expenses': monthlyExpenses,
        'period': 'last_6_months',
      };
    } catch (e) {
      debugPrint('[FinancialReview] Error getting spending trends: $e');
      return {};
    }
  }

  /// Get financial health score (0-100)
  Future<int> getFinancialHealthScore(String userId) async {
    try {
      final now = DateTime.now();
      final monthStart = DateTime(now.year, now.month, 1);
      final monthEnd = DateTime(now.year, now.month + 1, 0);

      // Get this month's transactions
      final transactions = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .gte('created_at', monthStart.toIso8601String())
          .lte('created_at', monthEnd.toIso8601String());

      double income = 0;
      double expenses = 0;
      double savings = 0;
      int loanCount = 0;

      for (final tx in transactions as List) {
        final amount = (tx['amount'] as num?)?.toDouble() ?? 0;
        final type = (tx['type'] as String?) ?? 'other';

        if ([
          'earning',
          'bonus',
          'site_visit_fee',
          'visit_completion',
          'p2p_received',
        ].contains(type)) {
          income += amount.abs();
        } else if ([
          'withdrawal',
          'p2p_transfer',
          'bill_payment',
          'subscription_payment',
        ].contains(type)) {
          expenses += amount.abs();
        } else if (type == 'challenge_savings') {
          savings += amount.abs();
        }
      }

      // Score calculation (0-100)
      int score = 50; // Baseline

      // Savings rate (0-30 points)
      if (income > 0) {
        final savingsRate = (savings / income * 100).clamp(0, 100);
        score += (savingsRate / 100 * 30).toInt();
      }

      // Expense ratio (0-30 points)
      if (income > 0) {
        final expenseRatio = (expenses / income * 100).clamp(0, 100);
        if (expenseRatio < 80) {
          score += 30 - (expenseRatio / 80 * 30).toInt();
        }
      }

      // Income stability (0-20 points)
      if (income > 0) {
        score += 20;
      }

      // Budget compliance (0-20 points)
      // This would be based on bills kept vs missed
      score += 20;

      return score.clamp(0, 100);
    } catch (e) {
      debugPrint('[FinancialReview] Error calculating health score: $e');
      return 0;
    }
  }
}
