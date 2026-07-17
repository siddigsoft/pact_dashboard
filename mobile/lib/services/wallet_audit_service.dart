import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

/// Wallet audit logging service for tracking all wallet-related actions
class WalletAuditService {
  static final WalletAuditService _instance = WalletAuditService._internal();

  factory WalletAuditService() {
    return _instance;
  }

  WalletAuditService._internal();

  final String _tableName = 'wallet_audit_logs';

  /// Log a wallet action with automatic timestamp
  Future<void> logAction({
    required String userId,
    required String actionType,
    String? description,
    Map<String, dynamic>? metadata,
    String? status = 'success',
  }) async {
    try {
      final now = DateTime.now().toIso8601String();

      await Supabase.instance.client.from(_tableName).insert({
        'user_id': userId,
        'action_type': actionType,
        'description': description,
        'metadata': metadata ?? {},
        'status': status,
        'timestamp': now,
        'ip_address': null, // Can be populated server-side
        'user_agent': null, // Can be populated server-side
      });

      debugPrint(
        '[WalletAudit] Logged action: $actionType at $now for user $userId',
      );
    } catch (e) {
      debugPrint('[WalletAudit] Error logging action: $e');
    }
  }

  /// Get audit logs for a user with optional filters
  Future<List<Map<String, dynamic>>> getAuditLogs({
    required String userId,
    String? actionType,
    int limit = 50,
    int offset = 0,
  }) async {
    try {
      var query = Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', ascending: false)
          .limit(limit);

      if (actionType != null) {
        query = query.eq('action_type', actionType);
      }

      if (offset > 0) {
        query = query.offset(offset);
      }

      final data = await query;
      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[WalletAudit] Error fetching audit logs: $e');
      return [];
    }
  }

  /// Get audit logs by date range
  Future<List<Map<String, dynamic>>> getAuditLogsByDateRange({
    required String userId,
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    try {
      final data = await Supabase.instance.client
          .from(_tableName)
          .select('*')
          .eq('user_id', userId)
          .gte('timestamp', startDate.toIso8601String())
          .lte('timestamp', endDate.toIso8601String())
          .order('timestamp', ascending: false);

      return List<Map<String, dynamic>>.from(data as List);
    } catch (e) {
      debugPrint('[WalletAudit] Error fetching audit logs by date range: $e');
      return [];
    }
  }

  /// Log withdrawal request
  Future<void> logWithdrawalRequest({
    required String userId,
    required double amount,
    required String paymentMethod,
    String? reason,
  }) => logAction(
    userId: userId,
    actionType: 'withdrawal_request',
    description: 'Requested withdrawal of $amount SDG via $paymentMethod',
    metadata: {
      'amount': amount,
      'payment_method': paymentMethod,
      'reason': reason,
    },
  );

  /// Log receipt confirmation
  Future<void> logReceiptConfirmation({
    required String userId,
    required String receiptId,
    required String receiptType, // 'cost' or 'advance'
    required double amount,
  }) => logAction(
    userId: userId,
    actionType: 'receipt_confirmed',
    description: 'Confirmed $receiptType receipt ($receiptId) for $amount SDG',
    metadata: {
      'receipt_id': receiptId,
      'receipt_type': receiptType,
      'amount': amount,
    },
  );

  /// Log receipt decline
  Future<void> logReceiptDecline({
    required String userId,
    required String receiptId,
    required String receiptType,
    required double amount,
    String? reason,
  }) => logAction(
    userId: userId,
    actionType: 'receipt_declined',
    description: 'Declined $receiptType receipt ($receiptId) for $amount SDG',
    metadata: {
      'receipt_id': receiptId,
      'receipt_type': receiptType,
      'amount': amount,
      'reason': reason,
    },
  );

  /// Log wallet refresh/sync
  Future<void> logWalletSync({
    required String userId,
    required int transactionCount,
    required int withdrawalCount,
  }) => logAction(
    userId: userId,
    actionType: 'wallet_sync',
    description: 'Wallet data synced',
    metadata: {
      'transaction_count': transactionCount,
      'withdrawal_count': withdrawalCount,
    },
  );

  /// Log statement export
  Future<void> logStatementExport({
    required String userId,
    required String format, // 'pdf' or 'csv'
    required DateTime from,
    required DateTime to,
  }) => logAction(
    userId: userId,
    actionType: 'statement_export',
    description:
        'Exported statement ($format) from ${from.toLocal()} to ${to.toLocal()}',
    metadata: {
      'format': format,
      'from_date': from.toIso8601String(),
      'to_date': to.toIso8601String(),
    },
  );

  /// Log transaction search/filter
  Future<void> logTransactionSearch({
    required String userId,
    required Map<String, dynamic> filters,
    required int resultCount,
  }) => logAction(
    userId: userId,
    actionType: 'transaction_search',
    description: 'Searched transactions with filters',
    metadata: {'filters': filters, 'result_count': resultCount},
  );

  /// Format timestamp for display
  static String formatAuditTimestamp(String isoTimestamp) {
    try {
      final dateTime = DateTime.parse(isoTimestamp).toLocal();
      return '${dateTime.year}-${dateTime.month.toString().padLeft(2, '0')}-${dateTime.day.toString().padLeft(2, '0')} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}:${dateTime.second.toString().padLeft(2, '0')}';
    } catch (e) {
      return isoTimestamp;
    }
  }

  /// Format relative time (e.g., "5 minutes ago")
  static String formatRelativeTime(String isoTimestamp) {
    try {
      final dateTime = DateTime.parse(isoTimestamp).toLocal();
      final now = DateTime.now();
      final difference = now.difference(dateTime);

      if (difference.inSeconds < 60) {
        return '${difference.inSeconds}s ago';
      } else if (difference.inMinutes < 60) {
        return '${difference.inMinutes}m ago';
      } else if (difference.inHours < 24) {
        return '${difference.inHours}h ago';
      } else if (difference.inDays < 7) {
        return '${difference.inDays}d ago';
      } else {
        return dateTime.toString().split(' ')[0];
      }
    } catch (e) {
      return isoTimestamp;
    }
  }
}
