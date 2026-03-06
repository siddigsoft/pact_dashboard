import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';

class MonitoringPlanScreen extends StatefulWidget {
  const MonitoringPlanScreen({super.key});
  @override
  State<MonitoringPlanScreen> createState() => _MonitoringPlanScreenState();
}

class _MonitoringPlanScreenState extends State<MonitoringPlanScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _plans = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  bool _isOffline = false;
  String _filterStatus = 'all';
  String _searchQuery = '';
  int _page = 0;
  static const int _pageSize = 20;
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_onScroll);
    _loadPlans();
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

  Future<void> _loadPlans({bool refresh = false}) async {
    setState(() {
      _isLoading = true;
      if (refresh) { _page = 0; _hasMore = true; _plans = []; _isOffline = false; }
    });
    try {
      final data = await _supabase
          .from('monthly_monitoring_plans')
          .select('id, mmp_code, status, month, year, project_name, total_sites, covered_sites, created_at')
          .order('created_at', ascending: false)
          .range(0, _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      final box = await Hive.openBox('offline_cache');
      await box.put('monitoring_plans', data);
      if (!mounted) return;
      setState(() {
        _plans = list;
        _hasMore = list.length == _pageSize;
        _page = 0;
        _isLoading = false;
        _isOffline = false;
      });
    } catch (e) {
      if (!mounted) return;
      try {
        final box = await Hive.openBox('offline_cache');
        final cached = box.get('monitoring_plans');
        if (cached != null) {
          setState(() {
            _plans = List<Map<String, dynamic>>.from(
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
          .select('id, mmp_code, status, month, year, project_name, total_sites, covered_sites, created_at')
          .order('created_at', ascending: false)
          .range(offset, offset + _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      if (!mounted) return;
      setState(() {
        _plans.addAll(list);
        _hasMore = list.length == _pageSize;
        _page++;
        _isLoadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  List<Map<String, dynamic>> get _filtered => _plans.where((p) {
    final matchSearch = _searchQuery.isEmpty ||
        (p['mmp_code'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (p['project_name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase());
    final matchStatus = _filterStatus == 'all' || (p['status'] ?? '') == _filterStatus;
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

  double _coverage(Map<String, dynamic> p) {
    final total = (p['total_sites'] ?? 0) as num;
    final covered = (p['covered_sites'] ?? 0) as num;
    if (total <= 0) return 0.0;
    return (covered / total).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Monitoring Plans', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: () => _loadPlans(refresh: true))],
      ),
      body: Column(
        children: [
          if (_isOffline) const OfflineBanner(),
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.white,
            child: Column(children: [
              TextField(
                decoration: InputDecoration(hintText: 'Search MMPs...', prefixIcon: const Icon(Icons.search), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)), contentPadding: const EdgeInsets.symmetric(vertical: 8)),
                onChanged: (v) => setState(() => _searchQuery = v),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: ['all', 'active', 'submitted', 'approved', 'draft', 'closed'].map((s) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(label: Text(s), selected: _filterStatus == s, onSelected: (_) => setState(() => _filterStatus = s), selectedColor: AppColors.primaryDark.withOpacity(0.2)),
                )).toList()),
              ),
            ]),
          ),
          Expanded(
            child: _isLoading
                ? const ShimmerBody(layout: ShimmerLayout.mmp, listItems: 5)
                : filtered.isEmpty
                    ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        const Icon(Icons.assignment, size: 60, color: Colors.grey),
                        const SizedBox(height: 12),
                        Text(_plans.isEmpty ? 'No monitoring plans found.' : 'No matching plans.', style: const TextStyle(color: Colors.grey)),
                      ]))
                    : RefreshIndicator(
                        onRefresh: () => _loadPlans(refresh: true),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(12),
                          itemCount: filtered.length + (_isLoadingMore ? 1 : 0),
                          itemBuilder: (_, i) {
                            if (i == filtered.length) {
                              return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
                            }
                            final p = filtered[i];
                            final coverage = _coverage(p);
                            return Card(
                              margin: const EdgeInsets.only(bottom: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    Expanded(child: Text(p['mmp_code'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15))),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(color: _statusColor(p['status']).withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                                      child: Text(p['status'] ?? '', style: TextStyle(color: _statusColor(p['status']), fontSize: 12, fontWeight: FontWeight.w600)),
                                    ),
                                  ]),
                                  if (p['project_name'] != null) ...[const SizedBox(height: 2), Text(p['project_name'], style: TextStyle(color: Colors.grey.shade600, fontSize: 13))],
                                  if (p['month'] != null) ...[const SizedBox(height: 2), Text('Month: ${p['month']} / ${p['year']}', style: const TextStyle(fontSize: 13))],
                                  const SizedBox(height: 10),
                                  Row(children: [
                                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text('Coverage: ${(coverage * 100).toStringAsFixed(0)}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                      const SizedBox(height: 4),
                                      LinearProgressIndicator(value: coverage, backgroundColor: Colors.grey.shade200, valueColor: AlwaysStoppedAnimation<Color>(coverage > 0.8 ? Colors.green : coverage > 0.5 ? Colors.orange : Colors.red), minHeight: 6),
                                    ])),
                                    const SizedBox(width: 10),
                                    Text('${p['covered_sites'] ?? 0}/${p['total_sites'] ?? 0} sites', style: const TextStyle(fontSize: 12, color: Colors.grey)),
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
}
