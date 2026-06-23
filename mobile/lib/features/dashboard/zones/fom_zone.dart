import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../auth/services/auth_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../../shared/widgets/app_stat_card.dart';
import '../../../shared/widgets/status_badge.dart';

class FomZone extends ConsumerStatefulWidget {
  const FomZone({super.key});
  @override
  ConsumerState<FomZone> createState() => _FomZoneState();
}

class _FomZoneState extends ConsumerState<FomZone> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _forwardedMmps = [];
  List<Map<String, dynamic>> _sitesAtRisk = [];
  Map<String, int> _stats = {};
  bool _loading = true;

  @override
  void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('mmp_files').select('id, name, status, hub, month, workflow').eq('status', 'pending_fom_approval'),
        client.from('site_visits').select('id, status').limit(500),
        client.from('operational_cost_submissions').select('id').or('tier1_status.eq.pending,tier2_status.eq.pending'),
      ]);
      final mmps = List<Map<String, dynamic>>.from(results[0]);
      final visits = List<Map<String, dynamic>>.from(results[1]);
      setState(() {
        _forwardedMmps = mmps;
        _stats = {
          'total': visits.length,
          'completed': visits.where((v) => ['completed','verified'].contains(v['status'])).length,
          'pending_mmps': mmps.length,
          'pending_costs': 0,
        };
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildHeader()),
          SliverToBoxAdapter(child: _buildStats()),
          if (_sitesAtRisk.isNotEmpty) SliverToBoxAdapter(child: _buildRiskAlert()),
          SliverToBoxAdapter(child: _buildQuickActions(context)),
          SliverToBoxAdapter(child: _buildTabBar()),
          SliverFillRemaining(child: _buildTabViews(context)),
        ],
      ),
    );
  }

  Widget _buildHeader() => Padding(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('FOM Dashboard', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        Text('Field Operations Manager', style: TextStyle(color: AppColors.fomColor, fontSize: 13, fontWeight: FontWeight.w500)),
      ],
    ),
  );

  Widget _buildStats() => Padding(
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
    child: GridView.count(
      crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.5,
      children: [
        AppStatCard(label: 'Total Visits', value: '${_stats['total'] ?? 0}', icon: Icons.location_on_outlined, color: AppColors.primary),
        AppStatCard(label: 'Completed', value: '${_stats['completed'] ?? 0}', icon: Icons.check_circle_outline, color: AppColors.success),
        AppStatCard(label: 'Pending MMPs', value: '${_stats['pending_mmps'] ?? 0}', icon: Icons.folder_outlined, color: AppColors.fomColor, onTap: () {}),
        AppStatCard(label: 'Pending Costs', value: '${_stats['pending_costs'] ?? 0}', icon: Icons.receipt_outlined, color: AppColors.warning),
      ],
    ),
  );

  Widget _buildRiskAlert() => Container(
    margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: AppColors.error.withOpacity(0.08),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.error.withOpacity(0.3)),
    ),
    child: Row(
      children: [
        const Icon(Icons.warning_outlined, color: AppColors.error, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Text('${_sitesAtRisk.length} sites at risk — cycle closing soon', style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600))),
      ],
    ),
  );

  Widget _buildQuickActions(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Quick Actions', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: ElevatedButton.icon(
            onPressed: () => context.go(AppRoutes.approvals),
            icon: const Icon(Icons.inbox_outlined, size: 16),
            label: const Text('Approvals'),
          )),
          const SizedBox(width: 12),
          Expanded(child: OutlinedButton.icon(
            onPressed: () => context.go(AppRoutes.mmp),
            icon: const Icon(Icons.folder_outlined, size: 16),
            label: const Text('MMP Files'),
          )),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: OutlinedButton.icon(
            onPressed: () => context.go(AppRoutes.financeHub),
            icon: const Icon(Icons.attach_money, size: 16),
            label: const Text('Finance Hub'),
          )),
          const SizedBox(width: 12),
          Expanded(child: OutlinedButton.icon(
            onPressed: () => context.go(AppRoutes.fieldOps),
            icon: const Icon(Icons.map_outlined, size: 16),
            label: const Text('Field Map'),
          )),
        ]),
      ],
    ),
  );

  Widget _buildTabBar() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: TabBar(
      controller: _tabs,
      tabs: const [Tab(text: 'Forwarded MMPs'), Tab(text: 'All MMPs'), Tab(text: 'Finance')],
    ),
  );

  Widget _buildTabViews(BuildContext context) => TabBarView(
    controller: _tabs,
    children: [
      _MmpList(mmps: _forwardedMmps, showApprove: true),
      _AllMmpsTab(),
      _FinanceTab(),
    ],
  );
}

class _MmpList extends StatelessWidget {
  final List<Map<String, dynamic>> mmps;
  final bool showApprove;
  const _MmpList({required this.mmps, this.showApprove = false});

  @override
  Widget build(BuildContext context) {
    if (mmps.isEmpty) return const Center(child: Text('No pending MMP files', style: TextStyle(color: AppColors.textSecondary)));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: mmps.length,
      itemBuilder: (context, i) {
        final m = mmps[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: ListTile(
            leading: const CircleAvatar(backgroundColor: AppColors.fomColor, child: Icon(Icons.folder_outlined, color: Colors.white, size: 18)),
            title: Text(m['name'] as String? ?? 'MMP File', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${m['hub'] ?? ''} • ${m['month'] ?? ''}'),
            trailing: showApprove
                ? ElevatedButton(
                    onPressed: () => context.push('/mmp/${m['id']}'),
                    style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), backgroundColor: AppColors.success),
                    child: const Text('Review', style: TextStyle(fontSize: 12)),
                  )
                : StatusBadge(status: m['status'] as String? ?? 'pending'),
            onTap: () => context.push('/mmp/${m['id']}'),
          ),
        );
      },
    );
  }
}

class _AllMmpsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.folder_outlined, size: 48, color: AppColors.textDisabled),
      const SizedBox(height: 12),
      const Text('All MMP Files', style: TextStyle(color: AppColors.textSecondary)),
      const SizedBox(height: 16),
      ElevatedButton(onPressed: () => context.go(AppRoutes.mmp), child: const Text('Open MMP Management')),
    ]),
  );
}

class _FinanceTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.attach_money, size: 48, color: AppColors.textDisabled),
      const SizedBox(height: 12),
      const Text('Finance Overview', style: TextStyle(color: AppColors.textSecondary)),
      const SizedBox(height: 16),
      ElevatedButton(onPressed: () => context.go(AppRoutes.financeHub), child: const Text('Open Finance Hub')),
    ]),
  );
}
