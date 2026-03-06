// lib/screens/admin/permissions_management_screen.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class PermissionsManagementScreen extends StatefulWidget {
  const PermissionsManagementScreen({super.key});

  @override
  State<PermissionsManagementScreen> createState() => _PermissionsManagementScreenState();
}

class _PermissionsManagementScreenState extends State<PermissionsManagementScreen> {
  final _supabase   = Supabase.instance.client;
  List<Map<String, dynamic>> _users = [];
  bool   _loading   = true;
  String _search    = '';
  String? _filterRole;

  final _roles = ['coordinator','supervisor','hubSupervisor','fom','admin','super_admin'];

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      var query = _supabase.from('profiles').select('id, full_name, email, role, hub_id, hub_name').order('full_name');
      if (_filterRole != null) query = query.eq('role', _filterRole!);
      final data = await query;
      if (mounted) setState(() { _users = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.isEmpty) return _users;
    final q = _search.toLowerCase();
    return _users.where((u) =>
      (u['full_name'] as String? ?? '').toLowerCase().contains(q) ||
      (u['email']     as String? ?? '').toLowerCase().contains(q) ||
      (u['role']      as String? ?? '').toLowerCase().contains(q)
    ).toList();
  }

  Future<void> _changeRole(String userId, String currentRole) async {
    String selected = currentRole;
    final newRole = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text('Change Role', style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: _roles.map((r) => RadioListTile<String>(
              value: r,
              groupValue: selected,
              title: Text(_roleLabel(r), style: GoogleFonts.poppins(fontSize: 13)),
              onChanged: (v) => setState(() => selected = v!),
            )).toList(),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0F2041), foregroundColor: Colors.white),
              onPressed: () => Navigator.pop(ctx, selected),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (newRole == null || newRole == currentRole) return;
    try {
      await _supabase.from('profiles').update({'role': newRole}).eq('id', userId);
      _showSnack('Role updated to ${_roleLabel(newRole)}.');
      _loadUsers();
    } catch (e) {
      _showSnack('Error: $e', isError: true);
    }
  }

  String _roleLabel(String role) {
    switch (role) {
      case 'super_admin':    return 'Super Admin';
      case 'admin':          return 'Admin';
      case 'fom':            return 'FOM';
      case 'hubSupervisor':  return 'Hub Supervisor';
      case 'supervisor':     return 'Supervisor';
      case 'coordinator':    return 'Coordinator';
      default:               return role;
    }
  }

  Color _roleColor(String? role) {
    switch (role) {
      case 'super_admin':   return const Color(0xFFDC2626);
      case 'admin':         return const Color(0xFFD97706);
      case 'fom':           return const Color(0xFF7C3AED);
      case 'hubSupervisor': return const Color(0xFF0F2041);
      case 'supervisor':    return const Color(0xFF3B82F6);
      default:              return const Color(0xFF6B7280);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? Colors.red.shade700 : Colors.green.shade700,
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2041),
        foregroundColor: Colors.white,
        title: Text('Permissions Management', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15)),
        actions: [IconButton(onPressed: _loadUsers, icon: const Icon(Icons.refresh))],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              style: GoogleFonts.poppins(fontSize: 13, color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search name, email, role...',
                hintStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                prefixIcon: const Icon(Icons.search, color: Colors.white60, size: 18),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // Role filter chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: Row(
              children: [
                _filterChip('All', null),
                ..._roles.map((r) => _filterChip(_roleLabel(r), r)),
              ],
            ),
          ),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (_, i) => _buildUserTile(filtered[i]),
              ),
            ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, String? value) {
    final isActive = _filterRole == value;
    return GestureDetector(
      onTap: () { setState(() => _filterRole = value); _loadUsers(); },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFF0F2041) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: isActive ? const Color(0xFF0F2041) : Colors.grey.shade300),
        ),
        child: Text(label, style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w600, color: isActive ? Colors.white : Colors.grey[700])),
      ),
    );
  }

  Widget _buildUserTile(Map<String, dynamic> user) {
    final role    = user['role'] as String? ?? 'unknown';
    final name    = user['full_name'] as String? ?? 'Unknown';
    final email   = user['email'] as String? ?? '';
    final hub     = user['hub_name'] as String? ?? '';
    final color   = _roleColor(role);
    final initials = name.isNotEmpty ? name.trim().split(' ').map((w) => w.isNotEmpty ? w[0] : '').take(2).join().toUpperCase() : '?';
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 1))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Text(initials, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13, color: color)),
        ),
        title: Text(name, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(email, style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey[500])),
            if (hub.isNotEmpty) Text(hub, style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey[400])),
          ],
        ),
        trailing: GestureDetector(
          onTap: () => _changeRole(user['id'] as String, role),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: 0.3))),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_roleLabel(role), style: GoogleFonts.poppins(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
                const SizedBox(width: 4),
                Icon(Icons.edit, size: 12, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
