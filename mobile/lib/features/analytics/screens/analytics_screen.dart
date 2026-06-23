import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});
  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Map<String, dynamic> _overview = {};
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
      var query = client.from('site_visits').select('status, hub, state');
      if (user.isCoordinator && user.state != null) query = query.eq('state', user.state!);
      else if (user.isSupervisor && user.hub != null) query = query.eq('hub', user.hub!);
      final visits = List<Map<String, dynamic>>.from(await query.limit(500));
      setState(() {
        _overview = {
          'total': visits.length,
          'completed': visits.where((v) => ['completed','verified'].contains(v['status'])).length,
          'in_progress': visits.where((v) => v['status'] == 'inProgress').length,
          'pending': visits.where((v) => ['pending','assigned','dispatched'].contains(v['status'])).length,
        };
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics Hub'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: const [Tab(text: 'Overview'), Tab(text: 'Field Ops'), Tab(text: 'Reports')],
        ),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _OverviewTab(overview: _overview),
                      _FieldOpsTab(overview: _overview),
                      _ReportsTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  final Map<String, dynamic> overview;
  const _OverviewTab({required this.overview});

  @override
  Widget build(BuildContext context) {
    final total = (overview['total'] as int?) ?? 0;
    final completed = (overview['completed'] as int?) ?? 0;
    final pct = total == 0 ? 0 : ((completed / total) * 100).round();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Operational Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        _BigStat('$pct%', 'Overall Completion', AppColors.primary),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: _SmallStat('Total', '${overview['total'] ?? 0}', AppColors.primary)),
          const SizedBox(width: 12),
          Expanded(child: _SmallStat('Completed', '${overview['completed'] ?? 0}', AppColors.success)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _SmallStat('In Progress', '${overview['in_progress'] ?? 0}', AppColors.accent)),
          const SizedBox(width: 12),
          Expanded(child: _SmallStat('Pending', '${overview['pending'] ?? 0}', AppColors.warning)),
        ]),
      ],
    );
  }
}

class _BigStat extends StatelessWidget {
  final String value, label;
  final Color color;
  const _BigStat(this.value, this.label, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      gradient: LinearGradient(colors: [color.withOpacity(0.1), color.withOpacity(0.05)]),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(children: [
      Text(value, style: TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: color)),
      Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 16)),
    ]),
  );
}

class _SmallStat extends StatelessWidget {
  final String label, value;
  final Color color;
  const _SmallStat(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(children: [
      Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 24, color: color)),
      Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
    ]),
  );
}

class _FieldOpsTab extends StatelessWidget {
  final Map<String, dynamic> overview;
  const _FieldOpsTab({required this.overview});
  @override
  Widget build(BuildContext context) {
    final total = (overview['total'] as int?) ?? 1;
    final completed = (overview['completed'] as int?) ?? 0;
    final inProgress = (overview['in_progress'] as int?) ?? 0;
    final pending = (overview['pending'] as int?) ?? 0;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Field Operations Breakdown', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 20),
        _ProgressRow('Completed', completed, total, AppColors.success),
        const SizedBox(height: 12),
        _ProgressRow('In Progress', inProgress, total, AppColors.accent),
        const SizedBox(height: 12),
        _ProgressRow('Pending', pending, total, AppColors.warning),
      ],
    );
  }
}

class _ProgressRow extends StatelessWidget {
  final String label;
  final int count, total;
  final Color color;
  const _ProgressRow(this.label, this.count, this.total, this.color);
  @override
  Widget build(BuildContext context) {
    final pct = total == 0 ? 0.0 : count / total;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14))),
        Text('$count / $total', style: TextStyle(color: color, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 6),
      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(
        value: pct,
        backgroundColor: AppColors.border,
        color: color,
        minHeight: 10,
      )),
    ]);
  }
}

class _ReportsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text('Generate Reports', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
      const SizedBox(height: 16),
      _ReportCard('Site Visit Summary', 'Export visit completion and coverage data', Icons.table_chart_outlined, AppColors.primary),
      _ReportCard('Cost Summary', 'Financial breakdown by hub and category', Icons.attach_money, AppColors.success),
      _ReportCard('MMP Coverage Report', 'Cycle coverage and site status', Icons.location_on_outlined, AppColors.accent),
      _ReportCard('Team Performance', 'Staff productivity and completion rates', Icons.people_outlined, AppColors.fomColor),
    ],
  );
}

class _ReportCard extends StatelessWidget {
  final String title, subtitle;
  final IconData icon;
  final Color color;
  const _ReportCard(this.title, this.subtitle, this.icon, this.color);
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    child: ListTile(
      leading: CircleAvatar(backgroundColor: color.withOpacity(0.1), child: Icon(icon, color: color, size: 22)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.download_outlined, color: AppColors.textSecondary),
      onTap: () {},
    ),
  );
}
