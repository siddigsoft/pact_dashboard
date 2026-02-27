import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/operational_cost_submission.dart';
import '../services/operational_cost_service.dart';

class CostSubmissionDetailsScreen extends StatefulWidget {
  final String submissionId;
  final bool isArabic;

  const CostSubmissionDetailsScreen({
    super.key,
    required this.submissionId,
    this.isArabic = false,
  });

  @override
  State<CostSubmissionDetailsScreen> createState() => _CostSubmissionDetailsScreenState();
}

class _CostSubmissionDetailsScreenState extends State<CostSubmissionDetailsScreen> {
  final _costService = OperationalCostService();
  OperationalCostSubmission? _submission;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSubmission();
  }

  Future<void> _loadSubmission() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final submissions = await _costService.getAllSubmissions();
      final match = submissions.where((s) => s.id == widget.submissionId).toList();
      setState(() {
        _submission = match.isNotEmpty ? match.first : null;
        _isLoading = false;
        if (_submission == null) {
          _error = widget.isArabic ? 'لم يتم العثور على الطلب' : 'Submission not found';
        }
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = widget.isArabic;

    return Scaffold(
      appBar: AppBar(
        title: Text(isArabic ? 'تفاصيل الطلب' : 'Submission Details'),
        elevation: 0,
        actions: [
          if (_submission != null && _submission!.isEditable)
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'cancel') _cancelSubmission();
              },
              itemBuilder: (ctx) => [
                PopupMenuItem(
                  value: 'cancel',
                  child: Row(children: [
                    const Icon(Icons.cancel, size: 20, color: Colors.red),
                    const SizedBox(width: 12),
                    Text(isArabic ? 'إلغاء' : 'Cancel', style: const TextStyle(color: Colors.red)),
                  ]),
                ),
              ],
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              top: false,
              child: _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_error!, style: TextStyle(color: Colors.grey[600])),
                      const SizedBox(height: 16),
                      ElevatedButton(onPressed: _loadSubmission, child: Text(isArabic ? 'إعادة المحاولة' : 'Retry')),
                    ],
                  ),
                )
            )
              : RefreshIndicator(
                  onRefresh: _loadSubmission,
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: Column(
                      children: [
                        _buildHeader(),
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _buildInfoSection(),
                              const SizedBox(height: 20),
                              _buildApprovalTimeline(),
                              if (_submission!.hasSignature) ...[
                                const SizedBox(height: 16),
                                _buildSignatureBanner(),
                              ],
                              if (_submission!.supportingDocuments.isNotEmpty) ...[
                                const SizedBox(height: 20),
                                _buildDocumentsSection(),
                              ],
                              if (_submission!.isReconciled) ...[
                                const SizedBox(height: 20),
                                _buildReconciliationSection(),
                              ],
                              const SizedBox(height: 32),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _buildHeader() {
    final s = _submission!;
    final isArabic = widget.isArabic;
    final statusDisplay = OperationalCostSubmission.getStatusDisplay(s.derivedStatus, isArabic);
    final statusColor = statusDisplay['color'] as Color;
    final statusLabel = (statusDisplay['label'] as String).toUpperCase();

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Theme.of(context).primaryColor, Theme.of(context).primaryColor.withValues(alpha: 0.8)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            decoration: BoxDecoration(color: statusColor, borderRadius: BorderRadius.circular(16)),
            child: Text(statusLabel, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1)),
          ),
          const SizedBox(height: 16),
          Text(
            '${s.amount.toStringAsFixed(2)} ${s.currency}',
            style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            isArabic ? s.expenseCategory.labelAr : s.expenseCategory.labelEn,
            style: const TextStyle(color: Colors.white70, fontSize: 15),
          ),
          const SizedBox(height: 8),
          Text(
            'PACT-OC-${s.id.substring(0, 8).toUpperCase()}',
            style: const TextStyle(color: Colors.white54, fontSize: 12, fontFamily: 'monospace'),
          ),
          if (s.hasThreeTiers) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                isArabic ? 'موافقة ثلاثية المستويات' : '3-Tier Approval',
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInfoSection() {
    final s = _submission!;
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy HH:mm');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(isArabic ? 'التفاصيل' : 'Details', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            _infoRow(Icons.category, isArabic ? 'الفئة' : 'Category', isArabic ? s.expenseCategory.labelAr : s.expenseCategory.labelEn),
            _infoRow(Icons.monetization_on, isArabic ? 'نوع التمويل' : 'Funding Type', isArabic ? s.fundingType.labelAr : s.fundingType.labelEn),
            _infoRow(Icons.description, isArabic ? 'الوصف' : 'Description', s.description),
            if (s.justification != null) _infoRow(Icons.note, isArabic ? 'التبرير' : 'Justification', s.justification!),
            if (s.vendor != null) _infoRow(Icons.store, isArabic ? 'المورد' : 'Vendor', s.vendor!),
            if (s.referenceNumber != null) _infoRow(Icons.tag, isArabic ? 'رقم المرجع' : 'Reference', s.referenceNumber!),
            if (s.expenseDate != null) _infoRow(Icons.calendar_today, isArabic ? 'تاريخ المصروف' : 'Expense Date', s.expenseDate!),
            if (s.projectName != null) _infoRow(Icons.folder, isArabic ? 'المشروع' : 'Project', s.projectName!),
            if (s.hubName != null) _infoRow(Icons.location_city, isArabic ? 'المحور' : 'Hub', s.hubName!),
            _infoRow(Icons.person, isArabic ? 'مقدم الطلب' : 'Submitted By', s.submitterName ?? s.userId),
            _infoRow(Icons.access_time, isArabic ? 'تاريخ التقديم' : 'Submitted At', dateFormat.format(s.createdAt)),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Colors.grey[500]),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                const SizedBox(height: 2),
                Text(value, style: const TextStyle(fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildApprovalTimeline() {
    final s = _submission!;
    final isArabic = widget.isArabic;
    final dateFormat = DateFormat('MMM dd, yyyy HH:mm');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(isArabic ? 'مسار الموافقة' : 'Approval Timeline', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            _timelineStep(
              title: isArabic ? 'تم التقديم' : 'Submitted',
              subtitle: s.submitterName ?? '',
              date: dateFormat.format(s.createdAt),
              isCompleted: true,
              isFirst: true,
            ),
            _timelineStep(
              title: isArabic ? 'مراجعة المستوى 1' : 'Tier 1 Review',
              subtitle: s.tier1ReviewerName ?? (isArabic ? 'في الانتظار' : 'Pending'),
              date: s.tier1ReviewedAt != null ? dateFormat.format(s.tier1ReviewedAt!) : null,
              notes: s.tier1Notes,
              isCompleted: s.tier1Status == 'approved',
              isRejected: s.tier1Status == 'rejected',
            ),
            _timelineStep(
              title: isArabic ? 'مراجعة المستوى 2' : 'Tier 2 Review',
              subtitle: s.tier2ReviewerName ?? (isArabic ? 'في الانتظار' : 'Pending'),
              date: s.tier2ReviewedAt != null ? dateFormat.format(s.tier2ReviewedAt!) : null,
              notes: s.tier2Notes,
              isCompleted: s.tier2Status == 'approved',
              isRejected: s.tier2Status == 'rejected',
              isLast: !s.hasThreeTiers && s.status != OperationalCostStatus.paid,
            ),
            if (s.hasThreeTiers)
              _timelineStep(
                title: isArabic ? 'مراجعة المستوى 3' : 'Tier 3 Review',
                subtitle: s.tier3ReviewerName ?? (isArabic ? 'في الانتظار' : 'Pending'),
                date: s.tier3ReviewedAt != null ? dateFormat.format(s.tier3ReviewedAt!) : null,
                notes: s.tier3Notes,
                isCompleted: s.tier3Status == 'approved',
                isRejected: s.tier3Status == 'rejected',
                isLast: s.status != OperationalCostStatus.paid,
              ),
            if (s.status == OperationalCostStatus.paid)
              _timelineStep(
                title: isArabic ? 'تم الدفع' : 'Payment Recorded',
                subtitle: '',
                isCompleted: true,
                isLast: true,
              ),
          ],
        ),
      ),
    );
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
  }) {
    final stepColor = isRejected ? Colors.red : (isCompleted ? Colors.green : Colors.grey[400]!);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            if (!isFirst) Container(width: 2, height: 8, color: stepColor),
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: stepColor.withValues(alpha: 0.2),
                border: Border.all(color: stepColor, width: 2),
              ),
              child: Icon(
                isRejected ? Icons.close : (isCompleted ? Icons.check : Icons.hourglass_empty),
                size: 14,
                color: stepColor,
              ),
            ),
            if (!isLast) Container(width: 2, height: 24, color: isCompleted ? Colors.green : Colors.grey[300]),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: isCompleted || isRejected ? null : Colors.grey[500])),
                if (subtitle.isNotEmpty) Text(subtitle, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                if (date != null) Text(date, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                if (notes != null && notes.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.grey.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.grey.withValues(alpha: 0.2)),
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

  Widget _buildSignatureBanner() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.verified, color: Colors.green),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              widget.isArabic ? 'تم التوقيع رقمياً' : 'Digitally Signed',
              style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentsSection() {
    final s = _submission!;
    final isArabic = widget.isArabic;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(isArabic ? 'المستندات الداعمة' : 'Supporting Documents', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: Theme.of(context).primaryColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${s.supportingDocuments.length}',
                    style: TextStyle(fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...s.supportingDocuments.map((doc) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey[300]!),
              ),
              child: Row(
                children: [
                  Icon(_getDocIcon(doc.name), color: Theme.of(context).primaryColor, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(doc.name, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                        Text(doc.type, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            )),
          ],
        ),
      ),
    );
  }

  IconData _getDocIcon(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return Icons.image;
      default:
        return Icons.insert_drive_file;
    }
  }

  Widget _buildReconciliationSection() {
    final s = _submission!;
    final isArabic = widget.isArabic;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(isArabic ? 'التسوية' : 'Reconciliation', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _infoRow(Icons.attach_money, isArabic ? 'المبلغ الأصلي' : 'Original Amount', '${s.amount.toStringAsFixed(2)} ${s.currency}'),
            if (s.reconciledAmount != null)
              _infoRow(Icons.check_circle, isArabic ? 'المبلغ الفعلي' : 'Actual Amount', '${s.reconciledAmount!.toStringAsFixed(2)} ${s.currency}'),
            if (s.reconciledAt != null)
              _infoRow(Icons.access_time, isArabic ? 'تاريخ التسوية' : 'Reconciled At', DateFormat('MMM dd, yyyy HH:mm').format(s.reconciledAt!)),
            if (s.reconciliationNotes != null)
              _infoRow(Icons.note, isArabic ? 'ملاحظات' : 'Notes', s.reconciliationNotes!),
          ],
        ),
      ),
    );
  }

  Future<void> _cancelSubmission() async {
    final isArabic = widget.isArabic;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isArabic ? 'تأكيد الإلغاء' : 'Cancel Submission'),
        content: Text(isArabic ? 'هل أنت متأكد من إلغاء هذا الطلب؟' : 'Are you sure you want to cancel this submission?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(isArabic ? 'لا' : 'No')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            child: Text(isArabic ? 'إلغاء الطلب' : 'Cancel Submission'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final success = await _costService.cancelSubmission(_submission!.id);
    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(isArabic ? 'تم إلغاء الطلب' : 'Submission cancelled'), backgroundColor: Colors.green),
        );
        Navigator.pop(context, true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(isArabic ? 'فشل في إلغاء الطلب' : 'Failed to cancel'), backgroundColor: Colors.red),
        );
      }
    }
  }
}
