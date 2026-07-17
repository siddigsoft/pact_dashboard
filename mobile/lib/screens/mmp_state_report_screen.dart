// lib/screens/mmp_state_report_screen.dart

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';

/// Per-state operational report for an MMP. Mirrors the web app's
/// MmpStateReport.tsx (F:\tpm-workflow\src\components\mmp\MmpStateReport.tsx,
/// master branch) status-bucketing, financial-summary, activity-type-split,
/// cycle-timeline and attention-item logic exactly, so the numbers a
/// supervisor sees on mobile match what they'd see on web for the same
/// state. Rendered as mobile lists/cards rather than the web's wide data
/// tables, but the underlying data and thresholds are the same.
class MmpStateReportScreen extends StatefulWidget {
  final String mmpId;
  final String mmpName;
  final String state;

  const MmpStateReportScreen({
    super.key,
    required this.mmpId,
    required this.mmpName,
    required this.state,
  });

  @override
  State<MmpStateReportScreen> createState() => _MmpStateReportScreenState();
}

class _Site {
  final String id;
  final String siteName;
  final String siteCode;
  final String locality;
  final String activityType;
  final String status;
  final String category; // verified | awaiting_dispatch | in_progress | returned | rejected | pending
  final String coordinatorName;
  final String dataCollectorName;
  final int daysInCurrentStatus;
  final String nextStep;
  final String? dispatchedAt;
  final String? acceptedAt;
  final String? verifiedAt;
  final String? visitCompletedAt;
  final String? advanceStatus;
  final double advanceRequested;
  final double advanceApproved;
  final double advancePaid;

  _Site({
    required this.id,
    required this.siteName,
    required this.siteCode,
    required this.locality,
    required this.activityType,
    required this.status,
    required this.category,
    required this.coordinatorName,
    required this.dataCollectorName,
    required this.daysInCurrentStatus,
    required this.nextStep,
    this.dispatchedAt,
    this.acceptedAt,
    this.verifiedAt,
    this.visitCompletedAt,
    this.advanceStatus,
    this.advanceRequested = 0,
    this.advanceApproved = 0,
    this.advancePaid = 0,
  });
}

class _MmpStateReportScreenState extends State<MmpStateReportScreen>
    with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  late final TabController _tabController;
  bool _loading = true;
  List<_Site> _sites = [];
  List<Map<String, dynamic>> _advances = [];
  List<Map<String, dynamic>> _auditRows = [];
  String _cycleStatus = 'active';

  // Exact status sets from MmpStateReport.tsx (web, master branch).
  static const _verified = {
    'verified', 'approved', 'approved and costed', 'costed',
    'completed', 'wfp_confirmed', 'submitted', 'submitted_for_review', 'cp_verified',
  };
  static const _awaitingDispatch = {
    'forwarded', 'forwarded_to_fom', 'forwarded_fom',
    'forwarded_to_coordinator', 'forwarded_to_coordinators',
    'assigned', 'with_coordinators',
  };
  static const _inProgress = {
    'dispatched', 'accepted', 'claimed', 'ongoing', 'site_claim',
    'in_progress', 'inprogress', 'permits_attached', 'acknowledged',
  };
  static const _returned = {
    'returned', 'returned_to_fom', 'recalled', 'sent_back', 'sent_back_to_fom',
  };

  static String _category(String status) {
    final s = status.toLowerCase().trim();
    if (_verified.contains(s)) return 'verified';
    if (_returned.contains(s)) return 'returned';
    if (s == 'rejected' || s == 'declined') return 'rejected';
    if (_awaitingDispatch.contains(s)) return 'awaiting_dispatch';
    if (_inProgress.contains(s)) return 'in_progress';
    return 'pending';
  }

  static String _nextStep(String status) {
    final s = status.toLowerCase().trim();
    if (_verified.contains(s)) return 'No action needed — complete';
    if (s == 'submitted' || s == 'submitted_for_review') {
      return 'Supervisor: verify and approve the submitted data';
    }
    if ([
      'pending', '', 'not_covered', 'new', 'cancelled', 'written_off',
    ].contains(s)) {
      return 'FOM / Coordinator: assign a coordinator and dispatch';
    }
    if (s == 'forwarded_to_fom' || s == 'forwarded_fom') {
      return 'FOM: review and forward to coordinator for dispatch';
    }
    if (_awaitingDispatch.contains(s)) {
      return 'Coordinator: dispatch site to a data collector';
    }
    if (s == 'dispatched') return 'Collector: accept the site assignment on mobile';
    if (s == 'accepted' || s == 'acknowledged') return 'Collector: start the site visit';
    if (s == 'claimed' || s == 'site_claim') {
      return 'Collector: complete the visit and submit for verification';
    }
    if (['in_progress', 'inprogress', 'ongoing', 'permits_attached'].contains(s)) {
      return 'Collector: complete visit and submit for verification';
    }
    if (_returned.contains(s)) return 'Coordinator: review the return reason and re-dispatch';
    if (s == 'rejected' || s == 'declined') return 'Manager: escalate, reassign or close the site';
    return 'Review status with field team';
  }

  static int _daysSince(String? iso) {
    if (iso == null) return 0;
    final d = DateTime.tryParse(iso);
    if (d == null) return 0;
    return DateTime.now().difference(d).inDays;
  }

  static String _latest(List<String?> dates) {
    final valid = dates.whereType<String>().toList()..sort();
    return valid.isEmpty ? '' : valid.last;
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final rawSites = await _supabase
          .from('mmp_site_entries')
          .select(
            'id, site_name, site_code, locality, status, accepted_by, claimed_by, '
            'visit_started_by, forwarded_to_user_id, dispatched_at, accepted_at, '
            'visit_started_at, visit_completed_at, verified_at, activity_at_site, '
            'main_activity, additional_data',
          )
          .eq('mmp_file_id', widget.mmpId)
          .ilike('state', '%${widget.state}%');
      final entries = List<Map<String, dynamic>>.from(rawSites);
      final siteIds = entries.map((e) => e['id'] as String).toList();

      List<Map<String, dynamic>> advances = [];
      List<Map<String, dynamic>> auditRows = [];
      String cycleStatus = 'active';
      if (siteIds.isNotEmpty) {
        final results = await Future.wait([
          _supabase
              .from('down_payment_requests')
              .select(
                'id, mmp_site_entry_id, status, requested_amount, approved_amount, total_paid_amount, requested_at',
              )
              .inFilter('mmp_site_entry_id', siteIds),
          _supabase
              .from('audit_logs')
              .select('entity_id, entity_name, actor_id, actor_name, action, description, changes, timestamp')
              .inFilter('entity_id', siteIds)
              .eq('module', 'mmp')
              .order('timestamp', ascending: true),
          _supabase.from('mmp_files').select('cycle_status').eq('id', widget.mmpId).maybeSingle(),
        ]);
        advances = List<Map<String, dynamic>>.from(results[0] as List);
        auditRows = List<Map<String, dynamic>>.from(results[1] as List);
        final cycleRow = results[2] as Map<String, dynamic>?;
        cycleStatus = cycleRow?['cycle_status'] as String? ?? 'active';
      }

      // Most recent down-payment request per site (mirrors get_advance_coverage_data's
      // "ORDER BY created_at DESC LIMIT 1" — here we just pick the latest by requested_at).
      final advanceBySite = <String, Map<String, dynamic>>{};
      for (final a in advances) {
        final siteId = a['mmp_site_entry_id'] as String?;
        if (siteId == null) continue;
        final existing = advanceBySite[siteId];
        if (existing == null ||
            ((a['requested_at'] as String?) ?? '').compareTo((existing['requested_at'] as String?) ?? '') > 0) {
          advanceBySite[siteId] = a;
        }
      }

      // Resolve coordinator / collector display names via profiles.
      final ids = <String>{};
      final isUuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', caseSensitive: false);
      for (final e in entries) {
        for (final key in ['forwarded_to_user_id', 'accepted_by', 'claimed_by', 'visit_started_by']) {
          final v = e[key];
          if (v is String && isUuid.hasMatch(v)) ids.add(v);
        }
      }
      var names = <String, String>{};
      if (ids.isNotEmpty) {
        final profiles = await _supabase.from('profiles').select('id, full_name').inFilter('id', ids.toList());
        names = {
          for (final p in profiles as List) p['id'] as String: (p['full_name'] as String?) ?? 'Unknown',
        };
      }

      final sites = entries.map((e) {
        final status = (e['status'] as String? ?? '').toLowerCase().trim();
        final category = _category(status);
        final ad = (e['additional_data'] is Map) ? e['additional_data'] as Map : const {};

        final coordId = e['forwarded_to_user_id'] as String?;
        final coordinatorName = (coordId != null ? names[coordId] : null) ?? '—';

        final collectorRaw = (e['accepted_by'] as String?) ??
            (e['claimed_by'] as String?) ??
            (e['visit_started_by'] as String?);
        final dataCollectorName = collectorRaw == null
            ? '—'
            : (isUuid.hasMatch(collectorRaw)
                ? (names[collectorRaw] ?? 'ID:${collectorRaw.substring(0, 8)}')
                : collectorRaw);

        final latestTs = _latest([
          e['dispatched_at'] as String?,
          e['accepted_at'] as String?,
          e['visit_started_at'] as String?,
          e['visit_completed_at'] as String?,
          e['verified_at'] as String?,
        ]);

        final activityType = (() {
          final draftTypes = ad['draft_activity_types'];
          if (draftTypes is List && draftTypes.isNotEmpty) {
            return draftTypes.whereType<String>().join(' / ');
          }
          return (e['main_activity'] as String?) ??
              (e['activity_at_site'] as String?) ??
              (ad['activity_type'] as String?) ??
              '';
        })();

        final advance = advanceBySite[e['id']];

        return _Site(
          id: e['id'] as String,
          siteName: (e['site_name'] as String?)?.trim() ?? 'Unknown',
          siteCode: e['site_code'] as String? ?? '',
          locality: (e['locality'] as String?)?.trim() ?? '',
          activityType: activityType,
          status: status.isEmpty ? 'unknown' : status,
          category: category,
          coordinatorName: coordinatorName,
          dataCollectorName: dataCollectorName,
          daysInCurrentStatus: _daysSince(latestTs.isEmpty ? null : latestTs),
          nextStep: _nextStep(status),
          dispatchedAt: e['dispatched_at'] as String?,
          acceptedAt: e['accepted_at'] as String?,
          verifiedAt: e['verified_at'] as String?,
          visitCompletedAt: e['visit_completed_at'] as String?,
          advanceStatus: advance?['status'] as String?,
          advanceRequested: (advance?['requested_amount'] as num?)?.toDouble() ?? 0,
          advanceApproved: (advance?['approved_amount'] as num?)?.toDouble() ?? 0,
          advancePaid: (advance?['total_paid_amount'] as num?)?.toDouble() ?? 0,
        );
      }).toList();

      if (!mounted) return;
      setState(() {
        _sites = sites;
        _advances = advances;
        _auditRows = auditRows;
        _cycleStatus = cycleStatus;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Derived: cycle summary ──────────────────────────────────────────────
  Map<String, int> get _cycleCounts {
    final c = <String, int>{
      'verified': 0, 'awaiting_dispatch': 0, 'in_progress': 0,
      'returned': 0, 'rejected': 0, 'pending': 0,
    };
    for (final s in _sites) {
      c[s.category] = (c[s.category] ?? 0) + 1;
    }
    return c;
  }

  /// Sites whose status is in_progress or verified but have no live advance
  /// (none requested, or the last one was cancelled/rejected).
  int get _missingAdvanceCount => _sites
      .where((s) =>
          (s.category == 'in_progress' || s.category == 'verified') &&
          (s.advanceStatus == null || s.advanceStatus!.isEmpty ||
              const {'cancelled', 'rejected'}.contains(s.advanceStatus)))
      .length;

  List<MapEntry<String, List<_Site>>> get _activityTypeBreakdown {
    final map = <String, List<_Site>>{};
    for (final s in _sites) {
      final raw = s.activityType;
      final types = raw.isEmpty
          ? ['Unspecified']
          : raw.split('/').map((t) => t.trim()).where((t) => t.isNotEmpty).toList();
      for (final t in types) {
        map.putIfAbsent(t, () => []).add(s);
      }
    }
    final entries = map.entries.toList()..sort((a, b) => b.value.length.compareTo(a.value.length));
    return entries;
  }

  List<MapEntry<String, String>> get _cycleTimeline {
    final events = <MapEntry<String, String>>[];
    String? firstOf(String? Function(_Site) pick) {
      final values = _sites.map(pick).whereType<String>().toList()..sort();
      return values.isEmpty ? null : values.first;
    }
    String? lastOf(String? Function(_Site) pick) {
      final values = _sites.map(pick).whereType<String>().toList()..sort();
      return values.isEmpty ? null : values.last;
    }
    String fmt(String iso) {
      final d = DateTime.tryParse(iso);
      return d == null ? iso : DateFormat('MMM d, yyyy HH:mm').format(d);
    }
    final dispatched = firstOf((s) => s.dispatchedAt);
    final accepted = firstOf((s) => s.acceptedAt);
    final completed = firstOf((s) => s.visitCompletedAt);
    final firstVerified = firstOf((s) => s.verifiedAt);
    final lastVerified = lastOf((s) => s.verifiedAt);
    if (dispatched != null) events.add(MapEntry('First site dispatched', fmt(dispatched)));
    if (accepted != null) events.add(MapEntry('First site accepted by collector', fmt(accepted)));
    if (completed != null) events.add(MapEntry('First visit completed', fmt(completed)));
    if (firstVerified != null) events.add(MapEntry('First site verified', fmt(firstVerified)));
    if (lastVerified != null) events.add(MapEntry('Last site verified', fmt(lastVerified)));
    return events;
  }

  // ── Derived: coordinators / collectors ──────────────────────────────────
  List<Map<String, dynamic>> get _coordinatorRows {
    final map = <String, List<_Site>>{};
    for (final s in _sites) {
      final name = s.coordinatorName == '—' ? 'Unassigned' : s.coordinatorName;
      map.putIfAbsent(name, () => []).add(s);
    }
    final rows = map.entries.map((e) {
      final sites = e.value;
      return {
        'name': e.key,
        'assigned': sites.length,
        'completed': sites.where((s) => s.category == 'verified').length,
        'inProgress': sites.where((s) => s.category == 'in_progress' || s.category == 'awaiting_dispatch').length,
        'pending': sites.where((s) => s.category == 'pending').length,
        'returned': sites.where((s) => s.category == 'returned' || s.category == 'rejected').length,
        'stale': sites.where((s) => s.category == 'in_progress' && s.daysInCurrentStatus >= 7).length,
      };
    }).toList()
      ..sort((a, b) => (b['assigned'] as int).compareTo(a['assigned'] as int));
    return rows;
  }

  List<Map<String, dynamic>> get _collectorRows {
    final map = <String, List<_Site>>{};
    for (final s in _sites) {
      if (s.dataCollectorName == '—') continue;
      map.putIfAbsent(s.dataCollectorName, () => []).add(s);
    }
    final rows = map.entries.map((e) {
      final sites = e.value;
      final advTotal = sites.fold<double>(0, (sum, s) => sum + s.advanceRequested);
      return {
        'name': e.key,
        'claimed': sites.length,
        'completed': sites.where((s) => s.category == 'verified').length,
        'inProgress': sites.where((s) => s.category == 'in_progress').length,
        'advancesRequested': sites.where((s) => s.advanceStatus != null).length,
        'advancesApproved': sites
            .where((s) => const {'approved', 'partially_paid', 'fully_paid'}.contains(s.advanceStatus))
            .length,
        'totalRequested': advTotal,
      };
    }).toList()
      ..sort((a, b) => (b['claimed'] as int).compareTo(a['claimed'] as int));
    return rows;
  }

  // ── Derived: attention items ─────────────────────────────────────────────
  List<Map<String, dynamic>> get _attentionItems {
    final items = <Map<String, dynamic>>[];
    for (final s in _sites) {
      final d = s.daysInCurrentStatus;
      if (s.category == 'in_progress' && d >= 7) {
        items.add({
          'category': 'Stale Site', 'site': s, 'days': d,
          'detail': 'In progress for $d days with no status change',
        });
      }
      final missingAdvance = (s.category == 'in_progress' || s.category == 'verified') &&
          (s.advanceStatus == null || s.advanceStatus!.isEmpty ||
              const {'cancelled', 'rejected'}.contains(s.advanceStatus));
      if (missingAdvance) {
        items.add({
          'category': 'Missing Advance', 'site': s, 'days': d,
          'detail': const {'cancelled', 'rejected'}.contains(s.advanceStatus)
              ? 'Advance was ${s.advanceStatus} — new request needed'
              : 'Site accepted/completed but no advance fund requested',
        });
      }
      if (s.category == 'returned') {
        items.add({'category': 'Returned – Needs Re-dispatch', 'site': s, 'days': d, 'detail': 'Site returned — awaiting coordinator re-dispatch'});
      }
      if (s.category == 'rejected') {
        items.add({'category': 'Rejected Site', 'site': s, 'days': d, 'detail': 'Site rejected — requires escalation or closure'});
      }
      if (s.coordinatorName == '—') {
        items.add({'category': 'Unassigned Site', 'site': s, 'days': d, 'detail': 'No coordinator assigned to this site'});
      }
      if (s.category == 'pending' && d >= 14) {
        items.add({'category': 'Pending Too Long', 'site': s, 'days': d, 'detail': 'Pending for $d days — no movement'});
      }
    }
    items.sort((a, b) => (b['days'] as int).compareTo(a['days'] as int));
    return items;
  }

  static const _categoryColor = {
    'verified': Colors.green,
    'in_progress': AppColors.primaryBlue,
    'awaiting_dispatch': Colors.lightBlue,
    'returned': Colors.deepOrange,
    'rejected': Colors.red,
    'pending': Colors.amber,
  };

  static const _categoryLabel = {
    'verified': 'Verified / Approved',
    'in_progress': 'Active field work',
    'awaiting_dispatch': 'Awaiting dispatch',
    'returned': 'Returned',
    'rejected': 'Rejected',
    'pending': 'Pending / Not started',
  };

  @override
  Widget build(BuildContext context) {
    final attentionCount = _attentionItems.length;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Report — ${widget.state}',
              showBackButton: true,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),
            if (!_loading)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                color: AppColors.backgroundGray,
                child: Text(
                  '${widget.mmpName} · Cycle: $_cycleStatus',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
              ),
            Material(
              color: AppColors.primaryBlue,
              child: TabBar(
                controller: _tabController,
                isScrollable: true,
                labelColor: Colors.white,
                unselectedLabelColor: Colors.white70,
                indicatorColor: Colors.white,
                tabs: [
                  const Tab(text: 'Summary'),
                  Tab(text: 'Coordinators (${_coordinatorRows.length})'),
                  Tab(text: 'Collectors (${_collectorRows.length})'),
                  Tab(text: 'All Sites (${_sites.length})'),
                  Tab(text: 'Attention ($attentionCount)'),
                  Tab(text: 'Audit (${_auditRows.length})'),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : TabBarView(
                      controller: _tabController,
                      children: [
                        _buildSummary(),
                        _buildCoordinators(),
                        _buildCollectors(),
                        _buildAllSites(),
                        _buildAttention(),
                        _buildAudit(),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummary() {
    final total = _sites.length;
    final counts = _cycleCounts;
    final verified = counts['verified']!;
    final coverage = total > 0 ? verified / total : 0.0;
    final currency = NumberFormat.currency(symbol: 'SDG ', decimalDigits: 0);

    final requested = _advances.length;
    final approved = _advances
        .where((a) => const {'approved', 'partially_paid', 'fully_paid'}.contains(a['status']))
        .length;
    final pending = _advances
        .where((a) => const {'pending_supervisor', 'pending_admin'}.contains(a['status']))
        .length;
    final rejected = _advances.where((a) => a['status'] == 'rejected').length;
    final totalRequested = _advances.fold<double>(0, (s, a) => s + ((a['requested_amount'] as num?)?.toDouble() ?? 0));
    final totalApproved = _advances.fold<double>(0, (s, a) => s + ((a['approved_amount'] as num?)?.toDouble() ?? 0));
    final totalPaid = _advances.fold<double>(0, (s, a) => s + ((a['total_paid_amount'] as num?)?.toDouble() ?? 0));

    final activity = _activityTypeBreakdown;
    final timeline = _cycleTimeline;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionCard(
            title: 'Coverage Dashboard',
            children: [
              _kv('Total sites', '$total'),
              for (final cat in const ['verified', 'in_progress', 'awaiting_dispatch', 'pending', 'returned', 'rejected'])
                _kv(_categoryLabel[cat]!, '${counts[cat]}', color: _categoryColor[cat]),
              _kv('Coverage %', '${(coverage * 100).toStringAsFixed(0)}%', color: Colors.purple),
              _kv('Active sites missing advance', '$_missingAdvanceCount', color: Colors.orange.shade800),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: SizedBox(
                  height: 8,
                  child: Row(
                    children: total == 0
                        ? [Expanded(child: Container(color: Colors.grey.shade200))]
                        : [
                            for (final cat in const ['verified', 'in_progress', 'awaiting_dispatch', 'pending', 'returned', 'rejected'])
                              if (counts[cat]! > 0)
                                Expanded(
                                  flex: counts[cat]!,
                                  child: Container(color: _categoryColor[cat]),
                                ),
                          ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Financial Summary',
            children: [
              _kv('Advances requested', '$requested'),
              _kv('Advances approved', '$approved', color: Colors.green),
              _kv('Advances pending', '$pending', color: Colors.orange),
              _kv('Advances rejected', '$rejected', color: Colors.red),
              const Divider(height: 16),
              _kv('Total requested', currency.format(totalRequested)),
              _kv('Total approved', currency.format(totalApproved), color: Colors.green),
              _kv('Total paid', currency.format(totalPaid), color: AppColors.primaryBlue),
            ],
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Activity Type',
            children: [
              if (activity.isEmpty)
                Text('No activity type data.', style: TextStyle(color: Colors.grey.shade600))
              else
                Table(
                  columnWidths: const {0: FlexColumnWidth(2), 1: FlexColumnWidth(1), 2: FlexColumnWidth(1), 3: FlexColumnWidth(1)},
                  children: [
                    TableRow(children: [_th('Activity'), _th('Total'), _th('Verified'), _th('Coverage')]),
                    for (final e in activity)
                      TableRow(children: [
                        _td(e.key),
                        _td('${e.value.length}'),
                        _td('${e.value.where((s) => s.category == "verified").length}'),
                        _td(e.value.isEmpty
                            ? '0%'
                            : '${(e.value.where((s) => s.category == "verified").length / e.value.length * 100).toStringAsFixed(0)}%'),
                      ]),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: 'Cycle Timeline',
            children: [
              if (timeline.isEmpty)
                Text('No timeline data available.', style: TextStyle(color: Colors.grey.shade600))
              else
                for (final t in timeline)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          margin: const EdgeInsets.only(top: 4, right: 8),
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.purple),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t.key, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                              Text(t.value, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCoordinators() {
    final rows = _coordinatorRows;
    if (rows.isEmpty) return const Center(child: Text('No coordinator data available.'));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: rows.length,
      itemBuilder: (_, i) {
        final r = rows[i];
        final stale = r['stale'] as int;
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          color: stale > 0 ? Colors.orange.shade50 : null,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(r['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600))),
                    if (stale > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: Colors.orange.shade100, borderRadius: BorderRadius.circular(8)),
                        child: Text('$stale stale', style: TextStyle(fontSize: 10, color: Colors.orange.shade800)),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    _miniStat('Assigned', r['assigned']),
                    _miniStat('Completed', r['completed'], color: Colors.green),
                    _miniStat('In progress', r['inProgress'], color: AppColors.primaryBlue),
                    _miniStat('Pending', r['pending'], color: Colors.orange),
                    _miniStat('Returned', r['returned'], color: Colors.red),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildCollectors() {
    final rows = _collectorRows;
    if (rows.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No data collector activity recorded for this state.\nCollectors appear once a site is accepted/claimed.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    final currency = NumberFormat.currency(symbol: 'SDG ', decimalDigits: 0);
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: rows.length,
      itemBuilder: (_, i) {
        final r = rows[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(r['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: [
                    _miniStat('Claimed', r['claimed']),
                    _miniStat('Completed', r['completed'], color: Colors.green),
                    _miniStat('In progress', r['inProgress'], color: AppColors.primaryBlue),
                    _miniStat('Advances req.', r['advancesRequested']),
                    _miniStat('Advances appr.', r['advancesApproved'], color: Colors.green),
                  ],
                ),
                if ((r['totalRequested'] as double) > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Total requested: ${currency.format(r['totalRequested'])}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAllSites() {
    final sites = [..._sites]..sort((a, b) => a.siteName.compareTo(b.siteName));
    if (sites.isEmpty) return const Center(child: Text('No sites in this state.'));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: sites.length,
      itemBuilder: (_, i) {
        final s = sites[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(s.siteName, style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: (_categoryColor[s.category] ?? Colors.grey).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        s.status.replaceAll('_', ' '),
                        style: TextStyle(fontSize: 11, color: _categoryColor[s.category], fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
                if (s.locality.isNotEmpty || s.activityType.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      [s.locality, s.activityType].where((t) => t.isNotEmpty).join(' · '),
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    'Coordinator: ${s.coordinatorName} · Collector: ${s.dataCollectorName}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    s.nextStep,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAttention() {
    final items = _attentionItems;
    if (items.isEmpty) {
      return const Center(child: Text('No attention items — all sites are on track.'));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final item = items[i];
        final site = item['site'] as _Site;
        final days = item['days'] as int;
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Row(
              children: [
                Expanded(child: Text(site.siteName, style: const TextStyle(fontWeight: FontWeight.w600))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: days >= 14 ? Colors.red.shade100 : days >= 7 ? Colors.orange.shade100 : Colors.amber.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('${days}d', style: const TextStyle(fontSize: 10)),
                ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item['category'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11)),
                Text(item['detail'] as String, style: const TextStyle(fontSize: 12)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAudit() {
    if (_auditRows.isEmpty) {
      return const Center(child: Text("No audit events found for this state's sites."));
    }
    final rows = _auditRows.reversed.toList();
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: rows.length,
      itemBuilder: (_, i) {
        final log = rows[i];
        final ts = DateTime.tryParse(log['timestamp'] as String? ?? '');
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            dense: true,
            title: Text(log['entity_name'] as String? ?? '—'),
            subtitle: Text(
              '${(log['action'] as String? ?? '').replaceAll('_', ' ')} · ${log['actor_name'] as String? ?? '—'}',
            ),
            trailing: Text(
              ts == null ? '' : DateFormat('MMM d, HH:mm').format(ts),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ),
        );
      },
    );
  }

  Widget _miniStat(String label, dynamic value, {Color? color}) => Text(
    '$label: $value',
    style: TextStyle(fontSize: 11, color: color ?? Colors.grey.shade700, fontWeight: FontWeight.w600),
  );

  Widget _kv(String label, String value, {Color? color}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: Colors.grey.shade700)),
        Text(value, style: TextStyle(fontWeight: FontWeight.w700, color: color ?? AppColors.textDark)),
      ],
    ),
  );

  Widget _th(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Text(text, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 11, color: Colors.grey.shade600)),
  );

  Widget _td(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Text(text, style: const TextStyle(fontSize: 12)),
  );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}
