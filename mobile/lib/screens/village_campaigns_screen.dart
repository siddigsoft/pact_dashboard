// lib/screens/village_campaigns_screen.dart
//
// Village Campaigns — field staff view.
// Shows campaigns the signed-in user is assigned to (as coordinator,
// supervisor, or team lead), with village progress and a daily log sheet.

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';

// ─── Entry point ─────────────────────────────────────────────────────────────

class VillageCampaignsScreen extends StatefulWidget {
  const VillageCampaignsScreen({super.key});

  @override
  State<VillageCampaignsScreen> createState() => _VillageCampaignsScreenState();
}

class _VillageCampaignsScreenState extends State<VillageCampaignsScreen> {
  final _supabase = Supabase.instance.client;

  List<Map<String, dynamic>> _campaigns = [];
  bool _loading = true;
  String _statusFilter = 'all';

  String get _userId => _supabase.auth.currentUser?.id ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      // Step 1: find teams the user leads
      final teamRows = await _supabase
          .from('adhoc_teams')
          .select('id')
          .eq('team_lead_id', _userId)
          .eq('is_active', true);
      final teamIds = (teamRows as List).map((t) => t['id'] as String).toList();

      // Step 2: find campaign IDs via team assignments
      List<String> campaignIdsFromTeams = [];
      if (teamIds.isNotEmpty) {
        final assignRows = await _supabase
            .from('adhoc_village_teams')
            .select('campaign_id')
            .inFilter('team_id', teamIds);
        campaignIdsFromTeams = (assignRows as List)
            .map((r) => r['campaign_id'] as String)
            .toSet()
            .toList();
      }

      // Step 3: load campaigns where user is coordinator, supervisor, or team lead
      final orFilter = [
        'coordinator_id.eq.$_userId',
        'supervisor_id.eq.$_userId',
        if (campaignIdsFromTeams.isNotEmpty)
          'id.in.(${campaignIdsFromTeams.join(',')})',
      ].join(',');

      final data = await _supabase
          .from('adhoc_campaigns')
          .select(
            'id, campaign_name, state, locality, status, start_date, end_date, project_id',
          )
          .is_('deleted_at', null)
          .or(orFilter)
          .order('created_at', ascending: false);

      // Step 4: count villages per campaign
      final campaignIds =
          (data as List).map((c) => c['id'] as String).toList();
      Map<String, int> villageCounts = {};
      if (campaignIds.isNotEmpty) {
        final vcRows = await _supabase
            .from('adhoc_villages')
            .select('campaign_id')
            .inFilter('campaign_id', campaignIds);
        for (final r in vcRows as List) {
          final cid = r['campaign_id'] as String;
          villageCounts[cid] = (villageCounts[cid] ?? 0) + 1;
        }
      }

      if (!mounted) return;
      setState(() {
        _campaigns = (data as List).map((c) {
          final m = Map<String, dynamic>.from(c);
          m['_village_count'] = villageCounts[m['id']] ?? 0;
          return m;
        }).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error loading campaigns: $e')),
      );
    }
  }

  List<Map<String, dynamic>> get _filtered => _campaigns.where((c) {
        if (_statusFilter == 'all') return true;
        return (c['status'] ?? '') == _statusFilter;
      }).toList();

  Color _statusColor(String status) {
    switch (status) {
      case 'active':
        return const Color(0xFF16A34A);
      case 'completed':
        return AppColors.primaryBlue;
      case 'draft':
        return Colors.grey;
      case 'archived':
        return Colors.blueGrey;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: ReusableAppBar(
        title: 'Village Campaigns',
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _load,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Column(
        children: [
          // Status filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: ['all', 'active', 'draft', 'completed', 'archived']
                  .map((s) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(
                            s == 'all' ? 'All' : s[0].toUpperCase() + s.substring(1),
                            style: const TextStyle(fontSize: 12),
                          ),
                          selected: _statusFilter == s,
                          onSelected: (_) => setState(() => _statusFilter = s),
                          selectedColor: AppColors.primaryBlue.withOpacity(0.15),
                        ),
                      ))
                  .toList(),
            ),
          ),
          // Campaign list
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _filtered.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.home_work_outlined,
                                size: 56, color: Colors.grey.shade400),
                            const SizedBox(height: 12),
                            Text('No campaigns found',
                                style: TextStyle(color: Colors.grey.shade600)),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _filtered.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final c = _filtered[i];
                            final status = c['status'] ?? 'unknown';
                            final geo = [c['state'], c['locality']]
                                .where((v) => v != null && (v as String).isNotEmpty)
                                .join(' › ');
                            return Card(
                              elevation: 1,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                                side: BorderSide(
                                    color: Colors.grey.shade200, width: 0.5),
                              ),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(10),
                                onTap: () => Navigator.of(context)
                                    .push(MaterialPageRoute(
                                  builder: (_) => VillageCampaignDetailScreen(
                                      campaign: c, userId: _userId),
                                ))
                                    .then((_) => _load()),
                                child: Padding(
                                  padding: const EdgeInsets.all(14),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              c['campaign_name'] ?? '—',
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 14),
                                            ),
                                          ),
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: _statusColor(status)
                                                  .withOpacity(0.12),
                                              borderRadius:
                                                  BorderRadius.circular(20),
                                            ),
                                            child: Text(
                                              status,
                                              style: TextStyle(
                                                  fontSize: 11,
                                                  color: _statusColor(status),
                                                  fontWeight: FontWeight.w600),
                                            ),
                                          ),
                                        ],
                                      ),
                                      if (geo.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Row(
                                          children: [
                                            const Icon(Icons.location_on_outlined,
                                                size: 13, color: Colors.grey),
                                            const SizedBox(width: 3),
                                            Text(geo,
                                                style: const TextStyle(
                                                    fontSize: 12,
                                                    color: Colors.grey)),
                                          ],
                                        ),
                                      ],
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          const Icon(Icons.location_city_outlined,
                                              size: 13, color: Colors.grey),
                                          const SizedBox(width: 3),
                                          Text(
                                            '${c['_village_count']} village${c['_village_count'] == 1 ? '' : 's'}',
                                            style: const TextStyle(
                                                fontSize: 12, color: Colors.grey),
                                          ),
                                          if (c['start_date'] != null) ...[
                                            const SizedBox(width: 12),
                                            const Icon(Icons.calendar_today_outlined,
                                                size: 13, color: Colors.grey),
                                            const SizedBox(width: 3),
                                            Text(
                                              _fmt(c['start_date']),
                                              style: const TextStyle(
                                                  fontSize: 12, color: Colors.grey),
                                            ),
                                          ],
                                          const Spacer(),
                                          const Icon(Icons.chevron_right,
                                              size: 18, color: Colors.grey),
                                        ],
                                      ),
                                    ],
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
    );
  }

  String _fmt(String? d) {
    if (d == null) return '';
    try {
      return DateFormat('dd MMM yyyy').format(DateTime.parse(d));
    } catch (_) {
      return d;
    }
  }
}

// ─── Detail screen ────────────────────────────────────────────────────────────

class VillageCampaignDetailScreen extends StatefulWidget {
  final Map<String, dynamic> campaign;
  final String userId;

  const VillageCampaignDetailScreen({
    super.key,
    required this.campaign,
    required this.userId,
  });

  @override
  State<VillageCampaignDetailScreen> createState() =>
      _VillageCampaignDetailScreenState();
}

class _VillageCampaignDetailScreenState
    extends State<VillageCampaignDetailScreen>
    with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  late TabController _tabs;

  List<Map<String, dynamic>> _villages = [];
  List<Map<String, dynamic>> _assignments = [];
  List<Map<String, dynamic>> _siteEntries = [];
  bool _loading = true;

  Map<String, int> _hhCovered = {}; // village_id → total HH covered

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _loadDetail();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  String get _campaignId => widget.campaign['id'] as String;
  String get _campaignName => widget.campaign['campaign_name'] ?? '—';

  Future<void> _loadDetail() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _supabase
            .from('adhoc_villages')
            .select('id, village_name, village_code, hh_target, state, locality, status')
            .eq('campaign_id', _campaignId)
            .order('village_code', ascending: true),
        _supabase
            .from('adhoc_village_teams')
            .select('id, village_id, team_id, hh_target_for_team, status, site_entry_id, adhoc_teams!team_id(team_name, team_code, team_lead_id)')
            .eq('campaign_id', _campaignId),
        _supabase
            .from('adhoc_daily_logs')
            .select('village_id, hh_covered')
            .eq('campaign_id', _campaignId),
        _supabase
            .from('mmp_site_entries')
            .select('id, site_name, transport_fee, enumerator_fee, fee_paid_status, fee_paid_amount, additional_data')
            .filter('additional_data->>campaign_id', 'eq', _campaignId),
      ]);

      final villages = List<Map<String, dynamic>>.from(results[0] as List);
      final assignments = List<Map<String, dynamic>>.from(results[1] as List);
      final logs = List<Map<String, dynamic>>.from(results[2] as List);
      final entries = List<Map<String, dynamic>>.from(results[3] as List);

      // Aggregate HH covered per village from daily logs
      final hhCovered = <String, int>{};
      for (final l in logs) {
        final vid = l['village_id'] as String?;
        if (vid == null) continue;
        hhCovered[vid] = (hhCovered[vid] ?? 0) + ((l['hh_covered'] as num?)?.toInt() ?? 0);
      }

      if (!mounted) return;
      setState(() {
        _villages = villages;
        _assignments = assignments;
        _siteEntries = entries;
        _hhCovered = hhCovered;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalHHTarget =
        _villages.fold<int>(0, (s, v) => s + ((v['hh_target'] as num?)?.toInt() ?? 0));
    final totalHHCovered =
        _hhCovered.values.fold<int>(0, (s, v) => s + v);
    final pct = totalHHTarget > 0
        ? (totalHHCovered / totalHHTarget).clamp(0.0, 1.0)
        : 0.0;

    return Scaffold(
      appBar: ReusableAppBar(
        title: _campaignName,
        bottom: TabBar(
          controller: _tabs,
          labelStyle:
              const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Villages'),
            Tab(text: 'My Fees'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primaryBlue,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('Log Progress',
            style: TextStyle(color: Colors.white, fontSize: 13)),
        onPressed: _showDailyLogSheet,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabs,
              children: [
                _buildOverview(totalHHTarget, totalHHCovered, pct),
                _buildVillages(),
                _buildFees(),
              ],
            ),
    );
  }

  // ── Overview tab ──────────────────────────────────────────────────────────

  Widget _buildOverview(int hhTarget, int hhCovered, double pct) {
    final geo = [
      widget.campaign['state'],
      widget.campaign['locality']
    ].where((v) => v != null && (v as String).isNotEmpty).join(' › ');

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Geo + dates
          if (geo.isNotEmpty)
            _infoRow(Icons.location_on_outlined, geo),
          if (widget.campaign['start_date'] != null)
            _infoRow(Icons.calendar_today_outlined,
                '${_fmt(widget.campaign['start_date'])} → ${_fmt(widget.campaign['end_date'])}'),
          const SizedBox(height: 16),
          // Progress card
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Overall Coverage',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('$hhCovered / $hhTarget HH',
                          style: const TextStyle(
                              fontSize: 13, color: Colors.grey)),
                      Text('${(pct * 100).round()}%',
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppColors.primaryBlue)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: pct,
                      minHeight: 10,
                      backgroundColor: Colors.grey.shade200,
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Summary chips
          Row(
            children: [
              _summaryChip(Icons.location_city_outlined,
                  '${_villages.length} Villages', AppColors.primaryBlue),
              const SizedBox(width: 10),
              _summaryChip(Icons.groups_outlined,
                  '${_assignments.length} Assignments', AppColors.accentGreen),
            ],
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          children: [
            Icon(icon, size: 14, color: Colors.grey),
            const SizedBox(width: 6),
            Expanded(
                child: Text(text,
                    style: const TextStyle(fontSize: 13, color: Colors.grey))),
          ],
        ),
      );

  Widget _summaryChip(IconData icon, String label, Color color) => Chip(
        backgroundColor: color.withOpacity(0.1),
        avatar: Icon(icon, size: 14, color: color),
        label: Text(label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        padding: EdgeInsets.zero,
      );

  // ── Villages tab ──────────────────────────────────────────────────────────

  Widget _buildVillages() {
    if (_villages.isEmpty) {
      return const Center(child: Text('No villages in this campaign'));
    }
    return RefreshIndicator(
      onRefresh: _loadDetail,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: _villages.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final v = _villages[i];
          final vid = v['id'] as String;
          final target = (v['hh_target'] as num?)?.toInt() ?? 0;
          final covered = _hhCovered[vid] ?? 0;
          final pct =
              target > 0 ? (covered / target).clamp(0.0, 1.0) : 0.0;
          final geo = [v['state'], v['locality']]
              .where((x) => x != null && (x as String).isNotEmpty)
              .join(' › ');
          final status = v['status'] as String? ?? 'pending';
          return Card(
            elevation: 0.5,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: BorderSide(color: Colors.grey.shade200)),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(v['village_name'] ?? '—',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: _statusColor(status).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(status.replaceAll('_', ' '),
                            style: TextStyle(
                                fontSize: 11, color: _statusColor(status))),
                      ),
                    ],
                  ),
                  if (geo.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(geo,
                          style: const TextStyle(
                              fontSize: 11, color: Colors.grey)),
                    ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('$covered / $target HH',
                          style:
                              const TextStyle(fontSize: 12, color: Colors.grey)),
                      Text('${(pct * 100).round()}%',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: AppColors.primaryBlue)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: pct,
                      minHeight: 6,
                      backgroundColor: Colors.grey.shade200,
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'active':
      case 'in_progress':
        return AppColors.accentGreen;
      case 'completed':
        return AppColors.primaryBlue;
      case 'pending':
        return Colors.amber.shade700;
      default:
        return Colors.grey;
    }
  }

  // ── Fees tab ──────────────────────────────────────────────────────────────

  Widget _buildFees() {
    if (_siteEntries.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No fee records yet. Fee entries are created automatically when teams are assigned to villages.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey, fontSize: 13),
          ),
        ),
      );
    }

    final totalTransport = _siteEntries.fold<double>(
        0, (s, e) => s + ((e['transport_fee'] as num?)?.toDouble() ?? 0));
    final totalEnum = _siteEntries.fold<double>(
        0, (s, e) => s + ((e['enumerator_fee'] as num?)?.toDouble() ?? 0));

    return Column(
      children: [
        // Summary row
        Container(
          color: Colors.grey.shade50,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              _feeSummaryItem('Transport', totalTransport, Colors.blue),
              const SizedBox(width: 16),
              _feeSummaryItem('Enumerator', totalEnum, Colors.purple),
              const SizedBox(width: 16),
              _feeSummaryItem('Total', totalTransport + totalEnum,
                  AppColors.accentGreen),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: _siteEntries.length,
            separatorBuilder: (_, __) => const SizedBox(height: 6),
            itemBuilder: (_, i) {
              final e = _siteEntries[i];
              final ad = (e['additional_data'] as Map?)?.cast<String, dynamic>() ?? {};
              final transport = (e['transport_fee'] as num?)?.toDouble() ?? 0;
              final enumFee = (e['enumerator_fee'] as num?)?.toDouble() ?? 0;
              final payStatus = e['fee_paid_status'] as String? ?? 'unpaid';
              final paidAmt = (e['fee_paid_amount'] as num?)?.toDouble() ?? 0;

              return Card(
                elevation: 0.5,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: BorderSide(color: Colors.grey.shade200)),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(e['site_name'] ?? '—',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13)),
                          ),
                          _payBadge(payStatus),
                        ],
                      ),
                      if (ad['team_name'] != null)
                        Text('Team: ${ad['team_name']}',
                            style: const TextStyle(
                                fontSize: 11, color: Colors.grey)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _feeChip('Transport', transport, Colors.blue),
                          const SizedBox(width: 8),
                          _feeChip('Enumeration', enumFee, Colors.purple),
                          if (paidAmt > 0) ...[
                            const SizedBox(width: 8),
                            _feeChip('Paid', paidAmt, AppColors.accentGreen),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _feeSummaryItem(String label, double amount, Color color) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style:
                    const TextStyle(fontSize: 11, color: Colors.grey)),
            Text('SDG ${_fmtAmt(amount)}',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: color)),
          ],
        ),
      );

  Widget _feeChip(String label, double amount, Color color) => Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8)),
        child: Text('$label: SDG ${_fmtAmt(amount)}',
            style: TextStyle(
                fontSize: 11,
                color: color,
                fontWeight: FontWeight.w600)),
      );

  Widget _payBadge(String status) {
    final color = status == 'paid'
        ? AppColors.accentGreen
        : status == 'partial'
            ? Colors.orange
            : Colors.grey;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12)),
      child: Text(status,
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }

  // ── Daily log bottom sheet ─────────────────────────────────────────────────

  Future<void> _showDailyLogSheet() async {
    if (_villages.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No villages in this campaign yet')),
      );
      return;
    }

    String? selectedAssignmentId;
    String? selectedVillageName;
    final dateCtrl = TextEditingController(
        text: DateFormat('yyyy-MM-dd').format(DateTime.now()));
    final hhCtrl = TextEditingController();
    final maleCtrl = TextEditingController();
    final femaleCtrl = TextEditingController();
    final beneCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    bool submitting = false;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: EdgeInsets.only(
            top: 16,
            left: 16,
            right: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Log Daily Progress',
                    style: TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 12),
                // Village / assignment selector
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(
                      labelText: 'Assignment (Team → Village)',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10)),
                  items: _assignments.map((a) {
                    final team = (a['adhoc_teams'] as Map?)
                            ?['team_code'] as String? ??
                        '?';
                    final vil = _villages.firstWhere(
                        (v) => v['id'] == a['village_id'],
                        orElse: () => {'village_name': '?'});
                    return DropdownMenuItem<String>(
                      value: a['id'] as String,
                      child: Text(
                          '$team → ${vil['village_name']}',
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13)),
                    );
                  }).toList(),
                  onChanged: (v) {
                    setLocal(() {
                      selectedAssignmentId = v;
                      if (v != null) {
                        final a = _assignments
                            .firstWhere((a) => a['id'] == v);
                        final vil = _villages.firstWhere(
                            (vi) => vi['id'] == a['village_id'],
                            orElse: () => {});
                        selectedVillageName =
                            vil['village_name'] as String?;
                      }
                    });
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: dateCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Report Date',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10)),
                  readOnly: true,
                  onTap: () async {
                    final d = await showDatePicker(
                      context: ctx,
                      initialDate: DateTime.now(),
                      firstDate: DateTime(2024),
                      lastDate: DateTime.now(),
                    );
                    if (d != null) {
                      dateCtrl.text = DateFormat('yyyy-MM-dd').format(d);
                    }
                  },
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: hhCtrl,
                        decoration: const InputDecoration(
                            labelText: 'HH Covered',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10)),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: beneCtrl,
                        decoration: const InputDecoration(
                            labelText: 'Beneficiaries',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10)),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: maleCtrl,
                        decoration: const InputDecoration(
                            labelText: 'Male',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10)),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: femaleCtrl,
                        decoration: const InputDecoration(
                            labelText: 'Female',
                            border: OutlineInputBorder(),
                            contentPadding: EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10)),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: notesCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Notes (optional)',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10)),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                        padding:
                            const EdgeInsets.symmetric(vertical: 14)),
                    onPressed: submitting || selectedAssignmentId == null
                        ? null
                        : () async {
                            setLocal(() => submitting = true);
                            try {
                              final a = _assignments.firstWhere(
                                  (x) => x['id'] == selectedAssignmentId);
                              await _supabase
                                  .from('adhoc_daily_logs')
                                  .insert({
                                'campaign_id':   _campaignId,
                                'assignment_id': selectedAssignmentId,
                                'village_id':    a['village_id'],
                                'team_id':       a['team_id'],
                                'report_date':   dateCtrl.text,
                                'hh_covered':    int.tryParse(hhCtrl.text) ?? 0,
                                'male_count':    int.tryParse(maleCtrl.text) ?? 0,
                                'female_count':  int.tryParse(femaleCtrl.text) ?? 0,
                                'beneficiaries': int.tryParse(beneCtrl.text) ?? 0,
                                'notes':         notesCtrl.text.trim().isEmpty
                                    ? null
                                    : notesCtrl.text.trim(),
                                'submitted_by':  widget.userId,
                                'submitted_at':  DateTime.now().toIso8601String(),
                                'source':        'mobile',
                              });
                              if (ctx.mounted) Navigator.pop(ctx);
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text('Progress logged ✓'),
                                      backgroundColor: Colors.green),
                                );
                                await _loadDetail();
                              }
                            } catch (e) {
                              setLocal(() => submitting = false);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Error: $e')),
                              );
                            }
                          },
                    child: submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2),
                          )
                        : const Text('Submit Progress Log'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    dateCtrl.dispose();
    hhCtrl.dispose();
    maleCtrl.dispose();
    femaleCtrl.dispose();
    beneCtrl.dispose();
    notesCtrl.dispose();
  }

  String _fmt(String? d) {
    if (d == null) return '';
    try {
      return DateFormat('dd MMM yyyy').format(DateTime.parse(d));
    } catch (_) {
      return d;
    }
  }

  String _fmtAmt(double v) =>
      v == v.truncate() ? v.toInt().toString() : v.toStringAsFixed(2);
}
