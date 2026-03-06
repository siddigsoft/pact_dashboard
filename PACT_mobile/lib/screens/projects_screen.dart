import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});
  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _projects = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _filterStatus = 'all';

  @override
  void initState() {
    super.initState();
    _loadProjects();
  }

  Future<void> _loadProjects() async {
    setState(() => _isLoading = true);
    try {
      var query = _supabase.from('projects').select('*').order('created_at', ascending: false);
      final data = await query;
      if (mounted) setState(() { _projects = List<Map<String, dynamic>>.from(data); _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Color _statusColor(String? status) {
    switch (status?.toLowerCase()) {
      case 'active': return Colors.green;
      case 'completed': return Colors.blue;
      case 'on_hold': return Colors.orange;
      case 'cancelled': return Colors.red;
      default: return Colors.grey;
    }
  }

  List<Map<String, dynamic>> get _filtered {
    return _projects.where((p) {
      final matchSearch = _searchQuery.isEmpty ||
        (p['name'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (p['description'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase());
      final matchStatus = _filterStatus == 'all' || (p['status'] ?? '') == _filterStatus;
      return matchSearch && matchStatus;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Projects', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadProjects),
        ],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.white,
            child: Column(
              children: [
                TextField(
                  decoration: InputDecoration(
                    hintText: 'Search projects...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.grey.shade300)),
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['all', 'active', 'completed', 'on_hold', 'cancelled'].map((s) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(s == 'all' ? 'All' : s.replaceAll('_', ' ').toUpperCase()),
                        selected: _filterStatus == s,
                        onSelected: (_) => setState(() => _filterStatus = s),
                        selectedColor: AppColors.primaryDark.withOpacity(0.2),
                      ),
                    )).toList(),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _filtered.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.folder_special, size: 64, color: Colors.grey),
                        const SizedBox(height: 12),
                        Text(_projects.isEmpty ? 'No projects found.' : 'No matching projects.', style: const TextStyle(color: Colors.grey)),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final p = _filtered[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(14),
                          leading: CircleAvatar(
                            backgroundColor: _statusColor(p['status']).withOpacity(0.15),
                            child: Icon(Icons.folder_special, color: _statusColor(p['status'])),
                          ),
                          title: Text(p['name'] ?? 'Unnamed Project', style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (p['description'] != null) ...[
                                const SizedBox(height: 4),
                                Text(p['description'], maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                              ],
                              const SizedBox(height: 6),
                              Row(children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(color: _statusColor(p['status']).withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
                                  child: Text(p['status'] ?? 'unknown', style: TextStyle(color: _statusColor(p['status']), fontSize: 11, fontWeight: FontWeight.w600)),
                                ),
                              ]),
                            ],
                          ),
                          isThreeLine: true,
                          onTap: () => _showProjectDetail(p),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  void _showProjectDetail(Map<String, dynamic> p) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.95,
        minChildSize: 0.4,
        expand: false,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.all(20),
          children: [
            Text(p['name'] ?? 'Project Details', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            if (p['description'] != null) Text(p['description'], style: TextStyle(color: Colors.grey.shade700)),
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
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(width: 110, child: Text('$label:', style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.grey))),
      Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500))),
    ]),
  );
}
