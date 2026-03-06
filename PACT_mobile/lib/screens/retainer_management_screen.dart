import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';

class RetainerManagementScreen extends StatefulWidget {
  const RetainerManagementScreen({super.key});
  @override
  State<RetainerManagementScreen> createState() => _RetainerManagementScreenState();
}

class _RetainerManagementScreenState extends State<RetainerManagementScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _retainers = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  String _filterStatus = 'all';
  int _page = 0;
  static const int _pageSize = 20;
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_onScroll);
    _loadRetainers();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200 &&
        !_isLoadingMore && _hasMore) {
      _loadMore();
    }
  }

  Future<void> _loadRetainers({bool refresh = false}) async {
    setState(() {
      _isLoading = true;
      if (refresh) { _page = 0; _hasMore = true; _retainers = []; }
    });
    try {
      final data = await _supabase
          .from('retainer_payments')
          .select('*, user_profiles(full_name, role)')
          .order('created_at', ascending: false)
          .range(0, _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      if (!mounted) return;
      setState(() {
        _retainers = list;
        _hasMore = list.length == _pageSize;
        _page = 0;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore) return;
    setState(() => _isLoadingMore = true);
    try {
      final offset = (_page + 1) * _pageSize;
      final data = await _supabase
          .from('retainer_payments')
          .select('*, user_profiles(full_name, role)')
          .order('created_at', ascending: false)
          .range(offset, offset + _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      if (!mounted) return;
      setState(() {
        _retainers.addAll(list);
        _hasMore = list.length == _pageSize;
        _page++;
        _isLoadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  List<Map<String, dynamic>> get _filtered =>
      _filterStatus == 'all' ? _retainers : _retainers.where((r) => (r['status'] ?? '') == _filterStatus).toList();

  Color _statusColor(String? s) {
    switch (s) {
      case 'paid': return Colors.green;
      case 'pending': return Colors.orange;
      case 'processing': return Colors.blue;
      case 'rejected': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _retainers.fold(0.0, (sum, r) => sum + ((r['amount'] ?? 0) as num).toDouble());
    final paid = _retainers.where((r) => r['status'] == 'paid').fold(0.0, (sum, r) => sum + ((r['amount'] ?? 0) as num).toDouble());
    final filtered = _filtered;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Retainer Management', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: () => _loadRetainers(refresh: true))],
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
                ? const ShimmerBody(layout: ShimmerLayout.retainer, listItems: 5)
                : filtered.isEmpty
                    ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        const Icon(Icons.receipt_long, size: 60, color: Colors.grey),
                        const SizedBox(height: 12),
                        const Text('No retainer records found.', style: TextStyle(color: Colors.grey)),
                      ]))
                    : RefreshIndicator(
                        onRefresh: () => _loadRetainers(refresh: true),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(12),
                          itemCount: filtered.length + (_isLoadingMore ? 1 : 0),
                          itemBuilder: (_, i) {
                            if (i == filtered.length) {
                              return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
                            }
                            final r = filtered[i];
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
