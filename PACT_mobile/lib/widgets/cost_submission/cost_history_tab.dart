/// Cost History Tab Widget
/// Displays submission history with filtering and approval actions
library;

import 'package:flutter/material.dart';
import '../../models/operational_cost_submission.dart';
import '../../services/operational_cost_service.dart';
import 'package:intl/intl.dart';

class CostHistoryTab extends StatefulWidget {
  final bool isArabic;
  final List<OperationalCostSubmission> submissions;
  final CostSubmissionPermissions permissions;
  final VoidCallback? onActionComplete;

  const CostHistoryTab({
    super.key,
    this.isArabic = false,
    required this.submissions,
    required this.permissions,
    this.onActionComplete,
  });

  @override
  State<CostHistoryTab> createState() => _CostHistoryTabState();
}

class _CostHistoryTabState extends State<CostHistoryTab> {
  final _service = OperationalCostService();
  String _statusFilter = 'all';
  String _searchQuery = '';
  bool _isProcessing = false;

  List<OperationalCostSubmission> get _filteredSubmissions {
    var filtered = widget.submissions;

    if (_statusFilter != 'all') {
      filtered = filtered
          .where((s) => s.status.value == _statusFilter)
          .toList();
    }

    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      filtered = filtered
          .where(
            (s) =>
                s.description.toLowerCase().contains(query) ||
                (s.submitterName?.toLowerCase().contains(query) ?? false) ||
                (s.projectName?.toLowerCase().contains(query) ?? false) ||
                s.expenseCategory.value.toLowerCase().contains(query),
          )
          .toList();
    }

    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Filters
        _buildFilters(),
        // List
        Expanded(
          child: _filteredSubmissions.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _filteredSubmissions.length,
                  itemBuilder: (context, index) {
                    final submission = _filteredSubmissions[index];
                    return _SubmissionCard(
                      submission: submission,
                      isArabic: widget.isArabic,
                      permissions: widget.permissions,
                      onApprove: () => _handleTier1Review(submission, true),
                      onReject: () => _handleTier1Review(submission, false),
                      onTier2Approve: () =>
                          _handleTier2Review(submission, true),
                      onTier2Reject: () =>
                          _handleTier2Review(submission, false),
                      onTier3Approve: () =>
                          _handleTier3Review(submission, true),
                      onTier3Reject: () =>
                          _handleTier3Review(submission, false),
                      onMarkPaid: () => _handleMarkPaid(submission),
                      onCancel: () => _handleCancel(submission),
                      onDownloadCertificate: () =>
                          _handleDownloadCertificate(submission),
                      onExportCsv: () => _handleExportCsv(submission),
                      isProcessing: _isProcessing,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              onChanged: (value) => setState(() => _searchQuery = value),
              decoration: InputDecoration(
                hintText: widget.isArabic ? 'بحث...' : 'Search...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 12),
          PopupMenuButton<String>(
            value: _statusFilter,
            onSelected: (value) => setState(() => _statusFilter = value),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                border: Border.all(color: Theme.of(context).dividerColor),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.filter_list, size: 20),
                  const SizedBox(width: 4),
                  Text(_getStatusLabel(_statusFilter)),
                ],
              ),
            ),
            itemBuilder: (context) => [
              _buildFilterItem('all', widget.isArabic ? 'الكل' : 'All'),
              _buildFilterItem(
                'pending',
                widget.isArabic ? 'قيد الانتظار' : 'Pending',
              ),
              _buildFilterItem(
                'under_review',
                widget.isArabic ? 'قيد المراجعة' : 'Under Review',
              ),
              _buildFilterItem(
                'approved',
                widget.isArabic ? 'موافق عليها' : 'Approved',
              ),
              _buildFilterItem(
                'rejected',
                widget.isArabic ? 'مرفوضة' : 'Rejected',
              ),
              _buildFilterItem('paid', widget.isArabic ? 'مدفوعة' : 'Paid'),
            ],
          ),
        ],
      ),
    );
  }

  PopupMenuItem<String> _buildFilterItem(String value, String label) {
    return PopupMenuItem<String>(
      value: value,
      child: Row(
        children: [
          if (_statusFilter == value)
            const Icon(Icons.check, size: 18, color: Colors.blue)
          else
            const SizedBox(width: 18),
          const SizedBox(width: 8),
          Text(label),
        ],
      ),
    );
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'all':
        return widget.isArabic ? 'الكل' : 'All';
      case 'pending':
        return widget.isArabic ? 'قيد الانتظار' : 'Pending';
      case 'under_review':
        return widget.isArabic ? 'قيد المراجعة' : 'Under Review';
      case 'approved':
        return widget.isArabic ? 'موافق عليها' : 'Approved';
      case 'rejected':
        return widget.isArabic ? 'مرفوضة' : 'Rejected';
      case 'paid':
        return widget.isArabic ? 'مدفوعة' : 'Paid';
      default:
        return status;
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inbox_outlined, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            widget.isArabic ? 'لا توجد طلبات' : 'No submissions found',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  Future<void> _handleTier1Review(
    OperationalCostSubmission submission,
    bool approved,
  ) async {
    final notes = await _showNotesDialog(approved);
    if (notes == null && !approved) return;

    setState(() => _isProcessing = true);
    try {
      final success = await _service.tier1Review(
        submissionId: submission.id,
        approved: approved,
        notes: notes,
      );
      if (success && mounted) {
        _service.notifyApprovalAction(
          submission: submission,
          action: approved ? 'approved' : 'rejected',
          tier: 1,
        );
        _showMessage(
          approved
              ? (widget.isArabic ? 'تمت الموافقة' : 'Approved')
              : (widget.isArabic ? 'تم الرفض' : 'Rejected'),
        );
        widget.onActionComplete?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _handleTier2Review(
    OperationalCostSubmission submission,
    bool approved,
  ) async {
    final notes = await _showNotesDialog(approved);
    if (notes == null && !approved) return;

    setState(() => _isProcessing = true);
    try {
      final success = await _service.tier2Review(
        submissionId: submission.id,
        approved: approved,
        notes: notes,
      );
      if (success && mounted) {
        _service.notifyApprovalAction(
          submission: submission,
          action: approved ? 'approved' : 'rejected',
          tier: 2,
        );
        _showMessage(
          approved
              ? (widget.isArabic
                    ? 'تمت الموافقة النهائية'
                    : 'Final approval granted')
              : (widget.isArabic ? 'تم الرفض' : 'Rejected'),
        );
        widget.onActionComplete?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _handleTier3Review(
    OperationalCostSubmission submission,
    bool approved,
  ) async {
    final notes = await _showSignatureNotesDialog(approved, submission.id);
    if (notes == null && !approved) return;

    setState(() => _isProcessing = true);
    try {
      final success = await _service.tier3Review(
        submissionId: submission.id,
        approved: approved,
        notes: notes,
      );
      if (success && mounted) {
        _service.notifyApprovalAction(
          submission: submission,
          action: approved ? 'approved' : 'rejected',
          tier: 3,
        );
        _showMessage(
          approved
              ? (widget.isArabic
                    ? 'تمت الموافقة النهائية T3'
                    : 'T3 Final approval granted')
              : (widget.isArabic ? 'تم الرفض' : 'Rejected'),
        );
        widget.onActionComplete?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<String?> _showSignatureNotesDialog(
    bool isApproval,
    String submissionId,
  ) async {
    final controller = TextEditingController();
    bool includeSignature = false;
    return showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(
            isApproval
                ? (widget.isArabic
                      ? 'موافقة مع التوقيع'
                      : 'Approval with Signature')
                : (widget.isArabic ? 'سبب الرفض' : 'Rejection Reason'),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: controller,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: isApproval
                      ? (widget.isArabic
                            ? 'أضف ملاحظات (اختياري)'
                            : 'Add notes (optional)')
                      : (widget.isArabic
                            ? 'يرجى توضيح سبب الرفض'
                            : 'Please explain rejection reason'),
                  border: const OutlineInputBorder(),
                ),
              ),
              if (isApproval) ...[
                const SizedBox(height: 12),
                CheckboxListTile(
                  value: includeSignature,
                  onChanged: (v) =>
                      setDialogState(() => includeSignature = v ?? false),
                  title: Text(
                    widget.isArabic
                        ? 'إضافة توقيع رقمي'
                        : 'Include digital signature',
                    style: const TextStyle(fontSize: 14),
                  ),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                String finalNotes = controller.text;
                if (includeSignature && isApproval) {
                  final sigId = DateTime.now().millisecondsSinceEpoch
                      .toRadixString(36);
                  final hash = submissionId.substring(0, 8);
                  finalNotes +=
                      '\n[Signed: OTP | Hash: $hash... | ID: $sigId | ${DateTime.now().toIso8601String()}]';
                }
                Navigator.pop(ctx, finalNotes);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: isApproval ? Colors.green : Colors.red,
                foregroundColor: Colors.white,
              ),
              child: Text(
                isApproval
                    ? (widget.isArabic ? 'موافقة' : 'Approve')
                    : (widget.isArabic ? 'رفض' : 'Reject'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _handleDownloadCertificate(OperationalCostSubmission submission) {
    final refNumber = 'PACT-OC-${submission.id.substring(0, 8).toUpperCase()}';
    final dateStr =
        '${submission.createdAt.year}-${submission.createdAt.month.toString().padLeft(2, '0')}-${submission.createdAt.day.toString().padLeft(2, '0')}';

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.verified,
                    color: Colors.green,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.isArabic
                            ? 'شهادة الموافقة'
                            : 'Approval Certificate',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        refNumber,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            _buildCertificateDetail(
              widget.isArabic ? 'الفئة' : 'Category',
              submission.expenseCategory.getLabel(widget.isArabic),
            ),
            _buildCertificateDetail(
              widget.isArabic ? 'المبلغ' : 'Amount',
              '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
            ),
            _buildCertificateDetail(
              widget.isArabic ? 'التاريخ' : 'Date',
              dateStr,
            ),
            _buildCertificateDetail(
              widget.isArabic ? 'الحالة' : 'Status',
              submission.status.getLabel(widget.isArabic),
            ),
            if (submission.tier1Status != null)
              _buildCertificateDetail(
                widget.isArabic ? 'المستوى 1' : 'Tier 1',
                '${submission.tier1Status?.toUpperCase()} ${submission.tier1ReviewerName ?? ""}',
              ),
            if (submission.tier2Status != null)
              _buildCertificateDetail(
                widget.isArabic ? 'المستوى 2' : 'Tier 2',
                '${submission.tier2Status?.toUpperCase()} ${submission.tier2ReviewerName ?? ""}',
              ),
            if (submission.tier3Status != null)
              _buildCertificateDetail(
                widget.isArabic ? 'المستوى 3' : 'Tier 3',
                '${submission.tier3Status?.toUpperCase()} ${submission.tier3ReviewerName ?? ""}',
              ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, size: 16, color: Colors.blue),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.isArabic
                          ? 'لتحميل شهادة PDF كاملة، استخدم نسخة الويب'
                          : 'For full PDF certificate download, use the web version',
                      style: const TextStyle(fontSize: 12, color: Colors.blue),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                Navigator.pop(context);
                _handleExportCsv(submission);
              },
              icon: const Icon(Icons.download),
              label: Text(
                widget.isArabic ? 'تصدير البيانات CSV' : 'Export Data CSV',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCertificateDetail(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  void _handleExportCsv(OperationalCostSubmission submission) {
    final csvContent = StringBuffer();
    csvContent.writeln('Field,Value');
    csvContent.writeln(
      'Reference,PACT-OC-${submission.id.substring(0, 8).toUpperCase()}',
    );
    csvContent.writeln('Category,${submission.expenseCategory.labelEn}');
    csvContent.writeln('Amount,${submission.amount.toStringAsFixed(2)}');
    csvContent.writeln('Currency,${submission.currency}');
    csvContent.writeln('Funding Type,${submission.fundingType.labelEn}');
    csvContent.writeln('Status,${submission.status.labelEn}');
    csvContent.writeln(
      'Description,"${submission.description.replaceAll('"', '""')}"',
    );
    csvContent.writeln('Submitter,${submission.submitterName ?? "N/A"}');
    csvContent.writeln('Project,${submission.projectName ?? "N/A"}');
    csvContent.writeln('Hub,${submission.hubName ?? "N/A"}');
    csvContent.writeln('Expense Date,${submission.expenseDate ?? "N/A"}');
    csvContent.writeln('Created,${submission.createdAt.toIso8601String()}');
    csvContent.writeln('Tier 1 Status,${submission.tier1Status ?? "N/A"}');
    csvContent.writeln('Tier 2 Status,${submission.tier2Status ?? "N/A"}');
    if (submission.hasThreeTiers) {
      csvContent.writeln('Tier 3 Status,${submission.tier3Status ?? "N/A"}');
    }
    csvContent.writeln('Reconciled,${submission.isReconciled}');
    if (submission.reconciledAmount != null) {
      csvContent.writeln(
        'Reconciled Amount,${submission.reconciledAmount!.toStringAsFixed(2)}',
      );
    }

    _showMessage(
      widget.isArabic ? 'تم تجهيز بيانات التصدير' : 'Export data prepared',
    );
  }

  Future<void> _handleMarkPaid(OperationalCostSubmission submission) async {
    final confirm = await _showConfirmDialog(
      widget.isArabic ? 'تأكيد الدفع' : 'Confirm Payment',
      widget.isArabic
          ? 'هل أنت متأكد من تسجيل الدفع؟'
          : 'Are you sure you want to mark this as paid?',
    );
    if (confirm != true) return;

    setState(() => _isProcessing = true);
    try {
      final success = await _service.markAsPaid(submission.id);
      if (success && mounted) {
        _service.notifyPaymentRecorded(submission: submission);
        _showMessage(widget.isArabic ? 'تم تسجيل الدفع' : 'Marked as paid');
        widget.onActionComplete?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _handleCancel(OperationalCostSubmission submission) async {
    final confirm = await _showConfirmDialog(
      widget.isArabic ? 'تأكيد الإلغاء' : 'Confirm Cancellation',
      widget.isArabic
          ? 'هل أنت متأكد من إلغاء هذا الطلب؟'
          : 'Are you sure you want to cancel this submission?',
    );
    if (confirm != true) return;

    setState(() => _isProcessing = true);
    try {
      final success = await _service.cancelSubmission(submission.id);
      if (success && mounted) {
        _showMessage(widget.isArabic ? 'تم الإلغاء' : 'Cancelled');
        widget.onActionComplete?.call();
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<String?> _showNotesDialog(bool isApproval) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          isApproval
              ? (widget.isArabic ? 'ملاحظات الموافقة' : 'Approval Notes')
              : (widget.isArabic ? 'سبب الرفض' : 'Rejection Reason'),
        ),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: isApproval
                ? (widget.isArabic
                      ? 'أضف ملاحظات (اختياري)'
                      : 'Add notes (optional)')
                : (widget.isArabic
                      ? 'يرجى توضيح سبب الرفض'
                      : 'Please explain rejection reason'),
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, controller.text),
            style: ElevatedButton.styleFrom(
              backgroundColor: isApproval ? Colors.green : Colors.red,
              foregroundColor: Colors.white,
            ),
            child: Text(
              isApproval
                  ? (widget.isArabic ? 'موافقة' : 'Approve')
                  : (widget.isArabic ? 'رفض' : 'Reject'),
            ),
          ),
        ],
      ),
    );
  }

  Future<bool?> _showConfirmDialog(String title, String message) {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(widget.isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(widget.isArabic ? 'تأكيد' : 'Confirm'),
          ),
        ],
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }
}

class _SubmissionCard extends StatelessWidget {
  final OperationalCostSubmission submission;
  final bool isArabic;
  final CostSubmissionPermissions permissions;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;
  final VoidCallback? onTier2Approve;
  final VoidCallback? onTier2Reject;
  final VoidCallback? onTier3Approve;
  final VoidCallback? onTier3Reject;
  final VoidCallback? onMarkPaid;
  final VoidCallback? onCancel;
  final VoidCallback? onDownloadCertificate;
  final VoidCallback? onExportCsv;
  final bool isProcessing;

  const _SubmissionCard({
    required this.submission,
    required this.isArabic,
    required this.permissions,
    this.onApprove,
    this.onReject,
    this.onTier2Approve,
    this.onTier2Reject,
    this.onTier3Approve,
    this.onTier3Reject,
    this.onMarkPaid,
    this.onCancel,
    this.onDownloadCertificate,
    this.onExportCsv,
    this.isProcessing = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateFormat = DateFormat('MMM dd, yyyy');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: _getStatusColor().withOpacity(0.3), width: 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showDetails(context),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: _getCategoryColor().withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      _getCategoryIcon(),
                      size: 20,
                      color: _getCategoryColor(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          submission.expenseCategory.getLabel(isArabic),
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (submission.submitterName != null)
                          Text(
                            submission.submitterName!,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurface.withOpacity(
                                0.6,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  _buildStatusBadge(),
                ],
              ),
              const SizedBox(height: 12),

              // Amount and Date
              Row(
                children: [
                  Icon(
                    Icons.attach_money,
                    size: 16,
                    color: Colors.green.shade600,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.green.shade700,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Icon(
                    Icons.calendar_today,
                    size: 14,
                    color: theme.colorScheme.onSurface.withOpacity(0.5),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    dateFormat.format(submission.createdAt),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withOpacity(0.6),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Description preview
              Text(
                submission.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withOpacity(0.7),
                ),
              ),

              // Funding type badge
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: submission.fundingType == FundingType.advance
                          ? Colors.blue.withOpacity(0.1)
                          : Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      submission.fundingType.getLabel(isArabic),
                      style: TextStyle(
                        fontSize: 11,
                        color: submission.fundingType == FundingType.advance
                            ? Colors.blue.shade700
                            : Colors.green.shade700,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  if (submission.projectName != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        submission.projectName!,
                        style: TextStyle(
                          fontSize: 11,
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ],
              ),

              // Action buttons
              if (_shouldShowActions()) ...[
                const Divider(height: 24),
                _buildActionButtons(context),
              ],
            ],
          ),
        ),
      ),
    );
  }

  bool _shouldShowActions() {
    if (isProcessing) return false;

    if (permissions.canApproveTier1(submission)) return true;
    if (permissions.canApproveTier2(submission)) return true;
    if (permissions.canApproveTier3(submission)) return true;
    if (submission.status == OperationalCostStatus.approved &&
        permissions.canPayOut) {
      return true;
    }
    if (submission.isCancellable) return true;
    if (submission.isFullyApproved ||
        submission.status == OperationalCostStatus.approved ||
        submission.status == OperationalCostStatus.paid) {
      return true;
    }

    return false;
  }

  Widget _buildActionButtons(BuildContext context) {
    final approvalButtons = <Widget>[];
    final utilityButtons = <Widget>[];

    if (permissions.canApproveTier1(submission)) {
      approvalButtons.add(
        TextButton.icon(
          onPressed: onReject,
          icon: const Icon(Icons.close, size: 18),
          label: Text(isArabic ? 'رفض' : 'Reject'),
          style: TextButton.styleFrom(foregroundColor: Colors.red),
        ),
      );
      approvalButtons.add(
        ElevatedButton.icon(
          onPressed: onApprove,
          icon: const Icon(Icons.check, size: 18),
          label: Text(isArabic ? 'موافقة T1' : 'T1 Approve'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green,
            foregroundColor: Colors.white,
          ),
        ),
      );
    }

    if (permissions.canApproveTier2(submission)) {
      approvalButtons.add(
        TextButton.icon(
          onPressed: onTier2Reject,
          icon: const Icon(Icons.close, size: 18),
          label: Text(isArabic ? 'رفض' : 'Reject'),
          style: TextButton.styleFrom(foregroundColor: Colors.red),
        ),
      );
      approvalButtons.add(
        ElevatedButton.icon(
          onPressed: onTier2Approve,
          icon: const Icon(Icons.check_circle, size: 18),
          label: Text(
            isArabic
                ? (submission.hasThreeTiers ? 'موافقة T2' : 'موافقة نهائية')
                : (submission.hasThreeTiers ? 'T2 Approve' : 'Final Approve'),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green,
            foregroundColor: Colors.white,
          ),
        ),
      );
    }

    if (permissions.canApproveTier3(submission)) {
      approvalButtons.add(
        TextButton.icon(
          onPressed: onTier3Reject,
          icon: const Icon(Icons.close, size: 18),
          label: Text(isArabic ? 'رفض' : 'Reject'),
          style: TextButton.styleFrom(foregroundColor: Colors.red),
        ),
      );
      approvalButtons.add(
        ElevatedButton.icon(
          onPressed: onTier3Approve,
          icon: const Icon(Icons.verified, size: 18),
          label: Text(isArabic ? 'موافقة نهائية T3' : 'T3 Final Approve'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.indigo,
            foregroundColor: Colors.white,
          ),
        ),
      );
    }

    if (submission.status == OperationalCostStatus.approved &&
        permissions.canPayOut) {
      approvalButtons.add(
        ElevatedButton.icon(
          onPressed: onMarkPaid,
          icon: const Icon(Icons.payment, size: 18),
          label: Text(isArabic ? 'تسجيل الدفع' : 'Mark Paid'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.purple,
            foregroundColor: Colors.white,
          ),
        ),
      );
    }

    if (submission.isCancellable && approvalButtons.isEmpty) {
      approvalButtons.add(
        TextButton.icon(
          onPressed: onCancel,
          icon: const Icon(Icons.cancel_outlined, size: 18),
          label: Text(isArabic ? 'إلغاء' : 'Cancel'),
          style: TextButton.styleFrom(foregroundColor: Colors.orange),
        ),
      );
    }

    if (submission.isFullyApproved ||
        submission.status == OperationalCostStatus.approved ||
        submission.status == OperationalCostStatus.paid) {
      utilityButtons.add(
        TextButton.icon(
          onPressed: onDownloadCertificate,
          icon: const Icon(Icons.picture_as_pdf, size: 16),
          label: Text(
            isArabic ? 'شهادة' : 'Certificate',
            style: const TextStyle(fontSize: 12),
          ),
          style: TextButton.styleFrom(foregroundColor: Colors.blue),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (approvalButtons.isNotEmpty)
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 4,
            runSpacing: 4,
            children: approvalButtons,
          ),
        if (utilityButtons.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 4,
              children: utilityButtons,
            ),
          ),
      ],
    );
  }

  Widget _buildStatusBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _getStatusColor().withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _getStatusColor().withOpacity(0.3)),
      ),
      child: Text(
        submission.status.getLabel(isArabic),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: _getStatusColor(),
        ),
      ),
    );
  }

  Color _getStatusColor() {
    switch (submission.status) {
      case OperationalCostStatus.pending:
        return Colors.orange;
      case OperationalCostStatus.underReview:
        return Colors.blue;
      case OperationalCostStatus.approved:
        return Colors.green;
      case OperationalCostStatus.rejected:
      case OperationalCostStatus.cancelled:
        return Colors.red;
      case OperationalCostStatus.paid:
        return Colors.purple;
    }
  }

  Color _getCategoryColor() {
    switch (submission.expenseCategory) {
      case ExpenseCategory.transport:
        return Colors.blue;
      case ExpenseCategory.equipment:
        return Colors.indigo;
      case ExpenseCategory.training:
        return Colors.purple;
      case ExpenseCategory.meetings:
        return Colors.teal;
      case ExpenseCategory.permits:
        return Colors.orange;
      case ExpenseCategory.incentives:
        return Colors.green;
      case ExpenseCategory.communications:
        return Colors.cyan;
      case ExpenseCategory.printing:
        return Colors.brown;
      case ExpenseCategory.officeAdmin:
        return Colors.blueGrey;
      case ExpenseCategory.other:
        return Colors.grey;
    }
  }

  IconData _getCategoryIcon() {
    switch (submission.expenseCategory) {
      case ExpenseCategory.transport:
        return Icons.directions_car;
      case ExpenseCategory.equipment:
        return Icons.build;
      case ExpenseCategory.training:
        return Icons.school;
      case ExpenseCategory.meetings:
        return Icons.groups;
      case ExpenseCategory.permits:
        return Icons.badge;
      case ExpenseCategory.incentives:
        return Icons.card_giftcard;
      case ExpenseCategory.communications:
        return Icons.wifi;
      case ExpenseCategory.printing:
        return Icons.print;
      case ExpenseCategory.officeAdmin:
        return Icons.business;
      case ExpenseCategory.other:
        return Icons.more_horiz;
    }
  }

  void _showDetails(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.3,
        maxChildSize: 0.9,
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
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                isArabic ? 'تفاصيل الطلب' : 'Submission Details',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              _buildDetailRow(
                isArabic ? 'الفئة' : 'Category',
                submission.expenseCategory.getLabel(isArabic),
              ),
              _buildDetailRow(
                isArabic ? 'نوع التمويل' : 'Funding Type',
                submission.fundingType.getLabel(isArabic),
              ),
              _buildDetailRow(
                isArabic ? 'المبلغ' : 'Amount',
                '${submission.amount.toStringAsFixed(2)} ${submission.currency}',
              ),
              _buildDetailRow(
                isArabic ? 'الحالة' : 'Status',
                submission.status.getLabel(isArabic),
              ),
              if (submission.submitterName != null)
                _buildDetailRow(
                  isArabic ? 'مقدم الطلب' : 'Submitted By',
                  submission.submitterName!,
                ),
              if (submission.projectName != null)
                _buildDetailRow(
                  isArabic ? 'المشروع' : 'Project',
                  submission.projectName!,
                ),
              if (submission.hubName != null)
                _buildDetailRow(
                  isArabic ? 'المحور' : 'Hub',
                  submission.hubName!,
                ),
              if (submission.vendor != null)
                _buildDetailRow(
                  isArabic ? 'المورد' : 'Vendor',
                  submission.vendor!,
                ),
              _buildDetailRow(
                isArabic ? 'تاريخ الإنشاء' : 'Created',
                DateFormat('MMM dd, yyyy HH:mm').format(submission.createdAt),
              ),
              const SizedBox(height: 16),
              Text(
                isArabic ? 'الوصف' : 'Description',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(submission.description),
              const SizedBox(height: 16),
              Text(
                isArabic ? 'مسار الموافقة' : 'Approval Workflow',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 12),
              _buildApprovalTimeline(context),
              if (submission.isReconciled) ...[
                const SizedBox(height: 16),
                Text(
                  isArabic ? 'تفاصيل التسوية' : 'Reconciliation Details',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                if (submission.reconciledAmount != null)
                  _buildDetailRow(
                    isArabic ? 'المبلغ الفعلي' : 'Actual Amount',
                    '${submission.reconciledAmount!.toStringAsFixed(2)} ${submission.currency}',
                  ),
                if (submission.reconciliationNotes != null)
                  _buildDetailRow(
                    isArabic ? 'ملاحظات' : 'Notes',
                    submission.reconciliationNotes!,
                  ),
              ],
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildApprovalTimeline(BuildContext context) {
    final tiers = <Map<String, dynamic>>[];

    tiers.add({
      'label': isArabic ? 'المستوى 1 - المشرف' : 'Tier 1 - Supervisor',
      'status': submission.tier1Status,
      'reviewer': submission.tier1ReviewerName,
      'date': submission.tier1ReviewedAt,
      'notes': submission.tier1Notes,
    });

    tiers.add({
      'label': isArabic
          ? (submission.hasThreeTiers
                ? 'المستوى 2 - المدير القطري'
                : 'المستوى 2 - الموافقة النهائية')
          : (submission.hasThreeTiers
                ? 'Tier 2 - Country Director'
                : 'Tier 2 - Final Approval'),
      'status': submission.tier2Status,
      'reviewer': submission.tier2ReviewerName,
      'date': submission.tier2ReviewedAt,
      'notes': submission.tier2Notes,
    });

    if (submission.hasThreeTiers) {
      tiers.add({
        'label': isArabic ? 'المستوى 3 - المسؤول' : 'Tier 3 - Admin',
        'status': submission.tier3Status,
        'reviewer': submission.tier3ReviewerName,
        'date': submission.tier3ReviewedAt,
        'notes': submission.tier3Notes,
      });
    }

    return Column(
      children: tiers.asMap().entries.map((entry) {
        final tier = entry.value;
        final isLast = entry.key == tiers.length - 1;
        final status = tier['status'] as String?;
        final Color dotColor;
        final IconData dotIcon;

        if (status == 'approved') {
          dotColor = Colors.green;
          dotIcon = Icons.check_circle;
        } else if (status == 'rejected') {
          dotColor = Colors.red;
          dotIcon = Icons.cancel;
        } else if (status == 'pending') {
          dotColor = Colors.orange;
          dotIcon = Icons.hourglass_empty;
        } else {
          dotColor = Colors.grey.shade400;
          dotIcon = Icons.radio_button_unchecked;
        }

        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 32,
                child: Column(
                  children: [
                    Icon(dotIcon, color: dotColor, size: 20),
                    if (!isLast)
                      Expanded(
                        child: Container(
                          width: 2,
                          color: dotColor.withOpacity(0.3),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tier['label'] as String,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      if (tier['reviewer'] != null)
                        Text(
                          '${tier['reviewer']}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      if (tier['date'] != null)
                        Text(
                          DateFormat(
                            'MMM dd, yyyy HH:mm',
                          ).format(tier['date'] as DateTime),
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      if (tier['notes'] != null &&
                          (tier['notes'] as String).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            tier['notes'] as String,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
