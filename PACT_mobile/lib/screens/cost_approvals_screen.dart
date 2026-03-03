import 'package:flutter/material.dart';
import '../models/cost_submission.dart';
import '../services/cost_submission_service.dart';
import '../widgets/cost_approval_widgets.dart';

/// Cost Approvals Screen for Supervisors and Admins
///
/// Features:
/// - Tier 1 approvals (Supervisor/FOM)
/// - Tier 2 approvals (Admin)
/// - Approval history
/// - Filtering by hub/project

class CostApprovalsScreen extends StatefulWidget {
  final CostSubmissionService costService;
  final String userRole;
  final String? hubId;
  final bool isArabic;

  const CostApprovalsScreen({
    super.key,
    required this.costService,
    required this.userRole,
    this.hubId,
    this.isArabic = false,
  });

  @override
  State<CostApprovalsScreen> createState() => _CostApprovalsScreenState();
}

class _CostApprovalsScreenState extends State<CostApprovalsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<OperationalCostSubmission> _tier1Pending = [];
  List<OperationalCostSubmission> _tier2Pending = [];
  List<OperationalCostSubmission> _processed = [];
  bool _isLoading = true;

  // Determine which tier this user can approve
  int get userApprovalTier {
    final role = widget.userRole.toLowerCase();
    if (role.contains('admin') || role.contains('super')) {
      return 2; // Can approve Tier 2
    } else if (role.contains('supervisor') || role.contains('fom')) {
      return 1; // Can approve Tier 1
    }
    return 0; // Cannot approve
  }

  bool get canApproveTier1 => userApprovalTier >= 1;
  bool get canApproveTier2 => userApprovalTier >= 2;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      final results = await Future.wait([
        widget.costService.getPendingApprovals(tier: 1, hubId: widget.hubId),
        widget.costService.getPendingApprovals(tier: 2, hubId: widget.hubId),
        widget.costService.getAllSubmissions(hubId: widget.hubId),
      ]);

      setState(() {
        _tier1Pending = results[0];
        _tier2Pending = results[1];
        _processed = results[2]
            .where(
              (s) =>
                  s.status == CostSubmissionStatus.approved ||
                  s.status == CostSubmissionStatus.rejected ||
                  s.status == CostSubmissionStatus.paid,
            )
            .toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      _showError('Failed to load approvals');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    return Scaffold(
      appBar: AppBar(
        title: Text(isArabic ? 'موافقات التكاليف' : 'Cost Approvals'),
        elevation: 0,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadData),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(isArabic ? 'المرحلة 1' : 'Tier 1'),
                  if (_tier1Pending.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    _buildBadge(_tier1Pending.length),
                  ],
                ],
              ),
            ),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(isArabic ? 'المرحلة 2' : 'Tier 2'),
                  if (_tier2Pending.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    _buildBadge(_tier2Pending.length),
                  ],
                ],
              ),
            ),
            Tab(text: isArabic ? 'المعالجة' : 'Processed'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildTier1Tab(),
                _buildTier2Tab(),
                _buildProcessedTab(),
              ],
            ),
    );
  }

  Widget _buildBadge(int count) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.red,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count.toString(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildTier1Tab() {
    if (!canApproveTier1) {
      return _buildNoPermissionState(
        widget.isArabic
            ? 'ليس لديك صلاحية لموافقات المرحلة 1'
            : 'You do not have permission for Tier 1 approvals',
      );
    }

    if (_tier1Pending.isEmpty) {
      return _buildEmptyState(
        icon: Icons.check_circle_outline,
        title: widget.isArabic
            ? 'لا توجد موافقات معلقة'
            : 'No Pending Approvals',
        subtitle: widget.isArabic
            ? 'جميع طلبات المرحلة 1 تمت معالجتها'
            : 'All Tier 1 requests have been processed',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _tier1Pending.length,
        itemBuilder: (context, index) {
          return CostApprovalCard(
            submission: _tier1Pending[index],
            approvalTier: 1,
            isArabic: widget.isArabic,
            onAction: (id, approved, notes) => _handleApproval(
              submissionId: id,
              tier: 1,
              approved: approved,
              notes: notes,
            ),
          );
        },
      ),
    );
  }

  Widget _buildTier2Tab() {
    if (!canApproveTier2) {
      return _buildNoPermissionState(
        widget.isArabic
            ? 'ليس لديك صلاحية لموافقات المرحلة 2'
            : 'You do not have permission for Tier 2 approvals',
      );
    }

    if (_tier2Pending.isEmpty) {
      return _buildEmptyState(
        icon: Icons.check_circle_outline,
        title: widget.isArabic
            ? 'لا توجد موافقات معلقة'
            : 'No Pending Approvals',
        subtitle: widget.isArabic
            ? 'جميع طلبات المرحلة 2 تمت معالجتها'
            : 'All Tier 2 requests have been processed',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _tier2Pending.length,
        itemBuilder: (context, index) {
          return CostApprovalCard(
            submission: _tier2Pending[index],
            approvalTier: 2,
            isArabic: widget.isArabic,
            onAction: (id, approved, notes) => _handleApproval(
              submissionId: id,
              tier: 2,
              approved: approved,
              notes: notes,
            ),
          );
        },
      ),
    );
  }

  Widget _buildProcessedTab() {
    if (_processed.isEmpty) {
      return _buildEmptyState(
        icon: Icons.history,
        title: widget.isArabic ? 'لا يوجد سجل' : 'No History',
        subtitle: widget.isArabic
            ? 'ستظهر هنا الطلبات المعالجة'
            : 'Processed requests will appear here',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _processed.length,
        itemBuilder: (context, index) {
          return _buildProcessedCard(_processed[index]);
        },
      ),
    );
  }

  Widget _buildProcessedCard(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: _buildStatusIcon(submission.status),
        title: Text(
          isArabic
              ? submission.expenseCategory.labelAr
              : submission.expenseCategory.labelEn,
        ),
        subtitle: Text(submission.formattedAmount),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: _getStatusColor(submission.status).withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            isArabic ? submission.status.labelAr : submission.status.labelEn,
            style: TextStyle(
              color: _getStatusColor(submission.status),
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatusIcon(CostSubmissionStatus status) {
    IconData icon;
    Color color;

    switch (status) {
      case CostSubmissionStatus.approved:
      case CostSubmissionStatus.paid:
        icon = Icons.check_circle;
        color = Colors.green;
        break;
      case CostSubmissionStatus.rejected:
        icon = Icons.cancel;
        color = Colors.red;
        break;
      default:
        icon = Icons.circle;
        color = Colors.grey;
    }

    return CircleAvatar(
      backgroundColor: color.withOpacity(0.1),
      child: Icon(icon, color: color, size: 20),
    );
  }

  Color _getStatusColor(CostSubmissionStatus status) {
    switch (status) {
      case CostSubmissionStatus.approved:
      case CostSubmissionStatus.paid:
        return Colors.green;
      case CostSubmissionStatus.rejected:
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: Colors.green[300]),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNoPermissionState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleApproval({
    required String submissionId,
    required int tier,
    required bool approved,
    String? notes,
  }) async {
    try {
      bool success;

      if (approved) {
        success = await widget.costService.approveSubmission(
          submissionId: submissionId,
          tier: tier,
          notes: notes,
        );
      } else {
        success = await widget.costService.rejectSubmission(
          submissionId: submissionId,
          tier: tier,
          notes: notes ?? '',
        );
      }

      if (success) {
        _showSuccess(
          widget.isArabic
              ? (approved ? 'تمت الموافقة بنجاح' : 'تم الرفض بنجاح')
              : (approved ? 'Approved successfully' : 'Rejected successfully'),
        );
        await _loadData();
      } else {
        _showError(widget.isArabic ? 'فشلت العملية' : 'Operation failed');
      }
    } catch (e) {
      _showError(widget.isArabic ? 'حدث خطأ' : 'An error occurred');
    }
  }
}
