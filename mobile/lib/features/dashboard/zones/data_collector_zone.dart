import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:geolocator/geolocator.dart';
import '../../auth/services/auth_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/offline/hive_manager.dart';
import '../../../shared/widgets/app_stat_card.dart';
import '../../../shared/widgets/status_badge.dart';

class DataCollectorZone extends ConsumerStatefulWidget {
  const DataCollectorZone({super.key});

  @override
  ConsumerState<DataCollectorZone> createState() => _DataCollectorZoneState();
}

class _DataCollectorZoneState extends ConsumerState<DataCollectorZone>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _visits = [];
  double _walletBalance = 0;
  bool _loading = true;
  bool _updatingLocation = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;

    // Load from cache first
    final cached = HiveManager.getList(HiveManager.siteVisitsBox, 'my_visits');
    if (cached.isNotEmpty) {
      setState(() { _visits = cached; _loading = false; });
    }

    try {
      final client = Supabase.instance.client;
      final data = await client
          .from('site_visits')
          .select('id, site_name, status, due_date, priority, location, completed_at, assigned_at, notes, hub, state')
          .eq('assigned_to', user.id)
          .order('due_date', ascending: true);

      final visits = List<Map<String, dynamic>>.from(data);
      HiveManager.saveList(HiveManager.siteVisitsBox, 'my_visits', visits);

      // Load wallet
      final walletData = await client
          .from('wallets')
          .select('balance_sdg')
          .eq('user_id', user.id)
          .maybeSingle();

      setState(() {
        _visits = visits;
        _walletBalance = (walletData?['balance_sdg'] as num?)?.toDouble() ?? 0;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _updateLocation() async {
    setState(() => _updatingLocation = true);
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      final user = ref.read(currentUserProvider);
      if (user == null) return;

      await Supabase.instance.client.from('profiles').update({
        'location': {
          'latitude': pos.latitude,
          'longitude': pos.longitude,
          'accuracy': pos.accuracy,
          'lastUpdated': DateTime.now().toIso8601String(),
        },
        'location_updated_at': DateTime.now().toIso8601String(),
      }).eq('id', user.id);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Location updated (±${pos.accuracy.toStringAsFixed(0)}m)'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update location'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _updatingLocation = false);
    }
  }

  List<Map<String, dynamic>> get _todayVisits {
    final today = DateTime.now();
    return _visits.where((v) {
      final due = v['due_date'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      if (d == null) return false;
      return d.year == today.year && d.month == today.month && d.day == today.day;
    }).toList();
  }

  List<Map<String, dynamic>> get _upcomingVisits {
    final today = DateTime.now();
    final in7 = today.add(const Duration(days: 7));
    return _visits.where((v) {
      final due = v['due_date'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      if (d == null) return false;
      return d.isAfter(today) && d.isBefore(in7);
    }).toList();
  }

  List<Map<String, dynamic>> get _overdueVisits {
    final now = DateTime.now();
    return _visits.where((v) {
      final due = v['due_date'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      if (d == null) return false;
      final status = v['status'] as String? ?? '';
      final terminal = ['completed', 'verified', 'cancelled'];
      return d.isBefore(now) && !terminal.contains(status.toLowerCase());
    }).toList();
  }

  int get _completedCount => _visits.where((v) {
    final s = v['status'] as String? ?? '';
    return ['completed', 'verified'].contains(s.toLowerCase());
  }).length;

  int get _completionPct => _visits.isEmpty ? 0 : ((_completedCount / _visits.length) * 100).round();

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildHeader()),
          SliverToBoxAdapter(child: _buildStats()),
          SliverToBoxAdapter(child: _buildLocationCard()),
          SliverToBoxAdapter(child: _buildTabBar()),
          SliverFillRemaining(child: _buildTabViews()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'My Field Visits',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
          ),
          OutlinedButton.icon(
            onPressed: () => context.go(AppRoutes.fieldOps),
            icon: const Icon(Icons.map_outlined, size: 16),
            label: const Text('Field Map'),
          ),
        ],
      ),
    );
  }

  Widget _buildStats() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.5,
        children: [
          AppStatCard(label: 'Total Assigned', value: '${_visits.length}', icon: Icons.assignment_outlined, color: AppColors.primary),
          AppStatCard(label: 'Completed', value: '$_completedCount', icon: Icons.check_circle_outline, color: AppColors.success),
          AppStatCard(label: 'Overdue', value: '${_overdueVisits.length}', icon: Icons.warning_outlined, color: AppColors.error),
          AppStatCard(label: 'Completion Rate', value: '$_completionPct%', icon: Icons.trending_up, color: AppColors.accent),
        ],
      ),
    );
  }

  Widget _buildLocationCard() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0F4C8B), Color(0xFF2563EB)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.my_location, color: Colors.white, size: 20),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Share Location', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15)),
                Text('Update your GPS for team map', style: TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: _updatingLocation ? null : _updateLocation,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: _updatingLocation
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Update', style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(10),
      ),
      child: TabBar(
        controller: _tabs,
        labelColor: Colors.white,
        unselectedLabelColor: AppColors.textSecondary,
        indicator: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(8),
        ),
        tabs: [
          Tab(text: 'Today (${_todayVisits.length})'),
          Tab(text: 'Upcoming'),
          Tab(text: 'Overdue (${_overdueVisits.length})'),
          Tab(text: 'Wallet'),
        ],
      ),
    );
  }

  Widget _buildTabViews() {
    return TabBarView(
      controller: _tabs,
      children: [
        _VisitList(visits: _todayVisits),
        _VisitList(visits: _upcomingVisits),
        _VisitList(visits: _overdueVisits, isOverdue: true),
        _WalletSummary(balance: _walletBalance),
      ],
    );
  }
}

class _VisitList extends StatelessWidget {
  final List<Map<String, dynamic>> visits;
  final bool isOverdue;

  const _VisitList({required this.visits, this.isOverdue = false});

  @override
  Widget build(BuildContext context) {
    if (visits.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(isOverdue ? Icons.check_circle_outline : Icons.event_available,
                size: 48, color: AppColors.textDisabled),
            const SizedBox(height: 12),
            Text(
              isOverdue ? 'No overdue visits 🎉' : 'No visits scheduled',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: visits.length,
      itemBuilder: (context, i) {
        final v = visits[i];
        final status = v['status'] as String? ?? 'assigned';
        final siteName = v['site_name'] as String? ?? 'Unknown Site';
        final dueDate = v['due_date'] as String?;
        final id = v['id'] as String;

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            onTap: () => context.push('/site-visits/$id'),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(siteName, style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15)),
                      ),
                      StatusBadge(status: status),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (dueDate != null) Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined, size: 14, color: AppColors.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        _formatDate(dueDate),
                        style: TextStyle(
                          fontSize: 13,
                          color: isOverdue ? AppColors.error : AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (status == 'assigned' || status == 'dispatched')
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => context.push('/site-visits/$id'),
                        icon: const Icon(Icons.play_arrow, size: 18),
                        label: const Text('Start Visit'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.success,
                          padding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) { return iso; }
  }
}

class _WalletSummary extends StatelessWidget {
  final double balance;

  const _WalletSummary({required this.balance});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF065F46), Color(0xFF059669)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Wallet Balance', style: TextStyle(color: Colors.white70, fontSize: 14)),
                const SizedBox(height: 8),
                Text(
                  'SDG ${balance.toStringAsFixed(0)}',
                  style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => context.go(AppRoutes.wallet),
            icon: const Icon(Icons.account_balance_wallet_outlined),
            label: const Text('View Full Wallet'),
          ),
        ],
      ),
    );
  }
}
