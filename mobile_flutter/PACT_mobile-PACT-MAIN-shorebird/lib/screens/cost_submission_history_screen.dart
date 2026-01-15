import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/cost_submission_models.dart';
import '../providers/cost_submission_provider.dart';
import '../services/cost_submission_service.dart';
import 'cost_submission_details_screen.dart';
import 'cost_submission_form_screen.dart';

class CostSubmissionHistoryScreen extends ConsumerStatefulWidget {
  const CostSubmissionHistoryScreen({super.key});

  @override
  ConsumerState<CostSubmissionHistoryScreen> createState() => _CostSubmissionHistoryScreenState();
}

class _CostSubmissionHistoryScreenState extends ConsumerState<CostSubmissionHistoryScreen> {
  @override
  Widget build(BuildContext context) {
    final submissionsAsync = ref.watch(filteredCostSubmissionsProvider);
    final selectedStatus = ref.watch(selectedStatusFilterProvider);
    final service = ref.watch(costSubmissionServiceProvider);

    return Column(
      children: [
        // Filter chips
        _buildFilterChips(selectedStatus),
        // Submissions list
        Expanded(
          child: submissionsAsync.when(
            data: (submissions) {
              if (submissions.isEmpty) {
                return _buildEmptyState();
              }
              return RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(userCostSubmissionsProvider);
                },
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: submissions.length,
                  itemBuilder: (context, index) {
                    return _buildSubmissionCard(submissions[index], service);
                  },
                ),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stack) => Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text('Error: $error'),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => ref.invalidate(userCostSubmissionsProvider),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFilterChips(CostSubmissionStatus? selectedStatus) {
    final hasOfflineSubmissionsAsync = ref.watch(hasOfflineSubmissionsProvider);
    final syncStateAsync = ref.watch(syncOfflineSubmissionsProvider);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _buildFilterChip(
                  label: 'All',
                  isSelected: selectedStatus == null,
                  onSelected: () {
                    ref.read(selectedStatusFilterProvider.notifier).state = null;
                  },
                ),
                const SizedBox(width: 8),
                _buildFilterChip(
                  label: 'Pending',
                  isSelected: selectedStatus == CostSubmissionStatus.pending,
                  color: const Color(0xFFFF9800),
                  onSelected: () {
                    ref.read(selectedStatusFilterProvider.notifier).state =
                        CostSubmissionStatus.pending;
                  },
                ),
                const SizedBox(width: 8),
                _buildFilterChip(
                  label: 'Approved',
                  isSelected: selectedStatus == CostSubmissionStatus.approved,
                  color: const Color(0xFF2196F3),
                  onSelected: () {
                    ref.read(selectedStatusFilterProvider.notifier).state =
                        CostSubmissionStatus.approved;
                  },
                ),
                const SizedBox(width: 8),
                _buildFilterChip(
                  label: 'Paid',
                  isSelected: selectedStatus == CostSubmissionStatus.paid,
                  color: const Color(0xFF4CAF50),
                  onSelected: () {
                    ref.read(selectedStatusFilterProvider.notifier).state =
                        CostSubmissionStatus.paid;
                  },
                ),
                const SizedBox(width: 8),
                _buildFilterChip(
                  label: 'Rejected',
                  isSelected: selectedStatus == CostSubmissionStatus.rejected,
                  color: const Color(0xFFF44336),
                  onSelected: () {
                    ref.read(selectedStatusFilterProvider.notifier).state =
                        CostSubmissionStatus.rejected;
                  },
                ),
              ],
            ),
          ),
          // Offline sync section
          hasOfflineSubmissionsAsync.when(
            data: (hasOffline) => hasOffline ? Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  const Icon(Icons.sync, size: 16, color: Colors.orange),
                  const SizedBox(width: 8),
                  const Text(
                    'Offline submissions pending sync',
                    style: TextStyle(color: Colors.orange, fontSize: 12),
                  ),
                  const Spacer(),
                  syncStateAsync.when(
                    data: (syncedCount) => syncedCount > 0 ? Text(
                      '$syncedCount synced',
                      style: const TextStyle(color: Colors.green, fontSize: 12),
                    ) : const SizedBox.shrink(),
                    loading: () => const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    error: (error, stack) => Text(
                      'Sync failed',
                      style: const TextStyle(color: Colors.red, fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: syncStateAsync.isLoading ? null : () async {
                      try {
                        await ref.read(syncOfflineSubmissionsProvider.notifier).syncOfflineSubmissions();
                      } catch (e) {
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Sync failed: $e')),
                          );
                        }
                      }
                    },
                    icon: const Icon(Icons.sync, size: 16),
                    label: const Text('Sync Now'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      textStyle: const TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ) : const SizedBox.shrink(),
            loading: () => const SizedBox.shrink(),
            error: (error, stack) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip({
    required String label,
    required bool isSelected,
    Color? color,
    required VoidCallback onSelected,
  }) {
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onSelected(),
      backgroundColor: Colors.grey[200],
      selectedColor: color ?? const Color(0xFF1976D2),
      labelStyle: TextStyle(
        color: isSelected ? Colors.white : Colors.black87,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }

  Widget _buildSubmissionCard(CostSubmission submission, CostSubmissionService service) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => CostSubmissionDetailsScreen(
                submissionId: submission.id,
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Site Visit: ${submission.siteVisitId}',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          service.formatDateTime(submission.submittedAt),
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _buildStatusBadge(submission.status, service),
                ],
              ),
              const Divider(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Total',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 14,
                    ),
                  ),
                  Text(
                    service.formatCurrencyWithSymbol(
                      submission.totalCostCents,
                      currency: submission.currency,
                    ),
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: Color(0xFF1976D2),
                    ),
                  ),
                ],
              ),
              if (submission.submissionNotes != null) ...[
                const SizedBox(height: 12),
                Text(
                  submission.submissionNotes!,
                  style: TextStyle(
                    color: Colors.grey[700],
                    fontSize: 13,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  if (submission.supportingDocuments.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.blue[50],
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.attach_file, size: 14, color: Colors.blue[700]),
                          const SizedBox(width: 4),
                          Text(
                            '${submission.supportingDocuments.length}',
                            style: TextStyle(
                              color: Colors.blue[700],
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const Spacer(),
                  Icon(Icons.chevron_right, color: Colors.grey[400]),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(CostSubmissionStatus status, CostSubmissionService service) {
    Color color;
    switch (status) {
      case CostSubmissionStatus.pending:
      case CostSubmissionStatus.underReview:
        color = const Color(0xFFFF9800);
        break;
      case CostSubmissionStatus.approved:
        color = const Color(0xFF2196F3);
        break;
      case CostSubmissionStatus.paid:
        color = const Color(0xFF4CAF50);
        break;
      case CostSubmissionStatus.rejected:
        color = const Color(0xFFF44336);
        break;
      case CostSubmissionStatus.cancelled:
        color = Colors.grey;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        status.toString().split('.').last.toUpperCase(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.receipt_long, size: 80, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'No Cost Submissions',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Submit your site visit costs to get reimbursed',
            style: TextStyle(color: Colors.grey[500]),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () async {
              final result = await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const CostSubmissionFormScreen(),
                ),
              );
              if (result == true) {
                ref.invalidate(userCostSubmissionsProvider);
              }
            },
            icon: const Icon(Icons.add),
            label: const Text('Submit Costs'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1976D2),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }
}
