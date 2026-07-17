// lib/screens/mmp_detail_screen.dart

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';
import 'mmp_state_report_screen.dart';

/// Read-only view of a single MMP: header info plus its site entries.
/// Verification/forwarding/permit workflows live in their own screens
/// (mmp_cycle_close_screen.dart, site_verification_screen.dart) — this is
/// just the "what's in this MMP and how far along is it" overview that
/// MmpManagementScreen's list used to fake with a SnackBar.
class MmpDetailScreen extends StatefulWidget {
  final String mmpId;

  const MmpDetailScreen({super.key, required this.mmpId});

  @override
  State<MmpDetailScreen> createState() => _MmpDetailScreenState();
}

class _MmpDetailScreenState extends State<MmpDetailScreen> {
  final _supabase = Supabase.instance.client;
  bool _loading = true;
  Map<String, dynamic>? _mmp;
  List<Map<String, dynamic>> _sites = [];
  _SiteBucketFilter _bucketFilter = _SiteBucketFilter.all;
  String? _rawStatusFilter;
  Map<String, String> _coordinatorNames = {};

  static String _normStatus(String? status) =>
      (status ?? '').trim().toLowerCase().replaceAll(' ', '_');

  bool _isUnclaimed(Map<String, dynamic> site) =>
      site['accepted_by'] == null && _normStatus(site['status'] as String?) == 'dispatched';

  bool _isCompleted(Map<String, dynamic> site) {
    final s = _normStatus(site['status'] as String?);
    return s == 'completed' ||
        s == 'complete' ||
        s == 'submitted' ||
        s == 'wfp_confirmed';
  }

  bool _isInProgress(Map<String, dynamic> site) =>
      !_isUnclaimed(site) && !_isCompleted(site);

  bool get _isFiltering =>
      _rawStatusFilter != null || _bucketFilter != _SiteBucketFilter.all;

  List<Map<String, dynamic>> get _filteredSites {
    if (_rawStatusFilter != null) {
      return _sites
          .where((site) => (site['status'] as String? ?? '') == _rawStatusFilter)
          .toList();
    }
    return _sites.where((site) {
      switch (_bucketFilter) {
        case _SiteBucketFilter.all:
          return true;
        case _SiteBucketFilter.unclaimed:
          return _isUnclaimed(site);
        case _SiteBucketFilter.inProgress:
          return _isInProgress(site);
        case _SiteBucketFilter.completed:
          return _isCompleted(site);
      }
    }).toList();
  }

  Map<String, int> get _statusCounts {
    final counts = <String, int>{};
    for (final site in _sites) {
      final label = site['status'] as String? ?? 'Unknown';
      counts[label] = (counts[label] ?? 0) + 1;
    }
    final sorted = Map.fromEntries(
      counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value)),
    );
    return sorted;
  }

  int get _unclaimedCount => _sites.where(_isUnclaimed).length;
  int get _inProgressCount => _sites.where(_isInProgress).length;
  int get _completedCount => _sites.where(_isCompleted).length;

  /// Sites grouped by state, in state-name order — mirrors the web app's
  /// "Coordinator Assignments" view (CoordinatorSummaryCard.tsx), which
  /// groups mmp_site_entries by state for per-coordinator oversight.
  Map<String, List<Map<String, dynamic>>> get _byState {
    final map = <String, List<Map<String, dynamic>>>{};
    for (final s in _sites) {
      final state = s['state'] as String? ?? 'Unknown';
      map.putIfAbsent(state, () => []).add(s);
    }
    return Map.fromEntries(
      map.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
  }

  Future<void> _loadCoordinatorNames(List<Map<String, dynamic>> sites) async {
    final ids = sites
        .map((s) => s['forwarded_to_user_id'] as String?)
        .whereType<String>()
        .toSet()
        .toList();
    if (ids.isEmpty) return;
    try {
      final data = await _supabase
          .from('profiles')
          .select('id, full_name')
          .inFilter('id', ids);
      _coordinatorNames = {
        for (final p in data as List)
          p['id'] as String: (p['full_name'] as String?) ?? 'Unknown',
      };
    } catch (_) {
      // Names are a display nicety; fall back to showing raw IDs.
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _supabase
            .from('mmp_files')
            .select(
              'id, name, mmp_id, status, month, hub, cycle_status, entries, processed_entries, project_id, projects(name)',
            )
            .eq('id', widget.mmpId)
            .single(),
        _supabase
            .from('mmp_site_entries')
            .select(
              'id, site_name, locality, state, status, accepted_by, forwarded_to_user_id, activity_at_site',
            )
            .eq('mmp_file_id', widget.mmpId)
            .order('site_name'),
      ]);
      if (!mounted) return;
      final sites = List<Map<String, dynamic>>.from(results[1] as List);
      await _loadCoordinatorNames(sites);
      if (!mounted) return;
      setState(() {
        _mmp = results[0] as Map<String, dynamic>;
        _sites = sites;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _statusColor(String? s) {
    final n = _normStatus(s);
    switch (n) {
      case 'dispatched':
        return Colors.orange;
      case 'completed':
      case 'complete':
      case 'submitted':
      case 'wfp_confirmed':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      case 'in_progress':
      case 'ongoing':
      case 'accepted':
      case 'assigned':
        return AppColors.primaryBlue;
      default:
        return AppColors.primaryBlue;
    }
  }

  void _setBucketFilter(_SiteBucketFilter filter) {
    setState(() {
      _bucketFilter = filter;
      _rawStatusFilter = null;
    });
  }

  void _setRawStatusFilter(String status) {
    setState(() {
      if (_rawStatusFilter == status) {
        _rawStatusFilter = null;
        _bucketFilter = _SiteBucketFilter.all;
      } else {
        _rawStatusFilter = status;
        _bucketFilter = _SiteBucketFilter.all;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: _mmp?['name'] as String? ?? 'MMP Detail',
              showBackButton: true,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _mmp == null
                  ? const Center(child: Text('Could not load this MMP.'))
                  : _buildBody(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    final mmp = _mmp!;
    final total = _sites.length;
    final unclaimed = _unclaimedCount;
    final inProgress = _inProgressCount;
    final completed = _completedCount;
    final covered = total - unclaimed;
    final coverage = total > 0 ? covered / total : 0.0;
    final projectName = (mmp['projects'] as Map<String, dynamic>?)?['name'] as String?;
    final filtered = _filteredSites;
    final statusCounts = _statusCounts;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          mmp['mmp_id'] as String? ?? mmp['id'] as String,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: _statusColor(mmp['status']).withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          mmp['status'] as String? ?? 'unknown',
                          style: TextStyle(
                            color: _statusColor(mmp['status']),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (projectName != null)
                    Text(projectName, style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      if (mmp['month'] != null) Text('Month: ${mmp['month']}'),
                      if (mmp['hub'] != null) Text('Hub: ${mmp['hub']}'),
                      if (mmp['cycle_status'] != null)
                        Text('Cycle: ${mmp['cycle_status']}'),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_sites.isNotEmpty) _buildCoordinatorAssignments(mmp),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'Total sites',
                  value: total,
                  selected: _bucketFilter == _SiteBucketFilter.all &&
                      _rawStatusFilter == null,
                  onTap: () => _setBucketFilter(_SiteBucketFilter.all),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Stat(
                  label: 'Unclaimed',
                  value: unclaimed,
                  color: Colors.orange,
                  selected: _bucketFilter == _SiteBucketFilter.unclaimed,
                  onTap: () => _setBucketFilter(_SiteBucketFilter.unclaimed),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _Stat(
                  label: 'In progress',
                  value: inProgress,
                  color: AppColors.primaryBlue,
                  selected: _bucketFilter == _SiteBucketFilter.inProgress,
                  onTap: () => _setBucketFilter(_SiteBucketFilter.inProgress),
                ),
              ),
            ],
          ),
          if (completed > 0) ...[
            const SizedBox(height: 8),
            _Stat(
              label: 'Completed',
              value: completed,
              color: Colors.green,
              selected: _bucketFilter == _SiteBucketFilter.completed,
              onTap: () => _setBucketFilter(_SiteBucketFilter.completed),
            ),
          ],
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: 'All',
                  count: total,
                  selected: _bucketFilter == _SiteBucketFilter.all &&
                      _rawStatusFilter == null,
                  onTap: () => _setBucketFilter(_SiteBucketFilter.all),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Unclaimed',
                  count: unclaimed,
                  selected: _bucketFilter == _SiteBucketFilter.unclaimed,
                  color: Colors.orange,
                  onTap: () => _setBucketFilter(_SiteBucketFilter.unclaimed),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'In progress',
                  count: inProgress,
                  selected: _bucketFilter == _SiteBucketFilter.inProgress,
                  onTap: () => _setBucketFilter(_SiteBucketFilter.inProgress),
                ),
                if (completed > 0) ...[
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Completed',
                    count: completed,
                    selected: _bucketFilter == _SiteBucketFilter.completed,
                    color: Colors.green,
                    onTap: () => _setBucketFilter(_SiteBucketFilter.completed),
                  ),
                ],
                ...statusCounts.entries.map(
                  (e) => Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: _FilterChip(
                      label: e.key,
                      count: e.value,
                      selected: _rawStatusFilter == e.key,
                      color: _statusColor(e.key),
                      onTap: () => _setRawStatusFilter(e.key),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (total > 0)
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: coverage,
                backgroundColor: Colors.grey.shade200,
                minHeight: 6,
              ),
            ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Site entries',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              if (_isFiltering)
                Text(
                  '${filtered.length} shown',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey.shade600,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (_sites.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('No site entries found for this MMP.'),
            )
          else if (filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'No sites match this filter.',
                style: TextStyle(color: Colors.grey.shade600),
              ),
            )
          else
            ...filtered.map(
              (s) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  dense: true,
                  title: Text(s['site_name'] as String? ?? 'Unnamed site'),
                  subtitle: Text(
                    s['locality'] as String? ?? s['state'] as String? ?? '',
                  ),
                  trailing: Text(
                    s['status'] as String? ?? '',
                    style: TextStyle(
                      color: _statusColor(s['status']),
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCoordinatorAssignments(Map<String, dynamic> mmp) {
    final mmpName = mmp['name'] as String? ?? mmp['mmp_id'] as String? ?? 'MMP';
    final states = _byState;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Coordinator Assignments',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        ...states.entries.map((entry) {
          final state = entry.key;
          final sites = entry.value;
          final total = sites.length;
          final done = sites.where(_isCompleted).length;

          final coordIds = sites
              .map((s) => s['forwarded_to_user_id'] as String?)
              .whereType<String>()
              .toSet();

          final statusTally = <String, int>{};
          for (final s in sites) {
            final label = s['status'] as String? ?? 'Unknown';
            statusTally[label] = (statusTally[label] ?? 0) + 1;
          }
          final topStatuses = statusTally.entries.toList()
            ..sort((a, b) => b.value.compareTo(a.value));

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.location_on, size: 16, color: AppColors.primaryBlue),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          state,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Text(
                        '$done/$total done',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: total > 0 ? done / total : 0,
                      backgroundColor: Colors.grey.shade200,
                      color: Colors.green,
                      minHeight: 5,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final s in topStatuses.take(4))
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: _statusColor(s.key).withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '${s.key}: ${s.value}',
                            style: TextStyle(
                              fontSize: 11,
                              color: _statusColor(s.key),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (coordIds.isEmpty)
                    Text(
                      'No coordinator assigned yet',
                      style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
                    )
                  else
                    ...coordIds.map(
                      (id) {
                        final count =
                            sites.where((s) => s['forwarded_to_user_id'] == id).length;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 2),
                          child: Row(
                            children: [
                              const Icon(Icons.person_outline, size: 14),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  _coordinatorNames[id] ?? id,
                                  style: const TextStyle(fontSize: 12),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Text(
                                '$count sites',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.description_outlined, size: 16),
                      label: const Text('Report'),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => MmpStateReportScreen(
                            mmpId: widget.mmpId,
                            mmpName: mmpName,
                            state: state,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}

enum _SiteBucketFilter { all, unclaimed, inProgress, completed }

class _Stat extends StatelessWidget {
  final String label;
  final int value;
  final Color? color;
  final bool selected;
  final VoidCallback? onTap;

  const _Stat({
    required this.label,
    required this.value,
    this.color,
    this.selected = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.textDark;
    final card = Card(
      elevation: selected ? 2 : 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: selected
            ? BorderSide(color: c, width: 1.5)
            : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(
          children: [
            Text(
              '$value',
              style: TextStyle(fontWeight: FontWeight.bold, color: c, fontSize: 18),
            ),
            Text(label, style: TextStyle(color: c, fontSize: 11)),
          ],
        ),
      ),
    );
    if (onTap == null) return card;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: card,
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final bool selected;
  final Color? color;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final accent = color ?? AppColors.primaryBlue;
    return FilterChip(
      label: Text('$label ($count)'),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: accent.withValues(alpha: 0.15),
      checkmarkColor: accent,
      labelStyle: TextStyle(
        color: selected ? accent : AppColors.textDark,
        fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
        fontSize: 12,
      ),
      side: BorderSide(
        color: selected ? accent : AppColors.borderColor,
      ),
    );
  }
}
