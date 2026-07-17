// lib/screens/team_sites_screen.dart

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../utils/user_role.dart';
import '../services/claim_fee_service.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';

/// Supervisor oversight of their team's site visits: who's working on what,
/// and a way to push an unclaimed dispatched site to a specific collector
/// instead of leaving it to first-come-first-served self-claim.
///
/// Scoped by state (mirrors FieldOperationsEnhancedScreen's existing
/// claim-flow scoping, which is the only "team boundary" this app's schema
/// currently encodes — site entries have no hub_id of their own).
class TeamSitesScreen extends StatefulWidget {
  const TeamSitesScreen({super.key});

  @override
  State<TeamSitesScreen> createState() => _TeamSitesScreenState();
}

class _TeamSitesScreenState extends State<TeamSitesScreen> {
  final _supabase = Supabase.instance.client;
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _feeService = ClaimFeeService();

  bool _loading = true;
  bool _assigning = false;
  String? _stateName;
  List<Map<String, dynamic>> _teamMembers = [];
  List<Map<String, dynamic>> _sites = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final userId = _supabase.auth.currentUser?.id;
      if (userId == null) {
        if (mounted) setState(() => _loading = false);
        return;
      }

      final myProfile = await _supabase
          .from('profiles')
          .select('state_id')
          .eq('id', userId)
          .maybeSingle();
      final stateId = myProfile?['state_id'] as String?;

      String? stateName;
      if (stateId != null) {
        final hubState = await _supabase
            .from('hub_states')
            .select('state_name')
            .eq('state_id', stateId)
            .maybeSingle();
        stateName = hubState?['state_name'] as String?;
      }

      if (stateName == null || stateName.isEmpty) {
        if (!mounted) return;
        setState(() {
          _stateName = null;
          _teamMembers = [];
          _sites = [];
          _loading = false;
        });
        return;
      }

      final results = await Future.wait([
        _supabase
            .from('profiles')
            .select('id, full_name, role, availability')
            .eq('state_id', stateId!)
            .neq('id', userId),
        _supabase
            .from('mmp_site_entries')
            .select(
              'id, site_name, status, state, locality, accepted_by, additional_data',
            )
            .ilike('state', '%$stateName%')
            .order('created_at', ascending: false)
            .limit(500),
      ]);

      if (!mounted) return;
      setState(() {
        _stateName = stateName;
        _teamMembers = List<Map<String, dynamic>>.from(results[0] as List);
        _sites = List<Map<String, dynamic>>.from(results[1] as List);
        _loading = false;
      });
    } catch (e) {
      debugPrint('[TeamSitesScreen] load error: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _collectors => _teamMembers
      .where((m) => UserRoleHelper.isDataCollector(m['role'] as String?))
      .toList()
    ..sort((a, b) {
      final aOnline = a['availability'] == 'online' ? 0 : 1;
      final bOnline = b['availability'] == 'online' ? 0 : 1;
      return aOnline.compareTo(bOnline);
    });

  List<Map<String, dynamic>> get _unclaimed => _sites
      .where(
        (s) =>
            s['accepted_by'] == null &&
            (s['status'] as String? ?? '').toLowerCase() == 'dispatched',
      )
      .toList();

  List<Map<String, dynamic>> get _claimed =>
      _sites.where((s) => s['accepted_by'] != null).toList();

  int get _completedCount => _claimed
      .where((s) => (s['status'] as String? ?? '').toLowerCase() == 'completed')
      .length;

  String _memberName(String? id) {
    if (id == null) return 'Unknown';
    final match = _teamMembers.where((m) => m['id'] == id).firstOrNull;
    return (match?['full_name'] as String?) ?? 'Unknown';
  }

  Map<String, dynamic> _safeAdditionalData(dynamic data) {
    if (data is String) {
      try {
        final decoded = jsonDecode(data);
        return decoded is Map ? Map<String, dynamic>.from(decoded) : {};
      } catch (_) {
        return {};
      }
    } else if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return {};
  }

  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : null,
      ),
    );
  }

  Future<void> _pickCollectorAndAssign(Map<String, dynamic> site) async {
    final collectors = _collectors;
    if (collectors.isEmpty) {
      _showSnack('No data collectors found in your state.', isError: true);
      return;
    }
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'Assign "${site['site_name'] ?? 'site'}" to',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(ctx).size.height * 0.5,
              ),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: collectors.length,
                itemBuilder: (_, i) {
                  final c = collectors[i];
                  final online = c['availability'] == 'online';
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: AppColors.primaryBlue.withValues(alpha: 0.1),
                      child: Text(
                        ((c['full_name'] as String?) ?? '?')
                            .trim()
                            .characters
                            .firstOrNull
                            ?.toUpperCase() ??
                            '?',
                        style: const TextStyle(color: AppColors.primaryBlue),
                      ),
                    ),
                    title: Text(c['full_name'] as String? ?? 'Unknown'),
                    subtitle: Text(online ? 'Online' : 'Offline'),
                    trailing: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: online ? Colors.green : Colors.grey,
                      ),
                    ),
                    onTap: () => Navigator.of(ctx).pop(c),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked == null) return;
    await _assign(site, picked);
  }

  Future<void> _assign(
    Map<String, dynamic> site,
    Map<String, dynamic> collector,
  ) async {
    setState(() => _assigning = true);
    final siteId = site['id'] as String;
    final collectorId = collector['id'] as String;
    try {
      final breakdown = await _feeService.calculateFeeForClaim(
        siteId,
        collectorId,
      );
      if (breakdown == null) {
        _showSnack('Could not calculate fees for this assignment.', isError: true);
        return;
      }

      final result = await _supabase.rpc(
        'claim_site_visit',
        params: {
          'p_site_id': siteId,
          'p_user_id': collectorId,
          'p_enumerator_fee': breakdown.enumeratorFee,
          'p_total_cost': breakdown.totalPayout,
          'p_classification_level': breakdown.classificationLevel,
          'p_role_scope': breakdown.roleScope,
          'p_fee_source': breakdown.feeSource,
        },
      );
      final claimResult = result as Map<String, dynamic>?;
      if (claimResult == null || claimResult['success'] != true) {
        _showSnack(
          claimResult?['message'] as String? ?? 'Could not assign site',
          isError: true,
        );
        return;
      }

      final now = DateTime.now().toIso8601String();
      final additionalData = _safeAdditionalData(site['additional_data']);
      additionalData['claim_type'] = 'supervisor_assigned';
      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Accepted',
            'accepted_by': collectorId,
            'accepted_at': now,
            'additional_data': additionalData,
            'cost_acknowledged': true,
            'cost_acknowledged_at': now,
            'cost_acknowledged_by': collectorId,
            'updated_at': now,
          })
          .eq('id', siteId);

      _showSnack('Assigned to ${collector['full_name'] ?? 'team member'}');
      await _load();
    } catch (e) {
      _showSnack('Error assigning site: $e', isError: true);
    } finally {
      if (mounted) setState(() => _assigning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.backgroundGray,
      drawer: CustomDrawerMenu(
        currentUser: _supabase.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Team Sites',
              scaffoldKey: _scaffoldKey,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),
            Expanded(child: _loading ? _buildLoading() : _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildLoading() => const Center(child: CircularProgressIndicator());

  Widget _buildBody() {
    if (_stateName == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'No state assigned to your profile, so team sites can\'t be shown yet.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final unclaimed = _unclaimed;
    final claimed = _claimed;
    final byCollector = <String, List<Map<String, dynamic>>>{};
    for (final s in claimed) {
      byCollector.putIfAbsent(s['accepted_by'] as String, () => []).add(s);
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: _StatPill(
                  label: 'Unclaimed',
                  value: unclaimed.length,
                  color: Colors.orange,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatPill(
                  label: 'In progress',
                  value: claimed.length - _completedCount,
                  color: AppColors.primaryBlue,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatPill(
                  label: 'Completed',
                  value: _completedCount,
                  color: Colors.green,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            'Unclaimed — ready to assign',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          if (unclaimed.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('No unclaimed sites right now.'),
            )
          else
            ...unclaimed.map(
              (site) => _UnclaimedSiteCard(
                site: site,
                busy: _assigning,
                onAssign: () => _pickCollectorAndAssign(site),
              ),
            ),
          const SizedBox(height: 24),
          Text(
            'Team activity',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          if (byCollector.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('No team member has an active site yet.'),
            )
          else
            ...byCollector.entries.map(
              (e) => _CollectorActivityCard(
                name: _memberName(e.key),
                sites: e.value,
              ),
            ),
        ],
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  final String label;
  final int value;
  final Color color;

  const _StatPill({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Column(
        children: [
          Text(
            '$value',
            style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 18),
          ),
          Text(label, style: TextStyle(color: color, fontSize: 11)),
        ],
      ),
    );
  }
}

class _UnclaimedSiteCard extends StatelessWidget {
  final Map<String, dynamic> site;
  final bool busy;
  final VoidCallback onAssign;

  const _UnclaimedSiteCard({
    required this.site,
    required this.busy,
    required this.onAssign,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    site['site_name'] as String? ?? 'Unnamed site',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    site['locality'] as String? ?? site['state'] as String? ?? '',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: busy ? null : onAssign,
              child: const Text('Assign'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CollectorActivityCard extends StatelessWidget {
  final String name;
  final List<Map<String, dynamic>> sites;

  const _CollectorActivityCard({required this.name, required this.sites});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ExpansionTile(
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${sites.length} site${sites.length == 1 ? '' : 's'}'),
        children: sites
            .map(
              (s) => ListTile(
                dense: true,
                title: Text(s['site_name'] as String? ?? 'Unnamed site'),
                trailing: Text(
                  s['status'] as String? ?? '',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}
