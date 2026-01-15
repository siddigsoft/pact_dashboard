import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/wallet_models.dart';
import '../repositories/wallet_repository.dart';

// Withdrawal repository provider
final withdrawalRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository();
});

// Current user ID provider
final currentUserIdProvider = Provider<String?>((ref) {
  return Supabase.instance.client.auth.currentUser?.id;
});

// Provider for user's withdrawal requests
final userWithdrawalRequestsProvider = StreamProvider.autoDispose<List<WithdrawalRequest>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final repository = ref.watch(withdrawalRepositoryProvider);
  return repository.watchWithdrawalRequests(userId);
});

// Create withdrawal request provider
class CreateWithdrawalNotifier extends StateNotifier<AsyncValue<WithdrawalRequest?>> {
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

final createWithdrawalProvider = StateNotifierProvider.autoDispose<CreateWithdrawalNotifier, AsyncValue<WithdrawalRequest?>>((ref) {
  return CreateWithdrawalNotifier(ref);
});