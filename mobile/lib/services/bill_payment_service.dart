import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show debugPrint;

/// Automated bill payments and reminders
class BillPaymentService {
  static final BillPaymentService _instance = BillPaymentService._internal();

  factory BillPaymentService() {
    return _instance;
  }

  BillPaymentService._internal();

  final _supabase = Supabase.instance.client;

  /// Add a bill
  Future<bool> addBill(
    String userId,
    String billName,
    double amount,
    String dueDate, // 'monthly', 'quarterly', 'yearly'
    int dayOfMonth,
    String paymentMethod, {
    String notes = '',
  }) async {
    try {
      await _supabase.from('bills').insert({
        'user_id': userId,
        'bill_name': billName,
        'amount': amount,
        'frequency': dueDate,
        'day_of_month': dayOfMonth,
        'payment_method': paymentMethod,
        'notes': notes,
        'status': 'active',
        'next_due_date': _calculateNextDueDate(dayOfMonth),
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[BillPayment] Bill added: $billName');
      return true;
    } catch (e) {
      debugPrint('[BillPayment] Error adding bill: $e');
      return false;
    }
  }

  /// Get upcoming bills
  Future<List<Map<String, dynamic>>> getUpcomingBills(String userId) async {
    try {
      final bills = await _supabase
          .from('bills')
          .select()
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('day_of_month', ascending: true);

      return bills.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[BillPayment] Error getting upcoming bills: $e');
      return [];
    }
  }

  /// Get bills due this month
  Future<List<Map<String, dynamic>>> getBillsDueThisMonth(String userId) async {
    try {
      final now = DateTime.now();
      final bills = await getUpcomingBills(userId);

      final dueBills = bills.where((bill) {
        final dayOfMonth = (bill['day_of_month'] as num?)?.toInt() ?? 1;
        return dayOfMonth >= now.day;
      }).toList();

      return dueBills;
    } catch (e) {
      debugPrint('[BillPayment] Error getting bills due this month: $e');
      return [];
    }
  }

  /// Record bill payment
  Future<bool> recordPayment(
    String userId,
    String billId,
    double paidAmount,
  ) async {
    try {
      // Get bill details
      final bill = await _supabase
          .from('bills')
          .select()
          .eq('id', billId)
          .single();

      // Record payment
      await _supabase.from('bill_payments').insert({
        'bill_id': billId,
        'user_id': userId,
        'amount_paid': paidAmount,
        'payment_date': DateTime.now().toIso8601String(),
        'status': 'completed',
      });

      // Create transaction
      await _supabase.from('wallet_transactions').insert({
        'user_id': userId,
        'amount': -paidAmount,
        'type': 'bill_payment',
        'category': 'bill_payment',
        'description': 'Paid ${bill['bill_name']} bill',
        'created_at': DateTime.now().toIso8601String(),
      });

      // Update next due date
      final nextDueDate = _calculateNextDueDate(
        (bill['day_of_month'] as num?)?.toInt() ?? 1,
      );
      await _supabase
          .from('bills')
          .update({
            'next_due_date': nextDueDate,
            'last_paid_date': DateTime.now().toIso8601String(),
          })
          .eq('id', billId);

      debugPrint('[BillPayment] Payment recorded for bill: $billId');
      return true;
    } catch (e) {
      debugPrint('[BillPayment] Error recording payment: $e');
      return false;
    }
  }

  /// Get payment history for a bill
  Future<List<Map<String, dynamic>>> getPaymentHistory(String billId) async {
    try {
      final payments = await _supabase
          .from('bill_payments')
          .select()
          .eq('bill_id', billId)
          .order('payment_date', ascending: false);

      return payments.cast<Map<String, dynamic>>();
    } catch (e) {
      debugPrint('[BillPayment] Error getting payment history: $e');
      return [];
    }
  }

  /// Get total monthly bill amount
  Future<double> getTotalMonthlyBills(String userId) async {
    try {
      final bills = await getUpcomingBills(userId);

      return bills.fold<double>(
        0,
        (sum, bill) => sum + ((bill['amount'] as num?)?.toDouble() ?? 0),
      );
    } catch (e) {
      debugPrint('[BillPayment] Error calculating total: $e');
      return 0;
    }
  }

  /// Get bills by category
  Future<Map<String, double>> getBillsByCategory(String userId) async {
    try {
      final bills = await getUpcomingBills(userId);
      final byCategory = <String, double>{};

      for (final bill in bills) {
        final name = (bill['bill_name'] as String?) ?? 'Other';
        final amount = (bill['amount'] as num?)?.toDouble() ?? 0;
        byCategory[name] = (byCategory[name] ?? 0) + amount;
      }

      return byCategory;
    } catch (e) {
      debugPrint('[BillPayment] Error getting bills by category: $e');
      return {};
    }
  }

  /// Enable autopay for bill
  Future<bool> enableAutoPay(String billId, String paymentMethod) async {
    try {
      await _supabase
          .from('bills')
          .update({
            'autopay_enabled': true,
            'payment_method': paymentMethod,
            'autopay_enabled_at': DateTime.now().toIso8601String(),
          })
          .eq('id', billId);

      debugPrint('[BillPayment] AutoPay enabled for bill: $billId');
      return true;
    } catch (e) {
      debugPrint('[BillPayment] Error enabling autopay: $e');
      return false;
    }
  }

  /// Disable autopay for bill
  Future<bool> disableAutoPay(String billId) async {
    try {
      await _supabase
          .from('bills')
          .update({
            'autopay_enabled': false,
            'autopay_disabled_at': DateTime.now().toIso8601String(),
          })
          .eq('id', billId);

      return true;
    } catch (e) {
      debugPrint('[BillPayment] Error disabling autopay: $e');
      return false;
    }
  }

  /// Delete bill
  Future<bool> deleteBill(String billId) async {
    try {
      await _supabase
          .from('bills')
          .update({'status': 'deleted'})
          .eq('id', billId);

      return true;
    } catch (e) {
      debugPrint('[BillPayment] Error deleting bill: $e');
      return false;
    }
  }

  /// Calculate next due date
  String _calculateNextDueDate(int dayOfMonth) {
    final now = DateTime.now();
    var dueDate = DateTime(now.year, now.month, dayOfMonth);

    if (dueDate.isBefore(now)) {
      dueDate = DateTime(now.year, now.month + 1, dayOfMonth);
    }

    // Handle months with fewer days
    if (dueDate.month != DateTime(now.year, now.month + 1).month) {
      dueDate = DateTime(
        dueDate.year,
        dueDate.month,
        1,
      ).subtract(const Duration(days: 1));
    }

    return dueDate.toIso8601String();
  }
}
