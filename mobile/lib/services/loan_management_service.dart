import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Loan tracking and repayment management
class LoanManagementService {
  static final LoanManagementService _instance =
      LoanManagementService._internal();

  factory LoanManagementService() {
    return _instance;
  }

  LoanManagementService._internal();

  final _supabase = Supabase.instance.client;

  /// Add loan
  Future<bool> addLoan(
    String userId,
    String loanName,
    double principalAmount,
    double interestRate, // annual percentage
    int loanTermMonths,
    DateTime startDate,
    String lender, {
    String notes = '',
  }) async {
    try {
      final monthlyPayment = _calculateMonthlyPayment(
        principalAmount,
        interestRate,
        loanTermMonths,
      );

      final maturityDate = startDate.add(Duration(days: loanTermMonths * 30));

      await _supabase.from('loans').insert({
        'user_id': userId,
        'loan_name': loanName,
        'principal_amount': principalAmount,
        'interest_rate': interestRate,
        'loan_term_months': loanTermMonths,
        'monthly_payment': monthlyPayment,
        'start_date': startDate.toIso8601String(),
        'maturity_date': maturityDate.toIso8601String(),
        'lender': lender,
        'notes': notes,
        'status': 'active',
        'amount_paid': 0,
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[LoanManagement] Loan added: $loanName');
      return true;
    } catch (e) {
      debugPrint('[LoanManagement] Error adding loan: $e');
      return false;
    }
  }

  /// Get active loans
  Future<List<Map<String, dynamic>>> getActiveLoans(String userId) async {
    try {
      final loans = await _supabase
          .from('loans')
          .select()
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('maturity_date', ascending: true);

      return loans.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[LoanManagement] Error getting active loans: $e');
      return [];
    }
  }

  /// Get all loans
  Future<List<Map<String, dynamic>>> getAllLoans(String userId) async {
    try {
      final loans = await _supabase
          .from('loans')
          .select()
          .eq('user_id', userId)
          .order('maturity_date', ascending: true);

      return loans.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[LoanManagement] Error getting all loans: $e');
      return [];
    }
  }

  /// Get loan details with progress
  Future<Map<String, dynamic>> getLoanDetails(String loanId) async {
    try {
      final loan = await _supabase
          .from('loans')
          .select()
          .eq('id', loanId)
          .single();

      final principalAmount =
          (loan['principal_amount'] as num?)?.toDouble() ?? 0;
      final amountPaid = (loan['amount_paid'] as num?)?.toDouble() ?? 0;
      final amountRemaining = principalAmount - amountPaid;
      final monthlyPayment = (loan['monthly_payment'] as num?)?.toDouble() ?? 0;
      final monthsRemaining = monthlyPayment > 0
          ? (amountRemaining / monthlyPayment).ceil()
          : 0;

      return {
        ...loan,
        'amount_remaining': amountRemaining,
        'progress_percentage': (amountPaid / principalAmount * 100).clamp(
          0,
          100,
        ),
        'months_remaining': monthsRemaining,
      };
    } catch (e) {
      debugPrint('[LoanManagement] Error getting loan details: $e');
      return {};
    }
  }

  /// Record loan payment
  Future<bool> recordPayment(
    String userId,
    String loanId,
    double amount,
  ) async {
    try {
      final loan = await _supabase
          .from('loans')
          .select()
          .eq('id', loanId)
          .single();

      // Record payment
      await _supabase.from('loan_payments').insert({
        'loan_id': loanId,
        'user_id': userId,
        'amount_paid': amount,
        'payment_date': DateTime.now().toIso8601String(),
      });

      // Create transaction
      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'amount': -amount,
        'type': 'loan_payment',
        'category': 'loans',
        'description': 'Loan payment for ${loan['loan_name']}',
        'created_at': DateTime.now().toIso8601String(),
      });

      // Update amount paid
      final currentPaid = (loan['amount_paid'] as num?)?.toDouble() ?? 0;
      final newTotal = currentPaid + amount;
      final principalAmount =
          (loan['principal_amount'] as num?)?.toDouble() ?? 0;

      // Check if loan is fully paid
      final status = newTotal >= principalAmount ? 'paid_off' : 'active';

      await _supabase
          .from('loans')
          .update({
            'amount_paid': newTotal,
            'status': status,
            'last_payment_date': DateTime.now().toIso8601String(),
          })
          .eq('id', loanId);

      debugPrint('[LoanManagement] Payment recorded for loan: $loanId');
      return true;
    } catch (e) {
      debugPrint('[LoanManagement] Error recording payment: $e');
      return false;
    }
  }

  /// Get payment history for loan
  Future<List<Map<String, dynamic>>> getPaymentHistory(String loanId) async {
    try {
      final payments = await _supabase
          .from('loan_payments')
          .select()
          .eq('loan_id', loanId)
          .order('payment_date', ascending: false);

      return payments.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[LoanManagement] Error getting payment history: $e');
      return [];
    }
  }

  /// Get total amount owed
  Future<double> getTotalAmountOwed(String userId) async {
    try {
      final loans = await getActiveLoans(userId);

      double totalOwed = 0;
      for (final loan in loans) {
        final principal = (loan['principal_amount'] as num?)?.toDouble() ?? 0;
        final paid = (loan['amount_paid'] as num?)?.toDouble() ?? 0;
        totalOwed += (principal - paid).clamp(0.0, double.infinity);
      }

      return totalOwed;
    } catch (e) {
      debugPrint('[LoanManagement] Error calculating total owed: $e');
      return 0;
    }
  }

  /// Get loans by status
  Future<Map<String, int>> getLoansByStatus(String userId) async {
    try {
      final loans = await getAllLoans(userId);

      final byStatus = <String, int>{};
      for (final loan in loans) {
        final status = (loan['status'] as String?) ?? 'unknown';
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      }

      return byStatus;
    } catch (e) {
      debugPrint('[LoanManagement] Error getting loans by status: $e');
      return {};
    }
  }

  /// Calculate loan summary
  Future<Map<String, dynamic>> getLoanSummary(String userId) async {
    try {
      final loans = await getActiveLoans(userId);

      double totalPrincipal = 0;
      double totalPaid = 0;
      double totalOwed = 0;
      double totalMonthlyPayment = 0;

      for (final loan in loans) {
        final principal = (loan['principal_amount'] as num?)?.toDouble() ?? 0;
        final paid = (loan['amount_paid'] as num?)?.toDouble() ?? 0;
        final monthly = (loan['monthly_payment'] as num?)?.toDouble() ?? 0;

        totalPrincipal += principal;
        totalPaid += paid;
        totalOwed += (principal - paid).clamp(0.0, double.infinity);
        totalMonthlyPayment += monthly;
      }

      return {
        'total_loans_count': loans.length,
        'total_principal': totalPrincipal,
        'total_paid': totalPaid,
        'total_owed': totalOwed,
        'total_monthly_payment': totalMonthlyPayment,
        'overall_progress': totalPrincipal > 0
            ? (totalPaid / totalPrincipal * 100).clamp(0, 100)
            : 0,
      };
    } catch (e) {
      debugPrint('[LoanManagement] Error calculating summary: $e');
      return {};
    }
  }

  /// Calculate monthly payment using amortization formula
  double _calculateMonthlyPayment(
    double principal,
    double annualRate,
    int months,
  ) {
    if (annualRate == 0) {
      return principal / months;
    }

    final monthlyRate = annualRate / 12 / 100;
    final monthlyPayment =
        principal *
        (monthlyRate * pow(1 + monthlyRate, months)) /
        (pow(1 + monthlyRate, months) - 1);

    return monthlyPayment;
  }
}
