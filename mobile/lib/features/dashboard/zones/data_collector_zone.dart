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

  // All unified items — site visits + project activities merged
  List<Map<String, dynamic>> _allItems = [];
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

    // Load site visits from cache first for instant display
    final cached = HiveManager.getList(HiveManager.siteVisitsBox, 'my_visits');
    if (cached.isNotEmpty) {
      setState(() {
        _allItems = cached.map((v) => {...v, 'item_type': 'site_visit'}).toList();
        _loading = false;
      });
    }

    try {
      final client = Supabase.instance.client;

      // Load both in parallel — site visits AND project activities
      final results = await Future.wait([
        // Query 1: MMP site visits (existing — unchanged)
        client
            .from('site_visits')
            .select('id, site_name, status, due_date, priority, location, completed_at, assigned_at, notes, hub, state')
            .eq('assigned_to', user.id)
            .order('due_date', ascending: true),

        // Query 2: Project activity assignments for this user
        client
            .from('project_activity_assignments')
            .select('''
              id,
              activity_id,
              status,
              assignment_type,
              claimed_at,
              started_at,
              completed_at,
              activity:project_activities(
                id,
                title,
                activity_type,
                custom_type_label,
                description,
                location_hub,
                location_state,
                location_locality,
                start_date,
                end_date,
                advance_allowed,
                max_advance_per_person,
                project:projects(id, name)
              )
            ''')
            .eq('user_id', user.id)
            .not('status', 'in', '("completed","withdrawn")')
            .order('created_at', ascending: true),

        // Query 3: Wallet balance
        client
            .from('wallets')
            .select('balance_sdg')
            .eq('user_id', user.id)
            .maybeSingle(),
      ]);

      // Normalize site visits
      final siteVisits = List<Map<String, dynamic>>.from(results[0] as List)
          .map((v) => {
                ...v,
                'item_type': 'site_visit',
                'display_title': v['site_name'] ?? 'Unknown Site',
                'display_due': v['due_date'],
                'display_status': v['status'] ?? 'assigned',
                'display_location': v['hub'] ?? v['state'] ?? '',
                'display_project': 'WFP TPM',
              })
          .toList();

      // Cache site visits for offline use
      HiveManager.saveList(
          HiveManager.siteVisitsBox, 'my_visits',
          List<Map<String, dynamic>>.from(results[0] as List));

      // Normalize project activities
      final assignments = List<Map<String, dynamic>>.from(results[1] as List);
      final projectActivities = assignments
          .where((a) => a['activity'] != null)
          .map((a) {
            final act = a['activity'] as Map<String, dynamic>;
            final proj = act['project'] as Map<String, dynamic>?;
            final assignmentStatus = a['status'] as String? ?? 'assigned';
            // Map assignment status to display status
            final displayStatus = a['started_at'] != null
                ? 'in_progress'
                : assignmentStatus;
            return {
              'item_type': 'project_activity',
              'id': a['id'],                   // assignment id
              'activity_id': act['id'],
              'display_title': act['title'] ?? 'Unnamed Activity',
              'display_due': act['end_date'],
              'display_status': displayStatus,
              'display_location': act['location_hub'] ??
                  act['location_state'] ??
                  act['location_locality'] ??
                  '',
              'display_project': proj?['name'] ?? 'Project Activity',
              'activity_type': act['activity_type'] ?? 'field_assessment',
              'custom_type_label': act['custom_type_label'],
              'advance_allowed': act['advance_allowed'] ?? false,
              'max_advance': act['max_advance_per_person'],
              'project_id': proj?['id'],
              'assignment_type': a['assignment_type'],
              'started_at': a['started_at'],
              'claimed_at': a['claimed_at'],
            };
          })
          .toList();

      // Merge and sort by due date
      final merged = [...siteVisits, ...projectActivities];
      merged.sort((a, b) {
        final da = a['display_due'] as String?;
        final db = b['display_due'] as String?;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da.compareTo(db);
      });

      final walletData = results[2] as Map<String, dynamic>?;

      setState(() {
        _allItems = merged;
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
          const SnackBar(
              content: Text('Failed to update location'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _updatingLocation = false);
    }
  }

  // ── Filtering helpers ──────────────────────────────────────

  List<Map<String, dynamic>> get _todayItems {
    final today = DateTime.now();
    return _allItems.where((v) {
      final due = v['display_due'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      if (d == null) return false;
      return d.year == today.year &&
          d.month == today.month &&
          d.day == today.day;
    }).toList();
  }

  List<Map<String, dynamic>> get _upcomingItems {
    final today = DateTime.now();
    final in7 = today.add(const Duration(days: 7));
    return _allItems.where((v) {
      final due = v['display_due'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      if (d == null) return false;
      return d.isAfter(today) && d.isBefore(in7);
    }).toList();
  }

  List<Map<String, dynamic>> get _overdueItems {
    final now = DateTime.now();
    const terminal = ['completed', 'verified', 'cancelled', 'withdrawn'];
    return _allItems.where((v) {
      final due = v['display_due'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      if (d == null) return false;
      final status = (v['display_status'] as String? ?? '').toLowerCase();
      return d.isBefore(now) && !terminal.contains(status);
    }).toList();
  }

  int get _completedCount => _allItems.where((v) {
        final s = (v['display_status'] as String? ?? '').toLowerCase();
        return ['completed', 'verified'].contains(s);
      }).length;

  int get _completionPct =>
      _allItems.isEmpty ? 0 : ((_completedCount / _allItems.length) * 100).round();

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
              'My Field Activities',
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
    final siteVisitCount =
        _allItems.where((v) => v['item_type'] == 'site_visit').length;
    final activityCount =
        _allItems.where((v) => v['item_type'] == 'project_activity').length;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.5,
            children: [
              AppStatCard(
                  label: 'Total Assigned',
                  value: '${_allItems.length}',
                  icon: Icons.assignment_outlined,
                  color: AppColors.primary),
              AppStatCard(
                  label: 'Completed',
                  value: '$_completedCount',
                  icon: Icons.check_circle_outline,
                  color: AppColors.success),
              AppStatCard(
                  label: 'Overdue',
                  value: '${_overdueItems.length}',
                  icon: Icons.warning_outlined,
                  color: AppColors.error),
              AppStatCard(
                  label: 'Completion',
                  value: '$_completionPct%',
                  icon: Icons.trending_up,
                  color: AppColors.accent),
            ],
          ),
          // Type breakdown chips
          if (siteVisitCount > 0 || activityCount > 0) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (siteVisitCount > 0)
                  _TypeChip(
                      label: '$siteVisitCount Site Visit${siteVisitCount != 1 ? 's' : ''}',
                      color: AppColors.primary,
                      icon: Icons.location_on_outlined),
                if (siteVisitCount > 0 && activityCount > 0)
                  const SizedBox(width: 8),
                if (activityCount > 0)
                  _TypeChip(
                      label: '$activityCount Field Activit${activityCount != 1 ? 'ies' : 'y'}',
                      color: AppColors.accent,
                      icon: Icons.clipboard_outlined),
              ],
            ),
          ],
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
                Text('Share Location',
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 15)),
                Text('Update your GPS for team map',
                    style: TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: _updatingLocation ? null : _updateLocation,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: AppColors.primary,
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
            ),
            child: _updatingLocation
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child:
                        CircularProgressIndicator(strokeWidth: 2))
                : const Text('Update',
                    style: TextStyle(fontWeight: FontWeight.w600)),
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
          Tab(text: 'Today (${_todayItems.length})'),
          Tab(text: 'Upcoming (${_upcomingItems.length})'),
          Tab(text: 'Overdue (${_overdueItems.length})'),
          const Tab(text: 'Wallet'),
        ],
      ),
    );
  }

  Widget _buildTabViews() {
    return TabBarView(
      controller: _tabs,
      children: [
        _ItemList(items: _todayItems, onRefresh: _loadData),
        _ItemList(items: _upcomingItems, onRefresh: _loadData),
        _ItemList(items: _overdueItems, isOverdue: true, onRefresh: _loadData),
        _WalletSummary(balance: _walletBalance),
      ],
    );
  }
}

// ── Type chip badge ────────────────────────────────────────

class _TypeChip extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;

  const _TypeChip(
      {required this.label, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ── Unified item list ──────────────────────────────────────

class _ItemList extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final bool isOverdue;
  final VoidCallback onRefresh;

  const _ItemList(
      {required this.items,
      this.isOverdue = false,
      required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
                isOverdue
                    ? Icons.check_circle_outline
                    : Icons.event_available,
                size: 48,
                color: AppColors.textDisabled),
            const SizedBox(height: 12),
            Text(
              isOverdue ? 'No overdue items 🎉' : 'Nothing scheduled',
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        final type = item['item_type'] as String? ?? 'site_visit';
        if (type == 'project_activity') {
          return _ProjectActivityCard(
              item: item, isOverdue: isOverdue, onRefresh: onRefresh);
        }
        return _SiteVisitCard(item: item, isOverdue: isOverdue);
      },
    );
  }
}

// ── WFP TPM Site Visit card (unchanged behavior) ───────────

class _SiteVisitCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool isOverdue;

  const _SiteVisitCard({required this.item, this.isOverdue = false});

  @override
  Widget build(BuildContext context) {
    final status = item['display_status'] as String? ?? 'assigned';
    final siteName = item['display_title'] as String? ?? 'Unknown Site';
    final dueDate = item['display_due'] as String?;
    final id = item['id'] as String;

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
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.location_on_outlined,
                            size: 11, color: AppColors.primary),
                        SizedBox(width: 3),
                        Text('WFP TPM',
                            style: TextStyle(
                                color: AppColors.primary,
                                fontSize: 10,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(siteName,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15)),
                  ),
                  StatusBadge(status: status),
                ],
              ),
              if (dueDate != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.calendar_today_outlined,
                        size: 14, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      _formatDate(dueDate),
                      style: TextStyle(
                        fontSize: 13,
                        color: isOverdue
                            ? AppColors.error
                            : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ],
              if (status == 'assigned' || status == 'dispatched') ...[
                const SizedBox(height: 12),
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
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Project Activity card (new) ────────────────────────────

class _ProjectActivityCard extends StatefulWidget {
  final Map<String, dynamic> item;
  final bool isOverdue;
  final VoidCallback onRefresh;

  const _ProjectActivityCard(
      {required this.item,
      this.isOverdue = false,
      required this.onRefresh});

  @override
  State<_ProjectActivityCard> createState() => _ProjectActivityCardState();
}

class _ProjectActivityCardState extends State<_ProjectActivityCard> {
  bool _updating = false;

  Future<void> _startActivity() async {
    setState(() => _updating = true);
    try {
      final assignmentId = widget.item['id'] as String;
      await Supabase.instance.client
          .from('project_activity_assignments')
          .update({
            'status': 'in_progress',
            'started_at': DateTime.now().toIso8601String(),
          })
          .eq('id', assignmentId);

      widget.onRefresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Activity started!'),
              backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Error: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _completeActivity() async {
    setState(() => _updating = true);
    try {
      final assignmentId = widget.item['id'] as String;
      await Supabase.instance.client
          .from('project_activity_assignments')
          .update({
            'status': 'completed',
            'completed_at': DateTime.now().toIso8601String(),
          })
          .eq('id', assignmentId);

      widget.onRefresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Activity marked complete!'),
              backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Error: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final status = item['display_status'] as String? ?? 'assigned';
    final title = item['display_title'] as String? ?? 'Activity';
    final dueDate = item['display_due'] as String?;
    final projectName = item['display_project'] as String? ?? 'Project';
    final location = item['display_location'] as String? ?? '';
    final activityType = item['activity_type'] as String? ?? 'field_assessment';
    final advanceAllowed = item['advance_allowed'] as bool? ?? false;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Project badge + status
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_activityIcon(activityType),
                          size: 11, color: AppColors.accent),
                      const SizedBox(width: 3),
                      Text(projectName,
                          style: const TextStyle(
                              color: AppColors.accent,
                              fontSize: 10,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15)),
                ),
                StatusBadge(status: status),
              ],
            ),

            // Activity type label
            const SizedBox(height: 6),
            Text(
              _activityTypeLabel(activityType, item['custom_type_label']),
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 12),
            ),

            // Location + date row
            const SizedBox(height: 8),
            Row(
              children: [
                if (location.isNotEmpty) ...[
                  const Icon(Icons.place_outlined,
                      size: 14, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(location,
                        style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary)),
                  ),
                ],
                if (dueDate != null) ...[
                  const Icon(Icons.calendar_today_outlined,
                      size: 14, color: AppColors.textSecondary),
                  const SizedBox(width: 4),
                  Text(
                    _formatDate(dueDate),
                    style: TextStyle(
                      fontSize: 13,
                      color: widget.isOverdue
                          ? AppColors.error
                          : AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),

            // Advance badge
            if (advanceAllowed) ...[
              const SizedBox(height: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.success.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text('Advance Available',
                    style: TextStyle(
                        color: AppColors.success,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ),
            ],

            // Action buttons
            if (status == 'assigned' || status == 'claimed') ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _updating ? null : _startActivity,
                  icon: _updating
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.play_arrow, size: 18),
                  label: const Text('Start Activity'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.success,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                ),
              ),
            ] else if (status == 'in_progress') ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _updating ? null : _completeActivity,
                      icon: const Icon(Icons.check_circle_outline, size: 16),
                      label: const Text('Mark Complete'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  IconData _activityIcon(String type) {
    switch (type) {
      case 'site_visit':
        return Icons.location_on_outlined;
      case 'training':
        return Icons.school_outlined;
      case 'focus_group':
        return Icons.groups_outlined;
      case 'community_meeting':
        return Icons.people_outlined;
      case 'workshop':
        return Icons.event_outlined;
      case 'data_collection':
        return Icons.data_usage_outlined;
      default:
        return Icons.clipboard_outlined;
    }
  }

  String _activityTypeLabel(String type, String? customLabel) {
    if (type == 'custom' && customLabel != null) return customLabel;
    switch (type) {
      case 'field_assessment':
        return 'Field Assessment';
      case 'site_visit':
        return 'Site Visit';
      case 'training':
        return 'Training Session';
      case 'focus_group':
        return 'Focus Group Discussion';
      case 'community_meeting':
        return 'Community Meeting';
      case 'workshop':
        return 'Workshop';
      case 'data_collection':
        return 'Data Collection';
      default:
        return type.replaceAll('_', ' ');
    }
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Wallet summary (unchanged) ─────────────────────────────

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
                const Text('Wallet Balance',
                    style:
                        TextStyle(color: Colors.white70, fontSize: 14)),
                const SizedBox(height: 8),
                Text(
                  'SDG ${balance.toStringAsFixed(0)}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w700),
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
