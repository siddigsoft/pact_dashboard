/// Cost Submission Screen for Mobile App
/// Matches web application's cost submission page with tabs

import 'package:flutter/material.dart';
import '../models/operational_cost_submission.dart';
import '../services/operational_cost_service.dart';
import '../widgets/cost_submission/cost_submit_tab.dart';
import '../widgets/cost_submission/cost_history_tab.dart';
import '../widgets/cost_submission/cost_outstanding_tab.dart';
import '../widgets/cost_submission/cost_reconciliation_tab.dart';
import '../widgets/cost_submission/cost_stats_cards.dart';

class CostSubmissionScreen extends StatefulWidget {
  final bool isArabic;

  const CostSubmissionScreen({
    super.key,
    this.isArabic = false,
  });

  @override
  State<CostSubmissionScreen> createState() => _CostSubmissionScreenState();
}

class _CostSubmissionScreenState extends State<CostSubmissionScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final OperationalCostService _service = OperationalCostService();
  
  List<OperationalCostSubmission> _submissions = [];
  List<OperationalCostSubmission> _outstandingAdvances = [];
  CostSubmissionPermissions _permissions = CostSubmissionPermissions.fromRole(null);
  OperationalCostStats _stats = OperationalCostStats.empty();
  bool _isLoading = true;
  String? _error;

  // Labels
  String get _title => widget.isArabic ? 'تقديم التكاليف' : 'Cost Submission';
  String get _submitTab => widget.isArabic ? 'تقديم' : 'Submit';
  String get _reconciliationTab => widget.isArabic ? 'المطابقة' : 'Reconciliation';
  String get _outstandingTab => widget.isArabic ? 'السلف المعلقة' : 'Outstanding';
  String get _historyTab => widget.isArabic ? 'السجل' : 'History';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _service.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      _permissions = await _service.getUserPermissions();
      
      // Fetch submissions based on role
      if (_permissions.canViewTeam) {
        _submissions = await _service.getAllSubmissions();
      } else {
        _submissions = await _service.getUserSubmissions();
      }
      
      // Fetch outstanding advances separately (user's own advances needing reconciliation)
      _outstandingAdvances = await _service.getOutstandingAdvances();
      
      _stats = OperationalCostStats.fromSubmissions(_submissions);
      
      // Set default tab based on role
      if (_permissions.canViewTeam && mounted) {
        _tabController.index = 3; // History tab for admins/supervisors
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _onSubmissionSuccess() {
    _loadData();
    // Switch to history tab to show the new submission
    _tabController.animateTo(3);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _permissions.canViewTeam 
              ? (widget.isArabic ? 'الموافقة على التكاليف' : 'Cost Approval & Tracking')
              : _title,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        elevation: 0,
        backgroundColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
        actions: [
          // Role badge - shows current user role
          _buildRoleBadge(),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: widget.isArabic ? 'تحديث' : 'Refresh',
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: colorScheme.primary,
          unselectedLabelColor: colorScheme.onSurface.withOpacity(0.6),
          indicatorColor: colorScheme.primary,
          tabs: [
            Tab(
              icon: const Icon(Icons.add_circle_outline, size: 20),
              text: _submitTab,
            ),
            Tab(
              icon: const Icon(Icons.receipt_long, size: 20),
              text: _reconciliationTab,
            ),
            Tab(
              icon: Badge(
                isLabelVisible: _stats.outstandingAdvances > 0,
                label: Text('${_stats.outstandingAdvances}'),
                child: const Icon(Icons.pending_actions, size: 20),
              ),
              text: _outstandingTab,
            ),
            Tab(
              icon: Badge(
                isLabelVisible: _stats.pending > 0,
                label: Text('${_stats.pending}'),
                child: const Icon(Icons.history, size: 20),
              ),
              text: _historyTab,
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorWidget()
              : Column(
                  children: [
                    // Stats cards
                    CostStatsCards(
                      stats: _stats,
                      isArabic: widget.isArabic,
                    ),
                    // Tab content
                    Expanded(
                      child: TabBarView(
                        controller: _tabController,
                        children: [
                          // Submit tab
                          CostSubmitTab(
                            isArabic: widget.isArabic,
                            onSuccess: _onSubmissionSuccess,
                            canSubmit: _permissions.canSubmit,
                          ),
                          // Reconciliation tab - user's own advances that need reconciliation
                          CostReconciliationTab(
                            isArabic: widget.isArabic,
                            submissions: _outstandingAdvances,
                            onReconciled: _loadData,
                          ),
                          // Outstanding advances tab - user's own paid advances not yet reconciled
                          CostOutstandingTab(
                            isArabic: widget.isArabic,
                            submissions: _outstandingAdvances,
                          ),
                          // History tab
                          CostHistoryTab(
                            isArabic: widget.isArabic,
                            submissions: _submissions,
                            permissions: _permissions,
                            onActionComplete: _loadData,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildRoleBadge() {
    MaterialColor badgeMaterialColor;
    IconData badgeIcon;
    
    if (_permissions.isSuperAdmin) {
      badgeMaterialColor = Colors.purple;
      badgeIcon = Icons.admin_panel_settings;
    } else if (_permissions.isAdmin) {
      badgeMaterialColor = Colors.purple;
      badgeIcon = Icons.shield;
    } else if (_permissions.isCountryDirector) {
      badgeMaterialColor = Colors.indigo;
      badgeIcon = Icons.public;
    } else if (_permissions.isFOM) {
      badgeMaterialColor = Colors.teal;
      badgeIcon = Icons.work;
    } else if (_permissions.isSupervisor) {
      badgeMaterialColor = Colors.blue;
      badgeIcon = Icons.group;
    } else if (_permissions.isCoordinator) {
      badgeMaterialColor = Colors.green;
      badgeIcon = Icons.person;
    } else if (_permissions.isDataCollector) {
      badgeMaterialColor = Colors.orange;
      badgeIcon = Icons.assignment_ind;
    } else {
      return const SizedBox.shrink();
    }
    
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: badgeMaterialColor.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(badgeIcon, size: 14, color: badgeMaterialColor.shade700),
          const SizedBox(width: 4),
          Text(
            _permissions.getRoleDisplayName(widget.isArabic),
            style: TextStyle(
              fontSize: 12,
              color: badgeMaterialColor.shade700,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              widget.isArabic ? 'حدث خطأ' : 'An error occurred',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              _error ?? '',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: Text(widget.isArabic ? 'إعادة المحاولة' : 'Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
