// lib/providers/fund_confirmation_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Provider to check for pending fund confirmations globally
/// This includes: cost submissions, advances, withdrawals, etc.
final fundConfirmationCheckProvider =
    StateNotifierProvider<FundConfirmationNotifier, FundConfirmationState>(
      (ref) => FundConfirmationNotifier(),
    );

class FundConfirmationState {
  final List<Map<String, dynamic>> pendingCostReceipts;
  final List<Map<String, dynamic>> pendingAdvanceReceipts;
  final List<Map<String, dynamic>> pendingWithdrawalConfirmations;
  final bool isLoading;
  final String? error;

  FundConfirmationState({
    this.pendingCostReceipts = const [],
    this.pendingAdvanceReceipts = const [],
    this.pendingWithdrawalConfirmations = const [],
    this.isLoading = false,
    this.error,
  });

  bool get hasAnyPending =>
      pendingCostReceipts.isNotEmpty ||
      pendingAdvanceReceipts.isNotEmpty ||
      pendingWithdrawalConfirmations.isNotEmpty;

  int get totalPending =>
      pendingCostReceipts.length +
      pendingAdvanceReceipts.length +
      pendingWithdrawalConfirmations.length;

  FundConfirmationState copyWith({
    List<Map<String, dynamic>>? pendingCostReceipts,
    List<Map<String, dynamic>>? pendingAdvanceReceipts,
    List<Map<String, dynamic>>? pendingWithdrawalConfirmations,
    bool? isLoading,
    String? error,
  }) {
    return FundConfirmationState(
      pendingCostReceipts: pendingCostReceipts ?? this.pendingCostReceipts,
      pendingAdvanceReceipts:
          pendingAdvanceReceipts ?? this.pendingAdvanceReceipts,
      pendingWithdrawalConfirmations:
          pendingWithdrawalConfirmations ?? this.pendingWithdrawalConfirmations,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class FundConfirmationNotifier extends StateNotifier<FundConfirmationState> {
  FundConfirmationNotifier() : super(FundConfirmationState());

  Future<void> checkPendingConfirmations(String userId) async {
    if (userId.isEmpty) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final supabase = Supabase.instance.client;

      // Check for pending cost receipt confirmations
      final costData = await supabase
          .from('operational_cost_submissions')
          .select('*')
          .eq('submitted_by', userId)
          .inFilter('status', ['paid', 'reconciled'])
          .eq('fund_receipt_confirmed', false)
          .order('created_at', ascending: false);

      // Check for pending advance receipt confirmations
      final advanceData = await supabase
          .from('user_advances')
          .select('*')
          .eq('user_id', userId)
          .inFilter('status', ['approved', 'disbursed'])
          .eq('fund_received_confirmed', false)
          .order('created_at', ascending: false);

      // Check for pending withdrawal confirmations
      final withdrawalData = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('type', 'withdrawal')
          .inFilter('status', ['completed', 'settled'])
          .eq('received_confirmed', false)
          .order('created_at', ascending: false);

      state = state.copyWith(
        isLoading: false,
        pendingCostReceipts: List<Map<String, dynamic>>.from(costData ?? []),
        pendingAdvanceReceipts: List<Map<String, dynamic>>.from(
          advanceData ?? [],
        ),
        pendingWithdrawalConfirmations: List<Map<String, dynamic>>.from(
          withdrawalData ?? [],
        ),
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to check pending confirmations: $e',
      );
    }
  }

  void clearCostReceipt(String costId) {
    state = state.copyWith(
      pendingCostReceipts: state.pendingCostReceipts
          .where((item) => item['id'] != costId)
          .toList(),
    );
  }

  void clearAdvanceReceipt(String advanceId) {
    state = state.copyWith(
      pendingAdvanceReceipts: state.pendingAdvanceReceipts
          .where((item) => item['id'] != advanceId)
          .toList(),
    );
  }

  void clearWithdrawalConfirmation(String withdrawalId) {
    state = state.copyWith(
      pendingWithdrawalConfirmations: state.pendingWithdrawalConfirmations
          .where((item) => item['id'] != withdrawalId)
          .toList(),
    );
  }

  void reset() {
    state = FundConfirmationState();
  }
}
