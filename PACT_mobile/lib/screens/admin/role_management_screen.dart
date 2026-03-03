// lib/screens/admin/role_management_screen.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../theme/app_colors.dart';

class RoleManagementScreen extends StatefulWidget {
  final bool isArabic;

  const RoleManagementScreen({super.key, this.isArabic = false});

  @override
  State<RoleManagementScreen> createState() => _RoleManagementScreenState();
}

class _RoleManagementScreenState extends State<RoleManagementScreen> {
  final _supabase = Supabase.instance.client;

  List<Map<String, dynamic>> _roles = [];
  Map<String, int> _roleUserCounts = {};
  bool _isLoading = true;
  bool _hasAccess = false;

  final List<Map<String, dynamic>> _defaultRoles = [
    {
      'name': 'super_admin',
      'name_en': 'Super Admin',
      'name_ar': 'مشرف عام',
      'description_en': 'Full system access with all permissions',
      'description_ar': 'وصول كامل للنظام مع جميع الصلاحيات',
      'color': Colors.purple,
      'icon': Icons.admin_panel_settings,
      'permissions': ['all'],
    },
    {
      'name': 'admin',
      'name_en': 'Admin',
      'name_ar': 'مشرف',
      'description_en': 'Administrative access for user and content management',
      'description_ar': 'وصول إداري لإدارة المستخدمين والمحتوى',
      'color': Colors.blue,
      'icon': Icons.manage_accounts,
      'permissions': [
        'users.read',
        'users.write',
        'reports.read',
        'reports.write',
      ],
    },
    {
      'name': 'coordinator',
      'name_en': 'Coordinator',
      'name_ar': 'منسق',
      'description_en':
          'Coordinate field operations and manage data collectors',
      'description_ar': 'تنسيق العمليات الميدانية وإدارة جامعي البيانات',
      'color': Colors.teal,
      'icon': Icons.supervisor_account,
      'permissions': ['visits.read', 'visits.write', 'collectors.manage'],
    },
    {
      'name': 'data_collector',
      'name_en': 'Data Collector',
      'name_ar': 'جامع بيانات',
      'description_en': 'Collect field data and submit reports',
      'description_ar': 'جمع البيانات الميدانية وتقديم التقارير',
      'color': AppColors.primaryOrange,
      'icon': Icons.person_pin_circle,
      'permissions': ['visits.own', 'reports.own'],
    },
    {
      'name': 'finance',
      'name_en': 'Finance',
      'name_ar': 'مالية',
      'description_en': 'Financial management and approvals',
      'description_ar': 'الإدارة المالية والموافقات',
      'color': Colors.green,
      'icon': Icons.account_balance_wallet,
      'permissions': ['finance.read', 'finance.write', 'finance.approve'],
    },
  ];

  @override
  void initState() {
    super.initState();
    _checkAdminAccess();
  }

  Future<void> _checkAdminAccess() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) {
        if (mounted) Navigator.pop(context);
        return;
      }

      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      final role = (profile?['role'] as String?)?.toLowerCase() ?? '';
      final isAdmin =
          role == 'admin' || role == 'super_admin' || role == 'superadmin';

      if (!mounted) return;

      if (!isAdmin) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'الوصول مرفوض' : 'Access Denied'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      setState(() => _hasAccess = true);
      _loadRoles();
    } catch (e) {
      debugPrint('Error checking admin access: $e');
      if (mounted) Navigator.pop(context);
    }
  }

  Future<void> _loadRoles() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final usersResponse = await _supabase.from('profiles').select('role');
      final users = List<Map<String, dynamic>>.from(usersResponse as List);

      final counts = <String, int>{};
      for (final user in users) {
        final role = (user['role'] as String?)?.toLowerCase() ?? 'user';
        counts[role] = (counts[role] ?? 0) + 1;
      }

      try {
        final rolesResponse = await _supabase.from('roles').select();
        _roles = List<Map<String, dynamic>>.from(rolesResponse as List);
      } catch (e) {
        _roles = [];
      }

      if (!mounted) return;
      setState(() {
        _roleUserCounts = counts;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading roles: $e');
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic
          ? ui.TextDirection.rtl
          : ui.TextDirection.ltr,
      child: Scaffold(
        backgroundColor: AppColors.backgroundGray,
        appBar: AppBar(
          backgroundColor: AppColors.primaryBlue,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          title: Text(
            widget.isArabic ? 'إدارة الأدوار' : 'Role Management',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadRoles,
            ),
          ],
        ),
        body: !_hasAccess
            ? const Center(child: CircularProgressIndicator())
            : _isLoading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _loadRoles,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildRolesSummary(),
                    const SizedBox(height: 24),
                    Text(
                      widget.isArabic ? 'الأدوار المتاحة' : 'Available Roles',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ..._defaultRoles.map((role) => _buildRoleCard(role)),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildRolesSummary() {
    final totalUsers = _roleUserCounts.values.fold<int>(0, (a, b) => a + b);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withOpacity(0.8),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.people, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.isArabic ? 'إجمالي المستخدمين' : 'Total Users',
                    style: GoogleFonts.poppins(
                      color: Colors.white.withOpacity(0.8),
                      fontSize: 14,
                    ),
                  ),
                  Text(
                    '$totalUsers',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            widget.isArabic ? 'توزيع الأدوار' : 'Role Distribution',
            style: GoogleFonts.poppins(
              color: Colors.white.withOpacity(0.8),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          if (totalUsers > 0)
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: SizedBox(
                height: 8,
                child: Row(
                  children: _defaultRoles.map((role) {
                    final count = _roleUserCounts[role['name']] ?? 0;
                    final percent = count / totalUsers;
                    if (percent == 0) return const SizedBox.shrink();
                    return Expanded(
                      flex: (percent * 100).round().clamp(1, 100),
                      child: Container(color: role['color'] as Color),
                    );
                  }).toList(),
                ),
              ),
            ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: _defaultRoles.map((role) {
              final count = _roleUserCounts[role['name']] ?? 0;
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: role['color'] as Color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${widget.isArabic ? role['name_ar'] : role['name_en']}: $count',
                    style: GoogleFonts.poppins(
                      color: Colors.white.withOpacity(0.9),
                      fontSize: 11,
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildRoleCard(Map<String, dynamic> role) {
    final color = role['color'] as Color;
    final icon = role['icon'] as IconData;
    final count = _roleUserCounts[role['name']] ?? 0;
    final permissions = role['permissions'] as List<String>;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: color, size: 24),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.isArabic ? role['name_ar'] : role['name_en'],
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: color,
                        ),
                      ),
                      Text(
                        widget.isArabic
                            ? role['description_ar']
                            : role['description_en'],
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$count ${widget.isArabic ? 'مستخدم' : 'users'}',
                    style: GoogleFonts.poppins(
                      color: color,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              widget.isArabic ? 'الصلاحيات:' : 'Permissions:',
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: permissions
                  .map(
                    (p) => Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        p == 'all'
                            ? (widget.isArabic
                                  ? 'جميع الصلاحيات'
                                  : 'All Permissions')
                            : p,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.grey[700],
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}
