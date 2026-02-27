import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/cost_submission.dart';
import '../services/cost_submission_service.dart';

class CostSubmissionScreen extends StatefulWidget {
  final CostSubmissionService? costService;
  final String? userRole;
  final String? hubId;
  final String? projectId;
  final bool isArabic;

  const CostSubmissionScreen({
    Key? key,
    this.costService,
    this.userRole,
    this.hubId,
    this.projectId,
    this.isArabic = false,
  }) : super(key: key);

  @override
  State<CostSubmissionScreen> createState() => _CostSubmissionScreenState();
}

class _CostSubmissionScreenState extends State<CostSubmissionScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late CostSubmissionService _costService;
  List<OperationalCostSubmission> _submissions = [];
  CostSubmissionStats _stats = CostSubmissionStats.empty();
  bool _isLoading = true;

  String get _userRole => widget.userRole ?? 'user';

  bool get canSubmitOperationalCosts {
    final role = _userRole.toLowerCase();
    return role.contains('fom') ||
        role.contains('coordinator') ||
        role.contains('country') ||
        role.contains('admin');
  }

  bool get canViewTeamSubmissions {
    final role = _userRole.toLowerCase();
    return role.contains('admin') ||
        role.contains('supervisor') ||
        role.contains('country');
  }

  @override
  void initState() {
    super.initState();
    _costService = widget.costService ?? CostSubmissionService();
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
      final submissions = await _costService.getUserSubmissions();
      final stats = CostSubmissionStats.fromSubmissions(submissions);
      setState(() {
        _submissions = submissions;
        _stats = stats;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      _showError('Failed to load submissions');
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
        title: Text(isArabic ? 'تقديم التكاليف' : 'Cost Submission'),
        elevation: 0,
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: [
            Tab(
              icon: const Icon(Icons.add_circle_outline),
              text: isArabic ? 'تقديم' : 'Submit',
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
      padding: const EdgeInsets.all(16),
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
            const SizedBox(width: 12),
            _StatCard(
              title: isArabic ? 'قيد الانتظار' : 'Pending',
              value: _stats.pending.toString(),
              color: Colors.orange,
              icon: Icons.hourglass_empty,
            ),
            const SizedBox(width: 12),
            _StatCard(
              title: isArabic ? 'موافق عليه' : 'Approved',
              value: _stats.approved.toString(),
              color: Colors.green,
              icon: Icons.check_circle,
            ),
            const SizedBox(width: 12),
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
    if (!canSubmitOperationalCosts) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                widget.isArabic
                    ? 'ليس لديك صلاحية لتقديم التكاليف التشغيلية'
                    : 'You do not have permission to submit operational costs',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16, color: Colors.grey[600]),
              ),
            ],
          ),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: OperationalCostForm(
        isArabic: widget.isArabic,
        hubId: widget.hubId,
        projectId: widget.projectId,
        userRole: _userRole,
        onSubmit: _handleSubmit,
      ),
    );
  }

  Widget _buildReconciliationTab() {
    final disbursedSubmissions = _submissions
        .where((s) => s.status == CostSubmissionStatus.disbursed)
        .toList();

    if (disbursedSubmissions.isEmpty) {
      return _buildEmptyState(
        icon: Icons.sync,
        title: widget.isArabic
            ? 'لا توجد تسويات مطلوبة'
            : 'No Reconciliations Needed',
        subtitle: widget.isArabic
            ? 'ستظهر هنا السلف التي تحتاج تسوية'
            : 'Advances needing reconciliation will appear here',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: disbursedSubmissions.length,
      itemBuilder: (context, index) {
        return _buildSubmissionCard(
          disbursedSubmissions[index],
          showReconcileButton: true,
        );
      },
    );
  }

  Widget _buildOutstandingTab() {
    final outstandingSubmissions = _submissions
        .where(
          (s) =>
              s.status == CostSubmissionStatus.approved ||
              s.status == CostSubmissionStatus.disbursed,
        )
        .toList();

    if (outstandingSubmissions.isEmpty) {
      return _buildEmptyState(
        icon: Icons.account_balance_wallet,
        title: widget.isArabic ? 'لا توجد مستحقات' : 'No Outstanding Advances',
        subtitle: widget.isArabic
            ? 'ستظهر هنا المبالغ المعتمدة المنتظرة الصرف'
            : 'Approved amounts awaiting payment will appear here',
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: outstandingSubmissions.length,
      itemBuilder: (context, index) {
        return _buildSubmissionCard(outstandingSubmissions[index]);
      },
    );
  }

  Widget _buildHistoryTab() {
    if (_submissions.isEmpty) {
      return _buildEmptyState(
        icon: Icons.history,
        title: widget.isArabic ? 'لا يوجد سجل' : 'No Submission History',
        subtitle: widget.isArabic
            ? 'ستظهر هنا جميع طلباتك السابقة'
            : 'Your past submissions will appear here',
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _submissions.length,
        itemBuilder: (context, index) {
          return _buildSubmissionCard(_submissions[index]);
        },
      ),
    );
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

  Widget _buildSubmissionCard(
    OperationalCostSubmission submission, {
    bool showReconcileButton = false,
  }) {
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy');

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    isArabic
                        ? submission.expenseCategory.labelAr
                        : submission.expenseCategory.labelEn,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                _buildStatusBadge(submission.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              submission.formattedAmount,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Theme.of(context).primaryColor,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              submission.description ?? '',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.grey[700]),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 16, color: Colors.grey[500]),
                const SizedBox(width: 4),
                Text(
                  submission.expenseDate != null
                      ? dateFormat.format(DateTime.parse(submission.expenseDate!))
                      : '-',
                  style: TextStyle(color: Colors.grey[600], fontSize: 13),
                ),
                if (submission.vendor != null) ...[
                  const SizedBox(width: 16),
                  Icon(Icons.store, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      submission.vendor!,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.grey[600], fontSize: 13),
                    ),
                  ),
                ],
              ],
            ),
            if (_parseTierApprovalStatus(submission.tier1Status) != TierApprovalStatus.pending ||
                _parseTierApprovalStatus(submission.tier2Status) != TierApprovalStatus.pending) ...[
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 8),
              _buildApprovalProgress(submission),
            ],
            if (showReconcileButton) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _showReconciliationDialog(submission),
                  icon: const Icon(Icons.sync),
                  label: Text(isArabic ? 'تسوية' : 'Reconcile'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(CostSubmissionStatus status) {
    Color color;
    switch (status) {
      case CostSubmissionStatus.pending:
        color = Colors.orange;
        break;
      case CostSubmissionStatus.underReview:
        color = Colors.blue;
        break;
      case CostSubmissionStatus.approved:
      case CostSubmissionStatus.disbursed:
        color = Colors.green;
        break;
      case CostSubmissionStatus.rejected:
        color = Colors.red;
        break;
      case CostSubmissionStatus.paid:
      case CostSubmissionStatus.closed:
      case CostSubmissionStatus.reconciled:
        color = Colors.purple;
        break;
      case CostSubmissionStatus.cancelled:
        color = Colors.grey;
        break;
      default:
        color = Colors.grey;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        widget.isArabic ? status.labelAr : status.labelEn,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildApprovalProgress(OperationalCostSubmission submission) {
    final isArabic = widget.isArabic;

    return Row(
      children: [
        Expanded(
          child: _buildTierStatus(
            tier: 1,
            status: _parseTierApprovalStatus(submission.tier1Status),
            label: isArabic ? 'المرحلة 1' : 'Tier 1',
          ),
        ),
        Icon(Icons.arrow_forward, size: 16, color: Colors.grey[400]),
        Expanded(
          child: _buildTierStatus(
            tier: 2,
            status: _parseTierApprovalStatus(submission.tier2Status),
            label: isArabic ? 'المرحلة 2' : 'Tier 2',
          ),
        ),
      ],
    );
  }

  TierApprovalStatus _parseTierApprovalStatus(dynamic statusValue) {
    if (statusValue == null) return TierApprovalStatus.pending;
    if (statusValue is TierApprovalStatus) return statusValue;
    final str = statusValue.toString().toLowerCase();
    return TierApprovalStatus.values.firstWhere(
      (status) => status.toString().split('.').last.toLowerCase() == str,
      orElse: () => TierApprovalStatus.pending,
    );
  }

  Widget _buildTierStatus({
    required int tier,
    required TierApprovalStatus status,
    required String label,
  }) {
    IconData icon;
    Color color;

    switch (status) {
      case TierApprovalStatus.pending:
        icon = Icons.hourglass_empty;
        color = Colors.grey;
        break;
      case TierApprovalStatus.approved:
        icon = Icons.check_circle;
        color = Colors.green;
        break;
      case TierApprovalStatus.rejected:
        icon = Icons.cancel;
        color = Colors.red;
        break;
      case TierApprovalStatus.changesRequested:
        icon = Icons.edit_note;
        color = Colors.orange;
        break;
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }

  Future<void> _handleSubmit(Map<String, dynamic> formData) async {
    try {
      final docs =
          formData['supportingDocuments'] as List<SupportingDocument>? ?? [];

      await _costService.submitOperationalCost(
        expenseCategory:
            formData['expenseCategory'] as OperationalExpenseCategory,
        amountCents: formData['amountCents'] as int,
        description: formData['description'] as String,
        expenseDate: formData['expenseDate'] as String,
        hubId: formData['hubId'] as String?,
        projectId: formData['projectId'] as String?,
        vendor: formData['vendor'] as String?,
        referenceNumber: formData['referenceNumber'] as String?,
        currency: formData['currency'] as String? ?? 'SDG',
        supportingDocuments: docs,
        submitterRole: _userRole,
      );

      _showSuccess(
        widget.isArabic
            ? 'تم تقديم المصروف بنجاح'
            : 'Expense submitted successfully',
      );

      await _loadData();
      _tabController.animateTo(3);
    } catch (e) {
      _showError(
        widget.isArabic ? 'فشل في تقديم المصروف' : 'Failed to submit expense',
      );
    }
  }

  void _showReconciliationDialog(OperationalCostSubmission submission) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(widget.isArabic ? 'تسوية' : 'Reconciliation'),
        content: Text(
          widget.isArabic
              ? 'سيتم إضافة نموذج التسوية قريباً'
              : 'Reconciliation form coming soon',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(widget.isArabic ? 'إغلاق' : 'Close'),
          ),
        ],
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
      width: 100,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: TextStyle(fontSize: 12, color: color.withValues(alpha: 0.8)),
          ),
        ],
      ),
    );
  }
}

class OperationalCostForm extends StatefulWidget {
  final bool isArabic;
  final String? hubId;
  final String? projectId;
  final String userRole;
  final Function(Map<String, dynamic>) onSubmit;

  const OperationalCostForm({
    Key? key,
    required this.isArabic,
    this.hubId,
    this.projectId,
    required this.userRole,
    required this.onSubmit,
  }) : super(key: key);

  @override
  State<OperationalCostForm> createState() => _OperationalCostFormState();
}

class _OperationalCostFormState extends State<OperationalCostForm> {
  final _formKey = GlobalKey<FormState>();
  OperationalExpenseCategory? _selectedCategory;
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _vendorController = TextEditingController();
  final _referenceController = TextEditingController();
  DateTime _expenseDate = DateTime.now();
  String _currency = 'SDG';
  List<SupportingDocument> _documents = [];
  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountController.dispose();
    _descriptionController.dispose();
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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<OperationalExpenseCategory>(
            value: _selectedCategory,
            decoration: InputDecoration(
              labelText: isArabic ? 'فئة المصروف' : 'Expense Category',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.category),
            ),
            items: OperationalExpenseCategory.values.map((cat) {
              return DropdownMenuItem(
                value: cat,
                child: Text(isArabic ? cat.labelAr : cat.labelEn),
              );
            }).toList(),
            onChanged: (value) => setState(() => _selectedCategory = value),
            validator: (value) =>
                value == null ? (isArabic ? 'مطلوب' : 'Required') : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _amountController,
            decoration: InputDecoration(
              labelText: isArabic ? 'المبلغ' : 'Amount',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.attach_money),
              suffixText: _currency,
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'^\d+\.?\d{0,2}')),
            ],
            validator: (value) {
              if (value == null || value.isEmpty) {
                return isArabic ? 'مطلوب' : 'Required';
              }
              final amount = double.tryParse(value);
              if (amount == null || amount <= 0) {
                return isArabic ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _currency,
            decoration: InputDecoration(
              labelText: isArabic ? 'العملة' : 'Currency',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.monetization_on),
            ),
            items: const [
              DropdownMenuItem(value: 'SDG', child: Text('SDG - Sudanese Pound')),
              DropdownMenuItem(value: 'USD', child: Text('USD - US Dollar')),
              DropdownMenuItem(value: 'EUR', child: Text('EUR - Euro')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _currency = value);
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _descriptionController,
            decoration: InputDecoration(
              labelText: isArabic ? 'الوصف' : 'Description',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.description),
            ),
            maxLines: 3,
            validator: (value) =>
                (value == null || value.isEmpty)
                    ? (isArabic ? 'مطلوب' : 'Required')
                    : null,
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
              child: Text(DateFormat('MMM dd, yyyy').format(_expenseDate)),
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _vendorController,
            decoration: InputDecoration(
              labelText: isArabic ? 'المورد (اختياري)' : 'Vendor (Optional)',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.store),
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _referenceController,
            decoration: InputDecoration(
              labelText: isArabic ? 'رقم المرجع (اختياري)' : 'Reference # (Optional)',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.tag),
            ),
          ),
          const SizedBox(height: 16),
          _buildDocumentUploadSection(),
          const SizedBox(height: 24),
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _handleSubmit,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
              label: Text(
                _isSubmitting
                    ? (isArabic ? 'جاري التقديم...' : 'Submitting...')
                    : (isArabic ? 'تقديم المصروف' : 'Submit Expense'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentUploadSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.isArabic ? 'المستندات الداعمة' : 'Supporting Documents',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 8),
          if (_documents.isEmpty)
            InkWell(
              onTap: _pickDocument,
              child: Column(
                children: [
                  Icon(Icons.cloud_upload, size: 48, color: Colors.grey[400]),
                  const SizedBox(height: 8),
                  Text(
                    widget.isArabic
                        ? 'اضغط لرفع المستندات'
                        : 'Tap to upload documents',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.isArabic
                        ? 'الإيصالات، الفواتير، الصور'
                        : 'Receipts, invoices, photos',
                    style: TextStyle(color: Colors.grey[500], fontSize: 12),
                  ),
                ],
              ),
            )
          else
            Column(
              children: [
                ..._documents.map(
                  (doc) => ListTile(
                    leading: const Icon(Icons.insert_drive_file),
                    title: Text(doc.filename),
                    subtitle: Text(doc.type),
                    trailing: IconButton(
                      icon: const Icon(Icons.close, color: Colors.red),
                      onPressed: () {
                        setState(() => _documents.remove(doc));
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _pickDocument,
                  icon: const Icon(Icons.add),
                  label: Text(
                    widget.isArabic
                        ? 'إضافة مستند آخر'
                        : 'Add another document',
                  ),
                ),
              ],
            ),
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

  Future<void> _pickDocument() async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          widget.isArabic
              ? 'سيتم إضافة رفع المستندات'
              : 'Document upload will be implemented',
        ),
      ),
    );
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_documents.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isArabic
                ? 'يرجى رفع مستند داعم واحد على الأقل'
                : 'Please upload at least one supporting document',
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final amount = double.parse(_amountController.text);
      final amountCents = (amount * 100).round();

      await widget.onSubmit({
        'expenseCategory': _selectedCategory,
        'amountCents': amountCents,
        'currency': _currency,
        'description': _descriptionController.text,
        'expenseDate': DateFormat('yyyy-MM-dd').format(_expenseDate),
        'vendor': _vendorController.text.isNotEmpty
            ? _vendorController.text
            : null,
        'referenceNumber': _referenceController.text.isNotEmpty
            ? _referenceController.text
            : null,
        'hubId': widget.hubId,
        'projectId': widget.projectId,
        'supportingDocuments': _documents,
      });

      _formKey.currentState!.reset();
      _amountController.clear();
      _descriptionController.clear();
      _vendorController.clear();
      _referenceController.clear();
      setState(() {
        _selectedCategory = null;
        _expenseDate = DateTime.now();
        _documents = [];
      });
    } finally {
      setState(() => _isSubmitting = false);
    }
  }
}
