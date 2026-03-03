import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';

class SuperAdminScreen extends StatefulWidget {
  const SuperAdminScreen({super.key});

  @override
  State<SuperAdminScreen> createState() => _SuperAdminScreenState();
}

class _SuperAdminScreenState extends State<SuperAdminScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final _supabase = Supabase.instance.client;

  bool _isLoading = true;
  bool _isSuperAdmin = false;
  String _searchQuery = '';
  String _activeTab = 'users';
  final TextEditingController _searchController = TextEditingController();

  // Users data
  List<Map<String, dynamic>> _allUsers = [];
  List<Map<String, dynamic>> _filteredUsers = [];

  // Stats
  Map<String, int> _roleStats = {};
  Map<String, int> _statusStats = {};

  @override
  void initState() {
    super.initState();
    _checkAccess();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _checkAccess() async {
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) {
        setState(() => _isLoading = false);
        return;
      }

      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (profile != null) {
        final role = (profile['role'] as String?)?.toLowerCase() ?? '';
        _isSuperAdmin = role == 'super_admin' || role == 'superadmin';
      }

      if (_isSuperAdmin) {
        await _loadData();
      }

      if (mounted) {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      debugPrint('Error checking access: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _loadData() async {
    try {
      final response = await _supabase
          .from('profiles')
          .select(
            'id, full_name, email, role, status, avatar_url, created_at, state_id, locality_id',
          )
          .order('created_at', ascending: false);

      _allUsers = (response as List).cast<Map<String, dynamic>>();
      _filteredUsers = List.from(_allUsers);

      // Calculate stats
      _roleStats = {};
      _statusStats = {};
      for (final user in _allUsers) {
        final role = (user['role'] as String?) ?? 'unknown';
        final status = (user['status'] as String?) ?? 'active';
        _roleStats[role] = (_roleStats[role] ?? 0) + 1;
        _statusStats[status] = (_statusStats[status] ?? 0) + 1;
      }

      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Error loading users: $e');
    }
  }

  void _filterUsers(String query) {
    setState(() {
      _searchQuery = query.toLowerCase();
      if (_searchQuery.isEmpty) {
        _filteredUsers = List.from(_allUsers);
      } else {
        _filteredUsers = _allUsers.where((user) {
          final name = (user['full_name'] as String?)?.toLowerCase() ?? '';
          final email = (user['email'] as String?)?.toLowerCase() ?? '';
          final role = (user['role'] as String?)?.toLowerCase() ?? '';
          return name.contains(_searchQuery) ||
              email.contains(_searchQuery) ||
              role.contains(_searchQuery);
        }).toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (!_isSuperAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Access Denied')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                'Super Admin Access Only',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'You do not have permission to access this screen.',
                style: GoogleFonts.poppins(color: Colors.grey[600]),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.backgroundGray,
      drawer: CustomDrawerMenu(
        currentUser: _supabase.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      appBar: AppBar(
        backgroundColor: AppColors.primaryBlue,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.menu, color: Colors.white),
          onPressed: () => _scaffoldKey.currentState?.openDrawer(),
        ),
        title: Text(
          'Super Admin',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            _buildHeader(),
            _buildTabs(),
            Expanded(
              child: _activeTab == 'roles'
                  ? _buildRolesTab()
                  : _activeTab == 'system'
                  ? _buildSystemTab()
                  : _buildUsersTab(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withValues(alpha: 0.8),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.admin_panel_settings,
                  color: Colors.white,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'System Administration',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      '${_allUsers.length} total users',
                      style: GoogleFonts.poppins(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _buildMiniStat(
                'Active',
                _statusStats['active']?.toString() ?? '0',
                Colors.green,
              ),
              const SizedBox(width: 12),
              _buildMiniStat(
                'Pending',
                _statusStats['pending_approval']?.toString() ?? '0',
                Colors.orange,
              ),
              const SizedBox(width: 12),
              _buildMiniStat(
                'Suspended',
                _statusStats['suspended']?.toString() ?? '0',
                Colors.red,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            '$value $label',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          Expanded(
            child: _buildTabButton(
              'users',
              'Users',
              'المستخدمون',
              Icons.people_rounded,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _buildTabButton(
              'roles',
              'Roles',
              'الأدوار',
              Icons.security_rounded,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _buildTabButton(
              'system',
              'System',
              'النظام',
              Icons.settings_rounded,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(
    String tab,
    String labelEn,
    String labelAr,
    IconData icon,
  ) {
    final isActive = _activeTab == tab;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = tab),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? AppColors.primaryBlue : const Color(0xFFF3F6FA),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 20,
              color: isActive ? Colors.white : AppColors.textLight,
            ),
            const SizedBox(height: 3),
            Text(
              labelEn,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isActive ? Colors.white : AppColors.textLight,
              ),
            ),
            Text(
              labelAr,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: isActive
                    ? Colors.white.withValues(alpha: 0.85)
                    : AppColors.textLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUsersTab() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.white,
          child: TextField(
            controller: _searchController,
            onChanged: _filterUsers,
            decoration: InputDecoration(
              hintText: 'Search users...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _filterUsers('');
                      },
                    )
                  : null,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              filled: true,
              fillColor: Colors.grey.shade50,
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadData,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _filteredUsers.length,
              itemBuilder: (context, index) {
                return _buildUserCard(_filteredUsers[index]);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildUserCard(Map<String, dynamic> user) {
    final name = user['full_name'] as String? ?? 'Unknown';
    final email = user['email'] as String? ?? '';
    final role = user['role'] as String? ?? 'user';
    final status = user['status'] as String? ?? 'active';
    final avatarUrl = user['avatar_url'] as String?;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.primaryBlue.withValues(alpha: 0.1),
              backgroundImage: avatarUrl != null
                  ? NetworkImage(avatarUrl)
                  : null,
              child: avatarUrl == null
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
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
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
                      _buildStatusBadge(status),
                    ],
                  ),
                ],
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (value) => _handleUserAction(value, user),
              itemBuilder: (context) => [
                const PopupMenuItem(value: 'view', child: Text('View Details')),
                const PopupMenuItem(
                  value: 'edit_role',
                  child: Text('Change Role'),
                ),
                if (status != 'suspended')
                  const PopupMenuItem(
                    value: 'suspend',
                    child: Text(
                      'Suspend',
                      style: TextStyle(color: Colors.orange),
                    ),
                  ),
                if (status == 'suspended')
                  const PopupMenuItem(
                    value: 'activate',
                    child: Text('Activate'),
                  ),
                const PopupMenuItem(
                  value: 'delete',
                  child: Text('Delete', style: TextStyle(color: Colors.red)),
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
    switch (role.toLowerCase()) {
      case 'super_admin':
      case 'superadmin':
        color = Colors.purple;
        break;
      case 'admin':
        color = AppColors.primaryBlue;
        break;
      case 'coordinator':
      case 'field_coordinator':
        color = AppColors.primaryGreen;
        break;
      case 'datacollector':
      case 'enumerator':
        color = Colors.teal;
        break;
      default:
        color = Colors.grey;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        role.replaceAll('_', ' ').toUpperCase(),
        style: GoogleFonts.poppins(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    String label;
    switch (status.toLowerCase()) {
      case 'active':
        color = Colors.green;
        label = 'Active';
        break;
      case 'pending_approval':
        color = Colors.orange;
        label = 'Pending';
        break;
      case 'suspended':
        color = Colors.red;
        label = 'Suspended';
        break;
      default:
        color = Colors.grey;
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: GoogleFonts.poppins(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  void _handleUserAction(String action, Map<String, dynamic> user) async {
    switch (action) {
      case 'view':
        _showUserDetails(user);
        break;
      case 'edit_role':
        _showChangeRoleDialog(user);
        break;
      case 'suspend':
        await _updateUserStatus(user['id'], 'suspended');
        break;
      case 'activate':
        await _updateUserStatus(user['id'], 'active');
        break;
      case 'delete':
        await _deleteUser(user);
        break;
    }
  }

  void _showUserDetails(Map<String, dynamic> user) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        minChildSize: 0.4,
        expand: false,
        builder: (context, scrollController) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'User Details',
                style: GoogleFonts.poppins(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              _buildDetailRow('Name', user['full_name'] ?? 'N/A'),
              _buildDetailRow('Email', user['email'] ?? 'N/A'),
              _buildDetailRow('Role', user['role'] ?? 'N/A'),
              _buildDetailRow('Status', user['status'] ?? 'active'),
              _buildDetailRow('User ID', user['id'] ?? 'N/A'),
              _buildDetailRow('Created', user['created_at'] ?? 'N/A'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: GoogleFonts.poppins(
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(child: Text(value, style: GoogleFonts.poppins())),
        ],
      ),
    );
  }

  void _showChangeRoleDialog(Map<String, dynamic> user) {
    String? selectedRole = user['role'] as String?;
    final roles = [
      'super_admin',
      'admin',
      'coordinator',
      'field_coordinator',
      'datacollector',
      'enumerator',
      'user',
    ];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Change Role'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Select new role for ${user['full_name']}:',
                style: GoogleFonts.poppins(fontSize: 14),
              ),
              const SizedBox(height: 16),
              ...roles.map(
                (role) => RadioListTile<String>(
                  title: Text(role.replaceAll('_', ' ').toUpperCase()),
                  value: role,
                  groupValue: selectedRole,
                  onChanged: (value) {
                    setDialogState(() => selectedRole = value);
                  },
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                Navigator.pop(context);
                await _updateUserRole(user['id'], selectedRole);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
              ),
              child: const Text('Save', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _updateUserRole(String userId, String? newRole) async {
    if (newRole == null) return;

    try {
      await _supabase
          .from('profiles')
          .update({
            'role': newRole,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      await _loadData();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Role updated successfully'),
            backgroundColor: AppColors.primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _updateUserStatus(String userId, String newStatus) async {
    try {
      await _supabase
          .from('profiles')
          .update({
            'status': newStatus,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', userId);

      await _loadData();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'User ${newStatus == 'suspended' ? 'suspended' : 'activated'}',
            ),
            backgroundColor: AppColors.primaryGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _deleteUser(Map<String, dynamic> user) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete User'),
        content: Text(
          'Are you sure you want to delete ${user['full_name']}? This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await _supabase.from('profiles').delete().eq('id', user['id']);
        await _loadData();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('User deleted'),
              backgroundColor: AppColors.primaryGreen,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }

  Widget _buildRolesTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Role Distribution',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          ..._roleStats.entries.map(
            (entry) => _buildRoleStatCard(entry.key, entry.value),
          ),
        ],
      ),
    );
  }

  Widget _buildRoleStatCard(String role, int count) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: _buildRoleBadge(role),
        title: Text(
          role.replaceAll('_', ' ').toUpperCase(),
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.primaryBlue.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            count.toString(),
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.bold,
              color: AppColors.primaryBlue,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSystemTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'System Information',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          _buildSystemCard(
            'Total Users',
            _allUsers.length.toString(),
            Icons.people,
          ),
          _buildSystemCard(
            'Active Users',
            (_statusStats['active'] ?? 0).toString(),
            Icons.check_circle,
          ),
          _buildSystemCard(
            'Pending Approvals',
            (_statusStats['pending_approval'] ?? 0).toString(),
            Icons.pending,
          ),
          _buildSystemCard(
            'Suspended Users',
            (_statusStats['suspended'] ?? 0).toString(),
            Icons.block,
          ),
          const SizedBox(height: 24),
          Text(
            'Quick Actions',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          _buildQuickActionCard(
            'Approve All Pending',
            'Approve all pending user registrations',
            Icons.done_all,
            Colors.green,
            _approveAllPending,
          ),
          _buildQuickActionCard(
            'Export Users',
            'Export user list to CSV',
            Icons.download,
            AppColors.primaryBlue,
            _exportUsers,
          ),
          const SizedBox(height: 24),
          _buildSystemSettingsSection(),
          const SizedBox(height: 24),
          _buildDatabaseManagementSection(),
          const SizedBox(height: 24),
          _buildNotificationSettingsSection(),
        ],
      ),
    );
  }

  Widget _buildSystemSettingsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.settings, color: Colors.indigo, size: 20),
            const SizedBox(width: 8),
            Text(
              'System Settings',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.indigo,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildQuickActionCard(
          'Auto-Release Settings',
          'Configure auto-release timing for site visits',
          Icons.timer,
          Colors.teal,
          _showAutoReleaseSettings,
        ),
        _buildQuickActionCard(
          'Email Templates',
          'Manage system email templates',
          Icons.mail,
          Colors.deepOrange,
          _showEmailTemplates,
        ),
        _buildQuickActionCard(
          'Permit Requirements',
          'Configure locality permit settings',
          Icons.assignment,
          Colors.purple,
          _showPermitRequirements,
        ),
      ],
    );
  }

  Widget _buildDatabaseManagementSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.storage, color: Colors.blueGrey, size: 20),
            const SizedBox(width: 8),
            Text(
              'Database Management',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.blueGrey,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildQuickActionCard(
          'Hub Management',
          'Manage hubs and regions',
          Icons.hub,
          Colors.cyan,
          _showHubManagement,
        ),
        _buildQuickActionCard(
          'State/Locality Setup',
          'Configure states and localities',
          Icons.map,
          Colors.amber.shade700,
          _showStateLocalityManagement,
        ),
        _buildQuickActionCard(
          'Site Registry',
          'Manage master sites database',
          Icons.business,
          Colors.deepPurple,
          _showSiteRegistry,
        ),
      ],
    );
  }

  Widget _buildNotificationSettingsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.notifications, color: Colors.red, size: 20),
            const SizedBox(width: 8),
            Text(
              'Notification Settings',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.red,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildQuickActionCard(
          'Push Notifications',
          'Configure push notification settings',
          Icons.notifications_active,
          Colors.red,
          _showPushNotificationSettings,
        ),
        _buildQuickActionCard(
          'Email Notifications',
          'Manage email notification preferences',
          Icons.email,
          Colors.blue,
          _showEmailNotificationSettings,
        ),
        _buildQuickActionCard(
          'Broadcast Message',
          'Send message to all users',
          Icons.campaign,
          Colors.orange,
          _showBroadcastMessage,
        ),
      ],
    );
  }

  void _exportUsers() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Exporting users...'),
        backgroundColor: Colors.blue,
      ),
    );
  }

  void _showAutoReleaseSettings() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Auto-Release Settings',
          style: GoogleFonts.poppins(fontWeight: FontWeight.bold),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Release Timeout'),
              subtitle: const Text('24 hours'),
              trailing: const Icon(Icons.edit),
            ),
            ListTile(
              title: const Text('Confirmation Deadline'),
              subtitle: const Text('4 hours'),
              trailing: const Icon(Icons.edit),
            ),
            ListTile(
              title: const Text('Reminder Frequency'),
              subtitle: const Text('Every 2 hours'),
              trailing: const Icon(Icons.edit),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showEmailTemplates() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Email templates management - Coming soon')),
    );
  }

  void _showPermitRequirements() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Permit requirements settings - Coming soon'),
      ),
    );
  }

  void _showHubManagement() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Hub management - Coming soon')),
    );
  }

  void _showStateLocalityManagement() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('State/Locality management - Coming soon')),
    );
  }

  void _showSiteRegistry() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Site registry management - Coming soon')),
    );
  }

  void _showPushNotificationSettings() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Push notification settings - Coming soon')),
    );
  }

  void _showEmailNotificationSettings() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Email notification settings - Coming soon'),
      ),
    );
  }

  void _showBroadcastMessage() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _BroadcastDialog(supabase: _supabase),
    );
  }

  Widget _buildSystemCard(String label, String value, IconData icon) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.primaryBlue.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: AppColors.primaryBlue),
        ),
        title: Text(label, style: GoogleFonts.poppins()),
        trailing: Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppColors.primaryBlue,
          ),
        ),
      ),
    );
  }

  Widget _buildQuickActionCard(
    String title,
    String subtitle,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(
          title,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(subtitle, style: GoogleFonts.poppins(fontSize: 12)),
        trailing: Icon(Icons.chevron_right, color: Colors.grey[400]),
      ),
    );
  }

  Future<void> _approveAllPending() async {
    final pendingUsers = _allUsers
        .where((u) => u['status'] == 'pending_approval')
        .toList();

    if (pendingUsers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No pending users to approve')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve All Pending'),
        content: Text(
          'This will approve ${pendingUsers.length} pending users. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryGreen,
            ),
            child: const Text(
              'Approve All',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        for (final user in pendingUsers) {
          await _supabase
              .from('profiles')
              .update({
                'status': 'active',
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', user['id']);
        }

        await _loadData();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${pendingUsers.length} users approved'),
              backgroundColor: AppColors.primaryGreen,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Broadcast Center dialog — matches web /admin/broadcast feature set
// ─────────────────────────────────────────────────────────────────────────────
class _BroadcastDialog extends StatefulWidget {
  final dynamic supabase;
  const _BroadcastDialog({required this.supabase});

  @override
  State<_BroadcastDialog> createState() => _BroadcastDialogState();
}

class _BroadcastDialogState extends State<_BroadcastDialog> {
  final _titleEnCtrl = TextEditingController();
  final _titleArCtrl = TextEditingController();
  final _msgEnCtrl = TextEditingController();
  final _msgArCtrl = TextEditingController();
  final _linkCtrl = TextEditingController();

  String _audience = 'all';
  String _priority = 'normal';
  bool _sending = false;
  Map<String, dynamic>? _result;

  static const _audiences = [
    {'value': 'all', 'label': 'All Users / كل المستخدمين', 'icon': Icons.group},
    {
      'value': 'no_bank_account',
      'label': 'No Bank Account / بدون حساب بنكي',
      'icon': Icons.account_balance,
    },
    {
      'value': 'data_collector',
      'label': 'Data Collectors / جامعو البيانات',
      'icon': Icons.assignment_ind,
    },
    {
      'value': 'coordinator',
      'label': 'Coordinators / المنسقون',
      'icon': Icons.manage_accounts,
    },
  ];

  static const _priorities = [
    {'value': 'normal', 'label': 'Normal / عادي', 'color': 0xFF64748B},
    {'value': 'high', 'label': 'High / عالي', 'color': 0xFFD97706},
    {'value': 'urgent', 'label': 'Urgent / عاجل', 'color': 0xFFDC2626},
  ];

  static const _templates = [
    {
      'label': 'Bank Account Reminder',
      'labelAr': 'تذكير بالحساب البنكي',
      'titleEn': 'Action Required: Add Bank Account',
      'titleAr': 'إجراء مطلوب: أضف حسابك البنكي',
      'msgEn':
          'Please update your bank account details in your profile settings to receive payments.',
      'msgAr':
          'يرجى تحديث بيانات حسابك البنكي في إعدادات ملفك الشخصي لاستلام المدفوعات.',
      'audience': 'no_bank_account',
      'priority': 'high',
    },
    {
      'label': 'System Maintenance',
      'labelAr': 'صيانة النظام',
      'titleEn': 'Scheduled Maintenance',
      'titleAr': 'صيانة مجدولة',
      'msgEn':
          'The system will be under maintenance. Please save your work before the maintenance window.',
      'msgAr': 'سيكون النظام تحت الصيانة. يرجى حفظ عملك قبل فترة الصيانة.',
      'audience': 'all',
      'priority': 'high',
    },
    {
      'label': 'New Feature',
      'labelAr': 'ميزة جديدة',
      'titleEn': 'New Feature Available',
      'titleAr': 'ميزة جديدة متاحة',
      'msgEn':
          'A new feature has been added to improve your workflow. Check it out in the app.',
      'msgAr': 'تمت إضافة ميزة جديدة لتحسين سير عملك. تحقق منها في التطبيق.',
      'audience': 'all',
      'priority': 'normal',
    },
  ];

  void _applyTemplate(Map t) {
    _titleEnCtrl.text = t['titleEn'] as String;
    _titleArCtrl.text = t['titleAr'] as String;
    _msgEnCtrl.text = t['msgEn'] as String;
    _msgArCtrl.text = t['msgAr'] as String;
    setState(() {
      _audience = t['audience'] as String;
      _priority = t['priority'] as String;
    });
  }

  Future<void> _send() async {
    if (_titleEnCtrl.text.trim().isEmpty || _msgEnCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Please fill in English title and message / يرجى ملء العنوان والرسالة بالإنجليزية',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    setState(() => _sending = true);

    try {
      // 1. Load target users
      var query = widget.supabase
          .from('profiles')
          .select('id, bank_account, role')
          .not('role', 'is', null);
      final List users = await query;

      List targetUsers = users;
      if (_audience == 'no_bank_account') {
        targetUsers = users.where((u) {
          final ba = u['bank_account'] as Map?;
          final acct = ba?['accountNumber'] ?? ba?['account_number'];
          return acct == null || (acct as String).isEmpty;
        }).toList();
      } else if (_audience != 'all') {
        targetUsers = users
            .where(
              (u) => (u['role'] as String? ?? '').toLowerCase() == _audience,
            )
            .toList();
      }

      if (targetUsers.isEmpty) {
        if (mounted) setState(() => _sending = false);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('No users match the selected audience'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      // 2. Build notification rows
      final now = DateTime.now().toUtc().toIso8601String();
      final broadcastId = 'bc_${DateTime.now().millisecondsSinceEpoch}';
      final titleEn = _titleEnCtrl.text.trim();
      final titleAr = _titleArCtrl.text.trim().isNotEmpty
          ? _titleArCtrl.text.trim()
          : titleEn;
      final msgEn = _msgEnCtrl.text.trim();
      final msgAr = _msgArCtrl.text.trim().isNotEmpty
          ? _msgArCtrl.text.trim()
          : msgEn;
      final link = _linkCtrl.text.trim().isNotEmpty
          ? _linkCtrl.text.trim()
          : null;
      final notifType = _priority == 'urgent'
          ? 'error'
          : _priority == 'high'
          ? 'warning'
          : 'info';

      final rows = targetUsers
          .map(
            (u) => {
              'recipient_id': u['id'],
              'user_id': u['id'],
              'title_en': titleEn,
              'title_ar': titleAr,
              'message_en': msgEn,
              'message_ar': msgAr,
              'priority': _priority,
              'action_url': link,
              'related_entity_id': broadcastId,
              'entity_type': 'broadcast_batch',
              'event_type': 'broadcast',
              'status': 'pending',
              'email_sent': false,
              'title': titleEn,
              'message': msgEn,
              'link': link,
              'type': notifType,
              'is_read': false,
              'created_at': now,
            },
          )
          .toList();

      await widget.supabase.from('notifications').insert(rows);

      // 3. FCM push (fire-and-forget, don't fail if unavailable)
      try {
        await widget.supabase.functions.invoke(
          'send-fcm-push',
          body: {
            'user_ids': targetUsers.map((u) => u['id']).toList(),
            'title': titleAr.isNotEmpty ? '$titleEn | $titleAr' : titleEn,
            'body': msgAr.isNotEmpty ? '$msgEn\n$msgAr' : msgEn,
            'priority': _priority,
            'notification_type': 'broadcast',
            'data': {
              'type': 'broadcast',
              'broadcast_id': broadcastId,
              'action_url': link ?? '',
              'priority': _priority,
            },
            'action_url': ?link,
          },
        );
      } catch (_) {}

      if (mounted) {
        setState(() {
          _sending = true;
          _result = {
            'sent': targetUsers.length,
            'audience': _audience,
            'priority': _priority,
          };
          _sending = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _sending = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  void dispose() {
    _titleEnCtrl.dispose();
    _titleArCtrl.dispose();
    _msgEnCtrl.dispose();
    _msgArCtrl.dispose();
    _linkCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 520, maxHeight: 680),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 32,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Column(
          children: [
            // ── Header ──────────────────────────────────────────────────
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF7C3AED), Color(0xFF5B21B6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: const EdgeInsets.fromLTRB(20, 18, 16, 18),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.campaign_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Broadcast Center / مركز البث',
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Send to all users or a filtered group',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Body ────────────────────────────────────────────────────
            Expanded(
              child: _result != null
                  ? _buildSuccess()
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Quick templates
                          Text(
                            'Quick Templates / قوالب سريعة',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: _templates
                                .map(
                                  (t) => GestureDetector(
                                    onTap: () => _applyTemplate(t),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF5F0FF),
                                        borderRadius: BorderRadius.circular(20),
                                        border: Border.all(
                                          color: const Color(
                                            0xFF7C3AED,
                                          ).withValues(alpha: 0.3),
                                        ),
                                      ),
                                      child: Text(
                                        t['label'] as String,
                                        style: GoogleFonts.poppins(
                                          fontSize: 11,
                                          color: const Color(0xFF7C3AED),
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                          const SizedBox(height: 16),

                          // Audience
                          Text(
                            'Audience / الجمهور المستهدف',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: _audiences.map((a) {
                              final sel = _audience == a['value'];
                              return GestureDetector(
                                onTap: () => setState(
                                  () => _audience = a['value'] as String,
                                ),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: sel
                                        ? const Color(0xFF7C3AED)
                                        : Colors.grey.shade100,
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: sel
                                          ? const Color(0xFF7C3AED)
                                          : Colors.grey.shade300,
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        a['icon'] as IconData,
                                        size: 13,
                                        color: sel
                                            ? Colors.white
                                            : Colors.grey.shade600,
                                      ),
                                      const SizedBox(width: 5),
                                      Text(
                                        (a['label'] as String)
                                            .split(' / ')
                                            .first,
                                        style: GoogleFonts.poppins(
                                          fontSize: 11,
                                          color: sel
                                              ? Colors.white
                                              : Colors.grey.shade700,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 16),

                          // Priority
                          Text(
                            'Priority / الأولوية',
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: _priorities.map((p) {
                              final sel = _priority == p['value'];
                              final col = Color(p['color'] as int);
                              return Expanded(
                                child: GestureDetector(
                                  onTap: () => setState(
                                    () => _priority = p['value'] as String,
                                  ),
                                  child: Container(
                                    margin: const EdgeInsets.only(right: 8),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 8,
                                    ),
                                    decoration: BoxDecoration(
                                      color: sel
                                          ? col.withValues(alpha: 0.12)
                                          : Colors.grey.shade50,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: sel ? col : Colors.grey.shade200,
                                        width: sel ? 2 : 1,
                                      ),
                                    ),
                                    child: Text(
                                      (p['label'] as String).split(' / ').first,
                                      textAlign: TextAlign.center,
                                      style: GoogleFonts.poppins(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: sel ? col : Colors.grey.shade600,
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 16),

                          // EN Title
                          _field(
                            _titleEnCtrl,
                            'Title (English) *',
                            maxLines: 1,
                          ),
                          const SizedBox(height: 10),
                          // AR Title
                          _field(
                            _titleArCtrl,
                            'العنوان (عربي)',
                            maxLines: 1,
                            rtl: true,
                          ),
                          const SizedBox(height: 10),
                          // EN Message
                          _field(
                            _msgEnCtrl,
                            'Message (English) *',
                            maxLines: 3,
                          ),
                          const SizedBox(height: 10),
                          // AR Message
                          _field(
                            _msgArCtrl,
                            'الرسالة (عربي)',
                            maxLines: 3,
                            rtl: true,
                          ),
                          const SizedBox(height: 10),
                          // Action link
                          _field(
                            _linkCtrl,
                            'Action Link (optional)',
                            maxLines: 1,
                            hint: 'e.g. /profile/bank-account',
                          ),
                          const SizedBox(height: 20),

                          // Send button
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _sending ? null : _send,
                              icon: _sending
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Icon(Icons.send_rounded, size: 18),
                              label: Text(
                                _sending
                                    ? 'Sending... / جاري الإرسال...'
                                    : 'Send Broadcast / إرسال البث',
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF7C3AED),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccess() {
    final sent = _result!['sent'] as int;
    final audience = _result!['audience'] as String;
    final priority = _result!['priority'] as String;
    final col = priority == 'urgent'
        ? Colors.red
        : priority == 'high'
        ? Colors.orange
        : Colors.green;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.check_circle_rounded,
                color: Colors.green.shade600,
                size: 48,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Broadcast Sent! / تم الإرسال!',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '$sent recipients notified',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _badge(audience, Colors.purple),
                const SizedBox(width: 8),
                _badge(priority, col),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => setState(() => _result = null),
                    child: Text(
                      'Send Another / أرسل آخر',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF7C3AED),
                      foregroundColor: Colors.white,
                    ),
                    child: Text(
                      'Done / تم',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController ctrl,
    String label, {
    int maxLines = 1,
    bool rtl = false,
    String? hint,
  }) {
    return TextField(
      controller: ctrl,
      maxLines: maxLines,
      textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
      style: GoogleFonts.poppins(fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: GoogleFonts.poppins(
          fontSize: 12,
          color: Colors.grey.shade600,
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
      ),
    );
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: GoogleFonts.poppins(
          fontSize: 11,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
