// lib/screens/admin/user_management_screen.dart

import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../theme/app_colors.dart';

class UserManagementScreen extends StatefulWidget {
  final bool isArabic;
  
  const UserManagementScreen({super.key, this.isArabic = false});

  @override
  State<UserManagementScreen> createState() => _UserManagementScreenState();
}

class _UserManagementScreenState extends State<UserManagementScreen> with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  final _searchController = TextEditingController();
  late TabController _tabController;
  
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _filteredUsers = [];
  bool _isLoading = true;
  String _selectedRoleFilter = 'all';
  String _selectedTab = 'all';
  
  int _totalUsers = 0;
  int _activeUsers = 0;
  int _pendingUsers = 0;
  int _adminUsers = 0;
  
  RealtimeChannel? _usersChannel;
  bool _hasAccess = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _tabController.addListener(_onTabChanged);
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
      final isAdmin = role == 'admin' || role == 'super_admin' || role == 'superadmin';
      
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
      _loadUsers();
      _setupRealtimeSubscription();
    } catch (e) {
      debugPrint('Error checking admin access: $e');
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    _usersChannel?.unsubscribe();
    super.dispose();
  }

  void _setupRealtimeSubscription() {
    _usersChannel = _supabase.channel('admin-users-realtime')
      .onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'profiles',
        callback: (payload) {
          debugPrint('[UserManagement] Realtime update: ${payload.eventType}');
          _loadUsers();
        },
      )
      .subscribe();
  }

  void _onTabChanged() {
    final tabs = ['all', 'active', 'pending', 'admins'];
    setState(() {
      _selectedTab = tabs[_tabController.index];
      _filterUsers();
    });
  }

  Future<void> _loadUsers() async {
    try {
      final response = await _supabase
          .from('profiles')
          .select()
          .order('created_at', ascending: false);

      final users = List<Map<String, dynamic>>.from(response as List);
      
      if (!mounted) return;
      
      setState(() {
        _users = users;
        _totalUsers = users.length;
        _activeUsers = users.where((u) => u['status'] == 'active' || u['is_active'] == true).length;
        _pendingUsers = users.where((u) => u['status'] == 'pending_approval' || u['status'] == 'pending').length;
        _adminUsers = users.where((u) {
          final role = (u['role'] as String?)?.toLowerCase() ?? '';
          return role == 'admin' || role == 'super_admin' || role == 'superadmin';
        }).length;
        _isLoading = false;
        _filterUsers();
      });
    } catch (e) {
      debugPrint('Error loading users: $e');
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  void _filterUsers() {
    var filtered = List<Map<String, dynamic>>.from(_users);
    
    switch (_selectedTab) {
      case 'active':
        filtered = filtered.where((u) => u['status'] == 'active' || u['is_active'] == true).toList();
        break;
      case 'pending':
        filtered = filtered.where((u) => u['status'] == 'pending_approval' || u['status'] == 'pending').toList();
        break;
      case 'admins':
        filtered = filtered.where((u) {
          final role = (u['role'] as String?)?.toLowerCase() ?? '';
          return role == 'admin' || role == 'super_admin' || role == 'superadmin';
        }).toList();
        break;
    }
    
    if (_selectedRoleFilter != 'all') {
      filtered = filtered.where((u) {
        final role = (u['role'] as String?)?.toLowerCase() ?? '';
        return role == _selectedRoleFilter.toLowerCase();
      }).toList();
    }
    
    final query = _searchController.text.toLowerCase();
    if (query.isNotEmpty) {
      filtered = filtered.where((u) {
        final name = (u['full_name'] as String?)?.toLowerCase() ?? '';
        final email = (u['email'] as String?)?.toLowerCase() ?? '';
        return name.contains(query) || email.contains(query);
      }).toList();
    }
    
    setState(() => _filteredUsers = filtered);
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: widget.isArabic ? ui.TextDirection.rtl : ui.TextDirection.ltr,
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
            widget.isArabic ? 'إدارة المستخدمين' : 'User Management',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white),
              onPressed: _loadUsers,
            ),
            IconButton(
              icon: const Icon(Icons.person_add, color: Colors.white),
              onPressed: _showAddUserDialog,
            ),
          ],
        ),
        body: !_hasAccess
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  _buildStatsRow(),
                  _buildSearchAndFilters(),
                  _buildTabBar(),
                  Expanded(
                    child: _isLoading
                        ? const Center(child: CircularProgressIndicator())
                        : RefreshIndicator(
                            onRefresh: _loadUsers,
                            child: _buildUsersList(),
                          ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildStatsRow() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      child: Row(
        children: [
          _buildStatBadge(
            widget.isArabic ? 'إجمالي' : 'Total',
            _totalUsers.toString(),
            AppColors.primaryBlue,
          ),
          const SizedBox(width: 12),
          _buildStatBadge(
            widget.isArabic ? 'نشط' : 'Active',
            _activeUsers.toString(),
            AppColors.primaryGreen,
          ),
          const SizedBox(width: 12),
          _buildStatBadge(
            widget.isArabic ? 'معلق' : 'Pending',
            _pendingUsers.toString(),
            Colors.orange,
          ),
          const SizedBox(width: 12),
          _buildStatBadge(
            widget.isArabic ? 'مشرفين' : 'Admins',
            _adminUsers.toString(),
            Colors.purple,
          ),
        ],
      ),
    );
  }

  Widget _buildStatBadge(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.white,
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'بحث...' : 'Search users...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onChanged: (_) => _filterUsers(),
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            child: DropdownButton<String>(
              value: _selectedRoleFilter,
              underline: const SizedBox(),
              items: [
                DropdownMenuItem(value: 'all', child: Text(widget.isArabic ? 'كل الأدوار' : 'All Roles')),
                DropdownMenuItem(value: 'super_admin', child: Text(widget.isArabic ? 'مشرف عام' : 'Super Admin')),
                DropdownMenuItem(value: 'admin', child: Text(widget.isArabic ? 'مشرف' : 'Admin')),
                DropdownMenuItem(value: 'coordinator', child: Text(widget.isArabic ? 'منسق' : 'Coordinator')),
                DropdownMenuItem(value: 'data_collector', child: Text(widget.isArabic ? 'جامع بيانات' : 'Data Collector')),
              ],
              onChanged: (value) {
                setState(() => _selectedRoleFilter = value ?? 'all');
                _filterUsers();
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      color: Colors.white,
      child: TabBar(
        controller: _tabController,
        labelColor: AppColors.primaryBlue,
        unselectedLabelColor: Colors.grey,
        indicatorColor: AppColors.primaryBlue,
        tabs: [
          Tab(text: widget.isArabic ? 'الكل ($_totalUsers)' : 'All Users ($_totalUsers)'),
          Tab(text: widget.isArabic ? 'نشط' : 'Active'),
          Tab(text: widget.isArabic ? 'معلق ($_pendingUsers)' : 'Pending ($_pendingUsers)'),
          Tab(text: widget.isArabic ? 'مشرفين' : 'Admins'),
        ],
      ),
    );
  }

  Widget _buildUsersList() {
    if (_filteredUsers.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people_outline, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              widget.isArabic ? 'لا يوجد مستخدمين' : 'No users found',
              style: GoogleFonts.poppins(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _filteredUsers.length,
      itemBuilder: (context, index) => _buildUserCard(_filteredUsers[index]),
    );
  }

  Widget _buildUserCard(Map<String, dynamic> user) {
    final name = user['full_name'] as String? ?? 'Unknown';
    final email = user['email'] as String? ?? '';
    final role = user['role'] as String? ?? 'user';
    final status = user['status'] as String? ?? (user['is_active'] == true ? 'active' : 'inactive');
    final lastActive = user['last_sign_in_at'] as String?;
    
    final isActive = status == 'active' || user['is_active'] == true;
    final isPending = status == 'pending_approval' || status == 'pending';
    
    Color statusColor = isActive ? AppColors.primaryGreen : (isPending ? Colors.orange : Colors.grey);
    String statusText = isActive 
        ? (widget.isArabic ? 'نشط' : 'Active')
        : (isPending ? (widget.isArabic ? 'معلق' : 'Pending') : (widget.isArabic ? 'غير نشط' : 'Inactive'));

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
              backgroundImage: user['avatar_url'] != null 
                  ? NetworkImage(user['avatar_url'] as String)
                  : null,
              child: user['avatar_url'] == null
                  ? Text(
                      name.isNotEmpty ? name[0].toUpperCase() : '?',
                      style: GoogleFonts.poppins(
                        color: AppColors.primaryBlue,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  Text(
                    email,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      _buildRoleBadge(role),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: statusColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          statusText,
                          style: GoogleFonts.poppins(
                            fontSize: 10,
                            color: statusColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              children: [
                if (isPending)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.check_circle, color: AppColors.primaryGreen),
                        onPressed: () => _approveUser(user),
                        tooltip: widget.isArabic ? 'موافقة' : 'Approve',
                      ),
                      IconButton(
                        icon: const Icon(Icons.cancel, color: Colors.red),
                        onPressed: () => _rejectUser(user),
                        tooltip: widget.isArabic ? 'رفض' : 'Reject',
                      ),
                    ],
                  )
                else
                  PopupMenuButton<String>(
                    onSelected: (value) => _handleUserAction(value, user),
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            const Icon(Icons.edit, size: 18),
                            const SizedBox(width: 8),
                            Text(widget.isArabic ? 'تعديل' : 'Edit'),
                          ],
                        ),
                      ),
                      PopupMenuItem(
                        value: 'role',
                        child: Row(
                          children: [
                            const Icon(Icons.admin_panel_settings, size: 18),
                            const SizedBox(width: 8),
                            Text(widget.isArabic ? 'تغيير الدور' : 'Change Role'),
                          ],
                        ),
                      ),
                      PopupMenuItem(
                        value: isActive ? 'deactivate' : 'activate',
                        child: Row(
                          children: [
                            Icon(isActive ? Icons.block : Icons.check_circle, size: 18),
                            const SizedBox(width: 8),
                            Text(isActive 
                                ? (widget.isArabic ? 'تعطيل' : 'Deactivate')
                                : (widget.isArabic ? 'تفعيل' : 'Activate')),
                          ],
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRoleBadge(String role) {
    Color color;
    String label;
    
    switch (role.toLowerCase()) {
      case 'super_admin':
      case 'superadmin':
        color = Colors.purple;
        label = widget.isArabic ? 'مشرف عام' : 'Super Admin';
        break;
      case 'admin':
        color = Colors.blue;
        label = widget.isArabic ? 'مشرف' : 'Admin';
        break;
      case 'coordinator':
        color = Colors.teal;
        label = widget.isArabic ? 'منسق' : 'Coordinator';
        break;
      case 'data_collector':
        color = AppColors.primaryOrange;
        label = widget.isArabic ? 'جامع بيانات' : 'Data Collector';
        break;
      default:
        color = Colors.grey;
        label = role;
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        label,
        style: GoogleFonts.poppins(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  void _handleUserAction(String action, Map<String, dynamic> user) async {
    switch (action) {
      case 'edit':
        _showEditUserDialog(user);
        break;
      case 'role':
        _showChangeRoleDialog(user);
        break;
      case 'activate':
      case 'deactivate':
        await _toggleUserStatus(user, action == 'activate');
        break;
    }
  }

  Future<void> _approveUser(Map<String, dynamic> user) async {
    try {
      await _supabase.from('profiles').update({
        'status': 'active',
        'is_active': true,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', user['id']);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'تمت الموافقة على المستخدم' : 'User approved'),
            backgroundColor: AppColors.primaryGreen,
          ),
        );
      }
      _loadUsers();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _rejectUser(Map<String, dynamic> user) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(widget.isArabic ? 'رفض المستخدم' : 'Reject User'),
        content: Text(widget.isArabic 
            ? 'هل أنت متأكد من رفض هذا المستخدم؟'
            : 'Are you sure you want to reject this user?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: Text(widget.isArabic ? 'رفض' : 'Reject', style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _supabase.from('profiles').update({
          'status': 'rejected',
          'is_active': false,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', user['id']);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(widget.isArabic ? 'تم رفض المستخدم' : 'User rejected'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        _loadUsers();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  Future<void> _toggleUserStatus(Map<String, dynamic> user, bool activate) async {
    try {
      await _supabase.from('profiles').update({
        'status': activate ? 'active' : 'inactive',
        'is_active': activate,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', user['id']);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(activate 
                ? (widget.isArabic ? 'تم تفعيل المستخدم' : 'User activated')
                : (widget.isArabic ? 'تم تعطيل المستخدم' : 'User deactivated')),
            backgroundColor: AppColors.primaryGreen,
          ),
        );
      }
      _loadUsers();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showAddUserDialog() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(widget.isArabic 
            ? 'يمكن للمستخدمين التسجيل عبر التطبيق'
            : 'Users can register through the app'),
        backgroundColor: AppColors.primaryBlue,
      ),
    );
  }

  void _showEditUserDialog(Map<String, dynamic> user) {
    final nameController = TextEditingController(text: user['full_name'] ?? '');
    final phoneController = TextEditingController(text: user['phone'] ?? '');
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(widget.isArabic ? 'تعديل المستخدم' : 'Edit User'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: InputDecoration(
                labelText: widget.isArabic ? 'الاسم الكامل' : 'Full Name',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneController,
              decoration: InputDecoration(
                labelText: widget.isArabic ? 'رقم الهاتف' : 'Phone Number',
                border: const OutlineInputBorder(),
              ),
              keyboardType: TextInputType.phone,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await _supabase.from('profiles').update({
                  'full_name': nameController.text,
                  'phone': phoneController.text,
                  'updated_at': DateTime.now().toIso8601String(),
                }).eq('id', user['id']);
                _loadUsers();
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
                  );
                }
              }
            },
            child: Text(widget.isArabic ? 'حفظ' : 'Save'),
          ),
        ],
      ),
    );
  }

  void _showChangeRoleDialog(Map<String, dynamic> user) {
    String selectedRole = user['role'] ?? 'data_collector';
    
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(widget.isArabic ? 'تغيير الدور' : 'Change Role'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${user['full_name'] ?? 'Unknown'}',
                style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              ..._buildRoleRadios(selectedRole, (value) {
                setDialogState(() => selectedRole = value!);
              }),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                Navigator.pop(context);
                try {
                  await _supabase.from('profiles').update({
                    'role': selectedRole,
                    'updated_at': DateTime.now().toIso8601String(),
                  }).eq('id', user['id']);
                  
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(widget.isArabic ? 'تم تحديث الدور' : 'Role updated'),
                        backgroundColor: AppColors.primaryGreen,
                      ),
                    );
                  }
                  _loadUsers();
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
                    );
                  }
                }
              },
              child: Text(widget.isArabic ? 'تحديث' : 'Update'),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildRoleRadios(String selectedRole, ValueChanged<String?> onChanged) {
    final roles = [
      {'value': 'super_admin', 'en': 'Super Admin', 'ar': 'مشرف عام'},
      {'value': 'admin', 'en': 'Admin', 'ar': 'مشرف'},
      {'value': 'coordinator', 'en': 'Coordinator', 'ar': 'منسق'},
      {'value': 'data_collector', 'en': 'Data Collector', 'ar': 'جامع بيانات'},
    ];
    
    return roles.map((role) => RadioListTile<String>(
      value: role['value']!,
      groupValue: selectedRole,
      onChanged: onChanged,
      title: Text(widget.isArabic ? role['ar']! : role['en']!),
      dense: true,
    )).toList();
  }
}
