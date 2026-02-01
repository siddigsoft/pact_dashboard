import 'package:flutter/material.dart';
import '../models/cost_submission.dart';

/// Cost Approval Widgets for PACT Mobile App
/// 
/// Includes:
/// - Approval card for supervisors/admins
/// - Approval dialog
/// - Rejection dialog
/// - Stats widgets

class CostApprovalCard extends StatelessWidget {
  final OperationalCostSubmission submission;
  final int approvalTier; // 1 or 2
  final bool isArabic;
  final Function(String submissionId, bool approved, String? notes)? onAction;

  const CostApprovalCard({
    Key? key,
    required this.submission,
    required this.approvalTier,
    this.isArabic = false,
    this.onAction,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with category and status
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).primaryColor.withOpacity(0.1),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
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
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Tier $approvalTier ${isArabic ? "موافقة" : "Approval"}',
                        style: TextStyle(
                          color: Colors.grey[600],
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: Theme.of(context).primaryColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    submission.formattedAmount,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Content
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Description
                Text(
                  submission.description,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),

                // Details row
                Wrap(
                  spacing: 16,
                  runSpacing: 8,
                  children: [
                    _DetailChip(
                      icon: Icons.calendar_today,
                      label: submission.expenseDate,
                    ),
                    if (submission.vendor != null)
                      _DetailChip(
                        icon: Icons.store,
                        label: submission.vendor!,
                      ),
                    _DetailChip(
                      icon: Icons.person,
                      label: submission.submitterRole,
                    ),
                  ],
                ),

                // Documents count
                if (submission.supportingDocuments.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Icon(Icons.attach_file, size: 16, color: Colors.grey),
                      const SizedBox(width: 4),
                      Text(
                        '${submission.supportingDocuments.length} ${isArabic ? "مستند" : "document(s)"}',
                        style: TextStyle(color: Colors.grey[600], fontSize: 13),
                      ),
                    ],
                  ),
                ],

                // Previous tier notes
                if (approvalTier == 2 && submission.tier1Notes != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.green.withOpacity(0.3)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isArabic ? 'ملاحظات المرحلة 1:' : 'Tier 1 Notes:',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          submission.tier1Notes!,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Action buttons
          if (onAction != null)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: Colors.grey[200]!),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showRejectDialog(context),
                      icon: const Icon(Icons.close, color: Colors.red),
                      label: Text(
                        isArabic ? 'رفض' : 'Reject',
                        style: const TextStyle(color: Colors.red),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.red),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _showApproveDialog(context),
                      icon: const Icon(Icons.check),
                      label: Text(isArabic ? 'موافقة' : 'Approve'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _showApproveDialog(BuildContext context) {
    final notesController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isArabic ? 'تأكيد الموافقة' : 'Confirm Approval'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isArabic
                  ? 'هل أنت متأكد من الموافقة على هذا الطلب؟'
                  : 'Are you sure you want to approve this request?',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: notesController,
              decoration: InputDecoration(
                labelText: isArabic ? 'ملاحظات (اختياري)' : 'Notes (optional)',
                border: const OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              onAction?.call(
                submission.id,
                true,
                notesController.text.isNotEmpty ? notesController.text : null,
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            child: Text(isArabic ? 'موافقة' : 'Approve'),
          ),
        ],
      ),
    );
  }

  void _showRejectDialog(BuildContext context) {
    final notesController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isArabic ? 'تأكيد الرفض' : 'Confirm Rejection'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                isArabic
                    ? 'يرجى تقديم سبب الرفض'
                    : 'Please provide a reason for rejection',
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: notesController,
                decoration: InputDecoration(
                  labelText: isArabic ? 'سبب الرفض *' : 'Rejection reason *',
                  border: const OutlineInputBorder(),
                ),
                maxLines: 3,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return isArabic ? 'مطلوب' : 'Required';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(isArabic ? 'إلغاء' : 'Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(ctx);
                onAction?.call(submission.id, false, notesController.text);
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: Text(isArabic ? 'رفض' : 'Reject'),
          ),
        ],
      ),
    );
  }
}

class _DetailChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _DetailChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.grey[600]),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, color: Colors.grey[700]),
          ),
        ],
      ),
    );
  }
}

/// Summary Stats Widget
class CostSubmissionStatsWidget extends StatelessWidget {
  final CostSubmissionStats stats;
  final bool isArabic;
  final String currency;

  const CostSubmissionStatsWidget({
    Key? key,
    required this.stats,
    this.isArabic = false,
    this.currency = 'SDG',
  }) : super(key: key);

  String _formatAmount(int cents) {
    return '${(cents / 100).toStringAsFixed(2)} $currency';
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isArabic ? 'ملخص التكاليف' : 'Cost Summary',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            
            // Stats grid
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 2.5,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              children: [
                _StatItem(
                  label: isArabic ? 'قيد الانتظار' : 'Pending',
                  value: _formatAmount(stats.totalPendingCents),
                  count: stats.pending,
                  color: Colors.orange,
                ),
                _StatItem(
                  label: isArabic ? 'موافق عليه' : 'Approved',
                  value: _formatAmount(stats.totalApprovedCents),
                  count: stats.approved,
                  color: Colors.green,
                ),
                _StatItem(
                  label: isArabic ? 'مدفوع' : 'Paid',
                  value: _formatAmount(stats.totalPaidCents),
                  count: stats.paid,
                  color: Colors.purple,
                ),
                _StatItem(
                  label: isArabic ? 'مرفوض' : 'Rejected',
                  value: stats.rejected.toString(),
                  count: stats.rejected,
                  color: Colors.red,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final int count;
  final Color color;

  const _StatItem({
    required this.label,
    required this.value,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: color.withOpacity(0.8),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// Pending Approvals Badge
class PendingApprovalsBadge extends StatelessWidget {
  final int count;
  final VoidCallback? onTap;

  const PendingApprovalsBadge({
    Key? key,
    required this.count,
    this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (count == 0) return const SizedBox.shrink();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.red,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          count.toString(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}
