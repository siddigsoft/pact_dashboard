import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class HubManagementScreen extends StatefulWidget {
  const HubManagementScreen({super.key});
  @override
  State<HubManagementScreen> createState() => _HubManagementScreenState();
}

class _HubManagementScreenState extends State<HubManagementScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _hubs = [];
  bool _isLoading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadHubs();
  }

  Future<void> _loadHubs() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase.from('hubs').select('*, hub_states(count)').order('name');
      if (mounted) setState(() { _hubs = List<Map<String, dynamic>>.from(data); _isLoading = false; });
    } catch (e) {
      try {
        final data = await _supabase.from('hubs').select('*').order('name');
        if (mounted) setState(() { _hubs = List<Map<String, dynamic>>.from(data); _isLoading = false; });
      } catch (_) {
        if (mounted) setState(() => _isLoading = false);
      }
    }
  }

  List<Map<String, dynamic>> get _filtered => _hubs.where((h) =>
    _searchQuery.isEmpty || (h['name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase())
  ).toList();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Hub Management', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadHubs)],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.white,
            child: TextField(
              decoration: InputDecoration(hintText: 'Search hubs...', prefixIcon: const Icon(Icons.search), border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)), contentPadding: const EdgeInsets.symmetric(vertical: 8)),
              onChanged: (v) => setState(() => _searchQuery = v),
            ),
          ),
          Expanded(
            child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _filtered.isEmpty
                ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [const Icon(Icons.hub, size: 60, color: Colors.grey), const SizedBox(height: 12), const Text('No hubs found.', style: TextStyle(color: Colors.grey))]))
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final h = _filtered[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        child: ExpansionTile(
                          leading: CircleAvatar(backgroundColor: AppColors.primaryDark.withOpacity(0.1), child: const Icon(Icons.hub, color: AppColors.primaryDark)),
                          title: Text(h['name'] ?? 'Unnamed Hub', style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text(h['region'] ?? h['state'] ?? '', style: TextStyle(color: Colors.grey.shade600)),
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                if (h['manager_name'] != null) _row('Manager', h['manager_name']),
                                if (h['phone'] != null) _row('Phone', h['phone']),
                                if (h['email'] != null) _row('Email', h['email']),
                                if (h['address'] != null) _row('Address', h['address']),
                                if (h['states_count'] != null) _row('States', h['states_count'].toString()),
                                if (h['localities_count'] != null) _row('Localities', h['localities_count'].toString()),
                              ]),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(children: [
      SizedBox(width: 90, child: Text('$label:', style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.grey, fontSize: 13))),
      Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
    ]),
  );
}
