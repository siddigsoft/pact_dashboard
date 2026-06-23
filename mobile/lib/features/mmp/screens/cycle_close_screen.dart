import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class CycleCloseScreen extends ConsumerStatefulWidget {
  const CycleCloseScreen({super.key});
  @override
  ConsumerState<CycleCloseScreen> createState() => _CycleCloseScreenState();
}

class _CycleCloseScreenState extends ConsumerState<CycleCloseScreen> {
  List<Map<String, dynamic>> _cycles = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      var query = Supabase.instance.client.from('mmp_files').select('id, name, hub, month, cycle_status, sites_total, sites_completed');
      if (user.isSupervisor && user.hub != null) query = query.eq('hub', user.hub!).eq('cycle_status', 'active');
      else if (user.isFOM) query = query.inFilter('cycle_status', ['active', 'pending_close']);
      final data = await query.order('month', ascending: false).limit(30);
      setState(() { _cycles = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _initiateClose(String id) async {
    try {
      await Supabase.instance.client.from('mmp_files').update({
        'cycle_status': 'pending_close',
        'close_initiated_at': DateTime.now().toIso8601String(),
      }).eq('id', id);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cycle close initiated — awaiting FOM approval'), backgroundColor: AppColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    }
  }

  Future<void> _approveCycleClose(String id) async {
    try {
      await Supabase.instance.client.from('mmp_files').update({
        'cycle_status': 'closed',
        'closed_at': DateTime.now().toIso8601String(),
      }).eq('id', id);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Cycle closed!'), backgroundColor: AppColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isFOM = user?.isFOM ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cycle Close'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _cycles.isEmpty
                    ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.done_all, size: 48, color: AppColors.textDisabled),
                        SizedBox(height: 12),
                        Text('No active cycles to close', style: TextStyle(color: AppColors.textSecondary)),
                      ]))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _cycles.length,
                          itemBuilder: (_, i) {
                            final c = _cycles[i];
                            final status = c['cycle_status'] as String? ?? 'active';
                            final total = (c['sites_total'] as int?) ?? 0;
                            final completed = (c['sites_completed'] as int?) ?? 0;
                            final pct = total > 0 ? (completed / total * 100).round() : 0;
                            final isPendingClose = status == 'pending_close';

                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    Expanded(child: Text(c['name'] as String? ?? 'Cycle', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: isPendingClose ? AppColors.warning.withOpacity(0.1) : AppColors.primary.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(isPendingClose ? 'Pending Close' : 'Active', style: TextStyle(color: isPendingClose ? AppColors.warning : AppColors.primary, fontSize: 11, fontWeight: FontWeight.w600)),
                                    ),
                                  ]),
                                  const SizedBox(height: 8),
                                  Text('${c['hub'] ?? ''} • ${c['month'] ?? ''}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                                  const SizedBox(height: 12),
                                  Row(children: [
                                    const Text('Coverage: ', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                                    Expanded(child: ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: LinearProgressIndicator(
                                        value: pct / 100,
                                        backgroundColor: AppColors.border,
                                        color: pct >= 90 ? AppColors.success : pct >= 60 ? AppColors.warning : AppColors.error,
                                        minHeight: 8,
                                      ),
                                    )),
                                    const SizedBox(width: 8),
                                    Text('$pct%', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                  ]),
                                  const SizedBox(height: 12),
                                  if (!isFOM && !isPendingClose)
                                    SizedBox(width: double.infinity, child: OutlinedButton.icon(
                                      onPressed: () => _initiateClose(c['id'] as String),
                                      icon: const Icon(Icons.lock_outline, size: 16),
                                      label: const Text('Initiate Cycle Close'),
                                    ))
                                  else if (isFOM && isPendingClose)
                                    SizedBox(width: double.infinity, child: ElevatedButton.icon(
                                      onPressed: () => _approveCycleClose(c['id'] as String),
                                      icon: const Icon(Icons.check_circle_outline, size: 16),
                                      label: const Text('Approve & Close Cycle'),
                                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                                    ))
                                  else if (isPendingClose)
                                    const Row(children: [
                                      Icon(Icons.hourglass_top_outlined, color: AppColors.warning, size: 16),
                                      SizedBox(width: 8),
                                      Text('Awaiting FOM approval to close', style: TextStyle(color: AppColors.warning, fontSize: 13, fontWeight: FontWeight.w500)),
                                    ]),
                                ]),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
