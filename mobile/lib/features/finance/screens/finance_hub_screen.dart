import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';

class FinanceHubScreen extends ConsumerStatefulWidget {
  const FinanceHubScreen({super.key});
  @override
  ConsumerState<FinanceHubScreen> createState() => _FinanceHubScreenState();
}

class _FinanceHubScreenState extends ConsumerState<FinanceHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Map<String, dynamic> _summary = {};
  List<Map<String, dynamic>> _recentTransactions = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _tabs = TabController(length: 4, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('budgets').select('id, project_id, total_amount, spent_amount, currency, project:projects(name)').limit(10),
        client.from('wallet_transactions').select('id, type, amount, currency, description, created_at').order('created_at', ascending: false).limit(20),
      ]);
      setState(() {
        _recentTransactions = List<Map<String, dynamic>>.from(results[1]);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Finance Hub'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: const [Tab(text: 'Overview'), Tab(text: 'Wallets'), Tab(text: 'Reconciliation'), Tab(text: 'Reports')],
        ),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _OverviewTab(transactions: _recentTransactions),
                      _WalletsTab(),
                      _ReconciliationTab(),
                      _ReportsTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  final List<Map<String, dynamic>> transactions;
  const _OverviewTab({required this.transactions});

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text('Financial Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
      const SizedBox(height: 4),
      const Text('Simplified finance dashboard for field operations', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
      const SizedBox(height: 20),
      Row(children: [
        Expanded(child: _StatCard('Pending Costs', 'SDG —', AppColors.warning, Icons.pending_outlined)),
        const SizedBox(width: 12),
        Expanded(child: _StatCard('Approved', 'SDG —', AppColors.success, Icons.check_circle_outline)),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _StatCard('Outstanding', 'SDG —', AppColors.error, Icons.receipt_long_outlined)),
        const SizedBox(width: 12),
        Expanded(child: _StatCard('This Month', 'SDG —', AppColors.primary, Icons.bar_chart_outlined)),
      ]),
      const SizedBox(height: 20),
      const Text('Recent Transactions', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
      const SizedBox(height: 12),
      if (transactions.isEmpty)
        const Text('No recent transactions', style: TextStyle(color: AppColors.textSecondary))
      else
        ...transactions.take(10).map((t) => _TransactionTile(t)),
    ],
  );
}

class _StatCard extends StatelessWidget {
  final String label, value;
  final Color color;
  final IconData icon;
  const _StatCard(this.label, this.value, this.color, this.icon);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, color: color, size: 20),
      const SizedBox(height: 8),
      Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: color)),
      Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
    ]),
  );
}

class _TransactionTile extends StatelessWidget {
  final Map<String, dynamic> t;
  const _TransactionTile(this.t);
  @override
  Widget build(BuildContext context) {
    final isCredit = (t['type'] as String? ?? '') == 'credit';
    final amount = (t['amount'] as num?)?.toStringAsFixed(0) ?? '0';
    final currency = t['currency'] as String? ?? 'SDG';
    return ListTile(
      dense: true,
      leading: CircleAvatar(
        radius: 16,
        backgroundColor: (isCredit ? AppColors.success : AppColors.error).withOpacity(0.1),
        child: Icon(isCredit ? Icons.add : Icons.remove, size: 14, color: isCredit ? AppColors.success : AppColors.error),
      ),
      title: Text(t['description'] as String? ?? t['type'] as String? ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
      trailing: Text('${isCredit ? '+' : '-'}$currency $amount', style: TextStyle(color: isCredit ? AppColors.success : AppColors.error, fontWeight: FontWeight.w700, fontSize: 13)),
    );
  }
}

class _WalletsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Center(child: Padding(
    padding: EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.account_balance_wallet_outlined, size: 48, color: AppColors.textDisabled),
      SizedBox(height: 16),
      Text('Wallet Management', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      SizedBox(height: 8),
      Text('View all field wallet balances, issue funds, and track outstanding advances.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textSecondary)),
    ]),
  ));
}

class _ReconciliationTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Center(child: Padding(
    padding: EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.sync_outlined, size: 48, color: AppColors.textDisabled),
      SizedBox(height: 16),
      Text('Reconciliation', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      SizedBox(height: 8),
      Text('Review and approve reconciliation requests from field staff.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textSecondary)),
    ]),
  ));
}

class _ReportsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Center(child: Padding(
    padding: EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.bar_chart_outlined, size: 48, color: AppColors.textDisabled),
      SizedBox(height: 16),
      Text('Financial Reports', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      SizedBox(height: 8),
      Text('Generate and export cost summaries, budget vs actuals, and aging reports.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textSecondary)),
    ]),
  ));
}
