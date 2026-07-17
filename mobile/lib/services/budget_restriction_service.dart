import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'cache_service.dart';
import 'notification_service.dart';

/// Budget restriction check result
class BudgetCheckResult {
  final bool allowed;
  final String? message;
  final double? availableBudget;
  final double? requestedAmount;

  BudgetCheckResult({
    required this.allowed,
    this.message,
    this.availableBudget,
    this.requestedAmount,
  });
}

/// Budget Restriction Service
/// Checks if cost submissions are within allowed budget limits
class BudgetRestrictionService {
  final SupabaseClient _supabase = Supabase.instance.client;

  /// Check if a cost submission is within budget restrictions
  /// Returns BudgetCheckResult indicating if the submission is allowed
  Future<BudgetCheckResult> checkCostSubmissionBudget({
    required String siteVisitId,
    required int totalCostCents,
    required String userId,
  }) async {
    try {
      // Check cache first
      final cachedBudgetData = await BudgetCacheService.getCachedBudgetData(
        siteVisitId,
      );
      Map<String, dynamic> siteVisitResponse;

      if (cachedBudgetData != null) {
        siteVisitResponse = cachedBudgetData;
      } else {
        // Fetch from API and cache
        siteVisitResponse = await _supabase
            .from('mmp_site_entries')
            .select('transport_fee, enumerator_fee, cost, status')
            .eq('id', siteVisitId)
            .single();

        if (siteVisitResponse.isNotEmpty) {
          await BudgetCacheService.cacheBudgetData(
            siteVisitId,
            siteVisitResponse,
          );
        }
      }

      if (siteVisitResponse.isEmpty) {
        return BudgetCheckResult(
          allowed: false,
          message: 'Site visit not found',
        );
      }

      final transportBudget =
          (siteVisitResponse['transport_fee'] as num?)?.toDouble() ?? 0.0;
      final enumeratorFee =
          (siteVisitResponse['enumerator_fee'] as num?)?.toDouble() ?? 0.0;
      final totalBudget = transportBudget + enumeratorFee;

      // Convert cents to SDG
      final requestedAmount = totalCostCents / 100.0;

      // Check if requested amount exceeds total budget
      if (requestedAmount > totalBudget) {
        return BudgetCheckResult(
          allowed: false,
          message:
              'Cost submission (${requestedAmount.toStringAsFixed(2)} SDG) exceeds allocated budget (${totalBudget.toStringAsFixed(2)} SDG)',
          availableBudget: totalBudget,
          requestedAmount: requestedAmount,
        );
      }

      // Check if this would exceed 80% of budget (warning threshold)
      final budgetUtilization = requestedAmount / totalBudget;
      if (budgetUtilization > 0.8) {
        return BudgetCheckResult(
          allowed: true,
          message:
              'Warning: This submission uses ${(budgetUtilization * 100).toStringAsFixed(1)}% of allocated budget',
          availableBudget: totalBudget,
          requestedAmount: requestedAmount,
        );
      }

      return BudgetCheckResult(
        allowed: true,
        availableBudget: totalBudget,
        requestedAmount: requestedAmount,
      );
    } catch (error) {
      debugPrint('Error checking budget restrictions: $error');
      return BudgetCheckResult(
        allowed: false,
        message: 'Unable to verify budget restrictions. Please try again.',
      );
    }
  }

  /// Get budget utilization for a site visit
  Future<Map<String, dynamic>> getBudgetUtilization(String siteVisitId) async {
    try {
      // Check cache first for budget data
      final cachedBudgetData = await BudgetCacheService.getCachedBudgetData(
        siteVisitId,
      );
      Map<String, dynamic> siteVisitResponse;

      if (cachedBudgetData != null) {
        siteVisitResponse = cachedBudgetData;
      } else {
        // Fetch from API and cache
        siteVisitResponse = await _supabase
            .from('mmp_site_entries')
            .select('transport_fee, enumerator_fee, cost')
            .eq('id', siteVisitId)
            .single();

        if (siteVisitResponse.isNotEmpty) {
          await BudgetCacheService.cacheBudgetData(
            siteVisitId,
            siteVisitResponse,
          );
        }
      }

      if (siteVisitResponse.isEmpty) {
        return {'error': 'Site visit not found'};
      }

      final transportBudget =
          (siteVisitResponse['transport_fee'] as num?)?.toDouble() ?? 0.0;
      final enumeratorFee =
          (siteVisitResponse['enumerator_fee'] as num?)?.toDouble() ?? 0.0;
      final totalBudget = transportBudget + enumeratorFee;

      // Get existing cost submissions for this site visit
      final submissionsResponse = await _supabase
          .from('cost_submissions')
          .select('total_cost_cents, status')
          .eq('site_visit_id', siteVisitId)
          .inFilter('status', ['approved', 'paid']);

      double totalSubmitted = 0.0;
      for (final submission in submissionsResponse) {
        final costCents =
            (submission['total_cost_cents'] as num?)?.toInt() ?? 0;
        totalSubmitted += costCents / 100.0;
      }

      final remainingBudget = totalBudget - totalSubmitted;
      final utilizationPercent = totalBudget > 0
          ? (totalSubmitted / totalBudget) * 100
          : 0.0;

      return {
        'totalBudget': totalBudget,
        'usedBudget': totalSubmitted,
        'remainingBudget': remainingBudget,
        'utilizationPercent': utilizationPercent,
        'transportBudget': transportBudget,
        'enumeratorFee': enumeratorFee,
      };
    } catch (error) {
      debugPrint('Error getting budget utilization: $error');
      return {'error': 'Unable to retrieve budget information'};
    }
  }

  /// Check if user has exceeded monthly cost submission limits
  Future<BudgetCheckResult> checkMonthlySubmissionLimit({
    required String userId,
    required int totalCostCents,
  }) async {
    try {
      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);
      final endOfMonth = DateTime(
        now.year,
        now.month + 1,
        1,
      ).subtract(const Duration(days: 1));

      // Get all approved/paid submissions for this month
      final monthlySubmissions = await _supabase
          .from('cost_submissions')
          .select('total_cost_cents')
          .eq('submitted_by', userId)
          .gte('submission_date', startOfMonth.toIso8601String())
          .lte('submission_date', endOfMonth.toIso8601String())
          .inFilter('status', ['approved', 'paid']);

      double monthlyTotal = 0.0;
      for (final submission in monthlySubmissions) {
        final costCents =
            (submission['total_cost_cents'] as num?)?.toInt() ?? 0;
        monthlyTotal += costCents / 100.0;
      }

      // Monthly limit (configurable - default 5000 SDG)
      const monthlyLimit = 5000.0;
      final requestedAmount = totalCostCents / 100.0;
      final newMonthlyTotal = monthlyTotal + requestedAmount;

      if (newMonthlyTotal > monthlyLimit) {
        return BudgetCheckResult(
          allowed: false,
          message:
              'Monthly cost submission limit exceeded. Current: ${monthlyTotal.toStringAsFixed(2)} SDG, Requested: ${requestedAmount.toStringAsFixed(2)} SDG, Limit: ${monthlyLimit.toStringAsFixed(2)} SDG',
          availableBudget: monthlyLimit - monthlyTotal,
          requestedAmount: requestedAmount,
        );
      }

      return BudgetCheckResult(
        allowed: true,
        availableBudget: monthlyLimit - monthlyTotal,
        requestedAmount: requestedAmount,
      );
    } catch (error) {
      debugPrint('Error checking monthly limit: $error');
      return BudgetCheckResult(
        allowed: false,
        message: 'Unable to verify monthly submission limits',
      );
    }
  }

  /// Check if budget is running low and trigger alert notification
  /// This should be called periodically or after cost submissions
  Future<void> checkBudgetAlert({
    required String siteVisitId,
    required String userId,
  }) async {
    try {
      // Get budget data
      final budgetCheck = await checkCostSubmissionBudget(
        siteVisitId: siteVisitId,
        totalCostCents: 0, // Just checking remaining budget
        userId: userId,
      );

      if (budgetCheck.availableBudget != null &&
          budgetCheck.availableBudget! < 5000) {
        // Less than 50 SDG
        // Trigger budget alert notification
        await NotificationService.showBudgetAlertNotification(
          siteVisitId: siteVisitId,
          remainingBudget: budgetCheck.availableBudget!,
          currency: 'SDG', // Assuming SDG as default currency
        );
      }
    } catch (error) {
      debugPrint('Error checking budget alert: $error');
    }
  }
}
