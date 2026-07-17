import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/shimmer_loading.dart';
import '../widgets/reusable_app_bar.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});
  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _projects = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  bool _isOffline = false;
  String _searchQuery = '';
  String _filterStatus = 'all';
  int _page = 0;
  static const int _pageSize = 20;
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_onScroll);
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
      final data = await _supabase
          .from('projects')
          .select('*')
          .order('created_at', ascending: false)
          .range(0, _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
      final box = await Hive.openBox('offline_cache');
      await box.put('projects', data);
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
        final cached = box.get('projects');
        if (cached != null) {
          final list = List<Map<String, dynamic>>.from(
            (cached as List).map((e) => Map<String, dynamic>.from(e)),
          );
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
      final offset = (_page + 1) * _pageSize;
      final data = await _supabase
          .from('projects')
          .select('*')
          .order('created_at', ascending: false)
          .range(offset, offset + _pageSize - 1);
      final list = List<Map<String, dynamic>>.from(data);
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
      case 'active':
        return Colors.green;
      case 'completed':
        return Colors.blue;
      case 'on_hold':
        return Colors.orange;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  List<Map<String, dynamic>> get _filtered {
    return _projects.where((p) {
      final matchSearch =
          _searchQuery.isEmpty ||
          (p['name'] ?? '').toString().toLowerCase().contains(
            _searchQuery.toLowerCase(),
          ) ||
          (p['description'] ?? '').toString().toLowerCase().contains(
            _searchQuery.toLowerCase(),
          );
      final matchStatus =
          _filterStatus == 'all' || (p['status'] ?? '') == _filterStatus;
      return matchSearch && matchStatus;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Projects',
              showBackButton: true,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: () => _loadProjects(refresh: true),
                ),
              ],
            ),
          if (_isOffline) const OfflineBanner(),
          Container(
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
                    children:
                        ['all', 'active', 'completed', 'on_hold', 'cancelled']
                            .map(
                              (s) => Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: FilterChip(
                                  label: Text(
                                    s == 'all'
                                        ? 'All'
                                        : s.replaceAll('_', ' ').toUpperCase(),
                                  ),
                                  selected: _filterStatus == s,
                                  onSelected: (_) =>
                                      setState(() => _filterStatus = s),
                                  selectedColor: AppColors.primaryDark
                                      .withOpacity(0.2),
                                ),
                              ),
                            )
                            .toList(),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _isLoading
                ? const ShimmerBody(layout: ShimmerLayout.project, listItems: 6)
                : _filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.folder_special,
                          size: 64,
                          color: Colors.grey,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _projects.isEmpty
                              ? 'No projects found.'
                              : 'No matching projects.',
                          style: const TextStyle(color: Colors.grey),
                        ),
                      ],
                    ),
                  )
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
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          );
                        }
                        final p = _filtered[i];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 10),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(14),
                            leading: CircleAvatar(
                              backgroundColor: _statusColor(
                                p['status'],
                              ).withOpacity(0.15),
                              child: Icon(
                                Icons.folder_special,
                                color: _statusColor(p['status']),
                              ),
                            ),
                            title: Text(
                              p['name'] ?? 'Unnamed Project',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (p['description'] != null) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    p['description'],
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.grey.shade600,
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: _statusColor(
                                          p['status'],
                                        ).withOpacity(0.15),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Text(
                                        p['status'] ?? 'unknown',
                                        style: TextStyle(
                                          color: _statusColor(p['status']),
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            isThreeLine: true,
                            onTap: () => _showProjectDetail(p),
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

  void _showProjectDetail(Map<String, dynamic> p) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.95,
        minChildSize: 0.4,
        expand: false,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              p['name'] ?? 'Project Details',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            if (p['description'] != null)
              Text(
                p['description'],
                style: TextStyle(color: Colors.grey.shade700),
              ),
            const SizedBox(height: 16),
            _detailRow('Status', p['status'] ?? 'N/A'),
            _detailRow('Start Date', p['start_date'] ?? 'N/A'),
            _detailRow('End Date', p['end_date'] ?? 'N/A'),
            _detailRow('Budget', p['budget']?.toString() ?? 'N/A'),
            _detailRow('Manager', p['manager_name'] ?? 'N/A'),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(
            '$label:',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.grey,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ),
      ],
    ),
  );
}
