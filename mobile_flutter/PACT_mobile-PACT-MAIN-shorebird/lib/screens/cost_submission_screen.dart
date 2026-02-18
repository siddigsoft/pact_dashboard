import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/operational_cost_submission.dart';
import '../services/operational_cost_service.dart';

class CostSubmissionScreen extends StatefulWidget {
  final String? userRole;
  final String? hubId;
  final String? projectId;
  final bool isArabic;

  const CostSubmissionScreen({
    super.key,
    this.userRole,
    this.hubId,
    this.projectId,
    this.isArabic = false,
  });

  @override
  State<CostSubmissionScreen> createState() => _CostSubmissionScreenState();
}

class _CostSubmissionScreenState extends State<CostSubmissionScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _costService = OperationalCostService();
  List<OperationalCostSubmission> _submissions = [];
  OperationalCostStats _stats = OperationalCostStats.empty();
  late CostSubmissionPermissions _permissions;
  bool _isLoading = true;
  String _statusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _permissions = CostSubmissionPermissions.fromRole(widget.userRole);
    _tabController = TabController(length: 4, vsync: this);
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
      final permissions = await _costService.getUserPermissions();
      List<OperationalCostSubmission> submissions;
      if (permissions.canViewTeam) {
        submissions = await _costService.getAllSubmissions(
          hubId: widget.hubId,
          projectId: widget.projectId,
        );
      } else {
        submissions = await _costService.getUserSubmissions();
      }
      final stats = OperationalCostStats.fromSubmissions(submissions);
      setState(() {
        _permissions = permissions;
        _submissions = submissions;
        _stats = stats;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      _showError(widget.isArabic ? 'فشل في تحميل البيانات' : 'Failed to load data');
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  List<OperationalCostSubmission> get _filteredSubmissions {
    if (_statusFilter == 'all') return _submissions;
    return _submissions.where((s) {
      final derived = _getDerivedStatus(s);
      return derived == _statusFilter;
    }).toList();
  }

  String _getDerivedStatus(OperationalCostSubmission s) {
    if (s.status == OperationalCostStatus.cancelled) return 'cancelled';
    if (s.isReconciled) return 'reconciled';
    if (s.status == OperationalCostStatus.paid) return 'paid';
    if (s.tier1Status == 'rejected' ||
        s.tier2Status == 'rejected' ||
        s.tier3Status == 'rejected' ||
        s.status == OperationalCostStatus.rejected) return 'rejected';
    if (s.hasThreeTiers) {
      if (s.tier1Status == 'approved' &&
          s.tier2Status == 'approved' &&
          s.tier3Status == 'approved') return 'approved';
      if (s.tier1Status == 'approved' &&
          (s.tier2Status == 'pending' || s.tier3Status == 'pending')) {
        return 'under_review';
      }
    } else {
      if (s.tier1Status == 'approved' && s.tier2Status == 'approved') {
        return 'approved';
      }
      if (s.tier1Status == 'approved' && s.tier2Status == 'pending') {
        return 'under_review';
      }
    }
    if (s.status == OperationalCostStatus.underReview) return 'under_review';
    return 'pending';
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    return Scaffold(
      appBar: AppBar(
        title: Text(isArabic ? 'تقديم التكاليف التشغيلية' : 'Operational Cost Submission'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: isArabic ? 'تحديث' : 'Refresh',
          ),
          if (_permissions.canViewTeam)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (value) {
                if (value == 'export_csv') _exportCsv();
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'export_csv',
                  child: Row(
                    children: [
                      const Icon(Icons.file_download, size: 20),
                      const SizedBox(width: 8),
                      Text(isArabic ? 'تصدير CSV' : 'Export CSV'),
                    ],
                  ),
                ),
              ],
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: [
            Tab(
              icon: const Icon(Icons.add_circle_outline),
              text: isArabic ? 'تقديم طلب' : 'Submit Request',
            ),
            Tab(
              icon: const Icon(Icons.sync),
              text: isArabic ? 'التسوية' : 'Reconciliation',
            ),
            Tab(
              icon: const Icon(Icons.account_balance_wallet),
              text: isArabic ? 'المستحقات' : 'Outstanding',
            ),
            Tab(
              icon: const Icon(Icons.history),
              text: isArabic ? 'السجل' : 'History',
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                _buildStatsCards(),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildSubmitTab(),
                      _buildReconciliationTab(),
                      _buildOutstandingTab(),
                      _buildHistoryTab(),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildStatsCards() {
    final isArabic = widget.isArabic;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _StatCard(
              title: isArabic ? 'الإجمالي' : 'Total',
              value: _stats.total.toString(),
              color: Colors.blue,
              icon: Icons.receipt_long,
            ),
            const SizedBox(width: 8),
            _StatCard(
              title: isArabic ? 'قيد الانتظار' : 'Pending',
              value: _stats.pending.toString(),
              color: Colors.orange,
              icon: Icons.hourglass_empty,
            ),
            const SizedBox(width: 8),
            _StatCard(
              title: isArabic ? 'قيد المراجعة' : 'Review',
              value: _stats.underReview.toString(),
              color: Colors.blue.shade700,
              icon: Icons.rate_review,
            ),
            const SizedBox(width: 8),
            _StatCard(
              title: isArabic ? 'موافق عليه' : 'Approved',
              value: _stats.approved.toString(),
              color: Colors.green,
              icon: Icons.check_circle,
            ),
            const SizedBox(width: 8),
            _StatCard(
              title: isArabic ? 'مرفوض' : 'Rejected',
              value: _stats.rejected.toString(),
              color: Colors.red,
              icon: Icons.cancel,
            ),
            const SizedBox(width: 8),
            _StatCard(
              title: isArabic ? 'مدفوع' : 'Paid',
              value: _stats.paid.toString(),
              color: Colors.purple,
              icon: Icons.payments,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubmitTab() {
    if (!_permissions.canSubmit) {
      return _buildEmptyState(
        icon: Icons.lock,
        title: widget.isArabic
            ? 'ليس لديك صلاحية لتقديم التكاليف التشغيلية'
            : 'You do not have permission to submit operational costs',
        subtitle: widget.isArabic
            ? 'تواصل مع المسؤول للحصول على الصلاحيات'
            : 'Contact your administrator for access',
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: _OperationalCostForm(
        isArabic: widget.isArabic,
        hubId: widget.hubId,
        projectId: widget.projectId,
        userRole: _permissions.role,
        costService: _costService,
        onSubmitted: () {
          _loadData();
          _tabController.animateTo(3);
        },
      ),
    );
  }

  Widget _buildReconciliationTab() {
    final reconcileList = _submissions
        .where((s) =>
            s.needsReconciliation ||
            s.status == OperationalCostStatus.paid && !s.isReconciled)
        .toList();

    if (reconcileList.isEmpty) {
      return _buildEmptyState(
        icon: Icons.sync,
        title: widget.isArabic ? 'لا توجد تسويات مطلوبة' : 'No Reconciliations Needed',
        subtitle: widget.isArabic
            ? 'ستظهر هنا السلف التي تحتاج تسوية'
            : 'Advances needing reconciliation will appear here',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: reconcileList.length,
        itemBuilder: (context, index) {
          return _buildSubmissionCard(reconcileList[index], showReconcileAction: true);
        },
      ),
    );
  }

  Widget _buildOutstandingTab() {
    final outstandingList = _submissions
        .where((s) =>
            s.status == OperationalCostStatus.approved ||
            (s.status == OperationalCostStatus.paid && !s.isReconciled))
        .toList();

    if (outstandingList.isEmpty) {
      return _buildEmptyState(
        icon: Icons.account_balance_wallet,
        title: widget.isArabic ? 'لا توجد مستحقات' : 'No Outstanding Advances',
        subtitle: widget.isArabic
            ? 'ستظهر هنا المبالغ المعتمدة المنتظرة'
            : 'Approved amounts awaiting payment will appear here',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: outstandingList.length,
        itemBuilder: (context, index) {
          return _buildSubmissionCard(outstandingList[index]);
        },
      ),
    );
  }

  Widget _buildHistoryTab() {
    return Column(
      children: [
        _buildStatusFilter(),
        Expanded(
          child: _filteredSubmissions.isEmpty
              ? _buildEmptyState(
                  icon: Icons.history,
                  title: widget.isArabic ? 'لا يوجد سجل' : 'No Submission History',
                  subtitle: widget.isArabic
                      ? 'ستظهر هنا جميع طلباتك السابقة'
                      : 'Your past submissions will appear here',
                )
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _filteredSubmissions.length,
                    itemBuilder: (context, index) {
                      return _buildSubmissionCard(
                        _filteredSubmissions[index],
                        showApprovalActions: true,
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildStatusFilter() {
    final isArabic = widget.isArabic;
    final filters = [
      {'key': 'all', 'en': 'All', 'ar': 'الكل'},
      {'key': 'pending', 'en': 'Pending', 'ar': 'قيد الانتظار'},
      {'key': 'under_review', 'en': 'Under Review', 'ar': 'قيد المراجعة'},
      {'key': 'approved', 'en': 'Approved', 'ar': 'موافق عليه'},
      {'key': 'rejected', 'en': 'Rejected', 'ar': 'مرفوض'},
      {'key': 'paid', 'en': 'Paid', 'ar': 'مدفوع'},
      {'key': 'reconciled', 'en': 'Reconciled', 'ar': 'تمت التسوية'},
      {'key': 'cancelled', 'en': 'Cancelled', 'ar': 'ملغى'},
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: filters.map((f) {
            final isSelected = _statusFilter == f['key'];
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(isArabic ? f['ar']! : f['en']!),
                selected: isSelected,
                onSelected: (selected) {
                  setState(() => _statusFilter = selected ? f['key']! : 'all');
                },
                selectedColor: Theme.of(context).primaryColor.withOpacity(0.2),
                checkmarkColor: Theme.of(context).primaryColor,
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildSubmissionCard(
    OperationalCostSubmission submission, {
    bool showApprovalActions = false,
    bool showReconcileAction = false,
  }) {
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy');
    final derivedStatus = _getDerivedStatus(submission);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => _showSubmissionDetails(submission),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isArabic
                              ? submission.expenseCategory.labelAr
                              : submission.expenseCategory.labelEn,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (submission.submitterName != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            submission.submitterName!,
                            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                          ),
                        ],
                      ],
                    ),
                  ),
                  _buildStatusBadge(derivedStatus),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).primaryColor,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                submission.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.grey[700]),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Icon(Icons.calendar_today, size: 14, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Text(
                    submission.expenseDate != null
                        ? dateFormat.format(DateTime.parse(submission.expenseDate!))
                        : isArabic ? 'بدون تاريخ' : 'No date',
                    style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  ),
                  if (submission.vendor != null) ...[
                    const SizedBox(width: 12),
                    Icon(Icons.store, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        submission.vendor!,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ),
                  ],
                  if (submission.projectName != null) ...[
                    const SizedBox(width: 12),
                    Icon(Icons.folder, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        submission.projectName!,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ),
                  ],
                ],
              ),
              if (submission.hasThreeTiers) ...[
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.deepPurple.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    isArabic ? 'موافقة ثلاثية المستويات' : '3-Tier Approval',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.deepPurple,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 10),
              const Divider(height: 1),
              const SizedBox(height: 10),
              _buildApprovalProgress(submission),
              if (showApprovalActions) ...[
                const SizedBox(height: 12),
                _buildApprovalActionButtons(submission),
              ],
              if (showReconcileAction &&
                  (submission.needsReconciliation ||
                      (submission.status == OperationalCostStatus.paid && !submission.isReconciled))) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _showReconciliationDialog(submission),
                    icon: const Icon(Icons.sync),
                    label: Text(isArabic ? 'تسوية' : 'Reconcile'),
                  ),
                ),
              ],
              if (submission.isEditable) ...[
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton.icon(
                      onPressed: () => _cancelSubmission(submission),
                      icon: const Icon(Icons.close, size: 16),
                      label: Text(isArabic ? 'إلغاء' : 'Cancel'),
                      style: TextButton.styleFrom(foregroundColor: Colors.red),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    final isArabic = widget.isArabic;
    Color color;
    String label;

    switch (status) {
      case 'pending':
        color = Colors.orange;
        label = isArabic ? 'قيد الانتظار' : 'Pending';
        break;
      case 'under_review':
        color = Colors.blue;
        label = isArabic ? 'قيد المراجعة' : 'Under Review';
        break;
      case 'approved':
        color = Colors.green;
        label = isArabic ? 'موافق عليه' : 'Approved';
        break;
      case 'rejected':
        color = Colors.red;
        label = isArabic ? 'مرفوض' : 'Rejected';
        break;
      case 'paid':
        color = Colors.purple;
        label = isArabic ? 'مدفوع' : 'Paid';
        break;
      case 'reconciled':
        color = Colors.teal;
        label = isArabic ? 'تمت التسوية' : 'Reconciled';
        break;
      case 'cancelled':
        color = Colors.grey;
        label = isArabic ? 'ملغى' : 'Cancelled';
        break;
      default:
        color = Colors.grey;
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildApprovalProgress(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;
    final threeTier = submission.hasThreeTiers;

    return Row(
      children: [
        Expanded(
          child: _buildTierStatusWidget(
            tier: 1,
            status: submission.tier1Status,
            label: isArabic ? 'المستوى 1' : 'Tier 1',
            reviewerName: submission.tier1ReviewerName,
            reviewedAt: submission.tier1ReviewedAt,
          ),
        ),
        _buildArrow(submission.tier1Status == 'approved'),
        Expanded(
          child: _buildTierStatusWidget(
            tier: 2,
            status: submission.tier2Status,
            label: isArabic ? 'المستوى 2' : 'Tier 2',
            reviewerName: submission.tier2ReviewerName,
            reviewedAt: submission.tier2ReviewedAt,
          ),
        ),
        if (threeTier) ...[
          _buildArrow(submission.tier2Status == 'approved'),
          Expanded(
            child: _buildTierStatusWidget(
              tier: 3,
              status: submission.tier3Status,
              label: isArabic ? 'المستوى 3' : 'Tier 3',
              reviewerName: submission.tier3ReviewerName,
              reviewedAt: submission.tier3ReviewedAt,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildArrow(bool active) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Icon(
        Icons.arrow_forward,
        size: 14,
        color: active ? Colors.green : Colors.grey[400],
      ),
    );
  }

  Widget _buildTierStatusWidget({
    required int tier,
    required String? status,
    required String label,
    String? reviewerName,
    DateTime? reviewedAt,
  }) {
    IconData icon;
    Color color;

    switch (status) {
      case 'approved':
        icon = Icons.check_circle;
        color = Colors.green;
        break;
      case 'rejected':
        icon = Icons.cancel;
        color = Colors.red;
        break;
      case 'changes_requested':
        icon = Icons.edit_note;
        color = Colors.orange;
        break;
      default:
        icon = Icons.hourglass_empty;
        color = Colors.grey;
    }

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 3),
            Flexible(
              child: Text(
                label,
                style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        if (reviewerName != null) ...[
          const SizedBox(height: 2),
          Text(
            reviewerName,
            style: TextStyle(fontSize: 9, color: Colors.grey[500]),
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }

  Widget _buildApprovalActionButtons(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;
    final actions = <Widget>[];

    if (_permissions.canApproveTier1(submission)) {
      actions.add(_buildApproveRejectRow(
        submission: submission,
        tier: 1,
        label: isArabic ? 'المستوى 1' : 'Tier 1',
      ));
    }

    if (_permissions.canApproveTier2(submission)) {
      actions.add(_buildApproveRejectRow(
        submission: submission,
        tier: 2,
        label: isArabic ? 'المستوى 2' : 'Tier 2',
      ));
    }

    if (_permissions.canApproveTier3(submission)) {
      actions.add(_buildApproveRejectRow(
        submission: submission,
        tier: 3,
        label: isArabic ? 'المستوى 3' : 'Tier 3',
      ));
    }

    if (_permissions.canPayOut &&
        submission.isFullyApproved &&
        submission.status != OperationalCostStatus.paid) {
      actions.add(
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: () => _markAsPaid(submission),
            icon: const Icon(Icons.payments, size: 18),
            label: Text(isArabic ? 'تسجيل الدفع' : 'Record Payment'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.purple,
              foregroundColor: Colors.white,
            ),
          ),
        ),
      );
    }

    if (actions.isEmpty) return const SizedBox.shrink();

    return Column(
      children: actions.map((a) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: a,
      )).toList(),
    );
  }

  Widget _buildApproveRejectRow({
    required OperationalCostSubmission submission,
    required int tier,
    required String label,
  }) {
    final isArabic = widget.isArabic;

    return Row(
      children: [
        Text(
          '$label:',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ElevatedButton.icon(
            onPressed: () => _showApprovalDialog(submission, tier, true),
            icon: const Icon(Icons.check, size: 16),
            label: Text(isArabic ? 'موافقة' : 'Approve', style: const TextStyle(fontSize: 12)),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 8),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _showApprovalDialog(submission, tier, false),
            icon: const Icon(Icons.close, size: 16),
            label: Text(isArabic ? 'رفض' : 'Reject', style: const TextStyle(fontSize: 12)),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
              padding: const EdgeInsets.symmetric(vertical: 8),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _showApprovalDialog(
    OperationalCostSubmission submission,
    int tier,
    bool isApproval,
  ) async {
    final isArabic = widget.isArabic;
    final notesController = TextEditingController();
    bool useSignature = false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            isApproval
                ? (isArabic ? 'تأكيد الموافقة - المستوى $tier' : 'Confirm Approval - Tier $tier')
                : (isArabic ? 'تأكيد الرفض - المستوى $tier' : 'Confirm Rejection - Tier $tier'),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isArabic
                      ? '${submission.expenseCategory.labelAr} - ${submission.amount.toStringAsFixed(2)} ${submission.currency}'
                      : '${submission.expenseCategory.labelEn} - ${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: notesController,
                  decoration: InputDecoration(
                    labelText: isArabic ? 'ملاحظات' : 'Notes',
                    hintText: isArabic ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...',
                    border: const OutlineInputBorder(),
                  ),
                  maxLines: 3,
                ),
                if (isApproval && (_permissions.isAdmin || _permissions.isSuperAdmin)) ...[
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    value: useSignature,
                    onChanged: (v) => setDialogState(() => useSignature = v ?? false),
                    title: Text(
                      isArabic ? 'إضافة توقيع رقمي' : 'Add Digital Signature',
                      style: const TextStyle(fontSize: 14),
                    ),
                    subtitle: Text(
                      isArabic ? 'تأمين الموافقة بتوقيع OTP' : 'Secure approval with OTP signature',
                      style: const TextStyle(fontSize: 11),
                    ),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(isArabic ? 'إلغاء' : 'Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(
                backgroundColor: isApproval ? Colors.green : Colors.red,
                foregroundColor: Colors.white,
              ),
              child: Text(isApproval
                  ? (isArabic ? 'موافقة' : 'Approve')
                  : (isArabic ? 'رفض' : 'Reject')),
            ),
          ],
        ),
      ),
    );

    if (confirmed != true) return;

    final notes = notesController.text.trim();
    String? sigSuffix;

    if (useSignature && isApproval) {
      final sigConfirmed = await _showSignatureConfirmation();
      if (sigConfirmed == null) return;
      sigSuffix = sigConfirmed;
    }

    final fullNotes = sigSuffix != null ? '$notes\n$sigSuffix' : notes;

    bool success = false;
    switch (tier) {
      case 1:
        success = await _costService.tier1Review(
          submissionId: submission.id,
          approved: isApproval,
          notes: fullNotes.isNotEmpty ? fullNotes : null,
        );
        break;
      case 2:
        success = await _costService.tier2Review(
          submissionId: submission.id,
          approved: isApproval,
          notes: fullNotes.isNotEmpty ? fullNotes : null,
        );
        break;
      case 3:
        success = await _costService.tier3Review(
          submissionId: submission.id,
          approved: isApproval,
          notes: fullNotes.isNotEmpty ? fullNotes : null,
        );
        break;
    }

    if (success) {
      await _costService.notifyApprovalAction(
        submission: submission,
        action: isApproval ? 'approved' : 'rejected',
        tier: tier,
      );
      _showSuccess(isArabic
          ? (isApproval ? 'تمت الموافقة بنجاح' : 'تم الرفض بنجاح')
          : (isApproval ? 'Approved successfully' : 'Rejected successfully'));
      _loadData();
    } else {
      _showError(isArabic ? 'فشل في تنفيذ الإجراء' : 'Failed to process action');
    }
  }

  Future<String?> _showSignatureConfirmation() async {
    final isArabic = widget.isArabic;
    final otpController = TextEditingController();

    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isArabic ? 'تأكيد التوقيع الرقمي' : 'Digital Signature Confirmation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.security, size: 48, color: Theme.of(context).primaryColor),
            const SizedBox(height: 16),
            Text(
              isArabic
                  ? 'أدخل رمز OTP لتأكيد التوقيع'
                  : 'Enter OTP code to confirm signature',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: otpController,
              decoration: InputDecoration(
                labelText: isArabic ? 'رمز OTP' : 'OTP Code',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.lock),
              ),
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, letterSpacing: 8),
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, null),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (otpController.text.length >= 4) {
                final hash = otpController.text.hashCode.toRadixString(16).toUpperCase();
                final sigString = '[Signed: OTP | Hash: $hash | ${DateTime.now().toIso8601String()}]';
                Navigator.pop(context, sigString);
              }
            },
            child: Text(isArabic ? 'تأكيد' : 'Confirm'),
          ),
        ],
      ),
    );

    return result;
  }

  Future<void> _markAsPaid(OperationalCostSubmission submission) async {
    final isArabic = widget.isArabic;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isArabic ? 'تأكيد الدفع' : 'Confirm Payment'),
        content: Text(
          isArabic
              ? 'هل تريد تسجيل دفع ${submission.amount.toStringAsFixed(2)} ${submission.currency}؟'
              : 'Record payment of ${submission.amount.toStringAsFixed(2)} ${submission.currency}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.purple, foregroundColor: Colors.white),
            child: Text(isArabic ? 'تأكيد' : 'Confirm'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final success = await _costService.markAsPaid(submission.id);
    if (success) {
      await _costService.notifyPaymentRecorded(submission: submission);
      _showSuccess(isArabic ? 'تم تسجيل الدفع' : 'Payment recorded');
      _loadData();
    } else {
      _showError(isArabic ? 'فشل في تسجيل الدفع' : 'Failed to record payment');
    }
  }

  Future<void> _cancelSubmission(OperationalCostSubmission submission) async {
    final isArabic = widget.isArabic;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isArabic ? 'تأكيد الإلغاء' : 'Confirm Cancellation'),
        content: Text(
          isArabic
              ? 'هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع.'
              : 'Are you sure you want to cancel this submission? This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(isArabic ? 'لا' : 'No'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            child: Text(isArabic ? 'إلغاء الطلب' : 'Cancel Submission'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final success = await _costService.cancelSubmission(submission.id);
    if (success) {
      _showSuccess(isArabic ? 'تم إلغاء الطلب' : 'Submission cancelled');
      _loadData();
    } else {
      _showError(isArabic ? 'فشل في إلغاء الطلب' : 'Failed to cancel submission');
    }
  }

  void _showSubmissionDetails(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy HH:mm');
    final derivedStatus = _getDerivedStatus(submission);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
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
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    isArabic ? 'تفاصيل الطلب' : 'Submission Details',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  _buildStatusBadge(derivedStatus),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'PACT-OC-${submission.id.substring(0, 8).toUpperCase()}',
                style: TextStyle(fontSize: 12, color: Colors.grey[500], fontFamily: 'monospace'),
              ),
              const SizedBox(height: 20),

              _detailRow(
                icon: Icons.category,
                label: isArabic ? 'الفئة' : 'Category',
                value: isArabic ? submission.expenseCategory.labelAr : submission.expenseCategory.labelEn,
              ),
              _detailRow(
                icon: Icons.attach_money,
                label: isArabic ? 'المبلغ' : 'Amount',
                value: '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                valueStyle: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).primaryColor,
                  fontSize: 16,
                ),
              ),
              _detailRow(
                icon: Icons.description,
                label: isArabic ? 'الوصف' : 'Description',
                value: submission.description,
              ),
              if (submission.justification != null)
                _detailRow(
                  icon: Icons.note,
                  label: isArabic ? 'التبرير' : 'Justification',
                  value: submission.justification!,
                ),
              if (submission.vendor != null)
                _detailRow(
                  icon: Icons.store,
                  label: isArabic ? 'المورد' : 'Vendor',
                  value: submission.vendor!,
                ),
              if (submission.referenceNumber != null)
                _detailRow(
                  icon: Icons.tag,
                  label: isArabic ? 'رقم المرجع' : 'Reference',
                  value: submission.referenceNumber!,
                ),
              if (submission.projectName != null)
                _detailRow(
                  icon: Icons.folder,
                  label: isArabic ? 'المشروع' : 'Project',
                  value: submission.projectName!,
                ),
              if (submission.hubName != null)
                _detailRow(
                  icon: Icons.location_city,
                  label: isArabic ? 'المحور' : 'Hub',
                  value: submission.hubName!,
                ),
              _detailRow(
                icon: Icons.person,
                label: isArabic ? 'مقدم الطلب' : 'Submitted By',
                value: submission.submitterName ?? submission.userId,
              ),
              _detailRow(
                icon: Icons.access_time,
                label: isArabic ? 'تاريخ التقديم' : 'Submitted At',
                value: dateFormat.format(submission.createdAt),
              ),

              const SizedBox(height: 20),
              Text(
                isArabic ? 'مسار الموافقة' : 'Approval Timeline',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              _buildApprovalTimeline(submission),

              if (submission.hasSignature) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.verified, color: Colors.green),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          isArabic ? 'تم التوقيع رقمياً' : 'Digitally Signed',
                          style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              if (submission.supportingDocuments.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  isArabic ? 'المستندات الداعمة' : 'Supporting Documents',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                ...submission.supportingDocuments.map((doc) => ListTile(
                  leading: const Icon(Icons.insert_drive_file),
                  title: Text(doc.name),
                  subtitle: Text(doc.type),
                  contentPadding: EdgeInsets.zero,
                )),
              ],

              const SizedBox(height: 24),
              _buildApprovalActionButtons(submission),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildApprovalTimeline(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy HH:mm');
    final steps = <Widget>[];

    steps.add(_timelineStep(
      title: isArabic ? 'تم التقديم' : 'Submitted',
      subtitle: submission.submitterName ?? '',
      date: dateFormat.format(submission.createdAt),
      isCompleted: true,
      isFirst: true,
      color: Colors.blue,
    ));

    steps.add(_timelineStep(
      title: isArabic ? 'مراجعة المستوى 1' : 'Tier 1 Review',
      subtitle: submission.tier1ReviewerName ?? (isArabic ? 'في الانتظار' : 'Pending'),
      date: submission.tier1ReviewedAt != null
          ? dateFormat.format(submission.tier1ReviewedAt!)
          : null,
      notes: submission.tier1Notes,
      isCompleted: submission.tier1Status == 'approved',
      isRejected: submission.tier1Status == 'rejected',
      color: Colors.orange,
    ));

    steps.add(_timelineStep(
      title: isArabic ? 'مراجعة المستوى 2' : 'Tier 2 Review',
      subtitle: submission.tier2ReviewerName ?? (isArabic ? 'في الانتظار' : 'Pending'),
      date: submission.tier2ReviewedAt != null
          ? dateFormat.format(submission.tier2ReviewedAt!)
          : null,
      notes: submission.tier2Notes,
      isCompleted: submission.tier2Status == 'approved',
      isRejected: submission.tier2Status == 'rejected',
      color: Colors.deepOrange,
    ));

    if (submission.hasThreeTiers) {
      steps.add(_timelineStep(
        title: isArabic ? 'مراجعة المستوى 3' : 'Tier 3 Review',
        subtitle: submission.tier3ReviewerName ?? (isArabic ? 'في الانتظار' : 'Pending'),
        date: submission.tier3ReviewedAt != null
            ? dateFormat.format(submission.tier3ReviewedAt!)
            : null,
        notes: submission.tier3Notes,
        isCompleted: submission.tier3Status == 'approved',
        isRejected: submission.tier3Status == 'rejected',
        isLast: submission.status != OperationalCostStatus.paid,
        color: Colors.purple,
      ));
    }

    if (submission.status == OperationalCostStatus.paid) {
      steps.add(_timelineStep(
        title: isArabic ? 'تم الدفع' : 'Payment Recorded',
        subtitle: '',
        isCompleted: true,
        isLast: true,
        color: Colors.green,
      ));
    }

    return Column(children: steps);
  }

  Widget _timelineStep({
    required String title,
    required String subtitle,
    String? date,
    String? notes,
    bool isCompleted = false,
    bool isRejected = false,
    bool isFirst = false,
    bool isLast = false,
    required Color color,
  }) {
    final stepColor = isRejected ? Colors.red : (isCompleted ? Colors.green : Colors.grey[400]!);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            if (!isFirst)
              Container(
                width: 2,
                height: 8,
                color: stepColor,
              ),
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: stepColor.withOpacity(0.2),
                border: Border.all(color: stepColor, width: 2),
              ),
              child: Icon(
                isRejected
                    ? Icons.close
                    : (isCompleted ? Icons.check : Icons.hourglass_empty),
                size: 14,
                color: stepColor,
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 24,
                color: isCompleted ? Colors.green : Colors.grey[300],
              ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: isCompleted || isRejected ? null : Colors.grey[500],
                  ),
                ),
                if (subtitle.isNotEmpty)
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  ),
                if (date != null)
                  Text(
                    date,
                    style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                  ),
                if (notes != null && notes.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.grey.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.grey.withOpacity(0.2)),
                    ),
                    child: Text(
                      notes.replaceAll(RegExp(r'\[Signed:.*?\]'), '').trim(),
                      style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _detailRow({
    required IconData icon,
    required String label,
    required String value,
    TextStyle? valueStyle,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Colors.grey[500]),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                const SizedBox(height: 2),
                Text(value, style: valueStyle ?? const TextStyle(fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showReconciliationDialog(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;
    final amountController = TextEditingController();
    final notesController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isArabic ? 'تسوية السلفة' : 'Reconcile Advance'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${isArabic ? "المبلغ الأصلي" : "Original Amount"}: ${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: amountController,
                decoration: InputDecoration(
                  labelText: isArabic ? 'المبلغ الفعلي المنفق' : 'Actual Amount Spent',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.attach_money),
                ),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: notesController,
                decoration: InputDecoration(
                  labelText: isArabic ? 'ملاحظات التسوية' : 'Reconciliation Notes',
                  border: const OutlineInputBorder(),
                ),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final actualAmount = double.tryParse(amountController.text);
              if (actualAmount == null || actualAmount <= 0) {
                _showError(isArabic ? 'أدخل مبلغاً صالحاً' : 'Enter a valid amount');
                return;
              }
              Navigator.pop(context);
              final success = await _costService.reconcileAdvance(
                submissionId: submission.id,
                actualAmount: actualAmount,
                notes: notesController.text.isNotEmpty ? notesController.text : null,
              );
              if (success) {
                _showSuccess(isArabic ? 'تمت التسوية بنجاح' : 'Reconciliation successful');
                _loadData();
              } else {
                _showError(isArabic ? 'فشل في التسوية' : 'Reconciliation failed');
              }
            },
            child: Text(isArabic ? 'تسوية' : 'Reconcile'),
          ),
        ],
      ),
    );
  }

  void _exportCsv() {
    final csv = _costService.exportToCsv(_submissions, isArabic: widget.isArabic);
    Clipboard.setData(ClipboardData(text: csv));
    _showSuccess(widget.isArabic ? 'تم نسخ CSV إلى الحافظة' : 'CSV copied to clipboard');
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
            Icon(icon, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
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
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;
  final IconData icon;

  const _StatCard({
    required this.title,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 90,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            style: TextStyle(fontSize: 10, color: color.withOpacity(0.8)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _OperationalCostForm extends StatefulWidget {
  final bool isArabic;
  final String? hubId;
  final String? projectId;
  final String userRole;
  final OperationalCostService costService;
  final VoidCallback onSubmitted;

  const _OperationalCostForm({
    required this.isArabic,
    this.hubId,
    this.projectId,
    required this.userRole,
    required this.costService,
    required this.onSubmitted,
  });

  @override
  State<_OperationalCostForm> createState() => _OperationalCostFormState();
}

class _OperationalCostFormState extends State<_OperationalCostForm> {
  final _formKey = GlobalKey<FormState>();
  ExpenseCategory? _selectedCategory;
  FundingType _fundingType = FundingType.advance;
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _justificationController = TextEditingController();
  final _vendorController = TextEditingController();
  final _referenceController = TextEditingController();
  DateTime _expenseDate = DateTime.now();
  String _currency = 'SDG';
  String? _selectedProjectId;
  bool _isSubmitting = false;
  List<Map<String, dynamic>> _projects = [];

  @override
  void initState() {
    super.initState();
    _selectedProjectId = widget.projectId;
    _loadProjects();
  }

  Future<void> _loadProjects() async {
    final projects = await widget.costService.getAvailableProjects();
    if (mounted) {
      setState(() => _projects = projects);
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _descriptionController.dispose();
    _justificationController.dispose();
    _vendorController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.08),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.blue.withOpacity(0.2)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, color: Colors.blue, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isArabic
                        ? 'أرسل طلبات التكاليف التشغيلية. يتطلب موافقة متعددة المستويات.'
                        : 'Submit operational cost requests. Multi-tier approval required.',
                    style: TextStyle(fontSize: 13, color: Colors.blue[800]),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          Text(
            isArabic ? 'نوع الطلب *' : 'Request Type *',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 8),
          Row(
            children: FundingType.values.map((type) {
              final selected = _fundingType == type;
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: type == FundingType.advance ? 8 : 0),
                  child: ChoiceChip(
                    label: Text(
                      isArabic ? type.labelAr : type.labelEn,
                      style: TextStyle(fontSize: 12, color: selected ? Colors.white : null),
                    ),
                    selected: selected,
                    onSelected: (_) => setState(() => _fundingType = type),
                    selectedColor: Theme.of(context).primaryColor,
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          Text(
            isArabic ? 'فئة المصروف *' : 'Expense Category *',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<ExpenseCategory>(
            value: _selectedCategory,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              hintText: isArabic ? 'اختر الفئة' : 'Select category',
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            items: ExpenseCategory.values.map((cat) {
              return DropdownMenuItem(
                value: cat,
                child: Text(isArabic ? cat.labelAr : cat.labelEn, style: const TextStyle(fontSize: 14)),
              );
            }).toList(),
            onChanged: (val) => setState(() => _selectedCategory = val),
            validator: (val) => val == null ? (isArabic ? 'مطلوب' : 'Required') : null,
          ),
          const SizedBox(height: 16),

          if (_projects.isNotEmpty) ...[
            Text(
              isArabic ? 'المشروع' : 'Project',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedProjectId,
              decoration: InputDecoration(
                border: const OutlineInputBorder(),
                hintText: isArabic ? 'اختر المشروع (اختياري)' : 'Select project (optional)',
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              ),
              items: _projects.map((p) {
                return DropdownMenuItem(
                  value: p['id'] as String,
                  child: Text(p['name'] as String, style: const TextStyle(fontSize: 14)),
                );
              }).toList(),
              onChanged: (val) => setState(() => _selectedProjectId = val),
            ),
            const SizedBox(height: 16),
          ],

          TextFormField(
            controller: _amountController,
            decoration: InputDecoration(
              labelText: isArabic ? 'المبلغ *' : 'Amount *',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.attach_money),
              suffixText: _currency,
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            validator: (val) {
              if (val == null || val.isEmpty) return isArabic ? 'مطلوب' : 'Required';
              final amount = double.tryParse(val);
              if (amount == null || amount <= 0) return isArabic ? 'أدخل مبلغاً صالحاً' : 'Enter a valid amount';
              return null;
            },
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _descriptionController,
            decoration: InputDecoration(
              labelText: isArabic ? 'الوصف *' : 'Description *',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.description),
            ),
            maxLines: 3,
            validator: (val) => (val == null || val.isEmpty) ? (isArabic ? 'مطلوب' : 'Required') : null,
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _justificationController,
            decoration: InputDecoration(
              labelText: isArabic ? 'التبرير' : 'Justification',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.note),
              hintText: isArabic ? 'لماذا هذا المصروف ضروري؟' : 'Why is this expense necessary?',
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 16),

          InkWell(
            onTap: _selectDate,
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: isArabic ? 'تاريخ المصروف' : 'Expense Date',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.calendar_today),
              ),
              child: Text(DateFormat('yyyy-MM-dd').format(_expenseDate)),
            ),
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _vendorController,
            decoration: InputDecoration(
              labelText: isArabic ? 'المورد' : 'Vendor / Supplier',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.store),
            ),
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _referenceController,
            decoration: InputDecoration(
              labelText: isArabic ? 'رقم المرجع' : 'Reference Number',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.tag),
              hintText: isArabic ? 'رقم الفاتورة أو الإيصال' : 'Invoice or receipt number',
            ),
          ),
          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _handleSubmit,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send),
              label: Text(
                _isSubmitting
                    ? (isArabic ? 'جاري الإرسال...' : 'Submitting...')
                    : (isArabic ? 'إرسال الطلب' : 'Submit Request'),
                style: const TextStyle(fontSize: 16),
              ),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _expenseDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _expenseDate = picked);
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCategory == null) return;

    setState(() => _isSubmitting = true);

    try {
      final amount = double.parse(_amountController.text);

      await widget.costService.submitCost(
        expenseCategory: _selectedCategory!,
        fundingType: _fundingType,
        amount: amount,
        currency: _currency,
        description: _descriptionController.text,
        justification: _justificationController.text.isNotEmpty ? _justificationController.text : null,
        expenseDate: DateFormat('yyyy-MM-dd').format(_expenseDate),
        vendor: _vendorController.text.isNotEmpty ? _vendorController.text : null,
        referenceNumber: _referenceController.text.isNotEmpty ? _referenceController.text : null,
        projectId: _selectedProjectId,
        hubId: widget.hubId,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'تم تقديم الطلب بنجاح' : 'Request submitted successfully'),
            backgroundColor: Colors.green,
          ),
        );

        _formKey.currentState!.reset();
        _amountController.clear();
        _descriptionController.clear();
        _justificationController.clear();
        _vendorController.clear();
        _referenceController.clear();
        setState(() {
          _selectedCategory = null;
          _fundingType = FundingType.advance;
          _expenseDate = DateTime.now();
        });

        widget.onSubmitted();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(widget.isArabic ? 'فشل في تقديم الطلب' : 'Failed to submit request'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
