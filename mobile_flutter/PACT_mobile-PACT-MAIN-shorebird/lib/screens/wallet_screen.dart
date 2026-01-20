import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';
import '../widgets/main_layout.dart';
import '../services/wallet_service.dart';
import '../services/offline/offline_db.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

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

  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _withdrawalRequests = [];

  String _activeTab = 'overview';
  String _transactionFilter = 'all';
  String _withdrawalFilter = 'all';

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
        await Future.wait([
          _loadWallet(),
          _loadTransactions(),
          _loadWithdrawalRequests(),
          _loadPaymentMethods(),
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
      final cached = offlineDb.getCachedItem(OfflineDb.walletCacheBox, 'wallet_data_$userId');
      return cached?.data as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('[Wallet] Error getting cached wallet data: $e');
      return null;
    }
  }
  
  void _applyCachedWalletData(Map<String, dynamic> data) {
    _currentBalance = (data['currentBalance'] as num?)?.toDouble() ?? 0.0;
    _totalEarned = (data['totalEarned'] as num?)?.toDouble() ?? 0.0;
    _totalWithdrawn = (data['totalWithdrawn'] as num?)?.toDouble() ?? 0.0;
    _pendingWithdrawals = (data['pendingWithdrawals'] as num?)?.toDouble() ?? 0.0;
    _thisMonthEarnings = (data['thisMonthEarnings'] as num?)?.toDouble() ?? 0.0;
    _thisWeekEarnings = (data['thisWeekEarnings'] as num?)?.toDouble() ?? 0.0;
    
    final txList = data['transactions'] as List?;
    if (txList != null) {
      _transactions = txList.map((t) => Map<String, dynamic>.from(t as Map)).toList();
    }
    
    final wrList = data['withdrawalRequests'] as List?;
    if (wrList != null) {
      _withdrawalRequests = wrList.map((w) => Map<String, dynamic>.from(w as Map)).toList();
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

      final data = await Supabase.instance.client
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', _userId!)
          .order('created_at', ascending: false)
          .limit(100);

      _transactions = (data ?? []).map((t) => t).toList();

      // Calculate stats
      final now = DateTime.now();
      final startOfMonth = DateTime(now.year, now.month, 1);
      final startOfWeek = now.subtract(Duration(days: now.weekday - 1));

      _thisMonthEarnings = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfMonth) &&
                (t['type'] == 'earning' || t['type'] == 'site_visit_fee');
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble());

      _thisWeekEarnings = _transactions
          .where((t) {
            final date = DateTime.parse(t['created_at'] as String);
            return date.isAfter(startOfWeek) &&
                (t['type'] == 'earning' || t['type'] == 'site_visit_fee');
          })
          .fold(0.0, (sum, t) => sum + (t['amount'] as num).toDouble());

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

  Future<void> _requestWithdrawal() async {
    final amount = double.tryParse(_withdrawalAmountController.text);
    if (amount == null || amount <= 0 || amount > _currentBalance) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Invalid withdrawal amount'),
          backgroundColor: Colors.red,
        ),
      );
      return;
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

  IconData _getTransactionIcon(String type) {
    switch (type) {
      case 'earning':
      case 'site_visit_fee':
        return Icons.arrow_upward;
      case 'withdrawal':
        return Icons.arrow_downward;
      case 'bonus':
        return Icons.trending_up;
      case 'penalty':
        return Icons.trending_down;
      default:
        return Icons.account_balance_wallet;
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
        return Colors.red;
      default:
        return AppColors.textDark;
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
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
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
                  ReusableAppBar(title: 'Wallet', scaffoldKey: _scaffoldKey),
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
                                          color: Colors.blue.withOpacity(0.3),
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
                                              'Current Balance',
                                              style: GoogleFonts.poppins(
                                                fontSize: 14,
                                                color: Colors.white.withOpacity(
                                                  0.9,
                                                ),
                                              ),
                                            ),
                                            Icon(
                                              Icons.account_balance_wallet,
                                              color: Colors.white.withOpacity(
                                                0.9,
                                              ),
                                              size: 24,
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          _formatCurrency(_currentBalance),
                                          style: GoogleFonts.poppins(
                                            fontSize: 36,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Available for withdrawal',
                                          style: GoogleFonts.poppins(
                                            fontSize: 12,
                                            color: Colors.white.withOpacity(
                                              0.8,
                                            ),
                                          ),
                                        ),
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
                                          _formatCurrency(_totalEarned),
                                          Icons.trending_up,
                                          Colors.green,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: _buildStatCard(
                                          'This Month',
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
                                          _formatCurrency(_pendingWithdrawals),
                                          Icons.pending,
                                          Colors.orange,
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: _buildStatCard(
                                          'Withdrawn',
                                          _formatCurrency(_totalWithdrawn),
                                          Icons.check_circle,
                                          Colors.cyan,
                                        ),
                                      ),
                                    ],
                                  ),

                                  const SizedBox(height: 24),

                                  // Tabs
                                  Container(
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(16),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withOpacity(0.05),
                                          blurRadius: 10,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: Column(
                                      children: [
                                        // Tab Buttons
                                        Row(
                                          children: [
                                            Expanded(
                                              child: _buildTabButton(
                                                'overview',
                                                'Overview',
                                              ),
                                            ),
                                            Expanded(
                                              child: _buildTabButton(
                                                'transactions',
                                                'Transactions',
                                              ),
                                            ),
                                            Expanded(
                                              child: _buildTabButton(
                                                'withdrawals',
                                                'Withdrawals',
                                              ),
                                            ),
                                          ],
                                        ),
                                        const Divider(height: 1),
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
            if (_showWithdrawalDialog) _buildWithdrawalDialog(),
          ],
        ),
        floatingActionButton: _currentBalance > 0
            ? FloatingActionButton.extended(
                onPressed: () => setState(() => _showWithdrawalDialog = true),
                backgroundColor: AppColors.primaryBlue,
                icon: const Icon(Icons.arrow_downward, color: Colors.white),
                label: Text(
                  'Request Withdrawal',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              )
            : null,
      ),
    );
  }

  Widget _buildWithdrawalDialog() {
    final amount = double.tryParse(_withdrawalAmountController.text) ?? 0.0;
    final isValidAmount = amount > 0 && amount <= _currentBalance;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.arrow_downward, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Request Withdrawal',
                    style: GoogleFonts.poppins(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() {
                    _showWithdrawalDialog = false;
                    _withdrawalAmountController.clear();
                    _withdrawalReasonController.clear();
                    _selectedPaymentMethod = '';
                  }),
                ),
              ],
            ),
            const SizedBox(height: 24),
            // Amount
            TextField(
              controller: _withdrawalAmountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: 'Amount (SDG)',
                prefixIcon: const Icon(Icons.attach_money),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                helperText: 'Available: ${_formatCurrency(_currentBalance)}',
                errorText: amount > _currentBalance
                    ? 'Insufficient funds'
                    : null,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),
            // Payment Method
            if (_paymentMethods.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                initialValue: _selectedPaymentMethod.isEmpty
                    ? null
                    : _selectedPaymentMethod,
                decoration: InputDecoration(
                  labelText: 'Payment Method',
                  prefixIcon: const Icon(Icons.payment),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                items: [
                  ..._paymentMethods.map(
                    (method) => DropdownMenuItem(
                      value: method['name'] as String,
                      child: Text(
                        '${method['name']} (${(method['type'] as String).replaceAll('_', ' ')})',
                      ),
                    ),
                  ),
                  const DropdownMenuItem(
                    value: 'other',
                    child: Text('Other (specify in reason)'),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _selectedPaymentMethod = value ?? ''),
              ),
              const SizedBox(height: 16),
            ],
            // Reason
            TextField(
              controller: _withdrawalReasonController,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Reason',
                hintText: 'Transportation costs, accommodation, etc.',
                prefixIcon: const Icon(Icons.note),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => setState(() {
                    _showWithdrawalDialog = false;
                    _withdrawalAmountController.clear();
                    _withdrawalReasonController.clear();
                    _selectedPaymentMethod = '';
                  }),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: isValidAmount && !_isSubmittingWithdrawal
                      ? _requestWithdrawal
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 12,
                    ),
                  ),
                  child: _isSubmittingWithdrawal
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                          ),
                        )
                      : const Text('Submit Request'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(
    String title,
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
            color: color.withOpacity(0.1),
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
              Text(
                title,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: AppColors.textLight,
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

  Widget _buildTabButton(String tab, String label) {
    final isActive = _activeTab == tab;
    return InkWell(
      onTap: () => setState(() => _activeTab = tab),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isActive ? AppColors.primaryBlue : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
            color: isActive ? AppColors.primaryBlue : AppColors.textLight,
          ),
        ),
      ),
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
      default:
        return const SizedBox();
    }
  }

  Widget _buildOverviewTab() {
    final recentTransactions = _transactions.take(5).toList();
    final earningsTransactions = _transactions
        .where((t) => t['type'] == 'earning' || t['type'] == 'site_visit_fee')
        .take(10)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Recent Transactions',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        if (recentTransactions.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'No transactions yet',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ),
          )
        else
          ...recentTransactions.map(
            (transaction) => _buildTransactionItem(transaction),
          ),
        const SizedBox(height: 24),
        Text(
          'Recent Earnings',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        if (earningsTransactions.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'No earnings yet',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ),
          )
        else
          ...earningsTransactions.map(
            (transaction) => _buildTransactionItem(transaction),
          ),
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
            items: const [
              DropdownMenuItem(value: 'all', child: Text('All Transactions')),
              DropdownMenuItem(value: 'earning', child: Text('Earnings')),
              DropdownMenuItem(value: 'withdrawal', child: Text('Withdrawals')),
              DropdownMenuItem(value: 'bonus', child: Text('Bonuses')),
              DropdownMenuItem(value: 'penalty', child: Text('Penalties')),
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
                'No transactions found',
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
            items: const [
              DropdownMenuItem(value: 'all', child: Text('All Withdrawals')),
              DropdownMenuItem(value: 'pending', child: Text('Pending')),
              DropdownMenuItem(value: 'approved', child: Text('Approved')),
              DropdownMenuItem(value: 'rejected', child: Text('Rejected')),
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
                'No withdrawal requests found',
                style: GoogleFonts.poppins(color: AppColors.textLight),
              ),
            ),
          )
        else
          ...filtered.map((withdrawal) => _buildWithdrawalItem(withdrawal)),
      ],
    );
  }

  Widget _buildTransactionItem(Map<String, dynamic> transaction) {
    final type = transaction['type'] as String;
    final amount = (transaction['amount'] as num).toDouble();
    final description = transaction['description'] as String? ?? '';
    final createdAt = DateTime.parse(transaction['created_at'] as String);
    final isPositive = amount >= 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.backgroundGray),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: _getTransactionColor(type).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              _getTransactionIcon(type),
              color: _getTransactionColor(type),
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  description.isNotEmpty
                      ? description
                      : type.replaceAll('_', ' ').toUpperCase(),
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  DateFormat('MMM dd, yyyy HH:mm').format(createdAt),
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: AppColors.textLight,
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${isPositive ? '+' : ''}${_formatCurrency(amount.abs())}',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: isPositive ? Colors.green : Colors.red,
            ),
          ),
        ],
      ),
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
