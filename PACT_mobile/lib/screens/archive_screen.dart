import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class ArchiveScreen extends StatefulWidget {
  const ArchiveScreen({super.key});
  @override
  State<ArchiveScreen> createState() => _ArchiveScreenState();
}

class _ArchiveScreenState extends State<ArchiveScreen> {
  final _supabase = Supabase.instance.client;
  String _activeTab = 'mmps';
  List<Map<String, dynamic>> _items = [];
  bool _isLoading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      List<Map<String, dynamic>> data = [];
      if (_activeTab == 'mmps') {
        data = List<Map<String, dynamic>>.from(
          await _supabase.from('monthly_monitoring_plans').select('id, mmp_code, status, month, year').eq('status', 'closed').order('created_at', ascending: false).limit(50)
        );
      } else if (_activeTab == 'visits') {
        data = List<Map<String, dynamic>>.from(
          await _supabase.from('site_visits').select('id, status, site_name, visit_date').in_('status', ['completed', 'cancelled']).order('created_at', ascending: false).limit(50)
        );
      } else {
        data = List<Map<String, dynamic>>.from(
          await _supabase.from('documents').select('id, title, document_type, created_at').order('created_at', ascending: false).limit(50)
        );
      }
      if (mounted) setState(() { _items = data; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered => _items.where((item) {
    if (_searchQuery.isEmpty) return true;
    return item.values.any((v) => v?.toString().toLowerCase().contains(_searchQuery.toLowerCase()) == true);
  }).toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Archive', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadData)],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            color: AppColors.primaryDark,
            child: Row(children: [
              for (final tab in [('mmps', 'MMPs'), ('visits', 'Visits'), ('documents', 'Documents')])
                Expanded(child: GestureDetector(
                  onTap: () { setState(() { _activeTab = tab.$1; _items = []; }); _loadData(); },
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(border: Border(bottom: BorderSide(color: _activeTab == tab.$1 ? Colors.white : Colors.transparent, width: 2))),
                    child: Text(tab.$2, textAlign: TextAlign.center, style: TextStyle(color: _activeTab == tab.$1 ? Colors.white : Colors.white60, fontWeight: _activeTab == tab.$1 ? FontWeight.bold : FontWeight.normal)),
                  ),
                )),
            ]),
          ),
        ),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12), color: Colors.white,
            child: TextField(
              decoration: InputDecoration(hintText: 'Search archive...', prefixIcon: const Icon(Icons.search), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)), contentPadding: const EdgeInsets.symmetric(vertical: 8)),
              onChanged: (v) => setState(() => _searchQuery = v),
            ),
          ),
          Expanded(
            child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _filtered.isEmpty
                ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [const Icon(Icons.archive, size: 60, color: Colors.grey), const SizedBox(height: 12), const Text('No archived items found.', style: TextStyle(color: Colors.grey))]))
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final item = _filtered[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        child: ListTile(
                          leading: Icon(_activeTab == 'mmps' ? Icons.assignment : _activeTab == 'visits' ? Icons.map : Icons.description, color: Colors.grey.shade600),
                          title: Text(item['mmp_code'] ?? item['site_name'] ?? item['title'] ?? 'Item', style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(item['status'] ?? item['document_type'] ?? '${item['month'] ?? ''} ${item['year'] ?? ''}', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                          trailing: const Icon(Icons.archive, color: Colors.grey, size: 18),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
