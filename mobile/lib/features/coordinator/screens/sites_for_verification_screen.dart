import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class SitesForVerificationScreen extends ConsumerStatefulWidget {
  const SitesForVerificationScreen({super.key});
  @override
  ConsumerState<SitesForVerificationScreen> createState() => _SitesForVerificationScreenState();
}

class _SitesForVerificationScreenState extends ConsumerState<SitesForVerificationScreen> {
  List<Map<String, dynamic>> _sites = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      var query = Supabase.instance.client
          .from('site_visits')
          .select('id, site_name, status, due_date, state, locality, hub, assignee:profiles!assigned_to(name)')
          .inFilter('status', ['assigned', 'dispatched', 'permitVerified', 'pending', 'pending_verification']);

      if (user.isCoordinator && user.state != null) query = query.eq('state', user.state!);
      else if (user.isSupervisor && user.hub != null) query = query.eq('hub', user.hub!);

      final data = await query.order('due_date', ascending: true).limit(100);
      setState(() { _sites = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _dispatch(String id) async {
    try {
      await Supabase.instance.client.from('site_visits').update({
        'status': 'dispatched',
        'dispatched_at': DateTime.now().toIso8601String(),
      }).eq('id', id);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Site dispatched'), backgroundColor: AppColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Sites for Verification (${_sites.length})'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _sites.isEmpty
                    ? const Center(child: Text('No sites pending action', style: TextStyle(color: AppColors.textSecondary)))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _sites.length,
                          itemBuilder: (_, i) {
                            final s = _sites[i];
                            final status = s['status'] as String? ?? 'pending';
                            final assignee = (s['assignee'] as Map?)?['name'] as String?;
                            final due = s['due_date'] as String?;
                            return Card(
                              margin: const EdgeInsets.only(bottom: 10),
                              child: Padding(
                                padding: const EdgeInsets.all(14),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    Expanded(child: Text(s['site_name'] as String? ?? 'Site', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                                    StatusBadge(status: status),
                                  ]),
                                  const SizedBox(height: 6),
                                  Row(children: [
                                    const Icon(Icons.location_on_outlined, size: 13, color: AppColors.textSecondary),
                                    const SizedBox(width: 4),
                                    Text('${s['locality'] ?? ''} • ${s['state'] ?? ''}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                  ]),
                                  if (assignee != null) ...[
                                    const SizedBox(height: 4),
                                    Row(children: [
                                      const Icon(Icons.person_outline, size: 13, color: AppColors.textSecondary),
                                      const SizedBox(width: 4),
                                      Text(assignee, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                    ]),
                                  ],
                                  if (due != null) ...[
                                    const SizedBox(height: 4),
                                    Row(children: [
                                      const Icon(Icons.calendar_today_outlined, size: 13, color: AppColors.textSecondary),
                                      const SizedBox(width: 4),
                                      Text(_fmt(due), style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                    ]),
                                  ],
                                  if (status == 'assigned') ...[
                                    const SizedBox(height: 10),
                                    SizedBox(width: double.infinity, child: OutlinedButton.icon(
                                      onPressed: () => _dispatch(s['id'] as String),
                                      icon: const Icon(Icons.send_outlined, size: 16),
                                      label: const Text('Dispatch Site'),
                                    )),
                                  ],
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

  String _fmt(String iso) {
    try { final d = DateTime.parse(iso); return '${d.day}/${d.month}/${d.year}'; } catch (_) { return iso; }
  }
}
