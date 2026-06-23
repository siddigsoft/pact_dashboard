import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class MyExpensesScreen extends ConsumerStatefulWidget {
  const MyExpensesScreen({super.key});
  @override
  ConsumerState<MyExpensesScreen> createState() => _MyExpensesScreenState();
}

class _MyExpensesScreenState extends ConsumerState<MyExpensesScreen> {
  List<Map<String, dynamic>> _expenses = [];
  double _totalApproved = 0;
  double _totalPending = 0;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final data = await Supabase.instance.client
          .from('operational_cost_submissions')
          .select('id, reference_number, amount, currency, status, tier1_status, tier2_status, expense_category, created_at, description')
          .eq('submitted_by', user.id)
          .order('created_at', ascending: false)
          .limit(100);
      final expenses = List<Map<String, dynamic>>.from(data);
      double approved = 0, pending = 0;
      for (final e in expenses) {
        final amt = (e['amount'] as num?)?.toDouble() ?? 0;
        final t2 = e['tier2_status'] as String? ?? 'pending';
        final t1 = e['tier1_status'] as String? ?? 'pending';
        if (t2 == 'approved') approved += amt;
        else if (t1 == 'pending') pending += amt;
      }
      setState(() { _expenses = expenses; _totalApproved = approved; _totalPending = pending; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  String _status(Map<String, dynamic> e) {
    final t1 = e['tier1_status'] as String? ?? 'pending';
    final t2 = e['tier2_status'] as String? ?? 'pending';
    if (t2 == 'approved') return 'approved';
    if (t2 == 'rejected' || t1 == 'rejected') return 'rejected';
    if (t1 == 'approved') return 'under_review';
    return 'pending';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Expenses'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                const OfflineBanner(),
                // Summary header
                Container(
                  padding: const EdgeInsets.all(20),
                  color: AppColors.primary.withOpacity(0.05),
                  child: Row(children: [
                    Expanded(child: _SummaryTile('Approved', 'SDG ${_totalApproved.toStringAsFixed(0)}', AppColors.success)),
                    Container(width: 1, height: 48, color: AppColors.border),
                    Expanded(child: _SummaryTile('Pending', 'SDG ${_totalPending.toStringAsFixed(0)}', AppColors.warning)),
                    Container(width: 1, height: 48, color: AppColors.border),
                    Expanded(child: _SummaryTile('Total', '${_expenses.length}', AppColors.primary)),
                  ]),
                ),
                Expanded(
                  child: _expenses.isEmpty
                      ? const Center(child: Text('No expense history', style: TextStyle(color: AppColors.textSecondary)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _expenses.length,
                            itemBuilder: (_, i) {
                              final e = _expenses[i];
                              final status = _status(e);
                              final amount = (e['amount'] as num?)?.toStringAsFixed(0) ?? '0';
                              final currency = e['currency'] as String? ?? 'SDG';
                              final category = e['expense_category'] as String? ?? '';
                              final ref = e['reference_number'] as String? ?? e['id'].toString().substring(0, 8);
                              final date = e['created_at'] as String? ?? '';
                              return Card(
                                margin: const EdgeInsets.only(bottom: 10),
                                child: Padding(
                                  padding: const EdgeInsets.all(14),
                                  child: Row(children: [
                                    Container(
                                      width: 44, height: 44,
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: const Icon(Icons.receipt_outlined, color: AppColors.primary, size: 22),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text('#$ref', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                                      if (category.isNotEmpty) Text(category, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                      Text(_fmt(date), style: const TextStyle(color: AppColors.textDisabled, fontSize: 11)),
                                    ])),
                                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                      Text('$currency $amount', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.primary)),
                                      const SizedBox(height: 4),
                                      StatusBadge(status: status),
                                    ]),
                                  ]),
                                ),
                              );
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  String _fmt(String iso) {
    try { final d = DateTime.parse(iso); return '${d.day}/${d.month}/${d.year}'; } catch (_) { return iso; }
  }
}

class _SummaryTile extends StatelessWidget {
  final String label, value;
  final Color color;
  const _SummaryTile(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Column(children: [
    Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: color)),
    Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
  ]);
}
