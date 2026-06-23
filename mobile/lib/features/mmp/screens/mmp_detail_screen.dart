import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class MmpDetailScreen extends ConsumerStatefulWidget {
  final String mmpId;
  const MmpDetailScreen({super.key, required this.mmpId});
  @override
  ConsumerState<MmpDetailScreen> createState() => _MmpDetailScreenState();
}

class _MmpDetailScreenState extends ConsumerState<MmpDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Map<String, dynamic>? _mmp;
  List<Map<String, dynamic>> _entries = [];
  bool _loading = true;
  bool _approving = false;

  @override
  void initState() { super.initState(); _tabs = TabController(length: 2, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('mmp_files').select('*, project:projects(name, project_code)').eq('id', widget.mmpId).maybeSingle(),
        client.from('site_visits').select('id, site_name, status, assigned_to, due_date, locality, state').eq('mmp_file_id', widget.mmpId).order('due_date'),
      ]);
      setState(() {
        _mmp = results[0] as Map<String, dynamic>?;
        _entries = List<Map<String, dynamic>>.from(results[1]);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _approveAsFOM() async {
    setState(() => _approving = true);
    try {
      await Supabase.instance.client.from('mmp_files').update({
        'status': 'approved',
        'cycle_status': 'active',
        'fom_approved_at': DateTime.now().toIso8601String(),
      }).eq('id', widget.mmpId);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('MMP approved!'), backgroundColor: AppColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    } finally { if (mounted) setState(() => _approving = false); }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final status = (_mmp?['cycle_status'] ?? _mmp?['status']) as String? ?? 'pending';
    final isPendingFOM = status == 'pending_fom_approval' || status == 'pending';

    return Scaffold(
      appBar: AppBar(
        title: Text(_mmp?['name'] as String? ?? 'MMP Detail'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: [Tab(text: 'Overview'), Tab(text: 'Site Entries (${_entries.length})')],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                const OfflineBanner(),
                if (user?.isFOM == true && isPendingFOM)
                  Container(
                    color: AppColors.warning.withOpacity(0.1),
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(Icons.approval_outlined, color: AppColors.warning),
                        const SizedBox(width: 8),
                        const Expanded(child: Text('Awaiting your final approval', style: TextStyle(fontWeight: FontWeight.w600))),
                        ElevatedButton(
                          onPressed: _approving ? null : _approveAsFOM,
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                          child: _approving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Approve'),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: TabBarView(
                    controller: _tabs,
                    children: [
                      _buildOverview(status),
                      _buildEntries(),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildOverview(String status) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(_mmp?['name'] as String? ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          StatusBadge(status: status),
        ]),
        const SizedBox(height: 12),
        _row('Hub', _mmp?['hub']),
        _row('State', _mmp?['state']),
        _row('Month', _mmp?['month']),
        _row('Project', (_mmp?['project'] as Map?)?['name']),
        _row('Cycle Status', status),
        if (_mmp?['cycle_close_deadline'] != null) _row('Deadline', _mmp!['cycle_close_deadline']),
      ]))),
      const SizedBox(height: 16),
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Coverage', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(height: 12),
        _StatRow('Total Sites', '${_entries.length}', AppColors.primary),
        _StatRow('Completed', '${_entries.where((e) => ['completed','verified'].contains(e['status'])).length}', AppColors.success),
        _StatRow('In Progress', '${_entries.where((e) => e['status'] == 'inProgress').length}', AppColors.accent),
        _StatRow('Pending', '${_entries.where((e) => ['pending','assigned','dispatched'].contains(e['status'])).length}', AppColors.warning),
      ]))),
    ],
  );

  Widget _buildEntries() {
    if (_entries.isEmpty) return const Center(child: Text('No site entries', style: TextStyle(color: AppColors.textSecondary)));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _entries.length,
      itemBuilder: (_, i) {
        final e = _entries[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: const Icon(Icons.location_on_outlined, color: AppColors.primary),
            title: Text(e['site_name'] as String? ?? 'Site', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: Text('${e['locality'] ?? ''} • ${e['state'] ?? ''}'),
            trailing: StatusBadge(status: e['status'] as String? ?? 'pending'),
          ),
        );
      },
    );
  }

  Widget _row(String label, dynamic value) {
    if (value == null) return const SizedBox.shrink();
    return Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Row(children: [
      SizedBox(width: 90, child: Text('$label:', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
      Expanded(child: Text(value.toString(), style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
    ]));
  }
}

class _StatRow extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatRow(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 8),
      Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
      Text(value, style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 15)),
    ]),
  );
}
