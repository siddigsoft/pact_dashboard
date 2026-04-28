import 'dart:convert';
import 'dart:ui' as ui;
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:screenshot/screenshot.dart';
import 'package:path_provider/path_provider.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/filter_status_bar.dart';
import '../theme/app_colors.dart';
import '../widgets/main_layout.dart';
import '../services/wallet_service.dart';
import '../services/offline/offline_db.dart';
import '../services/notification_trigger_service.dart';

class WalletScreen extends StatefulWidget {
  final bool isArabic;

  /// 0=overview  1=transactions  2=withdrawals  3=advances
  final int initialTab;
  const WalletScreen({super.key, this.isArabic = false, this.initialTab = 0});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  bool _isLoading = true;
  bool _isOffline = false;
  String? _userId;

  // Wallet data
  double _currentBalance = 0.0;
  double _totalEarned = 0.0;
  double _totalWithdrawn = 0.0;
  double _pendingWithdrawals = 0.0;
  double _thisMonthEarnings = 0.0;
  double _thisWeekEarnings = 0.0;
  double _thisMonthAdvanceDeductions = 0.0;

  // Computed from _advances (down_payment_requests) as primary source,
  // falling back to wallet_transactions if no advance records exist.
  double get _totalAdvanceDeductions => _computeAdvanceDeductions();

  double _computeAdvanceDeductions() {
    if (_advances.isNotEmpty) {
      return _advances.fold(0.0, (sum, a) {
        final status = (a['status'] as String? ?? '').toLowerCase();
        // Outstanding advance statuses — money already in wallet, not yet fully repaid:
        // 'approved'        = fully approved (may be pre-disbursement or post)
        // 'disbursed'       = money sent to wallet, repayment not started
        // 'active'          = active advance outstanding
        // 'partially_paid'  = partially repaid, remainder still owed
        const outstanding = {
          'approved',
          'disbursed',
          'active',
          'partially_paid',
        };
        if (!outstanding.contains(status)) return sum;
        final approved =
            ((a['approved_amount'] as num?)?.toDouble() ?? 0.0) ??
            ((a['disbursed_amount'] as num?)?.toDouble() ?? 0.0) ??
            ((a['requested_amount'] as num?)?.toDouble() ?? 0.0) ??
            0.0;
        final paid =
            ((a['total_paid_amount'] as num?)?.toDouble() ?? 0.0) ?? 0.0;
        return sum + (approved - paid).clamp(0.0, double.infinity);
      });
    }
    // Fallback: wallet_transactions
    final disbursed = _transactions
        .where((t) => t['type'] == 'down_payment')
        .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());
    final repaid = _transactions
        .where((t) => t['type'] == 'advance_deduction')
        .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());
    return (disbursed - repaid).clamp(0.0, double.infinity);
  }

  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _withdrawalRequests = [];
  List<Map<String, dynamic>> _advances = [];
  List<Map<String, dynamic>> _costPayments = [];
  List<Map<String, dynamic>> _pendingReceiptConfirmations = [];
  List<Map<String, dynamic>> _pendingAdvanceConfirmations = [];
  final Map<String, bool> _expandedCostItems =
      {}; // Track which cost items are expanded
  bool _costPaymentsLoading = false;
  Map<String, dynamic>? _currentPendingReceipt;
  bool _declineLoading = false;

  String _activeTab = 'overview'; // set from initialTab in initState
  String _transactionFilter = 'all';
  String _withdrawalFilter = 'all';
  String _statementPeriod = 'this_month'; // 'this_month' | 'last_month' | 'all'

  // Net balance = gross balance minus all advance disbursements.
  // This is what's truly available for withdrawal.
  double get _netBalance =>
      (_currentBalance - _totalAdvanceDeductions).clamp(0.0, double.infinity);

  // Withdrawal dialog
  bool _showWithdrawalDialog = false;
  final TextEditingController _withdrawalAmountController =
      TextEditingController();
  final TextEditingController _withdrawalReasonController =
      TextEditingController();
  String _selectedPaymentMethod = '';
  List<Map<String, dynamic>> _paymentMethods = [];
  bool _isSubmittingWithdrawal = false;

  RealtimeChannel? _realtimeChannel;

  // Screenshot controllers for cost payment receipt
  late ScreenshotController _receiptScreenshotController;

  @override
  void initState() {
    super.initState();
    _receiptScreenshotController = ScreenshotController();
    const tabNames = [
      'overview',
      'transactions',
      'withdrawals',
      'advances',
      'cost_payments',
      'statement',
    ];
    if (widget.initialTab >= 0 && widget.initialTab < tabNames.length) {
      _activeTab = tabNames[widget.initialTab];
    }
    _initializeWallet();
  }

  @override
  void dispose() {
    _realtimeChannel?.unsubscribe();
    _withdrawalAmountController.dispose();
    _withdrawalReasonController.dispose();
    super.dispose();
  }

  Future<void> _initializeWallet() async {
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user == null) {
        setState(() => _isLoading = false);
        return;
      }

      _userId = user.id;

      // Check connectivity first
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOffline = connectivityResult.contains(ConnectivityResult.none);

      if (mounted) {
        setState(() => _isOffline = isOffline);
      }

      if (isOffline) {
        // OFFLINE MODE: Load from cache
        debugPrint('[Wallet] Offline - loading from cache');
        await _initializeFromCache(user.id);
        return;
      }

      // ONLINE MODE: Fetch from Supabase and cache
      try {
        // Sync any offline-saved confirmations first
        _syncPendingConfirmations();

        await Future.wait([
          _loadWallet(),
          _loadTransactions(),
          _loadWithdrawalRequests(),
          _loadPaymentMethods(),
          _loadAdvances(),
          _loadCostPayments(),
        ]);

        // Check for pending receipt confirmations
        _checkPendingReceiptConfirmations();

        // Cache wallet data for offline use
        await _cacheWalletData(user.id);

        _setupRealtimeSubscription();
        setState(() => _isLoading = false);

        // Show blocking receipt modal if pending receipts exist
        _checkPendingAdvanceConfirmations();
        if (mounted && _pendingReceiptConfirmations.isNotEmpty) {
          await _showHighPriorityBlockingReceiptModal();
        } else if (mounted && (_pendingAdvanceConfirmations.isNotEmpty)) {
          await _showViewModeChoiceDialog();
        }
      } catch (e) {
        // Network error - fall back to cache
        debugPrint('[Wallet] Network error, falling back to cache: $e');
        await _initializeFromCache(user.id);
      }
    } catch (e) {
      debugPrint('Error initializing wallet: $e');
      // Try cache as last resort
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        await _initializeFromCache(user.id);
      } else {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Initialize from cached data when offline
  Future<void> _initializeFromCache(String userId) async {
    try {
      if (mounted) {
        setState(() => _isOffline = true);
      }
      debugPrint('[Wallet] Loading from cache');

      // Load cached wallet data
      final cachedData = await _getCachedWalletData(userId);
      if (cachedData != null) {
        _applyCachedWalletData(cachedData);
      }

      if (!mounted) return;
      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint('[Wallet] Error loading from cache: $e');
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cacheWalletData(String userId) async {
    try {
      final offlineDb = OfflineDb();
      final data = {
        'currentBalance': _currentBalance,
        'totalEarned': _totalEarned,
        'totalWithdrawn': _totalWithdrawn,
        'pendingWithdrawals': _pendingWithdrawals,
        'thisMonthEarnings': _thisMonthEarnings,
        'thisWeekEarnings': _thisWeekEarnings,
        'transactions': _transactions,
        'withdrawalRequests': _withdrawalRequests,
      };
      await offlineDb.cacheItem(
        OfflineDb.walletCacheBox,
        'wallet_data_$userId',
        data: data,
        ttl: const Duration(hours: 12),
      );
      debugPrint('[Wallet] Cached wallet data');
    } catch (e) {
      debugPrint('[Wallet] Error caching wallet data: $e');
    }
  }

  Future<Map<String, dynamic>?> _getCachedWalletData(String userId) async {
    try {
      final offlineDb = OfflineDb();
      final cached = offlineDb.getCachedItem(
        OfflineDb.walletCacheBox,
        'wallet_data_$userId',
      );
      return cached?.data;
    } catch (e) {
      debugPrint('[Wallet] Error getting cached wallet data: $e');
      return null;
    }
  }

  void _applyCachedWalletData(Map<String, dynamic> data) {
    _currentBalance = (data['currentBalance'] as num?)?.toDouble() ?? 0.0;
    _totalEarned = (data['totalEarned'] as num?)?.toDouble() ?? 0.0;
    _totalWithdrawn = (data['totalWithdrawn'] as num?)?.toDouble() ?? 0.0;
    _pendingWithdrawals =
        (data['pendingWithdrawals'] as num?)?.toDouble() ?? 0.0;
    _thisMonthEarnings = (data['thisMonthEarnings'] as num?)?.toDouble() ?? 0.0;
    _thisWeekEarnings = (data['thisWeekEarnings'] as num?)?.toDouble() ?? 0.0;

    final txList = data['transactions'] as List?;
    if (txList != null) {
      _transactions = txList
          .map((t) => Map<String, dynamic>.from(t as Map))
          .toList();
    }

    final wrList = data['withdrawalRequests'] as List?;
    if (wrList != null) {
      _withdrawalRequests = wrList
          .map((w) => Map<String, dynamic>.from(w as Map))
          .toList();
    }
  }

  void _setupRealtimeSubscription() {
    try {
      _realtimeChannel?.unsubscribe();

      _realtimeChannel = Supabase.instance.client
          .channel('wallet_realtime')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'wallets',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'user_id',
              value: _userId!,
            ),
            callback: (payload) {
              debugPrint('Wallet updated, reloading...');
              _loadWallet();
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'wallet_transactions',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'user_id',
              value: _userId!,
            ),
            callback: (payload) {
              debugPrint('Transaction updated, reloading...');
              _loadTransactions();
            },
          )
          .subscribe();
    } catch (e) {
      debugPrint('Error setting up real-time subscription: $e');
    }
  }

  Future<void> _loadWallet() async {
    try {
      if (_userId == null) return;

      final data = await Supabase.instance.client
          .from('wallets')
          .select('*')
          .eq('user_id', _userId!)
          .maybeSingle();

      if (data != null) {
        final balances = data['balances'] as Map<String, dynamic>? ?? {};
        _currentBalance = (balances['SDG'] as num?)?.toDouble() ?? 0.0;
        _totalEarned = (data['total_earned'] as num?)?.toDouble() ?? 0.0;
      } else {
        // Create wallet if it doesn't exist
        await Supabase.instance.client.from('wallets').insert({
          'user_id': _userId!,
          'balances': {'SDG': 0},
        });
        _currentBalance = 0.0;
        _totalEarned = 0.0;
      }

      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Error loading wallet: $e');
    }
  }

  Future<void> _loadTransactions() async {
    try {
      if (_userId == null) return;

      // Fetch up to 500 transactions for accurate monthly/weekly stats.
      final data = await Supabase.instance.client
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', _userId!)
          .order('created_at', ascending: false)
          .limit(500);

      _transactions = (data as List).cast<Map<String, dynamic>>();

      // Accurately compute Total Earned: sum of ALL earning transactions
      // (site visit fees + fund receipts) — not limited to the 500-row slice.
      // This overrides the DB `total_earned` field which may omit fund receipts.
      final earningTypes = [
        'earning',
        'site_visit_fee',
        'fund_receipt',
        'fund_receipt_confirmation',
        'wallet_credit',
      ];
      final allEarningTx = await Supabase.instance.client
          .from('wallet_transactions')
          .select('amount')
          .eq('user_id', _userId!)
          .inFilter('type', earningTypes)
          .gt('amount', 0);
      if ((allEarningTx as List).isNotEmpty) {
        _totalEarned = allEarningTx.fold(
          0.0,
          (sum, t) => sum + (t['amount'] as num).toDouble(),
        );
      }

      // Calculate stats
      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);
      final startOfWeek = now.subtract(Duration(days: now.weekday - 1));

      // Earnings = site visit fees + any fund receipt credits (positive amounts only)
      bool isEarningTx(Map<String, dynamic> t) {
        final type = t['type'] as String? ?? '';
        final amount = (t['amount'] as num?)?.toDouble() ?? 0.0;
        return (type == 'earning' ||
                type == 'site_visit_fee' ||
                type == 'fund_receipt' ||
                type == 'fund_receipt_confirmation' ||
                type == 'wallet_credit') &&
            amount > 0;
      }

      _thisMonthEarnings = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfMonth) && isEarningTx(t);
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());

      _thisWeekEarnings = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfWeek) && isEarningTx(t);
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());

      // _totalAdvanceDeductions is a computed getter using _advances as primary
      // source — see _computeAdvanceDeductions(). No manual assignment needed.

      // This-month outstanding advances
      final monthDisbursed = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfMonth) && t['type'] == 'down_payment';
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());
      final monthRepaid = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfMonth) &&
                t['type'] == 'advance_deduction';
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());

      _thisMonthAdvanceDeductions = (monthDisbursed - monthRepaid).clamp(
        0.0,
        double.infinity,
      );

      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Error loading transactions: $e');
    }
  }

  Future<void> _loadWithdrawalRequests() async {
    try {
      if (_userId == null) return;

      final data = await Supabase.instance.client
          .from('withdrawal_requests')
          .select('*')
          .eq('user_id', _userId!)
          .order('created_at', ascending: false)
          .limit(50);

      _withdrawalRequests = (data as List).cast<Map<String, dynamic>>();

      _pendingWithdrawals = _withdrawalRequests
          .where((w) => w['status'] == 'pending')
          .fold(0.0, (sum, w) => sum + (w['amount'] as num).toDouble());

      _totalWithdrawn = _withdrawalRequests
          .where((w) => w['status'] == 'approved')
          .fold(0.0, (sum, w) => sum + (w['amount'] as num).toDouble());

      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Error loading withdrawal requests: $e');
    }
  }

  Future<void> _loadPaymentMethods() async {
    try {
      if (_userId == null) return;

      final data = await Supabase.instance.client
          .from('payment_methods')
          .select('*')
          .eq('user_id', _userId!)
          .order('created_at', ascending: false);

      _paymentMethods = (data as List).cast<Map<String, dynamic>>();
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Error loading payment methods: $e');
    }
  }

  Future<void> _loadAdvances() async {
    try {
      if (_userId == null) return;

      // Use plain * — avoid foreign key joins that may not be registered in Supabase
      final data = await Supabase.instance.client
          .from('down_payment_requests')
          .select('*')
          .eq('requested_by', _userId!)
          .order('created_at', ascending: false)
          .limit(100);

      _advances = List<Map<String, dynamic>>.from(data as List);
      debugPrint(
        '[Wallet] Loaded ${_advances.length} advances for user $_userId',
      );
      for (final a in _advances) {
        debugPrint(
          '[Wallet] Advance: id=${a['id']}, status=${a['status']}, '
          'approved_amount=${a['approved_amount']}, disbursed_amount=${a['disbursed_amount']}, '
          'requested_amount=${a['requested_amount']}, total_paid=${a['total_paid_amount']}',
        );
      }
      debugPrint('[Wallet] Total advance deductions: $_totalAdvanceDeductions');
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('[Wallet] Error loading advances: $e');
    }
  }

  Future<void> _loadCostPayments() async {
    if (_userId == null) return;
    setState(() => _costPaymentsLoading = true);
    try {
      // Load ALL submissions for this user — not just 'paid' — so approved/pending
      // submissions also appear in the Costs tab with their current status.
      final data = await Supabase.instance.client
          .from('operational_cost_submissions')
          .select('*')
          .eq('submitted_by', _userId!)
          .order('created_at', ascending: false)
          .limit(100);
      _costPayments = List<Map<String, dynamic>>.from(data as List);
      debugPrint(
        '[Wallet] Loaded ${_costPayments.length} cost submissions for user $_userId',
      );
      if (mounted) setState(() => _costPaymentsLoading = false);
    } catch (e) {
      debugPrint('[Wallet] Error loading cost submissions: $e');
      if (mounted) setState(() => _costPaymentsLoading = false);
    }
  }

  void _checkPendingReceiptConfirmations() {
    debugPrint(
      '[Wallet] Checking pending receipts from ${_costPayments.length} cost payments',
    );

    // Only request receipt confirmation for payments that were actually disbursed
    // by finance and have an attached payment proof (not submitter attachments).
    _pendingReceiptConfirmations = _costPayments.where((cost) {
      final receiptConfirmed = cost['fund_receipt_confirmed'] == true;
      final id = cost['id'] as String?;
      final status = (cost['status'] as String ?? '').toLowerCase();
      final paymentProofUrl = (cost['payment_proof_url'] as String?)?.trim();
      final category = cost['expense_category'] as String? ?? 'unknown';
      final isPaid = status == 'paid' || status == 'partially_paid' || status == 'fully_paid';
      final hasPaymentProof = paymentProofUrl != null && paymentProofUrl.isNotEmpty;

      debugPrint(
        '[Wallet] Checking cost: id=$id, status=$status, confirmed=$receiptConfirmed, category=$category',
      );

      // Skip ONLY if already confirmed
      if (receiptConfirmed) {
        debugPrint('[Wallet]   → Skipping: Already confirmed');
        return false;
      }

      if (!isPaid || !hasPaymentProof) {
        debugPrint(
          '[Wallet]   → Skipping: isPaid=$isPaid, hasPaymentProof=$hasPaymentProof',
        );
        return false;
      }

      debugPrint('[Wallet]   → INCLUDING for confirmation (paid + receipt proof)');
      return true;
    }).toList();

    debugPrint(
      '[Wallet] Found ${_pendingReceiptConfirmations.length} pending receipt confirmations',
    );
    for (final cost in _pendingReceiptConfirmations) {
      debugPrint(
        '[Wallet] Pending: ${cost['id']} - ${cost['expense_category']} (status: ${cost['status']})',
      );
    }
  }

  void _checkPendingAdvanceConfirmations() {
    _pendingAdvanceConfirmations = _advances.where((advance) {
      final status = (advance['status'] as String? ?? '').toLowerCase();
      final meta = (advance['metadata'] as Map?)?.cast<String, dynamic>() ?? {};
      final declineMeta =
          (meta['receipt_decline'] as Map?)?.cast<String, dynamic>() ?? {};
      final waitingFinanceResend =
          declineMeta['declined'] == true &&
          (declineMeta['resendRequested'] == true ||
              declineMeta['resendStatus'] == 'pending_finance');
      final receiptConfirmed =
          meta['receipt_confirmation']?['confirmed'] == true;
      final isDisbursed =
          status == 'partially_paid' ||
          status == 'fully_paid' ||
          status == 'paid';
      return isDisbursed && !receiptConfirmed && !waitingFinanceResend;
    }).toList();
    debugPrint(
      '[Wallet] Found ${_pendingAdvanceConfirmations.length} pending advance confirmations',
    );
  }

  // Get the total count of pending confirmations (advances + costs combined)
  int getTotalPendingConfirmationCount() {
    return _pendingAdvanceConfirmations.length +
        _pendingReceiptConfirmations.length;
  }

  Future<void> _notifyNotReceivedToFinanceAndApprovers({
    required String title,
    required String titleAr,
    required String message,
    required String messageAr,
    required String notificationType,
    required String relatedId,
    required String relatedType,
  }) async {
    final now = DateTime.now().toIso8601String();
    const recipientTypes = ['admin', 'supervisor', 'coordinator', 'finance'];

    final payloads = recipientTypes
        .map(
          (recipientType) => {
            'recipient_type': recipientType,
            'sender_id': _userId,
            'title': title,
            'title_ar': titleAr,
            'message': message,
            'message_ar': messageAr,
            'notification_type': notificationType,
            'related_id': relatedId,
            'related_type': relatedType,
            'created_at': now,
          },
        )
        .toList(growable: false);

    try {
      await Supabase.instance.client
          .from('notification_broadcast')
          .insert(payloads);
    } catch (e) {
      debugPrint('[Wallet] Notification broadcast error: $e');
    }
  }

  Future<void> _showViewModeChoiceDialog() async {
    debugPrint(
      '[Wallet] _showViewModeChoiceDialog: receipts=${_pendingReceiptConfirmations.length}, advances=${_pendingAdvanceConfirmations.length}',
    );
    if (_pendingReceiptConfirmations.isEmpty &&
        _pendingAdvanceConfirmations.isEmpty) {
      debugPrint('[Wallet] No pending confirmations to show!');
      return;
    }

    final costTotal = _pendingReceiptConfirmations.fold(
      0.0,
      (sum, c) => sum + (((c['amount_cents'] as num?)?.toInt() ?? 0) / 100.0),
    );
    final advanceTotal = _pendingAdvanceConfirmations.fold(0.0, (sum, a) {
      final disbursed = (a['disbursed_amount'] as num?)?.toDouble() ?? 0.0;
      final approved = (a['approved_amount'] as num?)?.toDouble() ?? 0.0;
      final requested = (a['requested_amount'] as num?)?.toDouble() ?? 0.0;
      if (disbursed > 0) return sum + disbursed;
      if (approved > 0) return sum + approved;
      return sum + requested;
    });
    final totalItems =
        _pendingReceiptConfirmations.length +
        _pendingAdvanceConfirmations.length;
    final totalAmount = costTotal + advanceTotal;

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 32,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Blue header
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.primaryBlue, Color(0xFF2E5C8A)],
                  ),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(20, 20, 16, 20),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.checklist_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        crossAxisAlignment: widget.isArabic
                            ? CrossAxisAlignment.end
                            : CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.isArabic
                                ? 'التأكيدات المعلقة'
                                : 'Pending Confirmations',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            widget.isArabic
                                ? 'اختر طريقة العرض'
                                : 'Choose view mode',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Content
              Container(
                color: const Color(0xFFF0F7FF),
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 20,
                ),
                child: Column(
                  textDirection: widget.isArabic
                      ? ui.TextDirection.rtl
                      : ui.TextDirection.ltr,
                  crossAxisAlignment: widget.isArabic
                      ? CrossAxisAlignment.end
                      : CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.isArabic ? 'ملخص' : 'Summary',
                      textDirection: widget.isArabic
                          ? ui.TextDirection.rtl
                          : ui.TextDirection.ltr,
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF1F2937),
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...[
                      {
                        'label': widget.isArabic
                            ? 'إجمالي العناصر:'
                            : 'Total Items:',
                        'value': '$totalItems',
                        'color': Colors.black,
                      },
                      {
                        'label': widget.isArabic
                            ? 'إجمالي التكاليف:'
                            : 'Total Costs:',
                        'value': '${costTotal.toStringAsFixed(2)} SDG',
                        'color': Colors.red.shade700,
                      },
                      {
                        'label': widget.isArabic
                            ? 'إجمالي السلف:'
                            : 'Total Advances:',
                        'value': '${advanceTotal.toStringAsFixed(2)} SDG',
                        'color': Colors.orange.shade700,
                      },
                    ].map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          textDirection: widget.isArabic
                              ? ui.TextDirection.rtl
                              : ui.TextDirection.ltr,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              item['label']! as String,
                              textDirection: widget.isArabic
                                  ? ui.TextDirection.rtl
                                  : ui.TextDirection.ltr,
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                            Text(
                              item['value']! as String,
                              textDirection: widget.isArabic
                                  ? ui.TextDirection.rtl
                                  : ui.TextDirection.ltr,
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w700,
                                color: item['color']! as Color,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2E5C8A).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: const Color(0xFF2E5C8A).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            widget.isArabic
                                ? 'الإجمالي الكلي:'
                                : 'Grand Total:',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            _formatCurrency(totalAmount),
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                              color: const Color(0xFF2E5C8A),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Buttons
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                child: Column(
                  textDirection: widget.isArabic
                      ? ui.TextDirection.rtl
                      : ui.TextDirection.ltr,
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Advances/Transportation Button - Shows approved advances
                    ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _showAdvancesConfirmationsDialog();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.teal.shade600,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        widget.isArabic
                            ? 'السلف المعتمدة (${_pendingAdvanceConfirmations.length})'
                            : 'Approved Advances (${_pendingAdvanceConfirmations.length})',
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    // Costs Only Button - Shows other cost categories
                    ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _showCostSubmissionsDialog();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red.shade600,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        widget.isArabic
                            ? 'طلبات الصرف (${_pendingReceiptConfirmations.length})'
                            : 'Cost Submissions (${_pendingReceiptConfirmations.length})',
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    // View All At Once Button
                    ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _showBulkPendingConfirmationsModal();
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        widget.isArabic
                            ? 'عرض الكل معاً ($totalItems)'
                            : 'View All At Once ($totalItems)',
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    ElevatedButton(
                      onPressed: () async {
                        Navigator.pop(ctx);
                        // Reload cost payments and recheck pending confirmations
                        await _loadCostPayments();
                        _checkPendingReceiptConfirmations();
                        _checkPendingAdvanceConfirmations();

                        await Future.delayed(const Duration(milliseconds: 500));
                        if (_pendingReceiptConfirmations.isNotEmpty) {
                          await _showNextPendingReceiptDialog();
                        } else if (_pendingAdvanceConfirmations.isNotEmpty) {
                          await _showNextPendingAdvanceDialog();
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                widget.isArabic
                                    ? 'لا توجد تأكيدات معلقة'
                                    : 'No pending confirmations',
                              ),
                              duration: const Duration(seconds: 2),
                            ),
                          );
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange.shade600,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        widget.isArabic
                            ? 'عرض واحد تلو الآخر ($totalItems)'
                            : 'One By One ($totalItems)',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showBulkPendingConfirmationsModal() async {
    final totalItems =
        _pendingReceiptConfirmations.length +
        _pendingAdvanceConfirmations.length;

    // Extract cost amounts - using amount_cents field (in cents, divide by 100)
    final costTotal = _pendingReceiptConfirmations.fold(0.0, (sum, c) {
      final amountCents = (c['amount_cents'] as num?)?.toInt() ?? 0;
      return sum + (amountCents / 100.0);
    });

    // Extract advance amounts - use priority: disbursed > approved > requested
    final advanceTotal = _pendingAdvanceConfirmations.fold(0.0, (sum, a) {
      final disbursed = ((a['disbursed_amount'] as num?)?.toInt() ?? 0) / 100.0;
      final approved = ((a['approved_amount'] as num?)?.toInt() ?? 0) / 100.0;
      final requested = ((a['requested_amount'] as num?)?.toInt() ?? 0) / 100.0;

      // Use first non-zero amount in priority order
      final amount = disbursed > 0
          ? disbursed
          : approved > 0
          ? approved
          : requested;
      return sum + amount;
    });

    final totalAmount = costTotal + advanceTotal;

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 32,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.primaryBlue, Color(0xFF2E5C8A)],
                  ),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(20, 20, 16, 20),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.list_alt_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        crossAxisAlignment: widget.isArabic
                            ? CrossAxisAlignment.end
                            : CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.isArabic
                                ? 'جميع التأكيدات المعلقة'
                                : 'All Pending Items',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            widget.isArabic
                                ? 'ملخص شامل لجميع الطلبات'
                                : 'Complete overview of all requests',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Content
              Container(
                color: const Color(0xFFF0F7FF),
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(ctx).size.height * 0.65,
                ),
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 16,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Summary box
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: const Color(
                                0xFF2E5C8A,
                              ).withValues(alpha: 0.2),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.isArabic
                                    ? 'ملخص إجمالي'
                                    : 'Total Summary',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                textDirection: widget.isArabic
                                    ? ui.TextDirection.rtl
                                    : ui.TextDirection.ltr,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    widget.isArabic
                                        ? 'إجمالي العناصر:'
                                        : 'Total Items:',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  Text(
                                    '$totalItems',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                              if (costTotal > 0)
                                Row(
                                  textDirection: widget.isArabic
                                      ? ui.TextDirection.rtl
                                      : ui.TextDirection.ltr,
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      widget.isArabic
                                          ? 'إجمالي التكاليف:'
                                          : 'Total Costs:',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                    Text(
                                      '${costTotal.toStringAsFixed(2)} SDG',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: Colors.red.shade700,
                                      ),
                                    ),
                                  ],
                                ),
                              if (advanceTotal > 0)
                                Row(
                                  textDirection: widget.isArabic
                                      ? ui.TextDirection.rtl
                                      : ui.TextDirection.ltr,
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      widget.isArabic
                                          ? 'إجمالي السلف:'
                                          : 'Total Advances:',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                    Text(
                                      '${advanceTotal.toStringAsFixed(2)} SDG',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: Colors.orange.shade700,
                                      ),
                                    ),
                                  ],
                                ),
                              const Divider(),
                              Row(
                                textDirection: widget.isArabic
                                    ? ui.TextDirection.rtl
                                    : ui.TextDirection.ltr,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    widget.isArabic
                                        ? 'الإجمالي الكلي:'
                                        : 'Grand Total:',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                  Text(
                                    _formatCurrency(totalAmount),
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                      color: const Color(0xFF2E5C8A),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        //======== COST SUBMISSIONS ========
                        if (_pendingReceiptConfirmations.isNotEmpty) ...[
                          Text(
                            widget.isArabic
                                ? 'طلبات الصرف (التكاليف)'
                                : 'Cost Submissions',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: Colors.red.shade700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ..._pendingReceiptConfirmations.map((c) {
                            final amount =
                                ((c['amount_cents'] as num?)?.toInt() ?? 0) /
                                100.0;
                            final category =
                                (c['expense_category'] as String? ?? 'Cost')
                                    .replaceAll('_', ' ')
                                    .toUpperCase();
                            final site = c['site_name'] as String? ?? 'Site';
                            final proofUrl =
                                c['payment_proof_url'] as String? ?? '';
                            final isImage =
                                proofUrl.isNotEmpty &&
                                RegExp(
                                  r'\.(jpg|jpeg|png|gif|webp)$',
                                  caseSensitive: false,
                                ).hasMatch(proofUrl);

                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.red.shade50,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: Colors.red.shade300,
                                  width: 1,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    textDirection: widget.isArabic
                                        ? ui.TextDirection.rtl
                                        : ui.TextDirection.ltr,
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              category,
                                              style: GoogleFonts.poppins(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 11,
                                                color: Colors.red.shade800,
                                              ),
                                            ),
                                            Text(
                                              site,
                                              style: const TextStyle(
                                                fontSize: 10,
                                                color: Colors.grey,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.red.shade200,
                                          borderRadius: BorderRadius.circular(
                                            4,
                                          ),
                                        ),
                                        child: Text(
                                          '${amount.toStringAsFixed(2)} SDG',
                                          style: GoogleFonts.poppins(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.red.shade900,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  if (isImage)
                                    // Receipt uploaded - show styled receipt preview
                                    Container(
                                      decoration: BoxDecoration(
                                        border: Border.all(
                                          color: Colors.green.shade300,
                                          width: 2,
                                        ),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      padding: const EdgeInsets.all(16),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          // Receipt label
                                          Text(
                                            widget.isArabic
                                                ? 'إيصال الدفع / Payment Receipt'
                                                : 'Payment Receipt / إيصال الدفع',
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 14,
                                              color: Colors.green.shade600,
                                            ),
                                          ),
                                          const SizedBox(height: 12),
                                          // Receipt image preview
                                          Container(
                                            width: double.infinity,
                                            height: 120,
                                            decoration: BoxDecoration(
                                              color: Colors.grey.shade50,
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              border: Border.all(
                                                color: Colors.grey.shade200,
                                                width: 1,
                                              ),
                                            ),
                                            child: ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              child: Image.network(
                                                proofUrl,
                                                fit: BoxFit.cover,
                                                errorBuilder:
                                                    (
                                                      context,
                                                      error,
                                                      stackTrace,
                                                    ) => Container(
                                                      color:
                                                          Colors.grey.shade200,
                                                      child: Center(
                                                        child: Icon(
                                                          Icons.image,
                                                          color: Colors
                                                              .grey
                                                              .shade600,
                                                          size: 40,
                                                        ),
                                                      ),
                                                    ),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 12),
                                          // Open full document button
                                          SizedBox(
                                            width: double.infinity,
                                            child: ElevatedButton.icon(
                                              onPressed: () {
                                                // Open receipt in browser or full screen
                                                if (proofUrl.isNotEmpty) {
                                                  try {
                                                    launchUrl(
                                                      Uri.parse(proofUrl),
                                                      mode: LaunchMode
                                                          .externalApplication,
                                                    );
                                                  } catch (e) {
                                                    ScaffoldMessenger.of(
                                                      context,
                                                    ).showSnackBar(
                                                      SnackBar(
                                                        content: Text(
                                                          widget.isArabic
                                                              ? 'لا يمكن فتح الملف'
                                                              : 'Cannot open file',
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                }
                                              },
                                              icon: const Icon(
                                                Icons.download,
                                                size: 16,
                                              ),
                                              label: Text(
                                                widget.isArabic
                                                    ? 'فتح الوثيقة الكاملة'
                                                    : 'Open Full Document',
                                                style: GoogleFonts.poppins(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor:
                                                    Colors.green.shade600,
                                                foregroundColor: Colors.white,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      vertical: 10,
                                                    ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    )
                                  else
                                    // Receipt not uploaded - show styled message
                                    Container(
                                      decoration: BoxDecoration(
                                        border: Border.all(
                                          color: Colors.red.shade300,
                                          width: 2,
                                        ),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      padding: const EdgeInsets.all(16),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          // Receipt label
                                          Text(
                                            widget.isArabic
                                                ? 'إيصال الدفع / Payment Receipt'
                                                : 'Payment Receipt / إيصال الدفع',
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 14,
                                              color: Colors.red.shade600,
                                            ),
                                          ),
                                          const SizedBox(height: 12),
                                          // No receipt message box
                                          Container(
                                            decoration: BoxDecoration(
                                              color: Colors.red.shade50,
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                            ),
                                            padding: const EdgeInsets.all(12),
                                            child: Row(
                                              children: [
                                                // Placeholder icon
                                                Container(
                                                  width: 48,
                                                  height: 48,
                                                  decoration: BoxDecoration(
                                                    color: Colors.red.shade200,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          6,
                                                        ),
                                                  ),
                                                  child: Center(
                                                    child: Icon(
                                                      Icons
                                                          .description_outlined,
                                                      color:
                                                          Colors.red.shade600,
                                                      size: 24,
                                                    ),
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                // Message
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment:
                                                        CrossAxisAlignment
                                                            .start,
                                                    children: [
                                                      Text(
                                                        widget.isArabic
                                                            ? 'وثيقة / Document'
                                                            : 'Document / وثيقة',
                                                        style:
                                                            GoogleFonts.poppins(
                                                              fontSize: 12,
                                                              color:
                                                                  Colors.grey,
                                                            ),
                                                      ),
                                                      const SizedBox(height: 4),
                                                      Text(
                                                        widget.isArabic
                                                            ? 'لم يتم تحميل إيصال'
                                                            : 'No receipt uploaded',
                                                        style:
                                                            GoogleFonts.poppins(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w500,
                                                              fontSize: 13,
                                                              color: Colors
                                                                  .red
                                                                  .shade600,
                                                            ),
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            );
                          }),
                        ],
                        //======== ADVANCES ========
                        if (_pendingAdvanceConfirmations.isNotEmpty) ...[
                          if (_pendingReceiptConfirmations.isNotEmpty)
                            const SizedBox(height: 12),
                          Text(
                            widget.isArabic
                                ? 'السلف المعتمدة'
                                : 'Approved Advances',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: Colors.orange.shade700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ..._pendingAdvanceConfirmations.map((a) {
                            // Advance amounts are stored directly in SDG, NOT in cents.
                            final disbursed =
                                (a['disbursed_amount'] as num?)?.toDouble() ??
                                0.0;
                            final approved =
                                (a['approved_amount'] as num?)?.toDouble() ??
                                0.0;
                            final requested =
                                (a['requested_amount'] as num?)?.toDouble() ??
                                0.0;
                            final amount = (disbursed > 0
                                ? disbursed
                                : (approved > 0 ? approved : requested));
                            final site = a['site_name'] as String? ?? 'Site';
                            final status = (a['status'] as String? ?? '')
                                .toLowerCase();

                            return Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.orange.shade50,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: Colors.orange.shade300,
                                  width: 1,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    textDirection: widget.isArabic
                                        ? ui.TextDirection.rtl
                                        : ui.TextDirection.ltr,
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              site,
                                              style: GoogleFonts.poppins(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 11,
                                                color: Colors.orange.shade800,
                                              ),
                                            ),
                                            Text(
                                              widget.isArabic
                                                  ? 'طلب سلفة'
                                                  : 'Advance Request',
                                              style: const TextStyle(
                                                fontSize: 10,
                                                color: Colors.grey,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.orange.shade200,
                                          borderRadius: BorderRadius.circular(
                                            4,
                                          ),
                                        ),
                                        child: Text(
                                          _formatCurrency(amount),
                                          style: GoogleFonts.poppins(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.orange.shade900,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.shade100,
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(
                                        color: Colors.orange.shade300,
                                        width: 1,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.check_circle_outline,
                                          size: 16,
                                          color: Colors.orange.shade600,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          widget.isArabic
                                              ? 'معتمد بواسطة المراجع المالي'
                                              : 'Approved by Finance',
                                          style: GoogleFonts.poppins(
                                            fontSize: 10,
                                            color: Colors.orange.shade600,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              // Buttons
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(ctx),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.grey.shade300,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: Text(
                          widget.isArabic ? 'إغلاق' : 'Close',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          Navigator.pop(ctx);
                          await _confirmAllPendingReceipts();
                        },
                        icon: const Icon(Icons.check_circle, size: 16),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green.shade600,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        label: Text(
                          widget.isArabic ? 'تأكيد الكل' : 'Confirm All',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showCostSubmissionsDialog() async {
    if (_pendingReceiptConfirmations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'لا توجد طلبات صرف معلقة'
                : 'No pending cost submissions',
          ),
        ),
      );
      return;
    }

    final totalCost = _pendingReceiptConfirmations.fold(
      0.0,
      (sum, c) => sum + (((c['amount_cents'] as num?)?.toInt() ?? 0) / 100.0),
    );

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 32,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header with red color for Costs
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFD32F2F), Color(0xFFE53935)],
                  ),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(20, 20, 16, 20),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.receipt_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        crossAxisAlignment: widget.isArabic
                            ? CrossAxisAlignment.end
                            : CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.isArabic
                                ? 'طلبات الصرف'
                                : 'Cost Submissions',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            widget.isArabic
                                ? 'طلبات تكاليف المشروع'
                                : 'Project cost requests',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Content - Scrollable list of costs with details
              Container(
                color: const Color(0xFFFFF0F0),
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(ctx).size.height * 0.6,
                ),
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 16,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Summary
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: const Color(
                                0xFFD32F2F,
                              ).withValues(alpha: 0.2),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.isArabic
                                    ? 'ملخص التكاليف'
                                    : 'Costs Summary',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                textDirection: widget.isArabic
                                    ? ui.TextDirection.rtl
                                    : ui.TextDirection.ltr,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    widget.isArabic
                                        ? 'عدد الطلبات:'
                                        : 'Number of Requests:',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  Text(
                                    '${_pendingReceiptConfirmations.length}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                              Row(
                                textDirection: widget.isArabic
                                    ? ui.TextDirection.rtl
                                    : ui.TextDirection.ltr,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    widget.isArabic
                                        ? 'الإجمالي:'
                                        : 'Total Amount:',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  Text(
                                    '${totalCost.toStringAsFixed(2)} SDG',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFFD32F2F),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Costs List with full details
                        ..._pendingReceiptConfirmations.map((cost) {
                          final amount =
                              ((cost['amount_cents'] as num?)?.toInt() ?? 0) /
                              100.0;
                          final category =
                              (cost['expense_category'] as String? ?? 'Cost')
                                  .replaceAll('_', ' ')
                                  .toUpperCase();
                          final site = cost['site_name'] as String? ?? 'Site';
                          final description =
                              cost['description'] as String? ??
                              'Cost submission';

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.red.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: Colors.red.shade300,
                                width: 1.5,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Header: Category + Amount
                                Row(
                                  textDirection: widget.isArabic
                                      ? ui.TextDirection.rtl
                                      : ui.TextDirection.ltr,
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            category,
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 12,
                                              color: Colors.red.shade800,
                                            ),
                                          ),
                                          Text(
                                            site,
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.red.shade200,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        '${amount.toStringAsFixed(2)} SDG',
                                        style: GoogleFonts.poppins(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: Colors.red.shade900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                // Description
                                Text(
                                  description,
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: Colors.grey.shade700,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 10),
                                // Receipt Image or No Receipt indicator
                                Builder(
                                  builder: (context) {
                                    var proofUrl =
                                        cost['payment_proof_url'] as String? ??
                                        '';

                                    // Fallback to supporting_documents if payment_proof_url is empty
                                    if (proofUrl.isEmpty &&
                                        cost['supporting_documents'] != null) {
                                      final docs =
                                          cost['supporting_documents'] as List?;
                                      if (docs != null && docs.isNotEmpty) {
                                        proofUrl =
                                            (docs.first as String?) ?? '';
                                      }
                                    }

                                    final isImage =
                                        proofUrl.isNotEmpty &&
                                        RegExp(
                                          r'\.(jpg|jpeg|png|gif|webp)$',
                                          caseSensitive: false,
                                        ).hasMatch(proofUrl);

                                    if (isImage) {
                                      return Container(
                                        width: double.infinity,
                                        height: 90,
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                          border: Border.all(
                                            color: Colors.red.shade200,
                                            width: 1,
                                          ),
                                        ),
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                          child: Image.network(
                                            proofUrl,
                                            fit: BoxFit.cover,
                                            errorBuilder:
                                                (
                                                  context,
                                                  error,
                                                  stackTrace,
                                                ) => Container(
                                                  color: Colors.grey.shade200,
                                                  child: Center(
                                                    child: Icon(
                                                      Icons.broken_image,
                                                      color:
                                                          Colors.grey.shade600,
                                                      size: 30,
                                                    ),
                                                  ),
                                                ),
                                          ),
                                        ),
                                      );
                                    } else {
                                      return Container(
                                        width: double.infinity,
                                        padding: const EdgeInsets.all(8),
                                        decoration: BoxDecoration(
                                          color: Colors.red.shade100,
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                          border: Border.all(
                                            color: Colors.red.shade300,
                                            width: 1,
                                          ),
                                        ),
                                        child: Row(
                                          children: [
                                            Icon(
                                              Icons.attachment,
                                              size: 14,
                                              color: Colors.red.shade600,
                                            ),
                                            const SizedBox(width: 6),
                                            Text(
                                              widget.isArabic
                                                  ? 'لم يتم تحميل إيصال'
                                                  : 'No receipt uploaded',
                                              style: GoogleFonts.poppins(
                                                fontSize: 10,
                                                color: Colors.red.shade600,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    }
                                  },
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ),
              // Action Buttons
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(ctx),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.grey.shade300,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: Text(
                          widget.isArabic ? 'إغلاق' : 'Close',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          Navigator.pop(ctx);
                          await _confirmAllPendingReceipts();
                        },
                        icon: const Icon(Icons.check_circle, size: 16),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade600,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        label: Text(
                          widget.isArabic ? 'تأكيد الكل' : 'Confirm All',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showAdvancesConfirmationsDialog() async {
    if (_pendingAdvanceConfirmations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic ? 'لا توجد سلفيات معلقة' : 'No pending advances',
          ),
        ),
      );
      return;
    }

    final totalAdvance = _pendingAdvanceConfirmations.fold(0.0, (sum, a) {
      final disbursed = (a['disbursed_amount'] as num?)?.toDouble() ?? 0.0;
      final approved = (a['approved_amount'] as num?)?.toDouble() ?? 0.0;
      final requested = (a['requested_amount'] as num?)?.toDouble() ?? 0.0;
      if (disbursed > 0) return sum + disbursed;
      if (approved > 0) return sum + approved;
      return sum + requested;
    });

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 32,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header with teal color for Advances
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF008B8B), Color(0xFF20B2AA)],
                  ),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(24),
                    topRight: Radius.circular(24),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(20, 20, 16, 20),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.savings_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        textDirection: widget.isArabic
                            ? ui.TextDirection.rtl
                            : ui.TextDirection.ltr,
                        crossAxisAlignment: widget.isArabic
                            ? CrossAxisAlignment.end
                            : CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.isArabic
                                ? 'السلف المعتمدة'
                                : 'Approved Advances',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            widget.isArabic
                                ? 'طلبات السلفة المعتمدة'
                                : 'Authorized advance requests',
                            textDirection: widget.isArabic
                                ? ui.TextDirection.rtl
                                : ui.TextDirection.ltr,
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.white70,
                            ),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Content - Scrollable list of advances with details
              Container(
                color: const Color(0xFFF0F7FF),
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(ctx).size.height * 0.6,
                ),
                child: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 16,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Summary
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: const Color(
                                0xFF008B8B,
                              ).withValues(alpha: 0.2),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.isArabic
                                    ? 'ملخص السلف'
                                    : 'Advances Summary',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                textDirection: widget.isArabic
                                    ? ui.TextDirection.rtl
                                    : ui.TextDirection.ltr,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    widget.isArabic
                                        ? 'عدد السلف:'
                                        : 'Number of Advances:',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  Text(
                                    '${_pendingAdvanceConfirmations.length}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                              Row(
                                textDirection: widget.isArabic
                                    ? ui.TextDirection.rtl
                                    : ui.TextDirection.ltr,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    widget.isArabic
                                        ? 'الإجمالي:'
                                        : 'Total Amount:',
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  Text(
                                    '${totalAdvance.toStringAsFixed(2)} SDG',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF008B8B),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Advances List with full details
                        ..._pendingAdvanceConfirmations.map((advance) {
                          final disbursed =
                              (advance['disbursed_amount'] as num?)
                                  ?.toDouble() ??
                              0.0;
                          final approved =
                              (advance['approved_amount'] as num?)
                                  ?.toDouble() ??
                              0.0;
                          final requested =
                              (advance['requested_amount'] as num?)
                                  ?.toDouble() ??
                              0.0;
                          final amount = (disbursed > 0
                              ? disbursed
                              : (approved > 0 ? approved : requested));
                          final status =
                              (advance['status'] as String? ?? 'pending')
                                  .toUpperCase();
                          final site =
                              advance['site_name'] as String? ?? 'Site';
                          final description =
                              advance['description'] as String? ??
                              'Advance Request';

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.teal.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: Colors.teal.shade300,
                                width: 1.5,
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Header: Site + Status
                                Row(
                                  textDirection: widget.isArabic
                                      ? ui.TextDirection.rtl
                                      : ui.TextDirection.ltr,
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            site,
                                            style: GoogleFonts.poppins(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 14,
                                              color: Colors.teal.shade800,
                                            ),
                                          ),
                                          Text(
                                            widget.isArabic
                                                ? 'طلب سلفة'
                                                : 'Advance Request',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.teal.shade200,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        status,
                                        style: GoogleFonts.poppins(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700,
                                          color: Colors.teal.shade900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                // Description
                                Text(
                                  description,
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: Colors.grey.shade700,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 10),
                                // Amount Box
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 8,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Row(
                                    textDirection: widget.isArabic
                                        ? ui.TextDirection.rtl
                                        : ui.TextDirection.ltr,
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        widget.isArabic
                                            ? 'المبلغ المعتمد:'
                                            : 'Approved Amount:',
                                        style: GoogleFonts.poppins(
                                          fontSize: 11,
                                          color: Colors.grey.shade700,
                                        ),
                                      ),
                                      Text(
                                        _formatCurrency(amount),
                                        style: GoogleFonts.poppins(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13,
                                          color: Colors.teal.shade900,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              ),
              // Action Buttons
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(ctx),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.grey.shade300,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: Text(
                          widget.isArabic ? 'إغلاق' : 'Close',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          Navigator.pop(ctx);
                          await _confirmAllPendingAdvances();
                        },
                        icon: const Icon(Icons.check_circle, size: 16),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal.shade600,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        label: Text(
                          widget.isArabic ? 'تأكيد الكل' : 'Confirm All',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showFilteredConfirmationsOneByOne(String filterType) async {
    debugPrint('[Wallet] Filtering confirmations by type: $filterType');

    // Filter costs based on type
    List<Map<String, dynamic>> filteredCosts = [];

    for (var cost in _pendingReceiptConfirmations) {
      final category = ((cost['expense_category'] as String?) ?? '')
          .toLowerCase();

      if (filterType == 'transportation') {
        // Show transportation/advance related costs
        if (category.contains('transportation') ||
            category.contains('vehicle') ||
            category.contains('advance') ||
            category.contains('travel') ||
            category.contains('mileage')) {
          filteredCosts.add(cost);
        }
      } else if (filterType == 'cost') {
        // Show other cost categories (accommodation, meals, other, permits, etc)
        if (!category.contains('transportation') &&
            !category.contains('vehicle') &&
            !category.contains('advance') &&
            !category.contains('travel') &&
            !category.contains('mileage')) {
          filteredCosts.add(cost);
        }
      } else {
        // All costs
        filteredCosts = List<Map<String, dynamic>>.from(
          _pendingReceiptConfirmations,
        );
        break;
      }
    }

    if (filteredCosts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'لا توجد تأكيدات من هذا النوع'
                : 'No confirmations of this type',
          ),
          duration: const Duration(seconds: 2),
        ),
      );
      return;
    }

    // Temporarily replace pending confirmations with filtered ones
    final savedConfirmations = List<Map<String, dynamic>>.from(
      _pendingReceiptConfirmations,
    );
    _pendingReceiptConfirmations = filteredCosts;

    // Show first confirmation one by one
    await _showNextPendingReceiptDialog();

    // After all confirmations are done, restore original list
    if (_pendingReceiptConfirmations.isEmpty) {
      _pendingReceiptConfirmations = savedConfirmations;
    }
  }

  Future<void> _confirmAllPendingReceipts() async {
    if (_pendingReceiptConfirmations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'لا توجد تأكيدات معلقة'
                : 'No pending confirmations',
          ),
        ),
      );
      return;
    }

    // Show confirmation dialog
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            title: Text(
              widget.isArabic ? 'تأكيد الكل' : 'Confirm All Receipts',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
            ),
            content: Text(
              widget.isArabic
                  ? 'هل تريد تأكيد استلام جميع المدفوعات (${_pendingReceiptConfirmations.length} عنصر)؟'
                  : 'Confirm receipt of all ${_pendingReceiptConfirmations.length} payments?',
              style: GoogleFonts.poppins(),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(
                  widget.isArabic ? 'إلغاء' : 'Cancel',
                  style: GoogleFonts.poppins(),
                ),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green.shade600,
                ),
                child: Text(
                  widget.isArabic ? 'تأكيد الكل' : 'Confirm All',
                  style: GoogleFonts.poppins(color: Colors.white),
                ),
              ),
            ],
          ),
        ) ??
        false;

    if (!confirmed) return;

    setState(() => _declineLoading = true);

    try {
      final now = DateTime.now().toIso8601String();
      int successCount = 0;

      // Confirm each pending receipt
      for (final cost in _pendingReceiptConfirmations) {
        final costId = cost['id'] as String?;
        if (costId == null) continue;

        try {
          await Supabase.instance.client
              .from('operational_cost_submissions')
              .update({
                'fund_receipt_confirmed': true,
                'fund_receipt_confirmed_at': now,
                'fund_receipt_confirmed_by': _userId,
                'updated_at': now,
              })
              .eq('id', costId);

          successCount++;
        } catch (e) {
          debugPrint('[Wallet] Error confirming receipt $costId: $e');
        }
      }

      await _loadCostPayments();
      _checkPendingReceiptConfirmations();

      if (mounted) {
        setState(() {}); // Update UI with new pending confirmations count
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تأكيد $successCount من ${_pendingReceiptConfirmations.length} عنصر'
                  : 'Confirmed $successCount of ${_pendingReceiptConfirmations.length} items',
            ),
            backgroundColor: Colors.green.shade600,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      debugPrint('[Wallet] Error in batch receipt confirmation: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'حدث خطأ' : 'An error occurred'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _declineLoading = false);
      }
    }
  }

  Future<void> _confirmAllPendingAdvances() async {
    if (_pendingAdvanceConfirmations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic ? 'لا توجد سلفيات معلقة' : 'No pending advances',
          ),
        ),
      );
      return;
    }

    // Show confirmation dialog
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            title: Text(
              widget.isArabic ? 'تأكيد جميع السلف' : 'Confirm All Advances',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
            ),
            content: Text(
              widget.isArabic
                  ? 'هل تريد تأكيد استلام جميع السلف المعتمدة (${_pendingAdvanceConfirmations.length} عنصر)؟'
                  : 'Confirm receipt of all ${_pendingAdvanceConfirmations.length} advances?',
              style: GoogleFonts.poppins(),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(
                  widget.isArabic ? 'إلغاء' : 'Cancel',
                  style: GoogleFonts.poppins(),
                ),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal.shade600,
                ),
                child: Text(
                  widget.isArabic ? 'تأكيد الكل' : 'Confirm All',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ) ??
        false;

    if (!confirmed) return;

    setState(() => _declineLoading = true);

    try {
      final now = DateTime.now().toIso8601String();
      int successCount = 0;

      // Confirm each pending advance
      for (final advance in _pendingAdvanceConfirmations) {
        final advanceId = advance['id'] as String?;
        if (advanceId == null) continue;

        try {
          await Supabase.instance.client
              .from('advance_requests')
              .update({
                'fund_received_confirmed': true,
                'fund_received_confirmed_at': now,
                'fund_received_confirmed_by': _userId,
                'updated_at': now,
              })
              .eq('id', advanceId);

          successCount++;
        } catch (e) {
          debugPrint('[Wallet] Error confirming advance $advanceId: $e');
        }
      }

      // Reload the advances data from database and recheck confirmations
      await _loadAdvances();
      _checkPendingAdvanceConfirmations();

      if (mounted) {
        setState(() {}); // Update UI with new pending confirmations count
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تأكيد $successCount من ${_pendingAdvanceConfirmations.length} سلفة'
                  : 'Confirmed $successCount of ${_pendingAdvanceConfirmations.length} advances',
            ),
            backgroundColor: Colors.teal.shade600,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      debugPrint('[Wallet] Error in batch advance confirmation: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'حدث خطأ' : 'An error occurred'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _declineLoading = false);
      }
    }
  }

  /// High-priority blocking modal that appears automatically
  Future<void> _showHighPriorityBlockingReceiptModal() async {
    if (_pendingReceiptConfirmations.isEmpty) return;

    final cost = _pendingReceiptConfirmations.first;
    final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
    final amountSdg = amountCents / 100.0;
    final category = cost['expense_category'] as String? ?? 'Cost';
    var proofUrl = cost['payment_proof_url'] as String?;
    String? proofFilename;
    String? proofDocType;

    if (proofUrl != null && proofUrl.isNotEmpty) {
      proofFilename = proofUrl.split('/').last.split('?').first;
    }

    // Debug: Log what we received
    debugPrint('[Receipt Modal] Cost ID: ${cost['id']}');
    debugPrint('[Receipt Modal] Keys in cost data: ${cost.keys.toList()}');
    debugPrint('[Receipt Modal] proofUrl: $proofUrl');

    // Fallback: Check for other possible field names
    if ((proofUrl == null || proofUrl.isEmpty) &&
        cost.containsKey('receipt_url')) {
      proofUrl = cost['receipt_url'] as String?;
      debugPrint('[Receipt Modal] Found receipt_url instead: $proofUrl');
    }

    // IMPORTANT: do NOT fallback to supporting_documents for wallet receipt
    // confirmation. supporting_documents are submitter attachments, not
    // disbursement proof uploaded by finance.

    // Blob URLs are session-scoped (web) and often unusable later.
    // Treat blob/missing URLs as needing a persistent URL refresh from DB.
    final needsPersistentProofUrl = proofUrl == null ||
        proofUrl.isEmpty ||
        proofUrl.startsWith('blob:');

    // Try refreshing from the latest submission row and cost_attachments.
    if (needsPersistentProofUrl && cost['id'] != null) {
      try {
        final latestSubmission = await Supabase.instance.client
            .from('operational_cost_submissions')
            .select('payment_proof_url')
            .eq('id', cost['id'])
            .maybeSingle();

        final latestProofUrl = latestSubmission?['payment_proof_url'] as String?;
        if (latestProofUrl != null &&
            latestProofUrl.isNotEmpty &&
            !latestProofUrl.startsWith('blob:')) {
          proofUrl = latestProofUrl;
          proofFilename = proofUrl.split('/').last.split('?').first;
          debugPrint(
            '[Receipt Modal] Refreshed payment_proof_url from DB: $proofUrl',
          );
        }

        final attachments = await Supabase.instance.client
            .from('cost_attachments')
            .select('url')
            .eq('cost_id', cost['id'])
            .limit(1)
            .maybeSingle();
        final attachmentUrl = attachments?['url'] as String?;
        if (attachmentUrl != null &&
            attachmentUrl.isNotEmpty &&
            !attachmentUrl.startsWith('blob:')) {
          proofUrl = attachmentUrl;
          proofFilename = proofUrl.split('/').last.split('?').first;
          debugPrint('[Receipt Modal] Found in cost_attachments: $proofUrl');
        }
      } catch (e) {
        debugPrint('[Receipt Modal] No cost_attachments table or error: $e');
      }
    }

    final imageExtRegex = RegExp(
      r'\.(jpg|jpeg|png|gif|webp)(\?.*)?$',
      caseSensitive: false,
    );
    final isImage = (proofDocType != null &&
            proofDocType!.toLowerCase() == 'photo') ||
        (proofFilename != null && imageExtRegex.hasMatch(proofFilename!)) ||
        (proofUrl != null && imageExtRegex.hasMatch(proofUrl));
    debugPrint(
      '[Receipt Modal] isImage=$isImage, proofDocType=$proofDocType, proofFilename=$proofFilename',
    );

    // Use a safe URL for previewing images:
    // - if it's a storage-relative path, convert to a public https URL
    // - if it's a blob: url (web upload), keep it as-is
    String? displayProofUrl = proofUrl;
    if (displayProofUrl != null &&
        displayProofUrl.isNotEmpty &&
        !displayProofUrl.startsWith('http') &&
        !displayProofUrl.startsWith('blob:')) {
      displayProofUrl = 'https://storage.googleapis.com/$displayProofUrl';
    }

    // Load signature and bank account details if available
    // Load signature and bank account details if available
    String? savedSignatureBase64;
    Map<String, dynamic>? bankAccount;
    String? accountNumber;
    String? accountHolderName;
    String? bankName;
    String? bankBranch;
    String? userName;
    String? userRole;
    String? staffName;

    try {
      // Try to get user info from auth
      final authUser = Supabase.instance.client.auth.currentUser;
      userName =
          authUser?.userMetadata?['name'] ??
          authUser?.userMetadata?['full_name'] ??
          authUser?.email?.split('@').first ??
          'User';

      // Fetch bank account and role info
      final profileData = await Supabase.instance.client
          .from('profiles')
          .select('bank_account, role')
          .eq('id', _userId ?? '')
          .maybeSingle();

      debugPrint('[PROFILE] ProfileData: $profileData');

      if (profileData != null) {
        // Get role from the role field
        userRole = profileData['role'] ?? 'Field Staff';

        debugPrint('[PROFILE] User role: $userRole');
      }

      if (profileData != null) {
        var bankData = profileData['bank_account'];

        debugPrint('[BANK] Raw bankData: $bankData');
        debugPrint('[BANK] bankData type: ${bankData.runtimeType}');

        // Parse JSON string if necessary
        if (bankData is String) {
          debugPrint('[BANK] Parsing JSON string...');
          try {
            bankAccount = jsonDecode(bankData) as Map<String, dynamic>?;
            debugPrint('[BANK] Parsed to: $bankAccount');
          } catch (e) {
            debugPrint('[BANK] Failed to parse JSON: $e');
          }
        } else {
          bankAccount = bankData as Map<String, dynamic>?;
        }

        debugPrint('[BANK] Final bankAccount: $bankAccount');

        if (bankAccount != null) {
          accountNumber =
              bankAccount['account_number'] ??
              bankAccount['accountNumber'] ??
              bankAccount['AccountNumber'] ??
              bankAccount['number'] ??
              'N/A';
          accountHolderName =
              bankAccount['account_name'] ??
              bankAccount['accountHolderName'] ??
              bankAccount['account_holder_name'] ??
              bankAccount['holder_name'] ??
              bankAccount['name'] ??
              'N/A';
          bankName =
              bankAccount['bank_name'] ??
              bankAccount['bankName'] ??
              bankAccount['name'] ??
              bankAccount['bank'] ??
              'N/A';
          bankBranch =
              bankAccount['branch_code'] ??
              bankAccount['bankBranch'] ??
              bankAccount['bank_branch'] ??
              bankAccount['branch'] ??
              bankAccount['location'] ??
              'N/A';

          debugPrint(
            '[BANK] Account: $accountNumber, Holder: $accountHolderName, Bank: $bankName, Branch: $bankBranch',
          );
        }
      }
    } catch (e) {
      debugPrint('[BANK] Error loading bank details: $e');
    }

    // Set default values for user details
    staffName ??= userName ?? 'N/A';
    userRole ??= 'Field Staff';

    final signatureStrokes = <List<Offset>>[];
    bool useSaved = savedSignatureBase64 != null;

    if (!mounted) return;

    // Show blocking modal
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.87),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final hasSig = signatureStrokes.isNotEmpty;

          return Dialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(24),
            ),
            child: Container(
              width: MediaQuery.of(context).size.width * 0.95,
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.9,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Red urgent header
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.red.shade700,
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(24),
                        topRight: Radius.circular(24),
                      ),
                    ),
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.priority_high,
                            color: Colors.white,
                            size: 32,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          '⚠️ Receipt Upload - Action Required',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 18,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${_pendingReceiptConfirmations.indexOf(cost) + 1} of ${_pendingReceiptConfirmations.length}',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Content area - scrollable
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            proofUrl != null && proofUrl.isNotEmpty
                                ? 'Your cost submission has been approved and the receipt has been uploaded to the system.'
                                : 'Your cost submission has been approved. Please review and acknowledge receipt.',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              color: Colors.grey.shade700,
                            ),
                          ),
                          const SizedBox(height: 20),
                          // === RECEIPT IMAGE - SHOW FIRST & PROMINENTLY ===
                          if (proofUrl != null && proofUrl.isNotEmpty) ...[
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.teal.shade50,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: Colors.teal.shade300,
                                  width: 2,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Payment Receipt / إيصال الدفع',
                                    style: GoogleFonts.poppins(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.teal.shade900,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  if (isImage)
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(10),
                                      child: Container(
                                        color: Colors.white,
                                        width: double.infinity,
                                        child:
                                            (displayProofUrl?.startsWith(
                                                    'blob:') ??
                                                false)
                                                ? Image.network(
                                                    displayProofUrl!,
                                                    height: 420,
                                                    fit: BoxFit.contain,
                                                    errorBuilder:
                                                        (_, __, ___) =>
                                                            Container(
                                                      height: 420,
                                                      color: Colors
                                                          .grey.shade100,
                                                      child: const Center(
                                                        child: Icon(
                                                          Icons.broken_image,
                                                          color: Colors.grey,
                                                          size: 48,
                                                        ),
                                                      ),
                                                    ),
                                                  )
                                                : CachedNetworkImage(
                                                    imageUrl:
                                                        displayProofUrl ??
                                                            proofUrl!,
                                                    height: 420,
                                                    fit: BoxFit.contain,
                                                    placeholder: (_, __) =>
                                                        Container(
                                                      height: 420,
                                                      color: Colors
                                                          .grey.shade100,
                                                      child: const Center(
                                                        child:
                                                            CircularProgressIndicator(
                                                          strokeWidth: 2,
                                                        ),
                                                      ),
                                                    ),
                                                    errorWidget: (_, __, ___) =>
                                                        Container(
                                                      height: 420,
                                                      color: Colors
                                                          .grey.shade100,
                                                      child: const Center(
                                                        child: Icon(
                                                          Icons.broken_image,
                                                          color: Colors.grey,
                                                          size: 48,
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                      ),
                                    )
                                  else if (proofUrl.isNotEmpty)
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade50,
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: Colors.grey.shade300,
                                        ),
                                      ),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Icon(
                                                Icons.picture_as_pdf,
                                                color: Colors.red.shade600,
                                                size: 20,
                                              ),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  'Document / وثيقة',
                                                  style: GoogleFonts.poppins(
                                                    fontSize: 12,
                                                    fontWeight: FontWeight.w600,
                                                    color: Colors.grey.shade700,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 10),
                                          Container(
                                            width: double.infinity,
                                            padding: const EdgeInsets.all(12),
                                            decoration: BoxDecoration(
                                              color: Colors.white,
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              border: Border.all(
                                                color: Colors.grey.shade200,
                                              ),
                                            ),
                                            child: Text(
                                              proofUrl.split('/').last.split('?').first,
                                              style: GoogleFonts.poppins(
                                                fontSize: 11,
                                                color: Colors.grey.shade600,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 10),
                                          SizedBox(
                                            width: double.infinity,
                                            child: ElevatedButton.icon(
                                              onPressed: () async {
                                                try {
                                                  var urlToOpen =
                                                      proofUrl ?? '';
                                                  // Ensure URL is complete for Supabase storage
                                                  if (urlToOpen.isNotEmpty &&
                                                      !urlToOpen.startsWith(
                                                        'http',
                                                      )) {
                                                    urlToOpen =
                                                        'https://storage.googleapis.com/$urlToOpen';
                                                  }
                                                  final uri = Uri.tryParse(
                                                    urlToOpen,
                                                  );
                                                  if (uri != null &&
                                                      await canLaunchUrl(uri)) {
                                                    await launchUrl(
                                                      uri,
                                                      mode: LaunchMode
                                                          .externalApplication,
                                                    );
                                                  } else if (uri != null) {
                                                    // Fallback: try opening even if canLaunchUrl fails
                                                    try {
                                                      await launchUrl(
                                                        uri,
                                                        mode: LaunchMode
                                                            .externalApplication,
                                                      );
                                                    } catch (e) {
                                                      debugPrint(
                                                        '[Document Open] Failed to open: $e',
                                                      );
                                                      if (context.mounted) {
                                                        ScaffoldMessenger.of(
                                                          context,
                                                        ).showSnackBar(
                                                          SnackBar(
                                                            content: Text(
                                                              widget.isArabic
                                                                  ? 'فشل فتح المستند'
                                                                  : 'Failed to open document',
                                                            ),
                                                          ),
                                                        );
                                                      }
                                                    }
                                                  }
                                                } catch (e) {
                                                  debugPrint(
                                                    '[Document Open] Error: $e',
                                                  );
                                                }
                                              },
                                              icon: const Icon(
                                                Icons.open_in_new,
                                                size: 16,
                                              ),
                                              label: Text(
                                                'Open Full Document',
                                                style: GoogleFonts.poppins(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor:
                                                    Colors.teal.shade600,
                                                foregroundColor: Colors.white,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      vertical: 10,
                                                    ),
                                                shape: RoundedRectangleBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 20),
                            // Receipt Confirmation Status
                            if (cost['fund_receipt_confirmed'] == true)
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.green.shade50,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: Colors.green.shade300,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.check_circle,
                                      color: Colors.green.shade700,
                                      size: 20,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Receipt confirmed ✓',
                                            style: GoogleFonts.poppins(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: Colors.green.shade700,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            cost['fund_receipt_confirmed_at'] !=
                                                    null
                                                ? DateFormat(
                                                    'dd MMM yyyy, HH:mm',
                                                  ).format(
                                                    DateTime.parse(
                                                      cost['fund_receipt_confirmed_at'],
                                                    ),
                                                  )
                                                : 'Confirmed',
                                            style: GoogleFonts.poppins(
                                              fontSize: 10,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            const SizedBox(height: 20),
                          ] else ...[
                            Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.orange.shade50,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: Colors.orange.shade300,
                                  width: 2,
                                ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.hourglass_empty,
                                        color: Colors.orange.shade600,
                                        size: 20,
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          'Receipt Pending',
                                          style: GoogleFonts.poppins(
                                            fontSize: 13,
                                            color: Colors.orange.shade900,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    'The finance team is preparing your receipt. It will appear here shortly. You can still acknowledge once you receive it.',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: Colors.orange.shade800,
                                      height: 1.4,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.shade100,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.info_outline,
                                          size: 18,
                                          color: Colors.orange.shade700,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            'Amount: ${amountSdg.toStringAsFixed(2)} SDG',
                                            style: GoogleFonts.poppins(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: Colors.orange.shade900,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 20),
                          ],
                          // Submission details card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.blue.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.blue.shade200),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Submission & Approval Details:',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: Colors.blue.shade900,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _buildDetailRow(
                                  'Category',
                                  category,
                                  Colors.blue.shade700,
                                  Colors.blue.shade900,
                                ),
                                const SizedBox(height: 10),
                                _buildDetailRow(
                                  'Amount',
                                  '${amountSdg.toStringAsFixed(2)} SDG',
                                  Colors.blue.shade700,
                                  Colors.teal.shade700,
                                  bold: true,
                                ),
                                const SizedBox(height: 10),
                                if (cost['submitted_by'] != null)
                                  _buildDetailRow(
                                    'Submitted By',
                                    cost['submitted_by_name'] as String? ??
                                        'Field Staff',
                                    Colors.blue.shade700,
                                    Colors.blue.shade900,
                                  ),
                                if (cost['submitted_by'] != null)
                                  const SizedBox(height: 10),
                                if (cost['submitted_at'] != null)
                                  _buildDetailRow(
                                    'Submitted On',
                                    _formatDate(cost['submitted_at']),
                                    Colors.blue.shade700,
                                    Colors.blue.shade900,
                                  ),
                                if (cost['submitted_at'] != null)
                                  const SizedBox(height: 10),
                                if (cost['approved_by'] != null)
                                  _buildDetailRow(
                                    'Approved By',
                                    cost['approved_by_name'] as String? ??
                                        'Finance Team',
                                    Colors.blue.shade700,
                                    Colors.green.shade700,
                                    bold: true,
                                  ),
                                if (cost['approved_by'] != null)
                                  const SizedBox(height: 10),
                                if (cost['approved_at'] != null)
                                  _buildDetailRow(
                                    'Approved On',
                                    _formatDate(cost['approved_at']),
                                    Colors.blue.shade700,
                                    Colors.green.shade700,
                                  ),
                                if (cost['site_name'] != null) ...[
                                  const SizedBox(height: 10),
                                  _buildDetailRow(
                                    'Site',
                                    cost['site_name'] as String? ?? 'N/A',
                                    Colors.blue.shade700,
                                    Colors.blue.shade900,
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Account Details Section
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.purple.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.purple.shade200),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Your Account Details:',
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: Colors.purple.shade900,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                _buildDetailRow(
                                  'Staff Name',
                                  staffName ?? 'N/A',
                                  Colors.purple.shade700,
                                  Colors.purple.shade900,
                                ),
                                const SizedBox(height: 10),
                                _buildDetailRow(
                                  'User ID',
                                  _userId?.substring(0, 8).toUpperCase() ??
                                      'N/A',
                                  Colors.purple.shade700,
                                  Colors.purple.shade900,
                                ),
                                const SizedBox(height: 10),
                                _buildDetailRow(
                                  'Role',
                                  userRole ?? 'N/A',
                                  Colors.purple.shade700,
                                  Colors.purple.shade900,
                                ),
                                const SizedBox(height: 10),
                                _buildDetailRow(
                                  'Wallet Balance',
                                  '${_currentBalance.toStringAsFixed(2)} SDG',
                                  Colors.purple.shade700,
                                  Colors.teal.shade700,
                                  bold: true,
                                ),
                                // Bank Account Details Section
                                if (bankAccount != null) ...[
                                  const SizedBox(height: 16),
                                  Text(
                                    'Bank Account Information:',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12,
                                      color: Colors.orange.shade700,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  _buildDetailRow(
                                    'Account Holder',
                                    accountHolderName ?? 'N/A',
                                    Colors.orange.shade700,
                                    Colors.orange.shade900,
                                  ),
                                  const SizedBox(height: 8),
                                  _buildDetailRow(
                                    'Bank Name',
                                    bankName ?? 'N/A',
                                    Colors.orange.shade700,
                                    Colors.orange.shade900,
                                  ),
                                  const SizedBox(height: 8),
                                  _buildDetailRow(
                                    'Account Number',
                                    accountNumber ?? 'N/A',
                                    Colors.orange.shade700,
                                    Colors.orange.shade900,
                                    bold: true,
                                  ),
                                  const SizedBox(height: 8),
                                  _buildDetailRow(
                                    'Branch',
                                    bankBranch ?? 'N/A',
                                    Colors.orange.shade700,
                                    Colors.orange.shade900,
                                  ),
                                ] else ...[
                                  const SizedBox(height: 12),
                                  Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.orange.shade50,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color: Colors.orange.shade300,
                                      ),
                                    ),
                                    child: Text(
                                      '⚠️ Bank account information not configured. Please add your bank account details in Profile Settings.',
                                      style: GoogleFonts.poppins(
                                        fontSize: 12,
                                        color: Colors.orange.shade700,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Signature section
                          Text(
                            'Your Signature / توقيعك',
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 10),
                          const SizedBox(height: 12),
                          // Signature canvas or display
                          if (useSaved && savedSignatureBase64 != null)
                            Container(
                              height: 180,
                              width: double.infinity,
                              decoration: BoxDecoration(
                                color: Colors.grey.shade50,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: Colors.teal.shade300,
                                  width: 2,
                                ),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.memory(
                                  base64Decode(savedSignatureBase64),
                                  fit: BoxFit.contain,
                                ),
                              ),
                            )
                          else
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Container(
                                  height: 180,
                                  width: double.infinity,
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: Colors.teal.shade400,
                                      width: 2,
                                    ),
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: GestureDetector(
                                      onPanStart: (d) {
                                        setDialogState(
                                          () => signatureStrokes.add([
                                            d.localPosition,
                                          ]),
                                        );
                                      },
                                      onPanUpdate: (d) {
                                        setDialogState(
                                          () => signatureStrokes.last.add(
                                            d.localPosition,
                                          ),
                                        );
                                      },
                                      child: CustomPaint(
                                        painter: _SignaturePainter(
                                          signatureStrokes,
                                        ),
                                        child: Container(),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                if (signatureStrokes.isNotEmpty)
                                  TextButton.icon(
                                    onPressed: () => setDialogState(
                                      () => signatureStrokes.clear(),
                                    ),
                                    icon: const Icon(Icons.refresh, size: 14),
                                    label: Text(
                                      'Clear',
                                      style: GoogleFonts.poppins(fontSize: 11),
                                    ),
                                    style: TextButton.styleFrom(
                                      foregroundColor: Colors.teal,
                                    ),
                                  ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ),
                  // Action buttons
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(color: Colors.grey.shade200),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () {
                              Navigator.pop(ctx);
                              _declineReceiptConfirmation(cost);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.orange.shade600,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: Text(
                              'Not Yet Received',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: hasSig
                                ? () {
                                    Navigator.pop(ctx);
                                    _confirmReceiptWithSignature(
                                      cost,
                                      useSaved
                                          ? savedSignatureBase64
                                          : signatureStrokes,
                                    );
                                  }
                                : null,
                            icon: const Icon(Icons.check_circle, size: 16),
                            label: Text(
                              'Acknowledge Receipt',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.green.shade600,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: Colors.grey.shade300,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildDetailRow(
    String label,
    String value,
    Color labelColor,
    Color valueColor, {
    bool bold = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: GoogleFonts.poppins(fontSize: 12, color: labelColor),
        ),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
              color: valueColor,
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _showNextPendingReceiptDialog() async {
    debugPrint(
      '[Wallet] _showNextPendingReceiptDialog: ${_pendingReceiptConfirmations.length} pending receipts',
    );
    if (_pendingReceiptConfirmations.isEmpty) {
      debugPrint('[Wallet] No pending receipt confirmations found!');
      return;
    }

    final cost = _pendingReceiptConfirmations.first;
    _currentPendingReceipt = cost;

    final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
    final amountSdg = amountCents / 100.0;
    final category = cost['expense_category'] as String? ?? 'Cost';
    final siteName = cost['site_name'] as String? ?? 'N/A';
    final description = cost['description'] as String? ?? '';
    var proofUrl = cost['payment_proof_url'] as String?;

    // IMPORTANT: no supporting_documents fallback here.
    // For this modal, use payment_proof_url only (finance disbursement proof).

    final categoryLabel =
        {
          'permits': 'Permits & Licenses',
          'incentives': 'Incentives & Allowances',
          'communications': 'Internet & Comms',
          'training': 'Training',
          'transport': 'Transportation',
          'general_transport': 'Transportation',
          'equipment': 'Equipment & Supplies',
          'printing': 'Printing & Stationery',
          'meetings': 'Meetings',
          'office_admin': 'Office Admin',
          'other': 'Other',
        }[category] ??
        category;

    // Load signature if available
    String? savedSignatureBase64;
    try {
      final profileData = await Supabase.instance.client
          .from('profiles')
          .select('signature_base64')
          .eq('id', _userId ?? '')
          .maybeSingle();
      savedSignatureBase64 = profileData?['signature_base64'] as String?;
    } catch (_) {}

    final signatureStrokes = <List<Offset>>[];
    bool useSaved = savedSignatureBase64 != null;

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final isImage =
              proofUrl != null &&
              RegExp(
                r'\.(jpg|jpeg|png|gif|webp)$',
                caseSensitive: false,
              ).hasMatch(proofUrl);
          final hasSig = useSaved
              ? savedSignatureBase64 != null
              : signatureStrokes.isNotEmpty;

          return AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            insetPadding: const EdgeInsets.all(16),
            titlePadding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            contentPadding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.receipt_long,
                    color: Colors.orange.shade700,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Confirm Receipt / تأكيد الاستلام',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        '${_pendingReceiptConfirmations.indexOf(cost) + 1} of ${_pendingReceiptConfirmations.length}',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 10),

                    // Cost Details Section
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Cost Details / تفاصيل الصرف',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: Colors.blue.shade900,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Category:',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                              Text(
                                categoryLabel,
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.blue.shade900,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Amount:',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                              Text(
                                '${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amountSdg)} SDG',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.teal.shade700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Site:',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                              Text(
                                siteName,
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.blue.shade900,
                                ),
                              ),
                            ],
                          ),
                          if (description.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Activity/Description:',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: Colors.blue.shade700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  description,
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: Colors.blue.shade900,
                                  ),
                                ),
                              ],
                            ),
                          ],
                          if (cost['submitted_at'] != null) ...[
                            const SizedBox(height: 6),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Submitted On:',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: Colors.blue.shade700,
                                  ),
                                ),
                                Expanded(
                                  child: Text(
                                    DateFormat('dd MMM yyyy, hh:mm a').format(
                                      DateTime.parse(
                                        cost['submitted_at'] as String,
                                      ),
                                    ),
                                    style: GoogleFonts.poppins(
                                      fontSize: 10,
                                      color: Colors.blue.shade900,
                                      fontWeight: FontWeight.w500,
                                    ),
                                    textAlign: TextAlign.end,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Payment Receipt Section - Full Display
                    if (proofUrl != null && proofUrl.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.green.shade50,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.green.shade300),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Header with title
                            Row(
                              children: [
                                Icon(
                                  Icons.receipt,
                                  color: Colors.green.shade700,
                                  size: 20,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Payment Receipt / إيصال الدفع',
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.green.shade900,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            // Receipt Image
                            if (isImage)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: Container(
                                  color: Colors.white,
                                  child: CachedNetworkImage(
                                    imageUrl: proofUrl,
                                    height: 200,
                                    width: double.infinity,
                                    fit: BoxFit.contain,
                                    placeholder: (_, _) => Container(
                                      height: 200,
                                      color: Colors.grey.shade100,
                                      child: const Center(
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      ),
                                    ),
                                    errorWidget: (_, _, _) => Container(
                                      height: 200,
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade100,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: const Center(
                                        child: Icon(
                                          Icons.broken_image,
                                          color: Colors.grey,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              )
                            else
                              // Document receipt preview (not an image)
                              Container(
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade50,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: Colors.grey.shade200,
                                  ),
                                ),
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    // File info row
                                    Row(
                                      children: [
                                        // Document icon box
                                        Container(
                                          width: 48,
                                          height: 48,
                                          decoration: BoxDecoration(
                                            color: Colors.teal.shade200,
                                            borderRadius: BorderRadius.circular(
                                              6,
                                            ),
                                          ),
                                          child: Center(
                                            child: Icon(
                                              Icons.description_outlined,
                                              color: Colors.teal.shade700,
                                              size: 24,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        // File details
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                'Document / وثيقة',
                                                style: GoogleFonts.poppins(
                                                  fontSize: 12,
                                                  color: Colors.grey.shade600,
                                                ),
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                'Payment Receipt',
                                                style: GoogleFonts.poppins(
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 13,
                                                  color: Colors.grey.shade800,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    // Open Document Button
                                    SizedBox(
                                      width: double.infinity,
                                      child: ElevatedButton.icon(
                                        onPressed: () async {
                                          final uri = Uri.tryParse(
                                            proofUrl ?? '',
                                          );
                                          if (uri != null &&
                                              await canLaunchUrl(uri)) {
                                            await launchUrl(
                                              uri,
                                              mode: LaunchMode
                                                  .externalApplication,
                                            );
                                          }
                                        },
                                        icon: const Icon(
                                          Icons.download,
                                          size: 16,
                                        ),
                                        label: Text(
                                          'Open Full Document',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: Colors.teal.shade600,
                                          foregroundColor: Colors.white,
                                          padding: const EdgeInsets.symmetric(
                                            vertical: 10,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            const SizedBox(height: 12),
                            // Receipt Status
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.check_circle,
                                    color: Colors.green.shade700,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Receipt confirmed ✓',
                                          style: GoogleFonts.poppins(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: Colors.green.shade700,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          cost['fund_receipt_confirmed_at'] !=
                                                  null
                                              ? DateFormat(
                                                  'dd MMM yyyy, HH:mm',
                                                ).format(
                                                  DateTime.parse(
                                                    cost['fund_receipt_confirmed_at'],
                                                  ),
                                                )
                                              : 'Confirmed',
                                          style: GoogleFonts.poppins(
                                            fontSize: 11,
                                            color: Colors.grey.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ] else ...[
                      // No receipt uploaded - styled message
                      Container(
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: Colors.red.shade300,
                            width: 2,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Receipt label
                            Text(
                              'Payment Receipt / إيصال الدفع',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                                color: Colors.red.shade600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            // No receipt message box
                            Container(
                              decoration: BoxDecoration(
                                color: Colors.red.shade50,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  // Placeholder icon
                                  Container(
                                    width: 48,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      color: Colors.red.shade200,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Center(
                                      child: Icon(
                                        Icons.description_outlined,
                                        color: Colors.red.shade600,
                                        size: 24,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  // Message
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Document / وثيقة',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                            color: Colors.grey,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'No receipt uploaded',
                                          style: GoogleFonts.poppins(
                                            fontWeight: FontWeight.w500,
                                            fontSize: 13,
                                            color: Colors.red.shade600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Signature Section
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Your Signature / توقيعك',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (savedSignatureBase64 != null)
                          Row(
                            children: [
                              GestureDetector(
                                onTap: () =>
                                    setDialogState(() => useSaved = true),
                                child: Text(
                                  'Use Saved',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: useSaved
                                        ? Colors.teal
                                        : Colors.grey.shade500,
                                    fontWeight: useSaved
                                        ? FontWeight.w700
                                        : FontWeight.w400,
                                    decoration: useSaved
                                        ? TextDecoration.underline
                                        : TextDecoration.none,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              GestureDetector(
                                onTap: () => setDialogState(() {
                                  useSaved = false;
                                  signatureStrokes.clear();
                                }),
                                child: Text(
                                  'Draw New',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: !useSaved
                                        ? Colors.teal
                                        : Colors.grey.shade500,
                                    fontWeight: !useSaved
                                        ? FontWeight.w700
                                        : FontWeight.w400,
                                    decoration: !useSaved
                                        ? TextDecoration.underline
                                        : TextDecoration.none,
                                  ),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (useSaved && savedSignatureBase64 != null)
                      Container(
                        height: 100,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.teal.shade300),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            base64Decode(savedSignatureBase64),
                            fit: BoxFit.contain,
                          ),
                        ),
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Container(
                            height: 100,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: Colors.teal.shade300,
                                width: 1.5,
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: GestureDetector(
                                onPanStart: (d) {
                                  setDialogState(
                                    () =>
                                        signatureStrokes.add([d.localPosition]),
                                  );
                                },
                                onPanUpdate: (d) {
                                  setDialogState(
                                    () => signatureStrokes.last.add(
                                      d.localPosition,
                                    ),
                                  );
                                },
                                child: CustomPaint(
                                  painter: _SignaturePainter(signatureStrokes),
                                  child: Container(),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          TextButton.icon(
                            onPressed: () =>
                                setDialogState(() => signatureStrokes.clear()),
                            icon: const Icon(Icons.refresh, size: 13),
                            label: Text(
                              'Clear',
                              style: GoogleFonts.poppins(fontSize: 11),
                            ),
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.grey.shade600,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 10),
                  ],
                ),
              ),
            ),
            actionsPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            actions: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ElevatedButton(
                    onPressed: () async {
                      Navigator.pop(ctx);
                      await Future.delayed(const Duration(milliseconds: 100));
                      await _declineReceiptConfirmation(cost);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange.shade600,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: Text(
                      'Not Yet Received',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: hasSig
                        ? () async {
                            Navigator.pop(ctx);
                            await Future.delayed(
                              const Duration(milliseconds: 100),
                            );
                            await _confirmReceiptWithSignature(
                              cost,
                              useSaved
                                  ? savedSignatureBase64
                                  : signatureStrokes,
                            );
                          }
                        : null,
                    icon: const Icon(Icons.verified, size: 16),
                    label: Text(
                      'Confirm Receipt',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal.shade600,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: Colors.grey.shade300,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _declineReceiptConfirmation(Map<String, dynamic> cost) async {
    final costId = cost['id'] as String?;
    final amountSdg = ((cost['amount_cents'] as num?)?.toInt() ?? 0) / 100.0;
    final category = cost['expense_category'] as String? ?? 'Cost';

    if (costId == null) return;

    setState(() => _declineLoading = true);

    try {
      final now = DateTime.now().toIso8601String();

      // Mark receipt as not confirmed and record when user declined it
      // This prevents showing the modal again until supervisor/finance resends it
      await Supabase.instance.client
          .from('operational_cost_submissions')
          .update({
            'fund_receipt_confirmed': false,
            'fund_receipt_confirmed_at': null,
            'receipt_declined_at':
                now, // Track when user marked as "Not Yet Received"
            'updated_at': now,
          })
          .eq('id', costId);

      debugPrint('[Wallet] Marked receipt as not received for: $costId');

      // Send notifications to supervisor, admin, and finance with error handling
      try {
        // Notify admin
        await Supabase.instance.client.from('notification_broadcast').insert({
          'recipient_type': 'admin',
          'sender_id': _userId,
          'title': '$category Payment Not Yet Received',
          'title_ar': 'لم يتم استلام دفعة $category بعد',
          'message':
              'User has indicated they have not received this payment yet. Please resend.',
          'message_ar':
              'أفاد المستخدم بأنه لم يستلم هذه الدفعة بعد. يرجى إعادة الإرسال.',
          'notification_type': 'cost_payment_not_received',
          'related_id': costId,
          'related_type': 'cost_submission',
          'created_at': DateTime.now().toIso8601String(),
        });

        // Also notify supervisor
        await Supabase.instance.client.from('notification_broadcast').insert({
          'recipient_type': 'supervisor',
          'sender_id': _userId,
          'title': '$category Payment Not Yet Received',
          'title_ar': 'لم يتم استلام دفعة $category بعد',
          'message':
              'Your staff member has indicated they have not received this payment yet.',
          'message_ar': 'أفاد عضو فريقك بأنه لم يستلم هذه الدفعة بعد.',
          'notification_type': 'cost_payment_not_received',
          'related_id': costId,
          'related_type': 'cost_submission',
          'created_at': DateTime.now().toIso8601String(),
        });
      } catch (e) {
        debugPrint('[Wallet] Notification error: $e');
      }

      // Reload cost payments after a brief delay
      await Future.delayed(const Duration(milliseconds: 300));
      await _loadCostPayments();
      _checkPendingReceiptConfirmations();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تسجيل عدم الاستلام ✓ تم إخطار المالية والمشرف'
                  : 'Marked as Not Yet Received ✓ Supervisor & Finance notified',
            ),
            backgroundColor: Colors.orange.shade600,
            duration: const Duration(seconds: 3),
          ),
        );

        // Show next pending receipt if any exists (but not the same one again)
        if (_pendingReceiptConfirmations.isNotEmpty) {
          await Future.delayed(const Duration(milliseconds: 600));
          if (mounted && _pendingReceiptConfirmations.isNotEmpty) {
            await _showHighPriorityBlockingReceiptModal();
          }
        }
      }
    } catch (e, st) {
      debugPrint('[Wallet] Error declining receipt confirmation: $e');
      debugPrint('[Wallet] Stack trace: $st');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'خطأ: ${e.toString()}'
                  : 'Error: ${e.toString()}',
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _declineLoading = false);
      }
    }
  }

  Future<void> _showNextPendingAdvanceDialog() async {
    if (_pendingAdvanceConfirmations.isEmpty) return;
    final advance = _pendingAdvanceConfirmations.first;
    final currentIndex = _pendingAdvanceConfirmations.indexOf(advance) + 1;
    final totalCount = _pendingAdvanceConfirmations.length;

    final requestedAmount =
        (advance['requested_amount'] as num?)?.toDouble() ?? 0.0;
    final approvedAmount =
        (advance['approved_amount'] as num?)?.toDouble() ?? requestedAmount;
    final disbursedAmount = approvedAmount;
    final siteName = advance['site_name'] as String? ?? 'Site Visit';
    var proofUrl = advance['payment_proof_url'] as String?;

    // Fallback to supporting_documents if payment_proof_url is empty
    if ((proofUrl == null || proofUrl.isEmpty) &&
        advance['supporting_documents'] != null) {
      final docs = advance['supporting_documents'] as List?;
      if (docs != null && docs.isNotEmpty) {
        proofUrl = (docs.first as String?);
        debugPrint(
          '[Advance Modal] Using receipt from supporting_documents: $proofUrl',
        );
      }
    }

    final proofNotes = advance['payment_proof_notes'] as String?;
    final isImage =
        proofUrl != null &&
        RegExp(
          r'\.(jpg|jpeg|png|gif|webp)$',
          caseSensitive: false,
        ).hasMatch(proofUrl);

    if (!mounted) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        insetPadding: const EdgeInsets.all(16),
        titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
        contentPadding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    Icons.directions_car,
                    color: Colors.amber.shade700,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Transport Advance Confirmation',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        'تأكيد استلام سلفة النقل',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Grouping indicator
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$currentIndex of $totalCount',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Colors.amber.shade800,
                ),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'You have a pending transport advance receipt that requires confirmation.',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.grey.shade700,
                ),
              ),
              Text(
                'لديك سلفة نقل معلقة تتطلب تأكيد الاستلام.',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                ),
                textDirection: ui.TextDirection.rtl,
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.place,
                          color: Colors.amber.shade700,
                          size: 16,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            siteName,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      '${NumberFormat.currency(symbol: '', decimalDigits: 2).format(disbursedAmount)} SDG',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w800,
                        fontSize: 22,
                        color: Colors.amber.shade800,
                      ),
                    ),
                  ],
                ),
              ),
              // ── Payment Proof Image - PROMINENTLY DISPLAYED ─────────────
              if (proofUrl != null && proofUrl.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  'Payment Receipt / إيصال الدفع',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: Colors.amber.shade900,
                  ),
                ),
                const SizedBox(height: 10),
                if (isImage)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      color: Colors.white,
                      width: double.infinity,
                      child: CachedNetworkImage(
                        imageUrl: proofUrl,
                        height: 200,
                        fit: BoxFit.contain,
                        placeholder: (_, __) => Container(
                          height: 200,
                          color: Colors.grey.shade100,
                          child: const Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                        errorWidget: (_, __, ___) => Container(
                          height: 200,
                          color: Colors.grey.shade100,
                          child: const Center(
                            child: Icon(
                              Icons.broken_image,
                              color: Colors.grey,
                              size: 48,
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                else
                  // Document receipt preview (not an image)
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // File info row
                        Row(
                          children: [
                            // Document icon box
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: Colors.amber.shade200,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Center(
                                child: Icon(
                                  Icons.description_outlined,
                                  color: Colors.amber.shade700,
                                  size: 24,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            // File details
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Document / وثيقة',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Payment Receipt',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
                                      color: Colors.grey.shade800,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        // Open Document Button
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              final uri = Uri.tryParse(proofUrl ?? '');
                              if (uri != null && await canLaunchUrl(uri)) {
                                await launchUrl(
                                  uri,
                                  mode: LaunchMode.externalApplication,
                                );
                              }
                            },
                            icon: const Icon(Icons.download, size: 16),
                            label: Text(
                              'Open Full Document',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.amber.shade600,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 10),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (proofNotes != null && proofNotes.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade300),
                    ),
                    child: Text(
                      'Finance Notes: "$proofNotes"',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.grey.shade700,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ] else ...[
                const SizedBox(height: 16),
                // No receipt uploaded - styled message
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.red.shade300, width: 2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Receipt label
                      Text(
                        'Payment Receipt / إيصال الدفع',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                          color: Colors.red.shade600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      // No receipt message box
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            // Placeholder icon
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: Colors.red.shade200,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Center(
                                child: Icon(
                                  Icons.description_outlined,
                                  color: Colors.red.shade600,
                                  size: 24,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            // Message
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Document / وثيقة',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: Colors.grey,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'No receipt uploaded',
                                    style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w500,
                                      fontSize: 13,
                                      color: Colors.red.shade600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: Colors.blue.shade700,
                      size: 18,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Please confirm receipt or mark as not yet received.',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.blue.shade900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await Future.delayed(const Duration(milliseconds: 100));
              await _declineAdvanceConfirmation(advance);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange.shade600,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              'Not Yet Received / لم يتم الاستلام بعد',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
          ),
          ElevatedButton.icon(
            onPressed: () async {
              Navigator.pop(ctx);
              await Future.delayed(const Duration(milliseconds: 100));
              await _confirmAdvanceReceipt(advance);
            },
            icon: const Icon(Icons.verified, size: 16),
            label: Text(
              'Confirm Receipt / تأكيد الاستلام',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.amber.shade700,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _declineAdvanceConfirmation(Map<String, dynamic> advance) async {
    final advanceId = advance['id'] as String?;
    if (advanceId == null) return;
    try {
      final now = DateTime.now().toIso8601String();
      final existingMeta = Map<String, dynamic>.from(
        (advance['metadata'] as Map?)?.cast<String, dynamic>() ?? {},
      );
      existingMeta['receipt_decline'] = {
        'declined': true,
        'declinedAt': now,
        'declinedBy': _userId,
        'resendRequested': true,
        'resendStatus': 'pending_finance',
        'resendRequestedAt': now,
        '_message': 'Advance not yet received; awaiting reconfirmation',
      };
      await Supabase.instance.client
          .from('down_payment_requests')
          .update({'metadata': existingMeta, 'updated_at': now})
          .eq('id', advanceId);
      try {
        await _notifyNotReceivedToFinanceAndApprovers(
          title: 'Transport Advance Not Yet Received',
          titleAr: 'لم يتم استلام سلفة النقل',
          message:
              'Field user marked transport advance as Not Yet Received for site ${advance['site_name'] ?? ''}. Finance should resend; admin/supervisor/coordinators are notified.',
          messageAr:
              'اختار المستخدم الميداني "لم يتم الاستلام بعد" لسلفة النقل. على المالية إعادة الإرسال وقد تم إشعار الإدارة/المشرفين/المنسقين.',
          notificationType: 'advance_not_received',
          relatedId: advanceId,
          relatedType: 'down_payment_request',
        );
      } catch (_) {}
      await Future.delayed(const Duration(milliseconds: 300));
      await _loadAdvances();
      _checkPendingAdvanceConfirmations();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تسجيل عدم الاستلام وإشعار الإدارة/المشرفين/المنسقين/المالية. يمكنك متابعة العمل الآن.'
                  : 'Marked as Not Yet Received. Admin/supervisor/coordinator/finance were notified. You can continue using the app.',
            ),
            backgroundColor: Colors.orange.shade600,
            duration: const Duration(seconds: 3),
          ),
        );
        // Don't force another blocking popup immediately after decline.
      }
    } catch (e) {
      debugPrint('[Wallet] Error declining advance confirmation: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'فشل الرفض'
                  : 'Failed to decline advance receipt',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _confirmCostPaymentReceipt(Map<String, dynamic> cost) async {
    final costId = cost['id'] as String?;
    if (costId == null) return;

    final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
    final amountSdg = amountCents / 100.0;
    final category = cost['expense_category'] as String? ?? 'Cost Submission';
    final proofUrl = cost['payment_proof_url'] as String?;
    final categoryLabel =
        {
          'permits': 'Permits & Licenses',
          'incentives': 'Incentives & Allowances',
          'communications': 'Internet & Comms',
          'training': 'Training',
          'transport': 'Transportation',
          'general_transport': 'Transportation',
          'equipment': 'Equipment & Supplies',
          'printing': 'Printing & Stationery',
          'meetings': 'Meetings',
          'office_admin': 'Office Admin',
          'other': 'Other',
        }[category] ??
        category;

    // Step 1: Load saved signature from profile (non-blocking)
    String? savedSignatureBase64;
    try {
      final profileData = await Supabase.instance.client
          .from('profiles')
          .select('signature_base64')
          .eq('id', _userId ?? '')
          .maybeSingle();
      savedSignatureBase64 = profileData?['signature_base64'] as String?;
    } catch (_) {}

    final notesController = TextEditingController();
    final signatureStrokes = <List<Offset>>[];
    bool useSaved = savedSignatureBase64 != null;

    if (!mounted) return;

    // Step 2: Show dialog with receipt preview + signature
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final hasSig = useSaved
              ? savedSignatureBase64 != null
              : signatureStrokes.isNotEmpty;
          final isImage =
              proofUrl != null &&
              RegExp(
                r'\.(jpg|jpeg|png|gif|webp)$',
                caseSensitive: false,
              ).hasMatch(proofUrl);

          return AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            titlePadding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            contentPadding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            title: Row(
              children: [
                const Icon(Icons.receipt_long, color: Colors.teal, size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Confirm Cost Payment Receipt',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        '\u062a\u0623\u0643\u064a\u062f \u0627\u0633\u062a\u0644\u0627\u0645 \u062f\u0641\u0639\u0629 \u0627\u0644\u062a\u0643\u0627\u0644\u064a\u0641',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 10),

                    // Cost Submission Details Section
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Cost Submission Details / تفاصيل طلب التكاليف',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: Colors.blue.shade900,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Category:',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                              Text(
                                categoryLabel,
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.blue.shade900,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Amount:',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                              Text(
                                '${amountSdg.toStringAsFixed(2)} SDG',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.teal.shade700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Status:',
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color:
                                      (cost['status'] as String?)
                                              ?.toLowerCase() ==
                                          'paid'
                                      ? Colors.green.shade100
                                      : Colors.orange.shade100,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  (cost['status'] as String?)?.toUpperCase() ??
                                      'UNKNOWN',
                                  style: GoogleFonts.poppins(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color:
                                        (cost['status'] as String?)
                                                ?.toLowerCase() ==
                                            'paid'
                                        ? Colors.green.shade900
                                        : Colors.orange.shade900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (cost['submitted_at'] != null) ...[
                            const SizedBox(height: 6),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Submitted:',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: Colors.blue.shade700,
                                  ),
                                ),
                                Text(
                                  DateTime.parse(
                                    cost['submitted_at'] as String,
                                  ).toString().split('.').first,
                                  style: GoogleFonts.poppins(
                                    fontSize: 10,
                                    color: Colors.blue.shade700,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Payment receipt preview
                    if (proofUrl != null && proofUrl.isNotEmpty) ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Payment Receipt / إيصال الدفع:',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.teal.shade700,
                            ),
                          ),
                          if (isImage)
                            Tooltip(
                              message: 'Take screenshot of receipt',
                              child: InkWell(
                                onTap: () async {
                                  try {
                                    final image =
                                        await _receiptScreenshotController
                                            .capture();
                                    if (image != null) {
                                      final directory =
                                          await getApplicationDocumentsDirectory();
                                      final imagePath =
                                          '${directory.path}/receipt_${DateTime.now().millisecondsSinceEpoch}.png';
                                      final imageFile = File(imagePath);
                                      await imageFile.writeAsBytes(image);

                                      if (mounted) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          SnackBar(
                                            content: Text(
                                              widget.isArabic
                                                  ? '\u062a\u0645 \u062d\u0641\u0638 \u0644\u0642\u0637\u0629 \u0627\u0644\u0634\u0627\u0634\u0629'
                                                  : 'Screenshot saved',
                                            ),
                                            backgroundColor:
                                                Colors.teal.shade600,
                                            duration: const Duration(
                                              seconds: 2,
                                            ),
                                          ),
                                        );
                                      }
                                    }
                                  } catch (e) {
                                    debugPrint('[Wallet] Screenshot error: $e');
                                    if (mounted) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            widget.isArabic
                                                ? '\u0641\u0634\u0644 \u062d\u0641\u0638 \u0644\u0642\u0637\u0629'
                                                : 'Failed to save screenshot',
                                          ),
                                          backgroundColor: Colors.red,
                                        ),
                                      );
                                    }
                                  }
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(4),
                                  child: Icon(
                                    Icons.photo_camera_outlined,
                                    color: Colors.teal.shade700,
                                    size: 18,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      if (isImage)
                        Screenshot(
                          controller: _receiptScreenshotController,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              color: Colors.white,
                              child: CachedNetworkImage(
                                imageUrl: proofUrl,
                                height: 160,
                                width: double.infinity,
                                fit: BoxFit.contain,
                                placeholder: (_, _) => Container(
                                  height: 160,
                                  color: Colors.grey.shade100,
                                  child: const Center(
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  ),
                                ),
                                errorWidget: (_, _, _) => Container(
                                  height: 160,
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade100,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: Colors.grey.shade300,
                                    ),
                                  ),
                                  child: const Center(
                                    child: Icon(
                                      Icons.broken_image,
                                      color: Colors.grey,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        InkWell(
                          onTap: () async {
                            final uri = Uri.tryParse(proofUrl ?? '');
                            if (uri != null && await canLaunchUrl(uri)) {
                              await launchUrl(
                                uri,
                                mode: LaunchMode.externalApplication,
                              );
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.teal.shade50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.teal.shade200),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.insert_drive_file,
                                  color: Colors.teal.shade600,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'View Payment Receipt / \u0639\u0631\u0636 \u0627\u0644\u0625\u064a\u0635\u0627\u0644',
                                    style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: Colors.teal.shade700,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.open_in_new,
                                  size: 14,
                                  color: Colors.teal.shade500,
                                ),
                              ],
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                    ],

                    // Amount card
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.teal.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.teal.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            categoryLabel,
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amountSdg)} SDG',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                              color: Colors.teal.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Pending Items List
                    if (_pendingReceiptConfirmations.length > 1) ...[
                      Text(
                        'Pending Confirmations: ${_pendingReceiptConfirmations.length} items / التأكيدات المعلقة',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Colors.grey.shade800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: _pendingReceiptConfirmations
                              .asMap()
                              .entries
                              .map((entry) {
                                final idx = entry.key + 1;
                                final item = entry.value;
                                final itemAmount =
                                    ((item['amount_cents'] as num?)?.toInt() ??
                                        0) /
                                    100.0;
                                final itemCategory =
                                    item['expense_category'] as String? ??
                                    'Cost';
                                final isCurrent = item['id'] == costId;

                                return Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 4,
                                  ),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 24,
                                        height: 24,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: isCurrent
                                              ? Colors.teal
                                              : Colors.grey.shade300,
                                        ),
                                        alignment: Alignment.center,
                                        child: Text(
                                          '$idx',
                                          style: GoogleFonts.poppins(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: isCurrent
                                                ? Colors.white
                                                : Colors.grey.shade600,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              itemCategory,
                                              style: GoogleFonts.poppins(
                                                fontSize: 11,
                                                fontWeight: isCurrent
                                                    ? FontWeight.w700
                                                    : FontWeight.w600,
                                                color: isCurrent
                                                    ? Colors.teal.shade900
                                                    : Colors.grey.shade700,
                                              ),
                                            ),
                                            Text(
                                              '${itemAmount.toStringAsFixed(2)} SDG',
                                              style: GoogleFonts.poppins(
                                                fontSize: 10,
                                                color: Colors.grey.shade600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (isCurrent)
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 6,
                                            vertical: 2,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.teal.shade100,
                                            borderRadius: BorderRadius.circular(
                                              4,
                                            ),
                                          ),
                                          child: Text(
                                            'Current',
                                            style: GoogleFonts.poppins(
                                              fontSize: 9,
                                              fontWeight: FontWeight.w600,
                                              color: Colors.teal.shade900,
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                );
                              })
                              .toList(),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Confirmation statement
                    Text(
                      'I confirm that I have received this cost payment in full.',
                      style: GoogleFonts.poppins(fontSize: 13),
                    ),
                    Text(
                      'أؤكد أنني استلمت كامل مبلغ دفعة التكاليف هذه.',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                      textDirection: ui.TextDirection.rtl,
                    ),
                    const SizedBox(height: 14),

                    // Signature section
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Signature / \u0627\u0644\u062a\u0648\u0642\u064a\u0639',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (savedSignatureBase64 != null)
                          Row(
                            children: [
                              GestureDetector(
                                onTap: () =>
                                    setDialogState(() => useSaved = true),
                                child: Text(
                                  'Use Saved',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: useSaved
                                        ? Colors.teal
                                        : Colors.grey.shade500,
                                    fontWeight: useSaved
                                        ? FontWeight.w700
                                        : FontWeight.w400,
                                    decoration: useSaved
                                        ? TextDecoration.underline
                                        : TextDecoration.none,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              GestureDetector(
                                onTap: () => setDialogState(() {
                                  useSaved = false;
                                  signatureStrokes.clear();
                                }),
                                child: Text(
                                  'Draw New',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: !useSaved
                                        ? Colors.teal
                                        : Colors.grey.shade500,
                                    fontWeight: !useSaved
                                        ? FontWeight.w700
                                        : FontWeight.w400,
                                    decoration: !useSaved
                                        ? TextDecoration.underline
                                        : TextDecoration.none,
                                  ),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),

                    if (useSaved && savedSignatureBase64 != null)
                      Container(
                        height: 100,
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.teal.shade300),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            base64Decode(savedSignatureBase64),
                            fit: BoxFit.contain,
                          ),
                        ),
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Container(
                            height: 110,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: Colors.teal.shade300,
                                width: 1.5,
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: GestureDetector(
                                onPanStart: (d) {
                                  setDialogState(
                                    () =>
                                        signatureStrokes.add([d.localPosition]),
                                  );
                                },
                                onPanUpdate: (d) {
                                  setDialogState(
                                    () => signatureStrokes.last.add(
                                      d.localPosition,
                                    ),
                                  );
                                },
                                child: CustomPaint(
                                  painter: _SignaturePainter(signatureStrokes),
                                  child: Container(),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          TextButton.icon(
                            onPressed: () =>
                                setDialogState(() => signatureStrokes.clear()),
                            icon: const Icon(Icons.refresh, size: 13),
                            label: Text(
                              'Clear / \u0645\u0633\u062d',
                              style: GoogleFonts.poppins(fontSize: 11),
                            ),
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.grey.shade600,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 10),

                    // Notes
                    TextField(
                      controller: notesController,
                      maxLines: 2,
                      decoration: InputDecoration(
                        labelText:
                            'Notes (optional) / \u0645\u0644\u0627\u062d\u0638\u0627\u062a (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(
                  widget.isArabic ? '\u0625\u0644\u063a\u0627\u0621' : 'Cancel',
                  style: TextStyle(color: Colors.grey.shade600),
                ),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, false),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orange.shade600,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  widget.isArabic ? 'لم يتم الاستلام بعد' : 'Not Yet Received',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
              ),
              ElevatedButton.icon(
                onPressed: hasSig ? () => Navigator.pop(ctx, true) : null,
                icon: const Icon(Icons.verified, size: 16),
                label: Text(
                  widget.isArabic
                      ? '\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645'
                      : 'Confirm Receipt',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal.shade600,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );

    if (confirmed != true) return;

    // Step 3: Encode signature
    String? signatureBase64;
    if (useSaved && savedSignatureBase64 != null) {
      signatureBase64 = savedSignatureBase64;
    } else {
      try {
        final recorder = ui.PictureRecorder();
        final uiCanvas = ui.Canvas(recorder, ui.Rect.fromLTWH(0, 0, 320, 110));
        uiCanvas.drawRect(
          ui.Rect.fromLTWH(0, 0, 320, 110),
          ui.Paint()..color = const ui.Color(0xFFFFFFFF),
        );
        final sigPaint = ui.Paint()
          ..color = const ui.Color(0xFF000000)
          ..strokeWidth = 2.5
          ..strokeCap = ui.StrokeCap.round
          ..strokeJoin = ui.StrokeJoin.round
          ..style = ui.PaintingStyle.stroke;
        for (final stroke in signatureStrokes) {
          if (stroke.length < 2) continue;
          final path = ui.Path()..moveTo(stroke[0].dx, stroke[0].dy);
          for (int i = 1; i < stroke.length; i++) {
            path.lineTo(stroke[i].dx, stroke[i].dy);
          }
          uiCanvas.drawPath(path, sigPaint);
        }
        final picture = recorder.endRecording();
        final img = await picture.toImage(320, 110);
        final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
        if (byteData != null) {
          signatureBase64 = base64Encode(byteData.buffer.asUint8List());
        }
      } catch (e) {
        debugPrint('[CostReceipt] Signature encode error: $e');
      }
    }

    // Step 4: Save to database
    try {
      final now = DateTime.now().toIso8601String();

      debugPrint('[Wallet] Starting cost confirmation for costId: $costId');
      debugPrint('[Wallet] User ID: $_userId');
      debugPrint(
        '[Wallet] Signature: ${signatureBase64?.substring(0, 50) ?? "null"}...',
      );

      // Validate essential data
      if (costId.isEmpty) {
        throw Exception('Invalid: Cost ID is empty');
      }
      if (_userId == null || _userId!.isEmpty) {
        throw Exception('Invalid: User ID is empty');
      }

      // Build update payload with available columns only
      // Note: metadata column doesn't exist in schema, so we only update the confirmed fields
      final updateData = {
        'fund_receipt_confirmed': true,
        'fund_receipt_confirmed_at': now,
      };

      debugPrint('[Wallet] Update payload keys: ${updateData.keys.toList()}');

      final response = await Supabase.instance.client
          .from('operational_cost_submissions')
          .update(updateData)
          .eq('id', costId);

      debugPrint('[Wallet] Update response: $response');
      debugPrint('[Wallet] Cost confirmation successful for: $costId');

      // Verify the update was actually applied
      final verified = await Supabase.instance.client
          .from('operational_cost_submissions')
          .select('id, fund_receipt_confirmed, fund_receipt_confirmed_at')
          .eq('id', costId)
          .maybeSingle();

      if (verified != null) {
        debugPrint(
          '[Wallet] Verification - fund_receipt_confirmed: ${verified['fund_receipt_confirmed']}',
        );
        debugPrint(
          '[Wallet] Verification - confirmed_at: ${verified['fund_receipt_confirmed_at']}',
        );
      } else {
        debugPrint('[Wallet] WARNING: Record not found after update');
      }

      // Send notification to approver that receipt has been confirmed
      try {
        await Supabase.instance.client.from('notification_broadcast').insert({
          'recipient_type': 'admin',
          'sender_id': _userId,
          'title':
              '${cost['expense_category'] ?? 'Cost'} Payment Receipt Confirmed',
          'title_ar':
              'تم تأكيد استلام دفعة ${cost['expense_category'] ?? 'التكاليف'}',
          'message':
              'Field user has confirmed receipt of cost payment of ${NumberFormat.currency(symbol: '', decimalDigits: 2).format((cost['amount_cents'] as num? ?? 0) / 100.0)} SDG.',
          'message_ar':
              'أكد المستخدم الميداني استلام دفعة التكاليف. تم التحديث في نظام المحفظة.',
          'notification_type': 'cost_payment_confirmed',
          'related_id': costId,
          'related_type': 'cost_submission',
          'created_at': now,
        });
      } catch (notifError) {
        debugPrint('[Wallet] Notification send error: $notifError');
      }

      // Reload cost payments after a brief delay to stabilize UI state
      await Future.delayed(const Duration(milliseconds: 300));
      await _loadCostPayments();
      _checkPendingReceiptConfirmations();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تأكيد استلام الدفعة بنجاح ✓'
                  : 'Cost payment receipt confirmed ✓',
            ),
            backgroundColor: Colors.teal.shade600,
            duration: const Duration(seconds: 3),
          ),
        );

        // Show next pending receipt if any exists
        if (_pendingReceiptConfirmations.isNotEmpty) {
          // Small delay to let UI settle before showing next dialog
          await Future.delayed(const Duration(milliseconds: 800));
          if (mounted && _pendingReceiptConfirmations.isNotEmpty) {
            await _showNextPendingReceiptDialog();
          }
        }
      }
    } catch (e, st) {
      debugPrint('[Wallet] Error confirming cost payment receipt: $e');
      debugPrint('[Wallet] Stack trace: $st');
      if (mounted) {
        // Extract error message for display
        String errorMsg = 'Confirmation failed';
        if (e.toString().contains('permission') ||
            e.toString().contains('policy')) {
          errorMsg = 'Permission denied - unable to confirm receipt';
        } else if (e.toString().contains('connection') ||
            e.toString().contains('network')) {
          errorMsg = 'Network error - please check your connection';
        } else if (e.toString().contains('not found')) {
          errorMsg = 'Cost submission not found';
        } else if (e.toString().contains('Invalid:')) {
          errorMsg = e.toString().replaceFirst('Exception: ', '');
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? (errorMsg == 'Confirmation failed'
                        ? '\u0641\u0634\u0644 \u0627\u0644\u062a\u0623\u0643\u064a\u062f'
                        : errorMsg)
                  : errorMsg,
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Future<void> _confirmReceiptWithSignature(
    Map<String, dynamic> cost,
    dynamic signatureData,
  ) async {
    final costId = cost['id'] as String?;
    if (costId == null) return;

    final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
    final amountSdg = amountCents / 100.0;
    final category = cost['expense_category'] as String? ?? 'Cost Submission';

    setState(() => _declineLoading = true);

    try {
      final now = DateTime.now().toIso8601String();

      // Encode signature (either base64 string or list of offsets)
      String? signatureBase64;
      if (signatureData is String) {
        // Already base64 encoded (saved signature)
        signatureBase64 = signatureData;
      } else if (signatureData is List<List<Offset>>) {
        // Draw new signature
        try {
          final recorder = ui.PictureRecorder();
          final uiCanvas = ui.Canvas(
            recorder,
            ui.Rect.fromLTWH(0, 0, 320, 100),
          );
          uiCanvas.drawRect(
            ui.Rect.fromLTWH(0, 0, 320, 100),
            ui.Paint()..color = const ui.Color(0xFFFFFFFF),
          );
          final sigPaint = ui.Paint()
            ..color = const ui.Color(0xFF000000)
            ..strokeWidth = 2.5
            ..strokeCap = ui.StrokeCap.round
            ..strokeJoin = ui.StrokeJoin.round
            ..style = ui.PaintingStyle.stroke;
          for (final stroke in signatureData) {
            if (stroke.length < 2) continue;
            final path = ui.Path()..moveTo(stroke[0].dx, stroke[0].dy);
            for (int i = 1; i < stroke.length; i++) {
              path.lineTo(stroke[i].dx, stroke[i].dy);
            }
            uiCanvas.drawPath(path, sigPaint);
          }
          final picture = recorder.endRecording();
          final img = await picture.toImage(320, 100);
          final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
          if (byteData != null) {
            signatureBase64 = base64Encode(byteData.buffer.asUint8List());
          }
        } catch (e) {
          debugPrint('[Wallet] Signature encode error: $e');
        }
      }

      debugPrint('[Wallet] Confirming receipt for cost: $costId');
      debugPrint('[Wallet] Amount: ${amountSdg.toStringAsFixed(2)} SDG');
      debugPrint(
        '[Wallet] Signature: ${signatureBase64?.substring(0, 50) ?? "null"}...',
      );

      // Update cost submission in database
      await Supabase.instance.client
          .from('operational_cost_submissions')
          .update({
            'fund_receipt_confirmed': true,
            'fund_receipt_confirmed_at': now,
          })
          .eq('id', costId);

      // Send notification to approver
      try {
        await Supabase.instance.client.from('notification_broadcast').insert({
          'recipient_type': 'admin',
          'sender_id': _userId,
          'title': '$category Payment Receipt Confirmed',
          'title_ar': 'تم تأكيد استلام دفعة $category',
          'message':
              'Field user has confirmed receipt of payment: ${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amountSdg)} SDG',
          'message_ar':
              'أكد المستخدم الميداني استلام الدفعة: ${amountSdg.toStringAsFixed(2)} SDG',
          'notification_type': 'cost_payment_confirmed',
          'related_id': costId,
          'related_type': 'cost_submission',
          'created_at': now,
        });
      } catch (notifError) {
        debugPrint('[Wallet] Notification error: $notifError');
      }

      // Reload and continue to next pending receipt
      await _loadCostPayments();
      _checkPendingReceiptConfirmations();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تأكيد الاستلام بنجاح ✓'
                  : 'Receipt confirmed successfully ✓',
            ),
            backgroundColor: Colors.teal.shade600,
            duration: const Duration(seconds: 2),
          ),
        );

        // Show next pending receipt if any exists
        if (_pendingReceiptConfirmations.isNotEmpty) {
          await Future.delayed(const Duration(milliseconds: 600));
          if (mounted && _pendingReceiptConfirmations.isNotEmpty) {
            await _showHighPriorityBlockingReceiptModal();
          }
        }
      }
    } catch (e) {
      debugPrint('[Wallet] Error confirming receipt: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic ? 'فشل التأكيد' : 'Confirmation failed',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _declineLoading = false);
      }
    }
  }

  Future<void> _requestWithdrawal() async {
    final amount = double.tryParse(_withdrawalAmountController.text);
    if (amount == null || amount <= 0 || amount > _netBalance) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Invalid withdrawal amount'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // Check bank account before submitting withdrawal
    if (_userId != null) {
      try {
        final profileData = await Supabase.instance.client
            .from('profiles')
            .select('bank_account')
            .eq('id', _userId!)
            .maybeSingle();
        final bankAccount = profileData?['bank_account'];
        final accountNumber =
            bankAccount?['accountNumber'] ?? bankAccount?['account_number'];
        if (accountNumber == null || (accountNumber as String).isEmpty) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'Bank account required / الحساب البنكي مطلوب\n'
                  'Please add your bank account in Profile Settings before requesting a withdrawal.',
                ),
                backgroundColor: Colors.orange,
                duration: Duration(seconds: 5),
              ),
            );
          }
          return;
        }
      } catch (_) {}
    }

    setState(() => _isSubmittingWithdrawal = true);

    try {
      // Use the wallet service to create withdrawal request (includes wallet_id)
      final walletService = WalletService();
      await walletService.createWithdrawalRequest(
        amount: amount,
        requestReason: _withdrawalReasonController.text,
        paymentMethod: _selectedPaymentMethod.isNotEmpty
            ? _selectedPaymentMethod
            : 'Other',
      );

      // Broadcast notification to admin about withdrawal request submission
      try {
        final now = DateTime.now().toIso8601String();
        await Supabase.instance.client.from('notification_broadcast').insert({
          'recipient_type': 'admin',
          'sender_id': _userId,
          'title': 'Withdrawal Request Submitted',
          'title_ar': 'تم إرسال طلب سحب الأموال',
          'message':
              'Field user has submitted a withdrawal request for ${_formatCurrency(amount)}. Reason: ${_withdrawalReasonController.text}',
          'message_ar':
              'أرسل المستخدم الميداني طلب سحب أموال بقيمة ${_formatCurrency(amount)}. السبب: ${_withdrawalReasonController.text}',
          'notification_type': 'withdrawal_request_submitted',
          'related_id': _userId,
          'related_type': 'withdrawal_request',
          'created_at': now,
        });
      } catch (e) {
        debugPrint('[Withdrawal] Notification broadcast error: $e');
      }

      // Notify the user of their own action (e.g. "You have requested a withdrawal of X SDG")
      if (_userId != null) {
        try {
          await NotificationTriggerService().withdrawalRequestedBySelf(
            _userId!,
            amount,
            'SDG',
          );
        } catch (e) {
          debugPrint('[Withdrawal] Self-notification error: $e');
        }
      }

      setState(() {
        _showWithdrawalDialog = false;
        _withdrawalAmountController.clear();
        _withdrawalReasonController.clear();
        _selectedPaymentMethod = '';
      });

      await _loadWithdrawalRequests();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Withdrawal request submitted successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error requesting withdrawal: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isSubmittingWithdrawal = false);
    }
  }

  Future<void> _cancelWithdrawalRequest(String requestId) async {
    try {
      await Supabase.instance.client
          .from('withdrawal_requests')
          .update({'status': 'cancelled'})
          .eq('id', requestId)
          .eq('user_id', _userId!)
          .eq('status', 'pending');

      await _loadWithdrawalRequests();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Withdrawal request cancelled'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      debugPrint('Error cancelling withdrawal: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  String _formatCurrency(double amount) {
    return '${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amount)} SDG';
  }

  String _formatDate(dynamic dateValue) {
    if (dateValue == null) return 'N/A';
    try {
      DateTime parsedDate;
      if (dateValue is String) {
        parsedDate = DateTime.parse(dateValue);
      } else if (dateValue is DateTime) {
        parsedDate = dateValue;
      } else {
        return 'N/A';
      }
      return DateFormat('MMM dd, yyyy • hh:mm a').format(parsedDate);
    } catch (e) {
      return 'N/A';
    }
  }

  List<Map<String, dynamic>> _getFilteredTransactions() {
    if (_transactionFilter == 'all') {
      return _transactions
          .where(
            (t) =>
                t['type'] != 'down_payment' && t['type'] != 'advance_deduction',
          )
          .toList();
    }
    return _transactions.where((t) {
      if (_transactionFilter == 'earning') {
        return t['type'] == 'earning' ||
            t['type'] == 'site_visit_fee' ||
            t['type'] == 'visit_completion';
      }
      return t['type'] == _transactionFilter;
    }).toList();
  }

  List<Map<String, dynamic>> _getFilteredWithdrawals() {
    if (_withdrawalFilter == 'all') return _withdrawalRequests;
    return _withdrawalRequests
        .where((w) => w['status'] == _withdrawalFilter)
        .toList();
  }

  bool _isDebitType(String type) {
    return type == 'down_payment' ||
        type == 'advance_deduction' ||
        type == 'withdrawal' ||
        type == 'penalty' ||
        type == 'deduction';
  }

  IconData _getTransactionIcon(String type) {
    switch (type) {
      case 'earning':
      case 'site_visit_fee':
      case 'visit_completion':
        return Icons.arrow_upward;
      case 'down_payment':
      case 'advance_deduction':
        return Icons.directions_car;
      case 'withdrawal':
        return Icons.account_balance_outlined;
      case 'bonus':
        return Icons.star_outline;
      case 'penalty':
      case 'deduction':
        return Icons.remove_circle_outline;
      default:
        return Icons.swap_horiz;
    }
  }

  Color _getTransactionColor(String type) {
    switch (type) {
      case 'earning':
      case 'site_visit_fee':
      case 'visit_completion':
      case 'bonus':
        return Colors.green;
      case 'withdrawal':
      case 'penalty':
      case 'deduction':
        return Colors.red;
      case 'down_payment':
      case 'advance_deduction':
        return Colors.orange;
      default:
        return AppColors.primaryBlue;
    }
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    IconData icon;

    switch (status) {
      case 'pending':
        color = Colors.orange;
        icon = Icons.access_time;
        break;
      case 'approved':
        color = Colors.green;
        icon = Icons.check_circle;
        break;
      case 'rejected':
        color = Colors.red;
        icon = Icons.cancel;
        break;
      case 'cancelled':
        color = Colors.grey;
        icon = Icons.cancel;
        break;
      default:
        color = Colors.grey;
        icon = Icons.help;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            status.toUpperCase(),
            style: GoogleFonts.poppins(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBalanceCard() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withValues(alpha: 0.8),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryBlue.withValues(alpha: 0.3),
            blurRadius: 24,
            offset: const Offset(0, 12),
            spreadRadius: 2,
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () {}, // For subtle ripple effect
          splashColor: Colors.white.withValues(alpha: 0.1),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Available Balance',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withValues(alpha: 0.9),
                            letterSpacing: 0.5,
                          ),
                        ),
                        Text(
                          'الرصيد المتاح',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.white.withValues(alpha: 0.75),
                          ),
                          textDirection: ui.TextDirection.rtl,
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.account_balance_wallet_rounded,
                        color: Colors.white.withValues(alpha: 0.95),
                        size: 24,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  _formatCurrency(_netBalance),
                  style: GoogleFonts.poppins(
                    fontSize: 36,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'SDG',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                ),
                if (_netBalance > 0) ...[
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: Material(
                      color: Colors.transparent,
                      child: ElevatedButton.icon(
                        onPressed: () =>
                            setState(() => _showWithdrawalDialog = true),
                        icon: const Icon(
                          Icons.arrow_downward_rounded,
                          size: 18,
                        ),
                        label: Text(
                          widget.isArabic ? 'طلب سحب' : 'Request Withdrawal',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: AppColors.primaryBlue,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.backgroundGray,
      drawer: CustomDrawerMenu(
        currentUser: Supabase.instance.client.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      floatingActionButton:
          (_pendingReceiptConfirmations.isNotEmpty ||
              _pendingAdvanceConfirmations.isNotEmpty)
          ? FloatingActionButton.extended(
              onPressed: () async {
                // Reload data before showing dialog
                await _loadCostPayments();
                await _loadAdvances();
                _checkPendingReceiptConfirmations();
                _checkPendingAdvanceConfirmations();
                if (mounted) {
                  setState(() {});
                }
                await _showViewModeChoiceDialog();
              },
              backgroundColor: Colors.orange.shade600,
              icon: const Icon(Icons.done_all, color: Colors.white),
              label: Text(
                _pendingReceiptConfirmations.length +
                            _pendingAdvanceConfirmations.length ==
                        1
                    ? 'Confirm'
                    : 'Confirm (${_pendingReceiptConfirmations.length + _pendingAdvanceConfirmations.length})',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            )
          : null,
      body: Stack(
        children: [
          SafeArea(
            child: Column(
              children: [
                ReusableAppBar(
                  title: widget.isArabic ? 'المحفظة' : 'Wallet',
                  scaffoldKey: _scaffoldKey,
                ),
                Expanded(
                  child: _isLoading
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              ScaleTransition(
                                scale: Tween(begin: 0.5, end: 1.0).animate(
                                  CurvedAnimation(
                                    parent: AlwaysStoppedAnimation(0.5),
                                    curve: Curves.elasticOut,
                                  ),
                                ),
                                child: CircularProgressIndicator(
                                  valueColor: AlwaysStoppedAnimation(
                                    AppColors.primaryBlue,
                                  ),
                                  strokeWidth: 3,
                                ),
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'Loading wallet...',
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  color: AppColors.primaryBlue,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _initializeWallet,
                          color: AppColors.primaryBlue,
                          backgroundColor: Colors.white,
                          child: SingleChildScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Balance Card with Blue Theme
                                _buildBalanceCard(),

                                const SizedBox(height: 20),

                                // Stats Grid
                                Row(
                                  children: [
                                    Expanded(
                                      child: _buildStatCard(
                                        'Total Earned',
                                        'إجمالي الايرادات',
                                        _formatCurrency(_totalEarned),
                                        Icons.trending_up,
                                        Colors.green,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: _buildStatCard(
                                        'This Month',
                                        'هذا الشهر',
                                        _formatCurrency(_thisMonthEarnings),
                                        Icons.calendar_today,
                                        Colors.purple,
                                      ),
                                    ),
                                  ],
                                ),

                                const SizedBox(height: 12),

                                Row(
                                  children: [
                                    Expanded(
                                      child: _buildStatCard(
                                        'Pending',
                                        'قيد الانتظار',
                                        _formatCurrency(_pendingWithdrawals),
                                        Icons.pending,
                                        Colors.orange,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: _buildStatCard(
                                        'Withdrawn',
                                        'السحوبات',
                                        _formatCurrency(_totalWithdrawn),
                                        Icons.check_circle,
                                        AppColors.primaryBlue,
                                      ),
                                    ),
                                  ],
                                ),

                                if (_totalAdvanceDeductions > 0) ...[
                                  const SizedBox(height: 16),
                                  _buildAdvanceDeductionBanner(),
                                ],

                                const SizedBox(height: 24),

                                // Tabs
                                Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                          alpha: 0.08,
                                        ),
                                        blurRadius: 16,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                                  ),
                                  child: Column(
                                    children: [
                                      // Tab Buttons
                                      Container(
                                        padding: const EdgeInsets.all(8),
                                        decoration: BoxDecoration(
                                          color: AppColors.primaryBlue
                                              .withValues(alpha: 0.05),
                                          borderRadius: const BorderRadius.only(
                                            topLeft: Radius.circular(16),
                                            topRight: Radius.circular(16),
                                          ),
                                          border: Border(
                                            bottom: BorderSide(
                                              color: AppColors.primaryBlue
                                                  .withValues(alpha: 0.1),
                                            ),
                                          ),
                                        ),
                                        child: SingleChildScrollView(
                                          scrollDirection: Axis.horizontal,
                                          child: Row(
                                            children: [
                                              _buildTabButton(
                                                'overview',
                                                'Overview',
                                                'نظرة عامة',
                                                Icons.dashboard_outlined,
                                              ),
                                              const SizedBox(width: 6),
                                              _buildTabButton(
                                                'transactions',
                                                'History',
                                                'المعاملات',
                                                Icons.receipt_long_outlined,
                                              ),
                                              const SizedBox(width: 6),
                                              _buildTabButton(
                                                'withdrawals',
                                                'Withdraw',
                                                'السحوبات',
                                                Icons
                                                    .arrow_circle_down_outlined,
                                              ),
                                              const SizedBox(width: 6),
                                              _buildTabButtonWithBadge(
                                                'advances',
                                                'Advances',
                                                'الترحيل و المواصلات',
                                                Icons.directions_car_outlined,
                                                badge:
                                                    _pendingAdvanceConfirmations
                                                        .length,
                                              ),
                                              const SizedBox(width: 6),
                                              _buildTabButtonWithBadge(
                                                'cost_payments',
                                                'Costs',
                                                'التكاليف',
                                                Icons.receipt_outlined,
                                                badge: _costPayments
                                                    .where(
                                                      (c) =>
                                                          c['status'] ==
                                                              'paid' &&
                                                          c['fund_receipt_confirmed'] !=
                                                              true,
                                                    )
                                                    .length,
                                              ),
                                              const SizedBox(width: 6),
                                              _buildTabButton(
                                                'statement',
                                                'Statement',
                                                'كشف الحساب',
                                                Icons.summarize_outlined,
                                              ),
                                              const SizedBox(width: 6),
                                              if (_pendingReceiptConfirmations
                                                      .isNotEmpty ||
                                                  _pendingAdvanceConfirmations
                                                      .isNotEmpty)
                                                Material(
                                                  color: Colors.transparent,
                                                  child: InkWell(
                                                    onTap: () async {
                                                      debugPrint(
                                                        '[Wallet] Confirm tab tapped - loading data',
                                                      );
                                                      try {
                                                        // Reload data before showing dialog
                                                        await _loadCostPayments();
                                                        await _loadAdvances();
                                                        _checkPendingReceiptConfirmations();
                                                        _checkPendingAdvanceConfirmations();
                                                        if (mounted) {
                                                          setState(() {});
                                                        }
                                                        debugPrint(
                                                          '[Wallet] Showing confirmation dialog - confirmations: ${_pendingReceiptConfirmations.length + _pendingAdvanceConfirmations.length}',
                                                        );
                                                        await _showViewModeChoiceDialog();
                                                      } catch (e) {
                                                        debugPrint(
                                                          '[Wallet] Error in Confirm tab: $e',
                                                        );
                                                        if (mounted) {
                                                          ScaffoldMessenger.of(
                                                            context,
                                                          ).showSnackBar(
                                                            SnackBar(
                                                              content: Text(
                                                                widget.isArabic
                                                                    ? 'حدث خطأ: $e'
                                                                    : 'Error: $e',
                                                              ),
                                                              backgroundColor:
                                                                  Colors.red,
                                                            ),
                                                          );
                                                        }
                                                      }
                                                    },
                                                    child: _buildTabButtonWithBadge(
                                                      'confirmations',
                                                      'Confirm',
                                                      'تأكيد',
                                                      Icons.done_all_outlined,
                                                      badge:
                                                          _pendingReceiptConfirmations
                                                              .length +
                                                          _pendingAdvanceConfirmations
                                                              .length,
                                                    ),
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                      ),
                                      // Tab Content
                                      Padding(
                                        padding: const EdgeInsets.all(16),
                                        child: _buildTabContent(),
                                      ),
                                    ],
                                  ),
                                ),

                                const SizedBox(height: 24),
                              ],
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
          if (_showWithdrawalDialog) ...[
            // Dimmed background barrier — blocks all taps on content behind
            ModalBarrier(
              color: Colors.black.withValues(alpha: 0.55),
              dismissible: true,
              onDismiss: () => setState(() {
                _showWithdrawalDialog = false;
                _withdrawalAmountController.clear();
                _withdrawalReasonController.clear();
                _selectedPaymentMethod = '';
              }),
            ),
            _buildWithdrawalDialog(),
          ],
        ],
      ),
    );
  }

  Widget _buildWithdrawalDialog() {
    final isArabic = widget.isArabic;
    final amount = double.tryParse(_withdrawalAmountController.text) ?? 0.0;
    final isValidAmount = amount > 0 && amount <= _netBalance;
    final withdrawPct = _netBalance > 0
        ? (amount / _netBalance).clamp(0.0, 1.0)
        : 0.0;

    void setQuickAmount(double pct) {
      final val = (_netBalance * pct).floorToDouble();
      _withdrawalAmountController.text = val == val.floorToDouble()
          ? val.toStringAsFixed(0)
          : val.toStringAsFixed(2);
      setState(() {});
    }

    void dismiss() => setState(() {
      _showWithdrawalDialog = false;
      _withdrawalAmountController.clear();
      _withdrawalReasonController.clear();
      _selectedPaymentMethod = '';
    });

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
      backgroundColor: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 32,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Gradient header ──────────────────────────────────────
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.primaryBlue, Color(0xFF2E5C8A)],
                ),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(24),
                  topRight: Radius.circular(24),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(20, 20, 16, 20),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.account_balance_wallet_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isArabic ? 'طلب سحب' : 'Request Withdrawal',
                          style: GoogleFonts.poppins(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          isArabic
                              ? 'طلب سحب | Request Withdrawal'
                              : 'طلب سحب | Request Withdrawal',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: dismiss,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Balance summary strip ─────────────────────────────────
            Container(
              color: const Color(0xFFF0F7FF),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Row(
                children: [
                  Expanded(
                    child: _summaryTile(
                      isArabic ? 'إجمالي الايرادات' : 'Total Earned',
                      _formatCurrency(_totalEarned),
                      Colors.green,
                      Icons.trending_up,
                    ),
                  ),
                  Container(width: 1, height: 40, color: Colors.blue[100]),
                  Expanded(
                    child: _summaryTile(
                      isArabic
                          ? 'الترحيل و المواصلات المدفوعة'
                          : 'Advances Paid',
                      '− ${_formatCurrency(_totalAdvanceDeductions)}',
                      Colors.orange,
                      Icons.remove_circle_outline,
                    ),
                  ),
                  Container(width: 1, height: 40, color: Colors.blue[100]),
                  Expanded(
                    child: _summaryTile(
                      isArabic ? 'المتاح' : 'Available',
                      _formatCurrency(_netBalance),
                      AppColors.primaryBlue,
                      Icons.account_balance_wallet,
                    ),
                  ),
                ],
              ),
            ),

            // ── Form body ─────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Quick-select buttons
                  Row(
                    children: [
                      Text(
                        isArabic ? 'اختيار سريع:' : 'Quick select:',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textLight,
                        ),
                      ),
                      const SizedBox(width: 8),
                      ...[
                        '25%',
                        '50%',
                        '75%',
                        isArabic ? 'الكل' : 'Max',
                      ].asMap().entries.map((e) {
                        final pcts = [0.25, 0.50, 0.75, 1.0];
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: GestureDetector(
                            onTap: () => setQuickAmount(pcts[e.key]),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primaryBlue.withValues(
                                  alpha: 0.1,
                                ),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: AppColors.primaryBlue.withValues(
                                    alpha: 0.3,
                                  ),
                                ),
                              ),
                              child: Text(
                                e.value,
                                style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primaryBlue,
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Amount input
                  TextField(
                    controller: _withdrawalAmountController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                    decoration: InputDecoration(
                      labelText: isArabic ? 'المبلغ (SDG)' : 'Amount (SDG)',
                      prefixIcon: const Icon(
                        Icons.attach_money_rounded,
                        color: AppColors.primaryBlue,
                      ),
                      filled: true,
                      fillColor: const Color(0xFFF8FAFF),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.borderColor,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.primaryBlue,
                          width: 2,
                        ),
                      ),
                      errorText: amount > _netBalance && amount > 0
                          ? (isArabic
                                ? 'رصيد غير كافٍ'
                                : 'Insufficient balance')
                          : null,
                      suffix: amount > 0
                          ? Text(
                              '${(withdrawPct * 100).toStringAsFixed(0)}%',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: AppColors.primaryBlue,
                                fontWeight: FontWeight.w700,
                              ),
                            )
                          : null,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),

                  // Progress bar
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: withdrawPct,
                      minHeight: 5,
                      backgroundColor: Colors.grey[200],
                      color: withdrawPct > 0.9
                          ? AppColors.accentRed
                          : withdrawPct > 0.6
                          ? AppColors.accentYellow
                          : AppColors.primaryBlue,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '0',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: AppColors.textLight,
                          ),
                        ),
                        Text(
                          _formatCurrency(_netBalance),
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: AppColors.textLight,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Payment method
                  if (_paymentMethods.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      initialValue: _selectedPaymentMethod.isEmpty
                          ? null
                          : _selectedPaymentMethod,
                      decoration: InputDecoration(
                        labelText: isArabic ? 'طريقة الدفع' : 'Payment Method',
                        prefixIcon: const Icon(
                          Icons.payment_rounded,
                          color: AppColors.primaryBlue,
                        ),
                        filled: true,
                        fillColor: const Color(0xFFF8FAFF),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                            color: AppColors.primaryBlue,
                            width: 2,
                          ),
                        ),
                      ),
                      items: [
                        ..._paymentMethods.map(
                          (m) => DropdownMenuItem(
                            value: m['name'] as String,
                            child: Text(
                              '${m['name']} · ${(m['type'] as String).replaceAll('_', ' ')}',
                              style: GoogleFonts.poppins(fontSize: 13),
                            ),
                          ),
                        ),
                        DropdownMenuItem(
                          value: 'other',
                          child: Text(
                            isArabic
                                ? 'أخرى (حدد في السبب)'
                                : 'Other (specify in reason)',
                            style: GoogleFonts.poppins(fontSize: 13),
                          ),
                        ),
                      ],
                      onChanged: (v) =>
                          setState(() => _selectedPaymentMethod = v ?? ''),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Reason
                  TextField(
                    controller: _withdrawalReasonController,
                    maxLines: 2,
                    decoration: InputDecoration(
                      labelText: isArabic
                          ? 'سبب السحب'
                          : 'Reason for Withdrawal',
                      hintText: isArabic
                          ? 'تكاليف النقل، الإقامة...'
                          : 'Transportation, accommodation, etc.',
                      prefixIcon: const Icon(
                        Icons.edit_note_rounded,
                        color: AppColors.primaryBlue,
                      ),
                      filled: true,
                      fillColor: const Color(0xFFF8FAFF),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.primaryBlue,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Summary row when amount is valid ──────────────────────
            if (isValidAmount)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppColors.accentGreen.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.accentGreen,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isArabic
                                  ? 'سيتم سحب ${_formatCurrency(amount)}'
                                  : 'Withdrawing ${_formatCurrency(amount)}',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.accentGreen,
                              ),
                            ),
                            Text(
                              isArabic
                                  ? 'المتبقي: ${_formatCurrency(_netBalance - amount)}'
                                  : 'Remaining: ${_formatCurrency(_netBalance - amount)}',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: AppColors.textLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── Action buttons ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: dismiss,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: BorderSide(color: Colors.grey[300]!),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        isArabic ? 'إلغاء' : 'Cancel',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textLight,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: isValidAmount && !_isSubmittingWithdrawal
                          ? _requestWithdrawal
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        disabledBackgroundColor: Colors.grey[300],
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: _isSubmittingWithdrawal
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(
                                  Icons.send_rounded,
                                  color: Colors.white,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  isArabic ? 'إرسال الطلب' : 'Submit Request',
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryTile(String label, String value, Color color, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            label,
            style: GoogleFonts.poppins(fontSize: 9, color: AppColors.textLight),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(
    String titleEn,
    String titleAr,
    String value,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      titleEn,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textLight,
                      ),
                    ),
                    Text(
                      titleAr,
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textLight.withValues(alpha: 0.75),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(icon, size: 20, color: color),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textDark,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAdvanceDeductionBanner() {
    final isArabic = widget.isArabic;
    final remaining = _totalAdvanceDeductions;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.deepOrange.shade50,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.deepOrange.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.deepOrange.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.deepOrange.shade100,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              Icons.warning_amber_rounded,
              color: Colors.deepOrange.shade700,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic ? 'سلفة مستحقة' : 'Outstanding Advance',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.deepOrange.shade700,
                  ),
                ),
                Text(
                  isArabic
                      ? 'يُخصم من رصيدك المتاح'
                      : 'Deducted from your available balance',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: Colors.deepOrange.shade500,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '− ${_formatCurrency(remaining)}',
                style: GoogleFonts.poppins(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Colors.deepOrange.shade700,
                ),
              ),
              Text(
                'SDG',
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: Colors.deepOrange.shade400,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(
    String tab,
    String labelEn,
    String labelAr,
    IconData icon,
  ) {
    final isActive = _activeTab == tab;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = tab),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(
            color: isActive ? AppColors.primaryBlue : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            boxShadow: isActive
                ? [
                    BoxShadow(
                      color: AppColors.primaryBlue.withValues(alpha: 0.2),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                      spreadRadius: 1,
                    ),
                  ]
                : [],
            border: !isActive
                ? Border.all(
                    color: AppColors.primaryBlue.withValues(alpha: 0.15),
                    width: 0.5,
                  )
                : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 300),
                style: TextStyle(
                  color: isActive
                      ? Colors.white
                      : AppColors.textLight.withValues(alpha: 0.7),
                  fontSize: 20,
                ),
                child: Icon(icon, size: 18),
              ),
              const SizedBox(height: 4),
              Text(
                labelEn,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
                  color: isActive ? Colors.white : AppColors.textLight,
                  height: 1.2,
                ),
              ),
              Text(
                labelAr,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
                  color: isActive
                      ? Colors.white.withValues(alpha: 0.9)
                      : AppColors.textLight,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTabButtonWithBadge(
    String tab,
    String labelEn,
    String labelAr,
    IconData icon, {
    int badge = 0,
  }) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        _buildTabButton(tab, labelEn, labelAr, icon),
        if (badge > 0)
          Positioned(
            top: -6,
            right: -6,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppColors.primaryBlue,
                    AppColors.primaryBlue.withValues(alpha: 0.8),
                  ],
                ),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primaryBlue.withValues(alpha: 0.4),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Center(
                child: Text(
                  badge > 99 ? '99+' : badge.toString(),
                  style: GoogleFonts.poppins(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    height: 1.0,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildTabContent() {
    switch (_activeTab) {
      case 'overview':
        return _buildOverviewTab();
      case 'transactions':
        return _buildTransactionsTab();
      case 'withdrawals':
        return _buildWithdrawalsTab();
      case 'advances':
        return _buildAdvancesTab();
      case 'cost_payments':
        return _buildCostPaymentsTab();
      case 'statement':
        return _buildStatementTab();
      case 'confirmations':
        return _buildConfirmationsTab();
      default:
        return const SizedBox();
    }
  }

  // ── Helper: extract a display site name from a wallet transaction ──────────
  String _siteNameFromTx(Map<String, dynamic> tx) {
    final meta = tx['metadata'];
    if (meta is Map) {
      final s =
          meta['site_name'] as String? ??
          meta['siteName'] as String? ??
          meta['site'] as String?;
      if (s != null && s.isNotEmpty) return s;
    }
    final desc = (tx['description'] as String? ?? '').trim();
    if (desc.isNotEmpty) return desc;
    final type = tx['type'] as String? ?? '';
    switch (type) {
      case 'site_visit_fee':
      case 'visit_completion':
        return widget.isArabic ? 'رسوم زيارة' : 'Site Visit Fee';
      case 'down_payment':
        return widget.isArabic ? 'سلفة مواصلات' : 'Transport Advance';
      case 'advance_deduction':
        return widget.isArabic ? 'خصم سلفة' : 'Advance Deduction';
      default:
        return type.replaceAll('_', ' ');
    }
  }

  Widget _buildOverviewTab() {
    // Group recent transactions by reference_id (site visit), or show individually
    final siteTypes = {'site_visit_fee', 'visit_completion', 'earning'};
    final recent = _transactions
        .where((t) => siteTypes.contains(t['type']))
        .take(30)
        .toList();

    // Build groups: key = reference_id (non-null) or "__solo_<index>"
    final Map<String, List<Map<String, dynamic>>> groups = {};
    final List<String> groupOrder = [];
    int soloIdx = 0;
    for (final tx in recent) {
      final refId = tx['reference_id'] as String?;
      if (refId != null && refId.isNotEmpty) {
        if (!groups.containsKey(refId)) {
          groups[refId] = [];
          groupOrder.add(refId);
        }
        groups[refId]!.add(tx);
      } else {
        final k = '__solo_${soloIdx++}';
        groups[k] = [tx];
        groupOrder.add(k);
      }
    }

    // Take only the first 8 groups
    final displayKeys = groupOrder.take(8).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // === PENDING RECEIPT CONFIRMATIONS SECTION ===
        if (_pendingReceiptConfirmations.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.red.shade300, width: 2),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.red.shade200,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.priority_high,
                        color: Colors.red.shade700,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '⚠️ Pending Receipt Confirmations',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: Colors.red.shade700,
                            ),
                          ),
                          Text(
                            '${_pendingReceiptConfirmations.length} cost submission(s) awaiting your confirmation',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.red.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                // Display each pending receipt
                ..._pendingReceiptConfirmations.asMap().entries.map((entry) {
                  final index = entry.key + 1;
                  final cost = entry.value;
                  final amountCents =
                      (cost['amount_cents'] as num?)?.toInt() ?? 0;
                  final amountSdg = amountCents / 100.0;
                  final category =
                      cost['expense_category'] as String? ?? 'Cost';
                  final proofUrl = cost['payment_proof_url'] as String?;
                  final isImage =
                      proofUrl != null &&
                      RegExp(
                        r'\.(jpg|jpeg|png|gif|webp)$',
                        caseSensitive: false,
                      ).hasMatch(proofUrl);

                  return Column(
                    children: [
                      if (index > 1) const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.red.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        category,
                                        style: GoogleFonts.poppins(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13,
                                        ),
                                      ),
                                      Text(
                                        '${amountSdg.toStringAsFixed(2)} SDG',
                                        style: GoogleFonts.poppins(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: Colors.teal.shade700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.red.shade100,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '$index of ${_pendingReceiptConfirmations.length}',
                                    style: GoogleFonts.poppins(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.red.shade700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (proofUrl != null && proofUrl.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              if (isImage)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Container(
                                    color: Colors.white,
                                    width: double.infinity,
                                    child: CachedNetworkImage(
                                      imageUrl: proofUrl,
                                      height: 120,
                                      fit: BoxFit.contain,
                                      placeholder: (_, __) => Container(
                                        height: 120,
                                        color: Colors.grey.shade100,
                                        child: const Center(
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        ),
                                      ),
                                      errorWidget: (_, __, ___) => Container(
                                        height: 120,
                                        color: Colors.grey.shade100,
                                        child: const Center(
                                          child: Icon(
                                            Icons.broken_image,
                                            color: Colors.grey,
                                            size: 40,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                              else
                                InkWell(
                                  onTap: () async {
                                    final uri = Uri.tryParse(proofUrl ?? '');
                                    if (uri != null &&
                                        await canLaunchUrl(uri)) {
                                      await launchUrl(
                                        uri,
                                        mode: LaunchMode.externalApplication,
                                      );
                                    }
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                      horizontal: 12,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.grey.shade100,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.insert_drive_file,
                                          color: Colors.grey.shade600,
                                          size: 16,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            'View Receipt',
                                            style: GoogleFonts.poppins(
                                              fontSize: 11,
                                              color: Colors.grey.shade700,
                                            ),
                                          ),
                                        ),
                                        Icon(
                                          Icons.open_in_new,
                                          color: Colors.grey.shade600,
                                          size: 14,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  );
                }),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      await _showHighPriorityBlockingReceiptModal();
                    },
                    icon: const Icon(Icons.check_circle, size: 16),
                    label: Text(
                      'Confirm Receipts Now',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade600,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
        // === PENDING ADVANCE CONFIRMATIONS SECTION ===
        if (_pendingAdvanceConfirmations.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.amber.shade300, width: 2),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade200,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        Icons.directions_car,
                        color: Colors.amber.shade700,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Pending Transport Advances',
                            style: GoogleFonts.poppins(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: Colors.amber.shade800,
                            ),
                          ),
                          Text(
                            '${_pendingAdvanceConfirmations.length} advance(s) awaiting your confirmation',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.amber.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                // Display each pending advance
                ..._pendingAdvanceConfirmations.asMap().entries.map((entry) {
                  final index = entry.key + 1;
                  final advance = entry.value;
                  final amountCents =
                      (advance['disbursed_amount'] as num?)?.toInt() ?? 0;
                  final amountSdg = amountCents / 100.0;
                  final siteName = advance['site_name'] as String? ?? 'Site';
                  final proofUrl = advance['payment_proof_url'] as String?;
                  final isImage =
                      proofUrl != null &&
                      RegExp(
                        r'\.(jpg|jpeg|png|gif|webp)$',
                        caseSensitive: false,
                      ).hasMatch(proofUrl);

                  return Column(
                    children: [
                      if (index > 1) const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.amber.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        siteName,
                                        style: GoogleFonts.poppins(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13,
                                        ),
                                      ),
                                      Text(
                                        '${amountSdg.toStringAsFixed(2)} SDG',
                                        style: GoogleFonts.poppins(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: Colors.amber.shade700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.amber.shade100,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    '$index of ${_pendingAdvanceConfirmations.length}',
                                    style: GoogleFonts.poppins(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.amber.shade700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (proofUrl != null && proofUrl.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              if (isImage)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Container(
                                    color: Colors.white,
                                    width: double.infinity,
                                    child: CachedNetworkImage(
                                      imageUrl: proofUrl,
                                      height: 120,
                                      fit: BoxFit.contain,
                                      placeholder: (_, __) => Container(
                                        height: 120,
                                        color: Colors.grey.shade100,
                                        child: const Center(
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        ),
                                      ),
                                      errorWidget: (_, __, ___) => Container(
                                        height: 120,
                                        color: Colors.grey.shade100,
                                        child: const Center(
                                          child: Icon(
                                            Icons.broken_image,
                                            color: Colors.grey,
                                            size: 40,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                              else
                                InkWell(
                                  onTap: () async {
                                    final uri = Uri.tryParse(proofUrl ?? '');
                                    if (uri != null &&
                                        await canLaunchUrl(uri)) {
                                      await launchUrl(
                                        uri,
                                        mode: LaunchMode.externalApplication,
                                      );
                                    }
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                      horizontal: 12,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.grey.shade100,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.insert_drive_file,
                                          color: Colors.grey.shade600,
                                          size: 16,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            'View Receipt',
                                            style: GoogleFonts.poppins(
                                              fontSize: 11,
                                              color: Colors.grey.shade700,
                                            ),
                                          ),
                                        ),
                                        Icon(
                                          Icons.open_in_new,
                                          color: Colors.grey.shade600,
                                          size: 14,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  );
                }),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      await _showNextPendingAdvanceDialog();
                    },
                    icon: const Icon(Icons.check_circle, size: 16),
                    label: Text(
                      'Confirm Advances Now',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.amber.shade600,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
        Text(
          widget.isArabic ? 'معاملات حسب الموقع' : 'Recent by Site',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        if (displayKeys.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                widget.isArabic ? 'لا توجد معاملات بعد' : 'No transactions yet',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ),
          )
        else
          ...displayKeys.map((key) => _buildSiteGroupCard(groups[key]!)),
        const SizedBox(height: 24),
        _buildAdvanceReconciliationSection(),
      ],
    );
  }

  Widget _buildSiteGroupCard(List<Map<String, dynamic>> txs) {
    if (txs.isEmpty) return const SizedBox();
    if (txs.length == 1) return _buildTransactionItem(txs.first);

    // Compute totals
    double totalFee = 0, totalAdvance = 0, totalDeduction = 0;
    DateTime latest = DateTime(2000);
    for (final tx in txs) {
      final type = tx['type'] as String? ?? '';
      final amt = (tx['amount'] as num?)?.toDouble().abs() ?? 0.0;
      final dt = tx['created_at'] != null
          ? DateTime.parse(tx['created_at'] as String).toLocal()
          : DateTime.now();
      if (dt.isAfter(latest)) latest = dt;
      if (type == 'site_visit_fee' ||
          type == 'visit_completion' ||
          type == 'earning') {
        totalFee += amt;
      } else if (type == 'down_payment') {
        totalAdvance += amt;
      } else if (type == 'advance_deduction') {
        totalDeduction += amt;
      }
    }
    final net = totalFee - totalAdvance - totalDeduction;
    final siteName = _siteNameFromTx(
      txs.firstWhere(
        (t) =>
            t['type'] == 'site_visit_fee' ||
            t['type'] == 'visit_completion' ||
            t['type'] == 'earning',
        orElse: () => txs.first,
      ),
    );
    final dateLabel = '${latest.day}/${latest.month}/${latest.year}';

    return GestureDetector(
      onTap: () => _showSiteGroupDetail(txs, siteName),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Colors.teal.withValues(alpha: 0.25),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      color: Colors.teal.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.location_on,
                      color: Colors.teal,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          siteName,
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF1A2340),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '$dateLabel · ${txs.length} ${widget.isArabic ? 'معاملات' : 'transactions'}',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: AppColors.textLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${net >= 0 ? '+' : '−'}${_formatCurrency(net.abs())} SDG',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: net >= 0 ? Colors.green[700] : Colors.red[600],
                        ),
                      ),
                      Text(
                        widget.isArabic ? 'صافي' : 'Net',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: AppColors.textLight,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Divider(height: 1, thickness: 0.5),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (totalFee > 0) ...[
                    Icon(Icons.trending_up, size: 13, color: Colors.green[600]),
                    const SizedBox(width: 3),
                    Text(
                      '+${_formatCurrency(totalFee)}',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.green[700],
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  if (totalAdvance > 0) ...[
                    Icon(
                      Icons.arrow_circle_up,
                      size: 13,
                      color: Colors.orange[600],
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '−${_formatCurrency(totalAdvance)}',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.orange[700],
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  if (totalDeduction > 0) ...[
                    Icon(
                      Icons.remove_circle_outline,
                      size: 13,
                      color: Colors.red[400],
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '−${_formatCurrency(totalDeduction)}',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.red[600],
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  const Spacer(),
                  Icon(
                    Icons.chevron_right,
                    size: 16,
                    color: AppColors.textLight,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSiteGroupDetail(List<Map<String, dynamic>> txs, String siteName) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        expand: false,
        builder: (ctx, sc) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.symmetric(vertical: 10),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.teal.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.location_on,
                        color: Colors.teal,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        siteName,
                        style: GoogleFonts.poppins(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      '${txs.length} ${widget.isArabic ? 'معاملة' : 'entries'}',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: AppColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView(
                  controller: sc,
                  padding: const EdgeInsets.all(16),
                  children: txs.map((tx) => _buildTransactionItem(tx)).toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAdvanceReconciliationSection() {
    final advanceDeductions = _transactions
        .where(
          (t) =>
              t['type'] == 'advance_deduction' ||
              t['description']?.toString().toLowerCase().contains('advance') ==
                  true,
        )
        .toList();

    if (advanceDeductions.isEmpty) return const SizedBox();

    final totalDeducted = advanceDeductions.fold(
      0.0,
      (sum, t) => sum + ((t['amount'] as num?)?.toDouble() ?? 0.0).abs(),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.sync, color: Colors.blue[700], size: 20),
            const SizedBox(width: 8),
            Text(
              widget.isArabic
                  ? 'تسوية الترحيل و المواصلات'
                  : 'Advance Reconciliation',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.withValues(alpha: 0.2)),
          ),
          child: Row(
            children: [
              Icon(Icons.info_outline, color: Colors.blue[600], size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  widget.isArabic
                      ? 'إجمالي خصومات الترحيل و المواصلات من رسوم الزيارة: ${_formatCurrency(totalDeducted)}'
                      : 'Total advance deductions from visit fees: ${_formatCurrency(totalDeducted)}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.blue[700],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ...advanceDeductions.take(5).map((t) => _buildTransactionItem(t)),
      ],
    );
  }

  Widget _buildTransactionsTab() {
    final filtered = _getFilteredTransactions();
    final allTransactions = _getFilteredTransactions();
    final totalTx = _transactions.length;

    String getFilterLabel() {
      switch (_transactionFilter) {
        case 'earning':
          return widget.isArabic ? 'الأرباح' : 'Earnings';
        case 'withdrawal':
          return widget.isArabic ? 'السحوبات' : 'Withdrawals';
        case 'bonus':
          return widget.isArabic ? 'المكافآت' : 'Bonuses';
        case 'penalty':
          return widget.isArabic ? 'الغرامات' : 'Penalties';
        default:
          return widget.isArabic ? 'جميع' : 'All';
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Show enhanced filter status bar when filtering
        if (_transactionFilter != 'all')
          FilterStatusBar(
            filterLabel: widget.isArabic ? 'نوع المعاملة' : 'Transaction Type',
            currentFilter: getFilterLabel(),
            totalCount: totalTx,
            filteredCount: filtered.length,
            subtitle: widget.isArabic
                ? 'شغل جميع المعاملات'
                : 'View all transactions',
            icon: Icons.receipt_long,
            primaryColor: Colors.teal.shade600,
            showPercentage: true,
            showResetButton: true,
            onTap: () {
              // Show filter selector
              showModalBottomSheet(
                context: context,
                builder: (ctx) => Container(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.isArabic ? 'نوع المعاملة' : 'Transaction Type',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ...[
                        ('all', widget.isArabic ? 'جميع' : 'All'),
                        ('earning', widget.isArabic ? 'الأرباح' : 'Earnings'),
                        (
                          'withdrawal',
                          widget.isArabic ? 'السحوبات' : 'Withdrawals',
                        ),
                        ('bonus', widget.isArabic ? 'المكافآت' : 'Bonuses'),
                        ('penalty', widget.isArabic ? 'الغرامات' : 'Penalties'),
                      ].map(
                        (item) => ListTile(
                          title: Text(item.$2),
                          selected: _transactionFilter == item.$1,
                          onTap: () {
                            setState(() => _transactionFilter = item.$1);
                            Navigator.pop(ctx);
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
            onReset: () => setState(() => _transactionFilter = 'all'),
          ),

        // Filter dropdown
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.backgroundGray,
            borderRadius: BorderRadius.circular(12),
          ),
          child: DropdownButton<String>(
            value: _transactionFilter,
            isExpanded: true,
            underline: const SizedBox(),
            items: [
              DropdownMenuItem(
                value: 'all',
                child: Text(widget.isArabic ? 'جميع ' : 'All Transactions'),
              ),
              DropdownMenuItem(
                value: 'earning',
                child: Text(widget.isArabic ? 'الأرباح' : 'Earnings'),
              ),
              DropdownMenuItem(
                value: 'withdrawal',
                child: Text(widget.isArabic ? 'السحوبات' : 'Withdrawals'),
              ),
              DropdownMenuItem(
                value: 'bonus',
                child: Text(widget.isArabic ? 'المكافآت' : 'Bonuses'),
              ),
              DropdownMenuItem(
                value: 'penalty',
                child: Text(widget.isArabic ? 'الغرامات' : 'Penalties'),
              ),
            ],
            onChanged: (value) =>
                setState(() => _transactionFilter = value ?? 'all'),
          ),
        ),
        const SizedBox(height: 16),
        if (filtered.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                widget.isArabic ? 'لا توجد معاملات' : 'No transactions found',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ),
          )
        else
          ...filtered.map((transaction) => _buildTransactionItem(transaction)),
      ],
    );
  }

  Widget _buildWithdrawalsTab() {
    final filtered = _getFilteredWithdrawals();
    final totalWd = _withdrawalRequests.length;

    String getFilterLabel() {
      switch (_withdrawalFilter) {
        case 'pending':
          return widget.isArabic ? 'قيد الانتظار' : 'Pending';
        case 'approved':
          return widget.isArabic ? 'معتمدة' : 'Approved';
        case 'rejected':
          return widget.isArabic ? 'مرفوضة' : 'Rejected';
        default:
          return widget.isArabic ? 'الكل' : 'All';
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Show enhanced filter status bar when filtering
        if (_withdrawalFilter != 'all')
          FilterStatusBar(
            filterLabel: widget.isArabic ? 'حالة السحب' : 'Withdrawal Status',
            currentFilter: getFilterLabel(),
            totalCount: totalWd,
            filteredCount: filtered.length,
            subtitle: widget.isArabic
                ? 'عرض جميع طلبات السحب'
                : 'View all withdrawal requests',
            icon: Icons.arrow_circle_down,
            primaryColor: Colors.teal.shade600,
            showPercentage: true,
            showResetButton: true,
            onTap: () {
              // Show filter selector
              showModalBottomSheet(
                context: context,
                builder: (ctx) => Container(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.isArabic ? 'حالة السحب' : 'Withdrawal Status',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ...[
                        ('all', widget.isArabic ? 'الكل' : 'All'),
                        (
                          'pending',
                          widget.isArabic ? 'قيد الانتظار' : 'Pending',
                        ),
                        ('approved', widget.isArabic ? 'معتمدة' : 'Approved'),
                        ('rejected', widget.isArabic ? 'مرفوضة' : 'Rejected'),
                      ].map(
                        (item) => ListTile(
                          title: Text(item.$2),
                          selected: _withdrawalFilter == item.$1,
                          onTap: () {
                            setState(() => _withdrawalFilter = item.$1);
                            Navigator.pop(ctx);
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
            onReset: () => setState(() => _withdrawalFilter = 'all'),
          ),

        // Filter dropdown
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.backgroundGray,
            borderRadius: BorderRadius.circular(12),
          ),
          child: DropdownButton<String>(
            value: _withdrawalFilter,
            isExpanded: true,
            underline: const SizedBox(),
            items: [
              DropdownMenuItem(
                value: 'all',
                child: Text(
                  widget.isArabic ? 'جميع السحوبات' : 'All Withdrawals',
                ),
              ),
              DropdownMenuItem(
                value: 'pending',
                child: Text(widget.isArabic ? 'قيد الانتظار' : 'Pending'),
              ),
              DropdownMenuItem(
                value: 'approved',
                child: Text(widget.isArabic ? 'معتمدة' : 'Approved'),
              ),
              DropdownMenuItem(
                value: 'rejected',
                child: Text(widget.isArabic ? 'مرفوضة' : 'Rejected'),
              ),
            ],
            onChanged: (value) =>
                setState(() => _withdrawalFilter = value ?? 'all'),
          ),
        ),
        const SizedBox(height: 16),
        if (filtered.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                widget.isArabic
                    ? 'لا توجد طلبات سحب'
                    : 'No withdrawal requests found',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ),
          )
        else
          ...filtered.map((withdrawal) => _buildWithdrawalItem(withdrawal)),
      ],
    );
  }

  Widget _buildAdvancesTab() {
    if (_advances.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.account_balance_wallet_outlined,
                size: 48,
                color: AppColors.textLight,
              ),
              const SizedBox(height: 12),
              Text(
                widget.isArabic
                    ? 'لا توجد مقدمات ترحيل بعد'
                    : 'No advances yet',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ],
          ),
        ),
      );
    }

    final pendingAdv = _advances.where((a) {
      final s = (a['status'] as String? ?? '').toLowerCase();
      final meta = (a['metadata'] as Map?)?.cast<String, dynamic>() ?? {};
      final confirmed = meta['receipt_confirmation']?['confirmed'] == true;
      return (s == 'partially_paid' || s == 'fully_paid' || s == 'paid') &&
          !confirmed;
    }).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.isArabic
              ? 'مقدم الترحيل والمواصلات'
              : 'My Transportation Advances',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        if (getTotalPendingConfirmationCount() > 0)
          GestureDetector(
            onTap: () {
              final first = _pendingAdvanceConfirmations.isNotEmpty
                  ? _pendingAdvanceConfirmations.first
                  : _advances.firstWhere((a) {
                      final s = (a['status'] as String? ?? '').toLowerCase();
                      final meta =
                          (a['metadata'] as Map?)?.cast<String, dynamic>() ??
                          {};
                      final confirmed =
                          meta['receipt_confirmation']?['confirmed'] == true;
                      return (s == 'partially_paid' ||
                              s == 'fully_paid' ||
                              s == 'paid') &&
                          !confirmed;
                    }, orElse: () => {});
              if (first.isNotEmpty) _confirmAdvanceReceipt(first);
            },
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.amber.shade300),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    color: Colors.amber.shade800,
                    size: 16,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.isArabic
                          ? '${getTotalPendingConfirmationCount()} من المستندات تنتظر التأكيد (${_pendingAdvanceConfirmations.length} سلفة و ${_pendingReceiptConfirmations.length} تكاليف)'
                          : '${getTotalPendingConfirmationCount()} items await confirmation (${_pendingAdvanceConfirmations.length} advances, ${_pendingReceiptConfirmations.length} costs)',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.amber.shade900,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.chevron_right,
                    color: Colors.amber.shade700,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 4),
        ..._advances.map((advance) => _buildAdvanceItem(advance)),
      ],
    );
  }

  Widget _buildCostPaymentsTab() {
    if (_costPaymentsLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_costPayments.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.receipt_outlined,
                size: 48,
                color: AppColors.textLight,
              ),
              const SizedBox(height: 12),
              Text(
                widget.isArabic
                    ? 'لا توجد تقديمات تكاليف بعد'
                    : 'No cost submissions yet',
                style: GoogleFonts.poppins(
                  color: AppColors.textLight,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.isArabic
                    ? 'ستظهر هنا جميع تقديمات التكاليف مع حالاتها'
                    : 'All your cost submissions will appear here with their current status',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: AppColors.textLight,
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Only paid submissions awaiting your receipt confirmation need action
    final pending = _costPayments
        .where(
          (c) => c['status'] == 'paid' && c['fund_receipt_confirmed'] != true,
        )
        .length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header + pending alert
        Text(
          widget.isArabic ? 'تقديمات التكاليف' : 'My Cost Submissions',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        if (pending > 0)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.teal.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.teal.shade200),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.teal.shade700, size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.isArabic
                        ? '$pending دفعة تنتظر تأكيد الاستلام منك'
                        : '$pending payment${pending != 1 ? 's' : ''} awaiting your receipt confirmation',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.teal.shade800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ..._costPayments.map((cost) => _buildCostPaymentItem(cost)),
      ],
    );
  }

  Widget _buildCostPaymentItem(Map<String, dynamic> cost) {
    final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
    final amountSdg = amountCents / 100.0;
    final category = cost['expense_category'] as String? ?? 'other';
    final categoryLabel =
        {
          'permits': 'Permits & Licenses',
          'incentives': 'Incentives & Allowances',
          'communications': 'Internet & Comms',
          'training': 'Training',
          'transport': 'Transportation',
          'general_transport': 'Transportation',
          'equipment': 'Equipment & Supplies',
          'printing': 'Printing & Stationery',
          'meetings': 'Meetings',
          'office_admin': 'Office Admin',
          'other': 'Other',
        }[category] ??
        category;
    final categoryLabelAr =
        {
          'permits': 'تصاريح ورخص',
          'incentives': 'حوافز وبدلات',
          'communications': 'انترنت واتصالات',
          'training': 'تدريب',
          'transport': 'نقل وسفر',
          'general_transport': 'نقل وسفر',
          'equipment': 'معدات ولوازم',
          'printing': 'طباعة وقرطاسية',
          'meetings': 'اجتماعات',
          'office_admin': 'مكتب وادارة',
          'other': 'أخرى',
        }[category] ??
        category;

    final status = (cost['status'] as String? ?? 'pending').toLowerCase();
    final receiptConfirmed = cost['fund_receipt_confirmed'] == true;
    final confirmedAt = cost['fund_receipt_confirmed_at'] as String?;
    final declinedAt = cost['receipt_declined_at'] as String?;
    final isDeclined = declinedAt != null;
    final paidAt = cost['paid_at'] as String?;
    final createdAt = cost['created_at'] as String?;
    final description = cost['description'] as String?;
    final vendor = cost['vendor'] as String?;
    final expenseDate = cost['expense_date'] as String?;
    final rejectionReason = cost['rejection_reason'] as String?;
    final tier1Status = (cost['tier1_status'] as String? ?? '').toLowerCase();
    final tier2Status = (cost['tier2_status'] as String? ?? '').toLowerCase();
    final tier3Status = (cost['tier3_status'] as String? ?? '').toLowerCase();
    final costId = (cost['id'] as String? ?? '').substring(0, 8).toUpperCase();
    final displayDate = paidAt ?? createdAt;

    // Determine which approval tier is currently pending
    String tierPendingLabel;
    String tierPendingLabelAr;
    if (tier1Status.isEmpty || tier1Status == 'pending') {
      tierPendingLabel = 'Awaiting Tier 1 (Supervisor) approval';
      tierPendingLabelAr = 'بانتظار موافقة المستوى الأول (المشرف)';
    } else if (tier1Status == 'approved' &&
        (tier2Status.isEmpty || tier2Status == 'pending')) {
      tierPendingLabel = 'Awaiting Tier 2 (Admin) approval';
      tierPendingLabelAr = 'بانتظار موافقة المستوى الثاني (الإدارة)';
    } else if (tier2Status == 'approved' &&
        (tier3Status.isEmpty || tier3Status == 'pending')) {
      tierPendingLabel = 'Awaiting Tier 3 (Finance) approval';
      tierPendingLabelAr = 'بانتظار موافقة المستوى الثالث (المالية)';
    } else {
      tierPendingLabel = 'Under review by management';
      tierPendingLabelAr = 'قيد المراجعة من الإدارة';
    }

    // Status appearance config
    Color statusBg, statusBorder, statusText;
    String statusLabelEn, statusLabelAr;
    IconData statusIcon;
    switch (status) {
      case 'paid':
      case 'reconciled':
        statusBg = Colors.purple.shade50;
        statusBorder = Colors.purple.shade200;
        statusText = Colors.purple.shade700;
        statusLabelEn = status == 'reconciled' ? 'Reconciled' : 'Paid';
        statusLabelAr = status == 'reconciled' ? 'مسوّى' : 'مدفوع';
        statusIcon = Icons.payments_outlined;
        break;
      case 'approved':
      case 'tier1_approved':
        statusBg = Colors.green.shade50;
        statusBorder = Colors.green.shade200;
        statusText = Colors.green.shade700;
        statusLabelEn = status == 'tier1_approved' ? 'T1 Approved' : 'Approved';
        statusLabelAr = status == 'tier1_approved' ? 'موافقة م١' : 'موافق عليه';
        statusIcon = Icons.check_circle_outline;
        break;
      case 'rejected':
        statusBg = Colors.red.shade50;
        statusBorder = Colors.red.shade200;
        statusText = Colors.red.shade700;
        statusLabelEn = 'Rejected';
        statusLabelAr = 'مرفوض';
        statusIcon = Icons.cancel_outlined;
        break;
      default:
        statusBg = Colors.orange.shade50;
        statusBorder = Colors.orange.shade200;
        statusText = Colors.orange.shade700;
        statusLabelEn = 'Pending';
        statusLabelAr = 'قيد المراجعة';
        statusIcon = Icons.hourglass_empty;
    }

    // Card border colour based on status
    Color cardBorder;
    if (status == 'paid' || status == 'reconciled') {
      cardBorder = receiptConfirmed
          ? Colors.green.shade200
          : Colors.purple.shade200;
    } else if (status == 'rejected') {
      cardBorder = Colors.red.shade200;
    } else if (status == 'approved' || status == 'tier1_approved') {
      cardBorder = Colors.green.shade200;
    } else {
      cardBorder = Colors.orange.shade200;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cardBorder, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: statusBg,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(statusIcon, color: statusText, size: 16),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.isArabic ? categoryLabelAr : categoryLabel,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      if (description != null && description.isNotEmpty)
                        Text(
                          description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      Text(
                        'REF: $costId',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey.shade500,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Dynamic status badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: statusBg,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: statusBorder),
                      ),
                      child: Text(
                        widget.isArabic ? statusLabelAr : statusLabelEn,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: statusText,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amountSdg)} SDG',
                      style: GoogleFonts.poppins(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: Colors.teal.shade700,
                      ),
                    ),
                    if (displayDate != null)
                      Text(
                        DateFormat(
                          'dd MMM yyyy',
                        ).format(DateTime.parse(displayDate).toLocal()),
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: Colors.grey.shade500,
                        ),
                      ),
                  ],
                ),
              ],
            ),

            // Expand/Collapse button for details
            const SizedBox(height: 8),
            GestureDetector(
              onTap: () {
                setState(() {
                  final costId = cost['id'] as String;
                  _expandedCostItems[costId] =
                      !(_expandedCostItems[costId] ?? false);
                });
              },
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    widget.isArabic ? 'التفاصيل' : 'Details',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.teal.shade700,
                    ),
                  ),
                  Icon(
                    _expandedCostItems[cost['id']] ?? false
                        ? Icons.expand_less
                        : Icons.expand_more,
                    color: Colors.teal.shade700,
                    size: 20,
                  ),
                ],
              ),
            ),

            // Expandable details section
            if (_expandedCostItems[cost['id']] ?? false) ...[
              const SizedBox(height: 8),
              const Divider(height: 1, thickness: 0.5),
              const SizedBox(height: 12),
              // Bilingual details
              _costDetailRow(
                widget.isArabic ? 'رقم المرجع' : 'Reference',
                costId,
              ),
              _costDetailRow(
                widget.isArabic ? 'الفئة' : 'Category',
                widget.isArabic ? categoryLabelAr : categoryLabel,
              ),
              if (expenseDate != null)
                _costDetailRow(
                  widget.isArabic ? 'تاريخ الصرف' : 'Expense Date',
                  DateFormat(
                    'dd MMM yyyy',
                  ).format(DateTime.parse(expenseDate).toLocal()),
                ),
              if (vendor != null && vendor.isNotEmpty)
                _costDetailRow(widget.isArabic ? 'المورد' : 'Vendor', vendor),
              if (description != null && description.isNotEmpty)
                _costDetailRow(
                  widget.isArabic ? 'الوصف' : 'Description',
                  description,
                ),
              _costDetailRow(
                widget.isArabic ? 'المبلغ' : 'Amount',
                '${NumberFormat.currency(symbol: '', decimalDigits: 2).format(amountSdg)} SDG',
              ),
              _costDetailRow(
                widget.isArabic ? 'الحالة' : 'Status',
                widget.isArabic ? statusLabelAr : statusLabelEn,
              ),
              // Receipt information if available
              if ((cost['payment_proof_url'] as String?) != null &&
                  (cost['payment_proof_url'] as String).isNotEmpty) ...[
                const SizedBox(height: 8),
                const Divider(height: 1, thickness: 0.5),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.receipt_long,
                      color: Colors.teal.shade700,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.isArabic ? 'إيصال الدفع' : 'Payment Receipt',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.teal.shade700,
                        ),
                      ),
                    ),
                    GestureDetector(
                      onTap: () async {
                        final uri = Uri.tryParse(cost['payment_proof_url']);
                        if (uri != null) {
                          try {
                            // Open URL on both web and mobile
                            await launchUrl(
                              uri,
                              mode: LaunchMode.externalApplication,
                            );
                          } catch (_) {}
                        }
                      },
                      child: Icon(
                        Icons.open_in_new,
                        color: Colors.teal.shade600,
                        size: 14,
                      ),
                    ),
                  ],
                ),
              ],
            ],

            const SizedBox(height: 10),

            // Not Yet Received Indicator for Cost Payments
            if (isDeclined) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade300),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: Colors.red.shade700,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            widget.isArabic
                                ? 'تم تسجيل "لم يتم الاستلام"'
                                : 'Marked as Not Yet Received',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.red.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    ...[
                      const SizedBox(height: 4),
                      Text(
                        widget.isArabic
                            ? 'التاريخ: ${DateFormat('dd MMM yyyy - HH:mm').format(DateTime.parse(declinedAt))}'
                            : 'Date: ${DateFormat('dd MMM yyyy - HH:mm').format(DateTime.parse(declinedAt))}',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: Colors.red.shade600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      widget.isArabic
                          ? 'تم إخطار المشرفين والإدارة والمالية. ستتمكن من تأكيد الاستلام عند وصول الدفعة المعاد إرسالها.'
                          : 'Supervisors, administration, and finance have been notified. You can confirm receipt once the resent payment arrives.',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.red.shade600,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],

            // Receipt status
            if (receiptConfirmed) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.verified,
                      color: Colors.green.shade700,
                      size: 15,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.isArabic
                                ? 'تم تأكيد الاستلام ✓'
                                : 'Receipt confirmed ✓',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.green.shade700,
                            ),
                          ),
                          if (confirmedAt != null)
                            Text(
                              DateFormat(
                                'dd MMM yyyy, HH:mm',
                              ).format(DateTime.parse(confirmedAt).toLocal()),
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: Colors.green.shade600,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (status == 'paid' || status == 'reconciled') ...[
              // Show payment receipt if attached by finance
              if ((cost['payment_proof_url'] as String?) != null &&
                  (cost['payment_proof_url'] as String).isNotEmpty) ...[
                _buildPaymentReceiptCard(
                  proofUrl: cost['payment_proof_url'] as String,
                  proofNotes: cost['payment_proof_notes'] as String?,
                  isAmber: false,
                ),
                const SizedBox(height: 8),
              ],
              // Paid but receipt not yet confirmed — show confirm button
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.warning_amber,
                      color: Colors.amber.shade700,
                      size: 15,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        widget.isArabic
                            ? 'لم يتم تأكيد استلام الدفعة بعد'
                            : 'Receipt not yet confirmed',
                        style: GoogleFonts.poppins(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: Colors.amber.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _confirmCostPaymentReceipt(cost),
                  icon: const Icon(Icons.verified, size: 16),
                  label: Text(
                    widget.isArabic ? 'تأكيد استلام الدفعة' : 'Confirm Receipt',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.teal.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ] else ...[
              // Not yet paid — show informational status message
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: statusBorder),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Icon(statusIcon, color: statusText, size: 14),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            status == 'rejected'
                                ? (widget.isArabic
                                      ? 'تم رفض هذا التقديم'
                                      : 'This submission was rejected')
                                : status == 'approved'
                                ? (widget.isArabic
                                      ? 'معتمد — بانتظار الصرف من المالية'
                                      : 'Approved — awaiting finance disbursement')
                                : status == 'tier1_approved'
                                ? (widget.isArabic
                                      ? 'موافقة م١ — بانتظار الاعتماد النهائي'
                                      : 'T1 Approved — awaiting final approval')
                                : (widget.isArabic
                                      ? tierPendingLabelAr
                                      : tierPendingLabel),
                            style: GoogleFonts.poppins(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600,
                              color: statusText,
                            ),
                          ),
                          // Show rejection reason if available
                          if (status == 'rejected' &&
                              rejectionReason != null &&
                              rejectionReason.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              '${widget.isArabic ? 'السبب' : 'Reason'}: $rejectionReason',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: statusText,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _costDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: Colors.grey.shade800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmAdvanceReceipt(Map<String, dynamic> advance) async {
    final advanceId = advance['id'] as String?;
    if (advanceId == null) return;

    // Step 1: Get GPS location (non-blocking, 8s timeout)
    Position? gpsPosition;
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.whileInUse ||
          perm == LocationPermission.always) {
        gpsPosition = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
          timeLimit: const Duration(seconds: 8),
        );
      }
    } catch (_) {}

    // Step 2: Load saved signature from profile (non-blocking)
    String? savedSignatureBase64;
    try {
      final profileData = await Supabase.instance.client
          .from('profiles')
          .select('signature_base64')
          .eq('id', _userId ?? '')
          .maybeSingle();
      savedSignatureBase64 = profileData?['signature_base64'] as String?;
    } catch (_) {}

    // Step 3: Show confirmation dialog
    final notesController = TextEditingController();
    final signatureStrokes = <List<Offset>>[];
    // useSaved = true → use profile signature; false → draw new
    bool useSaved = savedSignatureBase64 != null;

    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          final hasSig = useSaved
              ? savedSignatureBase64 != null
              : signatureStrokes.isNotEmpty;

          return AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            titlePadding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            contentPadding: const EdgeInsets.fromLTRB(16, 10, 16, 0),

            // ── Bilingual title ──────────────────────────────────────────
            title: Row(
              children: [
                const Icon(Icons.verified_user, color: Colors.green, size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Confirm Fund Receipt',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        'تأكيد استلام الترحيل و المواصلاتة',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),

                  // ── Bilingual statement ────────────────────────────────
                  Text(
                    'I confirm that I have received the advance funds.',
                    style: GoogleFonts.poppins(fontSize: 13),
                  ),
                  Text(
                    'أؤكد أنني استلمت مبلغ الترحيل و المواصلاتة كاملاً.',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                    textDirection: ui.TextDirection.rtl,
                  ),

                  const SizedBox(height: 10),

                  // ── GPS badge ──────────────────────────────────────────
                  if (gpsPosition != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.location_on,
                            color: Colors.blue.shade700,
                            size: 13,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${gpsPosition.latitude.toStringAsFixed(5)}, '
                            '${gpsPosition.longitude.toStringAsFixed(5)}',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.blue.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),

                  const SizedBox(height: 10),

                  // ── What happens next info panel ───────────────────────
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.info_outline,
                              size: 14,
                              color: Colors.green.shade700,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'What happens after you confirm:',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.green.shade800,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        _infoPoint(
                          '✓ Advance marked as received in the system',
                        ),
                        _infoPoint('✓ Your supervisor will be notified'),
                        _infoPoint(
                          '✓ Amount will be deducted from your site visit fee',
                        ),
                        _infoPoint(
                          '✓ Your signature & GPS are saved as legal proof',
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'ماذا يحدث بعد التأكيد:',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Colors.green.shade800,
                          ),
                          textDirection: ui.TextDirection.rtl,
                        ),
                        _infoPoint(
                          '✓ تُسجَّل الترحيل و المواصلاتة كمستلمة في النظام',
                          rtl: true,
                        ),
                        _infoPoint('✓ يتم إشعار المشرف', rtl: true),
                        _infoPoint(
                          '✓ يُخصم المبلغ من رسوم الزيارة الميدانية',
                          rtl: true,
                        ),
                        _infoPoint(
                          '✓ توقيعك وموقعك الجغرافي يُحفظان كدليل رسمي',
                          rtl: true,
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 12),

                  // ── Signature section ──────────────────────────────────
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Signature / التوقيع',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (savedSignatureBase64 != null)
                        Row(
                          children: [
                            Text(
                              useSaved ? 'Saved' : 'Draw new',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: useSaved
                                    ? Colors.green.shade700
                                    : Colors.orange.shade700,
                              ),
                            ),
                            const SizedBox(width: 4),
                            GestureDetector(
                              onTap: () => setDialogState(() {
                                useSaved = !useSaved;
                                if (!useSaved) signatureStrokes.clear();
                              }),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: useSaved
                                      ? Colors.orange.shade50
                                      : Colors.green.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: useSaved
                                        ? Colors.orange.shade300
                                        : Colors.green.shade300,
                                  ),
                                ),
                                child: Text(
                                  useSaved
                                      ? 'Draw new / ارسم جديداً'
                                      : 'Use saved / استخدم المحفوظ',
                                  style: GoogleFonts.poppins(
                                    fontSize: 9,
                                    color: useSaved
                                        ? Colors.orange.shade800
                                        : Colors.green.shade800,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                  const SizedBox(height: 6),

                  // ── Saved signature preview ────────────────────────────
                  if (useSaved && savedSignatureBase64 != null)
                    Container(
                      height: 100,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Colors.green.shade400,
                          width: 1.5,
                        ),
                        borderRadius: BorderRadius.circular(8),
                        color: Colors.white,
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(7),
                        child: Stack(
                          children: [
                            Center(
                              child: Image.memory(
                                base64Decode(savedSignatureBase64),
                                fit: BoxFit.contain,
                              ),
                            ),
                            Positioned(
                              top: 4,
                              right: 6,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.green.shade600,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  'Saved / محفوظ',
                                  style: GoogleFonts.poppins(
                                    fontSize: 9,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  // ── Draw new signature ─────────────────────────────────
                  else
                    Container(
                      height: 110,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: signatureStrokes.isEmpty
                              ? Colors.orange.shade300
                              : Colors.green.shade400,
                          width: 1.5,
                        ),
                        borderRadius: BorderRadius.circular(8),
                        color: Colors.white,
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(7),
                        child: GestureDetector(
                          onPanStart: (d) => setDialogState(
                            () => signatureStrokes.add([d.localPosition]),
                          ),
                          onPanUpdate: (d) => setDialogState(
                            () => signatureStrokes.last.add(d.localPosition),
                          ),
                          child: CustomPaint(
                            painter: _SignaturePainter(signatureStrokes),
                            child: signatureStrokes.isEmpty
                                ? Center(
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.draw_outlined,
                                          color: Colors.grey.shade400,
                                          size: 28,
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Draw your signature here',
                                          style: GoogleFonts.poppins(
                                            color: Colors.grey.shade400,
                                            fontSize: 11,
                                          ),
                                        ),
                                        Text(
                                          'ارسم توقيعك هنا',
                                          style: GoogleFonts.poppins(
                                            color: Colors.grey.shade400,
                                            fontSize: 10,
                                          ),
                                        ),
                                      ],
                                    ),
                                  )
                                : null,
                          ),
                        ),
                      ),
                    ),

                  // ── Clear drawn signature ──────────────────────────────
                  if (!useSaved && signatureStrokes.isNotEmpty)
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        onPressed: () =>
                            setDialogState(() => signatureStrokes.clear()),
                        icon: const Icon(Icons.refresh, size: 13),
                        label: Text(
                          'Clear / مسح',
                          style: GoogleFonts.poppins(fontSize: 10),
                        ),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.red.shade400,
                          padding: EdgeInsets.zero,
                        ),
                      ),
                    ),

                  const SizedBox(height: 8),

                  // ── Notes ─────────────────────────────────────────────
                  TextField(
                    controller: notesController,
                    maxLines: 2,
                    decoration: InputDecoration(
                      hintText: 'Notes (optional) / ملاحظات (اختياري)',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      contentPadding: const EdgeInsets.all(10),
                      isDense: true,
                    ),
                    style: GoogleFonts.poppins(fontSize: 12),
                  ),
                  const SizedBox(height: 4),
                ],
              ),
            ),

            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(
                  'Cancel / إلغاء',
                  style: GoogleFonts.poppins(fontSize: 12),
                ),
              ),
              ElevatedButton.icon(
                icon: const Icon(Icons.check_circle_outline, size: 16),
                label: Text(
                  'Confirm / تأكيد الاستلام',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                    fontSize: 12,
                  ),
                ),
                onPressed: () {
                  if (!hasSig) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(
                        content: Text(
                          'Please sign first / يرجى رسم توقيعك أولاً',
                        ),
                        backgroundColor: Colors.orange,
                        duration: const Duration(seconds: 2),
                      ),
                    );
                    return;
                  }
                  Navigator.pop(ctx, true);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green.shade600,
                ),
              ),
            ],
          );
        },
      ),
    );

    if (confirmed != true) return;

    // Step 4: Encode signature as base64 PNG
    String? signatureBase64;
    if (useSaved && savedSignatureBase64 != null) {
      // User chose saved profile signature — use directly
      signatureBase64 = savedSignatureBase64;
    } else {
      try {
        final recorder = ui.PictureRecorder();
        final uiCanvas = ui.Canvas(recorder, ui.Rect.fromLTWH(0, 0, 320, 120));
        uiCanvas.drawRect(
          ui.Rect.fromLTWH(0, 0, 320, 120),
          ui.Paint()..color = const ui.Color(0xFFFFFFFF),
        );
        final sigPaint = ui.Paint()
          ..color = const ui.Color(0xFF000000)
          ..strokeWidth = 2.5
          ..strokeCap = ui.StrokeCap.round
          ..strokeJoin = ui.StrokeJoin.round
          ..style = ui.PaintingStyle.stroke;
        for (final stroke in signatureStrokes) {
          if (stroke.length < 2) continue;
          final path = ui.Path()..moveTo(stroke[0].dx, stroke[0].dy);
          for (int i = 1; i < stroke.length; i++) {
            path.lineTo(stroke[i].dx, stroke[i].dy);
          }
          uiCanvas.drawPath(path, sigPaint);
        }
        final picture = recorder.endRecording();
        final img = await picture.toImage(320, 120);
        final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
        if (byteData != null) {
          signatureBase64 = base64Encode(byteData.buffer.asUint8List());
        }
      } catch (e) {
        debugPrint('[Receipt] Signature encode error (non-fatal): $e');
      }
    }

    // Step 5: Build metadata payload
    // signatureBase64 is either from profile (saved) or encoded from drawn strokes
    final existingMeta = Map<String, dynamic>.from(
      (advance['metadata'] as Map?)?.cast<String, dynamic>() ?? {},
    );
    existingMeta['receipt_confirmation'] = {
      'confirmed': true,
      'confirmedAt': DateTime.now().toIso8601String(),
      'confirmedBy': _userId,
      'notes': notesController.text.trim(),
      'signatureSource': useSaved ? 'profile_saved' : 'drawn',
      if (gpsPosition != null)
        'gps': {
          'latitude': gpsPosition.latitude,
          'longitude': gpsPosition.longitude,
          'accuracy': gpsPosition.accuracy,
        },
      'signatureBase64': ?signatureBase64,
    };

    // Step 6: Check connectivity — save to Hive if offline
    bool isOffline = false;
    try {
      final conn = await Connectivity().checkConnectivity();
      isOffline =
          conn.isEmpty ||
          (conn.length == 1 && conn.first == ConnectivityResult.none);
    } catch (_) {}

    if (isOffline) {
      try {
        final box = await Hive.openBox<String>('pending_confirmations');
        await box.put(
          advanceId,
          jsonEncode({
            'advanceId': advanceId,
            'metadata': existingMeta,
            'savedAt': DateTime.now().toIso8601String(),
          }),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                widget.isArabic
                    ? 'تم حفظ التأكيد — سيتم المزامنة عند الاتصال'
                    : 'Saved offline — will sync when connected',
              ),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 4),
            ),
          );
        }
      } catch (e) {
        debugPrint('[Receipt] Hive save error: $e');
      }
      return;
    }

    // Step 6: Online — submit immediately
    try {
      await Supabase.instance.client
          .from('down_payment_requests')
          .update({'metadata': existingMeta})
          .eq('id', advanceId);

      // Broadcast notification to admin about advance receipt confirmation
      try {
        final now = DateTime.now().toIso8601String();
        await Supabase.instance.client.from('notification_broadcast').insert({
          'recipient_type': 'admin',
          'sender_id': _userId,
          'title': 'Advance Receipt Confirmed',
          'title_ar': 'تم تأكيد استلام الدفعة المقدمة',
          'message':
              'Field user has confirmed receipt of advance payment of ${_formatCurrency((advance['disbursed_amount'] as num?)?.toDouble() ?? 0.0)}',
          'message_ar':
              'أكد المستخدم الميداني استلام الدفعة المقدمة بقيمة ${_formatCurrency((advance['disbursed_amount'] as num?)?.toDouble() ?? 0.0)}',
          'notification_type': 'advance_receipt_confirmed',
          'related_id': advanceId,
          'related_type': 'advance',
          'created_at': now,
        });
      } catch (e) {
        debugPrint('[Advance] Notification broadcast error: $e');
      }

      await _syncPendingConfirmations();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'تم تأكيد الاستلام بنجاح ✓'
                  : 'Receipt confirmed successfully ✓',
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 3),
          ),
        );
        await _loadAdvances();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.isArabic
                  ? 'حدث خطأ أثناء التأكيد: $e'
                  : 'Error confirming receipt: $e',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _syncPendingConfirmations() async {
    try {
      final box = await Hive.openBox<String>('pending_confirmations');
      if (box.isEmpty) return;
      final keys = box.keys.toList();
      for (final key in keys) {
        final raw = box.get(key);
        if (raw == null) continue;
        try {
          final pending = jsonDecode(raw) as Map<String, dynamic>;
          final advanceId = pending['advanceId'] as String?;
          final metadata = pending['metadata'];
          if (advanceId == null || metadata == null) continue;
          await Supabase.instance.client
              .from('down_payment_requests')
              .update({'metadata': metadata})
              .eq('id', advanceId);
          await box.delete(key);
          debugPrint('[Wallet] Synced offline confirmation: $advanceId');
        } catch (e) {
          debugPrint('[Wallet] Sync failed for key $key: $e');
        }
      }
    } catch (e) {
      debugPrint('[Wallet] Sync error: $e');
    }
  }

  Widget _infoPoint(String text, {bool rtl = false}) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        textDirection: rtl ? ui.TextDirection.rtl : ui.TextDirection.ltr,
        children: [
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.green.shade900,
              ),
              textDirection: rtl ? ui.TextDirection.rtl : ui.TextDirection.ltr,
            ),
          ),
        ],
      ),
    );
  }

  // ─── Statement Tab ──────────────────────────────────────────────────────────

  Widget _buildStatementTab() {
    final entries = <Map<String, dynamic>>[];

    // 1. Site visit fees and earnings (credits from wallet_transactions)
    for (final tx in _transactions) {
      final type = (tx['type'] as String? ?? '').toLowerCase();
      final status = (tx['status'] as String? ?? '').toLowerCase();
      final amount = (tx['amount'] as num?)?.toDouble() ?? 0.0;

      // Include earning, site_visit_fee, and other earning transaction types
      if ((type == 'earning' ||
              type == 'site_visit_fee' ||
              type == 'visit_completion' ||
              type == 'fee' ||
              type == 'credit' ||
              type == 'fund_receipt' ||
              type == 'fund_receipt_confirmation' ||
              type == 'wallet_credit') &&
          amount > 0) {
        // Extract description and metadata for detail
        final description = tx['description'] as String? ?? '';
        final metadata = tx['metadata'];
        String labelEn = 'Site Visit Fee';
        String labelAr = 'رسوم الزيارة الميدانية';

        if (type == 'earning') {
          labelEn = 'Site Visit Earnings';
          labelAr = 'أرباح زيارة الموقع';
        } else if (type == 'fund_receipt' ||
            type == 'fund_receipt_confirmation') {
          labelEn = 'Fund Receipt';
          labelAr = 'استلام الصندوق';
        }

        entries.add({
          'entry_type': 'site_fee',
          'label_en': labelEn,
          'label_ar': labelAr,
          'description': description,
          'date': tx['created_at'] as String? ?? '',
          'amount_sdg': amount,
          'site': _siteNameFromTx(tx),
          'metadata': metadata,
          'confirmed': status == 'posted' || status == 'confirmed',
          'color': 0xFF2E7D32,
          'icon': Icons.check_circle_outline,
        });
      }

      // Include advance deductions as negative entries
      if (type == 'advance_deduction' || type == 'down_payment' && amount > 0) {
        final description = tx['description'] as String? ?? '';
        entries.add({
          'entry_type': 'advance_deduction',
          'label_en': 'Advance Deduction / Transport Advance',
          'label_ar': 'خصم السلفة / سلفة المواصلات',
          'description': description,
          'date': tx['created_at'] as String? ?? '',
          'amount_sdg': amount,
          'site': _siteNameFromTx(tx),
          'confirmed': status == 'posted' || status == 'confirmed',
          'color': 0xFFF57C00,
          'icon': Icons.directions_car_outlined,
          'is_deduction': true,
        });
      }
    }

    // 2. Transport advances that have been (partially or fully) paid
    // Skip rejected or cancelled advances — they don't represent real disbursements
    for (final advance in _advances) {
      final advStatus = (advance['status'] as String? ?? '').toLowerCase();
      if (advStatus == 'rejected' || advStatus == 'cancelled') continue;
      final totalPaid =
          (advance['total_paid_amount'] as num?)?.toDouble() ??
          (advance['disbursed_amount'] as num?)?.toDouble() ??
          0.0;
      if (totalPaid > 0) {
        entries.add({
          'entry_type': 'advance',
          'label_en': 'Transport Advance',
          'label_ar': 'سلفة مواصلات',
          'date':
              advance['updated_at'] as String? ??
              advance['created_at'] as String? ??
              '',
          'amount_sdg': totalPaid,
          'site': advance['site_name'] as String? ?? '',
          'confirmed': advance['fund_receipt_confirmed'] == true,
          'color': 0xFF1565C0,
          'icon': Icons.directions_car_outlined,
        });
      }
    }

    // 3. Operational cost reimbursements — only include paid/reconciled records
    for (final cost in _costPayments) {
      final costStatus = (cost['status'] as String? ?? '').toLowerCase();
      if (costStatus != 'paid' && costStatus != 'reconciled') continue;
      final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
      final amountSdg = amountCents / 100.0;
      if (amountSdg > 0) {
        entries.add({
          'entry_type': 'cost',
          'label_en': 'Cost Reimbursement',
          'label_ar': 'تعويض التكاليف',
          'date':
              cost['paid_at'] as String? ??
              cost['updated_at'] as String? ??
              cost['created_at'] as String? ??
              '',
          'amount_sdg': amountSdg,
          'site': cost['site_name'] as String? ?? '',
          'category': cost['expense_category'] as String? ?? '',
          'confirmed': cost['fund_receipt_confirmed'] == true,
          'color': 0xFF00796B,
          'icon': Icons.receipt_outlined,
        });
      }
    }

    // Filter by selected period
    final now = DateTime.now();
    final filtered =
        entries.where((e) {
          if (_statementPeriod == 'all') return true;
          final dateStr = e['date'] as String? ?? '';
          if (dateStr.isEmpty) return true;
          try {
            final dt = DateTime.parse(dateStr).toLocal();
            if (_statementPeriod == 'this_month') {
              return dt.year == now.year && dt.month == now.month;
            } else if (_statementPeriod == 'last_month') {
              final lm = DateTime(now.year, now.month - 1);
              return dt.year == lm.year && dt.month == lm.month;
            }
          } catch (_) {}
          return true;
        }).toList()..sort((a, b) {
          final da =
              DateTime.tryParse(a['date'] as String? ?? '') ?? DateTime(2000);
          final db =
              DateTime.tryParse(b['date'] as String? ?? '') ?? DateTime(2000);
          return db.compareTo(da);
        });

    final total = filtered.fold<double>(
      0,
      (s, e) => s + ((e['amount_sdg'] as num?)?.toDouble() ?? 0),
    );
    final confirmedTotal = filtered
        .where((e) => e['confirmed'] == true)
        .fold<double>(
          0,
          (s, e) => s + ((e['amount_sdg'] as num?)?.toDouble() ?? 0),
        );
    final pendingCount = filtered.where((e) => e['confirmed'] != true).length;

    final ar = widget.isArabic;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          ar ? 'كشف الأموال المستلمة' : 'Funds Received Statement',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 12),

        // Period chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildPeriodChip('this_month', ar ? 'هذا الشهر' : 'This Month'),
              const SizedBox(width: 8),
              _buildPeriodChip(
                'last_month',
                ar ? 'الشهر الماضي' : 'Last Month',
              ),
              const SizedBox(width: 8),
              _buildPeriodChip('all', ar ? 'الكل' : 'All Time'),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Summary card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Colors.indigo.shade700, Colors.indigo.shade500],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      ar ? 'إجمالي مستلم' : 'Total Received',
                      style: GoogleFonts.poppins(
                        color: Colors.white60,
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${total.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      '${filtered.length} ${ar ? 'معاملة' : 'transaction${filtered.length != 1 ? 's' : ''}'}',
                      style: GoogleFonts.poppins(
                        color: Colors.white60,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    ar ? 'مؤكد' : 'Confirmed',
                    style: GoogleFonts.poppins(
                      color: Colors.white60,
                      fontSize: 11,
                    ),
                  ),
                  Text(
                    '${confirmedTotal.toStringAsFixed(0)} SDG',
                    style: GoogleFonts.poppins(
                      color: Colors.greenAccent,
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (pendingCount > 0) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade400,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        ar
                            ? '$pendingCount غير مؤكد'
                            : '$pendingCount unconfirmed',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        if (filtered.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.summarize_outlined,
                    size: 48,
                    color: AppColors.textLight,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    ar
                        ? 'لا توجد أموال مستلمة في هذه الفترة'
                        : 'No funds received in this period',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                      color: AppColors.textLight,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          ...filtered.map((e) => _buildStatementEntry(e)),
      ],
    );
  }

  Widget _buildPeriodChip(String period, String label) {
    final isActive = _statementPeriod == period;
    return GestureDetector(
      onTap: () => setState(() => _statementPeriod = period),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? AppColors.primaryOrange : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isActive ? AppColors.primaryOrange : Colors.grey.shade300,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
            color: isActive ? Colors.white : Colors.grey.shade700,
          ),
        ),
      ),
    );
  }

  Widget _buildStatementEntry(Map<String, dynamic> entry) {
    final amountSdg = (entry['amount_sdg'] as num?)?.toDouble() ?? 0;
    final dateStr = entry['date'] as String? ?? '';
    final confirmed = entry['confirmed'] == true;
    final color = Color(entry['color'] as int? ?? 0xFF607D8B);
    final iconData = entry['icon'] as IconData? ?? Icons.payments_outlined;
    final site = entry['site'] as String? ?? '';
    final ar = widget.isArabic;

    String formattedDate = '';
    try {
      if (dateStr.isNotEmpty) {
        final dt = DateTime.parse(dateStr).toLocal();
        formattedDate =
            '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
      }
    } catch (_) {}

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Left colour accent bar
          Container(
            width: 4,
            height: 70,
            decoration: BoxDecoration(
              color: color,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                bottomLeft: Radius.circular(12),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Type icon
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(iconData, size: 18, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ar
                        ? (entry['label_ar'] as String? ?? '')
                        : (entry['label_en'] as String? ?? ''),
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                  // Show description if available (from transaction detail)
                  if ((entry['description'] as String? ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        entry['description'] as String? ?? '',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.grey.shade700,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  if (site.isNotEmpty)
                    Text(
                      site,
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.grey.shade600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  Text(
                    formattedDate,
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Amount + confirmation badge
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${(entry['is_deduction'] == true ? '−' : '+')}${amountSdg.toStringAsFixed(0)} SDG',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: color,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      confirmed
                          ? Icons.verified_outlined
                          : Icons.pending_outlined,
                      size: 12,
                      color: confirmed
                          ? Colors.green.shade600
                          : Colors.orange.shade600,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      confirmed
                          ? (ar ? 'مؤكد' : 'Confirmed')
                          : (ar ? 'معلق' : 'Pending'),
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: confirmed
                            ? Colors.green.shade600
                            : Colors.orange.shade600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConfirmationsTab() {
    final ar = widget.isArabic;
    final totalCount =
        _pendingReceiptConfirmations.length +
        _pendingAdvanceConfirmations.length;

    if (totalCount == 0) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.done_all_outlined, size: 56, color: Colors.green),
              const SizedBox(height: 16),
              Text(
                ar ? 'جميع التأكيدات اكتملت' : 'All confirmations completed!',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                ar ? 'لا توجد عناصر معلقة' : 'No pending items',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: AppColors.textLight,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Summary Box
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primaryBlue,
                  AppColors.primaryBlue.withValues(alpha: 0.8),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ar
                      ? 'ملخص التأكيدات المعلقة'
                      : 'Pending Confirmations Summary',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          ar ? 'السلف المعلقة:' : 'Pending Advances:',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                        Text(
                          _pendingAdvanceConfirmations.length.toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          ar
                              ? 'طلبات الصرف المعلقة:'
                              : 'Pending Cost Submissions:',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                        Text(
                          _pendingReceiptConfirmations.length.toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Advances Confirmations Section
          if (_pendingAdvanceConfirmations.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                ar
                    ? 'السلف المعتمدة (${_pendingAdvanceConfirmations.length})'
                    : 'Approved Advances (${_pendingAdvanceConfirmations.length})',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: Colors.teal.shade700,
                ),
              ),
            ),
            ..._pendingAdvanceConfirmations.map((advance) {
              final status = (advance['status'] as String? ?? '').toLowerCase();
              final meta =
                  (advance['metadata'] as Map?)?.cast<String, dynamic>() ?? {};

              // Try multiple field names for amount
              double amount = 0.0;
              final disbursed =
                  (advance['disbursed_amount'] as num?)?.toDouble() ?? 0.0;
              final approved =
                  (advance['approved_amount'] as num?)?.toDouble() ?? 0.0;
              final requested =
                  (advance['requested_amount'] as num?)?.toDouble() ?? 0.0;

              if (disbursed > 0) {
                amount = disbursed;
              } else if (approved > 0) {
                amount = approved;
              } else if (requested > 0) {
                amount = requested;
              }

              final advanceType =
                  (advance['advance_type'] as String? ?? 'Transportation')
                      .replaceAll('_', ' ');
              final createdAt = advance['created_at'] as String?;

              String formattedDate = '';
              if (createdAt != null && createdAt.isNotEmpty) {
                try {
                  final dt = DateTime.parse(createdAt).toLocal();
                  formattedDate =
                      '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
                } catch (_) {}
              }

              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.teal.shade50,
                  border: Border.all(color: Colors.teal.shade200),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header row with ID and Amount
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                ar
                                    ? 'سلفة #${(advance["id"] as String?)?.substring(0, 8) ?? "N/A"}'
                                    : 'Advance #${(advance["id"] as String?)?.substring(0, 8) ?? "N/A"}',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          amount > 0
                              ? _formatCurrency(amount)
                              : ar
                              ? 'غير محدد'
                              : 'N/A',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                            color: Colors.teal.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // Type and Date row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            ar ? 'النوع: $advanceType' : 'Type: $advanceType',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.grey.shade700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (formattedDate.isNotEmpty)
                          Text(
                            formattedDate,
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // Status and breakdown
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                ar ? 'الحالة:' : 'Status:',
                                style: GoogleFonts.poppins(
                                  fontSize: 10,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.teal.shade100,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  ar
                                      ? status.replaceAll('_', ' ')
                                      : status
                                            .replaceAll('_', ' ')
                                            .split(' ')
                                            .map(
                                              (w) =>
                                                  w[0].toUpperCase() +
                                                  w.substring(1),
                                            )
                                            .join(' '),
                                  style: GoogleFonts.poppins(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.teal.shade700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              ar ? 'التفاصيل:' : 'Breakdown:',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              ar
                                  ? 'مطلوب: ${_formatCurrency(requested)}'
                                  : 'Requested: ${_formatCurrency(requested)}',
                              style: GoogleFonts.poppins(
                                fontSize: 9,
                                color: Colors.grey.shade700,
                              ),
                            ),
                            if (approved > 0)
                              Text(
                                ar
                                    ? 'موافق: ${_formatCurrency(approved)}'
                                    : 'Approved: ${_formatCurrency(approved)}',
                                style: GoogleFonts.poppins(
                                  fontSize: 9,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
          ],

          // Cost Submissions Section
          if (_pendingReceiptConfirmations.isNotEmpty) ...[
            if (_pendingAdvanceConfirmations.isNotEmpty)
              const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                ar
                    ? 'طلبات الصرف (${_pendingReceiptConfirmations.length})'
                    : 'Cost Submissions (${_pendingReceiptConfirmations.length})',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: Colors.red.shade700,
                ),
              ),
            ),
            ..._pendingReceiptConfirmations.map((cost) {
              final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
              final amountSdg = amountCents / 100.0;
              final category = cost['expense_category'] as String? ?? 'Cost';
              final status = (cost['status'] as String? ?? '').toLowerCase();
              final createdAt = cost['created_at'] as String?;
              final costId = (cost['id'] as String? ?? '').substring(0, 8);

              String formattedDate = '';
              if (createdAt != null && createdAt.isNotEmpty) {
                try {
                  final dt = DateTime.parse(createdAt).toLocal();
                  formattedDate =
                      '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
                } catch (_) {}
              }

              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  border: Border.all(color: Colors.red.shade200),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header with ID and Amount
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                category,
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          _formatCurrency(amountSdg),
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                            color: Colors.red.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // ID and Date
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          ar ? 'رقم: #$costId' : 'ID: #$costId',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        if (formattedDate.isNotEmpty)
                          Text(
                            formattedDate,
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // Status
                    Row(
                      children: [
                        Text(
                          ar ? 'الحالة: ' : 'Status: ',
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.red.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            ar
                                ? status.replaceAll('_', ' ')
                                : status
                                      .replaceAll('_', ' ')
                                      .split(' ')
                                      .map(
                                        (w) =>
                                            w[0].toUpperCase() + w.substring(1),
                                      )
                                      .join(' '),
                            style: GoogleFonts.poppins(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Colors.red.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
          ],

          // Action Buttons
          const SizedBox(height: 20),
          if (_pendingAdvanceConfirmations.isNotEmpty)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () async {
                  await _confirmAllPendingAdvances();
                },
                icon: const Icon(Icons.check_circle),
                label: Text(
                  ar ? 'تأكيد جميع السلف' : 'Confirm All Advances',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.teal.shade600,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          if (_pendingReceiptConfirmations.isNotEmpty) ...[
            if (_pendingAdvanceConfirmations.isNotEmpty)
              const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () async {
                  await _confirmAllPendingReceipts();
                },
                icon: const Icon(Icons.check_circle),
                label: Text(
                  ar
                      ? 'تأكيد جميع طلبات الصرف'
                      : 'Confirm All Cost Submissions',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red.shade600,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPaymentReceiptCard({
    required String proofUrl,
    String? proofNotes,
    required bool isAmber,
  }) {
    final isImage =
        proofUrl.toLowerCase().contains('.jpg') ||
        proofUrl.toLowerCase().contains('.jpeg') ||
        proofUrl.toLowerCase().contains('.png') ||
        proofUrl.toLowerCase().contains('.gif') ||
        proofUrl.toLowerCase().contains('.webp');
    final color = isAmber ? Colors.amber : Colors.purple;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.receipt_long, color: color.shade700, size: 14),
              const SizedBox(width: 6),
              Text(
                widget.isArabic ? 'إيصال الدفع' : 'Payment Receipt',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color.shade700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (isImage)
            GestureDetector(
              onTap: () async {
                final uri = Uri.parse(proofUrl);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: CachedNetworkImage(
                  imageUrl: proofUrl,
                  height: 140,
                  width: double.infinity,
                  fit: BoxFit.contain,
                  placeholder: (_, _) => Container(
                    height: 140,
                    color: color.shade100,
                    child: Center(
                      child: CircularProgressIndicator(
                        color: color.shade700,
                        strokeWidth: 2,
                      ),
                    ),
                  ),
                  errorWidget: (_, _, _) => Container(
                    height: 60,
                    color: color.shade100,
                    child: Center(
                      child: Icon(
                        Icons.broken_image_outlined,
                        color: color.shade400,
                      ),
                    ),
                  ),
                ),
              ),
            )
          else
            GestureDetector(
              onTap: () async {
                final uri = Uri.parse(proofUrl);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              child: Row(
                children: [
                  Icon(Icons.picture_as_pdf, color: color.shade700, size: 18),
                  const SizedBox(width: 6),
                  Text(
                    widget.isArabic
                        ? 'اضغط لعرض الإيصال (PDF)'
                        : 'Tap to view receipt (PDF)',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: color.shade700,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ],
              ),
            ),
          if (proofNotes != null && proofNotes.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              '\u201c$proofNotes\u201d',
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: color.shade600,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAdvanceItem(Map<String, dynamic> advance) {
    final status = (advance['status'] as String? ?? 'pending').toLowerCase();
    final requestedAmount =
        (advance['requested_amount'] as num?)?.toDouble() ?? 0.0;
    final approvedAmount =
        (advance['approved_amount'] as num?)?.toDouble() ?? requestedAmount;
    final paidAmount =
        (advance['total_paid_amount'] as num?)?.toDouble() ?? 0.0;
    final siteName = advance['site_name'] as String? ?? 'Unknown Site';
    final projectName = advance['project_name'] as String? ?? 'WFP TPM';
    final stateName = advance['state_name'] as String? ?? '';
    final createdAt = advance['created_at'] != null
        ? DateTime.parse(advance['created_at'] as String)
        : DateTime.now();
    final meta = (advance['metadata'] as Map?)?.cast<String, dynamic>() ?? {};
    final receiptConfirmed = meta['receipt_confirmation']?['confirmed'] == true;
    final advanceReconciled = meta['advance_reconciled_at'] != null;
    final receiptDecline =
        (meta['receipt_decline'] as Map?)?.cast<String, dynamic>() ?? {};
    final isDeclined = receiptDecline['declined'] == true;
    final declinedAt = receiptDecline['declinedAt'] as String?;
    final resendStatus = receiptDecline['resendStatus'] as String? ?? 'pending';

    // Statuses that mean the advance has been disbursed
    final isDisbursed =
        status == 'partially_paid' ||
        status == 'fully_paid' ||
        status == 'paid';

    Color statusColor;
    IconData statusIcon;
    String statusLabel;
    switch (status) {
      case 'approved':
        statusColor = Colors.blue;
        statusIcon = Icons.thumb_up;
        statusLabel = widget.isArabic ? 'معتمد' : 'Approved';
        break;
      case 'partially_paid':
        statusColor = Colors.orange;
        statusIcon = Icons.payment;
        statusLabel = widget.isArabic ? 'مدفوع جزئياً' : 'Partly Paid';
        break;
      case 'fully_paid':
      case 'paid':
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        statusLabel = widget.isArabic ? 'مدفوع' : 'Paid';
        break;
      case 'rejected':
      case 'cancelled':
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        statusLabel = widget.isArabic ? 'مرفوض' : 'Rejected';
        break;
      default:
        statusColor = Colors.orange;
        statusIcon = Icons.hourglass_empty;
        statusLabel = widget.isArabic ? 'قيد الانتظار' : 'Pending';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: statusColor.withValues(alpha: 0.2)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row: site name + status badge
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.directions_car,
                  color: AppColors.primaryBlue,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        siteName,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      if (stateName.isNotEmpty)
                        Text(
                          stateName,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: AppColors.textLight,
                          ),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: statusColor.withValues(alpha: 0.35),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusIcon, size: 11, color: statusColor),
                      const SizedBox(width: 3),
                      Text(
                        statusLabel,
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: statusColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 14),
            // Amount rows
            _advanceRow(
              widget.isArabic ? 'المبلغ المطلوب' : 'Requested',
              '${_formatCurrency(requestedAmount)} SDG',
              AppColors.textDark,
            ),
            if (approvedAmount != requestedAmount)
              _advanceRow(
                widget.isArabic ? 'المبلغ المعتمد' : 'Approved',
                '${_formatCurrency(approvedAmount)} SDG',
                Colors.blue,
              ),
            if (isDisbursed)
              _advanceRow(
                widget.isArabic ? 'المدفوع' : 'Disbursed',
                '${_formatCurrency(paidAmount)} SDG',
                Colors.orange,
              ),
            _advanceRow(
              widget.isArabic ? 'المشروع' : 'Project',
              projectName,
              AppColors.textLight,
            ),
            _advanceRow(
              widget.isArabic ? 'التاريخ' : 'Date',
              DateFormat('dd MMM yyyy').format(createdAt.toLocal()),
              AppColors.textLight,
            ),
            // Reconciliation info
            if (isDisbursed) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: Colors.blue.shade600,
                      size: 14,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        widget.isArabic
                            ? 'تُخصم هذه الترحيل و المواصلاتة من رسوم الزيارة الميدانية عند اكتمالها'
                            : 'This advance is deducted from your site visit fee at completion',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.blue.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            // Reconciled badge
            if (advanceReconciled) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.sync, color: Colors.teal.shade600, size: 14),
                  const SizedBox(width: 4),
                  Text(
                    widget.isArabic
                        ? 'تمت التسوية'
                        : 'Reconciled with site visit',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      color: Colors.teal.shade700,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
            // Not Yet Received Indicator
            if (isDeclined) ...[
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade300),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: Colors.red.shade700,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            widget.isArabic
                                ? 'تم تسجيل "لم يتم الاستلام"'
                                : 'Marked as Not Yet Received',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.red.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (declinedAt != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        widget.isArabic
                            ? 'التاريخ: ${DateFormat('dd MMM yyyy - HH:mm').format(DateTime.parse(declinedAt))}'
                            : 'Date: ${DateFormat('dd MMM yyyy - HH:mm').format(DateTime.parse(declinedAt))}',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: Colors.red.shade600,
                        ),
                      ),
                    ],
                    if (resendStatus.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            resendStatus == 'sent'
                                ? Icons.check_circle
                                : Icons.hourglass_bottom,
                            color: resendStatus == 'sent'
                                ? Colors.green.shade600
                                : Colors.orange.shade600,
                            size: 14,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              widget.isArabic
                                  ? 'حالة إعادة الإرسال: ${resendStatus.replaceAll('_', ' ')}'
                                  : 'Resend Status: ${resendStatus.replaceAll('_', ' ').split(' ').map((w) => w[0].toUpperCase() + w.substring(1)).join(' ')}',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: Colors.red.shade700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      widget.isArabic
                          ? 'تم إخطار المالية والإدارة. ستتمكن من تأكيد الاستلام عند وصول المبلغ المعاد إرساله.'
                          : 'Finance and administration have been notified. You can acknowledge receipt once the resent amount arrives.',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.red.shade600,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            // Confirm receipt banner + button
            if (isDisbursed && !receiptConfirmed) ...[
              // Show payment receipt if attached by finance
              if ((advance['payment_proof_url'] as String?) != null &&
                  (advance['payment_proof_url'] as String).isNotEmpty) ...[
                const SizedBox(height: 8),
                _buildPaymentReceiptCard(
                  proofUrl: advance['payment_proof_url'] as String,
                  proofNotes: advance['payment_proof_notes'] as String?,
                  isAmber: true,
                ),
              ],
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.warning_amber,
                      color: Colors.amber.shade700,
                      size: 15,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        widget.isArabic
                            ? 'لم يتم تأكيد الاستلام بعد'
                            : 'Receipt not yet acknowledged',
                        style: GoogleFonts.poppins(
                          fontSize: 11.5,
                          color: Colors.amber.shade800,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _confirmAdvanceReceipt(advance),
                  icon: const Icon(Icons.verified_user, size: 16),
                  label: Text(
                    widget.isArabic
                        ? 'تأكيد استلام الترحيل و المواصلاتة'
                        : 'Acknowledge Fund Receipt',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green.shade600,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ],
            // Receipt confirmed — full details
            if (receiptConfirmed) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.verified,
                          color: Colors.green.shade700,
                          size: 15,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          widget.isArabic
                              ? 'تم تأكيد استلام الأموال ✓'
                              : 'Fund receipt acknowledged ✓',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.green.shade700,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    if (meta['receipt_confirmation']?['confirmedAt'] !=
                        null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(
                            Icons.access_time,
                            size: 12,
                            color: Colors.green.shade600,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.isArabic ? 'وقت التأكيد' : 'Confirmed at'}: ${DateFormat('dd MMM yyyy, HH:mm').format(DateTime.parse(meta['receipt_confirmation']['confirmedAt'] as String).toLocal())}',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.green.shade800,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if ((meta['receipt_confirmation']?['notes'] as String?)
                            ?.isNotEmpty ==
                        true) ...[
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.note,
                            size: 12,
                            color: Colors.green.shade600,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              '${widget.isArabic ? 'الملاحظات' : 'Notes'}: ${meta['receipt_confirmation']['notes']}',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: Colors.green.shade800,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (meta['receipt_confirmation']?['gps'] != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            Icons.location_on,
                            size: 12,
                            color: Colors.green.shade600,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.isArabic ? 'الموقع' : 'GPS'}: ${(meta['receipt_confirmation']['gps']['latitude'] as num).toStringAsFixed(5)}, ${(meta['receipt_confirmation']['gps']['longitude'] as num).toStringAsFixed(5)}',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.green.shade800,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (meta['receipt_confirmation']?['signatureSource'] !=
                        null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            Icons.draw,
                            size: 12,
                            color: Colors.green.shade600,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.isArabic ? 'التوقيع' : 'Signature'}: ${meta['receipt_confirmation']['signatureSource'] == 'profile_saved' ? (widget.isArabic ? 'توقيع محفوظ' : 'Saved signature') : (widget.isArabic ? 'توقيع مرسوم' : 'Hand-drawn')}',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Colors.green.shade800,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _advanceRow(String label, String value, Color valueColor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: AppColors.textLight,
            ),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionItem(Map<String, dynamic> transaction) {
    final type = transaction['type'] as String? ?? '';
    final amount = ((transaction['amount'] as num?)?.toDouble() ?? 0.0).abs();
    final description = transaction['description'] as String? ?? '';
    final createdAt = transaction['created_at'] != null
        ? DateTime.parse(transaction['created_at'] as String)
        : DateTime.now();
    final isDebit = _isDebitType(type);
    final txColor = _getTransactionColor(type);
    final label = isDebit
        ? (widget.isArabic ? 'مدين' : 'DEBIT')
        : (widget.isArabic ? 'دائن' : 'CREDIT');
    final sign = isDebit ? '−' : '+';

    // Build a short label for the type when description is too long
    String typeLabel;
    switch (type) {
      case 'down_payment':
        typeLabel = widget.isArabic ? 'سلفة مواصلات' : 'Transport Advance';
        break;
      case 'site_visit_fee':
      case 'visit_completion':
        typeLabel = widget.isArabic ? 'رسوم زيارة' : 'Site Visit Fee';
        break;
      case 'earning':
        typeLabel = widget.isArabic ? 'أرباح' : 'Earnings';
        break;
      case 'withdrawal':
        typeLabel = widget.isArabic ? 'سحب' : 'Withdrawal';
        break;
      case 'advance_deduction':
        typeLabel = widget.isArabic ? 'خصم سلفة' : 'Advance Deduction';
        break;
      default:
        typeLabel = type.replaceAll('_', ' ').toUpperCase();
    }

    return GestureDetector(
      onTap: () => _showTransactionDetail(transaction),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: txColor.withValues(alpha: 0.2), width: 1),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon badge
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  color: txColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  _getTransactionIcon(type),
                  color: txColor,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              // Description + date + type
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      description.isNotEmpty ? description : typeLabel,
                      style: GoogleFonts.poppins(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textDark,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      DateFormat(
                        'dd MMM yyyy  HH:mm',
                      ).format(createdAt.toLocal()),
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: AppColors.textLight,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Amount + DEBIT/CREDIT badge
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$sign${_formatCurrency(amount)}',
                    style: GoogleFonts.poppins(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: txColor,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: txColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      label,
                      style: GoogleFonts.poppins(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: txColor,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  // "Tap for details" hint
                  Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        size: 10,
                        color: Colors.grey.shade400,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        'Details',
                        style: GoogleFonts.poppins(
                          fontSize: 9,
                          color: Colors.grey.shade400,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showTransactionDetail(Map<String, dynamic> tx) {
    final type = tx['type'] as String? ?? '';
    final amount = (tx['amount'] as num?)?.toDouble().abs() ?? 0.0;
    final description = tx['description'] as String? ?? '';
    final createdAt = tx['created_at'] != null
        ? DateTime.parse(tx['created_at'] as String).toLocal()
        : DateTime.now();
    final balanceBefore = (tx['balance_before'] as num?)?.toDouble();
    final balanceAfter = (tx['balance_after'] as num?)?.toDouble();
    final currency = tx['currency'] as String? ?? 'SDG';
    final referenceId = tx['reference_id'] as String?;
    final referenceType = tx['reference_type'] as String?;
    final txId = tx['id'] as String? ?? '';
    final status = tx['status'] as String?;
    final metadata = tx['metadata'];
    final isDebit = _isDebitType(type);
    final txColor = _getTransactionColor(type);
    final sign = isDebit ? '−' : '+';

    String typeLabel;
    switch (type) {
      case 'down_payment':
        typeLabel = 'Transport Advance / سلفة مواصلات';
        break;
      case 'site_visit_fee':
      case 'visit_completion':
        typeLabel = 'Site Visit Fee / رسوم زيارة';
        break;
      case 'earning':
        typeLabel = 'Earnings / أرباح';
        break;
      case 'withdrawal':
        typeLabel = 'Withdrawal / سحب';
        break;
      case 'advance_deduction':
        typeLabel = 'Advance Deduction / خصم سلفة';
        break;
      default:
        typeLabel = type.replaceAll('_', ' ');
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (ctx, scrollController) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.symmetric(vertical: 10),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ── Header ───────────────────────────────────────
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: txColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(
                              _getTransactionIcon(type),
                              color: txColor,
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  typeLabel,
                                  style: GoogleFonts.poppins(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                    color: AppColors.textDark,
                                  ),
                                ),
                                Text(
                                  DateFormat(
                                    'dd MMM yyyy, HH:mm',
                                  ).format(createdAt),
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: AppColors.textLight,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: txColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              isDebit ? 'DEBIT / مدين' : 'CREDIT / دائن',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: txColor,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // ── Amount hero ──────────────────────────────────
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          vertical: 20,
                          horizontal: 16,
                        ),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              txColor.withValues(alpha: 0.12),
                              txColor.withValues(alpha: 0.04),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: txColor.withValues(alpha: 0.25),
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(
                              'Amount / المبلغ',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: Colors.grey.shade500,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$sign${_formatCurrency(amount)} $currency',
                              style: GoogleFonts.poppins(
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                color: txColor,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 16),

                      // ── Description ──────────────────────────────────
                      if (description.isNotEmpty) ...[
                        _txDetailSection(
                          'Description / الوصف',
                          Icons.description_outlined,
                          child: Text(
                            description,
                            style: GoogleFonts.poppins(
                              fontSize: 13,
                              color: AppColors.textDark,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],

                      // ── Fee Breakdown (for earning transactions) ──────
                      if (type == 'earning' && metadata != null) ...[
                        Builder(
                          builder: (ctx) {
                            final feeBreakdown = metadata is Map
                                ? (metadata['fee_breakdown']
                                          as Map<String, dynamic>? ??
                                      {})
                                : <String, dynamic>{};
                            final enumeratorFee =
                                (feeBreakdown['enumerator_fee'] as num?)
                                    ?.toDouble() ??
                                0.0;
                            final transportFee =
                                (feeBreakdown['transport_fee'] as num?)
                                    ?.toDouble() ??
                                0.0;
                            final feeMultiplier =
                                (feeBreakdown['fee_multiplier'] as num?)
                                    ?.toInt() ??
                                1;
                            final isAdjusted =
                                feeBreakdown['is_adjusted'] as bool? ?? false;

                            if (enumeratorFee > 0 || transportFee > 0) {
                              return _txDetailSection(
                                'Fee Breakdown / تفاصيل الرسوم',
                                Icons.receipt_long_outlined,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _txDetailRow(
                                      'Enumerator Fee / رسوم العد',
                                      '${_formatCurrency(enumeratorFee)} $currency${isAdjusted ? ' × $feeMultiplier' : ''}',
                                    ),
                                    if (transportFee > 0) ...[
                                      const SizedBox(height: 8),
                                      _txDetailRow(
                                        'Transport Fee / رسوم النقل',
                                        '${_formatCurrency(transportFee)} $currency',
                                      ),
                                    ],
                                    if (isAdjusted) ...[
                                      const SizedBox(height: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 6,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.blue.shade50,
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                          border: Border.all(
                                            color: Colors.blue.shade200,
                                          ),
                                        ),
                                        child: Text(
                                          'Adjusted for addon activities (×$feeMultiplier) / معدل للأنشطة الإضافية',
                                          style: GoogleFonts.poppins(
                                            fontSize: 11,
                                            color: Colors.blue.shade700,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              );
                            }
                            return const SizedBox.shrink();
                          },
                        ),
                        const SizedBox(height: 12),
                      ],

                      // ── Balance before / after ───────────────────────
                      if (balanceBefore != null || balanceAfter != null)
                        _txDetailSection(
                          'Balance Impact / أثر الرصيد',
                          Icons.account_balance_wallet_outlined,
                          child: Row(
                            children: [
                              Expanded(
                                child: _txBalanceCell(
                                  'Before / قبل',
                                  balanceBefore != null
                                      ? '${_formatCurrency(balanceBefore)} $currency'
                                      : '—',
                                  Colors.grey.shade600,
                                ),
                              ),
                              Icon(
                                Icons.arrow_forward,
                                size: 16,
                                color: Colors.grey.shade400,
                              ),
                              Expanded(
                                child: _txBalanceCell(
                                  'After / بعد',
                                  balanceAfter != null
                                      ? '${_formatCurrency(balanceAfter)} $currency'
                                      : '—',
                                  txColor,
                                ),
                              ),
                            ],
                          ),
                        ),

                      const SizedBox(height: 12),

                      // ── Status ───────────────────────────────────────
                      if (status != null && status.isNotEmpty)
                        _txDetailSection(
                          'Status / الحالة',
                          Icons.info_outline,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: status == 'completed'
                                  ? Colors.green.shade50
                                  : status == 'pending'
                                  ? Colors.orange.shade50
                                  : Colors.red.shade50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: status == 'completed'
                                    ? Colors.green.shade200
                                    : status == 'pending'
                                    ? Colors.orange.shade200
                                    : Colors.red.shade200,
                              ),
                            ),
                            child: Text(
                              status.toUpperCase(),
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: status == 'completed'
                                    ? Colors.green.shade700
                                    : status == 'pending'
                                    ? Colors.orange.shade700
                                    : Colors.red.shade700,
                              ),
                            ),
                          ),
                        ),

                      if (status != null && status.isNotEmpty)
                        const SizedBox(height: 12),

                      // ── Reference ────────────────────────────────────
                      if (referenceId != null || referenceType != null)
                        _txDetailSection(
                          'Reference / المرجع',
                          Icons.link,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (referenceType != null)
                                _txDetailRow(
                                  'Type / النوع',
                                  referenceType.replaceAll('_', ' '),
                                ),
                              if (referenceId != null)
                                _txDetailRow(
                                  'ID',
                                  referenceId.length > 20
                                      ? '${referenceId.substring(0, 20)}…'
                                      : referenceId,
                                ),
                            ],
                          ),
                        ),

                      if (referenceId != null || referenceType != null)
                        const SizedBox(height: 12),

                      // ── Related site-visit financial activity ─────────
                      Builder(
                        builder: (ctx2) {
                          if (referenceId == null ||
                              (type != 'site_visit_fee' &&
                                  type != 'visit_completion' &&
                                  type != 'down_payment' &&
                                  type != 'advance_deduction')) {
                            return const SizedBox.shrink();
                          }
                          final related = _transactions
                              .where(
                                (t) =>
                                    t['id'] != tx['id'] &&
                                    t['reference_id'] == referenceId &&
                                    (t['type'] == 'site_visit_fee' ||
                                        t['type'] == 'visit_completion' ||
                                        t['type'] == 'earning'),
                              )
                              .toList();
                          if (related.isEmpty) return const SizedBox.shrink();

                          String relLabel(String t) {
                            if (t == 'down_payment') {
                              return 'Transport Advance / سلفة مواصلات';
                            }
                            if (t == 'advance_deduction') {
                              return 'Advance Deducted / خصم الترحيل و المواصلاتة';
                            }
                            return 'Site Visit Fee / رسوم زيارة';
                          }

                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _txDetailSection(
                                'Related Activity / النشاط المرتبط',
                                Icons.compare_arrows_rounded,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: related.map((r) {
                                    final rType = r['type'] as String? ?? '';
                                    final rAmt =
                                        (r['amount'] as num?)
                                            ?.toDouble()
                                            .abs() ??
                                        0.0;
                                    final rSign = _isDebitType(rType)
                                        ? '−'
                                        : '+';
                                    final rColor = _getTransactionColor(rType);
                                    return Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: Row(
                                        children: [
                                          Icon(
                                            _getTransactionIcon(rType),
                                            size: 16,
                                            color: rColor,
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              relLabel(rType),
                                              style: GoogleFonts.poppins(
                                                fontSize: 12,
                                                color: AppColors.textDark,
                                              ),
                                            ),
                                          ),
                                          Text(
                                            '$rSign${_formatCurrency(rAmt)} SDG',
                                            style: GoogleFonts.poppins(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w700,
                                              color: rColor,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                          );
                        },
                      ),

                      // ── Metadata extras ──────────────────────────────
                      if (metadata is Map && (metadata).isNotEmpty)
                        _txDetailSection(
                          'Additional Info / معلومات إضافية',
                          Icons.layers_outlined,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: (metadata).entries
                                .where(
                                  (e) =>
                                      e.value != null &&
                                      e.value.toString().isNotEmpty &&
                                      e.value is! Map &&
                                      e.value is! List,
                                )
                                .map(
                                  (e) => _txDetailRow(
                                    e.key.toString().replaceAll('_', ' '),
                                    e.value.toString(),
                                  ),
                                )
                                .toList(),
                          ),
                        ),

                      if (metadata is Map && (metadata).isNotEmpty)
                        const SizedBox(height: 12),

                      // ── Transaction ID ───────────────────────────────
                      _txDetailSection(
                        'Transaction ID',
                        Icons.fingerprint,
                        child: Text(
                          txId,
                          style: const TextStyle(
                            fontSize: 11,
                            color: Color(0xFF9E9E9E),
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),

                      const SizedBox(height: 24),

                      // ── Close button ─────────────────────────────────
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            side: BorderSide(color: Colors.grey.shade300),
                          ),
                          child: Text(
                            'Close / إغلاق',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Transaction detail helpers ─────────────────────────────────────────────
  Widget _txDetailSection(
    String title,
    IconData icon, {
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: Colors.grey.shade500),
              const SizedBox(width: 5),
              Text(
                title,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: Colors.grey.shade500,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _txDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: Colors.grey.shade500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _txBalanceCell(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          label,
          style: GoogleFonts.poppins(fontSize: 10, color: Colors.grey.shade500),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _buildWithdrawalItem(Map<String, dynamic> withdrawal) {
    final amount = (withdrawal['amount'] as num?)?.toDouble() ?? 0.0;
    final status = withdrawal['status'] as String;
    final reason = withdrawal['request_reason'] as String? ?? '';
    final createdAt = DateTime.parse(withdrawal['created_at'] as String);
    final isPending = status == 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.backgroundGray),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildStatusBadge(status),
              Text(
                _formatCurrency(amount),
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (reason.isNotEmpty) ...[
            Text(
              'Reason: $reason',
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: AppColors.textLight,
              ),
            ),
            const SizedBox(height: 8),
          ],
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                DateFormat('MMM dd, yyyy').format(createdAt),
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: AppColors.textLight,
                ),
              ),
              if (isPending)
                TextButton(
                  onPressed: () =>
                      _cancelWithdrawalRequest(withdrawal['id'] as String),
                  style: TextButton.styleFrom(foregroundColor: Colors.red),
                  child: const Text('Cancel'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  _SignaturePainter(this.strokes);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    for (final stroke in strokes) {
      if (stroke.length < 2) continue;
      final path = Path()..moveTo(stroke[0].dx, stroke[0].dy);
      for (int i = 1; i < stroke.length; i++) {
        path.lineTo(stroke[i].dx, stroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_SignaturePainter old) => true;
}
