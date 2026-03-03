import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:pact_mobile/providers/cost_submission_provider.dart';
import 'package:pact_mobile/providers/withdrawal_provider.dart';
import 'package:pact_mobile/models/cost_submission.dart' as ops;
import 'package:pact_mobile/models/wallet_models.dart';
import 'package:pact_mobile/theme/app_colors.dart';
import 'package:pact_mobile/widgets/reusable_app_bar.dart';
import 'package:pact_mobile/widgets/custom_drawer_menu.dart';
import 'package:intl/intl.dart';

class ApprovalDashboardScreen extends ConsumerStatefulWidget {
  const ApprovalDashboardScreen({super.key});

  @override
  ConsumerState<ApprovalDashboardScreen> createState() =>
      _ApprovalDashboardScreenState();
}

class _ApprovalDashboardScreenState
    extends ConsumerState<ApprovalDashboardScreen>
    with SingleTickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: CustomDrawerMenu(
        currentUser: Supabase.instance.client.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Approval Dashboard',
              scaffoldKey: _scaffoldKey,
            ),
            Material(
              color: AppColors.primaryBlue,
              child: TabBar(
                controller: _tabController,
                labelColor: Colors.white,
                unselectedLabelColor: Colors.white70,
                indicatorColor: Colors.white,
                tabs: const [
                  Tab(text: 'Cost Submissions'),
                  Tab(text: 'Withdrawal Requests'),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [_CostSubmissionsTab(), _WithdrawalRequestsTab()],
              ),
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
  List<ops.OperationalCostSubmission> _allSubmissions = [];
  List<ops.OperationalCostSubmission> _currentPageSubmissions = [];
  bool _hasMorePages = true;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    final costSubmissionsAsync = ref.read(
      operationalPendingSubmissionsProvider,
    );
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
    final costSubmissionsAsync = ref.watch(
      operationalPendingSubmissionsProvider,
    );

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
  final ops.OperationalCostSubmission submission;

  const _CostSubmissionCard({required this.submission});

  @override
  ConsumerState<_CostSubmissionCard> createState() =>
      _CostSubmissionCardState();
}

class _CostSubmissionCardState extends ConsumerState<_CostSubmissionCard> {
  ops.OperationalCostSubmission get submission => widget.submission;

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(
      symbol: 'SDG ',
      decimalDigits: 2,
    );
    final isPending = submission.tier1Status == 'pending';

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
                    submission.description ?? 'Submission',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                _StatusChip(status: submission.status),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Submitted by: ${submission.submittedBy}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            Text(
              'Date: ${submission.createdAt}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Text(
              'Amount: ${currencyFormat.format(submission.amountCents / 100)} ${submission.currency}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            if (submission.description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Notes: ${submission.description}',
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
                ElevatedButton(
                  onPressed: isPending
                      ? () => _showApprovalDialog(context, true)
                      : null,
                  child: const Text('Approve'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: isPending
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
              if (submission.referenceNumber != null)
                Text('Reference: ${submission.referenceNumber}'),
              Text('Description: ${submission.description ?? '-'}'),
              Text('Submitted: ${submission.createdAt}'),
              Text(
                'Amount: ${submission.amountCents / 100} ${submission.currency}',
              ),
              if (submission.supportingDocuments.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text(
                  'Documents:',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                ...submission.supportingDocuments.map(
                  (doc) => Text('• ${doc.filename}'),
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
              decoration: InputDecoration(
                labelText: approve ? 'Notes (optional)' : 'Reason (required)',
                border: const OutlineInputBorder(),
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
              if (!approve && controller.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Please enter a rejection reason'),
                  ),
                );
                return;
              }
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
      final service = ref.read(costSubmissionServiceProvider);
      if (approve) {
        await service.approveSubmission(
          submissionId: submission.id,
          tier: 1,
          notes: notes.isEmpty ? null : notes,
        );
      } else {
        await service.rejectSubmission(
          submissionId: submission.id,
          tier: 1,
          notes: notes.isEmpty ? 'Rejected by supervisor' : notes,
        );
      }
      ref.invalidate(operationalPendingSubmissionsProvider);
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
  final ops.CostSubmissionStatus status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;

    switch (status) {
      case ops.CostSubmissionStatus.pending:
        color = Colors.orange;
        label = 'Pending';
        break;
      case ops.CostSubmissionStatus.underReview:
        color = Colors.amber;
        label = 'Under Review';
        break;
      case ops.CostSubmissionStatus.approved:
        color = Colors.green;
        label = 'Approved';
        break;
      case ops.CostSubmissionStatus.rejected:
        color = Colors.red;
        label = 'Rejected';
        break;
      case ops.CostSubmissionStatus.paid:
        color = Colors.blue;
        label = 'Paid';
        break;
      case ops.CostSubmissionStatus.cancelled:
        color = Colors.grey;
        label = 'Cancelled';
        break;
      case ops.CostSubmissionStatus.disbursed:
      case ops.CostSubmissionStatus.reconciliationPending:
      case ops.CostSubmissionStatus.reconciled:
      case ops.CostSubmissionStatus.closed:
        color = Colors.blue;
        label = status.value;
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
      case WithdrawalStatus.processing:
        color = Colors.indigo;
        label = 'Processing';
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
      case WithdrawalStatus.cancelled:
        color = Colors.grey;
        label = 'Cancelled';
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
