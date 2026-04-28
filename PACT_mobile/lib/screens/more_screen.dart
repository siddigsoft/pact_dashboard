import 'package:flutter/material.dart';
import 'approval_dashboard_screen.dart';
import 'advance_requests_report_screen.dart';
import 'archive_screen.dart';
import 'budget_screen.dart';
import 'comprehensive_monitoring_form_screen.dart';
import 'coordinator_dashboard_screen.dart';
import 'cost_submission_screen.dart';
import 'data_export_screen.dart';
import 'digital_signatures_screen.dart';
import 'documents_screen.dart';
import 'down_payment_approval_screen.dart';
import 'equipment_screen.dart';
import 'exchange_rates_screen.dart';
import 'global_search_screen.dart';
import 'helpline_screen.dart';
import 'help_support_screen.dart';
import 'hub_management_screen.dart';
import 'incident_report_screen.dart';
import 'mmp_cycle_close_screen.dart';
import 'mmp_management_screen.dart';
import 'monitoring_plan_screen.dart';
import 'profile_screen.dart';
import 'projects_screen.dart';
import 'questionnaire_analytics_screen.dart';
import 'reconciliation_dashboard_screen.dart';
import 'reports_screen.dart';
import 'retainer_management_screen.dart';
import 'safety_hub_screen.dart';
import 'settings_screen.dart';
import 'site_verification_screen.dart';
import 'staff_directory_screen.dart';
import 'tracker_preparation_plan_screen.dart';
import 'transaction_scanner_screen.dart';
import 'admin/broadcast_center_screen.dart';
import 'admin/permissions_management_screen.dart';
import 'admin/role_perspective_screen.dart';
import '../widgets/reusable_app_bar.dart';

class MoreScreen extends StatefulWidget {
  final String userRole;

  const MoreScreen({super.key, this.userRole = ''});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  String _search = '';

  String get _role => widget.userRole.toLowerCase().trim();

  bool get _isCoordinator =>
      _role == 'coordinator' ||
      _role == 'field_coordinator' ||
      _role == 'state_coordinator';

  bool get _isSupervisor =>
      _role == 'supervisor' ||
      _role == 'hubsupervisor' ||
      _role.contains('supervisor');

  bool get _isAdmin =>
      _role == 'admin' || _role == 'super_admin' || _role == 'fom';

  bool get _isFinance =>
      _role == 'finance' ||
      _role == 'finance_manager' ||
      _role == 'financialadmin';

  bool get _canManageOps => _isAdmin || _isSupervisor || _isCoordinator;

  bool get _showAllForAdmin => _isAdmin;

  bool get _canApproveFinance => _isAdmin || _isSupervisor || _isFinance;

  bool _canSeeAdminFeatures() => _isAdmin;

  bool _canSeeReports() =>
      _canSeeAdminFeatures() || _isCoordinator || _isSupervisor || _isFinance;

  bool _canSeeFinance() =>
      _canSeeAdminFeatures() || _isCoordinator || _isSupervisor || _isFinance;

  void _navigateToScreen(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    final fieldOps = <_MoreItem>[
      if (_showAllForAdmin)
        _MoreItem(
          Icons.fact_check,
          'Monitoring Form',
          () => _navigateToScreen(const ComprehensiveMonitoringFormScreen()),
        ),
      _MoreItem(
        Icons.safety_check,
        'Safety Hub',
        () => _navigateToScreen(const SafetyHubScreen()),
      ),
      _MoreItem(
        Icons.warning_amber,
        'Incidents',
        () => _navigateToScreen(const IncidentReportScreen()),
      ),
      _MoreItem(
        Icons.construction,
        'Equipment',
        () => _navigateToScreen(const EquipmentScreen()),
      ),
      if (_isCoordinator || _showAllForAdmin)
        _MoreItem(
          Icons.verified_user,
          'Verification',
          () => _navigateToScreen(const SiteVerificationScreen()),
        ),
      _MoreItem(
        Icons.folder_copy,
        'Documents',
        () => _navigateToScreen(const DocumentsScreen()),
      ),
      _MoreItem(
        Icons.phone,
        'Helpline',
        () => _navigateToScreen(HelplineScreen()),
      ),
      if (_showAllForAdmin)
        _MoreItem(
          Icons.description,
          'MMP Management',
          () => _navigateToScreen(const MmpManagementScreen()),
        ),
      if (_showAllForAdmin)
        _MoreItem(
          Icons.assignment,
          'Monitoring Plan',
          () => _navigateToScreen(const MonitoringPlanScreen()),
        ),
      if (_showAllForAdmin)
        _MoreItem(
          Icons.lock_clock,
          'Cycle Close',
          () => _navigateToScreen(const MmpCycleCloseScreen()),
        ),
      if (_showAllForAdmin)
        _MoreItem(
          Icons.track_changes,
          'Tracker Plan',
          () => _navigateToScreen(const TrackerPreparationPlanScreen()),
        ),
    ];

    final financeItems = <_MoreItem>[
      if (_canManageOps || _isFinance)
        _MoreItem(
          Icons.attach_money,
          'Cost Submission',
          () => _navigateToScreen(const CostSubmissionScreen()),
        ),
      if (_canApproveFinance) ...[
        _MoreItem(
          Icons.payment,
          'Down Payment',
          () => _navigateToScreen(const DownPaymentApprovalScreen()),
        ),
        _MoreItem(
          Icons.approval,
          'Approvals',
          () => _navigateToScreen(const ApprovalDashboardScreen()),
        ),
      ],
      if (_showAllForAdmin) ...[
        _MoreItem(
          Icons.receipt_long,
          'Retainers',
          () => _navigateToScreen(const RetainerManagementScreen()),
        ),
        _MoreItem(
          Icons.currency_exchange,
          'Exchange Rates',
          () => _navigateToScreen(const ExchangeRatesScreen()),
        ),
        _MoreItem(
          Icons.account_balance,
          'Budget',
          () => _navigateToScreen(const BudgetScreen()),
        ),
        _MoreItem(
          Icons.folder_special,
          'Projects',
          () => _navigateToScreen(const ProjectsScreen()),
        ),
        _MoreItem(
          Icons.draw,
          'Signatures',
          () => _navigateToScreen(const DigitalSignaturesScreen()),
        ),
        _MoreItem(
          Icons.document_scanner,
          'Scanner',
          () => _navigateToScreen(const TransactionScannerScreen()),
        ),
      ],
    ];

    final reportsItems = <_MoreItem>[
      if (_canSeeReports()) ...[
        _MoreItem(
          Icons.bar_chart,
          'Reports',
          () => _navigateToScreen(const ReportsScreen()),
        ),
        _MoreItem(
          Icons.request_quote,
          'Advance Reports',
          () => _navigateToScreen(const AdvanceRequestsReportScreen()),
        ),
      ],
      if (_showAllForAdmin) ...[
        _MoreItem(
          Icons.download,
          'Data Export',
          () => _navigateToScreen(const DataExportScreen()),
        ),
        _MoreItem(
          Icons.archive,
          'Archive',
          () => _navigateToScreen(const ArchiveScreen()),
        ),
        _MoreItem(
          Icons.quiz,
          'Questionnaire Analytics',
          () => _navigateToScreen(const QuestionnaireAnalyticsScreen()),
        ),
      ],
    ];

    final adminItems = <_MoreItem>[
      if (_canSeeAdminFeatures()) ...[
        _MoreItem(
          Icons.hub,
          'Hub Management',
          () => _navigateToScreen(const HubManagementScreen()),
        ),
        _MoreItem(
          Icons.people,
          'Staff Directory',
          () => _navigateToScreen(const StaffDirectoryScreen()),
        ),
        _MoreItem(
          Icons.account_tree,
          'Reconciliation',
          () => _navigateToScreen(const ReconciliationDashboardScreen()),
        ),
        _MoreItem(
          Icons.manage_accounts,
          'Coordinator',
          () => _navigateToScreen(const CoordinatorDashboardScreen()),
        ),
        _MoreItem(
          Icons.search,
          'Global Search',
          () => _navigateToScreen(const GlobalSearchScreen()),
        ),
        _MoreItem(
          Icons.campaign,
          'Broadcast Center',
          () => _navigateToScreen(const BroadcastCenterScreen()),
        ),
        _MoreItem(
          Icons.shield,
          'Permissions',
          () => _navigateToScreen(const PermissionsManagementScreen()),
        ),
        _MoreItem(
          Icons.visibility,
          'Role Perspective',
          () => _navigateToScreen(const RolePerspectiveScreen()),
        ),
      ],
    ];

    final accountItems = <_MoreItem>[
      _MoreItem(
        Icons.person,
        'Profile',
        () => _navigateToScreen(const ProfileScreen()),
      ),
      _MoreItem(
        Icons.settings,
        'Settings',
        () => _navigateToScreen(const SettingsScreen()),
      ),
      _MoreItem(
        Icons.help_outline,
        'Help & Support',
        () => _navigateToScreen(const HelpSupportScreen()),
      ),
    ];

    final categories = <_MoreCategory>[
      if (fieldOps.isNotEmpty)
        _MoreCategory('Field Operations', Icons.map, fieldOps),
      if (financeItems.isNotEmpty)
        _MoreCategory('Finance', Icons.account_balance_wallet, financeItems),
      if (reportsItems.isNotEmpty)
        _MoreCategory('Reports & Data', Icons.bar_chart, reportsItems),
      if (adminItems.isNotEmpty)
        _MoreCategory('Administration', Icons.admin_panel_settings, adminItems),
      _MoreCategory('Account', Icons.person_outline, accountItems),
    ];

    final query = _search.toLowerCase().trim();
    final filteredCategories = query.isEmpty
        ? categories
        : categories
              .map((c) {
                final filtered = c.items
                    .where((i) => i.label.toLowerCase().contains(query))
                    .toList();
                return _MoreCategory(c.title, c.icon, filtered);
              })
              .where((c) => c.items.isNotEmpty)
              .toList();

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'All Features',
              showBackButton: true,
            ),
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search features…',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                filled: true,
                fillColor: Colors.grey.shade50,
              ),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          Expanded(
            child: filteredCategories.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.search_off,
                          size: 48,
                          color: Colors.grey,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'No features match "$_search"',
                          style: const TextStyle(color: Colors.grey),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.only(bottom: 24),
                    itemCount: filteredCategories.length,
                    itemBuilder: (ctx, ci) {
                      final cat = filteredCategories[ci];
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                            child: Row(
                              children: [
                                Icon(
                                  cat.icon,
                                  size: 16,
                                  color: const Color(0xFF1D3461),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  cat.title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: Color(0xFF1D3461),
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          GridView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount:
                                      MediaQuery.of(context).size.width >= 900
                                      ? 4
                                      : 3,
                                  crossAxisSpacing: 10,
                                  mainAxisSpacing: 10,
                                  childAspectRatio: 1.25,
                                ),
                            itemCount: cat.items.length,
                            itemBuilder: (ctx, i) {
                              final item = cat.items[i];
                              return InkWell(
                                onTap: item.onTap,
                                borderRadius: BorderRadius.circular(10),
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                      color: Colors.grey.shade200,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                          alpha: 0.04,
                                        ),
                                        blurRadius: 3,
                                        offset: const Offset(0, 1),
                                      ),
                                    ],
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        item.icon,
                                        size: 32,
                                        color: const Color(0xFF1D3461),
                                      ),
                                      const SizedBox(height: 8),
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                        ),
                                        child: Text(
                                          item.label,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w500,
                                          ),
                                          textAlign: TextAlign.center,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                          Divider(
                            color: Colors.grey.shade100,
                            height: 1,
                            indent: 12,
                            endIndent: 12,
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
      ),
    );
  }
}

class _MoreCategory {
  final String title;
  final IconData icon;
  final List<_MoreItem> items;

  _MoreCategory(this.title, this.icon, this.items);
}

class _MoreItem {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  _MoreItem(this.icon, this.label, this.onTap);
}
