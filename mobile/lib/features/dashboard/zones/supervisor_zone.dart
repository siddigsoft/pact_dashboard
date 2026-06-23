import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/services/auth_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../../shared/widgets/app_stat_card.dart';
import '../../../shared/widgets/status_badge.dart';

class SupervisorZone extends ConsumerStatefulWidget {
  const SupervisorZone({super.key});
  @override
  ConsumerState<SupervisorZone> createState() => _SupervisorZoneState();
}

class _SupervisorZoneState extends ConsumerState<SupervisorZone> {
  Map<String, int> _stats = {};
  List<Map<String, dynamic>> _pendingApprovals = [];
  int _pendingCosts = 0;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('site_visits').select('id, status').eq('hub', user.hub ?? ''),
        client.from('operational_cost_submissions').select('id').eq('tier1_status', 'pending'),
      ]);
      final visits = List<Map<String, dynamic>>.from(results[0]);
      setState(() {
        _stats = {
          'total': visits.length,
          'completed': visits.where((v) => ['completed','verified'].contains(v['status'])).length,
          'in_progress': visits.where((v) => v['status'] == 'inProgress').length,
          'overdue': 0,
        };
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
          _header(user?.hub ?? 'Hub'),
          const SizedBox(height: 16),
          _statsGrid(),
          const SizedBox(height: 16),
          _actionCards(context),
          const SizedBox(height: 16),
          _quickActions(context),
        ],
      ),
    );
  }

  Widget _header(String hubName) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Hub Overview', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
      Text('Hub: $hubName', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
    ],
  );

  Widget _statsGrid() => GridView.count(
    crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
    mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.5,
    children: [
      AppStatCard(label: 'Total (Hub)', value: '${_stats['total'] ?? 0}', icon: Icons.location_on_outlined, color: AppColors.primary),
      AppStatCard(label: 'Completed', value: '${_stats['completed'] ?? 0}', icon: Icons.check_circle_outline, color: AppColors.success),
      AppStatCard(label: 'In Progress', value: '${_stats['in_progress'] ?? 0}', icon: Icons.play_circle_outline, color: AppColors.accent),
      AppStatCard(label: 'Pending T1 Costs', value: '$_pendingCosts', icon: Icons.inbox_outlined, color: AppColors.warning),
    ],
  );

  Widget _actionCards(BuildContext context) => Row(
    children: [
      Expanded(child: _ActionCard(
        title: 'Approvals Hub',
        subtitle: 'Pending cost approvals',
        icon: Icons.inbox_outlined,
        color: AppColors.warning,
        onTap: () => context.go(AppRoutes.approvals),
      )),
      const SizedBox(width: 12),
      Expanded(child: _ActionCard(
        title: 'Site Verification',
        subtitle: 'Review completed sites',
        icon: Icons.verified_outlined,
        color: AppColors.supervisorColor,
        onTap: () => context.go(AppRoutes.siteVerification),
      )),
    ],
  );

  Widget _quickActions(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text('Actions', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
      const SizedBox(height: 12),
      _QuickActionTile(Icons.map_outlined, 'Field Ops Hub', 'Monitor all visits', () => context.go(AppRoutes.fieldOps)),
      _QuickActionTile(Icons.receipt_outlined, 'Cost Submission', 'Submit or review costs', () => context.go(AppRoutes.costSubmission)),
      _QuickActionTile(Icons.list_alt_outlined, 'MMP Management', 'View hub MMP cycles', () => context.go(AppRoutes.mmp)),
      _QuickActionTile(Icons.close_rounded, 'Close Cycle', 'Initiate MMP cycle closure', () => context.go(AppRoutes.cyclClose)),
    ],
  );
}

class _ActionCard extends StatelessWidget {
  final String title, subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _ActionCard({required this.title, required this.subtitle, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: color, fontSize: 14)),
          Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    ),
  );
}

class _QuickActionTile extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  const _QuickActionTile(this.icon, this.title, this.subtitle, this.onTap);

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textSecondary),
      onTap: onTap,
    ),
  );
}
