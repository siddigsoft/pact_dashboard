import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class CostSubmissionScreen extends ConsumerStatefulWidget {
  const CostSubmissionScreen({super.key});
  @override
  ConsumerState<CostSubmissionScreen> createState() => _CostSubmissionScreenState();
}

class _CostSubmissionScreenState extends ConsumerState<CostSubmissionScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _submissions = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    final user = ref.read(currentUserProvider);
    final isFOM = user?.isFOM ?? false;
    final isSupervisor = user?.isSupervisor ?? false;
    final defaultTab = isFOM ? 3 : 0;
    _tabs = TabController(length: isSupervisor || isFOM ? 5 : 4, vsync: this, initialIndex: defaultTab);
    _load();
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      var query = client.from('operational_cost_submissions').select('id, reference_number, amount, currency, status, tier1_status, tier2_status, submitter_role, created_at, description, expense_category, project:projects(name), submitter:profiles!submitted_by(name)');

      if (!user.isFOM && !user.isSupervisor && !user.isAdmin) {
        query = query.eq('submitted_by', client.auth.currentUser!.id);
      } else if (user.isSupervisor && user.hub != null) {
        // Load team submissions for hub
      }

      final data = await query.order('created_at', ascending: false).limit(100);
      setState(() { _submissions = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  String _derivedStatus(Map<String, dynamic> s) {
    final t1 = s['tier1_status'] as String? ?? 'pending';
    final t2 = s['tier2_status'] as String? ?? 'pending';
    final base = s['status'] as String? ?? 'pending';
    if (base == 'paid') return 'paid';
    if (base == 'reconciled') return 'reconciled';
    if (t2 == 'rejected' || t1 == 'rejected') return 'rejected';
    if (t2 == 'approved') return 'approved';
    if (t1 == 'approved') return 'under_review';
    return 'pending';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isFOM = user?.isFOM ?? false;
    final isSupervisor = user?.isSupervisor ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cost Submission'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          indicatorColor: Colors.white,
          tabs: [
            const Tab(icon: Icon(Icons.add_circle_outline, size: 18), text: 'Submit'),
            const Tab(icon: Icon(Icons.pending_outlined, size: 18), text: 'Outstanding'),
            const Tab(icon: Icon(Icons.sync_outlined, size: 18), text: 'Reconcile'),
            Tab(icon: const Icon(Icons.history_outlined, size: 18), text: isFOM ? 'Approvals' : isSupervisor ? 'Team' : 'My History'),
            if (isSupervisor || isFOM) const Tab(icon: Icon(Icons.shield_outlined, size: 18), text: 'Audit'),
          ],
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
                      _SubmitTab(),
                      _OutstandingTab(submissions: _submissions.where((s) => _derivedStatus(s) == 'approved').toList()),
                      _ReconcileTab(),
                      _HistoryTab(submissions: _submissions, isFOM: isFOM, isSupervisor: isSupervisor, onRefresh: _load, derivedStatus: _derivedStatus),
                      if (isSupervisor || isFOM) _AuditTab(submissions: _submissions),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _SubmitTab extends StatefulWidget {
  @override
  State<_SubmitTab> createState() => _SubmitTabState();
}

class _SubmitTabState extends State<_SubmitTab> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _vendorCtrl = TextEditingController();
  String _category = 'transport';
  String _currency = 'SDG';
  bool _submitting = false;

  static const _categories = ['transport', 'accommodation', 'internet', 'permits', 'food', 'supplies', 'training', 'other'];
  static const _currencies = ['SDG', 'USD'];

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final client = Supabase.instance.client;
      final userId = client.auth.currentUser?.id;
      await client.from('operational_cost_submissions').insert({
        'submitted_by': userId,
        'amount': double.tryParse(_amountCtrl.text) ?? 0,
        'currency': _currency,
        'expense_category': _category,
        'description': _descCtrl.text.trim(),
        'vendor': _vendorCtrl.text.trim(),
        'status': 'pending',
        'tier1_status': 'pending',
        'tier2_status': 'pending',
        'created_at': DateTime.now().toIso8601String(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cost submitted!'), backgroundColor: AppColors.success));
        _amountCtrl.clear(); _descCtrl.clear(); _vendorCtrl.clear();
        setState(() { _category = 'transport'; _currency = 'SDG'; });
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    } finally { if (mounted) setState(() => _submitting = false); }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Submit Operational Cost', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Linked to MMP/project operations', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 20),
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(labelText: 'Expense Category', border: OutlineInputBorder()),
              items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(_capitalize(c)))).toList(),
              onChanged: (v) => setState(() => _category = v ?? _category),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(flex: 3, child: TextFormField(
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount', border: OutlineInputBorder()),
                validator: (v) => (v == null || double.tryParse(v) == null) ? 'Enter valid amount' : null,
              )),
              const SizedBox(width: 12),
              Expanded(child: DropdownButtonFormField<String>(
                value: _currency,
                decoration: const InputDecoration(labelText: 'Currency', border: OutlineInputBorder()),
                items: _currencies.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setState(() => _currency = v ?? _currency),
              )),
            ]),
            const SizedBox(height: 16),
            TextFormField(
              controller: _vendorCtrl,
              decoration: const InputDecoration(labelText: 'Vendor / Payee', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder(), hintText: 'Describe the expense...'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Description required' : null,
            ),
            const SizedBox(height: 24),
            SizedBox(height: 50, child: ElevatedButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.send_outlined),
              label: const Text('Submit for Approval', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            )),
          ],
        ),
      ),
    );
  }

  String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

class _OutstandingTab extends StatelessWidget {
  final List<Map<String, dynamic>> submissions;
  const _OutstandingTab({required this.submissions});
  @override
  Widget build(BuildContext context) {
    if (submissions.isEmpty) return const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.check_circle_outline, size: 48, color: AppColors.success),
      SizedBox(height: 12),
      Text('No outstanding advances', style: TextStyle(color: AppColors.textSecondary)),
    ]));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: submissions.length,
      itemBuilder: (_, i) => _CostCard(submission: submissions[i], showActions: false),
    );
  }
}

class _ReconcileTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Center(child: Padding(
    padding: EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.sync_outlined, size: 48, color: AppColors.textDisabled),
      SizedBox(height: 12),
      Text('Reconciliation', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      SizedBox(height: 8),
      Text('Settle your outstanding advances by uploading receipts and confirming actual amounts spent.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textSecondary)),
    ]),
  ));
}

class _HistoryTab extends StatelessWidget {
  final List<Map<String, dynamic>> submissions;
  final bool isFOM, isSupervisor;
  final VoidCallback onRefresh;
  final String Function(Map<String, dynamic>) derivedStatus;

  const _HistoryTab({required this.submissions, required this.isFOM, required this.isSupervisor, required this.onRefresh, required this.derivedStatus});

  @override
  Widget build(BuildContext context) {
    if (submissions.isEmpty) return const Center(child: Text('No submissions', style: TextStyle(color: AppColors.textSecondary)));
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: submissions.length,
        itemBuilder: (_, i) => _CostCard(
          submission: submissions[i],
          showActions: isFOM || isSupervisor,
          isFOM: isFOM,
          isSupervisor: isSupervisor,
          onAction: onRefresh,
          derivedStatus: derivedStatus(submissions[i]),
        ),
      ),
    );
  }
}

class _AuditTab extends StatelessWidget {
  final List<Map<String, dynamic>> submissions;
  const _AuditTab({required this.submissions});
  @override
  Widget build(BuildContext context) => const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
    Icon(Icons.shield_outlined, size: 48, color: AppColors.textDisabled),
    SizedBox(height: 12),
    Text('Confirmation Audit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
    SizedBox(height: 8),
    Text('Track who confirmed payment receipt', style: TextStyle(color: AppColors.textSecondary)),
  ]));
}

class _CostCard extends StatefulWidget {
  final Map<String, dynamic> submission;
  final bool showActions;
  final bool isFOM, isSupervisor;
  final VoidCallback? onAction;
  final String? derivedStatus;

  const _CostCard({
    required this.submission,
    required this.showActions,
    this.isFOM = false,
    this.isSupervisor = false,
    this.onAction,
    this.derivedStatus,
  });

  @override
  State<_CostCard> createState() => _CostCardState();
}

class _CostCardState extends State<_CostCard> {
  bool _processing = false;

  Future<void> _approve() async {
    setState(() => _processing = true);
    try {
      final client = Supabase.instance.client;
      final id = widget.submission['id'] as String;
      if (widget.isFOM) {
        await client.from('operational_cost_submissions').update({'tier2_status': 'approved', 'tier2_approved_at': DateTime.now().toIso8601String()}).eq('id', id);
      } else if (widget.isSupervisor) {
        await client.from('operational_cost_submissions').update({'tier1_status': 'approved', 'tier1_approved_at': DateTime.now().toIso8601String()}).eq('id', id);
      }
      widget.onAction?.call();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    } finally { if (mounted) setState(() => _processing = false); }
  }

  Future<void> _reject() async {
    setState(() => _processing = true);
    try {
      final client = Supabase.instance.client;
      final id = widget.submission['id'] as String;
      if (widget.isFOM) {
        await client.from('operational_cost_submissions').update({'tier2_status': 'rejected', 'tier2_rejected_at': DateTime.now().toIso8601String()}).eq('id', id);
      } else if (widget.isSupervisor) {
        await client.from('operational_cost_submissions').update({'tier1_status': 'rejected', 'tier1_rejected_at': DateTime.now().toIso8601String()}).eq('id', id);
      }
      widget.onAction?.call();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    } finally { if (mounted) setState(() => _processing = false); }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.submission;
    final status = widget.derivedStatus ?? (s['status'] as String? ?? 'pending');
    final ref = s['reference_number'] as String? ?? s['id'].toString().substring(0, 8);
    final amount = (s['amount'] as num?)?.toStringAsFixed(0) ?? '0';
    final currency = s['currency'] as String? ?? 'SDG';
    final category = s['expense_category'] as String? ?? '';
    final project = (s['project'] as Map?)?['name'] as String?;
    final submitter = (s['submitter'] as Map?)?['name'] as String?;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('#$ref', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                if (submitter != null) Text(submitter, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ])),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('$currency $amount', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.primary)),
                const SizedBox(height: 4),
                StatusBadge(status: status),
              ]),
            ]),
            if (category.isNotEmpty || project != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                if (category.isNotEmpty) Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: AppColors.accent.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                  child: Text(category, style: const TextStyle(color: AppColors.accent, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
                if (project != null) ...[
                  const SizedBox(width: 8),
                  Text(project, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                ],
              ]),
            ],
            if (widget.showActions && (status == 'pending' || status == 'under_review')) ...[
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: OutlinedButton.icon(
                  onPressed: _processing ? null : _reject,
                  icon: const Icon(Icons.close, size: 16, color: AppColors.error),
                  label: const Text('Reject', style: TextStyle(color: AppColors.error)),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.error)),
                )),
                const SizedBox(width: 12),
                Expanded(child: ElevatedButton.icon(
                  onPressed: _processing ? null : _approve,
                  icon: _processing ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check, size: 16),
                  label: Text(widget.isFOM ? 'Approve (T2)' : 'Approve (T1)'),
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                )),
              ]),
            ],
          ],
        ),
      ),
    );
  }
}
