import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/wallet_models.dart';
import '../models/wallet_transaction.dart';
import '../config/wallet_constants.dart';

class WalletService {
  final supabase = Supabase.instance.client;
  // Currency formatter for SDG
  static final _sdgFormatter = NumberFormat.currency(
    symbol: 'SDG ',
    decimalDigits: 2,
  );

  // Currency formatter for USD
  static final _usdFormatter = NumberFormat.currency(
    symbol: '\$ ',
    decimalDigits: 2,
  );

  // Generic number formatter
  static final _numberFormatter = NumberFormat('#,##0.00');

  // Format currency based on type
  String formatCurrency(double amount, {String currency = 'SDG'}) {
    switch (currency.toUpperCase()) {
      case 'SDG':
        return _sdgFormatter.format(amount);
      case 'USD':
        return _usdFormatter.format(amount);
      default:
        return '$currency ${_numberFormatter.format(amount)}';
    }
  }

  // Format compact currency (e.g., 1.5K, 2.3M)
  String formatCompactCurrency(double amount, {String currency = 'SDG'}) {
    String symbol = currency == 'SDG' ? 'SDG ' : '\$ ';

    if (amount >= 1000000) {
      return '$symbol${(amount / 1000000).toStringAsFixed(1)}M';
    } else if (amount >= 1000) {
      return '$symbol${(amount / 1000).toStringAsFixed(1)}K';
    }
    return formatCurrency(amount, currency: currency);
  }

  // Calculate wallet statistics
  WalletStats calculateWalletStats({
    required Wallet wallet,
    required List<WalletTransaction> transactions,
    required List<WithdrawalRequest> withdrawalRequests,
  }) {
    final pendingWithdrawals = withdrawalRequests
        .where((r) => r.status == 'pending')
        .length;

    final siteVisitCount = transactions
        .where((t) => t.type == 'site_visit_fee')
        .length;

    return WalletStats(
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      pendingWithdrawals: pendingWithdrawals,
      currentBalance: wallet.currentBalance,
      totalTransactions: transactions.length,
      completedSiteVisits: siteVisitCount,
    );
  }

  // Get balance for specific currency
  double getBalance(Wallet wallet, {String currency = 'SDG'}) {
    final balance = wallet.balances[currency];
    if (balance is num) {
      return balance.toDouble();
    }
    return 0.0;
  }

  // Calculate site visit fee based on user classification from database
  Future<double> calculateSiteVisitFeeFromClassification({
    required String userId,
    double complexityMultiplier = 1.0,
  }) async {
    try {
      // Get user's active classification
      final userClassificationResponse = await supabase
          .from('user_classifications')
          .select('classification_level, role_scope')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('effective_from', ascending: false)
          .limit(1)
          .maybeSingle();

      if (userClassificationResponse == null) {
        debugPrint(
          'No active classification found for user $userId, using default fee',
        );
        return 50.0; // Default fallback
      }

      final classificationLevel =
          userClassificationResponse['classification_level'] as String?;
      final roleScope = userClassificationResponse['role_scope'] as String?;

      if (classificationLevel == null || roleScope == null) {
        debugPrint(
          'Invalid classification data for user $userId, using default fee',
        );
        return 50.0;
      }

      // Look up fee structure for this classification
      final feeStructureResponse = await supabase
          .from('classification_fee_structures')
          .select('site_visit_base_fee_cents, complexity_multiplier')
          .eq('classification_level', classificationLevel)
          .eq('role_scope', roleScope)
          .eq('is_active', true)
          .order('valid_from', ascending: false)
          .limit(1)
          .maybeSingle();

      if (feeStructureResponse == null) {
        debugPrint(
          'No fee structure found for $classificationLevel/$roleScope, using default fee',
        );
        return 50.0;
      }

      final baseFee =
          (feeStructureResponse['site_visit_base_fee_cents'] as num?)
              ?.toDouble() ??
          0.0;
      final storedMultiplier =
          (feeStructureResponse['complexity_multiplier'] as num?)?.toDouble() ??
          1.0;

      // Calculate fee: base_fee × stored_multiplier × complexity_multiplier
      final calculatedFee = baseFee * storedMultiplier * complexityMultiplier;

      debugPrint(
        'Fee calculated for $classificationLevel/$roleScope: $baseFee × $storedMultiplier × $complexityMultiplier = $calculatedFee SDG',
      );

      return calculatedFee;
    } catch (e) {
      debugPrint('Error calculating classification fee: $e');
      return 50.0; // Error fallback
    }
  }

  // Legacy method - kept for backward compatibility but deprecated
  double calculateSiteVisitFee({
    required String classification,
    double multiplier = 1.0,
    double transportCost = 0,
    double mealAllowance = 0,
    double accommodationCost = 0,
    double otherCosts = 0,
  }) {
    // Base fees by classification (legacy hardcoded values)
    final baseFees = {
      'A': 5000.0,
      'B': 3000.0,
      'C': 2000.0,
      'D': 1500.0,
      'E': 1000.0,
    };

    final baseFee = baseFees[classification] ?? 1000.0;
    final calculatedFee = baseFee * multiplier;

    return calculatedFee +
        transportCost +
        mealAllowance +
        accommodationCost +
        otherCosts;
  }

  // Validate withdrawal amount
  ValidationResult validateWithdrawalAmount({
    required double amount,
    required double currentBalance,
    double minimumAmount = 100.0,
  }) {
    if (amount <= 0) {
      return ValidationResult.invalid('Amount must be greater than zero');
    }

    if (amount < minimumAmount) {
      return ValidationResult.invalid(
        'Minimum withdrawal amount is ${formatCurrency(minimumAmount)}',
      );
    }

    if (amount > currentBalance) {
      return ValidationResult.invalid(
        'Insufficient balance. Available: ${formatCurrency(currentBalance)}',
      );
    }

    return ValidationResult.valid();
  }

  // Validate payment method
  ValidationResult validatePaymentMethod(String? paymentMethod) {
    if (paymentMethod == null || paymentMethod.isEmpty) {
      return ValidationResult.invalid('Please select a payment method');
    }

    final validMethods = [
      'Bank Transfer',
      'Mobile Money',
      'Cash Pickup',
      'Cryptocurrency',
    ];

    if (!validMethods.contains(paymentMethod)) {
      return ValidationResult.invalid('Invalid payment method');
    }

    return ValidationResult.valid();
  }

  // Transform wallet response from Supabase
  Wallet transformWalletResponse(Map<String, dynamic> data) {
    try {
      // Ensure balances is a map
      if (data['balances'] is! Map) {
        data['balances'] = {'SDG': 0.0};
      }

      // Parse dates
      if (data['created_at'] is String) {
        data['created_at'] = DateTime.parse(data['created_at']);
      }
      if (data['updated_at'] is String) {
        data['updated_at'] = DateTime.parse(data['updated_at']);
      }

      // Ensure numeric values
      data['total_earned'] = (data['total_earned'] ?? 0).toDouble();
      data['total_withdrawn'] = (data['total_withdrawn'] ?? 0).toDouble();

      return Wallet.fromJson(data);
    } catch (e) {
      throw WalletException('Failed to transform wallet response: $e');
    }
  }

  // Filter transactions by type
  List<WalletTransaction> filterTransactionsByType(
    List<WalletTransaction> transactions,
    String? type,
  ) {
    if (type == null || type.isEmpty) return transactions;
    return transactions.where((t) => t.type == type).toList();
  }

  // Filter transactions by date range
  List<WalletTransaction> filterTransactionsByDateRange(
    List<WalletTransaction> transactions,
    DateTime? startDate,
    DateTime? endDate,
  ) {
    var filtered = transactions;

    if (startDate != null) {
      filtered = filtered
          .where(
            (t) =>
                t.createdAt.isAfter(startDate) ||
                t.createdAt.isAtSameMomentAs(startDate),
          )
          .toList();
    }

    if (endDate != null) {
      filtered = filtered
          .where(
            (t) =>
                t.createdAt.isBefore(endDate) ||
                t.createdAt.isAtSameMomentAs(endDate),
          )
          .toList();
    }

    return filtered;
  }

  // Search transactions
  List<WalletTransaction> searchTransactions(
    List<WalletTransaction> transactions,
    String query,
  ) {
    if (query.isEmpty) return transactions;

    final lowerQuery = query.toLowerCase();
    return transactions.where((t) {
      return (t.description?.toLowerCase().contains(lowerQuery) ?? false) ||
          t.type.toLowerCase().contains(lowerQuery) ||
          t.amount.toString().contains(query);
    }).toList();
  }

  // Calculate transaction balance
  double calculateRunningBalance(
    List<WalletTransaction> transactions,
    int upToIndex,
  ) {
    double balance = 0;
    for (int i = 0; i <= upToIndex && i < transactions.length; i++) {
      final transaction = transactions[i];
      if (transaction.isCredit) {
        balance += transaction.amount;
      } else {
        balance -= transaction.amount.abs();
      }
    }
    return balance;
  }

  // Get transaction type color
  String getTransactionTypeColor(String type) {
    switch (type) {
      case 'earning':
      case 'site_visit_fee':
      case 'bonus':
        return '#4CAF50'; // Green
      case 'withdrawal':
        return '#F44336'; // Red
      case 'penalty':
        return '#FF9800'; // Orange
      case 'adjustment':
        return '#2196F3'; // Blue
      default:
        return '#9E9E9E'; // Gray
    }
  }

  // Get withdrawal status color
  String getWithdrawalStatusColor(String status) {
    switch (status) {
      case 'pending':
        return '#FF9800'; // Orange
      case 'approved':
        return '#4CAF50'; // Green
      case 'processed':
        return '#2196F3'; // Blue
      case 'rejected':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Gray
    }
  }

  // Format date for display
  String formatDate(DateTime date, {bool includeTime = false}) {
    if (includeTime) {
      return DateFormat('MMM dd, yyyy hh:mm a').format(date);
    }
    return DateFormat('MMM dd, yyyy').format(date);
  }

  // Format relative time (e.g., "2 days ago")
  String formatRelativeTime(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays > 365) {
      final years = (difference.inDays / 365).floor();
      return '$years ${years == 1 ? 'year' : 'years'} ago';
    } else if (difference.inDays > 30) {
      final months = (difference.inDays / 30).floor();
      return '$months ${months == 1 ? 'month' : 'months'} ago';
    } else if (difference.inDays > 0) {
      return '${difference.inDays} ${difference.inDays == 1 ? 'day' : 'days'} ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} ${difference.inHours == 1 ? 'hour' : 'hours'} ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} ${difference.inMinutes == 1 ? 'minute' : 'minutes'} ago';
    } else {
      return 'Just now';
    }
  }

  // Calculate approval rate
  double calculateApprovalRate(List<WithdrawalRequest> requests) {
    if (requests.isEmpty) return 0;

    final approved = requests
        .where((r) => r.status == 'approved' || r.status == 'processed')
        .length;
    return (approved / requests.length) * 100;
  }

  // Get payment method icon
  String getPaymentMethodIcon(String? method) {
    switch (method) {
      case 'Bank Transfer':
        return '🏦';
      case 'Mobile Money':
        return '📱';
      case 'Cash Pickup':
        return '💵';
      case 'Cryptocurrency':
        return '₿';
      default:
        return '💳';
    }
  }

  // Convert cents to amount
  double centsToAmount(int cents) {
    return cents / 100.0;
  }

  // Convert amount to cents
  int amountToCents(double amount) {
    return (amount * 100).round();
  }

  // ============ SUPABASE DATA ACCESS METHODS ============

  /// Fetch wallet for current user
  Future<Wallet?> fetchWallet() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      final response = await supabase
          .from('wallets')
          .select()
          .eq('user_id', userId)
          .maybeSingle()
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () => throw TimeoutException('Wallet fetch timeout'),
          );

      if (response == null) return null;
      return Wallet.fromJson(response);
    } catch (e) {
      print('Error fetching wallet: $e');
      rethrow;
    }
  }

  /// Fetch transactions for current user with optional filters
  Future<List<WalletTransaction>> fetchTransactions({
    String? type,
    DateTime? startDate,
    DateTime? endDate,
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      var query = supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId);

      if (type != null) {
        query = query.eq('type', type);
      }

      if (startDate != null) {
        query = query.gte('created_at', startDate.toIso8601String());
      }

      if (endDate != null) {
        query = query.lte('created_at', endDate.toIso8601String());
      }

      final response = await query
          .order('created_at', ascending: false)
          .range(offset, offset + limit - 1)
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () =>
                throw TimeoutException('Transactions fetch timeout'),
          );

      return (response as List)
          .map((json) => WalletTransaction.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching transactions: $e');
      rethrow;
    }
  }

  /// Fetch all transactions for current user
  Future<List<WalletTransaction>> fetchAllTransactions() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      final response = await supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () =>
                throw TimeoutException('All transactions fetch timeout'),
          );

      return (response as List)
          .map((json) => WalletTransaction.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching all transactions: $e');
      rethrow;
    }
  }

  /// Fetch withdrawal requests for current user
  Future<List<WithdrawalRequest>> fetchWithdrawalRequests({
    String? status,
    int limit = 100,
    int offset = 0,
  }) async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      var query = supabase
          .from('withdrawal_requests')
          .select()
          .eq('user_id', userId);

      if (status != null) {
        query = query.eq('status', status);
      }

      final response = await query
          .order('created_at', ascending: false)
          .range(offset, offset + limit - 1)
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () =>
                throw TimeoutException('Withdrawal requests fetch timeout'),
          );

      return (response as List)
          .map((json) => WithdrawalRequest.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching withdrawal requests: $e');
      rethrow;
    }
  }

  /// Fetch all withdrawal requests for current user
  Future<List<WithdrawalRequest>> fetchAllWithdrawalRequests() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      final response = await supabase
          .from('withdrawal_requests')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false)
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () =>
                throw TimeoutException('All withdrawal requests fetch timeout'),
          );

      return (response as List)
          .map((json) => WithdrawalRequest.fromJson(json))
          .toList();
    } catch (e) {
      print('Error fetching all withdrawal requests: $e');
      rethrow;
    }
  }

  /// Create a new withdrawal request (matches dashboard WalletContext.tsx createWithdrawalRequest)
  Future<WithdrawalRequest> createWithdrawalRequest({
    required double amount,
    required String requestReason,
    required String paymentMethod,
  }) async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      if (amount <= 0) {
        throw Exception('Withdrawal amount must be greater than 0');
      }

      // Fetch wallet to get wallet_id and validate balance (per dashboard spec)
      final wallet = await fetchWallet();
      if (wallet == null) {
        throw Exception('Wallet not found. Please contact support.');
      }

      if (wallet.id.isEmpty) {
        throw Exception(
          'Invalid wallet configuration. Please contact support.',
        );
      }

      debugPrint('Creating withdrawal request with wallet ID: ${wallet.id}');

      final currentBalance = wallet.currentBalance;
      if (amount > currentBalance) {
        throw Exception(
          'Insufficient balance. Available: ${formatCurrency(currentBalance)}',
        );
      }

      final now = DateTime.now();
      final data = {
        'user_id': userId,
        'wallet_id': wallet.id, // Include wallet_id per dashboard spec
        'amount': amount,
        'currency': DEFAULT_CURRENCY,
        'status': WITHDRAWAL_STATUS_PENDING,
        'request_reason': requestReason,
        'payment_method': paymentMethod,
        'created_at': now.toIso8601String(),
        'updated_at': now.toIso8601String(),
      };

      final response = await supabase
          .from('withdrawal_requests')
          .insert(data)
          .select()
          .single()
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () =>
                throw TimeoutException('Create withdrawal timeout'),
          );

      return WithdrawalRequest.fromJson(response);
    } catch (e) {
      print('Error creating withdrawal request: $e');
      rethrow;
    }
  }

  /// Cancel a withdrawal request
  Future<void> cancelWithdrawalRequest(String withdrawalRequestId) async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      await supabase
          .from('withdrawal_requests')
          .update({
            'status': WITHDRAWAL_STATUS_CANCELLED,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', withdrawalRequestId)
          .eq('user_id', userId)
          .timeout(
            TRANSACTION_FETCH_TIMEOUT,
            onTimeout: () =>
                throw TimeoutException('Cancel withdrawal timeout'),
          );
    } catch (e) {
      print('Error cancelling withdrawal request: $e');
      rethrow;
    }
  }

  /// Fetch wallet statistics
  Future<WalletStats> fetchWalletStats() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) throw Exception('User not authenticated');

      // Fetch wallet to get totals
      final wallet = await fetchWallet();
      if (wallet == null) {
        throw Exception('Wallet not found');
      }

      // Fetch all transactions
      final transactions = await fetchAllTransactions();

      // Fetch all withdrawal requests
      final withdrawalRequests = await fetchAllWithdrawalRequests();

      // Calculate stats
      final totalEarned = wallet.totalEarned;
      final totalWithdrawn = wallet.totalWithdrawn;
      final currentBalance = wallet.currentBalance;
      final totalTransactions = transactions.length;

      // Get actual completed site visits count from mmp_site_entries
      int completedSiteVisits = 0;
      try {
        final completedResponse = await supabase
            .from('mmp_site_entries')
            .select('id')
            .eq('status', 'completed')
            .or('accepted_by.eq.$userId,visit_completed_by.eq.$userId');
        completedSiteVisits = (completedResponse as List).length;
      } catch (e) {
        // Fallback to transaction-based count
        completedSiteVisits = transactions
            .where(
              (t) =>
                  t.type == TRANSACTION_TYPE_SITE_VISIT_FEE ||
                  (t.type == TRANSACTION_TYPE_EARNING && t.siteVisitId != null),
            )
            .length;
      }

      final pendingWithdrawals = withdrawalRequests
          .where((r) => r.status == WITHDRAWAL_STATUS_PENDING)
          .length;

      return WalletStats(
        totalEarned: totalEarned,
        totalWithdrawn: totalWithdrawn,
        pendingWithdrawals: pendingWithdrawals,
        currentBalance: currentBalance,
        totalTransactions: totalTransactions,
        completedSiteVisits: completedSiteVisits,
      );
    } catch (e) {
      print('Error fetching wallet stats: $e');
      rethrow;
    }
  }

  /// Get current user ID
  String? getCurrentUserId() {
    return supabase.auth.currentUser?.id;
  }

  /// Check if user is authenticated
  bool isAuthenticated() {
    return supabase.auth.currentUser != null;
  }
}
