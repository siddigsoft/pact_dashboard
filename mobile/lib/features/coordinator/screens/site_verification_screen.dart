import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class SiteVerificationScreen extends ConsumerStatefulWidget {
  const SiteVerificationScreen({super.key});
  @override
  ConsumerState<SiteVerificationScreen> createState() => _SiteVerificationScreenState();
}

class _SiteVerificationScreenState extends ConsumerState<SiteVerificationScreen> {
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
          .select('id, site_name, status, due_date, state, locality, hub, assignee:profiles!assigned_to(name), completed_at, completion_notes')
          .inFilter('status', ['completed', 'pending_verification']);

      if (user.isCoordinator && user.state != null) query = query.eq('state', user.state!);
      else if (user.isSupervisor && user.hub != null) query = query.eq('hub', user.hub!);

      final data = await query.order('completed_at', ascending: false).limit(100);
      setState(() { _sites = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _verify(String id, bool approved) async {
    try {
      await Supabase.instance.client.from('site_visits').update({
        'status': approved ? 'verified' : 'rejected',
        'verified_at': DateTime.now().toIso8601String(),
      }).eq('id', id);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(approved ? 'Site verified!' : 'Site rejected'), backgroundColor: approved ? AppColors.success : AppColors.error),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Site Verification (${_sites.length})'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _sites.isEmpty
                    ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.check_circle_outline, size: 48, color: AppColors.success),
                        SizedBox(height: 12),
                        Text('No sites pending verification', style: TextStyle(color: AppColors.textSecondary)),
                      ]))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _sites.length,
                          itemBuilder: (_, i) {
                            final s = _sites[i];
                            final status = s['status'] as String? ?? 'completed';
                            final assignee = (s['assignee'] as Map?)?['name'] as String?;
                            final isPendingVerification = status != 'verified' && status != 'rejected';
                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    Expanded(child: Text(s['site_name'] as String? ?? 'Site', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                                    StatusBadge(status: status),
                                  ]),
                                  const SizedBox(height: 8),
                                  if (assignee != null) Row(children: [
                                    const Icon(Icons.person_outline, size: 13, color: AppColors.textSecondary),
                                    const SizedBox(width: 4),
                                    Text(assignee, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                  ]),
                                  Row(children: [
                                    const Icon(Icons.location_on_outlined, size: 13, color: AppColors.textSecondary),
                                    const SizedBox(width: 4),
                                    Text('${s['locality'] ?? ''} • ${s['state'] ?? ''}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                  ]),
                                  if (s['completion_notes'] != null) ...[
                                    const SizedBox(height: 8),
                                    Text(s['completion_notes'] as String, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  ],
                                  if (isPendingVerification) ...[
                                    const SizedBox(height: 12),
                                    Row(children: [
                                      Expanded(child: OutlinedButton.icon(
                                        onPressed: () => _verify(s['id'] as String, false),
                                        icon: const Icon(Icons.close, size: 16, color: AppColors.error),
                                        label: const Text('Reject', style: TextStyle(color: AppColors.error)),
                                        style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.error)),
                                      )),
                                      const SizedBox(width: 12),
                                      Expanded(child: ElevatedButton.icon(
                                        onPressed: () => _verify(s['id'] as String, true),
                                        icon: const Icon(Icons.verified_outlined, size: 16),
                                        label: const Text('Verify'),
                                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.success),
                                      )),
                                    ]),
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
}
