import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';
import '../widgets/main_layout.dart';
import '../services/wallet_service.dart';
import '../services/offline/offline_db.dart';

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
        final approved = (a['approved_amount'] as num?)?.toDouble() ??
            (a['disbursed_amount'] as num?)?.toDouble() ??
            (a['requested_amount'] as num?)?.toDouble() ?? 0.0;
        final paid = (a['total_paid_amount'] as num?)?.toDouble() ?? 0.0;
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
  bool _costPaymentsLoading = false;

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

  @override
  void initState() {
    super.initState();
    const tabNames = ['overview', 'transactions', 'withdrawals', 'advances', 'cost_payments', 'statement'];
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

        // Cache wallet data for offline use
        await _cacheWalletData(user.id);

        _setupRealtimeSubscription();
        setState(() => _isLoading = false);
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

      _transactions = (data ?? []).map((t) => t).toList();

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
            0.0, (sum, t) => sum + (t['amount'] as num).toDouble());
      }

      // Calculate stats
      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);
      final startOfWeek = now.subtract(Duration(days: now.weekday - 1));

      // Earnings = site visit fees + any fund receipt credits (positive amounts only)
      bool _isEarningTx(Map<String, dynamic> t) {
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
            return date.isAfter(startOfMonth) && _isEarningTx(t);
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble().abs());

      _thisWeekEarnings = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfWeek) && _isEarningTx(t);
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

      _thisMonthAdvanceDeductions =
          (monthDisbursed - monthRepaid).clamp(0.0, double.infinity);

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

      _withdrawalRequests = (data ?? []).map((w) => w).toList();

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

      _paymentMethods = (data ?? []).map((p) => p).toList();
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

      _advances = List<Map<String, dynamic>>.from(data ?? []);
      debugPrint('[Wallet] Loaded ${_advances.length} advances for user $_userId');
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
      _costPayments = List<Map<String, dynamic>>.from(data ?? []);
      debugPrint('[Wallet] Loaded ${_costPayments.length} cost submissions for user $_userId');
      if (mounted) setState(() => _costPaymentsLoading = false);
    } catch (e) {
      debugPrint('[Wallet] Error loading cost submissions: $e');
      if (mounted) setState(() => _costPaymentsLoading = false);
    }
  }

  Future<void> _confirmCostPaymentReceipt(Map<String, dynamic> cost) async {
    final costId = cost['id'] as String?;
    if (costId == null) return;

    final amountCents = (cost['amount_cents'] as num?)?.toInt() ?? 0;
    final amountSdg = amountCents / 100.0;
    final category = cost['expense_category'] as String? ?? 'Cost Submission';
    final categoryLabel = {
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
    }[category] ?? category;

    final notesController = TextEditingController();
    if (!mounted) return;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
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
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  Text(
                    'تأكيد استلام دفعة التكاليف',
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
              const SizedBox(height: 10),
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
                    Text(categoryLabel,
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13)),
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
              const SizedBox(height: 12),
              TextField(
                controller: notesController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Notes (optional) / ملاحظات (اختياري)',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(widget.isArabic ? 'إلغاء' : 'Cancel',
                style: TextStyle(color: Colors.grey.shade600)),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.verified, size: 16),
            label: Text(widget.isArabic ? 'تأكيد الاستلام' : 'Confirm Receipt'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.teal.shade600,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final now = DateTime.now().toIso8601String();
      final notes = notesController.text.trim();
      await Supabase.instance.client
          .from('operational_cost_submissions')
          .update({
            'fund_receipt_confirmed': true,
            'fund_receipt_confirmed_at': now,
            if (notes.isNotEmpty) 'fund_receipt_notes': notes,
            'updated_at': now,
          })
          .eq('id', costId);

      await _loadCostPayments();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic
                ? 'تم تأكيد استلام الدفعة بنجاح ✓'
                : 'Cost payment receipt confirmed ✓'),
            backgroundColor: Colors.teal.shade600,
          ),
        );
      }
    } catch (e) {
      debugPrint('[Wallet] Error confirming cost payment receipt: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'فشل التأكيد' : 'Confirmation failed'),
            backgroundColor: Colors.red,
          ),
        );
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

  List<Map<String, dynamic>> _getFilteredTransactions() {
    if (_transactionFilter == 'all') return _transactions;
    return _transactions.where((t) {
      if (_transactionFilter == 'earning') {
        return t['type'] == 'earning' || t['type'] == 'site_visit_fee';
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

  @override
  Widget build(BuildContext context) {
    return MainLayout(
      currentIndex: 2, // Wallet is index 2
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: AppColors.backgroundGray,
        drawer: CustomDrawerMenu(
          currentUser: Supabase.instance.client.auth.currentUser,
          onClose: () => _scaffoldKey.currentState?.closeDrawer(),
        ),
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
                        ? const Center(child: CircularProgressIndicator())
                        : RefreshIndicator(
                            onRefresh: _initializeWallet,
                            child: SingleChildScrollView(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Balance Card
                                  Container(
                                    padding: const EdgeInsets.all(24),
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                        colors: [
                                          Color(0xFF3B82F6),
                                          Color(0xFF1D4ED8),
                                        ],
                                      ),
                                      borderRadius: BorderRadius.circular(20),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.blue.withValues(
                                            alpha: 0.3,
                                          ),
                                          blurRadius: 20,
                                          offset: const Offset(0, 10),
                                        ),
                                      ],
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.spaceBetween,
                                          children: [
                                            Text(
                                              widget.isArabic
                                                  ? 'الرصيد الحالي'
                                                  : 'Current Balance',
                                              style: GoogleFonts.poppins(
                                                fontSize: 14,
                                                color: Colors.white.withValues(
                                                  alpha: 0.9,
                                                ),
                                              ),
                                            ),
                                            Icon(
                                              Icons.account_balance_wallet,
                                              color: Colors.white.withValues(
                                                alpha: 0.9,
                                              ),
                                              size: 24,
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          _formatCurrency(_netBalance),
                                          style: GoogleFonts.poppins(
                                            fontSize: 36,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          widget.isArabic
                                              ? 'الرصيد المتاح للسحب'
                                              : 'Available for withdrawal',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                            color: Colors.white.withValues(
                                              alpha: 0.8,
                                            ),
                                          ),
                                        ),
                                        if (_netBalance > 0) ...[
                                          const SizedBox(height: 16),
                                          SizedBox(
                                            width: double.infinity,
                                            child: OutlinedButton.icon(
                                              onPressed: () => setState(
                                                () => _showWithdrawalDialog =
                                                    true,
                                              ),
                                              icon: const Icon(
                                                Icons.arrow_downward_rounded,
                                                color: Colors.white,
                                                size: 18,
                                              ),
                                              label: Text(
                                                widget.isArabic
                                                    ? 'طلب سحب'
                                                    : 'Request Withdrawal',
                                                style: GoogleFonts.poppins(
                                                  color: Colors.white,
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 14,
                                                ),
                                              ),
                                              style: OutlinedButton.styleFrom(
                                                side: const BorderSide(
                                                  color: Colors.white70,
                                                  width: 1.5,
                                                ),
                                                shape: RoundedRectangleBorder(
                                                  borderRadius:
                                                      BorderRadius.circular(12),
                                                ),
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      vertical: 12,
                                                    ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),

                                  const SizedBox(height: 24),

                                  // Stats Grid
                                  Row(
                                    children: [
                                      Expanded(
                                        child: _buildStatCard(
                                          'Total Earned',
                                          'إجمالي الأرباح',
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
                                          'المسحوب',
                                          _formatCurrency(_totalWithdrawn),
                                          Icons.check_circle,
                                          Colors.cyan,
                                        ),
                                      ),
                                    ],
                                  ),

                                  if (_totalAdvanceDeductions > 0) ...[
                                    const SizedBox(height: 12),
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
                                            alpha: 0.05,
                                          ),
                                          blurRadius: 10,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: Column(
                                      children: [
                                        // Tab Buttons
                                        Container(
                                          padding: const EdgeInsets.all(8),
                                          color: Colors.grey.shade50,
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
                                                  Icons.arrow_circle_down_outlined,
                                                ),
                                                const SizedBox(width: 6),
                                                _buildTabButton(
                                                  'advances',
                                                  'Advances',
                                                  'السلف',
                                                  Icons.directions_car_outlined,
                                                ),
                                                const SizedBox(width: 6),
                                                _buildTabButtonWithBadge(
                                                  'cost_payments',
                                                  'Costs',
                                                  'التكاليف',
                                                  Icons.receipt_outlined,
                                                  badge: _costPayments.where((c) => c['status'] == 'paid' && c['fund_receipt_confirmed'] != true).length,
                                                ),
                                                const SizedBox(width: 6),
                                                _buildTabButton(
                                                  'statement',
                                                  'Statement',
                                                  'الكشف',
                                                  Icons.summarize_outlined,
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
      ),
    );
  }

  Widget _buildWithdrawalDialog() {
    final isArabic = widget.isArabic;
    final amount = double.tryParse(_withdrawalAmountController.text) ?? 0.0;
    final isValidAmount = amount > 0 && amount <= _netBalance;
    final withdrawPct = _netBalance > 0 ? (amount / _netBalance).clamp(0.0, 1.0) : 0.0;

    void _setQuickAmount(double pct) {
      final val = (_netBalance * pct).floorToDouble();
      _withdrawalAmountController.text = val == val.floorToDouble()
          ? val.toStringAsFixed(0)
          : val.toStringAsFixed(2);
      setState(() {});
    }

    void _dismiss() => setState(() {
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
                    child: const Icon(Icons.account_balance_wallet_rounded,
                        color: Colors.white, size: 22),
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
                    onTap: _dismiss,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.close, color: Colors.white, size: 18),
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
                      isArabic ? 'إجمالي الأرباح' : 'Total Earned',
                      _formatCurrency(_totalEarned),
                      Colors.green,
                      Icons.trending_up,
                    ),
                  ),
                  Container(width: 1, height: 40, color: Colors.blue[100]),
                  Expanded(
                    child: _summaryTile(
                      isArabic ? 'السلف المدفوعة' : 'Advances Paid',
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
                      ...['25%', '50%', '75%', isArabic ? 'الكل' : 'Max'].asMap().entries.map((e) {
                        final pcts = [0.25, 0.50, 0.75, 1.0];
                        return Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: GestureDetector(
                            onTap: () => _setQuickAmount(pcts[e.key]),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: AppColors.primaryBlue.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: AppColors.primaryBlue.withValues(alpha: 0.3),
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
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: GoogleFonts.poppins(
                        fontSize: 18, fontWeight: FontWeight.w700),
                    decoration: InputDecoration(
                      labelText: isArabic ? 'المبلغ (SDG)' : 'Amount (SDG)',
                      prefixIcon: const Icon(Icons.attach_money_rounded,
                          color: AppColors.primaryBlue),
                      filled: true,
                      fillColor: const Color(0xFFF8FAFF),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide:
                            const BorderSide(color: AppColors.borderColor),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                            color: AppColors.primaryBlue, width: 2),
                      ),
                      errorText: amount > _netBalance && amount > 0
                          ? (isArabic ? 'رصيد غير كافٍ' : 'Insufficient balance')
                          : null,
                      suffix: amount > 0
                          ? Text(
                              '${(withdrawPct * 100).toStringAsFixed(0)}%',
                              style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: AppColors.primaryBlue,
                                  fontWeight: FontWeight.w700),
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
                              fontSize: 10, color: AppColors.textLight),
                        ),
                        Text(
                          _formatCurrency(_netBalance),
                          style: GoogleFonts.poppins(
                              fontSize: 10,
                              color: AppColors.textLight,
                              fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Payment method
                  if (_paymentMethods.isNotEmpty) ...[
                    DropdownButtonFormField<String>(
                      value: _selectedPaymentMethod.isEmpty
                          ? null
                          : _selectedPaymentMethod,
                      decoration: InputDecoration(
                        labelText: isArabic ? 'طريقة الدفع' : 'Payment Method',
                        prefixIcon: const Icon(Icons.payment_rounded,
                            color: AppColors.primaryBlue),
                        filled: true,
                        fillColor: const Color(0xFFF8FAFF),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14)),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                              color: AppColors.primaryBlue, width: 2),
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
                      labelText: isArabic ? 'سبب السحب' : 'Reason for Withdrawal',
                      hintText: isArabic
                          ? 'تكاليف النقل، الإقامة...'
                          : 'Transportation, accommodation, etc.',
                      prefixIcon: const Icon(Icons.edit_note_rounded,
                          color: AppColors.primaryBlue),
                      filled: true,
                      fillColor: const Color(0xFFF8FAFF),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14)),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                            color: AppColors.primaryBlue, width: 2),
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
                        color: AppColors.accentGreen.withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_rounded,
                          color: AppColors.accentGreen, size: 18),
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
                                  color: AppColors.textLight),
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
                      onPressed: _dismiss,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: BorderSide(color: Colors.grey[300]!),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14)),
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
                            borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      child: _isSubmittingWithdrawal
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.send_rounded,
                                    color: Colors.white, size: 18),
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
      padding: const EdgeInsets.all(16),
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
              fontSize: 18,
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
            child: Icon(Icons.warning_amber_rounded,
                color: Colors.deepOrange.shade700, size: 22),
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
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: isActive ? AppColors.primaryBlue : Colors.white,
          borderRadius: BorderRadius.circular(10),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: AppColors.primaryBlue.withValues(alpha: 0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
          border: isActive
              ? null
              : Border.all(color: Colors.grey.shade200, width: 1),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 18,
              color: isActive ? Colors.white : Colors.grey.shade500,
            ),
            const SizedBox(height: 3),
            Text(
              labelEn,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isActive ? Colors.white : Colors.grey.shade700,
              ),
            ),
            Text(
              labelAr,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isActive
                    ? Colors.white
                    : Colors.grey.shade600,
              ),
            ),
          ],
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
            top: -4,
            right: -4,
            child: Container(
              width: 18,
              height: 18,
              decoration: const BoxDecoration(
                color: Colors.teal,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  badge > 9 ? '9+' : badge.toString(),
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
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
      default:
        return const SizedBox();
    }
  }

  // ── Helper: extract a display site name from a wallet transaction ──────────
  String _siteNameFromTx(Map<String, dynamic> tx) {
    final meta = tx['metadata'];
    if (meta is Map) {
      final s = meta['site_name'] as String? ??
          meta['siteName'] as String? ??
          meta['site'] as String?;
      if (s != null && s.isNotEmpty) return s;
    }
    final desc = (tx['description'] as String? ?? '').trim();
    if (desc.isNotEmpty) return desc;
    final type = tx['type'] as String? ?? '';
    switch (type) {
      case 'site_visit_fee': return widget.isArabic ? 'رسوم زيارة' : 'Site Visit Fee';
      case 'down_payment': return widget.isArabic ? 'سلفة مواصلات' : 'Transport Advance';
      case 'advance_deduction': return widget.isArabic ? 'خصم سلفة' : 'Advance Deduction';
      default: return type.replaceAll('_', ' ');
    }
  }

  Widget _buildOverviewTab() {
    // Group recent transactions by reference_id (site visit), or show individually
    final siteTypes = {'site_visit_fee', 'advance_deduction', 'down_payment', 'earning'};
    final recent = _transactions.where((t) => siteTypes.contains(t['type'])).take(30).toList();

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
      if (type == 'site_visit_fee' || type == 'earning') {
        totalFee += amt;
      } else if (type == 'down_payment') {
        totalAdvance += amt;
      } else if (type == 'advance_deduction') {
        totalDeduction += amt;
      }
    }
    final net = totalFee - totalAdvance - totalDeduction;
    final siteName = _siteNameFromTx(txs.firstWhere(
      (t) => t['type'] == 'site_visit_fee' || t['type'] == 'earning',
      orElse: () => txs.first,
    ));
    final dateLabel = '${latest.day}/${latest.month}/${latest.year}';

    return GestureDetector(
      onTap: () => _showSiteGroupDetail(txs, siteName),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.teal.withValues(alpha: 0.25), width: 1),
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
                    child: const Icon(Icons.location_on, color: Colors.teal, size: 20),
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
                        style: GoogleFonts.poppins(fontSize: 10, color: AppColors.textLight),
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
                      style: GoogleFonts.poppins(fontSize: 11, color: Colors.green[700], fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 10),
                  ],
                  if (totalAdvance > 0) ...[
                    Icon(Icons.arrow_circle_up, size: 13, color: Colors.orange[600]),
                    const SizedBox(width: 3),
                    Text(
                      '−${_formatCurrency(totalAdvance)}',
                      style: GoogleFonts.poppins(fontSize: 11, color: Colors.orange[700], fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 10),
                  ],
                  if (totalDeduction > 0) ...[
                    Icon(Icons.remove_circle_outline, size: 13, color: Colors.red[400]),
                    const SizedBox(width: 3),
                    Text(
                      '−${_formatCurrency(totalDeduction)}',
                      style: GoogleFonts.poppins(fontSize: 11, color: Colors.red[600], fontWeight: FontWeight.w600),
                    ),
                  ],
                  const Spacer(),
                  Icon(Icons.chevron_right, size: 16, color: AppColors.textLight),
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
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.teal.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.location_on, color: Colors.teal, size: 18),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        siteName,
                        style: GoogleFonts.poppins(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                    ),
                    Text(
                      '${txs.length} ${widget.isArabic ? 'معاملة' : 'entries'}',
                      style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textLight),
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
      (sum, t) => sum + (t['amount'] as num).toDouble().abs(),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.sync, color: Colors.blue[700], size: 20),
            const SizedBox(width: 8),
            Text(
              widget.isArabic ? 'تسوية السلف' : 'Advance Reconciliation',
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
                      ? 'إجمالي خصومات السلف من رسوم الزيارة: ${_formatCurrency(totalDeducted)}'
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Filter
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
                child: Text(
                  widget.isArabic ? 'جميع المعاملات' : 'All Transactions',
                ),
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Filter
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.isArabic
              ? 'مقدم الترحيل والمواصلات'
              : 'My Transportation Advances',
          style: GoogleFonts.poppins(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 12),
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
              Icon(Icons.receipt_outlined, size: 48, color: AppColors.textLight),
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
    final pending = _costPayments.where((c) => c['status'] == 'paid' && c['fund_receipt_confirmed'] != true).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header + pending alert
        Text(
          widget.isArabic ? 'دفعات التكاليف المدفوعة' : 'My Cost Payments',
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
    final categoryLabel = {
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
    }[category] ?? category;
    final categoryLabelAr = {
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
    }[category] ?? category;

    final status = (cost['status'] as String? ?? 'pending').toLowerCase();
    final receiptConfirmed = cost['fund_receipt_confirmed'] == true;
    final confirmedAt = cost['fund_receipt_confirmed_at'] as String?;
    final paidAt = cost['paid_at'] as String?;
    final createdAt = cost['created_at'] as String?;
    final description = cost['description'] as String?;
    final costId = (cost['id'] as String? ?? '').substring(0, 8).toUpperCase();

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
      cardBorder = receiptConfirmed ? Colors.green.shade200 : Colors.purple.shade200;
    } else if (status == 'rejected') {
      cardBorder = Colors.red.shade200;
    } else if (status == 'approved' || status == 'tier1_approved') {
      cardBorder = Colors.green.shade200;
    } else {
      cardBorder = Colors.orange.shade200;
    }

    final displayDate = paidAt ?? createdAt;

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
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
                        DateFormat('dd MMM yyyy').format(DateTime.parse(displayDate).toLocal()),
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: Colors.grey.shade500,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),

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
                    Icon(Icons.verified, color: Colors.green.shade700, size: 15),
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
                              DateFormat('dd MMM yyyy, HH:mm').format(
                                DateTime.parse(confirmedAt).toLocal(),
                              ),
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
                    Icon(Icons.warning_amber, color: Colors.amber.shade700, size: 15),
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
                    widget.isArabic
                        ? 'تأكيد استلام الدفعة'
                        : 'Confirm Receipt',
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
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: statusBorder),
                ),
                child: Row(
                  children: [
                    Icon(statusIcon, color: statusText, size: 14),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        status == 'rejected'
                            ? (widget.isArabic ? 'تم رفض هذا التقديم' : 'This submission was rejected')
                            : status == 'approved'
                                ? (widget.isArabic ? 'معتمد — بانتظار الصرف من المالية' : 'Approved — awaiting finance disbursement')
                                : status == 'tier1_approved'
                                    ? (widget.isArabic ? 'موافقة م١ — بانتظار الاعتماد النهائي' : 'Tier 1 approved — awaiting final approval')
                                    : (widget.isArabic ? 'قيد المراجعة من الإدارة' : 'Under review by management'),
                        style: GoogleFonts.poppins(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: statusText,
                        ),
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
                        'تأكيد استلام السلفة',
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
                    'أؤكد أنني استلمت مبلغ السلفة كاملاً.',
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
                          '✓ تُسجَّل السلفة كمستلمة في النظام',
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
                                base64Decode(savedSignatureBase64!),
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
      if (signatureBase64 != null) 'signatureBase64': signatureBase64,
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

    // 1. Site visit fees (credits from wallet_transactions)
    for (final tx in _transactions) {
      final type = (tx['type'] as String? ?? '').toLowerCase();
      if (type == 'site_visit_fee' || type == 'fee' || type == 'credit') {
        final amount = (tx['amount'] as num?)?.toDouble() ?? 0;
        if (amount > 0) {
          entries.add({
            'entry_type': 'site_fee',
            'label_en': 'Site Visit Fee',
            'label_ar': 'رسوم الزيارة الميدانية',
            'date': tx['created_at'] as String? ?? '',
            'amount_sdg': amount,
            'site': _siteNameFromTx(tx),
            'confirmed': true,
            'color': 0xFF2E7D32,
            'icon': Icons.check_circle_outline,
          });
        }
      }
    }

    // 2. Transport advances that have been (partially or fully) paid
    // Skip rejected or cancelled advances — they don't represent real disbursements
    for (final advance in _advances) {
      final status = (advance['status'] as String? ?? '').toLowerCase();
      if (status == 'rejected' || status == 'cancelled') continue;
      final totalPaid = (advance['total_paid_amount'] as num?)?.toDouble() ??
          (advance['disbursed_amount'] as num?)?.toDouble() ??
          0.0;
      if (totalPaid > 0) {
        entries.add({
          'entry_type': 'advance',
          'label_en': 'Transport Advance',
          'label_ar': 'سلفة مواصلات',
          'date': advance['updated_at'] as String? ??
              advance['created_at'] as String? ?? '',
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
          'date': cost['paid_at'] as String? ??
              cost['updated_at'] as String? ??
              cost['created_at'] as String? ?? '',
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
    final filtered = entries.where((e) {
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
    }).toList()
      ..sort((a, b) {
        final da = DateTime.tryParse(a['date'] as String? ?? '') ?? DateTime(2000);
        final db = DateTime.tryParse(b['date'] as String? ?? '') ?? DateTime(2000);
        return db.compareTo(da);
      });

    final total = filtered.fold<double>(
        0, (s, e) => s + ((e['amount_sdg'] as num?)?.toDouble() ?? 0));
    final confirmedTotal = filtered
        .where((e) => e['confirmed'] == true)
        .fold<double>(0, (s, e) => s + ((e['amount_sdg'] as num?)?.toDouble() ?? 0));
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
              _buildPeriodChip('last_month', ar ? 'الشهر الماضي' : 'Last Month'),
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
                      style: GoogleFonts.poppins(color: Colors.white60, fontSize: 11),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${total.toStringAsFixed(0)} SDG',
                      style: GoogleFonts.poppins(
                          color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      '${filtered.length} ${ar ? 'معاملة' : 'transaction${filtered.length != 1 ? 's' : ''}'}',
                      style: GoogleFonts.poppins(color: Colors.white60, fontSize: 11),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    ar ? 'مؤكد' : 'Confirmed',
                    style: GoogleFonts.poppins(color: Colors.white60, fontSize: 11),
                  ),
                  Text(
                    '${confirmedTotal.toStringAsFixed(0)} SDG',
                    style: GoogleFonts.poppins(
                        color: Colors.greenAccent, fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  if (pendingCount > 0) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.orange.shade400,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        ar ? '$pendingCount غير مؤكد' : '$pendingCount unconfirmed',
                        style: GoogleFonts.poppins(
                            color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600),
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
                  Icon(Icons.summarize_outlined, size: 48, color: AppColors.textLight),
                  const SizedBox(height: 12),
                  Text(
                    ar
                        ? 'لا توجد أموال مستلمة في هذه الفترة'
                        : 'No funds received in this period',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                        color: AppColors.textLight, fontWeight: FontWeight.w500),
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
              offset: const Offset(0, 2)),
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
                        fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                  if (site.isNotEmpty)
                    Text(
                      site,
                      style: GoogleFonts.poppins(
                          fontSize: 11, color: Colors.grey.shade600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  Text(
                    formattedDate,
                    style: GoogleFonts.poppins(
                        fontSize: 11, color: Colors.grey.shade500),
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
                  '+${amountSdg.toStringAsFixed(0)} SDG',
                  style: GoogleFonts.poppins(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: color),
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
                            ? 'تُخصم هذه السلفة من رسوم الزيارة الميدانية عند اكتمالها'
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
            // Confirm receipt banner + button
            if (isDisbursed && !receiptConfirmed) ...[
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
                        ? 'تأكيد استلام السلفة'
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
                        Icon(Icons.verified, color: Colors.green.shade700, size: 15),
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
                    if (meta['receipt_confirmation']?['confirmedAt'] != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.access_time, size: 12, color: Colors.green.shade600),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.isArabic ? 'وقت التأكيد' : 'Confirmed at'}: ${DateFormat('dd MMM yyyy, HH:mm').format(DateTime.parse(meta['receipt_confirmation']['confirmedAt'] as String).toLocal())}',
                            style: GoogleFonts.poppins(fontSize: 11, color: Colors.green.shade800),
                          ),
                        ],
                      ),
                    ],
                    if ((meta['receipt_confirmation']?['notes'] as String?)?.isNotEmpty == true) ...[
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.note, size: 12, color: Colors.green.shade600),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              '${widget.isArabic ? 'الملاحظات' : 'Notes'}: ${meta['receipt_confirmation']['notes']}',
                              style: GoogleFonts.poppins(fontSize: 11, color: Colors.green.shade800),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (meta['receipt_confirmation']?['gps'] != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.location_on, size: 12, color: Colors.green.shade600),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.isArabic ? 'الموقع' : 'GPS'}: ${(meta['receipt_confirmation']['gps']['latitude'] as num).toStringAsFixed(5)}, ${(meta['receipt_confirmation']['gps']['longitude'] as num).toStringAsFixed(5)}',
                            style: GoogleFonts.poppins(fontSize: 11, color: Colors.green.shade800),
                          ),
                        ],
                      ),
                    ],
                    if (meta['receipt_confirmation']?['signatureSource'] != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.draw, size: 12, color: Colors.green.shade600),
                          const SizedBox(width: 4),
                          Text(
                            '${widget.isArabic ? 'التوقيع' : 'Signature'}: ${meta['receipt_confirmation']['signatureSource'] == 'profile_saved' ? (widget.isArabic ? 'توقيع محفوظ' : 'Saved signature') : (widget.isArabic ? 'توقيع مرسوم' : 'Hand-drawn')}',
                            style: GoogleFonts.poppins(fontSize: 11, color: Colors.green.shade800),
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
    final amount = (transaction['amount'] as num?)?.toDouble().abs() ?? 0.0;
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
                      Builder(builder: (ctx2) {
                        if (referenceId == null ||
                            (type != 'site_visit_fee' &&
                                type != 'down_payment' &&
                                type != 'advance_deduction')) {
                          return const SizedBox.shrink();
                        }
                        final related = _transactions
                            .where((t) =>
                                t['id'] != tx['id'] &&
                                t['reference_id'] == referenceId &&
                                (t['type'] == 'site_visit_fee' ||
                                    t['type'] == 'down_payment' ||
                                    t['type'] == 'advance_deduction'))
                            .toList();
                        if (related.isEmpty) return const SizedBox.shrink();

                        String _relLabel(String t) {
                          if (t == 'down_payment') {
                            return 'Transport Advance / سلفة مواصلات';
                          }
                          if (t == 'advance_deduction') {
                            return 'Advance Deducted / خصم السلفة';
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
                                children: related
                                    .map((r) {
                                      final rType =
                                          r['type'] as String? ?? '';
                                      final rAmt = (r['amount'] as num?)
                                              ?.toDouble()
                                              .abs() ??
                                          0.0;
                                      final rSign =
                                          _isDebitType(rType) ? '−' : '+';
                                      final rColor =
                                          _getTransactionColor(rType);
                                      return Padding(
                                        padding: const EdgeInsets.only(
                                            bottom: 6),
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
                                                _relLabel(rType),
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
                                    })
                                    .toList(),
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],
                        );
                      }),

                      // ── Metadata extras ──────────────────────────────
                      if (metadata is Map && (metadata).isNotEmpty)
                        _txDetailSection(
                          'Additional Info / معلومات إضافية',
                          Icons.layers_outlined,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: (metadata as Map).entries
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
    final amount = (withdrawal['amount'] as num).toDouble();
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
