import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../providers/app_providers.dart';
import '../models/project_model.dart';
import '../config/project_flows.dart';
import '../config/routes.dart';

// ─────────────────────────────────────────────────────────────
// Projects List Screen
// ─────────────────────────────────────────────────────────────

class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  final _supabase = Supabase.instance.client;
  final _scrollController = ScrollController();

  List<ProjectModel> _projects = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  bool _isOffline = false;
  String _searchQuery = '';
  String _filterStatus = 'all';
  int _page = 0;
  static const int _pageSize = 20;

  bool get _isAdmin {
    final role = ref.read(userRoleProvider);
    return role == 'super_admin' || role == 'admin' || role == 'fom';
  }

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadProjects();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200 &&
        !_isLoadingMore &&
        _hasMore &&
        _searchQuery.isEmpty) {
      _loadMore();
    }
  }

  Future<void> _loadProjects({bool refresh = false}) async {
    if (refresh) {
      setState(() {
        _isLoading = true;
        _page = 0;
        _hasMore = true;
        _projects = [];
        _isOffline = false;
      });
    } else {
      setState(() => _isLoading = true);
    }

    try {
      final userId = _supabase.auth.currentUser?.id ?? '';
      final userProfile = ref.read(userProfileProvider).valueOrNull;
      final fullName = userProfile?.fullName ?? '';
      final repo = ref.read(projectRepositoryProvider);
      final list = await repo.fetchProjects(
        userId: userId,
        fullName: fullName,
        isAdmin: _isAdmin,
        page: 0,
        pageSize: _pageSize,
      );

      final box = await Hive.openBox('offline_cache');
      await box.put('projects_v2', list.map((p) => {
        'id': p.id,
        'name': p.name,
        'project_code': p.projectCode,
        'description': p.description,
        'project_type': p.projectType,
        'status': p.status,
        'start_date': p.startDate,
        'end_date': p.endDate,
        'current_flow_stage': p.currentFlowStage,
        'team': p.team,
      }).toList());

      if (!mounted) return;
      setState(() {
        _projects = list;
        _hasMore = list.length == _pageSize;
        _page = 0;
        _isLoading = false;
        _isOffline = false;
      });
    } catch (e) {
      if (!mounted) return;
      try {
        final box = await Hive.openBox('offline_cache');
        final cached = box.get('projects_v2');
        if (cached != null) {
          final list = (cached as List)
              .map((e) => ProjectModel.fromMap(Map<String, dynamic>.from(e as Map)))
              .toList();
          setState(() {
            _projects = list;
            _isLoading = false;
            _isOffline = true;
            _hasMore = false;
          });
          return;
        }
      } catch (_) {}
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore) return;
    setState(() => _isLoadingMore = true);
    try {
      final userId = _supabase.auth.currentUser?.id ?? '';
      final userProfile = ref.read(userProfileProvider).valueOrNull;
      final fullName = userProfile?.fullName ?? '';
      final repo = ref.read(projectRepositoryProvider);
      final list = await repo.fetchProjects(
        userId: userId,
        fullName: fullName,
        isAdmin: _isAdmin,
        page: _page + 1,
        pageSize: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _projects.addAll(list);
        _hasMore = list.length == _pageSize;
        _page++;
        _isLoadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  Color _statusColor(String? status) {
    switch (status?.toLowerCase()) {
      case 'active': return Colors.green;
      case 'completed': return Colors.blue;
      case 'on_hold': case 'onhold': return Colors.orange;
      case 'cancelled': return Colors.red;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String? status) {
    switch (status?.toLowerCase()) {
      case 'active': return 'Active';
      case 'completed': return 'Completed';
      case 'on_hold': case 'onhold': return 'On Hold';
      case 'cancelled': return 'Cancelled';
      case 'draft': return 'Draft';
      default: return status ?? 'Unknown';
    }
  }

  List<ProjectModel> get _filtered {
    return _projects.where((p) {
      final matchSearch = _searchQuery.isEmpty ||
          p.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          (p.description ?? '').toLowerCase().contains(_searchQuery.toLowerCase());
      final matchStatus = _filterStatus == 'all' ||
          p.status.toLowerCase() == _filterStatus.toLowerCase();
      return matchSearch && matchStatus;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Projects',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: () => _loadProjects(refresh: true),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_isOffline) const OfflineBanner(),
          _buildFilterBar(),
          Expanded(
            child: _isLoading
                ? const ShimmerBody(layout: ShimmerLayout.project, listItems: 6)
                : _filtered.isEmpty
                    ? _buildEmpty()
                    : RefreshIndicator(
                        onRefresh: () => _loadProjects(refresh: true),
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(12),
                          itemCount: _filtered.length + (_isLoadingMore ? 1 : 0),
                          itemBuilder: (_, i) {
                            if (i == _filtered.length) {
                              return const Padding(
                                padding: EdgeInsets.all(16),
                                child: Center(
                                    child: CircularProgressIndicator(strokeWidth: 2)),
                              );
                            }
                            return _ProjectCard(
                              project: _filtered[i],
                              onTap: () => _openDetail(_filtered[i]),
                              statusColor: _statusColor(_filtered[i].status),
                              statusLabel: _statusLabel(_filtered[i].status),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.white,
      child: Column(
        children: [
          TextField(
            decoration: InputDecoration(
              hintText: 'Search projects...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 8),
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: ['all', 'active', 'completed', 'on_hold', 'cancelled']
                  .map((s) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterChip(
                          label: Text(s == 'all'
                              ? 'All'
                              : s.replaceAll('_', ' ').toUpperCase()),
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
        ],
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.folder_special, size: 64, color: Colors.grey),
          const SizedBox(height: 12),
          Text(
            _projects.isEmpty
                ? 'No projects found.'
                : 'No matching projects.',
            style: const TextStyle(color: Colors.grey),
          ),
        ],
      ),
    );
  }

  void _openDetail(ProjectModel project) {
    Navigator.pushNamed(
      context,
      RouteNames.projectDetailPath(project.id),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Project List Card
// ─────────────────────────────────────────────────────────────

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({
    required this.project,
    required this.onTap,
    required this.statusColor,
    required this.statusLabel,
  });

  final ProjectModel project;
  final VoidCallback onTap;
  final Color statusColor;
  final String statusLabel;

  @override
  Widget build(BuildContext context) {
    final stages = getProjectFlow(project.projectType);
    final currentStageIdx = stages.indexWhere(
        (s) => s.id == (project.currentFlowStage ?? stages.first.id));
    final validIdx = currentStageIdx < 0 ? 0 : currentStageIdx;
    final progress =
        stages.isEmpty ? 0.0 : (validIdx + 1) / stages.length;
    final stageName =
        stages.isNotEmpty ? stages[validIdx].label : 'Stage 1';
    final typeLabel = getProjectTypeLabel(project.projectType);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: statusColor.withOpacity(0.15),
                    child:
                        Icon(Icons.folder_special, color: statusColor, size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          project.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 14),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          typeLabel,
                          style: TextStyle(
                              color: Colors.grey.shade600, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  // Status chip
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(
                          color: statusColor,
                          fontSize: 10,
                          fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              if (project.description != null) ...[
                const SizedBox(height: 6),
                Text(
                  project.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ],
              const SizedBox(height: 10),
              // Stage progress
              Row(
                children: [
                  Icon(Icons.timeline,
                      size: 12, color: AppColors.primaryDark.withOpacity(0.7)),
                  const SizedBox(width: 4),
                  Text(
                    stageName,
                    style: TextStyle(
                        fontSize: 11,
                        color: AppColors.primaryDark,
                        fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  Text(
                    '${validIdx + 1}/${stages.length}',
                    style: TextStyle(
                        fontSize: 10, color: Colors.grey.shade500),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: Colors.grey.shade200,
                  valueColor:
                      AlwaysStoppedAnimation<Color>(AppColors.primaryDark),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
