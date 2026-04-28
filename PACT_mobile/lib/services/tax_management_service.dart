import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Tax management, reporting, and optimization
class TaxManagementService {
  static final TaxManagementService _instance =
      TaxManagementService._internal();

  factory TaxManagementService() {
    return _instance;
  }

  TaxManagementService._internal();

  final _supabase = Supabase.instance.client;

  /// Record deductible expense
  Future<bool> recordDeduction(
    String userId,
    String category,
    double amount,
    String description,
    String deductionType, // 'business', 'medical', 'education', 'other'
  ) async {
    try {
      await _supabase.from('tax_deductions').insert({
        'user_id': userId,
        'category': category,
        'amount': amount,
        'description': description,
        'deduction_type': deductionType,
        'status': 'pending_review',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[TaxManagement] Deduction recorded: $category - $amount');
      return true;
    } catch (e) {
      debugPrint('[TaxManagement] Error recording deduction: $e');
      return false;
    }
  }

  /// Get tax summary for year
  Future<Map<String, dynamic>> getTaxSummary(
    String userId,
    int year,
  ) async {
    try {
      final startDate = DateTime(year, 1, 1).toIso8601String();
      final endDate = DateTime(year, 12, 31).toIso8601String();

      // Get total income
      final income = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .eq('type', 'earning')
          .gte('created_at', startDate)
          .lte('created_at', endDate);

      final totalIncome = income.fold<double>(
          0,
          (sum, tx) =>
              sum + ((tx['amount'] as num?)?.toDouble() ?? 0));

      // Get deductions
      final deductions = await _supabase
          .from('tax_deductions')
          .select()
          .eq('user_id', userId)
          .eq('status', 'approved')
          .gte('created_at', startDate)
          .lte('created_at', endDate);

      final totalDeductions = deductions.fold<double>(
          0,
          (sum, d) =>
              sum + ((d['amount'] as num?)?.toDouble() ?? 0));

      // Calculate tax
      final taxableIncome = (totalIncome - totalDeductions).clamp(0.0, double.infinity);
      final estimatedTax = taxableIncome * 0.15; // 15% tax rate

      return {
        'year': year,
        'total_income': totalIncome,
        'total_deductions': totalDeductions,
        'taxable_income': taxableIncome,
        'estimated_tax': estimatedTax,
        'deductions_count': deductions.length,
        'tax_rate': '15%',
      };
    } catch (e) {
      debugPrint('[TaxManagement] Error getting tax summary: $e');
      return {};
    }
  }

  /// Get deductions by category
  Future<Map<String, double>> getDeductionsByCategory(
    String userId,
    int year,
  ) async {
    try {
      final startDate = DateTime(year, 1, 1).toIso8601String();
      final endDate = DateTime(year, 12, 31).toIso8601String();

      final deductions = await _supabase
          .from('tax_deductions')
          .select()
          .eq('user_id', userId)
          .eq('status', 'approved')
          .gte('created_at', startDate)
          .lte('created_at', endDate);

      final byCategory = <String, double>{};
      for (final deduction in deductions) {
        final category = (deduction['category'] as String?) ?? 'Other';
        final amount = (deduction['amount'] as num?)?.toDouble() ?? 0;
        byCategory[category] = (byCategory[category] ?? 0) + amount;
      }

      return byCategory;
    } catch (e) {
      debugPrint('[TaxManagement] Error getting deductions by category: $e');
      return {};
    }
  }

  /// Get recent deductions
  Future<List<Map<String, dynamic>>> getRecentDeductions(
    String userId,
  ) async {
    try {
      final deductions = await _supabase
          .from('tax_deductions')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .limit(10);

      return deductions.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[TaxManagement] Error getting recent deductions: $e');
      return [];
    }
  }

  /// Generate tax optimization suggestions
  List<Map<String, dynamic>> getTaxOptimizationTips(
    double totalIncome,
    double totalDeductions,
    bool isArabic = false,
  ) {
    final tips = <Map<String, dynamic>>[];
    final deductionRatio = totalIncome > 0 ? totalDeductions / totalIncome : 0;

    if (deductionRatio < 0.1) {
      tips.add({
        'title': isArabic ? '📝 زيادة الخصومات' : '📝 Increase Deductions',
        'description': isArabic
            ? 'يمكنك الاستفادة من المزيد من الخصومات المسموحة'
            : 'You can claim more allowable deductions',
        'priority': 'high',
        'category': 'deductions',
      });
    }

    if (totalIncome > 100000) {
      tips.add({
        'title': isArabic ? '💰 استثمر في التقاعد' : '💰 Retirement Savings',
        'description': isArabic
            ? 'ساهم في صندوق التقاعد للتقليل من الضرائب'
            : 'Contribute to retirement accounts for tax benefits',
        'priority': 'medium',
        'category': 'retirement',
      });
    }

    if (deductionRatio > 0.3) {
      tips.add({
        'title': isArabic ? '✅ احتفظ بالسجلات' : '✅ Keep Records',
        'description': isArabic
            ? 'احتفظ بجميع المستندات لدعم خصوماتك'
            : 'Keep all documentation to support deductions',
        'priority': 'high',
        'category': 'record_keeping',
      });
    }

    return tips;
  }

  /// Approve deduction
  Future<bool> approveDeduction(String deductionId) async {
    try {
      await _supabase.from('tax_deductions').update({
        'status': 'approved',
        'approved_at': DateTime.now().toIso8601String(),
      }).eq('id', deductionId);

      return true;
    } catch (e) {
      debugPrint('[TaxManagement] Error approving deduction: $e');
      return false;
    }
  }

  /// Reject deduction
  Future<bool> rejectDeduction(String deductionId, String reason) async {
    try {
      await _supabase.from('tax_deductions').update({
        'status': 'rejected',
        'rejection_reason': reason,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', deductionId);

      return true;
    } catch (e) {
      debugPrint('[TaxManagement] Error rejecting deduction: $e');
      return false;
    }
  }

  /// Generate tax report PDF
  Future<String> generateTaxReport(
    String userId,
    int year,
  ) async {
    try {
      final summary = await getTaxSummary(userId, year);
      final deductions = await getDeductionsByCategory(userId, year);

      // In a real app, this would generate a PDF
      final reportData = {
        'user_id': userId,
        'year': year,
        'summary': summary,
        'deductions_by_category': deductions,
        'generated_at': DateTime.now().toIso8601String(),
      };

      debugPrint('[TaxManagement] Tax report generated');
      return 'report_${userId}_$year.pdf';
    } catch (e) {
      debugPrint('[TaxManagement] Error generating report: $e');
      return '';
    }
  }
}
