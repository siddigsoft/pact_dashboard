import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/wallet_models.dart';
import '../repositories/wallet_repository.dart';
import 'auth_provider.dart';

// Withdrawal repository provider
final withdrawalRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository();
});

// Provider for user's withdrawal requests
final userWithdrawalRequestsProvider =
    StreamProvider.autoDispose<List<WithdrawalRequest>>((ref) {
      final userId = ref.watch(currentUserIdProvider);
      if (userId == null) {
        return Stream.value([]);
      }

      final repository = ref.watch(withdrawalRepositoryProvider);
      return repository.watchWithdrawalRequests(userId);
    });

// Create withdrawal request provider
class CreateWithdrawalNotifier
    extends StateNotifier<AsyncValue<WithdrawalRequest?>> {
  final Ref ref;

  CreateWithdrawalNotifier(this.ref) : super(const AsyncValue.data(null));

  Future<void> createWithdrawal({
    required double amount,
    required String currency,
    String? reason,
  }) async {
    state = const AsyncValue.loading();

    try {
      final userId = ref.read(currentUserIdProvider);
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final repository = ref.read(withdrawalRepositoryProvider);
      final request = await repository.createWithdrawalRequest(
        userId: userId,
        amount: amount,
        currency: currency,
        reason: reason,
      );

      state = AsyncValue.data(request);

      // Invalidate related providers
      ref.invalidate(userWithdrawalRequestsProvider);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final createWithdrawalProvider =
    StateNotifierProvider.autoDispose<
      CreateWithdrawalNotifier,
      AsyncValue<WithdrawalRequest?>
    >((ref) {
      return CreateWithdrawalNotifier(ref);
    });

// Provider for pending withdrawal requests (for approval dashboard)
final pendingWithdrawalRequestsProvider =
    FutureProvider.autoDispose<List<WithdrawalRequest>>((ref) async {
      final userId = ref.watch(currentUserIdProvider);

      if (userId == null) {
        return [];
      }

      try {
        final supabase = Supabase.instance.client;

        // Check user role
        final profileResponse = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

        final userRole =
            profileResponse?['role']?.toString().toLowerCase() ?? '';

        // Admins, super admins, finance, supervisors, and FOM can see pending withdrawals
        if (userRole.contains('admin') ||
            userRole.contains('super') ||
            userRole.contains('finance') ||
            userRole.contains('supervisor') ||
            userRole.contains('fom')) {
          final response = await supabase
              .from('withdrawal_requests')
              .select('*, profiles!user_id(full_name)')
              .inFilter('status', ['pending', 'supervisor_approved'])
              .order('created_at', ascending: false);

          return (response as List)
              .map(
                (json) =>
                    WithdrawalRequest.fromJson(json as Map<String, dynamic>),
              )
              .toList();
        }

        return [];
      } catch (e) {
        print('[pendingWithdrawalRequestsProvider] Error: $e');
        return [];
      }
    });

// Withdrawal approval notifier for supervisor and finance approval
class WithdrawalApprovalNotifier extends StateNotifier<AsyncValue<void>> {
  final Ref ref;

  WithdrawalApprovalNotifier(this.ref) : super(const AsyncValue.data(null));

  Future<void> supervisorApproveWithdrawal({
    required String requestId,
    required bool approve,
    String? notes,
  }) async {
    state = const AsyncValue.loading();

    try {
      final userId = ref.read(currentUserIdProvider);
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final supabase = Supabase.instance.client;
      final now = DateTime.now().toIso8601String();

      final updateData = <String, dynamic>{
        'status': approve ? 'supervisor_approved' : 'rejected',
        'supervisor_id': userId,
        'supervisor_notes': notes,
        'updated_at': now,
      };
      if (!approve) {
        updateData['rejected_at'] = now;
      }

      await supabase
          .from('withdrawal_requests')
          .update(updateData)
          .eq('id', requestId);

      state = const AsyncValue.data(null);

      // Invalidate related providers
      ref.invalidate(pendingWithdrawalRequestsProvider);
      ref.invalidate(userWithdrawalRequestsProvider);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  Future<void> finalApproveWithdrawal({
    required String requestId,
    required bool approve,
    String? notes,
  }) async {
    state = const AsyncValue.loading();

    try {
      final userId = ref.read(currentUserIdProvider);
      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final supabase = Supabase.instance.client;
      final now = DateTime.now().toIso8601String();

      final updateData = <String, dynamic>{
        'status': approve ? 'approved' : 'rejected',
        'admin_notes': notes,
        'admin_processed_by': userId,
        'admin_processed_at': now,
        'updated_at': now,
      };
      if (approve) {
        updateData['approved_at'] = now;
      } else {
        updateData['rejected_at'] = now;
      }

      await supabase
          .from('withdrawal_requests')
          .update(updateData)
          .eq('id', requestId);

      state = const AsyncValue.data(null);

      // Invalidate related providers
      ref.invalidate(pendingWithdrawalRequestsProvider);
      ref.invalidate(userWithdrawalRequestsProvider);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final withdrawalApprovalProvider =
    StateNotifierProvider.autoDispose<
      WithdrawalApprovalNotifier,
      AsyncValue<void>
    >((ref) {
      return WithdrawalApprovalNotifier(ref);
    });
