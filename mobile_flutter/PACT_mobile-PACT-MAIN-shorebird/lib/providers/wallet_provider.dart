import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/wallet_models.dart';
import '../models/wallet_transaction.dart';
import '../repositories/wallet_repository.dart';
import '../services/wallet_service.dart';

// Repository provider
final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository();
});

// Service provider
final walletServiceProvider = Provider<WalletService>((ref) {
  return WalletService();
});

// Current user ID provider
final currentUserIdProvider = Provider<String?>((ref) {
  return Supabase.instance.client.auth.currentUser?.id;
});

// Wallet provider - gets current user's wallet
final walletProvider = StreamProvider.autoDispose<Wallet?>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value(null);
  }

  final repository = ref.watch(walletRepositoryProvider);
  return repository.watchWallet(userId);
});

// Wallet future provider for one-time fetch
final walletFutureProvider = FutureProvider.autoDispose<Wallet?>((ref) async {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) return null;

  final repository = ref.watch(walletRepositoryProvider);
  return repository.getWallet(userId);
});

// Wallet transactions provider with pagination
final walletTransactionsProvider = StreamProvider.autoDispose
    .family<List<WalletTransaction>, int>((ref, limit) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final repository = ref.watch(walletRepositoryProvider);
  return repository.watchTransactions(userId);
});

// Paginated transactions future provider
final paginatedTransactionsProvider = FutureProvider.autoDispose
    .family<List<WalletTransaction>, TransactionFilter>((ref, filter) async {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) return [];

  final repository = ref.watch(walletRepositoryProvider);
  return repository.getWalletTransactions(
    userId: userId,
    limit: filter.limit,
    offset: filter.offset,
    type: filter.type,
    startDate: filter.startDate,
    endDate: filter.endDate,
  );
});

// Withdrawal requests provider
final withdrawalRequestsProvider =
    StreamProvider.autoDispose<List<WithdrawalRequest>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return Stream.value([]);
  }

  final repository = ref.watch(walletRepositoryProvider);
  return repository.watchWithdrawalRequests(userId);
});

// Wallet stats provider
final walletStatsProvider = FutureProvider.autoDispose<WalletStats>((ref) async {
  final userId = ref.watch(currentUserIdProvider);
  if (userId == null) {
    return WalletStats(
      totalEarned: 0,
      totalWithdrawn: 0,
      currentBalance: 0,
    );
  }

  final repository = ref.watch(walletRepositoryProvider);
  return repository.getWalletStats(userId);
});

// Site visit cost provider
final siteVisitCostProvider = FutureProvider.autoDispose
    .family<SiteVisitCost?, String>((ref, siteVisitId) async {
  final repository = ref.watch(walletRepositoryProvider);
  return repository.getSiteVisitCost(siteVisitId);
});

// Loading state provider
final walletLoadingProvider = StateProvider.autoDispose<bool>((ref) => false);

// Error state provider
final walletErrorProvider = StateProvider.autoDispose<String?>((ref) => null);

// Selected transaction type filter
final selectedTransactionTypeProvider = StateProvider.autoDispose<String?>((ref) => null);

// Transaction search query
final transactionSearchQueryProvider = StateProvider.autoDispose<String>((ref) => '');

// Date range filter
final transactionDateRangeProvider = StateProvider.autoDispose<DateRange?>((ref) => null);

// Filtered transactions provider
final filteredTransactionsProvider = Provider.autoDispose<AsyncValue<List<WalletTransaction>>>((ref) {
  final transactions = ref.watch(walletTransactionsProvider(100));
  final searchQuery = ref.watch(transactionSearchQueryProvider);
  final selectedType = ref.watch(selectedTransactionTypeProvider);
  final dateRange = ref.watch(transactionDateRangeProvider);
  final service = ref.watch(walletServiceProvider);

  return transactions.when(
    data: (txns) {
      var filtered = txns;

      // Filter by type
      if (selectedType != null) {
        filtered = service.filterTransactionsByType(filtered, selectedType);
      }

      // Filter by date range
      if (dateRange != null) {
        filtered = service.filterTransactionsByDateRange(
          filtered,
          dateRange.start,
          dateRange.end,
        );
      }

      // Search
      if (searchQuery.isNotEmpty) {
        filtered = service.searchTransactions(filtered, searchQuery);
      }

      return AsyncValue.data(filtered);
    },
    loading: () => const AsyncValue.loading(),
    error: (error, stack) => AsyncValue.error(error, stack),
  );
});

// Create withdrawal request action
final createWithdrawalRequestProvider = Provider.autoDispose<
    Future<WithdrawalRequest> Function({
  required double amount,
  required String currency,
  String? reason,
  String? paymentMethod,
})>((ref) {
  return ({
    required double amount,
    required String currency,
    String? reason,
    String? paymentMethod,
  }) async {
    final userId = ref.read(currentUserIdProvider);
    if (userId == null) {
      throw WalletException('User not authenticated');
    }

    ref.read(walletLoadingProvider.notifier).state = true;
    ref.read(walletErrorProvider.notifier).state = null;

    try {
      final repository = ref.read(walletRepositoryProvider);
      final request = await repository.createWithdrawalRequest(
        userId: userId,
        amount: amount,
        currency: currency,
        reason: reason,
        paymentMethod: paymentMethod,
      );

      ref.read(walletLoadingProvider.notifier).state = false;
      return request;
    } catch (e) {
      ref.read(walletLoadingProvider.notifier).state = false;
      ref.read(walletErrorProvider.notifier).state = e.toString();
      rethrow;
    }
  };
});

// Refresh wallet action
final refreshWalletProvider = Provider.autoDispose<Future<void> Function()>((ref) {
  return () async {
    ref.invalidate(walletFutureProvider);
    ref.invalidate(walletStatsProvider);
    ref.invalidate(walletTransactionsProvider);
    ref.invalidate(withdrawalRequestsProvider);
  };
});

// Helper classes
class TransactionFilter {
  final int limit;
  final int offset;
  final String? type;
  final DateTime? startDate;
  final DateTime? endDate;

  TransactionFilter({
    this.limit = 20,
    this.offset = 0,
    this.type,
    this.startDate,
    this.endDate,
  });

  TransactionFilter copyWith({
    int? limit,
    int? offset,
    String? type,
    DateTime? startDate,
    DateTime? endDate,
  }) {
    return TransactionFilter(
      limit: limit ?? this.limit,
      offset: offset ?? this.offset,
      type: type ?? this.type,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
    );
  }
}

class DateRange {
  final DateTime start;
  final DateTime end;

  DateRange({required this.start, required this.end});
}
