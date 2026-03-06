import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class RetainerManagementScreen extends StatefulWidget {
  const RetainerManagementScreen({super.key});
  @override
  State<RetainerManagementScreen> createState() => _RetainerManagementScreenState();
}

class _RetainerManagementScreenState extends State<RetainerManagementScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _retainers = [];
  bool _isLoading = true;
  String _filterStatus = 'all';

  @override
  void initState() {
    super.initState();
    _loadRetainers();
  }

  Future<void> _loadRetainers() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase.from('retainer_payments').select('*, user_profiles(full_name, role)').order('created_at', ascending: false);
      if (mounted) setState(() { _retainers = List<Map<String, dynamic>>.from(data); _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered => _filterStatus == 'all' ? _retainers : _retainers.where((r) => (r['status'] ?? '') == _filterStatus).toList();

  Color _statusColor(String? s) {
    switch (s) { case 'paid': return Colors.green; case 'pending': return Colors.orange; case 'processing': return Colors.blue; case 'rejected': return Colors.red; default: return Colors.grey; }
  }

  @override
  Widget build(BuildContext context) {
    final total = _retainers.fold(0.0, (sum, r) => sum + ((r['amount'] ?? 0) as num).toDouble());
    final paid = _retainers.where((r) => r['status'] == 'paid').fold(0.0, (sum, r) => sum + ((r['amount'] ?? 0) as num).toDouble());

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Retainer Management', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadRetainers)],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(14), color: AppColors.primaryDark,
            child: Row(children: [
              Expanded(child: _summaryTile('Total Amount', '\$${total.toStringAsFixed(0)}', Colors.white)),
              Expanded(child: _summaryTile('Total Paid', '\$${paid.toStringAsFixed(0)}', Colors.greenAccent)),
              Expanded(child: _summaryTile('Records', '${_retainers.length}', Colors.white70)),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), color: Colors.white,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: ['all', 'pending', 'processing', 'paid', 'rejected'].map((s) => Padding(
                padding: const EdgeInsets.only(right: 6),
                child: FilterChip(label: Text(s), selected: _filterStatus == s, onSelected: (_) => setState(() => _filterStatus = s), selectedColor: AppColors.primaryDark.withOpacity(0.2)),
              )).toList()),
            ),
          ),
          Expanded(
            child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _filtered.isEmpty
                ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [const Icon(Icons.receipt_long, size: 60, color: Colors.grey), const SizedBox(height: 12), const Text('No retainer records found.', style: TextStyle(color: Colors.grey))]))
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final r = _filtered[i];
                      final profile = r['user_profiles'];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Row(children: [
                            CircleAvatar(backgroundColor: AppColors.primaryDark.withOpacity(0.1), child: const Icon(Icons.person, color: AppColors.primaryDark)),
                            const SizedBox(width: 12),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(profile?['full_name'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.bold)),
                              Text(profile?['role'] ?? '', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                              const SizedBox(height: 4),
                              Row(children: [
                                Text('\$${(r['amount'] ?? 0).toString()}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                                const SizedBox(width: 8),
                                if (r['period'] != null) Text(r['period'], style: const TextStyle(color: Colors.grey, fontSize: 12)),
                              ]),
                            ])),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(color: _statusColor(r['status']).withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                              child: Text(r['status'] ?? '', style: TextStyle(color: _statusColor(r['status']), fontSize: 12, fontWeight: FontWeight.w600)),
                            ),
                          ]),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _summaryTile(String label, String value, Color color) => Column(children: [
    Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
    Text(label, style: TextStyle(color: color.withOpacity(0.7), fontSize: 11)),
  ]);
}
