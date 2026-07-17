// lib/screens/mmp_management_screen.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';
import 'mmp_detail_screen.dart';

class MmpManagementScreen extends StatefulWidget {
  const MmpManagementScreen({super.key});
  @override
  State<MmpManagementScreen> createState() => _MmpManagementScreenState();
}

class _MmpManagementScreenState extends State<MmpManagementScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _mmps = [];
  bool _isLoading = true;
  bool _isOffline = false;
  String _filterStatus = 'all';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadMMPs();
  }

  // ponytail: status is freeform text in the DB (no enum/check constraint),
  // so the filter chips are derived from whatever values actually show up
  // instead of a hardcoded guess that drifts out of sync with real data.
  List<String> get _statuses => [
    'all',
    ..._mmps.map((m) => m['status'] as String? ?? 'unknown').toSet(),
  ];

  Future<void> _loadMMPs() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase
          .from('mmp_files')
          .select(
            'id, name, mmp_id, status, month, hub, cycle_status, entries, processed_entries, project_id, projects(name)',
          )
          .order('created_at', ascending: false)
          .limit(200);
      final mmps = List<Map<String, dynamic>>.from(data);
      await _attachCoverage(mmps);

      final box = await Hive.openBox('offline_cache');
      await box.put('mmps', mmps);
      if (!mounted) return;
      setState(() {
        _mmps = mmps;
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
          });
          return;
        }
      } catch (_) {}
      setState(() => _isLoading = false);
    }
  }

  /// Real site-visit coverage (claimed/dispatched/etc. vs total), since the
  /// mmp_files.entries/processed_entries columns only reflect import parsing,
  /// not field progress. Falls back to those columns if no entries are found.
  Future<void> _attachCoverage(List<Map<String, dynamic>> mmps) async {
    if (mmps.isEmpty) return;
    try {
      final ids = mmps.map((m) => m['id']).toList();
      final entries = await _supabase
          .from('mmp_site_entries')
          .select('mmp_file_id, status')
          .inFilter('mmp_file_id', ids);
      final byMmp = <String, List<String?>>{};
      for (final e in entries as List) {
        final id = e['mmp_file_id'] as String?;
        if (id == null) continue;
        byMmp.putIfAbsent(id, () => []).add(e['status'] as String?);
      }
      for (final m in mmps) {
        final statuses = byMmp[m['id']];
        if (statuses == null || statuses.isEmpty) {
          m['_total'] = (m['entries'] as num?)?.toInt() ?? 0;
          m['_covered'] = (m['processed_entries'] as num?)?.toInt() ?? 0;
        } else {
          m['_total'] = statuses.length;
          m['_covered'] = statuses
              .where((s) => (s ?? '').toLowerCase() != 'dispatched')
              .length;
        }
      }
    } catch (_) {
      // Coverage is a nice-to-have; fall back to the raw columns silently.
      for (final m in mmps) {
        m['_total'] = (m['entries'] as num?)?.toInt() ?? 0;
        m['_covered'] = (m['processed_entries'] as num?)?.toInt() ?? 0;
      }
    }
  }

  List<Map<String, dynamic>> get _filtered => _mmps.where((m) {
    final matchSearch =
        _searchQuery.isEmpty ||
        (m['mmp_id'] ?? '').toString().toLowerCase().contains(
          _searchQuery.toLowerCase(),
        ) ||
        (m['name'] ?? '').toString().toLowerCase().contains(
          _searchQuery.toLowerCase(),
        );
    final matchStatus =
        _filterStatus == 'all' || (m['status'] ?? 'unknown') == _filterStatus;
    return matchSearch && matchStatus;
  }).toList();

  Color _statusColor(String? s) {
    switch ((s ?? '').toLowerCase()) {
      case 'approved':
        return Colors.green;
      case 'forwarded_to_coordinator':
        return Colors.blue;
      case 'draft':
        return Colors.orange;
      case 'rejected':
        return Colors.red;
      case 'closed':
        return Colors.grey;
      default:
        return Colors.blueGrey;
    }
  }

  IconData _statusIcon(String? s) {
    switch ((s ?? '').toLowerCase()) {
      case 'approved':
        return Icons.check_circle;
      case 'forwarded_to_coordinator':
        return Icons.forward_to_inbox;
      case 'draft':
        return Icons.edit;
      case 'rejected':
        return Icons.cancel;
      case 'closed':
        return Icons.archive;
      default:
        return Icons.assignment;
    }
  }

  Map<String, int> get _counts {
    final counts = <String, int>{'total': _mmps.length};
    for (final s in _statuses.where((s) => s != 'all')) {
      counts[s] = _mmps.where((m) => (m['status'] ?? 'unknown') == s).length;
    }
    return counts;
  }

  @override
  Widget build(BuildContext context) {
    final counts = _counts;
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'MMP Management',
              showBackButton: true,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _loadMMPs,
                ),
              ],
            ),
            if (_isOffline) const OfflineBanner(),
            Container(
              height: 100,
              color: AppColors.primaryDark.withValues(alpha: 0.05),
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                children: [
                  _statPill('Total', counts['total'] ?? 0, Colors.blueGrey),
                  for (final s in _statuses.where((s) => s != 'all'))
                    _statPill(s, counts[s] ?? 0, _statusColor(s)),
                ],
              ),
            ),
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
                                selectedColor: AppColors.primaryDark
                                    .withValues(alpha: 0.2),
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
                      onRefresh: _loadMMPs,
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        itemCount: filtered.length,
                        itemBuilder: (_, i) {
                          final m = filtered[i];
                          final total = (m['_total'] as int?) ?? 0;
                          final covered = (m['_covered'] as int?) ?? 0;
                          final coverage = total > 0
                              ? (covered / total).clamp(0.0, 1.0)
                              : 0.0;
                          final projectName =
                              (m['projects'] as Map<String, dynamic>?)?['name']
                                  as String?;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: Card(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 2,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(12),
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        MmpDetailScreen(mmpId: m['id'] as String),
                                  ),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.all(10),
                                            decoration: BoxDecoration(
                                              color: _statusColor(m['status'])
                                                  .withValues(alpha: 0.1),
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
                                                  m['name'] as String? ??
                                                      m['mmp_id'] as String? ??
                                                      'Unnamed MMP',
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 15,
                                                  ),
                                                ),
                                                if (projectName != null) ...[
                                                  const SizedBox(height: 2),
                                                  Text(
                                                    projectName,
                                                    style: TextStyle(
                                                      color:
                                                          Colors.grey.shade600,
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
                                              color: _statusColor(m['status'])
                                                  .withValues(alpha: 0.12),
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: Text(
                                              m['status'] as String? ??
                                                  'unknown',
                                              style: TextStyle(
                                                color: _statusColor(
                                                  m['status'],
                                                ),
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
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
                                                '${m['month']}${m['hub'] != null ? ' · ${m['hub']}' : ''}',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: Colors.grey.shade600,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
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
                                            backgroundColor:
                                                Colors.grey.shade200,
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
      color: color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: color.withValues(alpha: 0.25), width: 1.5),
      boxShadow: [
        BoxShadow(
          color: color.withValues(alpha: 0.1),
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
