import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key});
  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> {
  List<Map<String, dynamic>> _costSubmissions = [];
  List<Map<String, dynamic>> _downPayments = [];
  List<Map<String, dynamic>> _withdrawals = [];
  bool _loading = true;
  String _urgencyFilter = 'all';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      final isFOM = user.isFOM;

      final results = await Future.wait([
        isFOM
            ? client.from('operational_cost_submissions').select('id, reference_number, amount, currency, tier1_status, tier2_status, status, expense_category, created_at, submitter:profiles!submitted_by(name)').eq('tier1_status', 'approved').eq('tier2_status', 'pending').order('created_at')
            : client.from('operational_cost_submissions').select('id, reference_number, amount, currency, tier1_status, tier2_status, status, expense_category, created_at, submitter:profiles!submitted_by(name)').eq('tier1_status', 'pending').order('created_at'),
        client.from('down_payment_requests').select('id, amount, currency, status, purpose, created_at, requester:profiles!user_id(name)').inFilter('status', ['pending_supervisor', 'pending_admin']).order('created_at'),
        client.from('withdrawal_requests').select('id, amount, currency, status, reason, created_at, requester:profiles!user_id(name)').eq('status', 'supervisor_approved').order('created_at'),
      ]);

      setState(() {
        _costSubmissions = List<Map<String, dynamic>>.from(results[0]);
        _downPayments = List<Map<String, dynamic>>.from(results[1]);
        _withdrawals = List<Map<String, dynamic>>.from(results[2]);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  int get _totalPending => _costSubmissions.length + _downPayments.length + _withdrawals.length;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Approvals Hub'),
        actions: [
          Center(child: Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: AppColors.warning, borderRadius: BorderRadius.circular(12)),
            child: Text('$_totalPending', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
          )),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          _buildUrgencyFilter(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        if (_costSubmissions.isNotEmpty) ...[
                          _sectionHeader('Cost Submissions', _costSubmissions.length, AppColors.warning),
                          const SizedBox(height: 8),
                          ..._costSubmissions.map((s) => _CostApprovalCard(
                            submission: s,
                            isFOM: user?.isFOM ?? false,
                            onAction: _load,
                          )),
                          const SizedBox(height: 16),
                        ],
                        if (_downPayments.isNotEmpty) ...[
                          _sectionHeader('Down Payments', _downPayments.length, AppColors.accent),
                          const SizedBox(height: 8),
                          ..._downPayments.map((d) => _DownPaymentCard(dp: d, onAction: _load)),
                          const SizedBox(height: 16),
                        ],
                        if (_withdrawals.isNotEmpty) ...[
                          _sectionHeader('Withdrawals', _withdrawals.length, AppColors.primary),
                          const SizedBox(height: 8),
                          ..._withdrawals.map((w) => _WithdrawalCard(w: w, onAction: _load)),
                        ],
                        if (_totalPending == 0)
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.all(48),
                              child: Column(children: [
                                Icon(Icons.check_circle_outline, size: 64, color: AppColors.success),
                                SizedBox(height: 16),
                                Text('All caught up!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                                SizedBox(height: 8),
                                Text('No pending approvals', style: TextStyle(color: AppColors.textSecondary)),
                              ]),
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

  Widget _buildUrgencyFilter() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: ['all', 'critical', 'high', 'normal'].map((f) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            label: Text(f[0].toUpperCase() + f.substring(1)),
            selected: _urgencyFilter == f,
            onSelected: (_) => setState(() => _urgencyFilter = f),
            selectedColor: AppColors.primary,
            labelStyle: TextStyle(color: _urgencyFilter == f ? Colors.white : null),
          ),
        )).toList(),
      ),
    ),
  );

  Widget _sectionHeader(String title, int count, Color color) => Row(children: [
    Container(width: 4, height: 20, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
    const SizedBox(width: 10),
    Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
    const SizedBox(width: 8),
    Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
      child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
    ),
  ]);
}

class _CostApprovalCard extends StatefulWidget {
  final Map<String, dynamic> submission;
  final bool isFOM;
  final VoidCallback onAction;
  const _CostApprovalCard({required this.submission, required this.isFOM, required this.onAction});
  @override
  State<_CostApprovalCard> createState() => _CostApprovalCardState();
}

class _CostApprovalCardState extends State<_CostApprovalCard> {
  bool _processing = false;

  Future<void> _act(bool approve) async {
    setState(() => _processing = true);
    try {
      final client = Supabase.instance.client;
      final id = widget.submission['id'] as String;
      final field = widget.isFOM ? 'tier2_status' : 'tier1_status';
      await client.from('operational_cost_submissions').update({
        field: approve ? 'approved' : 'rejected',
        '${field.replaceAll('_status', '')}_at': DateTime.now().toIso8601String(),
      }).eq('id', id);
      widget.onAction();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    } finally { if (mounted) setState(() => _processing = false); }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.submission;
    final ref = s['reference_number'] as String? ?? s['id'].toString().substring(0, 8);
    final amount = (s['amount'] as num?)?.toStringAsFixed(0) ?? '0';
    final currency = s['currency'] as String? ?? 'SDG';
    final submitter = (s['submitter'] as Map?)?['name'] as String? ?? 'Unknown';
    final category = s['expense_category'] as String? ?? '';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('#$ref', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              Text(submitter, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            ])),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$currency $amount', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.primary)),
              if (category.isNotEmpty) Text(category, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
            ]),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: OutlinedButton(
              onPressed: _processing ? null : () => _act(false),
              style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.error), foregroundColor: AppColors.error),
              child: const Text('Reject'),
            )),
            const SizedBox(width: 12),
            Expanded(child: ElevatedButton(
              onPressed: _processing ? null : () => _act(true),
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
              child: _processing
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(widget.isFOM ? 'Approve (T2)' : 'Approve (T1)'),
            )),
          ]),
        ]),
      ),
    );
  }
}

class _DownPaymentCard extends StatelessWidget {
  final Map<String, dynamic> dp;
  final VoidCallback onAction;
  const _DownPaymentCard({required this.dp, required this.onAction});
  @override
  Widget build(BuildContext context) {
    final amount = (dp['amount'] as num?)?.toStringAsFixed(0) ?? '0';
    final currency = dp['currency'] as String? ?? 'SDG';
    final requester = (dp['requester'] as Map?)?['name'] as String? ?? 'Unknown';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: const CircleAvatar(backgroundColor: AppColors.accent, child: Icon(Icons.payments_outlined, color: Colors.white, size: 18)),
        title: Text('Down Payment — $currency $amount', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(requester),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(icon: const Icon(Icons.close, color: AppColors.error), onPressed: () {}),
          IconButton(icon: const Icon(Icons.check, color: AppColors.success), onPressed: () {}),
        ]),
      ),
    );
  }
}

class _WithdrawalCard extends StatelessWidget {
  final Map<String, dynamic> w;
  final VoidCallback onAction;
  const _WithdrawalCard({required this.w, required this.onAction});
  @override
  Widget build(BuildContext context) {
    final amount = (w['amount'] as num?)?.toStringAsFixed(0) ?? '0';
    final currency = w['currency'] as String? ?? 'SDG';
    final requester = (w['requester'] as Map?)?['name'] as String? ?? 'Unknown';
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: const CircleAvatar(backgroundColor: AppColors.primary, child: Icon(Icons.account_balance_wallet_outlined, color: Colors.white, size: 18)),
        title: Text('Withdrawal — $currency $amount', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(requester),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          IconButton(icon: const Icon(Icons.close, color: AppColors.error), onPressed: () {}),
          IconButton(icon: const Icon(Icons.check, color: AppColors.success), onPressed: () {}),
        ]),
      ),
    );
  }
}
