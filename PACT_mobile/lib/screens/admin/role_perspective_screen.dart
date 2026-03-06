// lib/screens/admin/role_perspective_screen.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class RolePerspectiveScreen extends StatefulWidget {
  const RolePerspectiveScreen({super.key});

  @override
  State<RolePerspectiveScreen> createState() => _RolePerspectiveScreenState();
}

class _RolePerspectiveScreenState extends State<RolePerspectiveScreen> {
  final _supabase = Supabase.instance.client;
  String? _selectedRole;
  Map<String, dynamic>? _sampleUser;
  bool _loadingUser = false;

  static const _roles = [
    {'value': 'coordinator',   'label': 'Coordinator',    'icon': Icons.person},
    {'value': 'supervisor',    'label': 'Supervisor',      'icon': Icons.supervised_user_circle},
    {'value': 'hubSupervisor', 'label': 'Hub Supervisor',  'icon': Icons.hub},
    {'value': 'fom',           'label': 'FOM',             'icon': Icons.manage_accounts},
    {'value': 'admin',         'label': 'Admin',           'icon': Icons.admin_panel_settings},
    {'value': 'super_admin',   'label': 'Super Admin',     'icon': Icons.shield},
  ];

  // Role permissions matrix
  static const _permMatrix = {
    'coordinator': {
      'screens':     ['Dashboard', 'Site Visits', 'MMP Management', 'Monitoring Form', 'Safety Hub', 'Chat', 'Wallet', 'Documents', 'Helpline', 'Profile', 'Settings'],
      'can_approve': false, 'can_broadcast': false, 'can_manage_users': false,
      'can_see_finance': true, 'can_see_all_hubs': false, 'can_see_reports': false,
      'description': 'Field data collector. Sees assigned sites and own financial records.',
    },
    'supervisor': {
      'screens':     ['Dashboard', 'Site Visits', 'MMP Management', 'Cost Submission', 'Approval Dashboard', 'Chat', 'Wallet', 'Documents', 'Safety Hub', 'Reports', 'Profile'],
      'can_approve': true, 'can_broadcast': false, 'can_manage_users': false,
      'can_see_finance': true, 'can_see_all_hubs': false, 'can_see_reports': true,
      'description': 'Oversees a group of coordinators. Can approve cost submissions for own team.',
    },
    'hubSupervisor': {
      'screens':     ['Dashboard', 'Site Visits', 'MMP Management', 'Hub Management', 'Cost Submission', 'Approval Dashboard', 'Finance', 'Staff Directory', 'Chat', 'Reports', 'Profile'],
      'can_approve': true, 'can_broadcast': false, 'can_manage_users': false,
      'can_see_finance': true, 'can_see_all_hubs': false, 'can_see_reports': true,
      'description': 'Manages a hub. Sees all coordinators and supervisors in their hub.',
    },
    'fom': {
      'screens':     ['Dashboard', 'MMP', 'Site Visits', 'Cost Submission (all)', 'Finance', 'Approval Dashboard', 'Broadcast Center', 'Staff Directory', 'Reconciliation', 'Reports', 'Chat', 'Hub Management', 'Wallet'],
      'can_approve': true, 'can_broadcast': true, 'can_manage_users': false,
      'can_see_finance': true, 'can_see_all_hubs': true, 'can_see_reports': true,
      'description': 'Field Operation Manager. Cross-hub visibility. Can approve and broadcast.',
    },
    'admin': {
      'screens':     ['Dashboard', 'MMP', 'Site Visits', 'Finance', 'Users', 'Audit Logs', 'Broadcast Center', 'Email Management', 'Role Management', 'Staff Directory', 'Reports', 'Super Admin Data'],
      'can_approve': true, 'can_broadcast': true, 'can_manage_users': true,
      'can_see_finance': true, 'can_see_all_hubs': true, 'can_see_reports': true,
      'description': 'Platform administrator. Full access except a few super-admin-only tools.',
    },
    'super_admin': {
      'screens':     ['ALL screens', 'Permissions Management', 'Role Perspective', 'Super Admin Data Center', 'Broadcast Center', 'Email Management', 'Audit Logs', 'System Settings'],
      'can_approve': true, 'can_broadcast': true, 'can_manage_users': true,
      'can_see_finance': true, 'can_see_all_hubs': true, 'can_see_reports': true,
      'description': 'Full platform access. Manages all users, permissions, and configurations.',
    },
  };

  Future<void> _loadSampleUser(String role) async {
    setState(() { _loadingUser = true; _sampleUser = null; });
    try {
      final data = await _supabase
          .from('profiles')
          .select('full_name, email, hub_name, role')
          .eq('role', role)
          .limit(1)
          .maybeSingle();
      if (mounted) setState(() { _sampleUser = data != null ? Map<String, dynamic>.from(data) : null; _loadingUser = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingUser = false);
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

  @override
  Widget build(BuildContext context) {
    final perms = _selectedRole != null ? _permMatrix[_selectedRole] : null;
    final roleColor = _roleColor(_selectedRole);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2041),
        foregroundColor: Colors.white,
        title: Text('Role Perspective Viewer', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 15)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Role selector
            Text('Select a role to preview its perspective:', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 14, color: const Color(0xFF0F2041))),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: (_roles as List<Map<String, Object>>).map((r) {
                final isSelected = _selectedRole == r['value'];
                final color = _roleColor(r['value'] as String);
                return GestureDetector(
                  onTap: () {
                    setState(() => _selectedRole = r['value'] as String);
                    _loadSampleUser(r['value'] as String);
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected ? color : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: color, width: isSelected ? 0 : 1.5),
                      boxShadow: isSelected ? [BoxShadow(color: color.withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 3))] : [],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(r['icon'] as IconData, size: 15, color: isSelected ? Colors.white : color),
                        const SizedBox(width: 6),
                        Text(r['label'] as String, style: GoogleFonts.poppins(fontSize: 12, fontWeight: FontWeight.w700, color: isSelected ? Colors.white : color)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),

            if (_selectedRole != null && perms != null) ...[
              const SizedBox(height: 20),
              // Sample user
              if (_loadingUser)
                const Center(child: CircularProgressIndicator(strokeWidth: 2))
              else if (_sampleUser != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: roleColor.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: roleColor.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: roleColor.withValues(alpha: 0.15),
                        child: Text(
                          (_sampleUser!['full_name'] as String? ?? '?').trim().split(' ').map((w) => w.isNotEmpty ? w[0] : '').take(2).join().toUpperCase(),
                          style: GoogleFonts.poppins(fontWeight: FontWeight.w700, color: roleColor),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Example: ${_sampleUser!['full_name'] ?? ''}', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13)),
                            if ((_sampleUser!['hub_name'] as String?)?.isNotEmpty == true)
                              Text(_sampleUser!['hub_name'] as String, style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey[600])),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 14),
              // Description
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [roleColor.withValues(alpha: 0.08), roleColor.withValues(alpha: 0.02)]),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: roleColor.withValues(alpha: 0.2)),
                ),
                child: Text(perms['description'] as String, style: GoogleFonts.poppins(fontSize: 13, height: 1.5)),
              ),
              const SizedBox(height: 14),
              // Quick capabilities
              _capSection('Capabilities', [
                _capRow('Can Approve', perms['can_approve'] as bool),
                _capRow('Can Send Broadcasts', perms['can_broadcast'] as bool),
                _capRow('Can Manage Users', perms['can_manage_users'] as bool),
                _capRow('Sees Financial Data', perms['can_see_finance'] as bool),
                _capRow('Cross-Hub Visibility', perms['can_see_all_hubs'] as bool),
                _capRow('Access to Reports', perms['can_see_reports'] as bool),
              ]),
              const SizedBox(height: 14),
              // Accessible screens
              _screensList(perms['screens'] as List<String>, roleColor),
            ] else if (_selectedRole == null) ...[
              const SizedBox(height: 40),
              Center(
                child: Column(
                  children: [
                    Icon(Icons.visibility_outlined, size: 56, color: Colors.grey[300]),
                    const SizedBox(height: 12),
                    Text('Select a role above to preview what that user sees', style: GoogleFonts.poppins(color: Colors.grey[500], fontSize: 13), textAlign: TextAlign.center),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _capSection(String title, List<Widget> rows) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13, color: const Color(0xFF0F2041))),
          const SizedBox(height: 10),
          ...rows,
        ],
      ),
    );
  }

  Widget _capRow(String label, bool enabled) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(enabled ? Icons.check_circle : Icons.cancel, size: 18, color: enabled ? const Color(0xFF16A34A) : Colors.grey[400]),
          const SizedBox(width: 8),
          Text(label, style: GoogleFonts.poppins(fontSize: 13, color: enabled ? Colors.black87 : Colors.grey[500])),
        ],
      ),
    );
  }

  Widget _screensList(List<String> screens, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Accessible Screens (${screens.length})', style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 13, color: const Color(0xFF0F2041))),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6, runSpacing: 6,
            children: screens.map((s) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
              child: Text(s, style: GoogleFonts.poppins(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
            )).toList(),
          ),
        ],
      ),
    );
  }
}
