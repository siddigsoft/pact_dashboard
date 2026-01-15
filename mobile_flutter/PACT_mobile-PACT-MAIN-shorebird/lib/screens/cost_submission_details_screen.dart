import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/cost_submission_models.dart';
import '../providers/cost_submission_provider.dart';
import '../services/cost_submission_service.dart';
import 'cost_submission_form_screen.dart';

class CostSubmissionDetailsScreen extends ConsumerWidget {
  final String submissionId;

  const CostSubmissionDetailsScreen({super.key, required this.submissionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final submissionAsync = ref.watch(costSubmissionByIdProvider(submissionId));
    final service = ref.watch(costSubmissionServiceProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        title: const Text(
          'Cost Submission Details',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          submissionAsync.when(
            data: (submission) {
              if (submission == null) return const SizedBox.shrink();
              if (!submission.canEdit) return const SizedBox.shrink();

              return PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert, color: Colors.white),
                onSelected: (value) {
                  if (value == 'edit') {
                    _handleEdit(context, ref, submission);
                  } else if (value == 'cancel') {
                    _handleCancel(context, ref, submission);
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: Row(
                      children: [
                        Icon(Icons.edit, size: 20),
                        SizedBox(width: 12),
                        Text('Edit'),
                      ],
                    ),
                  ),
                  if (submission.canCancel)
                    const PopupMenuItem(
                      value: 'cancel',
                      child: Row(
                        children: [
                          Icon(Icons.cancel, size: 20, color: Colors.red),
                          SizedBox(width: 12),
                          Text('Cancel', style: TextStyle(color: Colors.red)),
                        ],
                      ),
                    ),
                ],
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: submissionAsync.when(
        data: (submission) {
          if (submission == null) {
            return const Center(child: Text('Submission not found'));
          }
          return SingleChildScrollView(
            child: Column(
              children: [
                _buildHeader(submission, service),
                const SizedBox(height: 16),
                _buildCostBreakdown(submission, service),
                const SizedBox(height: 16),
                _buildDetails(submission, service),
                if (submission.supportingDocuments.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _buildDocuments(submission),
                ],
                if (submission.reviewerNotes != null) ...[
                  const SizedBox(height: 16),
                  _buildReviewSection(submission, service),
                ],
                const SizedBox(height: 32),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text('Error: $error'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(
    CostSubmission submission,
    CostSubmissionService service,
  ) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          _buildStatusBadge(submission.status),
          const SizedBox(height: 16),
          Text(
            service.formatCurrencyWithSymbol(
              submission.totalCostCents,
              currency: submission.currency,
            ),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 40,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${submission.totalCostCents} cents',
            style: const TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 16),
          Text(
            'Submitted ${service.getRelativeTime(submission.submittedAt)}',
            style: const TextStyle(color: Colors.white, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(CostSubmissionStatus status) {
    Color color;
    String label;

    switch (status) {
      case CostSubmissionStatus.pending:
        color = const Color(0xFFFF9800);
        label = 'PENDING';
        break;
      case CostSubmissionStatus.underReview:
        color = const Color(0xFFFF9800);
        label = 'UNDER REVIEW';
        break;
      case CostSubmissionStatus.approved:
        color = const Color(0xFF2196F3);
        label = 'APPROVED';
        break;
      case CostSubmissionStatus.paid:
        color = const Color(0xFF4CAF50);
        label = 'PAID';
        break;
      case CostSubmissionStatus.rejected:
        color = const Color(0xFFF44336);
        label = 'REJECTED';
        break;
      case CostSubmissionStatus.cancelled:
        color = Colors.grey;
        label = 'CANCELLED';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildCostBreakdown(
    CostSubmission submission,
    CostSubmissionService service,
  ) {
    final breakdown = service.getCostBreakdown(submission);
    final percentages = service.getCostPercentages(submission);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Cost Breakdown',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              ...breakdown.entries.map((entry) {
                if (entry.value == 0) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            entry.key,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Text(
                            service.formatCurrency(
                              entry.value,
                              currency: submission.currency,
                            ),
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      LinearProgressIndicator(
                        value: percentages[entry.key]! / 100,
                        backgroundColor: Colors.grey[200],
                        valueColor: AlwaysStoppedAnimation<Color>(
                          _getCategoryColor(entry.key),
                        ),
                        minHeight: 6,
                      ),
                      const SizedBox(height: 4),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          '${percentages[entry.key]!.toStringAsFixed(1)}%',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'Transportation':
        return const Color(0xFF1976D2);
      case 'Accommodation':
        return const Color(0xFF7B1FA2);
      case 'Meals':
        return const Color(0xFFFF6F00);
      case 'Other':
        return const Color(0xFF455A64);
      default:
        return Colors.grey;
    }
  }

  Widget _buildDetails(
    CostSubmission submission,
    CostSubmissionService service,
  ) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Details',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              _buildDetailRow('Site Visit', submission.siteVisitId),
              _buildDetailRow(
                'Submitted',
                service.formatDateTime(submission.submittedAt),
              ),
              _buildDetailRow('Currency', submission.currency),
              if (submission.transportationDetails != null)
                _buildDetailRow(
                  'Transportation Details',
                  submission.transportationDetails!,
                ),
              if (submission.accommodationDetails != null)
                _buildDetailRow(
                  'Accommodation Details',
                  submission.accommodationDetails!,
                ),
              if (submission.mealDetails != null)
                _buildDetailRow('Meal Details', submission.mealDetails!),
              if (submission.otherCostsDetails != null)
                _buildDetailRow('Other Details', submission.otherCostsDetails!),
              if (submission.submissionNotes != null) ...[
                const Divider(height: 24),
                const Text(
                  'Notes',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  submission.submissionNotes!,
                  style: TextStyle(color: Colors.grey[700], fontSize: 14),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey[600], fontSize: 14),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDocuments(CostSubmission submission) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Text(
                    'Supporting Documents',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1976D2).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${submission.supportingDocuments.length}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1976D2),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ...submission.supportingDocuments.map(
                (doc) => _buildDocumentItem(doc),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDocumentItem(SupportingDocument doc) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Row(
        children: [
          Icon(
            _getDocumentIcon(doc.filename),
            color: const Color(0xFF1976D2),
            size: 32,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.filename,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                  ),
                ),
                Text(
                  doc.type,
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.download),
            onPressed: () {
              // TODO: Implement download
            },
          ),
        ],
      ),
    );
  }

  IconData _getDocumentIcon(String filename) {
    final extension = filename.split('.').last.toLowerCase();
    switch (extension) {
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

  Widget _buildReviewSection(
    CostSubmission submission,
    CostSubmissionService service,
  ) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Review',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              if (submission.reviewedAt != null)
                _buildDetailRow(
                  'Reviewed',
                  service.formatDateTime(submission.reviewedAt!),
                ),
              if (submission.reviewerNotes != null) ...[
                const Text(
                  'Reviewer Notes',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  submission.reviewerNotes!,
                  style: TextStyle(color: Colors.grey[700], fontSize: 14),
                ),
              ],
              if (submission.approvalNotes != null) ...[
                const SizedBox(height: 12),
                const Text(
                  'Approval Notes',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const SizedBox(height: 8),
                Text(
                  submission.approvalNotes!,
                  style: TextStyle(color: Colors.grey[700], fontSize: 14),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleEdit(
    BuildContext context,
    WidgetRef ref,
    CostSubmission submission,
  ) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) =>
            CostSubmissionFormScreen(editSubmissionId: submission.id),
      ),
    );

    if (result == true) {
      ref.invalidate(costSubmissionByIdProvider(submission.id));
      ref.invalidate(userCostSubmissionsProvider);
    }
  }

  Future<void> _handleCancel(
    BuildContext context,
    WidgetRef ref,
    CostSubmission submission,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Submission'),
        content: const Text(
          'Are you sure you want to cancel this cost submission?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('NO'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('YES, CANCEL'),
          ),
        ],
      ),
    );

    if (confirm == true && context.mounted) {
      try {
        await ref
            .read(cancelCostSubmissionProvider.notifier)
            .cancel(submission.id);

        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Submission cancelled successfully'),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.pop(context);
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }
}
