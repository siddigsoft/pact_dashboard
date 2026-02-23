import 'package:supabase_flutter/supabase_flutter.dart';

class FundReceiptConfirmation {
  final String id;
  final String userId;
  final String walletId;
  final double amount;
  final String currency;
  final String status;
  final bool fundReceiptConfirmed;
  final String? fundReceiptConfirmedAt;
  final String? fundReceiptSignatureUrl;
  final String? fundReceiptNotes;
  final String? requestReason;
  final String? adminProcessedAt;
  final String createdAt;

  FundReceiptConfirmation({
    required this.id,
    required this.userId,
    required this.walletId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.fundReceiptConfirmed,
    this.fundReceiptConfirmedAt,
    this.fundReceiptSignatureUrl,
    this.fundReceiptNotes,
    this.requestReason,
    this.adminProcessedAt,
    required this.createdAt,
  });

  factory FundReceiptConfirmation.fromMap(Map<String, dynamic> row) {
    return FundReceiptConfirmation(
      id: row['id'] as String,
      userId: row['user_id'] as String,
      walletId: row['wallet_id'] as String,
      amount: double.tryParse(row['amount'].toString()) ?? 0.0,
      currency: row['currency'] as String,
      status: row['status'] as String,
      fundReceiptConfirmed: row['fund_receipt_confirmed'] as bool? ?? false,
      fundReceiptConfirmedAt: row['fund_receipt_confirmed_at'] as String?,
      fundReceiptSignatureUrl: row['fund_receipt_signature_url'] as String?,
      fundReceiptNotes: row['fund_receipt_notes'] as String?,
      requestReason: row['request_reason'] as String?,
      adminProcessedAt: row['admin_processed_at'] as String?,
      createdAt: row['created_at'] as String,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'user_id': userId,
      'wallet_id': walletId,
      'amount': amount,
      'currency': currency,
      'status': status,
      'fund_receipt_confirmed': fundReceiptConfirmed,
      'fund_receipt_confirmed_at': fundReceiptConfirmedAt,
      'fund_receipt_signature_url': fundReceiptSignatureUrl,
      'fund_receipt_notes': fundReceiptNotes,
      'request_reason': requestReason,
      'admin_processed_at': adminProcessedAt,
      'created_at': createdAt,
    };
  }

  bool get isPendingConfirmation => status == 'approved' && !fundReceiptConfirmed;
}

class ReceiptStats {
  final int totalApproved;
  final int totalConfirmed;
  final int totalPendingConfirmation;
  final double totalAmountConfirmed;
  final double totalAmountPending;

  ReceiptStats({
    required this.totalApproved,
    required this.totalConfirmed,
    required this.totalPendingConfirmation,
    required this.totalAmountConfirmed,
    required this.totalAmountPending,
  });
}

class ConfirmationStatus {
  final bool confirmed;
  final String? confirmedAt;
  final String? notes;

  ConfirmationStatus({
    required this.confirmed,
    this.confirmedAt,
    this.notes,
  });
}

class ConfirmReceiptResult {
  final bool success;
  final String confirmedAt;

  ConfirmReceiptResult({
    required this.success,
    required this.confirmedAt,
  });
}

class FundReceiptConfirmationService {
  final SupabaseClient _supabase;

  FundReceiptConfirmationService({SupabaseClient? supabase})
      : _supabase = supabase ?? Supabase.instance.client;

  /// Get all approved withdrawals for the user
  /// جلب جميع طلبات السحب المعتمدة للمستخدم
  Future<List<FundReceiptConfirmation>> getApprovedWithdrawals(String userId) async {
    final response = await _supabase
        .from('withdrawal_requests')
        .select()
        .eq('user_id', userId)
        .eq('status', 'approved')
        .order('admin_processed_at', ascending: false);

    return (response as List)
        .map((row) => FundReceiptConfirmation.fromMap(row as Map<String, dynamic>))
        .toList();
  }

  /// Get withdrawals that are approved but not yet confirmed by the enumerator
  /// جلب طلبات السحب المعتمدة التي لم يتم تأكيد استلامها بعد
  Future<List<FundReceiptConfirmation>> getPendingConfirmations(String userId) async {
    final response = await _supabase
        .from('withdrawal_requests')
        .select()
        .eq('user_id', userId)
        .eq('status', 'approved')
        .eq('fund_receipt_confirmed', false)
        .order('admin_processed_at', ascending: false);

    return (response as List)
        .map((row) => FundReceiptConfirmation.fromMap(row as Map<String, dynamic>))
        .toList();
  }

  /// Confirm that the enumerator has received the funds
  /// تأكيد استلام الأموال من قبل العداد
  Future<ConfirmReceiptResult> confirmReceipt(
    String requestId,
    String userId, {
    String? notes,
    String? signatureUrl,
  }) async {
    // Verify the request exists, belongs to this user, and is approved
    final request = await _supabase
        .from('withdrawal_requests')
        .select()
        .eq('id', requestId)
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle();

    if (request == null) {
      throw Exception(
        'طلب السحب غير موجود أو غير مؤهل للتأكيد\n'
        'Withdrawal request not found or not eligible for confirmation',
      );
    }

    if (request['fund_receipt_confirmed'] == true) {
      throw Exception(
        'تم تأكيد الاستلام مسبقاً\n'
        'Fund receipt already confirmed',
      );
    }

    final confirmedAt = DateTime.now().toUtc().toIso8601String();

    await _supabase
        .from('withdrawal_requests')
        .update({
          'fund_receipt_confirmed': true,
          'fund_receipt_confirmed_at': confirmedAt,
          'fund_receipt_signature_url': signatureUrl,
          'fund_receipt_notes': notes,
          'updated_at': confirmedAt,
        })
        .eq('id', requestId)
        .eq('user_id', userId);

    return ConfirmReceiptResult(success: true, confirmedAt: confirmedAt);
  }

  /// Check confirmation status of a specific withdrawal
  /// التحقق من حالة تأكيد طلب سحب محدد
  Future<ConfirmationStatus> getConfirmationStatus(String requestId) async {
    final data = await _supabase
        .from('withdrawal_requests')
        .select('fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_notes')
        .eq('id', requestId)
        .single();

    return ConfirmationStatus(
      confirmed: data['fund_receipt_confirmed'] as bool? ?? false,
      confirmedAt: data['fund_receipt_confirmed_at'] as String?,
      notes: data['fund_receipt_notes'] as String?,
    );
  }

  /// Get summary stats for receipt confirmations
  /// إحصائيات ملخصة لتأكيدات الاستلام
  Future<ReceiptStats> getReceiptStats(String userId) async {
    final response = await _supabase
        .from('withdrawal_requests')
        .select('amount, fund_receipt_confirmed')
        .eq('user_id', userId)
        .eq('status', 'approved');

    final rows = response as List;

    final confirmed = rows.where((r) => r['fund_receipt_confirmed'] == true).toList();
    final pending = rows.where((r) => r['fund_receipt_confirmed'] != true).toList();

    double sumAmount(List rows) {
      return rows.fold<double>(
        0.0,
        (sum, r) => sum + (double.tryParse(r['amount'].toString()) ?? 0.0),
      );
    }

    return ReceiptStats(
      totalApproved: rows.length,
      totalConfirmed: confirmed.length,
      totalPendingConfirmation: pending.length,
      totalAmountConfirmed: sumAmount(confirmed),
      totalAmountPending: sumAmount(pending),
    );
  }
}
