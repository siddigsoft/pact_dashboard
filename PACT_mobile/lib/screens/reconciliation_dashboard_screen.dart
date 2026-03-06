import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class ReconciliationDashboardScreen extends StatefulWidget {
  const ReconciliationDashboardScreen({super.key});
  @override
  State<ReconciliationDashboardScreen> createState() => _ReconciliationDashboardScreenState();
}

class _ReconciliationDashboardScreenState extends State<ReconciliationDashboardScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _items = [];
  bool _isLoading = true;
  String _filterStatus = 'all';
  Map<String, int> _stats = {'total': 0, 'matched': 0, 'pending': 0, 'discrepancy': 0};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase.from('reconciliation_items').select('*').order('created_at', ascending: false);
      final list = List<Map<String, dynamic>>.from(data);
      if (mounted) {
        setState(() {
          _items = list;
          _stats = {
            'total': list.length,
            'matched': list.where((i) => i['status'] == 'matched').length,
            'pending': list.where((i) => i['status'] == 'pending').length,
            'discrepancy': list.where((i) => i['status'] == 'discrepancy').length,
          };
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_filterStatus == 'all') return _items;
    return _items.where((i) => i['status'] == _filterStatus).toList();
  }

  Color _statusColor(String? status) {
    switch (status) {
      case 'matched': return Colors.green;
      case 'discrepancy': return Colors.red;
      case 'pending': return Colors.orange;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Reconciliation', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadData)],
      ),
      body: _isLoading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _loadData,
            child: ListView(
              padding: const EdgeInsets.all(14),
              children: [
                Row(children: [
                  _statCard('Total', _stats['total']!, Colors.blueGrey),
                  const SizedBox(width: 8),
                  _statCard('Matched', _stats['matched']!, Colors.green),
                  const SizedBox(width: 8),
                  _statCard('Pending', _stats['pending']!, Colors.orange),
                  const SizedBox(width: 8),
                  _statCard('Issues', _stats['discrepancy']!, Colors.red),
                ]),
                const SizedBox(height: 14),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: ['all', 'matched', 'pending', 'discrepancy'].map((s) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(label: Text(s), selected: _filterStatus == s, onSelected: (_) => setState(() => _filterStatus = s), selectedColor: AppColors.primaryDark.withOpacity(0.2)),
                  )).toList()),
                ),
                const SizedBox(height: 10),
                if (_filtered.isEmpty)
                  Center(child: Padding(
                    padding: const EdgeInsets.all(40),
                    child: Column(children: [
                      const Icon(Icons.account_balance, size: 52, color: Colors.grey),
                      const SizedBox(height: 10),
                      const Text('No reconciliation records found.', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 4),
                      Text(_items.isEmpty ? 'Reconciliation is managed on the web platform.' : 'No items match the selected filter.', textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                    ]),
                  ))
                else
                  ..._filtered.map((item) => Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(item['reference'] ?? 'Ref: ${item['id']?.toString().substring(0, 8)}', style: const TextStyle(fontWeight: FontWeight.bold))),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: _statusColor(item['status']).withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                            child: Text(item['status'] ?? 'unknown', style: TextStyle(color: _statusColor(item['status']), fontSize: 12, fontWeight: FontWeight.w600)),
                          ),
                        ]),
                        const SizedBox(height: 8),
                        Row(children: [
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('Expected', style: TextStyle(fontSize: 11, color: Colors.grey)),
                            Text('\$${(item['expected_amount'] ?? 0).toString()}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          ])),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('Actual', style: TextStyle(fontSize: 11, color: Colors.grey)),
                            Text('\$${(item['actual_amount'] ?? 0).toString()}', style: TextStyle(fontWeight: FontWeight.w600, color: item['status'] == 'discrepancy' ? Colors.red : Colors.black)),
                          ])),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('Variance', style: TextStyle(fontSize: 11, color: Colors.grey)),
                            Text('\$${((item['actual_amount'] ?? 0) - (item['expected_amount'] ?? 0)).toString()}', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.red.shade400)),
                          ])),
                        ]),
                        if (item['notes'] != null) ...[
                          const SizedBox(height: 6),
                          Text(item['notes'], style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                        ],
                      ]),
                    ),
                  )).toList(),
              ],
            ),
          ),
    );
  }

  Widget _statCard(String label, int value, Color color) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))),
      child: Column(children: [
        Text('$value', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
        Text(label, style: TextStyle(fontSize: 10, color: color)),
      ]),
    ),
  );
}
