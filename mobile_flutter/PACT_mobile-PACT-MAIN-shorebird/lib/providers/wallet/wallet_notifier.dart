/// Enhanced wallet provider with memoized filtering and all TSX functionality
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../models/wallet_models.dart';
import '../services/wallet_service.dart';
import '../config/wallet_constants.dart';

/// Filter model for advanced search matching TSX SearchFilters
class TransactionSearchFilters {
  final String? searchTerm;
  final String? type;
  final double? minAmount;
  final double? maxAmount;
  final DateTime? startDate;
  final DateTime? endDate;

  TransactionSearchFilters({
    this.searchTerm,
    this.type,
    this.minAmount,
    this.maxAmount,
    this.startDate,
    this.endDate,
  });

  TransactionSearchFilters copyWith({
    String? searchTerm,
    String? type,
    double? minAmount,
    double? maxAmount,
    DateTime? startDate,
    DateTime? endDate,
  }) {
    return TransactionSearchFilters(
      searchTerm: searchTerm ?? this.searchTerm,
      type: type ?? this.type,
      minAmount: minAmount ?? this.minAmount,
      maxAmount: maxAmount ?? this.maxAmount,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
    );
  }

  bool get isEmpty =>
      searchTerm == null &&
      type == null &&
      minAmount == null &&
      maxAmount == null &&
      startDate == null &&
      endDate == null;
}

/// Wallet state notifier matching TSX context
class WalletNotifier extends AsyncNotifier<WalletState> {
  late WalletService _service;

  @override
  Future<WalletState> build() async {
    _service = ref.watch(walletServiceProvider);

    if (!_service.isAuthenticated()) {
      return WalletState.empty();
    }

    try {
      final wallet = await _service.fetchWallet();
      final transactions = await _service.fetchAllTransactions();
      final withdrawalRequests = await _service.fetchAllWithdrawalRequests();
      final stats = await _service.fetchWalletStats();

      return WalletState(
        wallet: wallet,
        transactions: transactions,
        withdrawalRequests: withdrawalRequests,
        stats: stats,
        loading: false,
      );
    } catch (e) {
      print('Error loading wallet: $e');
      rethrow;
    }
  }

  /// Get balance for specific currency
  double getBalance(String currency) {
    if (state.asData?.value.wallet == null) return 0.0;
    return _service.getBalance(state.asData!.value.wallet!, currency: currency);
  }

  /// Create withdrawal request
  Future<void> createWithdrawalRequest(
    double amount,
    String requestReason,
    String paymentMethod,
  ) async {
    try {
      await _service.createWithdrawalRequest(
        amount: amount,
        requestReason: requestReason,
        paymentMethod: paymentMethod,
      );
      // Refresh wallet state
      await refresh();
    } catch (e) {
      print('Error creating withdrawal request: $e');
      rethrow;
    }
  }

  /// Cancel withdrawal request
  Future<void> cancelWithdrawalRequest(String withdrawalRequestId) async {
    try {
      await _service.cancelWithdrawalRequest(withdrawalRequestId);
      // Refresh wallet state
      await refresh();
    } catch (e) {
      print('Error cancelling withdrawal request: $e');
      rethrow;
    }
  }

  /// Refresh wallet data
  Future<void> refreshWallet() async {
    await refresh();
  }

  /// Refresh transactions
  Future<void> refreshTransactions() async {
    await refresh();
  }

  /// Refresh withdrawal requests
  Future<void> refreshWithdrawalRequests() async {
    await refresh();
  }

  /// Refresh all data
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_build);
  }

  Future<WalletState> _build() async {
    if (!_service.isAuthenticated()) {
      return WalletState.empty();
    }

    try {
      final wallet = await _service.fetchWallet();
      final transactions = await _service.fetchAllTransactions();
      final withdrawalRequests = await _service.fetchAllWithdrawalRequests();
      final stats = await _service.fetchWalletStats();

      return WalletState(
        wallet: wallet,
        transactions: transactions,
        withdrawalRequests: withdrawalRequests,
        stats: stats,
        loading: false,
      );
    } catch (e) {
      print('Error refreshing wallet: $e');
      rethrow;
    }
  }
}

/// Wallet state model
class WalletState {
  final Wallet? wallet;
  final List<WalletTransaction> transactions;
  final List<WithdrawalRequest> withdrawalRequests;
  final WalletStats? stats;
  final bool loading;

  WalletState({
    this.wallet,
    this.transactions = const [],
    this.withdrawalRequests = const [],
    this.stats,
    this.loading = false,
  });

  factory WalletState.empty() => const WalletState();
}

// Providers
final walletServiceProvider = Provider((ref) => WalletService());

final walletNotifierProvider =
    AsyncNotifierProvider<WalletNotifier, WalletState>(() => WalletNotifier());

/// Filter state for transaction search
final transactionSearchFiltersProvider =
    StateProvider<TransactionSearchFilters>(
      (ref) => TransactionSearchFilters(),
    );

/// Quick filter states
final transactionTypeFilterProvider = StateProvider<String>((ref) => 'all');
final dateRangeFilterProvider = StateProvider<String>((ref) => 'all');
final withdrawalStatusFilterProvider = StateProvider<String>(
  (ref) => WITHDRAWAL_STATUS_PENDING,
);

/// Filtered transactions with memoization matching TSX logic
final filteredTransactionsProvider = Provider<List<WalletTransaction>>((ref) {
  final state = ref.watch(walletNotifierProvider);
  final searchFilters = ref.watch(transactionSearchFiltersProvider);
  final transactionTypeFilter = ref.watch(transactionTypeFilterProvider);
  final dateRangeFilter = ref.watch(dateRangeFilterProvider);

  return state.whenData((walletState) {
        var filtered = List<WalletTransaction>.from(walletState.transactions);

        // Apply advanced search filters
        if (searchFilters.searchTerm != null &&
            searchFilters.searchTerm!.isNotEmpty) {
          final term = searchFilters.searchTerm!.toLowerCase();
          filtered = filtered.where((t) {
            return (t.description?.toLowerCase().contains(term) ?? false) ||
                t.id.toLowerCase().contains(term) ||
                (t.siteVisitId?.toLowerCase().contains(term) ?? false);
          }).toList();
        }

        if (searchFilters.type != null) {
          filtered = filtered
              .where((t) => t.type == searchFilters.type)
              .toList();
        }

        if (searchFilters.minAmount != null) {
          filtered = filtered
              .where((t) => t.amount.abs() >= searchFilters.minAmount!)
              .toList();
        }

        if (searchFilters.maxAmount != null) {
          filtered = filtered
              .where((t) => t.amount.abs() <= searchFilters.maxAmount!)
              .toList();
        }

        if (searchFilters.startDate != null) {
          final startDate = searchFilters.startDate!;
          filtered = filtered
              .where((t) => t.createdAt.isAfter(startDate))
              .toList();
        }

        if (searchFilters.endDate != null) {
          final endDate = searchFilters.endDate!;
          final endDateTime = DateTime(
            endDate.year,
            endDate.month,
            endDate.day,
            23,
            59,
            59,
            999,
          );
          filtered = filtered
              .where((t) => t.createdAt.isBefore(endDateTime))
              .toList();
        }

        // Legacy quick filters
        if (transactionTypeFilter != 'all' && searchFilters.type == null) {
          if (transactionTypeFilter == TRANSACTION_TYPE_EARNING) {
            filtered = filtered
                .where(
                  (t) =>
                      t.type == TRANSACTION_TYPE_EARNING ||
                      t.type == TRANSACTION_TYPE_SITE_VISIT_FEE,
                )
                .toList();
          } else {
            filtered = filtered
                .where((t) => t.type == transactionTypeFilter)
                .toList();
          }
        }

        if (dateRangeFilter != 'all' &&
            searchFilters.startDate == null &&
            searchFilters.endDate == null) {
          final now = DateTime.now();
          late DateTime startDate;
          late DateTime endDate;

          switch (dateRangeFilter) {
            case DATE_FILTER_THIS_MONTH:
              startDate = DateTime(now.year, now.month, 1);
              endDate = DateTime(now.year, now.month + 1, 0, 23, 59, 59, 999);
              break;
            case DATE_FILTER_LAST_MONTH:
              final lastMonth = DateTime(now.year, now.month - 1);
              startDate = DateTime(lastMonth.year, lastMonth.month, 1);
              endDate = DateTime(
                lastMonth.year,
                lastMonth.month + 1,
                0,
                23,
                59,
                59,
                999,
              );
              break;
            case DATE_FILTER_LAST_3_MONTHS:
              startDate = now.subtract(const Duration(days: 90));
              endDate = now;
              break;
            default:
              return filtered;
          }

          filtered = filtered
              .where(
                (t) =>
                    t.createdAt.isAfter(startDate) &&
                    t.createdAt.isBefore(endDate),
              )
              .toList();
        }

        return filtered;
      }).value ??
      [];
});

/// Earnings by month (last 6 months) with memoization
final earningsByMonthProvider = Provider<List<MapEntry<String, double>>>((ref) {
  final state = ref.watch(walletNotifierProvider);

  return state.whenData((walletState) {
        final monthlyData = <String, double>{};

        walletState.transactions
            .where(
              (t) =>
                  t.type == TRANSACTION_TYPE_EARNING ||
                  t.type == TRANSACTION_TYPE_SITE_VISIT_FEE,
            )
            .forEach((t) {
              final month = DateFormat('MMM yyyy').format(t.createdAt);
              monthlyData[month] = (monthlyData[month] ?? 0) + t.amount;
            });

        final sorted = monthlyData.entries.toList()
          ..sort(
            (a, b) => _parseMonthYear(a.key).compareTo(_parseMonthYear(b.key)),
          );

        // Return last 6 months
        return sorted.length > EARNINGS_MONTHS_LIMIT
            ? sorted.sublist(sorted.length - EARNINGS_MONTHS_LIMIT)
            : sorted;
      }).value ??
      [];
});

/// Recent site visit earnings (latest 10)
final siteVisitEarningsProvider = Provider<List<WalletTransaction>>((ref) {
  final state = ref.watch(walletNotifierProvider);

  return state.whenData((walletState) {
        return walletState.transactions
            .where(
              (t) =>
                  (t.type == TRANSACTION_TYPE_EARNING ||
                      t.type == TRANSACTION_TYPE_SITE_VISIT_FEE) &&
                  t.siteVisitId != null,
            )
            .take(SITE_VISIT_EARNINGS_LIMIT)
            .toList();
      }).value ??
      [];
});

/// Pending withdrawals
final pendingWithdrawalsProvider = Provider<List<WithdrawalRequest>>((ref) {
  final state = ref.watch(walletNotifierProvider);

  return state.whenData((walletState) {
        return walletState.withdrawalRequests
            .where((r) => r.status == WITHDRAWAL_STATUS_PENDING)
            .toList();
      }).value ??
      [];
});

/// Completed (approved) withdrawals
final completedWithdrawalsProvider = Provider<List<WithdrawalRequest>>((ref) {
  final state = ref.watch(walletNotifierProvider);

  return state.whenData((walletState) {
        return walletState.withdrawalRequests
            .where((r) => r.status == WITHDRAWAL_STATUS_APPROVED)
            .toList();
      }).value ??
      [];
});

/// Rejected withdrawals
final rejectedWithdrawalsProvider = Provider<List<WithdrawalRequest>>((ref) {
  final state = ref.watch(walletNotifierProvider);

  return state.whenData((walletState) {
        return walletState.withdrawalRequests
            .where((r) => r.status == WITHDRAWAL_STATUS_REJECTED)
            .toList();
      }).value ??
      [];
});

/// Display withdrawals based on status filter
final displayWithdrawalsProvider = Provider<List<WithdrawalRequest>>((ref) {
  final statusFilter = ref.watch(withdrawalStatusFilterProvider);
  final allWithdrawals = ref.watch(walletNotifierProvider);
  final pending = ref.watch(pendingWithdrawalsProvider);
  final completed = ref.watch(completedWithdrawalsProvider);
  final rejected = ref.watch(rejectedWithdrawalsProvider);

  switch (statusFilter) {
    case WITHDRAWAL_STATUS_PENDING:
      return pending;
    case WITHDRAWAL_STATUS_APPROVED:
      return completed;
    case WITHDRAWAL_STATUS_REJECTED:
      return rejected;
    default:
      return allWithdrawals
              .whenData((state) => state.withdrawalRequests)
              .value ??
          [];
  }
});

/// Withdrawal success rate calculation
final withdrawalSuccessRateProvider = Provider<double>((ref) {
  final state = ref.watch(walletNotifierProvider);

  return state.whenData((walletState) {
        if (walletState.withdrawalRequests.isEmpty) return 0.0;
        final completed = walletState.withdrawalRequests
            .where((r) => r.status == WITHDRAWAL_STATUS_APPROVED)
            .length;
        return (completed / walletState.withdrawalRequests.length) * 100;
      }).value ??
      0.0;
});

/// Helper to parse month year string
DateTime _parseMonthYear(String monthYear) {
  try {
    return DateFormat('MMM yyyy').parse(monthYear);
  } catch (e) {
    return DateTime.now();
  }
}
