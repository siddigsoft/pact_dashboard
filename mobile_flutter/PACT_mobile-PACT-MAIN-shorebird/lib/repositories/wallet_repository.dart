import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../models/wallet_models.dart';
import '../models/wallet_transaction.dart';
import '../models/down_payment_request.dart';
import '../services/offline_data_service.dart';

class WalletRepository {
  final SupabaseClient _supabase = Supabase.instance.client;
  final OfflineDataService _offlineDataService = OfflineDataService();

  /// Check if device is online
  Future<bool> _isOnline() async {
    try {
      final result = await Connectivity().checkConnectivity();
      return !result.contains(ConnectivityResult.none);
    } catch (e) {
      return false;
    }
  }

  // Get current user's wallet
  Future<Wallet?> getWallet(String userId) async {
    try {
      // Check if online
      if (!(await _isOnline())) {
        return _getWalletFromCache(userId);
      }

      final response = await _supabase
          .from('wallets')
          .select()
          .eq('user_id', userId)
          .maybeSingle();

      if (response == null) {
        // Create wallet if doesn't exist
        return await _createWallet(userId);
      }

      final wallet = Wallet.fromJson(response);

      // Cache for offline use
      await _offlineDataService.cacheWalletData(userId, response);

      return wallet;
    } catch (e) {
      // Try cache on error
      debugPrint('Error fetching wallet: $e - trying cache');
      final cachedWallet = await _getWalletFromCache(userId);
      if (cachedWallet != null) return cachedWallet;
      throw WalletException('Failed to fetch wallet: $e');
    }
  }

  Future<Wallet?> _getWalletFromCache(String userId) async {
    final cachedData = await _offlineDataService.getCachedWalletData(userId);
    if (cachedData != null) {
      debugPrint('📦 Returning cached wallet data');
      return Wallet.fromJson(cachedData);
    }
    return null;
  }

  // Create new wallet for user
  Future<Wallet> _createWallet(String userId) async {
    try {
      final response = await _supabase
          .from('wallets')
          .insert({
            'user_id': userId,
            'balances': {'SDG': 0},
            'total_earned': 0,
            'total_withdrawn': 0,
            'currency': 'SDG',
          })
          .select()
          .single();

      return Wallet.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to create wallet: $e');
    }
  }

  /// Check if a fee transaction already exists for a site visit
  /// Uses deduplication strategy: checks both site_visit_id and reference_id
  /// Returns true if any matching fee transaction found
  Future<bool> hasExistingFeeTransaction({
    required String siteVisitId,
    String? referenceId,
  }) async {
    try {
      final List<dynamic> response;

      if (referenceId != null && referenceId.isNotEmpty) {
        // Check both site_visit_id and reference_id
        response = await _supabase
            .from('wallet_transactions')
            .select('id')
            .or('site_visit_id.eq.$siteVisitId,reference_id.eq.$referenceId')
            .inFilter('type', ['earning', 'site_visit_fee']);
      } else {
        // Check only site_visit_id
        response = await _supabase
            .from('wallet_transactions')
            .select('id')
            .eq('site_visit_id', siteVisitId)
            .inFilter('type', ['earning', 'site_visit_fee']);
      }

      return response.isNotEmpty;
    } catch (e) {
      // Fail-safe: if query fails, don't proceed with insertion
      throw WalletException('Deduplication check failed: $e');
    }
  }

  /// Create a site visit fee transaction with deduplication
  /// Only creates transaction if no existing fee found
  /// Returns the created transaction or throws WalletException
  Future<WalletTransaction> createSiteVisitTransaction({
    required String userId,
    required String siteVisitId,
    required double amount,
    String? description,
    String? referenceId,
  }) async {
    try {
      // CRITICAL: Check for existing transaction first
      final existingTransaction = await hasExistingFeeTransaction(
        siteVisitId: siteVisitId,
        referenceId: referenceId,
      );

      if (existingTransaction) {
        throw WalletException(
          'Site visit fee transaction already exists for visit $siteVisitId',
        );
      }

      // Get wallet
      final wallet = await getWallet(userId);
      if (wallet == null) {
        throw WalletException('Wallet not found for user $userId');
      }

      final amountCents = (amount * 100).round();
      final balanceBefore = wallet.currentBalance;
      final balanceAfter = balanceBefore + amount;

      // Create the fee transaction
      final transactionResponse = await _supabase
          .from('wallet_transactions')
          .insert({
            'wallet_id': wallet.id,
            'user_id': userId,
            'type': 'site_visit_fee',
            'amount': amount,
            'amount_cents': amountCents,
            'currency': 'SDG',
            'site_visit_id': siteVisitId,
            'reference_id': referenceId ?? siteVisitId,
            'reference_type': 'site_visit',
            'description': description ?? 'Site visit completion fee',
            'balance_before': balanceBefore,
            'balance_after': balanceAfter,
            'created_at': DateTime.now().toIso8601String(),
          })
          .select()
          .single();

      return WalletTransaction.fromJson(transactionResponse);
    } catch (e) {
      if (e is WalletException) rethrow;
      throw WalletException('Failed to create site visit transaction: $e');
    }
  }

  /// High-level operation: Process visit payment with dedup checks and wallet update
  /// Handles complete visit → fee creation → wallet balance update
  Future<void> processVisitPayment({
    required String userId,
    required String siteVisitId,
    required double enumeratorFee,
    required double transportFee,
    String? referenceId,
  }) async {
    try {
      final wallet = await getWallet(userId);
      if (wallet == null) {
        throw WalletException('Wallet not found');
      }

      final totalFee = enumeratorFee + transportFee;
      if (totalFee <= 0) {
        return; // No fee to process
      }

      // Create fee transaction with dedup check
      final transaction = await createSiteVisitTransaction(
        userId: userId,
        siteVisitId: siteVisitId,
        amount: totalFee,
        description:
            'Enumerator fee: $enumeratorFee, Transport fee: $transportFee',
        referenceId: referenceId,
      );

      // Update wallet balance atomically
      final balanceAfter = wallet.currentBalance + totalFee;
      final updateResponse = await _supabase
          .from('wallets')
          .update({
            'balances': {'SDG': balanceAfter},
            'total_earned': wallet.totalEarned + totalFee,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', wallet.id)
          .select()
          .single();
    } catch (e) {
      if (e is WalletException) rethrow;
      throw WalletException('Failed to process visit payment: $e');
    }
  }

  /// Update wallet balance atomically
  Future<Wallet> updateWalletBalance({
    required String walletId,
    required double amountDelta,
  }) async {
    try {
      final wallet = await _supabase
          .from('wallets')
          .select()
          .eq('id', walletId)
          .single();

      final currentWallet = Wallet.fromJson(wallet);
      final newBalance = currentWallet.currentBalance + amountDelta;

      final response = await _supabase
          .from('wallets')
          .update({
            'balances': {'SDG': newBalance},
            'total_earned': currentWallet.totalEarned + amountDelta,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', walletId)
          .select()
          .single();

      return Wallet.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to update wallet balance: $e');
    }
  }

  // Get wallet transactions with pagination
  Future<List<WalletTransaction>> getWalletTransactions({
    required String userId,
    int limit = 20,
    int offset = 0,
    String? type,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      dynamic query = _supabase
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
          .range(offset, offset + limit - 1);

      return (response as List)
          .map((json) => WalletTransaction.fromJson(json))
          .toList();
    } catch (e) {
      throw WalletException('Failed to fetch transactions: $e');
    }
  }

  // Get withdrawal requests
  Future<List<WithdrawalRequest>> getWithdrawalRequests(String userId) async {
    try {
      final response = await _supabase
          .from('withdrawal_requests')
          .select()
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => WithdrawalRequest.fromJson(json))
          .toList();
    } catch (e) {
      throw WalletException('Failed to fetch withdrawal requests: $e');
    }
  }

  // Create withdrawal request
  Future<WithdrawalRequest> createWithdrawalRequest({
    required String userId,
    required double amount,
    required String currency,
    String? reason,
    String? paymentMethod,
  }) async {
    try {
      // Check balance first
      final wallet = await getWallet(userId);
      if (wallet == null) {
        throw WithdrawalException('Wallet not found');
      }

      if (wallet.currentBalance < amount) {
        throw InsufficientBalanceException(
          'Insufficient balance. Available: ${wallet.currentBalance} $currency',
        );
      }

      final response = await _supabase
          .from('withdrawal_requests')
          .insert({
            'user_id': userId,
            'wallet_id': wallet.id,
            'amount': amount,
            'currency': currency,
            'request_reason': reason, // Web uses request_reason, not reason
            'payment_method': paymentMethod,
            'status': 'pending',
            'created_at': DateTime.now().toIso8601String(),
          })
          .select()
          .single();

      return WithdrawalRequest.fromJson(response);
    } catch (e) {
      if (e is InsufficientBalanceException) rethrow;
      throw WithdrawalException('Failed to create withdrawal request: $e');
    }
  }

  // Get site visit cost
  Future<SiteVisitCost?> getSiteVisitCost(String siteVisitId) async {
    try {
      final response = await _supabase
          .from('site_visit_costs')
          .select()
          .eq('site_visit_id', siteVisitId)
          .maybeSingle();

      if (response == null) return null;

      return SiteVisitCost.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to fetch site visit cost: $e');
    }
  }

  // Create or update site visit cost
  Future<SiteVisitCost> upsertSiteVisitCost({
    required String siteVisitId,
    required double transportationCost,
    required double accommodationCost,
    required double mealAllowance,
    required double otherCosts,
    String? classificationLevel,
    double? complexityMultiplier,
    String? assignedBy,
    String? costNotes,
  }) async {
    try {
      final totalCost =
          transportationCost + accommodationCost + mealAllowance + otherCosts;

      final baseFeeCents = (totalCost * 100).round();

      final response = await _supabase
          .from('site_visit_costs')
          .upsert({
            'site_visit_id': siteVisitId,
            'transportation_cost': transportationCost,
            'accommodation_cost': accommodationCost,
            'meal_allowance': mealAllowance,
            'other_costs': otherCosts,
            'total_cost': totalCost,
            'currency': 'SDG',
            'classification_level': classificationLevel,
            'base_fee_cents': baseFeeCents,
            'complexity_multiplier': complexityMultiplier ?? 1.0,
            'assigned_by': assignedBy,
            'cost_notes': costNotes,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .select()
          .single();

      return SiteVisitCost.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to update site visit cost: $e');
    }
  }

  // Get wallet stats
  Future<WalletStats> getWalletStats(String userId) async {
    try {
      final wallet = await getWallet(userId);
      if (wallet == null) {
        return WalletStats(
          totalEarned: 0,
          totalWithdrawn: 0,
          pendingWithdrawals: 0,
          currentBalance: 0,
          totalTransactions: 0,
          completedSiteVisits: 0,
        );
      }

      // Get pending withdrawals
      final withdrawalRequests = await getWithdrawalRequests(userId);
      final pendingWithdrawals = withdrawalRequests
          .where((r) => r.status == 'pending')
          .length;

      // Get transaction count
      final List<WalletTransaction> transactions = await getWalletTransactions(
        userId: userId,
        limit: 1000,
      );

      // Get completed site visits
      final siteVisitTransactions = transactions
          .where((t) => t.type == 'site_visit_fee')
          .length;

      final stats = WalletStats(
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn,
        pendingWithdrawals: pendingWithdrawals,
        currentBalance: wallet.currentBalance,
        totalTransactions: transactions.length,
        completedSiteVisits: siteVisitTransactions,
      );

      // Cache stats for offline use
      await _offlineDataService.cacheWalletStats(userId, {
        'totalEarned': stats.totalEarned,
        'totalWithdrawn': stats.totalWithdrawn,
        'pendingWithdrawals': stats.pendingWithdrawals,
        'currentBalance': stats.currentBalance,
        'totalTransactions': stats.totalTransactions,
        'completedSiteVisits': stats.completedSiteVisits,
      });

      return stats;
    } catch (e) {
      // Try cache on error
      debugPrint('Error calculating wallet stats: $e - trying cache');
      final cachedStats = await _getWalletStatsFromCache(userId);
      if (cachedStats != null) return cachedStats;
      throw WalletException('Failed to calculate wallet stats: $e');
    }
  }

  Future<WalletStats?> _getWalletStatsFromCache(String userId) async {
    final cachedData = await _offlineDataService.getCachedWalletStats(userId);
    if (cachedData != null) {
      debugPrint('📦 Returning cached wallet stats');
      return WalletStats(
        totalEarned: (cachedData['totalEarned'] as num?)?.toDouble() ?? 0,
        totalWithdrawn: (cachedData['totalWithdrawn'] as num?)?.toDouble() ?? 0,
        pendingWithdrawals: cachedData['pendingWithdrawals'] as int? ?? 0,
        currentBalance: (cachedData['currentBalance'] as num?)?.toDouble() ?? 0,
        totalTransactions: cachedData['totalTransactions'] as int? ?? 0,
        completedSiteVisits: cachedData['completedSiteVisits'] as int? ?? 0,
      );
    }
    return null;
  }

  // Real-time stream for wallet updates
  Stream<Wallet?> watchWallet(String userId) {
    return _supabase
        .from('wallets')
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .map((data) {
          if (data.isEmpty) return null;
          return Wallet.fromJson(data.first);
        });
  }

  // Real-time stream for transactions
  Stream<List<WalletTransaction>> watchTransactions(String userId) {
    return _supabase
        .from('wallet_transactions')
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .map(
          (data) =>
              data.map((json) => WalletTransaction.fromJson(json)).toList(),
        );
  }

  // Real-time stream for withdrawal requests
  Stream<List<WithdrawalRequest>> watchWithdrawalRequests(String userId) {
    return _supabase
        .from('withdrawal_requests')
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .map(
          (data) =>
              data.map((json) => WithdrawalRequest.fromJson(json)).toList(),
        );
  }

  // Search transactions
  Future<List<WalletTransaction>> searchTransactions({
    required String userId,
    String? query,
    String? type,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      dynamic dbQuery = _supabase
          .from('wallet_transactions')
          .select()
          .eq('user_id', userId);

      if (type != null) {
        dbQuery = dbQuery.eq('type', type);
      }

      if (startDate != null) {
        dbQuery = dbQuery.gte('created_at', startDate.toIso8601String());
      }

      if (endDate != null) {
        dbQuery = dbQuery.lte('created_at', endDate.toIso8601String());
      }

      final response = await dbQuery.order('created_at', ascending: false);
      var transactions = (response as List)
          .map((json) => WalletTransaction.fromJson(json))
          .toList();

      // Filter by query if provided
      if (query != null && query.isNotEmpty) {
        transactions = transactions.where((t) {
          return (t.description?.toLowerCase().contains(query.toLowerCase()) ??
                  false) ||
              t.type.toLowerCase().contains(query.toLowerCase());
        }).toList();
      }

      return transactions;
    } catch (e) {
      throw WalletException('Failed to search transactions: $e');
    }
  }

  // ============================================================================
  // DOWN PAYMENT REQUEST METHODS
  // ============================================================================

  /// Create a new down payment request
  /// Only data collectors can create requests for their accepted site visits
  Future<DownPaymentRequest> createDownPaymentRequest({
    required String userId,
    required String siteVisitId,
    required String mmpSiteEntryId,
    required String siteName,
    required String requesterRole,
    String? hubId,
    String? hubName,
    required double totalTransportationBudget,
    required double requestedAmount,
    required String paymentType,
    List<InstallmentPlan>? installmentPlan,
    required String justification,
    List<String>? supportingDocuments,
  }) async {
    try {
      // Validate that the user is a data collector/coordinator
      final userProfile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

      final userRole = userProfile['role'] as String;
      if (![
        'dataCollector',
        'datacollector',
        'coordinator',
      ].contains(userRole)) {
        throw WalletException(
          'Only data collectors and coordinators can request down payments',
        );
      }

      // Validate that the site visit exists and is accepted
      // Note: mmp_site_entries uses 'accepted_by' column, not 'user_id'
      final siteVisit = await _supabase
          .from('mmp_site_entries')
          .select('status, accepted_by')
          .eq('id', siteVisitId)
          .single();

      final status = (siteVisit['status'] as String?)?.toLowerCase() ?? '';
      if (!status.startsWith('accept')) {
        throw WalletException(
          'Can only request down payment for accepted site visits',
        );
      }

      if (siteVisit['accepted_by'] != userId) {
        throw WalletException(
          'Can only request down payment for sites assigned to you',
        );
      }

      // Check if a request already exists for this site visit
      final existingRequest = await _supabase
          .from('down_payment_requests')
          .select('id')
          .eq('site_visit_id', siteVisitId)
          .eq('requested_by', userId)
          .inFilter('status', [
            'pending_supervisor',
            'pending_admin',
            'approved',
            'partially_paid',
          ])
          .maybeSingle();

      if (existingRequest != null) {
        throw WalletException(
          'A down payment request already exists for this site visit',
        );
      }

      // Validate requested amount doesn't exceed transportation budget
      if (requestedAmount > totalTransportationBudget) {
        throw WalletException(
          'Requested amount cannot exceed transportation budget',
        );
      }

      final requestData = {
        'site_visit_id': siteVisitId,
        'mmp_site_entry_id': mmpSiteEntryId,
        'site_name': siteName,
        'requested_by': userId,
        'requester_role': requesterRole,
        'hub_id': hubId,
        'hub_name': hubName,
        'total_transportation_budget': totalTransportationBudget,
        'requested_amount': requestedAmount,
        'payment_type': paymentType,
        'installment_plan':
            installmentPlan
                ?.map(
                  (plan) => {
                    'installment_number': plan.installmentNumber,
                    'amount': plan.amount,
                    'due_date': plan.dueDate.toIso8601String(),
                    'description': plan.description,
                  },
                )
                .toList() ??
            [],
        'justification': justification,
        'supporting_documents': supportingDocuments ?? [],
        'status': 'pending_supervisor',
      };

      final response = await _supabase
          .from('down_payment_requests')
          .insert(requestData)
          .select()
          .single();

      return DownPaymentRequest.fromJson(response);
    } catch (e) {
      if (e is WalletException) rethrow;
      throw WalletException('Failed to create down payment request: $e');
    }
  }

  /// Get down payment requests for current user
  Future<List<DownPaymentRequest>> getUserDownPaymentRequests(
    String userId,
  ) async {
    try {
      final response = await _supabase
          .from('down_payment_requests')
          .select()
          .eq('requested_by', userId)
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => DownPaymentRequest.fromJson(json))
          .toList();
    } catch (e) {
      throw WalletException('Failed to fetch down payment requests: $e');
    }
  }

  /// Get down payment requests for supervisor approval
  Future<List<DownPaymentRequest>> getSupervisorDownPaymentRequests(
    String supervisorId,
  ) async {
    try {
      final response = await _supabase
          .from('down_payment_requests')
          .select()
          .eq('supervisor_id', supervisorId)
          .eq('status', 'pending_supervisor')
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => DownPaymentRequest.fromJson(json))
          .toList();
    } catch (e) {
      throw WalletException('Failed to fetch supervisor requests: $e');
    }
  }

  /// Get down payment requests for admin approval
  Future<List<DownPaymentRequest>> getAdminDownPaymentRequests(
    String adminId,
  ) async {
    try {
      final response = await _supabase
          .from('down_payment_requests')
          .select()
          .eq('status', 'pending_admin')
          .order('created_at', ascending: false);

      return (response as List)
          .map((json) => DownPaymentRequest.fromJson(json))
          .toList();
    } catch (e) {
      throw WalletException('Failed to fetch admin requests: $e');
    }
  }

  /// Approve down payment request (Supervisor level)
  Future<DownPaymentRequest> approveSupervisorDownPaymentRequest({
    required String requestId,
    required String supervisorId,
    String? notes,
  }) async {
    try {
      final updateData = {
        'supervisor_status': 'approved',
        'supervisor_approved_by': supervisorId,
        'supervisor_approved_at': DateTime.now().toIso8601String(),
        'supervisor_notes': notes,
        'status': 'pending_admin',
        'updated_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('down_payment_requests')
          .update(updateData)
          .eq('id', requestId)
          .eq('status', 'pending_supervisor')
          .eq('supervisor_id', supervisorId)
          .select()
          .single();

      return DownPaymentRequest.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to approve supervisor request: $e');
    }
  }

  /// Reject down payment request (Supervisor level)
  Future<DownPaymentRequest> rejectSupervisorDownPaymentRequest({
    required String requestId,
    required String supervisorId,
    required String rejectionReason,
    String? notes,
  }) async {
    try {
      final updateData = {
        'supervisor_status': 'rejected',
        'supervisor_approved_by': supervisorId,
        'supervisor_approved_at': DateTime.now().toIso8601String(),
        'supervisor_notes': notes,
        'supervisor_rejection_reason': rejectionReason,
        'status': 'rejected',
        'updated_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('down_payment_requests')
          .update(updateData)
          .eq('id', requestId)
          .eq('status', 'pending_supervisor')
          .eq('supervisor_id', supervisorId)
          .select()
          .single();

      return DownPaymentRequest.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to reject supervisor request: $e');
    }
  }

  /// Approve down payment request (Admin level)
  Future<DownPaymentRequest> approveAdminDownPaymentRequest({
    required String requestId,
    required String adminId,
    String? notes,
  }) async {
    try {
      final updateData = {
        'admin_status': 'approved',
        'admin_processed_by': adminId,
        'admin_processed_at': DateTime.now().toIso8601String(),
        'admin_notes': notes,
        'status': 'approved',
        'updated_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('down_payment_requests')
          .update(updateData)
          .eq('id', requestId)
          .eq('status', 'pending_admin')
          .select()
          .single();

      return DownPaymentRequest.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to approve admin request: $e');
    }
  }

  /// Reject down payment request (Admin level)
  Future<DownPaymentRequest> rejectAdminDownPaymentRequest({
    required String requestId,
    required String adminId,
    required String rejectionReason,
    String? notes,
  }) async {
    try {
      final updateData = {
        'admin_status': 'rejected',
        'admin_processed_by': adminId,
        'admin_processed_at': DateTime.now().toIso8601String(),
        'admin_notes': notes,
        'admin_rejection_reason': rejectionReason,
        'status': 'rejected',
        'updated_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('down_payment_requests')
          .update(updateData)
          .eq('id', requestId)
          .eq('status', 'pending_admin')
          .select()
          .single();

      return DownPaymentRequest.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to reject admin request: $e');
    }
  }

  /// Cancel down payment request (by requester)
  Future<DownPaymentRequest> cancelDownPaymentRequest({
    required String requestId,
    required String userId,
  }) async {
    try {
      final updateData = {
        'status': 'cancelled',
        'updated_at': DateTime.now().toIso8601String(),
      };

      final response = await _supabase
          .from('down_payment_requests')
          .update(updateData)
          .eq('id', requestId)
          .eq('requested_by', userId)
          .inFilter('status', [
            'pending_supervisor',
            'pending_admin',
            'approved',
          ])
          .select()
          .single();

      return DownPaymentRequest.fromJson(response);
    } catch (e) {
      throw WalletException('Failed to cancel down payment request: $e');
    }
  }

  /// Real-time stream for user's down payment requests
  Stream<List<DownPaymentRequest>> watchUserDownPaymentRequests(String userId) {
    return _supabase
        .from('down_payment_requests')
        .stream(primaryKey: ['id'])
        .eq('requested_by', userId)
        .order('created_at', ascending: false)
        .map(
          (data) =>
              data.map((json) => DownPaymentRequest.fromJson(json)).toList(),
        );
  }

  /// Real-time stream for supervisor's pending requests
  Stream<List<DownPaymentRequest>> watchSupervisorDownPaymentRequests(
    String supervisorId,
  ) {
    return _supabase
        .from('down_payment_requests')
        .stream(primaryKey: ['id'])
        .order('created_at', ascending: false)
        .map(
          (data) => data
              .where(
                (json) =>
                    json['supervisor_id'] == supervisorId &&
                    json['status'] == 'pending_supervisor',
              )
              .map((json) => DownPaymentRequest.fromJson(json))
              .toList(),
        );
  }

  /// Real-time stream for admin's pending requests
  Stream<List<DownPaymentRequest>> watchAdminDownPaymentRequests() {
    return _supabase
        .from('down_payment_requests')
        .stream(primaryKey: ['id'])
        .eq('status', 'pending_admin')
        .order('created_at', ascending: false)
        .map(
          (data) =>
              data.map((json) => DownPaymentRequest.fromJson(json)).toList(),
        );
  }

  // ============================================================================
}
