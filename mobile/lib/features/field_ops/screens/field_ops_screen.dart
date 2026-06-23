import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class FieldOpsScreen extends ConsumerStatefulWidget {
  const FieldOpsScreen({super.key});
  @override
  ConsumerState<FieldOpsScreen> createState() => _FieldOpsScreenState();
}

class _FieldOpsScreenState extends ConsumerState<FieldOpsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _visits = [];
  bool _loading = true;
  String _statusFilter = 'all';

  @override
  void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      var query = client.from('site_visits').select('id, site_name, status, due_date, priority, hub, state, locality, assigned_to, assignee:profiles!assigned_to(name)');

      if (user.isDataCollector) {
        query = query.eq('assigned_to', user.id);
      } else if (user.isCoordinator && user.state != null) {
        query = query.eq('state', user.state!);
      } else if (user.isSupervisor && user.hub != null) {
        query = query.eq('hub', user.hub!);
      }

      final data = await query.order('due_date', ascending: true).limit(200);
      setState(() { _visits = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_statusFilter == 'all') return _visits;
    return _visits.where((v) => v['status'] == _statusFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canDispatch = user?.isCoordinator == true || user?.isSupervisor == true || user?.isFOM == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Field Ops Hub'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(icon: Icon(Icons.location_on_outlined, size: 18), text: 'Monitoring'),
            Tab(icon: Icon(Icons.health_and_safety_outlined, size: 18), text: 'Safety'),
            Tab(icon: Icon(Icons.people_outlined, size: 18), text: 'Team Map'),
          ],
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
                      _MonitoringTab(visits: _visits, canDispatch: canDispatch, isDataCollector: user?.isDataCollector ?? false, onRefresh: _load),
                      _SafetyTab(),
                      _TeamMapTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _MonitoringTab extends StatefulWidget {
  final List<Map<String, dynamic>> visits;
  final bool canDispatch, isDataCollector;
  final VoidCallback onRefresh;
  const _MonitoringTab({required this.visits, required this.canDispatch, required this.isDataCollector, required this.onRefresh});
  @override
  State<_MonitoringTab> createState() => _MonitoringTabState();
}

class _MonitoringTabState extends State<_MonitoringTab> {
  String _filter = 'all';

  List<Map<String, dynamic>> get _filtered {
    if (_filter == 'all') return widget.visits;
    return widget.visits.where((v) => v['status'] == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: ['all', 'assigned', 'inProgress', 'completed', 'overdue'].map((f) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(f == 'all' ? 'All' : f),
                selected: _filter == f,
                onSelected: (_) => setState(() => _filter = f),
                selectedColor: AppColors.primary,
                labelStyle: TextStyle(color: _filter == f ? Colors.white : null, fontSize: 12),
              ),
            )).toList(),
          ),
        ),
        Expanded(
          child: _filtered.isEmpty
              ? const Center(child: Text('No site visits', style: TextStyle(color: AppColors.textSecondary)))
              : RefreshIndicator(
                  onRefresh: () async => widget.onRefresh(),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final v = _filtered[i];
                      final status = v['status'] as String? ?? 'pending';
                      final assignee = (v['assignee'] as Map?)?['name'] as String?;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: InkWell(
                          onTap: () => context.push('/site-visits/${v['id']}'),
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(children: [
                                Expanded(child: Text(v['site_name'] as String? ?? 'Site', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                                StatusBadge(status: status),
                              ]),
                              const SizedBox(height: 6),
                              Row(children: [
                                const Icon(Icons.location_on_outlined, size: 13, color: AppColors.textSecondary),
                                const SizedBox(width: 4),
                                Text('${v['locality'] ?? ''} • ${v['state'] ?? ''}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              ]),
                              if (assignee != null) ...[
                                const SizedBox(height: 4),
                                Row(children: [
                                  const Icon(Icons.person_outline, size: 13, color: AppColors.textSecondary),
                                  const SizedBox(width: 4),
                                  Text(assignee, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                ]),
                              ],
                              if (widget.isDataCollector && (status == 'assigned' || status == 'dispatched')) ...[
                                const SizedBox(height: 10),
                                SizedBox(width: double.infinity, child: ElevatedButton.icon(
                                  onPressed: () => context.push('/site-visits/${v['id']}'),
                                  icon: const Icon(Icons.play_arrow, size: 18),
                                  label: const Text('Start Visit'),
                                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, padding: const EdgeInsets.symmetric(vertical: 8)),
                                )),
                              ],
                            ]),
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

class _SafetyTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text('Safety Hub', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
      const SizedBox(height: 16),
      _SafetyCard(Icons.warning_outlined, 'Report Incident', 'Report a field safety incident', AppColors.error),
      _SafetyCard(Icons.health_and_safety_outlined, 'Safety Alerts', 'View active safety alerts', AppColors.warning),
      _SafetyCard(Icons.medical_services_outlined, 'Emergency Contacts', 'Quick access to emergency numbers', AppColors.primary),
      _SafetyCard(Icons.build_outlined, 'Equipment Status', 'Track field equipment', AppColors.accent),
    ],
  );
}

class _SafetyCard extends StatelessWidget {
  final IconData icon;
  final String title, subtitle;
  final Color color;
  const _SafetyCard(this.icon, this.title, this.subtitle, this.color);
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    child: ListTile(
      leading: CircleAvatar(backgroundColor: color.withOpacity(0.1), child: Icon(icon, color: color, size: 22)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textSecondary),
      onTap: () {},
    ),
  );
}

class _TeamMapTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) => const Center(
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(Icons.map_outlined, size: 64, color: AppColors.textDisabled),
      SizedBox(height: 16),
      Text('Team Map', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
      SizedBox(height: 8),
      Text('Live field team locations', style: TextStyle(color: AppColors.textSecondary)),
      SizedBox(height: 24),
      Text('Map integration coming soon', style: TextStyle(color: AppColors.textDisabled, fontSize: 13)),
    ]),
  );
}
