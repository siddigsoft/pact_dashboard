// lib/screens/village_campaigns_screen.dart
//
// Village Campaigns — Team Lead daily-log submission screen.
// Shows the current user's active team-village assignments and lets them
// submit a daily progress log (HH covered, M/F split, beneficiaries, notes,
// GPS) that writes to adhoc_daily_logs with source='mobile'.

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/reusable_app_bar.dart';

// ─── Data models ─────────────────────────────────────────────────────────────

class _Assignment {
  final String id;           // adhoc_village_teams.id
  final String campaignId;
  final String campaignName;
  final String campaignStatus;
  final String villageId;
  final String villageName;
  final String villageCode;
  final int    hhTarget;
  final int?   hhTargetForTeam;
  final String teamId;
  final String teamName;
  final String teamCode;
  final String assignmentStatus;

  const _Assignment({
    required this.id,
    required this.campaignId,
    required this.campaignName,
    required this.campaignStatus,
    required this.villageId,
    required this.villageName,
    required this.villageCode,
    required this.hhTarget,
    required this.hhTargetForTeam,
    required this.teamId,
    required this.teamName,
    required this.teamCode,
    required this.assignmentStatus,
  });
}

class _DailyLog {
  final String reportDate;
  final int    hhCovered;
  final int    male;
  final int    female;
  final int    beneficiaries;
  final String source;

  const _DailyLog({
    required this.reportDate,
    required this.hhCovered,
    required this.male,
    required this.female,
    required this.beneficiaries,
    required this.source,
  });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

class VillageCampaignsScreen extends StatefulWidget {
  const VillageCampaignsScreen({super.key});

  @override
  State<VillageCampaignsScreen> createState() => _VillageCampaignsScreenState();
}

class _VillageCampaignsScreenState extends State<VillageCampaignsScreen> {
  final _supabase = Supabase.instance.client;

  bool _loading = true;
  String? _error;
  String? _userId;

  List<_Assignment>  _assignments  = [];
  // assignmentId -> list of logs already submitted
  Map<String, List<_DailyLog>> _logsByAssignment = {};

  @override
  void initState() {
    super.initState();
    _userId = _supabase.auth.currentUser?.id;
    _loadData();
  }

  // ── Data fetching ───────────────────────────────────────────────────────

  Future<void> _loadData() async {
    if (_userId == null) {
      setState(() { _error = 'Not signed in.'; _loading = false; });
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      // 1. Find all teams where this user is the team lead
      final teamsRes = await _supabase
          .from('adhoc_teams')
          .select('id, team_name, team_code')
          .eq('team_lead_id', _userId!)
          .eq('is_active', true);

      final teams = List<Map<String, dynamic>>.from(teamsRes as List);
      if (teams.isEmpty) {
        setState(() { _assignments = []; _loading = false; });
        return;
      }
      final teamIds = teams.map((t) => t['id'] as String).toList();

      // 2. Fetch active assignments for those teams
      final assignRes = await _supabase
          .from('adhoc_village_teams')
          .select(
            'id, campaign_id, village_id, team_id, hh_target_for_team, status, '
            'village:village_id(village_name, village_code, hh_target), '
            'campaign:campaign_id(campaign_name, status)',
          )
          .inFilter('team_id', teamIds)
          .eq('status', 'active');

      final assignRows = List<Map<String, dynamic>>.from(assignRes as List);

      // Build assignment objects
      final assignments = <_Assignment>[];
      for (final row in assignRows) {
        final campaign = row['campaign'] as Map<String, dynamic>? ?? {};
        final village  = row['village']  as Map<String, dynamic>? ?? {};
        final campaignStatus = campaign['status'] as String? ?? '';
        // Skip archived/completed campaigns
        if (campaignStatus == 'archived' || campaignStatus == 'completed') {
          continue;
        }
        final teamId = row['team_id'] as String;
        final team = teams.firstWhere(
          (t) => t['id'] == teamId,
          orElse: () => {'team_name': '—', 'team_code': '—'},
        );
        assignments.add(_Assignment(
          id:               row['id'] as String,
          campaignId:       row['campaign_id'] as String,
          campaignName:     campaign['campaign_name'] as String? ?? '—',
          campaignStatus:   campaignStatus,
          villageId:        row['village_id'] as String,
          villageName:      village['village_name'] as String? ?? '—',
          villageCode:      village['village_code'] as String? ?? '—',
          hhTarget:         (village['hh_target'] as int?) ?? 0,
          hhTargetForTeam:  row['hh_target_for_team'] as int?,
          teamId:           teamId,
          teamName:         team['team_name'] as String? ?? '—',
          teamCode:         team['team_code'] as String? ?? '—',
          assignmentStatus: row['status'] as String? ?? 'active',
        ));
      }

      // 3. Load ALL logs for these assignments — no date cap so totalCovered
      //    is accurate over the full campaign lifetime.  We keep the full list
      //    in memory; the UI derives today's status from report_date == today.
      final assignmentIds = assignments.map((a) => a.id).toList();
      Map<String, List<_DailyLog>> logsByAssignment = {};

      if (assignmentIds.isNotEmpty) {
        final logsRes = await _supabase
            .from('adhoc_daily_logs')
            .select('assignment_id, report_date, hh_covered, male_count, female_count, beneficiaries, source')
            .inFilter('assignment_id', assignmentIds)
            .order('report_date', ascending: false);

        for (final log in (logsRes as List)) {
          final aId = log['assignment_id'] as String;
          logsByAssignment.putIfAbsent(aId, () => []);
          logsByAssignment[aId]!.add(_DailyLog(
            reportDate:   log['report_date'] as String,
            hhCovered:    (log['hh_covered'] as int?) ?? 0,
            male:         (log['male_count'] as int?) ?? 0,
            female:       (log['female_count'] as int?) ?? 0,
            beneficiaries:(log['beneficiaries'] as int?) ?? 0,
            source:       log['source'] as String? ?? 'web',
          ));
        }
      }

      if (!mounted) return;
      setState(() {
        _assignments       = assignments;
        _logsByAssignment  = logsByAssignment;
        _loading           = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /// Returns the log submitted today for this assignment, or null.
  _DailyLog? _todayLog(_Assignment a) {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final logs  = _logsByAssignment[a.id] ?? [];
    try {
      return logs.firstWhere((l) => l.reportDate == today);
    } catch (_) {
      return null;
    }
  }

  int _totalCovered(_Assignment a) {
    return (_logsByAssignment[a.id] ?? [])
        .fold(0, (s, l) => s + l.hhCovered);
  }

  // ── Daily log dialog ─────────────────────────────────────────────────────

  Future<void> _openLogDialog(_Assignment assignment) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _DailyLogDialog(
        supabase:   _supabase,
        userId:     _userId!,
        assignment: assignment,
        todayLog:   _todayLog(assignment),
      ),
    );
    if (result == true) _loadData();
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: ReusableAppBar(
        title: 'Village Campaigns',
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loadData,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.red, size: 48),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _loadData,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    if (_assignments.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.campaign_outlined, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                'No active village assignments',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.grey[600]),
              ),
              const SizedBox(height: 8),
              Text(
                'You will see villages here once a coordinator assigns your team to an active campaign.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey[500]),
              ),
            ],
          ),
        ),
      );
    }

    // Group by campaign
    final Map<String, List<_Assignment>> byCampaign = {};
    for (final a in _assignments) {
      byCampaign.putIfAbsent(a.campaignName, () => []).add(a);
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // Info banner
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF0F2041).withOpacity(0.07),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF0F2041).withOpacity(0.15)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 18, color: Color(0xFF0F2041)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Submit one daily log per village per day. GPS is captured automatically.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF0F2041),
                    ),
                  ),
                ),
              ],
            ),
          ),

          for (final entry in byCampaign.entries) ...[
            _CampaignHeader(campaignName: entry.key),
            const SizedBox(height: 6),
            for (final a in entry.value) ...[
              _AssignmentCard(
                assignment: a,
                totalCovered: _totalCovered(a),
                todayLog: _todayLog(a),
                onSubmit: () => _openLogDialog(a),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

// ─── Campaign header ──────────────────────────────────────────────────────────

class _CampaignHeader extends StatelessWidget {
  final String campaignName;
  const _CampaignHeader({required this.campaignName});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.campaign, size: 16, color: Color(0xFF0F2041)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              campaignName,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: Color(0xFF0F2041),
                letterSpacing: 0.3,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Assignment card ──────────────────────────────────────────────────────────

class _AssignmentCard extends StatelessWidget {
  final _Assignment assignment;
  final int         totalCovered;
  final _DailyLog?  todayLog;
  final VoidCallback onSubmit;

  const _AssignmentCard({
    required this.assignment,
    required this.totalCovered,
    required this.todayLog,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final target  = assignment.hhTargetForTeam ?? assignment.hhTarget;
    final double pct = target > 0 ? (totalCovered / target).clamp(0.0, 1.0).toDouble() : 0.0;
    final alreadySubmittedToday = todayLog != null;

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Village name + code
            Row(
              children: [
                const Icon(Icons.location_on, size: 16, color: Colors.teal),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    assignment.villageName,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.teal.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    assignment.villageCode,
                    style: const TextStyle(fontSize: 11, color: Colors.teal, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),

            // Team info
            Row(
              children: [
                const Icon(Icons.group, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  '${assignment.teamName} · ${assignment.teamCode}',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Progress bar
            if (target > 0) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Progress: $totalCovered / $target HH',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                  ),
                  Text(
                    '${(pct * 100).round()}%',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: pct >= 1.0 ? Colors.green : const Color(0xFF0F2041),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 6,
                  backgroundColor: Colors.grey[200],
                  valueColor: AlwaysStoppedAnimation<Color>(
                    pct >= 1.0 ? Colors.green : const Color(0xFF0F2041),
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],

            // Today's status + submit button
            Row(
              children: [
                if (alreadySubmittedToday) ...[
                  const Icon(Icons.check_circle, size: 16, color: Colors.green),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Today submitted',
                          style: TextStyle(fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600),
                        ),
                        Text(
                          '${todayLog!.hhCovered} HH · ${todayLog!.male}M / ${todayLog!.female}F',
                          style: const TextStyle(fontSize: 11, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: onSubmit,
                    icon: const Icon(Icons.edit, size: 14),
                    label: const Text('Update', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ] else ...[
                  const Icon(Icons.radio_button_unchecked, size: 16, color: Colors.orange),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'No log for today',
                      style: TextStyle(fontSize: 12, color: Colors.orange[700]),
                    ),
                  ),
                  ElevatedButton.icon(
                    onPressed: onSubmit,
                    icon: const Icon(Icons.add, size: 14),
                    label: const Text('Submit Log', style: TextStyle(fontSize: 12)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0F2041),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Daily log dialog ─────────────────────────────────────────────────────────

class _DailyLogDialog extends StatefulWidget {
  final SupabaseClient supabase;
  final String         userId;
  final _Assignment    assignment;
  final _DailyLog?     todayLog;   // null = new, non-null = editing today's log

  const _DailyLogDialog({
    required this.supabase,
    required this.userId,
    required this.assignment,
    required this.todayLog,
  });

  @override
  State<_DailyLogDialog> createState() => _DailyLogDialogState();
}

class _DailyLogDialogState extends State<_DailyLogDialog> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _hhCtrl;
  late final TextEditingController _maleCtrl;
  late final TextEditingController _femaleCtrl;
  late final TextEditingController _benCtrl;
  late final TextEditingController _notesCtrl;
  late String _reportDate;

  bool _capturingGps = false;
  bool _saving       = false;
  double? _gpsLat;
  double? _gpsLng;
  double? _gpsAccuracy;
  String? _gpsError;

  @override
  void initState() {
    super.initState();
    final log = widget.todayLog;
    _hhCtrl    = TextEditingController(text: log != null ? log.hhCovered.toString() : '');
    _maleCtrl  = TextEditingController(text: log != null ? log.male.toString() : '');
    _femaleCtrl= TextEditingController(text: log != null ? log.female.toString() : '');
    _benCtrl   = TextEditingController(text: log != null ? log.beneficiaries.toString() : '');
    _notesCtrl = TextEditingController();
    _reportDate = DateFormat('yyyy-MM-dd').format(DateTime.now());

    // Auto-capture GPS on open
    _captureGps();
  }

  @override
  void dispose() {
    _hhCtrl.dispose();
    _maleCtrl.dispose();
    _femaleCtrl.dispose();
    _benCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _captureGps() async {
    setState(() { _capturingGps = true; _gpsError = null; });
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() { _gpsError = 'Location services disabled'; _capturingGps = false; });
        return;
      }
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        setState(() { _gpsError = 'Location permission denied'; _capturingGps = false; });
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 15),
      );
      if (!mounted) return;
      setState(() {
        _gpsLat      = pos.latitude;
        _gpsLng      = pos.longitude;
        _gpsAccuracy = pos.accuracy;
        _capturingGps = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _gpsError = 'GPS unavailable'; _capturingGps = false; });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final hh    = int.tryParse(_hhCtrl.text.trim()) ?? 0;
    final male  = int.tryParse(_maleCtrl.text.trim()) ?? 0;
    final female= int.tryParse(_femaleCtrl.text.trim()) ?? 0;
    final ben   = int.tryParse(_benCtrl.text.trim()) ?? 0;
    final notes = _notesCtrl.text.trim();

    setState(() => _saving = true);
    try {
      // upsert: unique key is (assignment_id, report_date)
      await widget.supabase.from('adhoc_daily_logs').upsert(
        {
          'assignment_id': widget.assignment.id,
          'campaign_id':   widget.assignment.campaignId,
          'village_id':    widget.assignment.villageId,
          'team_id':       widget.assignment.teamId,
          'report_date':   _reportDate,
          'hh_covered':    hh,
          'male_count':    male,
          'female_count':  female,
          'beneficiaries': ben,
          'notes':         notes.isEmpty ? null : notes,
          'gps_lat':       _gpsLat,
          'gps_lng':       _gpsLng,
          'gps_accuracy':  _gpsAccuracy,
          'submitted_by':  widget.userId,
          'submitted_at':  DateTime.now().toIso8601String(),
          'source':        'mobile',
        },
        onConflict: 'assignment_id,report_date',
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Daily log submitted ✓'),
          backgroundColor: Colors.green,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to submit: $e'),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final a        = widget.assignment;
    final isUpdate = widget.todayLog != null;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  const Icon(Icons.edit_note, color: Color(0xFF0F2041)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isUpdate ? 'Update Daily Log' : 'Submit Daily Log',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(false),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${a.villageName} · ${a.teamName}',
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              ),
              const Divider(height: 20),

              // Date (read-only, always today)
              _FieldLabel('Report Date'),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                    const SizedBox(width: 8),
                    Text(
                      DateFormat('dd MMM yyyy').format(DateTime.now()),
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                    const Spacer(),
                    Text('Today', style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // HH Covered
              _FieldLabel('Households Covered *'),
              _NumberField(
                controller: _hhCtrl,
                hint: '0',
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Required';
                  if (int.tryParse(v.trim()) == null) return 'Enter a number';
                  return null;
                },
              ),
              const SizedBox(height: 14),

              // Male / Female
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _FieldLabel('Male *'),
                        _NumberField(
                          controller: _maleCtrl,
                          hint: '0',
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return 'Required';
                            if (int.tryParse(v.trim()) == null) return 'Number';
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _FieldLabel('Female *'),
                        _NumberField(
                          controller: _femaleCtrl,
                          hint: '0',
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return 'Required';
                            if (int.tryParse(v.trim()) == null) return 'Number';
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Beneficiaries
              _FieldLabel('Beneficiaries'),
              _NumberField(controller: _benCtrl, hint: '0'),
              const SizedBox(height: 14),

              // Notes
              _FieldLabel('Notes (optional)'),
              TextFormField(
                controller: _notesCtrl,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'Any observations, challenges, or remarks…',
                  hintStyle: TextStyle(color: Colors.grey[400], fontSize: 13),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 14),

              // GPS status
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: _gpsLat != null
                      ? Colors.green.withOpacity(0.07)
                      : Colors.orange.withOpacity(0.07),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _gpsLat != null
                        ? Colors.green.withOpacity(0.3)
                        : Colors.orange.withOpacity(0.3),
                  ),
                ),
                child: Row(
                  children: [
                    if (_capturingGps)
                      const SizedBox(
                        width: 14, height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    else
                      Icon(
                        _gpsLat != null ? Icons.gps_fixed : Icons.gps_not_fixed,
                        size: 14,
                        color: _gpsLat != null ? Colors.green : Colors.orange,
                      ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _capturingGps
                            ? 'Capturing GPS…'
                            : _gpsLat != null
                                ? 'GPS: ${_gpsLat!.toStringAsFixed(5)}, ${_gpsLng!.toStringAsFixed(5)}'
                                : _gpsError ?? 'GPS unavailable — log will be submitted without location',
                        style: TextStyle(
                          fontSize: 11,
                          color: _gpsLat != null ? Colors.green[700] : Colors.orange[700],
                        ),
                      ),
                    ),
                    if (!_capturingGps && _gpsLat == null)
                      GestureDetector(
                        onTap: _captureGps,
                        child: Text(
                          'Retry',
                          style: TextStyle(fontSize: 11, color: Colors.blue[600], decoration: TextDecoration.underline),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _saving ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F2041),
                        foregroundColor: Colors.white,
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Text(isUpdate ? 'Update' : 'Submit'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
  );
}

class _NumberField extends StatelessWidget {
  final TextEditingController controller;
  final String                hint;
  final String? Function(String?)? validator;
  const _NumberField({required this.controller, required this.hint, this.validator});

  @override
  Widget build(BuildContext context) => TextFormField(
    controller: controller,
    keyboardType: TextInputType.number,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
    validator: validator,
    decoration: InputDecoration(
      hintText: hint,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      isDense: true,
    ),
  );
}
