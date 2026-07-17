import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';
import 'project_activity_detail_screen.dart';

class ProjectDetailScreen extends StatefulWidget {
  final Map<String, dynamic> project;
  const ProjectDetailScreen({super.key, required this.project});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen>
    with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  late TabController _tabController;
  bool _isLoadingActivities = true;
  bool _isLoadingTeam = true;
  List<Map<String, dynamic>> _activities = [];
  List<Map<String, dynamic>> _team = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadActivities();
    _loadTeam();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadActivities() async {
    setState(() => _isLoadingActivities = true);
    try {
      final data = await _supabase
          .from('project_activities')
          .select('id, title, activity_type, status, start_date, end_date, location_hub')
          .eq('project_id', widget.project['id'])
          .order('start_date', ascending: true);
      if (!mounted) return;
      setState(() {
        _activities = List<Map<String, dynamic>>.from(data);
        _isLoadingActivities = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoadingActivities = false);
    }
  }

  Future<void> _loadTeam() async {
    setState(() => _isLoadingTeam = true);
    try {
      final data = await _supabase
          .from('project_team_members')
          .select('id, project_role, is_active, profile:profiles(full_name, role, hub_id)')
          .eq('project_id', widget.project['id'])
          .eq('is_active', true)
          .order('project_role');
      if (!mounted) return;
      setState(() {
        _team = List<Map<String, dynamic>>.from(data);
        _isLoadingTeam = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoadingTeam = false);
    }
  }

  Color _statusColor(String? s) {
    switch (s?.toLowerCase()) {
      case 'active': return Colors.green;
      case 'completed': return Colors.blue;
      case 'on_hold': return Colors.orange;
      case 'cancelled': return Colors.red;
      case 'in_progress': return const Color(0xFF1D6FA4);
      case 'assigned': return Colors.orange;
      default: return Colors.grey;
    }
  }

  IconData _roleIcon(String? role) {
    switch (role) {
      case 'project_coordinator': return Icons.supervisor_account;
      case 'project_fom': return Icons.manage_accounts;
      case 'project_supervisor': return Icons.person_pin;
      case 'data_collector': return Icons.assignment_ind;
      default: return Icons.person;
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.project;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: p['name'] ?? 'Project',
              showBackButton: true,
            ),
            // Status badge
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _statusColor(p['status']).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      (p['status'] ?? 'unknown').toString().replaceAll('_', ' ').toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: _statusColor(p['status']),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  if (p['start_date'] != null) ...[
                    Icon(Icons.calendar_today, size: 13, color: Colors.grey.shade500),
                    const SizedBox(width: 4),
                    Text(p['start_date'], style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  ],
                  if (p['end_date'] != null) ...[
                    Text(' → ', style: TextStyle(color: Colors.grey.shade500)),
                    Text(p['end_date'], style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  ],
                ],
              ),
            ),
            // Tab bar
            Container(
              color: Colors.white,
              child: TabBar(
                controller: _tabController,
                indicatorColor: AppColors.primaryDark,
                labelColor: AppColors.primaryDark,
                unselectedLabelColor: Colors.grey,
                tabs: const [
                  Tab(text: 'Overview'),
                  Tab(text: 'Activities'),
                  Tab(text: 'Team'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildOverviewTab(p),
                  _buildActivitiesTab(),
                  _buildTeamTab(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOverviewTab(Map<String, dynamic> p) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Project Details',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                const Divider(height: 20),
                if (p['description'] != null) ...[
                  Text(p['description'],
                      style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
                  const SizedBox(height: 12),
                ],
                _detailRow('Budget',
                    p['budget'] != null ? '${p['budget']} SDG' : 'N/A'),
                _detailRow('Start Date', p['start_date'] ?? 'N/A'),
                _detailRow('End Date', p['end_date'] ?? 'N/A'),
                _detailRow('Hub', p['hub_id'] ?? 'N/A'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Quick Stats',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                const Divider(height: 20),
                Row(
                  children: [
                    Expanded(child: _statCard('Activities', '${_activities.length}', Icons.assignment_outlined, const Color(0xFF1D6FA4))),
                    const SizedBox(width: 12),
                    Expanded(child: _statCard('Team Size', '${_team.length}', Icons.group_outlined, Colors.purple)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _statCard('Active', '${_activities.where((a) => a['status'] == 'in_progress').length}', Icons.play_circle_outline, Colors.orange)),
                    const SizedBox(width: 12),
                    Expanded(child: _statCard('Done', '${_activities.where((a) => a['status'] == 'completed').length}', Icons.check_circle_outline, Colors.green)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActivitiesTab() {
    if (_isLoadingActivities) {
      return const ShimmerBody(layout: ShimmerLayout.list, listItems: 6);
    }
    if (_activities.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.assignment_outlined, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text('No activities yet', style: TextStyle(color: Colors.grey.shade600)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadActivities,
      child: ListView.builder(
        padding: const EdgeInsets.all(14),
        itemCount: _activities.length,
        itemBuilder: (_, i) {
          final a = _activities[i];
          final isOverdue = a['status'] != 'completed' &&
              a['end_date'] != null &&
              DateTime.tryParse(a['end_date'])?.isBefore(DateTime.now()) == true;
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(
                color: isOverdue ? Colors.red.shade200 : Colors.grey.shade200),
            ),
            child: ListTile(
              leading: Icon(Icons.assignment_outlined,
                  color: _statusColor(a['status'])),
              title: Text(a['title'] ?? 'Activity',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              subtitle: Row(
                children: [
                  if (a['activity_type'] != null)
                    Text(a['activity_type'],
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  if (a['end_date'] != null) ...[
                    if (a['activity_type'] != null)
                      Text(' · ', style: TextStyle(color: Colors.grey.shade400)),
                    Text(a['end_date'],
                        style: TextStyle(
                          fontSize: 12,
                          color: isOverdue ? Colors.red : Colors.grey.shade600,
                        )),
                  ],
                ],
              ),
              trailing: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: _statusColor(a['status']).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  (a['status'] ?? '').replaceAll('_', ' '),
                  style: TextStyle(
                    fontSize: 10,
                    color: _statusColor(a['status']),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ProjectActivityDetailScreen(
                      activityId: a['id'],
                      activityTitle: a['title'] ?? 'Activity',
                    ),
                  ),
                ).then((_) => _loadActivities());
              },
            ),
          );
        },
      ),
    );
  }

  Widget _buildTeamTab() {
    if (_isLoadingTeam) {
      return const ShimmerBody(layout: ShimmerLayout.list, listItems: 5);
    }
    if (_team.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.group_outlined, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text('No team members', style: TextStyle(color: Colors.grey.shade600)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadTeam,
      child: ListView.builder(
        padding: const EdgeInsets.all(14),
        itemCount: _team.length,
        itemBuilder: (_, i) {
          final m = _team[i];
          final profile = m['profile'] as Map<String, dynamic>?;
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: AppColors.primaryDark.withOpacity(0.12),
                child: Icon(_roleIcon(m['project_role']),
                    color: AppColors.primaryDark, size: 20),
              ),
              title: Text(profile?['full_name'] ?? 'Unknown',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                (m['project_role'] ?? '').toString().replaceAll('_', ' '),
                style: const TextStyle(fontSize: 12),
              ),
              trailing: Icon(Icons.chevron_right, color: Colors.grey.shade400),
            ),
          );
        },
      ),
    );
  }

  Widget _detailRow(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text('$label:', style: const TextStyle(color: Colors.grey, fontSize: 13)),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
        ),
      ],
    ),
  );

  Widget _statCard(String label, String value, IconData icon, Color color) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(height: 6),
        Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color)),
        Text(label, style: TextStyle(fontSize: 11, color: color.withOpacity(0.8))),
      ],
    ),
  );
}
