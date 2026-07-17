import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';
import 'project_activity_detail_screen.dart';

class ProjectActivitiesScreen extends StatefulWidget {
  const ProjectActivitiesScreen({super.key});
  @override
  State<ProjectActivitiesScreen> createState() => _ProjectActivitiesScreenState();
}

class _ProjectActivitiesScreenState extends State<ProjectActivitiesScreen> {
  final _supabase = Supabase.instance.client;
  bool _isLoading = true;
  List<Map<String, dynamic>> _activities = [];
  String _filterStatus = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) return;

      final data = await _supabase
          .from('project_activity_assignments')
          .select('''
            id, status, notes, assigned_at, completed_at,
            activity:project_activities(
              id, title, activity_type, status, start_date, end_date,
              location_hub, location_state,
              project:projects(id, name)
            )
          ''')
          .eq('user_id', user.id)
          .order('assigned_at', ascending: false);

      if (!mounted) return;
      setState(() {
        _activities = List<Map<String, dynamic>>.from(data);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_filterStatus == 'all') return _activities;
    return _activities.where((a) => a['status'] == _filterStatus).toList();
  }

  Color _statusColor(String? s) {
    switch (s) {
      case 'completed': return Colors.green;
      case 'in_progress': return const Color(0xFF1D6FA4);
      case 'assigned': return Colors.orange;
      default: return Colors.grey;
    }
  }

  bool _isOverdue(Map<String, dynamic> assignment) {
    if (assignment['status'] == 'completed') return false;
    final activity = assignment['activity'] as Map<String, dynamic>?;
    final end = activity?['end_date'] as String?;
    if (end == null) return false;
    final d = DateTime.tryParse(end);
    return d != null && d.isBefore(DateTime.now());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'My Activities',
              showBackButton: true,
              actions: [
                IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
              ],
            ),

            // Status filter chips
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['all', 'assigned', 'in_progress', 'completed']
                      .map((s) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: FilterChip(
                              label: Text(
                                s == 'all'
                                    ? 'All'
                                    : s.replaceAll('_', ' ').toUpperCase(),
                                style: const TextStyle(fontSize: 12),
                              ),
                              selected: _filterStatus == s,
                              onSelected: (_) =>
                                  setState(() => _filterStatus = s),
                              selectedColor:
                                  AppColors.primaryDark.withOpacity(0.2),
                            ),
                          ))
                      .toList(),
                ),
              ),
            ),

            Expanded(
              child: _isLoading
                  ? const ShimmerBody(layout: ShimmerLayout.list, listItems: 8)
                  : _filtered.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.assignment_outlined,
                                  size: 64, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              Text(
                                _filterStatus == 'all'
                                    ? 'No activities assigned to you'
                                    : 'No ${_filterStatus.replaceAll('_', ' ')} activities',
                                style: TextStyle(color: Colors.grey.shade600),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(14),
                            itemCount: _filtered.length,
                            itemBuilder: (_, i) {
                              final assignment = _filtered[i];
                              final activity = assignment['activity']
                                  as Map<String, dynamic>?;
                              final project = activity?['project']
                                  as Map<String, dynamic>?;
                              final overdue = _isOverdue(assignment);

                              return Card(
                                margin: const EdgeInsets.only(bottom: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  side: BorderSide(
                                    color: overdue
                                        ? Colors.red.shade200
                                        : Colors.grey.shade200,
                                  ),
                                ),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(10),
                                  onTap: () {
                                    if (activity == null) return;
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            ProjectActivityDetailScreen(
                                          activityId: activity['id'],
                                          activityTitle: activity['title'] ??
                                              'Activity',
                                        ),
                                      ),
                                    ).then((_) => _load());
                                  },
                                  child: Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                activity?['title'] ??
                                                    'Activity',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 14,
                                                ),
                                              ),
                                            ),
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 8,
                                                      vertical: 3),
                                              decoration: BoxDecoration(
                                                color: _statusColor(
                                                        assignment['status'])
                                                    .withOpacity(0.12),
                                                borderRadius:
                                                    BorderRadius.circular(10),
                                              ),
                                              child: Text(
                                                (assignment['status'] ?? '')
                                                    .toString()
                                                    .replaceAll('_', ' '),
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  color: _statusColor(
                                                      assignment['status']),
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        if (project != null) ...[
                                          const SizedBox(height: 4),
                                          Text(
                                            project['name'] ?? '',
                                            style: const TextStyle(
                                              color: Color(0xFF1D6FA4),
                                              fontSize: 12,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ],
                                        const SizedBox(height: 6),
                                        Row(
                                          children: [
                                            if (activity?['activity_type'] !=
                                                null) ...[
                                              Icon(Icons.category_outlined,
                                                  size: 13,
                                                  color: Colors.grey.shade500),
                                              const SizedBox(width: 4),
                                              Text(
                                                activity!['activity_type'],
                                                style: TextStyle(
                                                    fontSize: 12,
                                                    color:
                                                        Colors.grey.shade600),
                                              ),
                                              const SizedBox(width: 12),
                                            ],
                                            if (activity?['end_date'] !=
                                                null) ...[
                                              Icon(Icons.event,
                                                  size: 13,
                                                  color: overdue
                                                      ? Colors.red
                                                      : Colors.grey.shade500),
                                              const SizedBox(width: 4),
                                              Text(
                                                activity!['end_date'],
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: overdue
                                                      ? Colors.red
                                                      : Colors.grey.shade600,
                                                  fontWeight: overdue
                                                      ? FontWeight.w600
                                                      : null,
                                                ),
                                              ),
                                            ],
                                            if (overdue) ...[
                                              const SizedBox(width: 8),
                                              const Text(
                                                '⚠ OVERDUE',
                                                style: TextStyle(
                                                  color: Colors.red,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
