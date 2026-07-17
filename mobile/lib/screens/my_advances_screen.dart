import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';

class MyAdvancesScreen extends StatefulWidget {
  const MyAdvancesScreen({super.key});
  @override
  State<MyAdvancesScreen> createState() => _MyAdvancesScreenState();
}

class _MyAdvancesScreenState extends State<MyAdvancesScreen> {
  final _supabase = Supabase.instance.client;
  bool _isLoading = true;
  List<Map<String, dynamic>> _advances = [];
  String _filterStatus = 'all';

  static const _statusLabels = {
    'pending': 'Pending',
    'approved': 'Approved',
    'paid': 'Paid',
    'rejected': 'Rejected',
    'cancelled': 'Cancelled',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      final data = await _supabase
          .from('down_payment_requests')
          .select('''
            id, amount_requested, currency, status,
            purpose, rejection_reason, project_id, created_at,
            project:projects(name)
          ''')
          .eq('submitted_by', user.id)
          .order('created_at', ascending: false);

      if (!mounted) return;
      setState(() {
        _advances = List<Map<String, dynamic>>.from(data);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_filterStatus == 'all') return _advances;
    return _advances.where((a) => a['status'] == _filterStatus).toList();
  }

  Color _statusColor(String? s) {
    switch (s) {
      case 'paid': return Colors.green;
      case 'approved': return const Color(0xFF1D6FA4);
      case 'pending': return Colors.orange;
      case 'rejected': return Colors.red;
      case 'cancelled': return Colors.grey;
      default: return Colors.grey;
    }
  }

  IconData _statusIcon(String? s) {
    switch (s) {
      case 'paid': return Icons.check_circle;
      case 'approved': return Icons.thumb_up_outlined;
      case 'pending': return Icons.hourglass_empty;
      case 'rejected': return Icons.cancel_outlined;
      default: return Icons.info_outline;
    }
  }

  Map<String, int> get _summary {
    return {
      'total': _advances.length,
      'pending': _advances.where((a) => a['status'] == 'pending').length,
      'paid': _advances.where((a) => a['status'] == 'paid').length,
      'rejected': _advances.where((a) => a['status'] == 'rejected').length,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'My Advances',
              showBackButton: true,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),

            if (!_isLoading && _advances.isNotEmpty)
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    _summaryChip('Total', _summary['total']!, Colors.grey),
                    const SizedBox(width: 8),
                    _summaryChip('Pending', _summary['pending']!, Colors.orange),
                    const SizedBox(width: 8),
                    _summaryChip('Paid', _summary['paid']!, Colors.green),
                    const SizedBox(width: 8),
                    _summaryChip('Rejected', _summary['rejected']!, Colors.red),
                  ],
                ),
              ),

            // Filter chips
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['all', 'pending', 'approved', 'paid', 'rejected']
                      .map((s) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text(
                                s == 'all' ? 'All' : _statusLabels[s] ?? s,
                                style: const TextStyle(fontSize: 12),
                              ),
                              selected: _filterStatus == s,
                              onSelected: (_) =>
                                  setState(() => _filterStatus = s),
                              selectedColor:
                                  AppColors.primaryDark.withOpacity(0.2),
                            ),
                          ))
                      .toList(),
                ),
              ),
            ),

            Expanded(
              child: _isLoading
                  ? const ShimmerBody(layout: ShimmerLayout.list, listItems: 6)
                  : _filtered.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.payments_outlined,
                                  size: 64, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              Text(
                                _filterStatus == 'all'
                                    ? 'No advance requests yet'
                                    : 'No ${_statusLabels[_filterStatus]} advances',
                                style: TextStyle(color: Colors.grey.shade600),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(14),
                            itemCount: _filtered.length,
                            itemBuilder: (_, i) {
                              final a = _filtered[i];
                              final project = a['project'] as Map<String, dynamic>?;
                              final amount = (a['amount_requested'] ?? 0) is num
                                  ? (a['amount_requested'] as num).toDouble()
                                  : double.tryParse(
                                          a['amount_requested']?.toString() ??
                                              '0') ??
                                      0;
                              final currency = a['currency'] ?? 'SDG';
                              final dateStr = (a['created_at'] as String?)
                                      ?.split('T')
                                      .first ??
                                  '';

                              return Card(
                                margin: const EdgeInsets.only(bottom: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(
                                    color: _statusColor(a['status'])
                                        .withOpacity(0.3),
                                  ),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.all(14),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Icon(
                                            _statusIcon(a['status']),
                                            color: _statusColor(a['status']),
                                            size: 20,
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              a['purpose'] ?? 'Advance Request',
                                              style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 14,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: _statusColor(a['status'])
                                                  .withOpacity(0.12),
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                            child: Text(
                                              _statusLabels[a['status']] ??
                                                  (a['status'] ?? ''),
                                              style: TextStyle(
                                                fontSize: 11,
                                                color:
                                                    _statusColor(a['status']),
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        '${amount.toStringAsFixed(0)} $currency',
                                        style: const TextStyle(
                                          fontSize: 20,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF1D6FA4),
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Row(
                                        children: [
                                          if (project != null) ...[
                                            Icon(Icons.folder_outlined,
                                                size: 13,
                                                color: Colors.grey.shade500),
                                            const SizedBox(width: 4),
                                            Text(
                                              project['name'] ?? '',
                                              style: TextStyle(
                                                  fontSize: 12,
                                                  color: Colors.grey.shade600),
                                            ),
                                            const SizedBox(width: 12),
                                          ],
                                          Icon(Icons.calendar_today,
                                              size: 13,
                                              color: Colors.grey.shade500),
                                          const SizedBox(width: 4),
                                          Text(
                                            dateStr,
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.grey.shade600),
                                          ),
                                        ],
                                      ),
                                      if (a['status'] == 'rejected' &&
                                          a['rejection_reason'] != null) ...[
                                        const SizedBox(height: 8),
                                        Container(
                                          padding: const EdgeInsets.all(8),
                                          decoration: BoxDecoration(
                                            color: Colors.red.shade50,
                                            borderRadius:
                                                BorderRadius.circular(6),
                                          ),
                                          child: Row(
                                            children: [
                                              const Icon(Icons.info_outline,
                                                  color: Colors.red, size: 14),
                                              const SizedBox(width: 6),
                                              Expanded(
                                                child: Text(
                                                  a['rejection_reason'],
                                                  style: const TextStyle(
                                                      fontSize: 12,
                                                      color: Colors.red),
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
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryChip(String label, int count, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color.withOpacity(0.3)),
    ),
    child: Text(
      '$label: $count',
      style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600),
    ),
  );
}
