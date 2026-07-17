import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

/// P2P money transfer service
class P2PTransferService {
  static final P2PTransferService _instance = P2PTransferService._internal();

  factory P2PTransferService() {
    return _instance;
  }

  P2PTransferService._internal();

  final _supabase = Supabase.instance.client;

  /// Send money to another user
  Future<String> sendMoney({
    required String senderId,
    required String recipientId,
    required double amount,
    String? description,
  }) async {
    try {
      final transactionId = DateTime.now().millisecondsSinceEpoch.toString();

      // Create transaction record
      await _supabase.from('p2p_transfers').insert({
        'transaction_id': transactionId,
        'sender_id': senderId,
        'recipient_id': recipientId,
        'amount': amount,
        'status': 'completed',
        'description': description ?? 'Money transfer',
        'created_at': DateTime.now().toIso8601String(),
      });

      // Debit sender
      await _supabase.from('wallet_transactions').insert({
        'user_id': senderId,
        'type': 'p2p_transfer',
        'amount': -amount,
        'description': 'Sent to recipient: $description',
        'reference_id': transactionId,
        'created_at': DateTime.now().toIso8601String(),
      });

      // Credit recipient
      await _supabase.from('wallet_transactions').insert({
        'user_id': recipientId,
        'type': 'p2p_received',
        'amount': amount,
        'description': 'Received transfer: $description',
        'reference_id': transactionId,
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[P2PTransfer] Sent $amount SDG to recipient');
      return transactionId;
    } catch (e) {
      debugPrint('[P2PTransfer] Error sending money: $e');
      rethrow;
    }
  }

  /// Request money from another user
  Future<void> requestMoney({
    required String requesterId,
    required String payerId,
    required double amount,
    String? description,
  }) async {
    try {
      await _supabase.from('money_requests').insert({
        'requester_id': requesterId,
        'payer_id': payerId,
        'amount': amount,
        'status': 'pending',
        'description': description ?? 'Money request',
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[P2PTransfer] Money request created for $amount SDG');
    } catch (e) {
      debugPrint('[P2PTransfer] Error creating request: $e');
      rethrow;
    }
  }

  /// Get pending money requests for user
  Future<List<Map<String, dynamic>>> getPendingRequests(String userId) async {
    try {
      final response = await _supabase
          .from('money_requests')
          .select()
          .eq('payer_id', userId)
          .eq('status', 'pending')
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[P2PTransfer] Error fetching requests: $e');
      return [];
    }
  }

  /// Get all transfers (sent & received)
  Future<List<Map<String, dynamic>>> getTransferHistory({
    required String userId,
    int limit = 50,
  }) async {
    try {
      final response = await _supabase
          .from('p2p_transfers')
          .select()
          .or('sender_id.eq.$userId,recipient_id.eq.$userId')
          .order('created_at', ascending: false)
          .limit(limit);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[P2PTransfer] Error fetching history: $e');
      return [];
    }
  }

  /// Get sent transfers
  Future<List<Map<String, dynamic>>> getSentTransfers(String userId) async {
    try {
      final response = await _supabase
          .from('p2p_transfers')
          .select()
          .eq('sender_id', userId)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[P2PTransfer] Error fetching sent: $e');
      return [];
    }
  }

  /// Get received transfers
  Future<List<Map<String, dynamic>>> getReceivedTransfers(String userId) async {
    try {
      final response = await _supabase
          .from('p2p_transfers')
          .select()
          .eq('recipient_id', userId)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('[P2PTransfer] Error fetching received: $e');
      return [];
    }
  }

  /// Approve a money request
  Future<void> approveRequest({
    required String requestId,
    required String payerId,
    double? amount,
  }) async {
    try {
      // Get request details
      final request = await _supabase
          .from('money_requests')
          .select()
          .eq('id', requestId)
          .single();

      final requestAmount = (request['amount'] as num?)?.toDouble() ?? 0;
      final requesterId = request['requester_id'] as String?;
      final description = request['description'] as String?;

      // Process transfer
      await sendMoney(
        senderId: payerId,
        recipientId: requesterId ?? '',
        amount: amount ?? requestAmount,
        description: description,
      );

      // Update request status
      await _supabase
          .from('money_requests')
          .update({'status': 'approved'})
          .eq('id', requestId);

      debugPrint('[P2PTransfer] Money request approved');
    } catch (e) {
      debugPrint('[P2PTransfer] Error approving request: $e');
      rethrow;
    }
  }

  /// Reject a money request
  Future<void> rejectRequest(String requestId) async {
    try {
      await _supabase
          .from('money_requests')
          .update({'status': 'rejected'})
          .eq('id', requestId);

      debugPrint('[P2PTransfer] Money request rejected');
    } catch (e) {
      debugPrint('[P2PTransfer] Error rejecting request: $e');
      rethrow;
    }
  }

  /// Get total sent this month
  Future<double> getTotalSentThisMonth(String userId) async {
    try {
      final now = DateTime.now();
      final firstDay = DateTime(now.year, now.month, 1);

      final response = await _supabase
          .from('p2p_transfers')
          .select('amount')
          .eq('sender_id', userId)
          .gte('created_at', firstDay.toIso8601String())
          .eq('status', 'completed');

      return (response as List).fold<double>(0, (sum, t) {
        final amount = (t['amount'] as num?)?.toDouble() ?? 0;
        return sum + amount;
      });
    } catch (e) {
      debugPrint('[P2PTransfer] Error getting sent total: $e');
      return 0;
    }
  }

  /// Get total received this month
  Future<double> getTotalReceivedThisMonth(String userId) async {
    try {
      final now = DateTime.now();
      final firstDay = DateTime(now.year, now.month, 1);

      final response = await _supabase
          .from('p2p_transfers')
          .select('amount')
          .eq('recipient_id', userId)
          .gte('created_at', firstDay.toIso8601String())
          .eq('status', 'completed');

      return (response as List).fold<double>(0, (sum, t) {
        final amount = (t['amount'] as num?)?.toDouble() ?? 0;
        return sum + amount;
      });
    } catch (e) {
      debugPrint('[P2PTransfer] Error getting received total: $e');
      return 0;
    }
  }
}
