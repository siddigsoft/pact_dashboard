import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../widgets/custom_drawer_menu.dart';
import '../theme/app_colors.dart';
import '../models/help_models.dart';
import 'admin_user_approval_screen.dart';
import 'admin/user_management_screen.dart';
import 'admin/role_management_screen.dart';
import 'admin/audit_logs_screen.dart';
import 'admin/email_tracking_screen.dart';
import 'field_operations_enhanced_screen.dart';
import 'wallet_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final _supabase = Supabase.instance.client;

  bool _isLoading = true;
  String? _userRole;
  bool _isSuperAdmin = false;
  bool _isAdmin = false;

  // Stats
  int _pendingApprovals = 0;
  int _totalUsers = 0;
  int _activeVisits = 0;
  int _supportContacts = 0;

  // Extended Stats
  int _totalMMPs = 0;
  int _pendingMMPs = 0;
  int _approvedMMPs = 0;
  int _completedVisits = 0;
  int _pendingFinancialApprovals = 0;
  int _totalWalletBalance = 0;
  int _pendingDispatch = 0;
  int _ongoingVisits = 0;

  // Support contacts
  List<SupportContact> _contacts = [];
  bool _loadingContacts = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final user = _supabase.auth.currentUser;
      if (user == null) {
        setState(() => _isLoading = false);
        return;
      }

      // Get user role
      final profile = await _supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (profile != null) {
        final role = (profile['role'] as String?)?.toLowerCase() ?? '';
        _userRole = role;
        _isSuperAdmin = role == 'super_admin' || role == 'superadmin';
        _isAdmin = role == 'admin' || _isSuperAdmin;
      }

      // Load stats
      await _loadStats();
      await _loadSupportContacts();

      if (mounted) {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      debugPrint('Error loading admin data: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _loadStats() async {
    try {
      // Pending approvals
      final pendingResponse = await _supabase
          .from('profiles')
          .select('id')
          .eq('status', 'pending_approval');
      _pendingApprovals = (pendingResponse as List).length;

      // Total users
      final usersResponse = await _supabase.from('profiles').select('id');
      _totalUsers = (usersResponse as List).length;

      // Active visits
      final visitsResponse = await _supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('status', 'Ongoing');
      _activeVisits = (visitsResponse as List).length;
      _ongoingVisits = _activeVisits;

      // Support contacts
      final contactsResponse = await _supabase
          .from('support_contacts')
          .select('id');
      _supportContacts = (contactsResponse as List).length;

      // Load extended stats
      await _loadExtendedStats();
    } catch (e) {
      debugPrint('Error loading stats: $e');
    }
  }

  Future<void> _loadExtendedStats() async {
    try {
      // MMP Stats
      final mmpsResponse = await _supabase.from('mmps').select('id, status');
      final mmpsList = mmpsResponse as List;
      _totalMMPs = mmpsList.length;
      _pendingMMPs = mmpsList
          .where(
            (m) =>
                m['status'] == 'pending' ||
                m['status'] == 'draft' ||
                m['status'] == 'submitted',
          )
          .length;
      _approvedMMPs = mmpsList
          .where(
            (m) => m['status'] == 'approved' || m['status'] == 'dispatched',
          )
          .length;

      // Completed Visits
      final completedResponse = await _supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('status', 'Completed');
      _completedVisits = (completedResponse as List).length;

      // Pending Dispatch
      final pendingDispatchResponse = await _supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('status', 'Pending');
      _pendingDispatch = (pendingDispatchResponse as List).length;

      // Financial Stats - Pending approvals
      try {
        final financialResponse = await _supabase
            .from('cost_submissions')
            .select('id')
            .eq('approval_status', 'pending');
        _pendingFinancialApprovals = (financialResponse as List).length;
      } catch (e) {
        debugPrint('Cost submissions table may not exist: $e');
      }

      // Total wallet balance
      try {
        final walletsResponse = await _supabase
            .from('wallets')
            .select('balance');
        final wallets = walletsResponse as List;
        _totalWalletBalance = wallets.fold<int>(
          0,
          (sum, w) => sum + ((w['balance'] as num?)?.toInt() ?? 0),
        );
      } catch (e) {
        debugPrint('Wallets table may not exist: $e');
      }
    } catch (e) {
      debugPrint('Error loading extended stats: $e');
    }
  }

  Future<void> _loadSupportContacts() async {
    setState(() => _loadingContacts = true);
    try {
      final response = await _supabase
          .from('support_contacts')
          .select()
          .order('sort_order', ascending: true);

      _contacts = (response as List)
          .map((e) => SupportContact.fromJson(e))
          .toList();
    } catch (e) {
      debugPrint('Error loading contacts: $e');
    }
    if (mounted) {
      setState(() => _loadingContacts = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isAdmin && !_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Access Denied')),
        body: const Center(
          child: Text('You do not have permission to access this screen.'),
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
          'Admin Dashboard',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              top: false,
              child: RefreshIndicator(
              onRefresh: _loadData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildStatsGrid(),
                    const SizedBox(height: 24),
                    _buildExtendedStatsSection(),
                    const SizedBox(height: 24),
                    _buildQuickActions(),
                    const SizedBox(height: 24),
                    _buildMMPManagementSection(),
                    const SizedBox(height: 24),
                    _buildSiteVisitsManagementSection(),
                    const SizedBox(height: 24),
                    _buildFinancialManagementSection(),
                    const SizedBox(height: 24),
                    _buildContactsSection(),
                  ],
                ),
              ),
            )
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddContactDialog,
        backgroundColor: AppColors.primaryBlue,
        icon: const Icon(Icons.person_add, color: Colors.white),
        label: Text(
          'Add Contact',
          style: GoogleFonts.poppins(color: Colors.white),
        ),
      ),
    );
  }

  Widget _buildStatsGrid() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.5,
      children: [
        _buildStatCard(
          'Pending Approvals',
          _pendingApprovals.toString(),
          Icons.pending_actions,
          Colors.orange,
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const AdminUserApprovalScreen()),
          ),
        ),
        _buildStatCard(
          'Total Users',
          _totalUsers.toString(),
          Icons.people,
          AppColors.primaryBlue,
        ),
        _buildStatCard(
          'Active Visits',
          _activeVisits.toString(),
          Icons.location_on,
          AppColors.primaryGreen,
        ),
        _buildStatCard(
          'Support Contacts',
          _supportContacts.toString(),
          Icons.contact_phone,
          Colors.purple,
        ),
      ],
    );
  }

  Widget _buildStatCard(
    String title,
    String value,
    IconData icon,
    Color color, {
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: GoogleFonts.poppins(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quick Actions',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _buildActionChip(
              'User Approvals',
              Icons.how_to_reg,
              Colors.orange,
              () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const AdminUserApprovalScreen(),
                ),
              ),
            ),
            _buildActionChip(
              'Manage Contacts',
              Icons.contact_phone,
              Colors.purple,
              _scrollToContacts,
            ),
          ],
        ),
        const SizedBox(height: 24),
        _buildAdministrationSection(),
        if (_isSuperAdmin) ...[
          const SizedBox(height: 24),
          _buildSuperAdminSection(),
        ],
      ],
    );
  }

  Widget _buildAdministrationSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.admin_panel_settings,
              color: AppColors.primaryBlue,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              'Administration',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.primaryBlue,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildAdminMenuCard(
          'User Management',
          'Manage users, roles, and permissions',
          Icons.people,
          AppColors.primaryBlue,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const UserManagementScreen()),
          ),
        ),
        _buildAdminMenuCard(
          'Role Management',
          'Configure roles and access levels',
          Icons.security,
          Colors.teal,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const RoleManagementScreen()),
          ),
        ),
      ],
    );
  }

  Widget _buildSuperAdminSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.shield, color: Colors.purple, size: 20),
            const SizedBox(width: 8),
            Text(
              'Super Admin',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.purple,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildAdminMenuCard(
          'Audit Logs',
          'View system activity and changes',
          Icons.history,
          Colors.indigo,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const AuditLogsScreen()),
          ),
        ),
        _buildAdminMenuCard(
          'Email Tracking',
          'Monitor email delivery status',
          Icons.email,
          Colors.deepOrange,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const EmailTrackingScreen()),
          ),
        ),
        _buildAdminMenuCard(
          'User Permissions',
          'Configure granular access controls',
          Icons.lock,
          Colors.blueGrey,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const UserManagementScreen()),
          ),
        ),
      ],
    );
  }

  Widget _buildAdminMenuCard(
    String title,
    String subtitle,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color, size: 22),
        ),
        title: Text(
          title,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Text(
          subtitle,
          style: GoogleFonts.poppins(fontSize: 11, color: Colors.grey[600]),
        ),
        trailing: Icon(Icons.chevron_right, color: Colors.grey[400]),
      ),
    );
  }

  void _scrollToContacts() {
    // Already on this page, just scroll or highlight
  }

  Widget _buildExtendedStatsSection() {
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
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.analytics, color: Colors.white, size: 24),
              const SizedBox(width: 12),
              Text(
                'Operations Overview',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildMiniStatCard(
                  'Total MMPs',
                  _totalMMPs.toString(),
                  Icons.folder,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMiniStatCard(
                  'Pending MMPs',
                  _pendingMMPs.toString(),
                  Icons.pending,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMiniStatCard(
                  'Approved',
                  _approvedMMPs.toString(),
                  Icons.check_circle,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildMiniStatCard(
                  'Ongoing Visits',
                  _ongoingVisits.toString(),
                  Icons.location_on,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMiniStatCard(
                  'Completed',
                  _completedVisits.toString(),
                  Icons.done_all,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMiniStatCard(
                  'Pending Dispatch',
                  _pendingDispatch.toString(),
                  Icons.send,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStatCard(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.poppins(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 10,
            ),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildMMPManagementSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.folder_special, color: Colors.teal, size: 20),
            const SizedBox(width: 8),
            Text(
              'MMP Management',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.teal,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildAdminMenuCard(
          'View All MMPs',
          'Browse and manage Monthly Monitoring Plans',
          Icons.folder_open,
          Colors.teal,
          () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const FieldOperationsEnhancedScreen(),
            ),
          ),
        ),
        _buildAdminMenuCard(
          'MMP Approvals',
          'Review and approve pending MMPs ($_pendingMMPs pending)',
          Icons.approval,
          Colors.orange,
          () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const FieldOperationsEnhancedScreen(),
            ),
          ),
        ),
        _buildAdminMenuCard(
          'Dispatch Management',
          'Manage site visit dispatch ($_pendingDispatch pending)',
          Icons.send,
          Colors.indigo,
          () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const FieldOperationsEnhancedScreen(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSiteVisitsManagementSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.location_on, color: AppColors.primaryGreen, size: 20),
            const SizedBox(width: 8),
            Text(
              'Site Visits Management',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.primaryGreen,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildAdminMenuCard(
          'Ongoing Site Visits',
          'Monitor $_ongoingVisits active field visits',
          Icons.directions_walk,
          AppColors.primaryGreen,
          () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const FieldOperationsEnhancedScreen(),
            ),
          ),
        ),
        _buildAdminMenuCard(
          'Completed Visits',
          'Review $_completedVisits completed site visits',
          Icons.check_circle,
          Colors.blue,
          () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const FieldOperationsEnhancedScreen(),
            ),
          ),
        ),
        _buildAdminMenuCard(
          'Site Registry',
          'Manage master sites database',
          Icons.business,
          Colors.deepPurple,
          () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => const FieldOperationsEnhancedScreen(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFinancialManagementSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              Icons.account_balance_wallet,
              color: Colors.amber.shade700,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              'Financial Management',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.amber.shade700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _buildAdminMenuCard(
          'Wallet Management',
          'View and manage project wallets',
          Icons.account_balance_wallet,
          Colors.amber.shade700,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const WalletScreen()),
          ),
        ),
        _buildAdminMenuCard(
          'Cost Approvals',
          'Review $_pendingFinancialApprovals pending cost submissions',
          Icons.receipt_long,
          Colors.green,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const WalletScreen()),
          ),
        ),
        _buildAdminMenuCard(
          'Transportation Costs',
          'Manage transportation and downpayments',
          Icons.directions_car,
          Colors.blueGrey,
          () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const WalletScreen()),
          ),
        ),
      ],
    );
  }

  Widget _buildActionChip(
    String label,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(25),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.poppins(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContactsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Support Contacts',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            IconButton(
              onPressed: _loadSupportContacts,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_loadingContacts)
          const Center(child: CircularProgressIndicator())
        else if (_contacts.isEmpty)
          Center(
            child: Column(
              children: [
                Icon(
                  Icons.contact_phone_outlined,
                  size: 48,
                  color: Colors.grey[400],
                ),
                const SizedBox(height: 8),
                Text(
                  'No contacts yet',
                  style: GoogleFonts.poppins(color: Colors.grey[600]),
                ),
              ],
            ),
          )
        else
          ..._contacts.map((contact) => _buildContactCard(contact)),
      ],
    );
  }

  Widget _buildContactCard(SupportContact contact) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: AppColors.primaryBlue.withValues(alpha: 0.1),
          backgroundImage: contact.avatarUrl != null
              ? NetworkImage(contact.avatarUrl!)
              : null,
          child: contact.avatarUrl == null
              ? Text(
                  contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?',
                  style: GoogleFonts.poppins(
                    color: AppColors.primaryBlue,
                    fontWeight: FontWeight.bold,
                  ),
                )
              : null,
        ),
        title: Text(
          contact.name,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          contact.role,
          style: GoogleFonts.poppins(fontSize: 12, color: Colors.grey[600]),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: contact.isActive
                    ? Colors.green.withValues(alpha: 0.1)
                    : Colors.grey.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                contact.isActive ? 'Active' : 'Inactive',
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: contact.isActive ? Colors.green : Colors.grey,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            PopupMenuButton<String>(
              onSelected: (value) => _handleContactAction(value, contact),
              itemBuilder: (context) => [
                const PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(
                  value: contact.isActive ? 'deactivate' : 'activate',
                  child: Text(contact.isActive ? 'Deactivate' : 'Activate'),
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

  void _handleContactAction(String action, SupportContact contact) async {
    switch (action) {
      case 'edit':
        _showEditContactDialog(contact);
        break;
      case 'activate':
      case 'deactivate':
        await _toggleContactStatus(contact);
        break;
      case 'delete':
        await _deleteContact(contact);
        break;
    }
  }

  Future<void> _toggleContactStatus(SupportContact contact) async {
    try {
      await _supabase
          .from('support_contacts')
          .update({
            'is_active': !contact.isActive,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', contact.id);

      await _loadSupportContacts();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Contact ${contact.isActive ? 'deactivated' : 'activated'}',
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

  Future<void> _deleteContact(SupportContact contact) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Contact'),
        content: Text('Are you sure you want to delete ${contact.name}?'),
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
        await _supabase.from('support_contacts').delete().eq('id', contact.id);
        await _loadSupportContacts();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Contact deleted'),
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

  void _showAddContactDialog() {
    _showContactDialog(null);
  }

  void _showEditContactDialog(SupportContact contact) {
    _showContactDialog(contact);
  }

  void _showContactDialog(SupportContact? contact) {
    final isEditing = contact != null;
    final nameController = TextEditingController(text: contact?.name ?? '');
    final nameArController = TextEditingController(text: contact?.nameAr ?? '');
    final roleController = TextEditingController(text: contact?.role ?? '');
    final roleArController = TextEditingController(text: contact?.roleAr ?? '');
    final emailController = TextEditingController(text: contact?.email ?? '');
    final phoneController = TextEditingController(text: contact?.phone ?? '');
    final whatsappController = TextEditingController(
      text: contact?.whatsapp ?? '',
    );

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isEditing ? 'Edit Contact' : 'Add Contact'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: 'Name (English)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameArController,
                decoration: const InputDecoration(
                  labelText: 'Name (Arabic)',
                  border: OutlineInputBorder(),
                ),
                textDirection: ui.TextDirection.rtl,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: roleController,
                decoration: const InputDecoration(
                  labelText: 'Role (English)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: roleArController,
                decoration: const InputDecoration(
                  labelText: 'Role (Arabic)',
                  border: OutlineInputBorder(),
                ),
                textDirection: ui.TextDirection.rtl,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: emailController,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phoneController,
                decoration: const InputDecoration(
                  labelText: 'Phone',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: whatsappController,
                decoration: const InputDecoration(
                  labelText: 'WhatsApp Number',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.phone,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (nameController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Name is required')),
                );
                return;
              }

              Navigator.pop(context);

              final Map<String, dynamic> data = {
                'name': nameController.text,
                'name_ar': nameArController.text.isEmpty
                    ? null
                    : nameArController.text,
                'role': roleController.text.isEmpty
                    ? null
                    : roleController.text,
                'role_ar': roleArController.text.isEmpty
                    ? null
                    : roleArController.text,
                'email': emailController.text.isEmpty
                    ? null
                    : emailController.text,
                'phone': phoneController.text.isEmpty
                    ? null
                    : phoneController.text,
                'whatsapp': whatsappController.text.isEmpty
                    ? null
                    : whatsappController.text,
                'updated_at': DateTime.now().toIso8601String(),
              };

              try {
                if (isEditing) {
                  await _supabase
                      .from('support_contacts')
                      .update(data)
                      .eq('id', contact.id);
                } else {
                  data['created_by'] = _supabase.auth.currentUser?.id;
                  data['sort_order'] = _contacts.length + 1;
                  await _supabase.from('support_contacts').insert(data);
                }

                await _loadSupportContacts();
                await _loadStats();

                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        'Contact ${isEditing ? 'updated' : 'added'}',
                      ),
                      backgroundColor: AppColors.accentGreen,
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Error: $e'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
            ),
            child: Text(
              isEditing ? 'Update' : 'Add',
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
