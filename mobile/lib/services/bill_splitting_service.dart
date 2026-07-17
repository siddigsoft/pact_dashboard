import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

/// Bill splitting and expense sharing service
class BillSplittingService {
  static final BillSplittingService _instance =
      BillSplittingService._internal();

  factory BillSplittingService() {
    return _instance;
  }

  BillSplittingService._internal();

  final _supabase = Supabase.instance.client;

  /// Create a split bill
  Future<String> createSplitBill({
    required String creatorId,
    required String billName,
    required double totalAmount,
    required List<String> participantIds,
    String? description,
  }) async {
    try {
      final billId = DateTime.now().millisecondsSinceEpoch.toString();
      final amountPerPerson = totalAmount / participantIds.length;

      // Create bill record
      await _supabase.from('split_bills').insert({
        'bill_id': billId,
        'creator_id': creatorId,
        'bill_name': billName,
        'total_amount': totalAmount,
        'amount_per_person': amountPerPerson,
        'number_of_participants': participantIds.length,
        'description': description ?? '',
        'status': 'active',
        'created_at': DateTime.now().toIso8601String(),
      });

      // Create bill items for each participant
      for (final participantId in participantIds) {
        await _supabase.from('bill_split_items').insert({
          'bill_id': billId,
          'participant_id': participantId,
          'amount_owed': amountPerPerson,
          'status': participantId == creatorId ? 'paid' : 'pending',
          'created_at': DateTime.now().toIso8601String(),
        });
      }

      debugPrint('[BillSplitting] Created split bill: $billName, $billId');
      return billId;
    } catch (e) {
      debugPrint('[BillSplitting] Error creating split bill: $e');
      rethrow;
    }
  }

  /// Create custom split (different amounts per person)
  Future<String> createCustomSplit({
    required String creatorId,
    required String billName,
    required Map<String, double> participantAmounts,
    String? description,
  }) async {
    try {
      final billId = DateTime.now().millisecondsSinceEpoch.toString();
      final totalAmount = participantAmounts.values.fold<double>(
        0,
        (sum, a) => sum + a,
      );

      // Create bill record
      await _supabase.from('split_bills').insert({
        'bill_id': billId,
        'creator_id': creatorId,
        'bill_name': billName,
        'total_amount': totalAmount,
        'number_of_participants': participantAmounts.length,
        'description': description ?? '',
        'status': 'active',
        'is_custom_split': true,
        'created_at': DateTime.now().toIso8601String(),
      });

      // Create bill items with custom amounts
      for (final entry in participantAmounts.entries) {
        await _supabase.from('bill_split_items').insert({
          'bill_id': billId,
          'participant_id': entry.key,
          'amount_owed': entry.value,
          'status': entry.key == creatorId ? 'paid' : 'pending',
          'created_at': DateTime.now().toIso8601String(),
        });
      }

      debugPrint('[BillSplitting] Created custom split: $billName, $billId');
      return billId;
    } catch (e) {
      debugPrint('[BillSplitting] Error creating custom split: $e');
      rethrow;
    }
  }

  /// Get pending split bills for user
  Future<List<Map<String, dynamic>>> getPendingBills(String userId) async {
    try {
      final response = await _supabase
          .from('split_bills')
          .select()
          .eq('status', 'active')
          .order('created_at', ascending: false);

      // Filter bills where user is a participant with pending payment
      final List<Map<String, dynamic>> pendingBills = [];

      for (final bill in response as List) {
        final billId = bill['bill_id'] as String?;
        if (billId != null) {
          final items = await _supabase
              .from('bill_split_items')
              .select()
              .eq('bill_id', billId)
              .eq('participant_id', userId)
              .eq('status', 'pending');

          if (items.isNotEmpty) {
            bill['my_share'] =
                (items[0]['amount_owed'] as num?)?.toDouble() ?? 0;
            pendingBills.add(bill as Map<String, dynamic>);
          }
        }
      }

      return pendingBills;
    } catch (e) {
      debugPrint('[BillSplitting] Error fetching pending bills: $e');
      return [];
    }
  }

  /// Get all split bills involving user
  Future<List<Map<String, dynamic>>> getUserSplitBills(String userId) async {
    try {
      final response = await _supabase
          .from('bill_split_items')
          .select('bill_id')
          .eq('participant_id', userId);

      final billIds = (response as List).map((item) => item['bill_id']).toSet();

      final bills = await _supabase
          .from('split_bills')
          .select()
          .inFilter('bill_id', billIds.toList())
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(bills);
    } catch (e) {
      debugPrint('[BillSplitting] Error fetching user bills: $e');
      return [];
    }
  }

  /// Mark amount as paid
  Future<void> markAsPaid({
    required String billId,
    required String participantId,
  }) async {
    try {
      await _supabase
          .from('bill_split_items')
          .update({'status': 'paid'})
          .eq('bill_id', billId)
          .eq('participant_id', participantId);

      // Create wallet transaction
      final bill = await _supabase
          .from('split_bills')
          .select()
          .eq('bill_id', billId)
          .single();

      final billItem = await _supabase
          .from('bill_split_items')
          .select()
          .eq('bill_id', billId)
          .eq('participant_id', participantId)
          .single();

      final amount = (billItem['amount_owed'] as num?)?.toDouble() ?? 0;

      await _supabase.from('wallet_transactions').insert({
        'user_id': participantId,
        'type': 'bill_split_payment',
        'amount': -amount,
        'description': 'Paid for ${bill['bill_name']}',
        'reference_id': billId,
        'created_at': DateTime.now().toIso8601String(),
      });

      debugPrint('[BillSplitting] Marked as paid');
    } catch (e) {
      debugPrint('[BillSplitting] Error marking paid: $e');
      rethrow;
    }
  }

  /// Get bill details with all participants
  Future<Map<String, dynamic>> getBillDetails(String billId) async {
    try {
      final bill = await _supabase
          .from('split_bills')
          .select()
          .eq('bill_id', billId)
          .single();

      final items = await _supabase
          .from('bill_split_items')
          .select()
          .eq('bill_id', billId)
          .order('created_at', ascending: false);

      bill['participants'] = items;

      return bill;
    } catch (e) {
      debugPrint('[BillSplitting] Error getting bill details: $e');
      return {};
    }
  }

  /// Settle bill (mark all as completed)
  Future<void> settleBill(String billId) async {
    try {
      await _supabase
          .from('split_bills')
          .update({'status': 'settled'})
          .eq('bill_id', billId);

      debugPrint('[BillSplitting] Bill settled');
    } catch (e) {
      debugPrint('[BillSplitting] Error settling bill: $e');
      rethrow;
    }
  }

  /// Get total owed by user
  Future<double> getTotalOwed(String userId) async {
    try {
      final response = await _supabase
          .from('bill_split_items')
          .select('amount_owed')
          .eq('participant_id', userId)
          .eq('status', 'pending');

      return (response as List).fold<double>(0, (sum, item) {
        final amount = (item['amount_owed'] as num?)?.toDouble() ?? 0;
        return sum + amount;
      });
    } catch (e) {
      debugPrint('[BillSplitting] Error getting total owed: $e');
      return 0;
    }
  }

  /// Get total paid by user (as creator/organizer)
  Future<double> getTotalPaidAsOrganizer(String userId) async {
    try {
      final response = await _supabase
          .from('split_bills')
          .select('total_amount')
          .eq('creator_id', userId);

      return (response as List).fold<double>(0, (sum, bill) {
        final amount = (bill['total_amount'] as num?)?.toDouble() ?? 0;
        return sum + amount;
      });
    } catch (e) {
      debugPrint('[BillSplitting] Error getting organizer total: $e');
      return 0;
    }
  }
}
