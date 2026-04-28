import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';

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

  final List<String> _statuses = [
    'all',
    'draft',
    'active',
    'submitted',
    'approved',
    'closed',
    'recalled',
  ];

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
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200 &&
        !_isLoadingMore &&
        _hasMore &&
        _searchQuery.isEmpty) {
      _loadMore();
    }
  }

  Future<void> _loadMMPs({bool refresh = false}) async {
    setState(() {
      _isLoading = true;
      if (refresh) {
        _page = 0;
        _hasMore = true;
        _mmps = [];
        _isOffline = false;
      }
    });
    try {
      final data = await _supabase
          .from('monthly_monitoring_plans')
          .select(
            'id, mmp_code, status, month, year, project_name, total_sites, covered_sites, created_at, submitted_by',
          )
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
              (cached as List).map((e) => Map<String, dynamic>.from(e)),
            );
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
          .select(
            'id, mmp_code, status, month, year, project_name, total_sites, covered_sites, created_at, submitted_by',
          )
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
    final matchSearch =
        _searchQuery.isEmpty ||
        (m['mmp_code'] ?? '').toLowerCase().contains(
          _searchQuery.toLowerCase(),
        ) ||
        (m['project_name'] ?? '').toLowerCase().contains(
          _searchQuery.toLowerCase(),
        );
    final matchStatus =
        _filterStatus == 'all' || (m['status'] ?? '') == _filterStatus;
    return matchSearch && matchStatus;
  }).toList();

  Color _statusColor(String? s) {
    switch (s) {
      case 'active':
        return Colors.green;
      case 'submitted':
        return Colors.blue;
      case 'approved':
        return Colors.teal;
      case 'draft':
        return Colors.orange;
      case 'closed':
        return Colors.grey;
      case 'recalled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  IconData _statusIcon(String? s) {
    switch (s) {
      case 'active':
        return Icons.play_circle;
      case 'submitted':
        return Icons.upload;
      case 'approved':
        return Icons.check_circle;
      case 'draft':
        return Icons.edit;
      case 'closed':
        return Icons.archive;
      case 'recalled':
        return Icons.undo;
      default:
        return Icons.assignment;
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _loadMMPs(refresh: true),
        backgroundColor: AppColors.primaryDark,
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        label: const Text(
          'New MMP',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'MMP Management',
              showBackButton: true,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: () => _loadMMPs(refresh: true),
                ),
              ],
            ),
          if (_isOffline) const OfflineBanner(),
          // ── Status Summary Row ──────────────────────────────────────
          Container(
            height: 100,
            color: AppColors.primaryDark.withOpacity(0.05),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
          // ── Search & Filter Section ─────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            color: Colors.white,
            child: Column(
              children: [
                TextField(
                  decoration: InputDecoration(
                    hintText: 'Search MMPs...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      vertical: 12,
                      horizontal: 14,
                    ),
                    filled: true,
                    fillColor: Colors.grey.shade50,
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _statuses
                        .map(
                          (s) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text(s == 'all' ? 'All' : s),
                              selected: _filterStatus == s,
                              onSelected: (_) =>
                                  setState(() => _filterStatus = s),
                              selectedColor: AppColors.primaryDark.withOpacity(
                                0.2,
                              ),
                              backgroundColor: Colors.grey.shade100,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _isLoading
                ? const ShimmerBody(layout: ShimmerLayout.mmp, listItems: 5)
                : filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.assignment,
                          size: 64,
                          color: Colors.grey,
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'No MMPs found.',
                          style: TextStyle(color: Colors.grey, fontSize: 16),
                        ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: () => _loadMMPs(refresh: true),
                    child: ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      itemCount: filtered.length + (_isLoadingMore ? 1 : 0),
                      itemBuilder: (_, i) {
                        if (i == filtered.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 20),
                            child: Center(
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          );
                        }
                        final m = filtered[i];
                        final total = (m['total_sites'] ?? 0) as num;
                        final covered = (m['covered_sites'] ?? 0) as num;
                        final coverage = total > 0
                            ? (covered / total).clamp(0.0, 1.0)
                            : 0.0;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: Card(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            elevation: 2,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () =>
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        'MMP: ${m["mmp_code"] ?? ""}',
                                      ),
                                    ),
                                  ),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    // ── Header Row ──────────────────────
                                    Row(
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.all(10),
                                          decoration: BoxDecoration(
                                            color: _statusColor(
                                              m['status'],
                                            ).withOpacity(0.1),
                                            shape: BoxShape.circle,
                                          ),
                                          child: Icon(
                                            _statusIcon(m['status']),
                                            color: _statusColor(m['status']),
                                            size: 18,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                m['mmp_code'] ?? 'Unknown MMP',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 15,
                                                ),
                                              ),
                                              if (m['project_name'] !=
                                                  null) ...[
                                                const SizedBox(height: 2),
                                                Text(
                                                  m['project_name'],
                                                  style: TextStyle(
                                                    color: Colors.grey.shade600,
                                                    fontSize: 13,
                                                  ),
                                                ),
                                              ],
                                            ],
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 6,
                                          ),
                                          decoration: BoxDecoration(
                                            color: _statusColor(
                                              m['status'],
                                            ).withOpacity(0.12),
                                            borderRadius: BorderRadius.circular(
                                              12,
                                            ),
                                          ),
                                          child: Text(
                                            m['status'] ?? '',
                                            style: TextStyle(
                                              color: _statusColor(m['status']),
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),

                                    const SizedBox(height: 12),

                                    // ── Meta Info Row ────────────────────
                                    if (m['month'] != null)
                                      Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: 12,
                                        ),
                                        child: Row(
                                          children: [
                                            Icon(
                                              Icons.calendar_today,
                                              size: 14,
                                              color: Colors.grey.shade500,
                                            ),
                                            const SizedBox(width: 6),
                                            Text(
                                              '${m['month']} / ${m['year'] ?? ''}',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.grey.shade600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),

                                    // ── Coverage Progress ─────────────────
                                    if (total > 0) ...[
                                      Text(
                                        'Coverage: ${(coverage * 100).toStringAsFixed(0)}% ($covered/$total sites)',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade600,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(6),
                                        child: LinearProgressIndicator(
                                          value: coverage,
                                          backgroundColor: Colors.grey.shade200,
                                          valueColor:
                                              AlwaysStoppedAnimation<Color>(
                                                coverage > 0.8
                                                    ? Colors.green
                                                    : coverage > 0.5
                                                    ? Colors.orange
                                                    : Colors.red,
                                              ),
                                          minHeight: 6,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
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

  Widget _statPill(String label, int count, Color color) => Container(
    margin: const EdgeInsets.only(right: 10),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: color.withOpacity(0.25), width: 1.5),
      boxShadow: [
        BoxShadow(
          color: color.withOpacity(0.1),
          blurRadius: 8,
          offset: const Offset(0, 2),
        ),
      ],
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          '$count',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: color,
            fontSize: 18,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}
