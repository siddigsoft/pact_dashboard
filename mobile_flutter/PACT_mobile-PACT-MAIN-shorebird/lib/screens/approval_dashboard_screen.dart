import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pact_mobile/providers/cost_submission_provider.dart';
import 'package:pact_mobile/providers/withdrawal_provider.dart';
import 'package:pact_mobile/models/cost_submission_models.dart';
import 'package:pact_mobile/models/wallet_models.dart';
import 'package:pact_mobile/theme/app_colors.dart';
import 'package:intl/intl.dart';

class ApprovalDashboardScreen extends ConsumerStatefulWidget {
  const ApprovalDashboardScreen({super.key});

  @override
  ConsumerState<ApprovalDashboardScreen> createState() =>
      _ApprovalDashboardScreenState();
}

class _ApprovalDashboardScreenState
    extends ConsumerState<ApprovalDashboardScreen> {
  String _activeTab = 'cost_submissions';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
        title: Text(
          'لوحة الموافقات | Approval Dashboard',
          style: GoogleFonts.poppins(
              color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
        ),
        elevation: 0,
      ),
      body: SafeArea(
        top: false,
        child: Column(
        children: [
          // ── Bilingual tab row ──────────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: _buildTabButton(
                    'cost_submissions',
                    'Cost Submissions',
                    'تقديمات التكاليف',
                    Icons.receipt_long_rounded,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildTabButton(
                    'withdrawal_requests',
                    'Withdrawal Requests',
                    'طلبات السحب',
                    Icons.account_balance_wallet_rounded,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          // ── Tab content ────────────────────────────────────────────
          Expanded(
            child: _activeTab == 'cost_submissions'
                ? _CostSubmissionsTab()
                : _WithdrawalRequestsTab(),
          ),
        ],
      )
      ),
    );
  }

  Widget _buildTabButton(
      String tab, String labelEn, String labelAr, IconData icon) {
    final isActive = _activeTab == tab;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = tab),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? AppColors.primaryBlue : const Color(0xFFF3F6FA),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 20,
                color: isActive ? Colors.white : AppColors.textLight),
            const SizedBox(height: 3),
            Text(
              labelEn,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isActive ? Colors.white : AppColors.textLight,
              ),
              textAlign: TextAlign.center,
            ),
            Text(
              labelAr,
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: isActive
                    ? Colors.white.withValues(alpha: 0.85)
                    : AppColors.textLight,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _CostSubmissionsTab extends ConsumerStatefulWidget {
  @override
  ConsumerState<_CostSubmissionsTab> createState() =>
      _CostSubmissionsTabState();
}

class _CostSubmissionsTabState extends ConsumerState<_CostSubmissionsTab> {
  static const int _pageSize = 10;
  int _currentPage = 0;
  final bool _isLoadingMore = false;
  List<CostSubmission> _allSubmissions = [];
  List<CostSubmission> _currentPageSubmissions = [];
  bool _hasMorePages = true;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    final costSubmissionsAsync = ref.read(pendingCostSubmissionsProvider);
    costSubmissionsAsync.whenData((submissions) {
      setState(() {
        _allSubmissions = submissions;
        _loadPage(0);
      });
    });
  }

  void _loadPage(int page) {
    final startIndex = page * _pageSize;
    final endIndex = startIndex + _pageSize;

    setState(() {
      _currentPage = page;
      if (startIndex < _allSubmissions.length) {
        _currentPageSubmissions = _allSubmissions.sublist(
          startIndex,
          endIndex > _allSubmissions.length ? _allSubmissions.length : endIndex,
        );
        _hasMorePages = endIndex < _allSubmissions.length;
      } else {
        _currentPageSubmissions = [];
        _hasMorePages = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final costSubmissionsAsync = ref.watch(pendingCostSubmissionsProvider);

    return costSubmissionsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) =>
          Center(child: Text('Error loading cost submissions: $error')),
      data: (submissions) {
        // Update data if it changed
        if (_allSubmissions.length != submissions.length) {
          _allSubmissions = submissions;
          _loadPage(0);
        }

        if (_allSubmissions.isEmpty) {
          return const Center(child: Text('No pending cost submissions'));
        }

        return Column(
          children: [
            // Results info
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Showing ${_currentPageSubmissions.length} of ${_allSubmissions.length} submissions',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  Text(
                    'Page ${_currentPage + 1} of ${(_allSubmissions.length / _pageSize).ceil()}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),

            // Submissions list
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _currentPageSubmissions.length,
                itemBuilder: (context, index) {
                  final submission = _currentPageSubmissions[index];
                  return _CostSubmissionCard(submission: submission);
                },
              ),
            ),

            // Pagination controls
            if (_allSubmissions.length > _pageSize)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  border: Border(
                    top: BorderSide(color: Theme.of(context).dividerColor),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: _currentPage > 0
                          ? () => _loadPage(_currentPage - 1)
                          : null,
                      icon: const Icon(Icons.chevron_left),
                      tooltip: 'Previous page',
                    ),
                    const SizedBox(width: 16),
                    Text(
                      '${_currentPage + 1} / ${(_allSubmissions.length / _pageSize).ceil()}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(width: 16),
                    IconButton(
                      onPressed: _hasMorePages
                          ? () => _loadPage(_currentPage + 1)
                          : null,
                      icon: const Icon(Icons.chevron_right),
                      tooltip: 'Next page',
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CostSubmissionCard extends ConsumerStatefulWidget {
  final CostSubmission submission;

  const _CostSubmissionCard({required this.submission});

  @override
  ConsumerState<_CostSubmissionCard> createState() =>
      _CostSubmissionCardState();
}

class _CostSubmissionCardState extends ConsumerState<_CostSubmissionCard> {
  CostSubmission get submission => widget.submission;

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(
      symbol: 'SDG ',
      decimalDigits: 2,
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Site Visit: ${submission.siteVisitName ?? 'Unknown'}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                _StatusChip(status: submission.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Submitted by: ${submission.submitterName ?? 'Unknown'}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            Text(
              'Date: ${DateFormat('MMM dd, yyyy').format(submission.createdAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            _buildCostBreakdown(currencyFormat),
            const SizedBox(height: 12),
            if (submission.notes?.isNotEmpty ?? false) ...[
              Text(
                'Notes: ${submission.notes}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => _showDetailsDialog(context),
                  child: const Text('View Details'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: submission.status == CostSubmissionStatus.pending
                      ? () => _showApprovalDialog(context, true)
                      : null,
                  child: const Text('Approve'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: submission.status == CostSubmissionStatus.pending
                      ? () => _showApprovalDialog(context, false)
                      : null,
                  child: const Text('Reject'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCostBreakdown(NumberFormat currencyFormat) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (submission.transportationCost != null)
          Text(
            'Transportation: ${currencyFormat.format(submission.transportationCost! / 100)}',
          ),
        if (submission.accommodationCost != null)
          Text(
            'Accommodation: ${currencyFormat.format(submission.accommodationCost! / 100)}',
          ),
        if (submission.mealAllowance != null)
          Text(
            'Meals: ${currencyFormat.format(submission.mealAllowance! / 100)}',
          ),
        if (submission.otherCosts != null)
          Text('Other: ${currencyFormat.format(submission.otherCosts! / 100)}'),
        const Divider(),
        Text(
          'Total: ${currencyFormat.format(submission.totalCost / 100)}',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  void _showDetailsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cost Submission Details'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Reference: ${submission.referenceId}'),
              Text('Site Visit: ${submission.siteVisitName ?? 'Unknown'}'),
              Text(
                'Submitted: ${DateFormat('MMM dd, yyyy HH:mm').format(submission.createdAt)}',
              ),
              if (submission.documents?.isNotEmpty ?? false) ...[
                const SizedBox(height: 8),
                const Text(
                  'Documents:',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                ...submission.documents!.map(
                  (doc) => Text('• ${doc.fileName}'),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showApprovalDialog(BuildContext context, bool approve) {
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          approve ? 'Approve Cost Submission' : 'Reject Cost Submission',
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              approve
                  ? 'Are you sure you want to approve this cost submission?'
                  : 'Are you sure you want to reject this cost submission?',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await _processApproval(approve, controller.text);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: approve ? Colors.green : Colors.red,
            ),
            child: Text(approve ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
  }

  Future<void> _processApproval(bool approve, String notes) async {
    try {
      final notifier = ref.read(costSubmissionApprovalProvider.notifier);
      await notifier.approveCostSubmission(
        submissionId: submission.id,
        approve: approve,
        reviewerNotes: notes.isNotEmpty ? notes : null,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              approve ? 'Cost submission approved' : 'Cost submission rejected',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }
}

class _WithdrawalRequestsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final withdrawalRequestsAsync = ref.watch(
      pendingWithdrawalRequestsProvider,
    );

    return withdrawalRequestsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) =>
          Center(child: Text('Error loading withdrawal requests: $error')),
      data: (requests) {
        if (requests.isEmpty) {
          return const Center(child: Text('No pending withdrawal requests'));
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: requests.length,
          itemBuilder: (context, index) {
            final request = requests[index];
            return _WithdrawalRequestCard(request: request);
          },
        );
      },
    );
  }
}

class _WithdrawalRequestCard extends ConsumerStatefulWidget {
  final WithdrawalRequest request;

  const _WithdrawalRequestCard({required this.request});

  @override
  ConsumerState<_WithdrawalRequestCard> createState() =>
      _WithdrawalRequestCardState();
}

class _WithdrawalRequestCardState
    extends ConsumerState<_WithdrawalRequestCard> {
  WithdrawalRequest get request => widget.request;

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(
      symbol: 'SDG ',
      decimalDigits: 2,
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Withdrawal Request',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                _WithdrawalStatusChip(status: request.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Requested by: ${request.requesterName ?? 'Unknown'}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            Text(
              'Amount: ${currencyFormat.format(request.amount)}',
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            Text(
              'Payment Method: ${request.paymentMethod?.displayName ?? 'Not specified'}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            Text(
              'Date: ${DateFormat('MMM dd, yyyy').format(request.createdAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (request.notes?.isNotEmpty ?? false) ...[
              const SizedBox(height: 8),
              Text(
                'Notes: ${request.notes}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => _showDetailsDialog(context),
                  child: const Text('View Details'),
                ),
                const SizedBox(width: 8),
                if (request.status == WithdrawalStatus.pending) ...[
                  ElevatedButton(
                    onPressed: () => _showApprovalDialog(context, true),
                    child: const Text('Approve'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () => _showApprovalDialog(context, false),
                    child: const Text('Reject'),
                  ),
                ] else if (request.status ==
                    WithdrawalStatus.supervisorApproved) ...[
                  ElevatedButton(
                    onPressed: () => _showFinalApprovalDialog(context, true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                    ),
                    child: const Text('Final Approve'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () => _showFinalApprovalDialog(context, false),
                    child: const Text('Final Reject'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showDetailsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Withdrawal Request Details'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Reference: ${request.referenceId ?? 'N/A'}'),
              Text('Amount: SDG ${request.amount}'),
              Text(
                'Payment Method: ${request.paymentMethod?.displayName ?? 'Not specified'}',
              ),
              if (request.paymentMethodDetails?.isNotEmpty ?? false)
                Text('Details: ${request.paymentMethodDetails}'),
              Text(
                'Requested: ${DateFormat('MMM dd, yyyy HH:mm').format(request.createdAt)}',
              ),
              if (request.supervisorApprovedAt != null)
                Text(
                  'Supervisor Approved: ${DateFormat('MMM dd, yyyy HH:mm').format(request.supervisorApprovedAt!)}',
                ),
              if (request.approvedAt != null)
                Text(
                  'Final Approved: ${DateFormat('MMM dd, yyyy HH:mm').format(request.approvedAt!)}',
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showApprovalDialog(BuildContext context, bool approve) {
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(approve ? 'Supervisor Approve' : 'Supervisor Reject'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              approve
                  ? 'Approve this withdrawal request as supervisor?'
                  : 'Reject this withdrawal request as supervisor?',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await _processSupervisorApproval(approve, controller.text);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: approve ? Colors.green : Colors.red,
            ),
            child: Text(approve ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
  }

  void _showFinalApprovalDialog(BuildContext context, bool approve) {
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          approve ? 'Final Approve Withdrawal' : 'Final Reject Withdrawal',
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              approve
                  ? 'Final approval will process the withdrawal payment.'
                  : 'Final rejection will cancel the withdrawal request.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await _processFinalApproval(approve, controller.text);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: approve ? Colors.green : Colors.red,
            ),
            child: Text(approve ? 'Final Approve' : 'Final Reject'),
          ),
        ],
      ),
    );
  }

  Future<void> _processSupervisorApproval(bool approve, String notes) async {
    try {
      final notifier = ref.read(withdrawalApprovalProvider.notifier);
      await notifier.supervisorApproveWithdrawal(
        requestId: request.id,
        approve: approve,
        notes: notes.isNotEmpty ? notes : null,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              approve
                  ? 'Supervisor approved withdrawal request'
                  : 'Supervisor rejected withdrawal request',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  Future<void> _processFinalApproval(bool approve, String notes) async {
    try {
      final notifier = ref.read(withdrawalApprovalProvider.notifier);
      await notifier.finalApproveWithdrawal(
        requestId: request.id,
        approve: approve,
        notes: notes.isNotEmpty ? notes : null,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              approve
                  ? 'Final approved withdrawal request'
                  : 'Final rejected withdrawal request',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }
}

class _StatusChip extends StatelessWidget {
  final CostSubmissionStatus status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;

    switch (status) {
      case CostSubmissionStatus.pending:
        color = Colors.orange;
        label = 'Pending';
        break;
      case CostSubmissionStatus.approved:
        color = Colors.green;
        label = 'Approved';
        break;
      case CostSubmissionStatus.rejected:
        color = Colors.red;
        label = 'Rejected';
        break;
      case CostSubmissionStatus.paid:
        color = Colors.blue;
        label = 'Paid';
        break;
    }

    return Chip(
      label: Text(label, style: const TextStyle(color: Colors.white)),
      backgroundColor: color,
    );
  }
}

class _WithdrawalStatusChip extends StatelessWidget {
  final WithdrawalStatus status;

  const _WithdrawalStatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;

    switch (status) {
      case WithdrawalStatus.pending:
        color = Colors.orange;
        label = 'Pending';
        break;
      case WithdrawalStatus.supervisorApproved:
        color = Colors.blue;
        label = 'Supervisor Approved';
        break;
      case WithdrawalStatus.approved:
        color = Colors.green;
        label = 'Approved';
        break;
      case WithdrawalStatus.rejected:
        color = Colors.red;
        label = 'Rejected';
        break;
      case WithdrawalStatus.processed:
        color = Colors.purple;
        label = 'Processed';
        break;
    }

    return Chip(
      label: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
      backgroundColor: color,
    );
  }
}
