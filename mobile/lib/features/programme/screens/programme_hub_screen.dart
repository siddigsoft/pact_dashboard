import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';

class ProgrammeHubScreen extends ConsumerStatefulWidget {
  const ProgrammeHubScreen({super.key});
  @override
  ConsumerState<ProgrammeHubScreen> createState() => _ProgrammeHubScreenState();
}

class _ProgrammeHubScreenState extends ConsumerState<ProgrammeHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _projects = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final data = await Supabase.instance.client
          .from('projects')
          .select('id, name, project_code, status, health_score, start_date, end_date, stage')
          .order('created_at', ascending: false)
          .limit(50);
      setState(() { _projects = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Programme Hub'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: const [Tab(text: 'Projects'), Tab(text: 'Portfolio'), Tab(text: 'Analytics')],
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
                      _ProjectsTab(projects: _projects),
                      _PortfolioTab(projects: _projects),
                      _ProgrammeAnalyticsTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _ProjectsTab extends StatelessWidget {
  final List<Map<String, dynamic>> projects;
  const _ProjectsTab({required this.projects});

  @override
  Widget build(BuildContext context) {
    if (projects.isEmpty) return const Center(child: Text('No projects', style: TextStyle(color: AppColors.textSecondary)));
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: projects.length,
        itemBuilder: (_, i) {
          final p = projects[i];
          final status = p['status'] as String? ?? 'active';
          final health = (p['health_score'] as num?)?.toInt() ?? 0;
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p['name'] as String? ?? 'Project', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    if (p['project_code'] != null) Text(p['project_code'] as String, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  ])),
                  StatusBadge(status: status),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  const Text('Health: ', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  Expanded(child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: health / 100,
                      backgroundColor: AppColors.border,
                      color: health >= 70 ? AppColors.success : health >= 40 ? AppColors.warning : AppColors.error,
                      minHeight: 8,
                    ),
                  )),
                  const SizedBox(width: 8),
                  Text('$health%', style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w700,
                    color: health >= 70 ? AppColors.success : health >= 40 ? AppColors.warning : AppColors.error,
                  )),
                ]),
                if (p['stage'] != null) ...[
                  const SizedBox(height: 6),
                  Row(children: [
                    const Icon(Icons.flag_outlined, size: 13, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text('Stage: ${p['stage']}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ]),
                ],
              ]),
            ),
          );
        },
      ),
    );
  }
}

class _PortfolioTab extends StatelessWidget {
  final List<Map<String, dynamic>> projects;
  const _PortfolioTab({required this.projects});

  @override
  Widget build(BuildContext context) {
    final active = projects.where((p) => p['status'] == 'active').length;
    final completed = projects.where((p) => p['status'] == 'completed').length;
    final avgHealth = projects.isEmpty ? 0 : (projects.map((p) => (p['health_score'] as num?)?.toInt() ?? 0).reduce((a, b) => a + b) / projects.length).round();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Portfolio Overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: _KpiCard('Active', '$active', AppColors.primary)),
          const SizedBox(width: 12),
          Expanded(child: _KpiCard('Completed', '$completed', AppColors.success)),
          const SizedBox(width: 12),
          Expanded(child: _KpiCard('Avg Health', '$avgHealth%', avgHealth >= 70 ? AppColors.success : AppColors.warning)),
        ]),
        const SizedBox(height: 20),
        const Text('Health Matrix', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(height: 12),
        ...projects.take(10).map((p) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Expanded(child: Text(p['name'] as String? ?? '', style: const TextStyle(fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 12),
            SizedBox(width: 60, child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: ((p['health_score'] as num?)?.toInt() ?? 0) / 100,
                backgroundColor: AppColors.border,
                color: AppColors.success,
                minHeight: 6,
              ),
            )),
            const SizedBox(width: 8),
            Text('${(p['health_score'] as num?)?.toInt() ?? 0}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
        )),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label, value;
  final Color color;
  const _KpiCard(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(children: [
      Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 20, color: color)),
      const SizedBox(height: 4),
      Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary), textAlign: TextAlign.center),
    ]),
  );
}

class _ProgrammeAnalyticsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Center(child: Padding(
    padding: EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.analytics_outlined, size: 48, color: AppColors.textDisabled),
      SizedBox(height: 16),
      Text('Programme Analytics', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      SizedBox(height: 8),
      Text('Cross-project metrics, budget utilization, and milestone tracking.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.textSecondary)),
    ]),
  ));
}
