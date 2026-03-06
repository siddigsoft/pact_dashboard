import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class GlobalSearchScreen extends StatefulWidget {
  const GlobalSearchScreen({super.key});
  @override
  State<GlobalSearchScreen> createState() => _GlobalSearchScreenState();
}

class _GlobalSearchScreenState extends State<GlobalSearchScreen> {
  final _supabase = Supabase.instance.client;
  final _controller = TextEditingController();
  List<_SearchResult> _results = [];
  bool _isSearching = false;
  String _lastQuery = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    if (query.trim().length < 2) { setState(() { _results = []; }); return; }
    if (query == _lastQuery) return;
    _lastQuery = query;
    setState(() => _isSearching = true);

    final results = <_SearchResult>[];
    try {
      await Future.wait([
        _supabase.from('monthly_monitoring_plans').select('id, mmp_code, status').ilike('mmp_code', '%$query%').limit(5).then((data) {
          for (final r in data) results.add(_SearchResult(r['mmp_code'] ?? '', 'MMP', r['status'] ?? '', Icons.assignment, '/mmp'));
        }),
        _supabase.from('site_visits').select('id, site_name, status').ilike('site_name', '%$query%').limit(5).then((data) {
          for (final r in data) results.add(_SearchResult(r['site_name'] ?? '', 'Site Visit', r['status'] ?? '', Icons.map, '/site-visits'));
        }),
        _supabase.from('user_profiles').select('id, full_name, role, email').ilike('full_name', '%$query%').limit(5).then((data) {
          for (final r in data) results.add(_SearchResult(r['full_name'] ?? '', 'Staff', r['role'] ?? '', Icons.person, '/users'));
        }),
        _supabase.from('documents').select('id, title, document_type').ilike('title', '%$query%').limit(5).then((data) {
          for (final r in data) results.add(_SearchResult(r['title'] ?? '', 'Document', r['document_type'] ?? '', Icons.description, '/documents'));
        }),
        _supabase.from('incident_reports').select('id, title, status').ilike('title', '%$query%').limit(3).then((data) {
          for (final r in data) results.add(_SearchResult(r['title'] ?? '', 'Incident', r['status'] ?? '', Icons.warning, '/incidents'));
        }),
      ]);
    } catch (_) {}

    if (mounted) setState(() { _results = results; _isSearching = false; });
  }

  Color _typeColor(String type) {
    switch (type) {
      case 'MMP': return Colors.blue;
      case 'Site Visit': return Colors.green;
      case 'Staff': return Colors.purple;
      case 'Document': return Colors.orange;
      case 'Incident': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: TextField(
          controller: _controller,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Search everything...',
            hintStyle: const TextStyle(color: Colors.white60),
            border: InputBorder.none,
            prefixIcon: const Icon(Icons.search, color: Colors.white70),
            suffixIcon: _controller.text.isNotEmpty ? IconButton(icon: const Icon(Icons.clear, color: Colors.white70), onPressed: () { _controller.clear(); setState(() { _results = []; _lastQuery = ''; }); }) : null,
          ),
          onChanged: (v) { setState(() {}); _search(v); },
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: _controller.text.isEmpty
        ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.search, size: 64, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('Search across all data', style: TextStyle(color: Colors.grey, fontSize: 16)),
            const SizedBox(height: 4),
            Text('MMPs, site visits, staff, documents, incidents', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
          ]))
        : _isSearching
          ? const Center(child: CircularProgressIndicator())
          : _results.isEmpty
            ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.search_off, size: 48, color: Colors.grey),
                const SizedBox(height: 8),
                Text('No results for "${_controller.text}"', style: const TextStyle(color: Colors.grey)),
              ]))
            : ListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: _results.length,
                itemBuilder: (_, i) {
                  final r = _results[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    child: ListTile(
                      leading: CircleAvatar(backgroundColor: _typeColor(r.type).withOpacity(0.12), child: Icon(r.icon, color: _typeColor(r.type), size: 20)),
                      title: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Row(children: [
                        Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1), decoration: BoxDecoration(color: _typeColor(r.type).withOpacity(0.12), borderRadius: BorderRadius.circular(8)), child: Text(r.type, style: TextStyle(color: _typeColor(r.type), fontSize: 10, fontWeight: FontWeight.w600))),
                        const SizedBox(width: 6),
                        Text(r.subtitle, style: const TextStyle(fontSize: 12)),
                      ]),
                      trailing: const Icon(Icons.chevron_right),
                    ),
                  );
                },
              ),
    );
  }
}

class _SearchResult {
  final String title;
  final String type;
  final String subtitle;
  final IconData icon;
  final String route;
  _SearchResult(this.title, this.type, this.subtitle, this.icon, this.route);
}
