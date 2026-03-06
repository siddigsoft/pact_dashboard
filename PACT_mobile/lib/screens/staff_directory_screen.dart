import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';

class StaffDirectoryScreen extends StatefulWidget {
  const StaffDirectoryScreen({super.key});
  @override
  State<StaffDirectoryScreen> createState() => _StaffDirectoryScreenState();
}

class _StaffDirectoryScreenState extends State<StaffDirectoryScreen> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _staff = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _filterRole = 'all';

  final List<String> _roles = ['all', 'admin', 'supervisor', 'data_collector', 'coordinator', 'fom'];

  @override
  void initState() {
    super.initState();
    _loadStaff();
  }

  Future<void> _loadStaff() async {
    setState(() => _isLoading = true);
    try {
      final data = await _supabase.from('user_profiles').select('id, full_name, email, role, hub_name, phone, is_online, last_activity, avatar_url').order('full_name');
      if (mounted) setState(() { _staff = List<Map<String, dynamic>>.from(data); _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    return _staff.where((s) {
      final matchSearch = _searchQuery.isEmpty ||
        (s['full_name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (s['email'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase()) ||
        (s['hub_name'] ?? '').toLowerCase().contains(_searchQuery.toLowerCase());
      final matchRole = _filterRole == 'all' || (s['role'] ?? '') == _filterRole;
      return matchSearch && matchRole;
    }).toList();
  }

  Color _roleColor(String? role) {
    switch (role) {
      case 'super_admin': case 'admin': return Colors.purple;
      case 'supervisor': return Colors.blue;
      case 'data_collector': return Colors.green;
      case 'coordinator': return Colors.orange;
      case 'fom': return Colors.teal;
      default: return Colors.grey;
    }
  }

  bool _isOnline(Map<String, dynamic> s) {
    if (s['is_online'] == true) return true;
    final lastActivity = s['last_activity'];
    if (lastActivity == null) return false;
    final dt = DateTime.tryParse(lastActivity.toString());
    if (dt == null) return false;
    return DateTime.now().difference(dt).inMinutes < 10;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final onlineCount = filtered.where(_isOnline).length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Staff Directory', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _loadStaff)],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.white,
            child: Column(children: [
              Row(children: [
                Expanded(child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Search staff...', prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.grey.shade300)),
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                )),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.green.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: Row(children: [
                    const Icon(Icons.circle, color: Colors.green, size: 10),
                    const SizedBox(width: 4),
                    Text('$onlineCount Online', style: const TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ]),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: _roles.map((r) => Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(r == 'all' ? 'All' : r.replaceAll('_', ' ')),
                    selected: _filterRole == r,
                    onSelected: (_) => setState(() => _filterRole = r),
                    selectedColor: AppColors.primaryDark.withOpacity(0.2),
                  ),
                )).toList()),
              ),
            ]),
          ),
          Expanded(
            child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : filtered.isEmpty
                ? const Center(child: Text('No staff found.', style: TextStyle(color: Colors.grey)))
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final s = filtered[i];
                      final online = _isOnline(s);
                      final initials = (s['full_name'] ?? 'U').split(' ').map((w) => w.isNotEmpty ? w[0] : '').take(2).join().toUpperCase();
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        child: ListTile(
                          leading: Stack(children: [
                            CircleAvatar(
                              backgroundColor: _roleColor(s['role']).withOpacity(0.15),
                              child: Text(initials, style: TextStyle(color: _roleColor(s['role']), fontWeight: FontWeight.bold)),
                            ),
                            if (online) Positioned(bottom: 0, right: 0, child: Container(width: 12, height: 12, decoration: BoxDecoration(color: Colors.green, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)))),
                          ]),
                          title: Text(s['full_name'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(s['email'] ?? '', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                            Row(children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(color: _roleColor(s['role']).withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
                                child: Text(s['role'] ?? 'N/A', style: TextStyle(color: _roleColor(s['role']), fontSize: 10, fontWeight: FontWeight.w600)),
                              ),
                              if (s['hub_name'] != null) ...[
                                const SizedBox(width: 6),
                                Text(s['hub_name'], style: const TextStyle(fontSize: 11, color: Colors.grey)),
                              ],
                            ]),
                          ]),
                          isThreeLine: true,
                          trailing: s['phone'] != null ? IconButton(
                            icon: const Icon(Icons.phone, color: Colors.green),
                            onPressed: () {},
                          ) : null,
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
