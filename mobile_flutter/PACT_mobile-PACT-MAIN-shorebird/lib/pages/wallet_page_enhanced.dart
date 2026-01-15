/// Enhanced Wallet Page matching the React TSX implementation
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../config/wallet_constants.dart';
import '../models/wallet_models.dart';
import '../providers/wallet/wallet_notifier.dart';
import '../services/wallet_service.dart';
import '../utils/currency_utils.dart';
import '../utils/export_utils.dart';
import '../widgets/transaction_search.dart';
import '../widgets/payment_methods_card.dart';
import '../providers/down_payment_provider.dart';
import '../models/down_payment_request.dart';
import '../widgets/down_payment_request_dialog.dart';

class WalletPageEnhanced extends ConsumerStatefulWidget {
  const WalletPageEnhanced({super.key});

  @override
  ConsumerState<WalletPageEnhanced> createState() => _WalletPageEnhancedState();
}

class _WalletPageEnhancedState extends ConsumerState<WalletPageEnhanced>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _withdrawalAmountController = TextEditingController();
  final _withdrawalReasonController = TextEditingController();
  String? _selectedPaymentMethod;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _withdrawalAmountController.dispose();
    _withdrawalReasonController.dispose();
    super.dispose();
  }

  Future<void> _showWithdrawalDialog(double currentBalance) async {
    _withdrawalAmountController.clear();
    _withdrawalReasonController.clear();
    _selectedPaymentMethod = null;

    return showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request Withdrawal'),
        content: StatefulBuilder(
          builder: (context, setState) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Amount field
                TextField(
                  controller: _withdrawalAmountController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Amount ($DEFAULT_CURRENCY)',
                    hintText: 'Enter amount',
                    border: const OutlineInputBorder(),
                    helperText:
                        'Available balance: ${formatCurrency(currentBalance, DEFAULT_CURRENCY)}',
                    helperMaxLines: 2,
                  ),
                  onChanged: (value) => setState(() {}),
                ),
                const SizedBox(height: 16),

                // Reason field
                TextField(
                  controller: _withdrawalReasonController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: 'Reason',
                    hintText: 'Transportation costs, accommodation, etc.',
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),

                // Payment method field
                TextField(
                  onChanged: (value) =>
                      setState(() => _selectedPaymentMethod = value),
                  decoration: InputDecoration(
                    labelText: 'Payment Method (Optional)',
                    hintText: 'Bank transfer, Mobile money, etc.',
                    border: const OutlineInputBorder(),
                  ),
                ),

                // Validation message
                if (_withdrawalAmountController.text.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      _buildAmountValidationMessage(currentBalance),
                      style: TextStyle(
                        fontSize: 12,
                        color: _isValidWithdrawalAmount(currentBalance)
                            ? Colors.green
                            : Colors.red,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: _isValidWithdrawalAmount(currentBalance)
                ? () => _submitWithdrawalRequest(currentBalance)
                : null,
            child: const Text('Submit Request'),
          ),
        ],
      ),
    );
  }

  bool _isValidWithdrawalAmount(double currentBalance) {
    if (_withdrawalAmountController.text.isEmpty) return false;
    final amount = double.tryParse(_withdrawalAmountController.text);
    if (amount == null || amount <= 0 || amount > currentBalance) return false;
    return true;
  }

  String _buildAmountValidationMessage(double currentBalance) {
    if (_withdrawalAmountController.text.isEmpty) return '';
    final amount = double.tryParse(_withdrawalAmountController.text);
    if (amount == null) return 'Invalid amount';
    if (amount <= 0) return 'Amount must be greater than 0';
    if (amount > currentBalance) return 'Insufficient funds';
    return 'Valid amount';
  }

  void _submitWithdrawalRequest(double currentBalance) async {
    if (!_isValidWithdrawalAmount(currentBalance)) return;

    final amount = double.parse(_withdrawalAmountController.text);
    try {
      await ref
          .read(walletNotifierProvider.notifier)
          .createWithdrawalRequest(
            amount,
            _withdrawalReasonController.text,
            _selectedPaymentMethod ?? '',
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Withdrawal request submitted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final walletState = ref.watch(walletNotifierProvider);
    final filteredTransactions = ref.watch(filteredTransactionsProvider);
    final displayWithdrawals = ref.watch(displayWithdrawalsProvider);
    final pendingWithdrawals = ref.watch(pendingWithdrawalsProvider);
    final completedWithdrawals = ref.watch(completedWithdrawalsProvider);
    final rejectedWithdrawals = ref.watch(rejectedWithdrawalsProvider);
    final earningsByMonth = ref.watch(earningsByMonthProvider);
    final siteVisitEarnings = ref.watch(siteVisitEarningsProvider);
    final withdrawalSuccessRate = ref.watch(withdrawalSuccessRateProvider);

    return walletState.when(
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Wallet')),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (error, stack) => Scaffold(
        appBar: AppBar(title: const Text('Wallet')),
        body: Center(child: Text('Error: $error')),
      ),
      data: (state) {
        if (state.wallet == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Wallet')),
            body: const Center(child: Text('Wallet not found')),
          );
        }

        final currentBalance = state.wallet!.currentBalance;

        return Scaffold(
          appBar: AppBar(
            title: const Text('My Wallet'),
            elevation: 0,
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () =>
                    ref.read(walletNotifierProvider.notifier).refreshWallet(),
              ),
            ],
          ),
          body: SingleChildScrollView(
            child: Column(
              children: [
                // Hero Card
                _buildHeroCard(
                  state.wallet!,
                  currentBalance,
                  filteredTransactions,
                ),

                const SizedBox(height: 20),

                // Status Alerts
                if (pendingWithdrawals.isNotEmpty)
                  _buildPendingWithdrawalsAlert(pendingWithdrawals),

                const SizedBox(height: 20),

                // Stats Grid
                _buildStatsGrid(state),

                const SizedBox(height: 20),

                // Additional Metrics
                _buildAdditionalMetrics(
                  state,
                  withdrawalSuccessRate,
                  completedWithdrawals,
                  rejectedWithdrawals,
                ),

                const SizedBox(height: 20),

                // Transaction Search
                TransactionSearchWidget(
                  onSearch: (filters) {
                    ref.read(transactionSearchFiltersProvider.notifier).state =
                        filters;
                  },
                  onClear: () {
                    ref.read(transactionSearchFiltersProvider.notifier).state =
                        const TransactionSearchFilters();
                  },
                ),

                const SizedBox(height: 20),

                // Tabs
                _buildTabsSection(
                  state,
                  currentBalance,
                  filteredTransactions,
                  displayWithdrawals,
                  earningsByMonth,
                  siteVisitEarnings,
                  withdrawalSuccessRate,
                  pendingWithdrawals,
                  completedWithdrawals,
                  rejectedWithdrawals,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeroCard(
    Wallet wallet,
    double currentBalance,
    List<WalletTransaction> filteredTransactions,
  ) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1976D2), Color(0xFF42A5F5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1976D2).withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'My Wallet',
                    style: TextStyle(color: Colors.white70, fontSize: 16),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    formatCurrency(currentBalance, DEFAULT_CURRENCY),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Available for withdrawal',
                    style: TextStyle(color: Colors.white60, fontSize: 12),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.wallet, color: Colors.white, size: 32),
              ),
            ],
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _showWithdrawalDialog(currentBalance),
              icon: const Icon(Icons.money_off),
              label: const Text('REQUEST WITHDRAWAL'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPendingWithdrawalsAlert(List<WithdrawalRequest> pending) {
    final totalPending = pending.fold<double>(0, (sum, r) => sum + r.amount);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange[50],
        border: Border.all(color: Colors.orange),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.info, color: Colors.orange[700]),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'You have ${pending.length} pending withdrawal request${pending.length != 1 ? 's' : ''}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  'Total amount: ${formatCurrency(totalPending, DEFAULT_CURRENCY)}',
                  style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid(WalletState state) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        children: [
          _buildStatCard(
            'Current Balance',
            formatCurrency(state.wallet!.currentBalance, DEFAULT_CURRENCY),
            Icons.wallet,
            Colors.green,
          ),
          _buildStatCard(
            'Total Earned',
            formatCurrency(state.stats?.totalEarned ?? 0, DEFAULT_CURRENCY),
            Icons.trending_up,
            Colors.blue,
          ),
          _buildStatCard(
            'Pending Withdrawals',
            formatCurrency(
              state.stats?.pendingWithdrawals ?? 0,
              DEFAULT_CURRENCY,
            ),
            Icons.schedule,
            Colors.orange,
          ),
          _buildStatCard(
            'Total Withdrawn',
            formatCurrency(state.stats?.totalWithdrawn ?? 0, DEFAULT_CURRENCY),
            Icons.trending_down,
            Colors.purple,
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey,
                  ),
                ),
                Icon(icon, color: color, size: 20),
              ],
            ),
            const Spacer(),
            Text(
              value,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAdditionalMetrics(
    WalletState state,
    double withdrawalSuccessRate,
    List<WithdrawalRequest> completedWithdrawals,
    List<WithdrawalRequest> rejectedWithdrawals,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Withdrawal Success Rate',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${withdrawalSuccessRate.toStringAsFixed(0)}%',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                      Text(
                        '${completedWithdrawals.length} approved, ${rejectedWithdrawals.length} rejected',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: withdrawalSuccessRate / 100,
                      minHeight: 8,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green, size: 32),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Account Status',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Active & Healthy',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.green[700],
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabsSection(
    WalletState state,
    double currentBalance,
    List<WalletTransaction> filteredTransactions,
    List<WithdrawalRequest> displayWithdrawals,
    List<MapEntry<String, double>> earningsByMonth,
    List<WalletTransaction> siteVisitEarnings,
    double withdrawalSuccessRate,
    List<WithdrawalRequest> pendingWithdrawals,
    List<WithdrawalRequest> completedWithdrawals,
    List<WithdrawalRequest> rejectedWithdrawals,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          TabBar(
            controller: _tabController,
            tabs: const [
              Tab(text: 'Overview'),
              Tab(text: 'Transactions'),
              Tab(text: 'Withdrawals'),
              Tab(text: 'Earnings'),
              Tab(text: 'Down Payments'),
              Tab(text: 'Activity'),
            ],
          ),
          SizedBox(
            height: 600,
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildOverviewTab(state, earningsByMonth, siteVisitEarnings),
                _buildTransactionsTab(filteredTransactions),
                _buildWithdrawalsTab(
                  displayWithdrawals,
                  pendingWithdrawals,
                  completedWithdrawals,
                  rejectedWithdrawals,
                ),
                _buildEarningsTab(siteVisitEarnings),
                _buildDownPaymentsTab(),
                _buildActivityTab(state, withdrawalSuccessRate),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOverviewTab(
    WalletState state,
    List<MapEntry<String, double>> earningsByMonth,
    List<WalletTransaction> siteVisitEarnings,
  ) {
    return SingleChildScrollView(
      child: Column(
        children: [
          _buildRecentTransactionsCard(state.transactions.take(5).toList()),
          const SizedBox(height: 16),
          _buildMonthlyEarningsCard(earningsByMonth),
          const SizedBox(height: 16),
          const PaymentMethodsCard(),
        ],
      ),
    );
  }

  Widget _buildRecentTransactionsCard(List<WalletTransaction> transactions) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Recent Transactions',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 12),
            if (transactions.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('No transactions yet'),
              )
            else
              ...transactions.map(
                (t) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              t.typeLabel,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              DateFormat(
                                'MMM dd, yyyy HH:mm',
                              ).format(t.createdAt),
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.grey,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        '${t.amount >= 0 ? '+' : ''}${formatCurrency(t.amount, t.currency)}',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: t.amount >= 0 ? Colors.green : Colors.red,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildMonthlyEarningsCard(
    List<MapEntry<String, double>> earningsByMonth,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Earnings by Month',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 12),
            if (earningsByMonth.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('No earnings data yet'),
              )
            else
              ...earningsByMonth.map((entry) {
                final maxAmount = earningsByMonth
                    .map((e) => e.value)
                    .reduce((a, b) => a > b ? a : b);
                final percentage = (entry.value / maxAmount) * 100;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(entry.key),
                          Text(
                            formatCurrency(entry.value, DEFAULT_CURRENCY),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: percentage / 100,
                          minHeight: 6,
                        ),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _buildTransactionsTab(List<WalletTransaction> filteredTransactions) {
    return SingleChildScrollView(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Transaction History',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              const SizedBox(height: 12),
              if (filteredTransactions.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(child: Text('No transactions found')),
                )
              else
                ...filteredTransactions.map((t) => _buildTransactionRow(t)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTransactionRow(WalletTransaction t) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(_getTransactionIcon(t.type), size: 16),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.typeLabel,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  t.description ?? '-',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${t.amount >= 0 ? '+' : ''}${formatCurrency(t.amount, t.currency)}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: t.amount >= 0 ? Colors.green : Colors.red,
                ),
              ),
              Text(
                DateFormat('MMM dd, yyyy').format(t.createdAt),
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
            ],
          ),
        ],
      ),
    );
  }

  IconData _getTransactionIcon(String type) {
    switch (type) {
      case 'earning':
      case 'site_visit_fee':
        return Icons.trending_up;
      case 'withdrawal':
        return Icons.trending_down;
      case 'bonus':
        return Icons.card_giftcard;
      case 'penalty':
        return Icons.warning;
      default:
        return Icons.attach_money;
    }
  }

  Widget _buildWithdrawalsTab(
    List<WithdrawalRequest> displayWithdrawals,
    List<WithdrawalRequest> pendingWithdrawals,
    List<WithdrawalRequest> completedWithdrawals,
    List<WithdrawalRequest> rejectedWithdrawals,
  ) {
    return SingleChildScrollView(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Withdrawal Requests',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _buildWithdrawalStatusBadge(
                    'All',
                    pendingWithdrawals.length +
                        completedWithdrawals.length +
                        rejectedWithdrawals.length,
                  ),
                  _buildWithdrawalStatusBadge(
                    'Pending',
                    pendingWithdrawals.length,
                  ),
                  _buildWithdrawalStatusBadge(
                    'Approved',
                    completedWithdrawals.length,
                  ),
                  _buildWithdrawalStatusBadge(
                    'Rejected',
                    rejectedWithdrawals.length,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (displayWithdrawals.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(child: Text('No withdrawal requests found')),
                )
              else
                ...displayWithdrawals.map((r) => _buildWithdrawalRow(r)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildWithdrawalStatusBadge(String label, int count) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 12)),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
      ],
    );
  }

  Widget _buildWithdrawalRow(WithdrawalRequest r) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey[300]!),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    formatCurrency(r.amount, r.currency),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    r.statusLabel,
                    style: TextStyle(
                      fontSize: 12,
                      color: _getStatusColor(r.status),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (r.requestReason != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        r.requestReason!,
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.grey,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
            if (r.status == WITHDRAWAL_STATUS_PENDING)
              IconButton(
                icon: const Icon(Icons.cancel_outlined, color: Colors.red),
                onPressed: () async {
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Cancel Withdrawal?'),
                      content: const Text(
                        'Are you sure you want to cancel this withdrawal request?',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('No'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Yes, Cancel'),
                        ),
                      ],
                    ),
                  );
                  if (confirm == true) {
                    try {
                      await ref
                          .read(walletNotifierProvider.notifier)
                          .cancelWithdrawalRequest(r.id);
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Withdrawal request cancelled'),
                          ),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(
                          context,
                        ).showSnackBar(SnackBar(content: Text('Error: $e')));
                      }
                    }
                  }
                },
              ),
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case WITHDRAWAL_STATUS_PENDING:
        return Colors.orange;
      case WITHDRAWAL_STATUS_APPROVED:
        return Colors.green;
      case WITHDRAWAL_STATUS_REJECTED:
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Widget _buildEarningsTab(List<WalletTransaction> siteVisitEarnings) {
    return SingleChildScrollView(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Site Visit Earnings',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              const SizedBox(height: 12),
              if (siteVisitEarnings.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(child: Text('No site visit earnings yet')),
                )
              else
                ...siteVisitEarnings.map((t) => _buildTransactionRow(t)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActivityTab(WalletState state, double withdrawalSuccessRate) {
    return SingleChildScrollView(
      child: Column(
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Activity Summary',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 16),
                  _buildActivityStat(
                    'Total Transactions',
                    state.stats?.totalTransactions.toString() ?? '0',
                  ),
                  _buildActivityStat(
                    'Site Visits Completed',
                    state.stats?.completedSiteVisits.toString() ?? '0',
                  ),
                  _buildActivityStat(
                    'Withdrawal Requests',
                    state.withdrawalRequests.length.toString(),
                  ),
                  _buildActivityStat(
                    'Approval Success',
                    '${withdrawalSuccessRate.toStringAsFixed(0)}%',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityStat(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ],
      ),
    );
  }

  Widget _buildDownPaymentsTab() {
    return Consumer(
      builder: (context, ref, child) {
        final userId = ref.watch(walletServiceProvider).getCurrentUserId();
        if (userId == null) {
          return const Center(child: Text('User not authenticated'));
        }

        final downPaymentState = ref.watch(downPaymentProvider(userId));
        final downPaymentStream = ref.watch(
          userDownPaymentStreamProvider(userId),
        );

        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Down Payment Requests',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  ElevatedButton.icon(
                    onPressed: () =>
                        _showCreateDownPaymentDialog(context, ref, userId),
                    icon: const Icon(Icons.add),
                    label: const Text('Request Advance'),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Status summary
              downPaymentStream.when(
                data: (requests) => _buildDownPaymentSummary(requests),
                loading: () => const CircularProgressIndicator(),
                error: (error, stack) => Text('Error: $error'),
              ),

              const SizedBox(height: 24),

              // Requests list
              downPaymentStream.when(
                data: (requests) => _buildDownPaymentRequestsList(
                  requests,
                  context,
                  ref,
                  userId,
                ),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, stack) =>
                    Center(child: Text('Error loading requests: $error')),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDownPaymentSummary(List<DownPaymentRequest> requests) {
    final pending = requests
        .where(
          (r) =>
              r.status == 'pending_supervisor' || r.status == 'pending_admin',
        )
        .length;
    final approved = requests.where((r) => r.status == 'approved').length;
    final rejected = requests.where((r) => r.status == 'rejected').length;
    final paid = requests.where((r) => r.status == 'fully_paid').length;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Text(
              'Request Summary',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildSummaryItem('Pending', pending.toString(), Colors.orange),
                _buildSummaryItem(
                  'Approved',
                  approved.toString(),
                  Colors.green,
                ),
                _buildSummaryItem('Rejected', rejected.toString(), Colors.red),
                _buildSummaryItem('Paid', paid.toString(), Colors.blue),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(label, style: TextStyle(fontSize: 12, color: color)),
      ],
    );
  }

  Widget _buildDownPaymentRequestsList(
    List<DownPaymentRequest> requests,
    BuildContext context,
    WidgetRef ref,
    String userId,
  ) {
    if (requests.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'No down payment requests yet.\nTap "Request Advance" to create your first request.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey),
          ),
        ),
      );
    }

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: requests.length,
      itemBuilder: (context, index) {
        final request = requests[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        request.siteName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    _buildStatusChip(request.status),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Requested: ${CurrencyUtils.formatCurrency(request.requestedAmount)}',
                  style: const TextStyle(fontSize: 14),
                ),
                Text(
                  'Budget: ${CurrencyUtils.formatCurrency(request.totalTransportationBudget)}',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const SizedBox(height: 8),
                Text(
                  'Requested on: ${DateFormat('MMM dd, yyyy').format(request.requestedAt)}',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
                if (request.status == 'pending_supervisor' ||
                    request.status == 'pending_admin' ||
                    request.status == 'approved') ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (request.status == 'pending_supervisor' ||
                          request.status == 'pending_admin' ||
                          request.status == 'approved')
                        TextButton.icon(
                          onPressed: () => _cancelDownPaymentRequest(
                            context,
                            ref,
                            request.id,
                            userId,
                          ),
                          icon: const Icon(Icons.cancel, size: 16),
                          label: const Text('Cancel'),
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.red,
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildStatusChip(String status) {
    Color color;
    String label;

    switch (status) {
      case 'pending_supervisor':
        color = Colors.orange;
        label = 'Pending Supervisor';
        break;
      case 'pending_admin':
        color = Colors.blue;
        label = 'Pending Admin';
        break;
      case 'approved':
        color = Colors.green;
        label = 'Approved';
        break;
      case 'rejected':
        color = Colors.red;
        label = 'Rejected';
        break;
      case 'partially_paid':
        color = Colors.purple;
        label = 'Partially Paid';
        break;
      case 'fully_paid':
        color = Colors.teal;
        label = 'Fully Paid';
        break;
      case 'cancelled':
        color = Colors.grey;
        label = 'Cancelled';
        break;
      default:
        color = Colors.grey;
        label = status;
    }

    return Chip(
      label: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
      backgroundColor: color,
      padding: EdgeInsets.zero,
    );
  }

  Future<void> _showCreateDownPaymentDialog(
    BuildContext context,
    WidgetRef ref,
    String userId,
  ) async {
    await showDialog(
      context: context,
      builder: (context) => DownPaymentRequestDialog(userId: userId),
    );
  }

  Future<void> _cancelDownPaymentRequest(
    BuildContext context,
    WidgetRef ref,
    String requestId,
    String userId,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Request'),
        content: const Text(
          'Are you sure you want to cancel this down payment request?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('No'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Yes'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await ref
            .read(downPaymentProvider(userId).notifier)
            .cancelRequest(requestId);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Request cancelled successfully')),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to cancel request: $e')),
          );
        }
      }
    }
  }
}
