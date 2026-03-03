/// Team Submissions tab for Cost Submission screen.
///
/// Shows submissions from team members in the same hub, with status filters,
/// counts, refresh/export, and approval actions (Approve T1/T2/T3, Reject).
/// Keeps Cost Submission screen slim by housing all Team-tab UI here.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/cost_submission.dart';
import '../../providers/cost_submission_provider.dart';
import '../../providers/profile_provider.dart';
import '../../services/cost_submission_service.dart';
import '../../utils/cost_submission_export.dart';
import '../cost_approval_widgets.dart';

const String _filterAll = 'all';
const List<String> _statusFilters = [
  _filterAll,
  'pending',
  'under_review',
  'approved',
  'rejected',
  'paid',
  'reconciled',
];

class TeamSubmissionsTab extends ConsumerStatefulWidget {
  final String? hubId;
  final String userRole;
  final bool isArabic;
  final CostSubmissionService costService;
  final void Function(String message) onError;
  final void Function(String message) onSuccess;

  const TeamSubmissionsTab({
    super.key,
    required this.hubId,
    required this.userRole,
    required this.isArabic,
    required this.costService,
    required this.onError,
    required this.onSuccess,
  });

  @override
  ConsumerState<TeamSubmissionsTab> createState() => _TeamSubmissionsTabState();
}

class _TeamSubmissionsTabState extends ConsumerState<TeamSubmissionsTab> {
  String _statusFilter = _filterAll;

  List<OperationalCostSubmission> _filterByStatus(
    List<OperationalCostSubmission> list,
  ) {
    if (_statusFilter == _filterAll) return list;
    return list.where((s) => s.derivedStatus == _statusFilter).toList();
  }

  Map<String, int> _countByStatus(List<OperationalCostSubmission> list) {
    final counts = <String, int>{};
    for (final f in _statusFilters) {
      if (f == _filterAll) {
        counts[f] = list.length;
      } else {
        counts[f] = list.where((s) => s.derivedStatus == f).length;
      }
    }
    return counts;
  }

  /// Which tier is currently pending for this submission (1, 2, or 3).
  int? _pendingTier(OperationalCostSubmission s) {
    if (s.tier1Status == 'pending') return 1;
    if (s.tier1Status == 'approved' && s.tier2Status == 'pending') return 2;
    if (s.tier1Status == 'approved' &&
        s.tier2Status == 'approved' &&
        s.tier3Status == 'pending') {
      return 3;
    }
    return null;
  }

  Future<void> _handleApproveReject(
    String submissionId,
    bool approved,
    String? notes,
    int tier,
    String hubId,
  ) async {
    final ok = approved
        ? await widget.costService.approveSubmission(
            submissionId: submissionId,
            tier: tier,
            notes: notes,
          )
        : await widget.costService.rejectSubmission(
            submissionId: submissionId,
            tier: tier,
            notes: notes ?? '',
          );
    if (!mounted) return;
    if (ok) {
      ref.invalidate(teamSubmissionsProvider(hubId));
      widget.onSuccess(widget.isArabic ? 'تم التحديث' : 'Updated');
    } else {
      widget.onError(widget.isArabic ? 'فشل في التحديث' : 'Update failed');
    }
  }

  Future<void> _handleExport(bool toExcel, String hubId) async {
    final async = ref.read(teamSubmissionsProvider(hubId));
    final list = async.valueOrNull ?? <OperationalCostSubmission>[];
    final filtered = _filterByStatus(list);
    if (filtered.isEmpty) {
      widget.onError(
        widget.isArabic ? 'لا يوجد شيء للتصدير' : 'Nothing to export',
      );
      return;
    }
    try {
      if (toExcel) {
        await exportCostSubmissionsToExcel(filtered);
      } else {
        await exportCostSubmissionsToPDF(filtered);
      }
      if (mounted) {
        widget.onSuccess(widget.isArabic ? 'تم التصدير' : 'Exported');
      }
    } catch (e) {
      if (mounted) widget.onError(e.toString());
    }
  }

  String _statusLabel(String value) {
    if (value == _filterAll) return widget.isArabic ? 'الكل' : 'All';
    switch (value) {
      case 'pending':
        return widget.isArabic ? 'قيد الانتظار' : 'Pending';
      case 'under_review':
        return widget.isArabic ? 'قيد المراجعة' : 'In Review';
      case 'approved':
        return widget.isArabic ? 'موافق عليه' : 'Approved';
      case 'rejected':
        return widget.isArabic ? 'مرفوض' : 'Rejected';
      case 'paid':
        return widget.isArabic ? 'مدفوع' : 'Paid';
      case 'reconciled':
        return widget.isArabic ? 'تمت التسوية' : 'Reconciled';
      default:
        return value;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Use passed hubId or fall back to current user's profile hub (e.g. when opened from drawer).
    final profile = ref.watch(currentUserProfileProvider);
    final hubId = widget.hubId?.isNotEmpty == true
        ? widget.hubId
        : profile?.hubId;
    if (hubId == null || hubId.isEmpty) {
      return _buildEmptyState(
        icon: Icons.group_off,
        title: widget.isArabic ? 'لا يوجد hub' : 'No hub',
        subtitle: widget.isArabic
            ? 'يجب تحديد hub لعرض طلبات الفريق'
            : 'Select a hub to view team submissions',
      );
    }

    final async = ref.watch(teamSubmissionsProvider(hubId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => _buildEmptyState(
        icon: Icons.error_outline,
        title: widget.isArabic ? 'خطأ' : 'Error',
        subtitle: err.toString(),
      ),
      data: (list) {
        final counts = _countByStatus(list);
        final filtered = _filterByStatus(list);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(),
            _buildFilterChips(counts),
            _buildToolbar(hubId),
            Expanded(
              child: filtered.isEmpty
                  ? _buildEmptyState(
                      icon: Icons.inbox,
                      title: widget.isArabic
                          ? 'لا توجد طلبات'
                          : 'No submissions',
                      subtitle: widget.isArabic
                          ? 'لا توجد طلبات لهذه الحالة'
                          : 'No submissions for this status',
                    )
                  : RefreshIndicator(
                      onRefresh: () async {
                        ref.refresh(teamSubmissionsProvider(hubId));
                      },
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final s = filtered[index];
                          final tier = _pendingTier(s) ?? 3;
                          final canAct = _pendingTier(s) != null;
                          return CostApprovalCard(
                            submission: s,
                            approvalTier: tier,
                            isArabic: widget.isArabic,
                            onAction: canAct
                                ? (id, approved, notes) => _handleApproveReject(
                                    id,
                                    approved,
                                    notes,
                                    tier,
                                    hubId,
                                  )
                                : null,
                          );
                        },
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.group, color: Theme.of(context).primaryColor),
              const SizedBox(width: 8),
              Text(
                widget.isArabic ? 'طلبات الفريق' : 'Team Submissions',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            widget.isArabic
                ? 'مراجعة طلبات التكاليف من أعضاء الفريق. التحقق وإرسالها للموافقة.'
                : 'Review cost submissions from your team members. Verify and forward for admin approval.',
            style: TextStyle(fontSize: 13, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips(Map<String, int> counts) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: _statusFilters.map((value) {
          final count = counts[value] ?? 0;
          final selected = _statusFilter == value;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text('${_statusLabel(value)} ($count)'),
              selected: selected,
              onSelected: (_) => setState(() => _statusFilter = value),
              selectedColor: Theme.of(context).primaryColor.withOpacity(0.3),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildToolbar(String hubId) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          TextButton.icon(
            onPressed: () => ref.refresh(teamSubmissionsProvider(hubId)),
            icon: const Icon(Icons.refresh, size: 20),
            label: Text(widget.isArabic ? 'تحديث' : 'Refresh'),
          ),
          const SizedBox(width: 8),
          PopupMenuButton<bool>(
            icon: const Icon(Icons.download),
            tooltip: widget.isArabic ? 'تصدير' : 'Export',
            onSelected: (toExcel) => _handleExport(toExcel, hubId),
            itemBuilder: (context) => [
              PopupMenuItem(
                value: true,
                child: Row(
                  children: [
                    const Icon(Icons.table_chart),
                    const SizedBox(width: 8),
                    Text(widget.isArabic ? 'إكسل' : 'Excel'),
                  ],
                ),
              ),
              PopupMenuItem(
                value: false,
                child: Row(
                  children: [
                    const Icon(Icons.picture_as_pdf),
                    const SizedBox(width: 8),
                    const Text('PDF'),
                  ],
                ),
              ),
            ],
          ),
        ],
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
}
