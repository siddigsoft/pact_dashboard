/// Unit tests for wallet provider and business logic
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/config/wallet_constants.dart';
import 'package:pact_mobile/models/wallet_models.dart';
import 'package:pact_mobile/providers/wallet/wallet_notifier.dart';
import 'package:pact_mobile/utils/currency_utils.dart';

void main() {
  group('Currency Utilities', () {
    test('formatCurrency formats double correctly', () {
      final result = formatCurrency(1500.50, 'SDG');
      expect(result, isNotEmpty);
      expect(result, contains('1500'));
    });

    test('parseAmount parses valid string to double', () {
      final result = parseAmount('1234.56');
      expect(result, 1234.56);
    });

    test('parseAmount returns null for invalid string', () {
      final result = parseAmount('invalid');
      expect(result, isNull);
    });

    test('parseAmount returns null for empty string', () {
      final result = parseAmount('');
      expect(result, isNull);
    });

    test('isValidWithdrawalAmount validates correctly', () {
      expect(isValidWithdrawalAmount(500, 1000), true);
      expect(isValidWithdrawalAmount(0, 1000), false);
      expect(isValidWithdrawalAmount(-100, 1000), false);
      expect(isValidWithdrawalAmount(1500, 1000), false);
    });

    test('calculateWithdrawalSuccessRate calculates percentage', () {
      final rate = calculateWithdrawalSuccessRate(8, 10);
      expect(rate, 80.0);
    });

    test('calculateWithdrawalSuccessRate returns 0 for empty withdrawals', () {
      final rate = calculateWithdrawalSuccessRate(0, 0);
      expect(rate, 0.0);
    });
  });

  group('Transaction Search Filters', () {
    test('TransactionSearchFilters copyWith works correctly', () {
      final filters = TransactionSearchFilters(
        searchTerm: 'test',
        type: TRANSACTION_TYPE_EARNING,
      );

      final updated = filters.copyWith(searchTerm: 'updated', minAmount: 100);

      expect(updated.searchTerm, 'updated');
      expect(updated.type, TRANSACTION_TYPE_EARNING);
      expect(updated.minAmount, 100);
    });

    test('TransactionSearchFilters isEmpty detects empty filters', () {
      final emptyFilters = TransactionSearchFilters();
      expect(emptyFilters.isEmpty, true);

      final nonEmptyFilters = TransactionSearchFilters(searchTerm: 'test');
      expect(nonEmptyFilters.isEmpty, false);
    });
  });

  group('Wallet State', () {
    test('WalletState.empty creates empty state', () {
      final state = WalletState.empty();
      expect(state.wallet, isNull);
      expect(state.transactions, isEmpty);
      expect(state.withdrawalRequests, isEmpty);
      expect(state.stats, isNull);
      expect(state.loading, false);
    });

    test('WalletState initializes with correct values', () {
      final wallet = Wallet(
        id: '1',
        userId: 'user1',
        balances: {'SDG': 1000},
        totalEarned: 2000,
        totalWithdrawn: 500,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final state = WalletState(
        wallet: wallet,
        transactions: const [],
        withdrawalRequests: const [],
        loading: false,
      );

      expect(state.wallet, wallet);
      expect(state.loading, false);
    });
  });

  group('Transaction Filtering Logic', () {
    final now = DateTime.now();
    final transactions = [
      WalletTransaction(
        id: '1',
        walletId: 'w1',
        userId: 'u1',
        type: TRANSACTION_TYPE_EARNING,
        amount: 1000,
        currency: DEFAULT_CURRENCY,
        siteVisitId: 'sv1',
        description: 'Site visit fee',
        createdAt: now.subtract(const Duration(days: 2)),
      ),
      WalletTransaction(
        id: '2',
        walletId: 'w1',
        userId: 'u1',
        type: TRANSACTION_TYPE_WITHDRAWAL,
        amount: -500,
        currency: DEFAULT_CURRENCY,
        description: 'Withdrawal request',
        createdAt: now.subtract(const Duration(days: 1)),
      ),
      WalletTransaction(
        id: '3',
        walletId: 'w1',
        userId: 'u1',
        type: TRANSACTION_TYPE_BONUS,
        amount: 100,
        currency: DEFAULT_CURRENCY,
        description: 'Bonus',
        createdAt: now,
      ),
    ];

    test('Filter by transaction type', () {
      final filters = TransactionSearchFilters(type: TRANSACTION_TYPE_EARNING);

      // Simulate filtering logic from provider
      final filtered = transactions
          .where((t) => t.type == filters.type)
          .toList();

      expect(filtered.length, 1);
      expect(filtered.first.type, TRANSACTION_TYPE_EARNING);
    });

    test('Filter by amount range', () {
      final filters = TransactionSearchFilters(minAmount: 100, maxAmount: 1000);

      final filtered = transactions
          .where(
            (t) =>
                t.amount.abs() >= (filters.minAmount ?? 0) &&
                t.amount.abs() <= (filters.maxAmount ?? double.infinity),
          )
          .toList();

      expect(filtered.length, 1);
      expect(filtered.first.amount, 1000);
    });

    test('Search by description', () {
      final filters = TransactionSearchFilters(searchTerm: 'Site visit');

      final filtered = transactions
          .where(
            (t) =>
                (t.description?.toLowerCase().contains(
                  filters.searchTerm?.toLowerCase() ?? '',
                ) ??
                false),
          )
          .toList();

      expect(filtered.length, 1);
      expect(filtered.first.description, contains('Site visit'));
    });

    test('Filter by date range', () {
      final startDate = now.subtract(const Duration(days: 1));
      final endDate = now;

      final filters = TransactionSearchFilters(
        startDate: startDate,
        endDate: endDate,
      );

      final filtered = transactions
          .where(
            (t) =>
                t.createdAt.isAfter(filters.startDate!) &&
                t.createdAt.isBefore(filters.endDate!),
          )
          .toList();

      expect(filtered.length, 1);
      expect(filtered.first.type, TRANSACTION_TYPE_BONUS);
    });
  });

  group('Withdrawal Request Logic', () {
    final now = DateTime.now();
    final withdrawals = [
      WithdrawalRequest(
        id: '1',
        userId: 'u1',
        amount: 500,
        currency: DEFAULT_CURRENCY,
        status: WITHDRAWAL_STATUS_PENDING,
        createdAt: now.subtract(const Duration(days: 2)),
        updatedAt: now.subtract(const Duration(days: 2)),
      ),
      WithdrawalRequest(
        id: '2',
        userId: 'u1',
        amount: 1000,
        currency: DEFAULT_CURRENCY,
        status: WITHDRAWAL_STATUS_APPROVED,
        createdAt: now.subtract(const Duration(days: 1)),
        updatedAt: now.subtract(const Duration(days: 1)),
      ),
      WithdrawalRequest(
        id: '3',
        userId: 'u1',
        amount: 300,
        currency: DEFAULT_CURRENCY,
        status: WITHDRAWAL_STATUS_REJECTED,
        createdAt: now,
        updatedAt: now,
      ),
    ];

    test('Filter pending withdrawals', () {
      final pending = withdrawals
          .where((r) => r.status == WITHDRAWAL_STATUS_PENDING)
          .toList();

      expect(pending.length, 1);
      expect(pending.first.amount, 500);
    });

    test('Filter approved withdrawals', () {
      final approved = withdrawals
          .where((r) => r.status == WITHDRAWAL_STATUS_APPROVED)
          .toList();

      expect(approved.length, 1);
      expect(approved.first.amount, 1000);
    });

    test('Calculate total withdrawn', () {
      final approved = withdrawals
          .where((r) => r.status == WITHDRAWAL_STATUS_APPROVED)
          .toList();

      final total = approved.fold<double>(0, (sum, r) => sum + r.amount);
      expect(total, 1000);
    });

    test('Calculate success rate', () {
      final completed = withdrawals
          .where((r) => r.status == WITHDRAWAL_STATUS_APPROVED)
          .length;

      final rate = (completed / withdrawals.length) * 100;
      expect(rate, isCloseTo(33.33, 0.01));
    });
  });

  group('Earnings By Month Logic', () {
    final now = DateTime.now();
    final transactions = [
      WalletTransaction(
        id: '1',
        walletId: 'w1',
        userId: 'u1',
        type: TRANSACTION_TYPE_EARNING,
        amount: 1000,
        currency: DEFAULT_CURRENCY,
        createdAt: DateTime(now.year, now.month - 1, 15),
      ),
      WalletTransaction(
        id: '2',
        walletId: 'w1',
        userId: 'u1',
        type: TRANSACTION_TYPE_SITE_VISIT_FEE,
        amount: 500,
        currency: DEFAULT_CURRENCY,
        createdAt: DateTime(now.year, now.month - 1, 20),
      ),
      WalletTransaction(
        id: '3',
        walletId: 'w1',
        userId: 'u1',
        type: TRANSACTION_TYPE_EARNING,
        amount: 800,
        currency: DEFAULT_CURRENCY,
        createdAt: DateTime(now.year, now.month, 10),
      ),
    ];

    test('Group earnings by month', () {
      final monthlyData = <String, double>{};

      transactions
          .where(
            (t) =>
                t.type == TRANSACTION_TYPE_EARNING ||
                t.type == TRANSACTION_TYPE_SITE_VISIT_FEE,
          )
          .forEach((t) {
            // Mock month parsing - in real code uses DateFormat
            final month = '${t.createdAt.month}/${t.createdAt.year}';
            monthlyData[month] = (monthlyData[month] ?? 0) + t.amount;
          });

      expect(monthlyData.length, 2);
      expect(monthlyData.values.reduce((a, b) => a + b), 2300);
    });
  });
}
