import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class SiteVisitDetailScreen extends ConsumerStatefulWidget {
  final String visitId;
  const SiteVisitDetailScreen({super.key, required this.visitId});

  @override
  ConsumerState<SiteVisitDetailScreen> createState() => _SiteVisitDetailScreenState();
}

class _SiteVisitDetailScreenState extends ConsumerState<SiteVisitDetailScreen> {
  Map<String, dynamic>? _visit;
  bool _loading = true;
  bool _starting = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final data = await Supabase.instance.client
          .from('site_visits')
          .select('*, mmp_files(name, hub), profiles!assigned_to(name, phone)')
          .eq('id', widget.visitId)
          .maybeSingle();
      setState(() { _visit = data; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _startVisit() async {
    setState(() => _starting = true);
    try {
      await Supabase.instance.client
          .from('site_visits')
          .update({ 'status': 'inProgress', 'started_at': DateTime.now().toIso8601String() })
          .eq('id', widget.visitId);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Visit started!'), backgroundColor: AppColors.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error),
      );
    } finally { if (mounted) setState(() => _starting = false); }
  }

  Future<void> _openNavigation() async {
    final loc = _visit?['location'];
    if (loc == null) return;
    double? lat, lng;
    if (loc is Map) {
      lat = (loc['latitude'] ?? loc['lat'])?.toDouble();
      lng = (loc['longitude'] ?? loc['lng'])?.toDouble();
    }
    if (lat == null || lng == null) return;
    final uri = Uri.parse('https://maps.google.com/?q=$lat,$lng');
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isDataCollector = user?.isDataCollector ?? false;
    final status = _visit?['status'] as String? ?? 'assigned';

    return Scaffold(
      appBar: AppBar(
        title: Text(_visit?['site_name'] as String? ?? 'Site Visit'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _visit == null
              ? const Center(child: Text('Visit not found'))
              : Column(
                  children: [
                    const OfflineBanner(),
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _buildStatusCard(status),
                            const SizedBox(height: 16),
                            _buildInfoCard(),
                            const SizedBox(height: 16),
                            if (_visit?['notes'] != null) _buildNotesCard(),
                            const SizedBox(height: 16),
                            _buildActions(context, isDataCollector, status, user),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildStatusCard(String status) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_visit?['site_name'] as String? ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              StatusBadge(status: status, fontSize: 13),
            ],
          ),
          if (_visit?['due_date'] != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.calendar_today_outlined, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(_formatDate(_visit!['due_date']), style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            ]),
          ],
        ],
      ),
    ),
  );

  Widget _buildInfoCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Details', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const Divider(),
          _row('Hub', _visit?['hub']),
          _row('State', _visit?['state']),
          _row('Locality', _visit?['locality']),
          _row('Priority', _visit?['priority']),
          _row('MMP', (_visit?['mmp_files'] as Map?)?['name']),
          if (_visit?['location'] != null) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _openNavigation,
              icon: const Icon(Icons.navigation_outlined, size: 16),
              label: const Text('Open in Maps'),
            ),
          ],
        ],
      ),
    ),
  );

  Widget _buildNotesCard() => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Notes', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 8),
          Text(_visit?['notes'] as String? ?? '', style: const TextStyle(color: AppColors.textSecondary)),
        ],
      ),
    ),
  );

  Widget _buildActions(BuildContext context, bool isDataCollector, String status, dynamic user) {
    if (!isDataCollector) {
      return OutlinedButton(onPressed: () => context.pop(), child: const Text('Back'));
    }
    if (status == 'inProgress') {
      return ElevatedButton.icon(
        onPressed: () => context.push('/site-visits/${widget.visitId}/complete'),
        icon: const Icon(Icons.check_circle_outline),
        label: const Text('Complete Visit'),
        style: ElevatedButton.styleFrom(backgroundColor: AppColors.success, minimumSize: const Size(double.infinity, 50)),
      );
    }
    if (status == 'assigned' || status == 'dispatched' || status == 'permitVerified') {
      return ElevatedButton.icon(
        onPressed: _starting ? null : _startVisit,
        icon: _starting ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.play_arrow),
        label: const Text('Start Visit'),
        style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, minimumSize: const Size(double.infinity, 50)),
      );
    }
    return StatusBadge(status: status, fontSize: 14);
  }

  Widget _row(String label, dynamic value) {
    if (value == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 90, child: Text('$label:', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
          Expanded(child: Text(value.toString(), style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
        ],
      ),
    );
  }

  String _formatDate(dynamic v) {
    try { final d = DateTime.parse(v.toString()); return '${d.day}/${d.month}/${d.year}'; } catch (_) { return v.toString(); }
  }
}
