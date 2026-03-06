import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';

class MmpManagementScreen extends StatefulWidget {
  const MmpManagementScreen({super.key});
  @override
  State<MmpManagementScreen> createState() => _MmpManagementScreenState();
}

class _MmpManagementScreenState extends State<MmpManagementScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _mmps = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  bool _isOffline = false;
  String _filterStatus = 'all';
  String _searchQuery = '';
  int _page = 0;
  static const int _pageSize = 20;
  late final ScrollController _scrollController;

  final List<String> _statuses = ['all', 'draft', 'active', 'submitted', 'approved', 'closed', 'recalled'];

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_onScroll);
    _loadMMPs();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200 &&
        !_isLoadingMore && _hasMore && _searchQuery.isEmpty) {
      _loadMore();
    }
  }

  Future<void> _loadMMPs({bool refresh = false}) async {
    setState(() {
      _isLoading = true;
      if (refresh) { _page = 0; _hasMore = true; _mmps = []; _isOffline = false; }
    });
    try {
      final data = await _supabase
          .from('monthly_monitoring_plans')
          .select('id, mmp_code, status, month, year, project_name, total_sites, covered_sites, created_at, submitted_by')
          .order('created_at', ascending: false)
          .range(0, _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      final box = await Hive.openBox('offline_cache');
      await box.put('mmps', data);
      if (!mounted) return;
      setState(() {
        _mmps = list;
        _hasMore = list.length == _pageSize;
        _page = 0;
        _isLoading = false;
        _isOffline = false;
      });
    } catch (e) {
      if (!mounted) return;
      try {
        final box = await Hive.openBox('offline_cache');
        final cached = box.get('mmps');
        if (cached != null) {
          setState(() {
            _mmps = List<Map<String, dynamic>>.from(
                (cached as List).map((e) => Map<String, dynamic>.from(e)));
            _isLoading = false;
            _isOffline = true;
            _hasMore = false;
          });
          return;
        }
      } catch (_) {}
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore) return;
    setState(() => _isLoadingMore = true);
    try {
      final offset = (_page + 1) * _pageSize;
      final data = await _supabase
          .from('monthly_monitoring_plans')
          .select('id, mmp_code, status, month, year, project_name, total_sites, covered_sites, created_at, submitted_by')
          .order('created_at', ascending: false)
          .range(offset, offset + _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      if (!mounted) return;
      setState(() {
        _mmps.addAll(list);
        _hasMore = list.length == _pageSize;
        _page++;
        _isLoadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  List<Map<String, dynamic>> get _filtered => _mmps.where((m) {
    final matchSearch = _searchQuery.isEmpty ||
        (m['mmp_code'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (m['project_name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase());
    final matchStatus = _filterStatus == 'all' || (m['status'] ?? '') == _filterStatus;
    return matchSearch && matchStatus;
  }).toList();

  Color _statusColor(String? s) {
    switch (s) {
      case 'active': return Colors.green;
      case 'submitted': return Colors.blue;
      case 'approved': return Colors.teal;
      case 'draft': return Colors.orange;
      case 'closed': return Colors.grey;
      case 'recalled': return Colors.red;
      default: return Colors.grey;
    }
  }

  IconData _statusIcon(String? s) {
    switch (s) {
      case 'active': return Icons.play_circle;
      case 'submitted': return Icons.upload;
      case 'approved': return Icons.check_circle;
      case 'draft': return Icons.edit;
      case 'closed': return Icons.archive;
      case 'recalled': return Icons.undo;
      default: return Icons.assignment;
    }
  }

  Map<String, int> get _counts {
    final counts = <String, int>{'total': _mmps.length};
    for (final s in _statuses.where((s) => s != 'all')) {
      counts[s] = _mmps.where((m) => m['status'] == s).length;
    }
    return counts;
  }

  @override
  Widget build(BuildContext context) {
    final counts = _counts;
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('MMP Management', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: () => _loadMMPs(refresh: true))],
      ),
      body: Column(
        children: [
          if (_isOffline) const OfflineBanner(),
          Container(
            height: 80,
            color: AppColors.primaryDark.withOpacity(0.05),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              children: [
                _statPill('Total', counts['total'] ?? 0, Colors.blueGrey),
                _statPill('Active', counts['active'] ?? 0, Colors.green),
                _statPill('Submitted', counts['submitted'] ?? 0, Colors.blue),
                _statPill('Approved', counts['approved'] ?? 0, Colors.teal),
                _statPill('Draft', counts['draft'] ?? 0, Colors.orange),
                _statPill('Closed', counts['closed'] ?? 0, Colors.grey),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(12), color: Colors.white,
            child: Column(children: [
              TextField(
                decoration: InputDecoration(hintText: 'Search MMPs...', prefixIcon: const Icon(Icons.search), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)), contentPadding: const EdgeInsets.symmetric(vertical: 8)),
                onChanged: (v) => setState(() => _searchQuery = v),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: _statuses.map((s) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(label: Text(s == 'all' ? 'All' : s), selected: _filterStatus == s, onSelected: (_) => setState(() => _filterStatus = s), selectedColor: AppColors.primaryDark.withOpacity(0.2)),
                )).toList()),
              ),
            ]),
          ),
          Expanded(
            child: _isLoading
                ? const ShimmerBody(listItems: 5)
                : filtered.isEmpty
                    ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        const Icon(Icons.assignment, size: 60, color: Colors.grey),
                        const SizedBox(height: 12),
                        const Text('No MMPs found.', style: TextStyle(color: Colors.grey)),
                      ]))
                    : RefreshIndicator(
                        onRefresh: () => _loadMMPs(refresh: true),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(12),
                          itemCount: filtered.length + (_isLoadingMore ? 1 : 0),
                          itemBuilder: (_, i) {
                            if (i == filtered.length) {
                              return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
                            }
                            final m = filtered[i];
                            final total = (m['total_sites'] ?? 0) as num;
                            final covered = (m['covered_sites'] ?? 0) as num;
                            final coverage = total > 0 ? (covered / total).clamp(0.0, 1.0) : 0.0;
                            return Card(
                              margin: const EdgeInsets.only(bottom: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(10),
                                onTap: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('MMP: ${m["mmp_code"] ?? ""}'))),
                                child: Padding(
                                  padding: const EdgeInsets.all(14),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Row(children: [
                                      Icon(_statusIcon(m['status']), color: _statusColor(m['status']), size: 20),
                                      const SizedBox(width: 8),
                                      Expanded(child: Text(m['mmp_code'] ?? 'Unknown MMP', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15))),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(color: _statusColor(m['status']).withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                                        child: Text(m['status'] ?? '', style: TextStyle(color: _statusColor(m['status']), fontSize: 12, fontWeight: FontWeight.w600)),
                                      ),
                                    ]),
                                    if (m['project_name'] != null) ...[const SizedBox(height: 3), Text(m['project_name'], style: TextStyle(color: Colors.grey.shade600, fontSize: 13))],
                                    if (m['month'] != null) ...[const SizedBox(height: 2), Text('${m['month']} / ${m['year'] ?? ''}', style: const TextStyle(fontSize: 12, color: Colors.grey))],
                                    if (total > 0) ...[
                                      const SizedBox(height: 10),
                                      LinearProgressIndicator(value: coverage, backgroundColor: Colors.grey.shade200, valueColor: AlwaysStoppedAnimation<Color>(coverage > 0.8 ? Colors.green : coverage > 0.5 ? Colors.orange : Colors.red), minHeight: 5),
                                      const SizedBox(height: 3),
                                      Text('Coverage: ${(coverage * 100).toStringAsFixed(0)}% ($covered/$total sites)', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                    ],
                                  ]),
                                ),
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

  Widget _statPill(String label, int count, Color color) => Container(
    margin: const EdgeInsets.only(right: 8),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.3))),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Text('$count', style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16)),
      Text(label, style: TextStyle(fontSize: 10, color: color)),
    ]),
  );
}
