import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class MmpScreen extends ConsumerStatefulWidget {
  const MmpScreen({super.key});
  @override
  ConsumerState<MmpScreen> createState() => _MmpScreenState();
}

class _MmpScreenState extends ConsumerState<MmpScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _mmps = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final client = Supabase.instance.client;
      var query = client.from('mmp_files').select('id, name, status, hub, state, month, cycle_status, created_at, project:projects(name)');

      if (user.isDataCollector || user.isCoordinator) {
        if (user.state != null) query = query.eq('state', user.state!);
      } else if (user.isSupervisor) {
        if (user.hub != null) query = query.eq('hub', user.hub!);
      }

      final data = await query.order('created_at', ascending: false).limit(100);
      setState(() { _mmps = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.isEmpty) return _mmps;
    final q = _search.toLowerCase();
    return _mmps.where((m) =>
      (m['name'] as String? ?? '').toLowerCase().contains(q) ||
      (m['hub'] as String? ?? '').toLowerCase().contains(q) ||
      (m['state'] as String? ?? '').toLowerCase().contains(q)
    ).toList();
  }

  List<Map<String, dynamic>> _byStatus(String status) =>
      _filtered.where((m) => (m['cycle_status'] ?? m['status']) == status).toList();

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final title = (user?.isDataCollector == true || user?.isCoordinator == true || user?.isSupervisor == true)
        ? 'My Sites' : 'MMP Management';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(96),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: TextField(
                  onChanged: (v) => setState(() => _search = v),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Search MMP files...',
                    hintStyle: const TextStyle(color: Colors.white60),
                    prefixIcon: const Icon(Icons.search, color: Colors.white60, size: 20),
                    filled: true, fillColor: Colors.white.withOpacity(0.15),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  ),
                ),
              ),
              TabBar(
                controller: _tabs,
                labelColor: Colors.white,
                unselectedLabelColor: Colors.white60,
                indicatorColor: Colors.white,
                tabs: [
                  Tab(text: 'Active (${_byStatus('active').length})'),
                  Tab(text: 'Pending (${_byStatus('pending').length})'),
                  Tab(text: 'Closed'),
                ],
              ),
            ],
          ),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
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
                      _MmpList(mmps: _byStatus('active')),
                      _MmpList(mmps: [..._byStatus('pending'), ..._byStatus('pending_fom_approval'), ..._byStatus('pending_coordinator')]),
                      _MmpList(mmps: _byStatus('closed')),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _MmpList extends StatelessWidget {
  final List<Map<String, dynamic>> mmps;
  const _MmpList({required this.mmps});

  @override
  Widget build(BuildContext context) {
    if (mmps.isEmpty) return const Center(child: Text('No MMP files', style: TextStyle(color: AppColors.textSecondary)));
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: mmps.length,
        itemBuilder: (_, i) {
          final m = mmps[i];
          final status = (m['cycle_status'] ?? m['status']) as String? ?? 'pending';
          final project = (m['project'] as Map?)?['name'] as String?;
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: InkWell(
              onTap: () => context.push('/mmp/${m['id']}'),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(m['name'] as String? ?? 'MMP File', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                        StatusBadge(status: status),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(children: [
                      if (m['hub'] != null) ...[
                        const Icon(Icons.location_city_outlined, size: 13, color: AppColors.textSecondary),
                        const SizedBox(width: 4),
                        Text(m['hub']!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        const SizedBox(width: 12),
                      ],
                      if (m['month'] != null) ...[
                        const Icon(Icons.calendar_month_outlined, size: 13, color: AppColors.textSecondary),
                        const SizedBox(width: 4),
                        Text(m['month']!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                      ],
                    ]),
                    if (project != null) ...[
                      const SizedBox(height: 4),
                      Text(project, style: const TextStyle(fontSize: 12, color: AppColors.primary)),
                    ],
                    const SizedBox(height: 10),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text('View Details', style: TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w500)),
                        SizedBox(width: 4),
                        Icon(Icons.arrow_forward_ios, size: 12, color: AppColors.primary),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
