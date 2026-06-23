import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/services/auth_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../../shared/widgets/app_stat_card.dart';
import '../../../shared/widgets/status_badge.dart';

class CoordinatorZone extends ConsumerStatefulWidget {
  const CoordinatorZone({super.key});
  @override
  ConsumerState<CoordinatorZone> createState() => _CoordinatorZoneState();
}

class _CoordinatorZoneState extends ConsumerState<CoordinatorZone> {
  Map<String, int> _stats = {};
  List<Map<String, dynamic>> _dispatchedSites = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('site_visits').select('id, status').eq('state', user.state ?? ''),
        client.from('site_visits').select('id, site_name, status, due_date, assigned_to, state, locality')
            .eq('state', user.state ?? '').eq('status', 'dispatched'),
      ]);
      final all = List<Map<String, dynamic>>.from(results[0]);
      final dispatched = List<Map<String, dynamic>>.from(results[1]);
      setState(() {
        _stats = {
          'total': all.length,
          'completed': all.where((v) => ['completed','verified'].contains(v['status'])).length,
          'pending': all.where((v) => ['pending','assigned','dispatched'].contains(v['status'])).length,
          'overdue': 0,
        };
        _dispatchedSites = dispatched;
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final user = ref.watch(currentUserProvider);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _header(user?.state ?? 'State'),
          const SizedBox(height: 16),
          _statsGrid(),
          const SizedBox(height: 16),
          _quickActions(context),
          const SizedBox(height: 16),
          _dispatchedSitesList(context),
        ],
      ),
    );
  }

  Widget _header(String stateName) => Row(
    children: [
      Expanded(child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Coordination Overview', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          Text('State: $stateName', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        ],
      )),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: AppColors.coordinatorColor.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
        child: Text(stateName, style: const TextStyle(color: AppColors.coordinatorColor, fontWeight: FontWeight.w600, fontSize: 12)),
      ),
    ],
  );

  Widget _statsGrid() => GridView.count(
    crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.5,
    children: [
      AppStatCard(label: 'Total Sites', value: '${_stats['total'] ?? 0}', icon: Icons.location_on_outlined, color: AppColors.primary),
      AppStatCard(label: 'Completed', value: '${_stats['completed'] ?? 0}', icon: Icons.check_circle_outline, color: AppColors.success),
      AppStatCard(label: 'Pending', value: '${_stats['pending'] ?? 0}', icon: Icons.pending_outlined, color: AppColors.warning),
      AppStatCard(label: 'Dispatched', value: '${_dispatchedSites.length}', icon: Icons.send_outlined, color: AppColors.accent),
    ],
  );

  Widget _quickActions(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Quick Actions', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: OutlinedButton.icon(
          onPressed: () => context.go(AppRoutes.siteVerification),
          icon: const Icon(Icons.verified_outlined, size: 16),
          label: const Text('Site Verification'),
        )),
        const SizedBox(width: 12),
        Expanded(child: OutlinedButton.icon(
          onPressed: () => context.go(AppRoutes.costSubmission),
          icon: const Icon(Icons.receipt_outlined, size: 16),
          label: const Text('Cost Submit'),
        )),
      ]),
    ],
  );

  Widget _dispatchedSitesList(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Dispatched Sites — Awaiting Claim', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
      const SizedBox(height: 12),
      if (_dispatchedSites.isEmpty)
        const Center(child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('No dispatched sites', style: TextStyle(color: AppColors.textSecondary)),
        ))
      else
        ..._dispatchedSites.map((v) => Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: ListTile(
            leading: const CircleAvatar(backgroundColor: AppColors.coordinatorColor, child: Icon(Icons.location_on, color: Colors.white, size: 18)),
            title: Text(v['site_name'] as String? ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(v['locality'] as String? ?? v['state'] as String? ?? ''),
            trailing: StatusBadge(status: v['status'] as String? ?? 'dispatched'),
            onTap: () => context.push('/site-visits/${v['id']}'),
          ),
        )),
    ],
  );
}
