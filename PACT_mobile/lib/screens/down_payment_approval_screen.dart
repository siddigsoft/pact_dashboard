import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/down_payment_request.dart';
import '../providers/auth_provider.dart';
import '../providers/down_payment_provider.dart';
import '../providers/profile_provider.dart';
import '../theme/app_colors.dart';
import '../utils/down_payment_export.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/custom_drawer_menu.dart';

/// Down-Payment Approval screen for supervisors and admins.
/// Stats, filters, refresh, export, status tabs (Pending/Processing/Completed/All), approve/reject.
class DownPaymentApprovalScreen extends ConsumerStatefulWidget {
  const DownPaymentApprovalScreen({super.key});

  @override
  ConsumerState<DownPaymentApprovalScreen> createState() =>
      _DownPaymentApprovalScreenState();
}

class _DownPaymentApprovalScreenState
    extends ConsumerState<DownPaymentApprovalScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final _notesController = TextEditingController();
  final _searchController = TextEditingController();

  /// 0 = Tier 1 (supervisor queue), 1 = Tier 2 (admin queue)
  int _tierIndex = 0;
  bool _showFilters = false;
  DownPaymentFilter _filters = const DownPaymentFilter();

  /// 'pending' | 'processing' | 'completed' | 'all'
  String _activeTab = 'pending';
  final _amountMinController = TextEditingController();
  final _amountMaxController = TextEditingController();

  @override
  void dispose() {
    _notesController.dispose();
    _searchController.dispose();
    _amountMinController.dispose();
    _amountMaxController.dispose();
    super.dispose();
  }

  void _resetFilters() {
    setState(() {
      _filters = const DownPaymentFilter();
      _searchController.clear();
      _amountMinController.clear();
      _amountMaxController.clear();
    });
  }

  DownPaymentFilter get _effectiveFilter => DownPaymentFilter(
    searchTerm: _searchController.text.trim().isEmpty
        ? null
        : _searchController.text.trim(),
    hubId: _filters.hubId,
    dateFrom: _filters.dateFrom,
    dateTo: _filters.dateTo,
    amountMin: _amountMinController.text.trim().isEmpty
        ? null
        : double.tryParse(_amountMinController.text.trim()),
    amountMax: _amountMaxController.text.trim().isEmpty
        ? null
        : double.tryParse(_amountMaxController.text.trim()),
  );

  bool _canAccess(String? role) {
    if (role == null) return false;
    final r = role.toLowerCase();
    return r.contains('supervisor') ||
        r.contains('hubsupervisor') ||
        r.contains('fom') ||
        r.contains('admin') ||
        r.contains('super_admin') ||
        r.contains('superadmin');
  }

  bool _isAdmin(String? role) {
    if (role == null) return false;
    final r = role.toLowerCase();
    return r.contains('admin') ||
        r.contains('super_admin') ||
        r.contains('superadmin');
  }

  void _refresh(String userId, String? hubId) {
    ref.invalidate(supervisorDownPaymentProvider(userId));
    ref.invalidate(supervisorDownPaymentDashboardProvider((userId, hubId)));
    ref.invalidate(adminDownPaymentProvider);
    ref.invalidate(adminDownPaymentDashboardProvider);
  }

  @override
  Widget build(BuildContext context) {
    final userId = ref.watch(currentUserIdProvider);
    final profileState = ref.watch(profileProvider);
    final profile = profileState.profile;
    final role = profile?.role ?? '';
    final showTierSwitcher = _isAdmin(role);

    if (userId == null) {
      return Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(
                title: 'Down-Payment Approval',
                showBackButton: true,
              ),
              const Expanded(
                child: Center(child: Text('Please sign in to continue')),
              ),
            ],
          ),
        ),
      );
    }

    // Profile may not be loaded yet (e.g. navigated from bottom nav before drawer opened). Load and show loading until we know the role.
    if (profile == null && !profileState.isLoading) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(profileProvider.notifier).loadProfile();
      });
    }
    if (profile == null) {
      return Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(
                title: 'Down-Payment Approval',
                showBackButton: true,
              ),
              const Expanded(child: Center(child: CircularProgressIndicator())),
            ],
          ),
        ),
      );
    }

    if (!_canAccess(role)) {
      return Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              ReusableAppBar(
                title: 'Down-Payment Approval',
                showBackButton: true,
              ),
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.lock_outline,
                          size: 64,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'Access denied',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Only supervisors and administrators can approve down-payment requests.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                        const SizedBox(height: 24),
                        OutlinedButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: const Text('Go back'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final useAdminTier = showTierSwitcher && _tierIndex == 1;
    final dashboardAsync = useAdminTier
        ? ref.watch(adminDownPaymentDashboardProvider)
        : ref.watch(
            supervisorDownPaymentDashboardProvider((userId, profile.hubId)),
          );

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
              title: 'Down-Payment Approval',
              scaffoldKey: _scaffoldKey,
              actions: [
                IconButton(
                  icon: Icon(
                    _showFilters ? Icons.filter_list : Icons.filter_list_off,
                  ),
                  onPressed: () => setState(() => _showFilters = !_showFilters),
                  tooltip: 'Filters',
                ),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.download),
                  tooltip: 'Export',
                  onSelected: (value) => _export(value, userId),
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'csv', child: Text('CSV')),
                    const PopupMenuItem(value: 'excel', child: Text('Excel')),
                    const PopupMenuItem(value: 'pdf', child: Text('PDF')),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: () => _refresh(userId, profile.hubId),
                  tooltip: 'Refresh',
                ),
              ],
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  _refresh(userId, profile.hubId);
                  await Future.delayed(const Duration(milliseconds: 400));
                },
                child: dashboardAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (err, _) => Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Error loading requests: $err',
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          OutlinedButton(
                            onPressed: () {
                              if (useAdminTier) {
                                ref.invalidate(
                                  adminDownPaymentDashboardProvider,
                                );
                              } else {
                                ref.invalidate(
                                  supervisorDownPaymentDashboardProvider((
                                    userId,
                                    profile.hubId,
                                  )),
                                );
                              }
                            },
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  data: (allRequests) {
                    final effectiveFilter = _effectiveFilter;
                    final filteredRequests = filterDownPayments(
                      allRequests,
                      effectiveFilter,
                    );
                    final pendingList = pendingRequestsForRole(
                      filteredRequests,
                      useAdminTier,
                    );
                    final processingList = processingRequestsForRole(
                      filteredRequests,
                      useAdminTier,
                    );
                    final completedList = completedRequestsForRole(
                      filteredRequests,
                    );
                    final List<DownPaymentRequest> tabList;
                    switch (_activeTab) {
                      case 'pending':
                        tabList = pendingList;
                        break;
                      case 'processing':
                        tabList = processingList;
                        break;
                      case 'completed':
                        tabList = completedList;
                        break;
                      default:
                        tabList = filteredRequests;
                    }
                    final pendingStatus = useAdminTier
                        ? 'pending_admin'
                        : 'pending_supervisor';
                    final stats = DownPaymentStats.fromRequests(
                      filteredRequests,
                      pendingStatus: pendingStatus,
                    );
                    final uniqueHubs =
                        allRequests
                            .map((r) => r.hubId ?? r.hubName)
                            .whereType<String>()
                            .where((s) => s.isNotEmpty)
                            .toSet()
                            .toList()
                          ..sort();

                    return CustomScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        if (showTierSwitcher) ...[
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                              child: SegmentedButton<int>(
                                segments: const [
                                  ButtonSegment(
                                    value: 0,
                                    label: Text('My approval'),
                                  ),
                                  ButtonSegment(
                                    value: 1,
                                    label: Text('Admin queue'),
                                  ),
                                ],
                                selected: {_tierIndex},
                                onSelectionChanged: (Set<int> s) {
                                  setState(() => _tierIndex = s.first);
                                },
                              ),
                            ),
                          ),
                        ],
                        SliverToBoxAdapter(child: _StatsCards(stats: stats)),
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                            child: Text(
                              'Review and approve down-payment requests from your team.',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: AppColors.textLight),
                            ),
                          ),
                        ),
                        if (_showFilters)
                          SliverToBoxAdapter(
                            child: _FilterPanel(
                              searchController: _searchController,
                              amountMinController: _amountMinController,
                              amountMaxController: _amountMaxController,
                              filters: _filters,
                              uniqueHubs: uniqueHubs,
                              onFiltersChanged: (f) =>
                                  setState(() => _filters = f),
                              onClear: _resetFilters,
                              onFilterFieldsChanged: () => setState(() {}),
                            ),
                          ),
                        SliverToBoxAdapter(
                          child: _StatusTabs(
                            activeTab: _activeTab,
                            pendingCount: pendingList.length,
                            processingCount: processingList.length,
                            completedCount: completedList.length,
                            allCount: filteredRequests.length,
                            onTabChanged: (tab) =>
                                setState(() => _activeTab = tab),
                          ),
                        ),
                        if (tabList.isEmpty)
                          SliverFillRemaining(
                            child: Center(
                              child: Text(
                                _activeTab == 'pending'
                                    ? 'No pending requests'
                                    : _activeTab == 'processing'
                                    ? 'No processing requests'
                                    : _activeTab == 'completed'
                                    ? 'No completed requests'
                                    : 'No requests',
                              ),
                            ),
                          )
                        else
                          SliverPadding(
                            padding: const EdgeInsets.all(16),
                            sliver: SliverList(
                              delegate: SliverChildBuilderDelegate((
                                context,
                                index,
                              ) {
                                final request = tabList[index];
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: _DownPaymentRequestCard(
                                    request: request,
                                    isAdminTier: useAdminTier,
                                    onApprove: () => useAdminTier
                                        ? _showAdminApproveDialog(
                                            context,
                                            request,
                                            userId,
                                          )
                                        : _showApproveDialog(
                                            context,
                                            request,
                                            userId,
                                          ),
                                    onReject: () => useAdminTier
                                        ? _showAdminRejectDialog(
                                            context,
                                            request,
                                            userId,
                                          )
                                        : _showRejectDialog(
                                            context,
                                            request,
                                            userId,
                                          ),
                                  ),
                                );
                              }, childCount: tabList.length),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _export(String format, String userId) async {
    final useAdminTier =
        _isAdmin(ref.read(profileProvider).profile?.role) && _tierIndex == 1;
    final dashboardAsync = useAdminTier
        ? ref.read(adminDownPaymentDashboardProvider)
        : ref.read(
            supervisorDownPaymentDashboardProvider((
              userId,
              ref.read(profileProvider).profile?.hubId,
            )),
          );
    final allRequests = dashboardAsync.valueOrNull ?? [];
    final filtered = filterDownPayments(allRequests, _effectiveFilter);
    if (filtered.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('No requests to export')));
      }
      return;
    }
    try {
      if (format == 'csv') {
        await exportDownPaymentsToCSV(filtered);
      } else if (format == 'excel') {
        await exportDownPaymentsToExcel(filtered);
      } else {
        await exportDownPaymentsToPDF(filtered);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Exported ${filtered.length} requests')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Export failed: $e')));
      }
    }
  }

  void _showApproveDialog(
    BuildContext context,
    DownPaymentRequest request,
    String supervisorId,
  ) {
    _notesController.clear();
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Approve request'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Site: ${request.siteName}\nAmount: ${request.requestedAmount.toStringAsFixed(0)} SDG',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
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
              await _approve(request.id, supervisorId, _notesController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  void _showRejectDialog(
    BuildContext context,
    DownPaymentRequest request,
    String supervisorId,
  ) {
    _notesController.clear();
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Reject request'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Site: ${request.siteName}\nAmount: ${request.requestedAmount.toStringAsFixed(0)} SDG',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Reason for rejection (required)',
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
              final reason = _notesController.text.trim();
              if (reason.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Please enter a rejection reason'),
                  ),
                );
                return;
              }
              Navigator.of(dialogContext).pop();
              await _reject(request.id, supervisorId, reason);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }

  Future<void> _approve(
    String requestId,
    String supervisorId,
    String notes,
  ) async {
    try {
      final repository = ref.read(walletRepositoryProvider);
      await repository.approveSupervisorDownPaymentRequest(
        requestId: requestId,
        supervisorId: supervisorId,
        notes: notes.isEmpty ? null : notes,
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Request approved')));
        ref.invalidate(supervisorDownPaymentProvider(supervisorId));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  Future<void> _reject(
    String requestId,
    String supervisorId,
    String rejectionReason,
  ) async {
    try {
      final repository = ref.read(walletRepositoryProvider);
      await repository.rejectSupervisorDownPaymentRequest(
        requestId: requestId,
        supervisorId: supervisorId,
        rejectionReason: rejectionReason,
        notes: null,
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Request rejected')));
        ref.invalidate(supervisorDownPaymentProvider(supervisorId));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  void _showAdminApproveDialog(
    BuildContext context,
    DownPaymentRequest request,
    String adminId,
  ) {
    _notesController.clear();
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Approve (Admin)'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Site: ${request.siteName}\nAmount: ${request.requestedAmount.toStringAsFixed(0)} SDG',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
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
              await _approveAdmin(request.id, adminId, _notesController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  void _showAdminRejectDialog(
    BuildContext context,
    DownPaymentRequest request,
    String adminId,
  ) {
    _notesController.clear();
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Reject (Admin)'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Site: ${request.siteName}\nAmount: ${request.requestedAmount.toStringAsFixed(0)} SDG',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Reason for rejection (required)',
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
              final reason = _notesController.text.trim();
              if (reason.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Please enter a rejection reason'),
                  ),
                );
                return;
              }
              Navigator.of(dialogContext).pop();
              await _rejectAdmin(request.id, adminId, reason);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }

  Future<void> _approveAdmin(
    String requestId,
    String adminId,
    String notes,
  ) async {
    try {
      final repository = ref.read(walletRepositoryProvider);
      await repository.approveAdminDownPaymentRequest(
        requestId: requestId,
        adminId: adminId,
        notes: notes.isEmpty ? null : notes,
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Request approved')));
        _refresh(adminId, null);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  Future<void> _rejectAdmin(
    String requestId,
    String adminId,
    String rejectionReason,
  ) async {
    try {
      final repository = ref.read(walletRepositoryProvider);
      await repository.rejectAdminDownPaymentRequest(
        requestId: requestId,
        adminId: adminId,
        rejectionReason: rejectionReason,
        notes: null,
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Request rejected')));
        _refresh(adminId, null);
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

class _FilterPanel extends StatelessWidget {
  final TextEditingController searchController;
  final TextEditingController amountMinController;
  final TextEditingController amountMaxController;
  final DownPaymentFilter filters;
  final List<String> uniqueHubs;
  final ValueChanged<DownPaymentFilter> onFiltersChanged;
  final VoidCallback onClear;
  final VoidCallback? onFilterFieldsChanged;

  const _FilterPanel({
    required this.searchController,
    required this.amountMinController,
    required this.amountMaxController,
    required this.filters,
    required this.uniqueHubs,
    required this.onFiltersChanged,
    required this.onClear,
    this.onFilterFieldsChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Filters', style: Theme.of(context).textTheme.titleSmall),
                TextButton.icon(
                  onPressed: onClear,
                  icon: const Icon(Icons.clear, size: 18),
                  label: const Text('Clear'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: searchController,
              decoration: const InputDecoration(
                labelText: 'Search',
                hintText: 'Site, hub, justification...',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (_) => onFilterFieldsChanged?.call(),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: filters.hubId ?? 'all',
              decoration: const InputDecoration(
                labelText: 'Hub',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                const DropdownMenuItem(value: 'all', child: Text('All Hubs')),
                ...uniqueHubs.map(
                  (h) => DropdownMenuItem(value: h, child: Text(h)),
                ),
              ],
              onChanged: (v) => onFiltersChanged(
                filters.copyWith(hubId: v == 'all' ? null : v),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: filters.dateFrom ?? DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now().add(const Duration(days: 365)),
                      );
                      if (picked != null) {
                        onFiltersChanged(filters.copyWith(dateFrom: picked));
                      }
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Date from',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      child: Text(
                        filters.dateFrom != null
                            ? DateFormat(
                                'MMM dd, yyyy',
                              ).format(filters.dateFrom!)
                            : 'mm/dd/yyyy',
                        style: TextStyle(
                          color: filters.dateFrom != null
                              ? null
                              : Theme.of(context).hintColor,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: filters.dateTo ?? DateTime.now(),
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now().add(const Duration(days: 365)),
                      );
                      if (picked != null) {
                        onFiltersChanged(filters.copyWith(dateTo: picked));
                      }
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Date to',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      child: Text(
                        filters.dateTo != null
                            ? DateFormat('MMM dd, yyyy').format(filters.dateTo!)
                            : 'mm/dd/yyyy',
                        style: TextStyle(
                          color: filters.dateTo != null
                              ? null
                              : Theme.of(context).hintColor,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: amountMinController,
                    decoration: const InputDecoration(
                      labelText: 'Min amount (SDG)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => onFilterFieldsChanged?.call(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: amountMaxController,
                    decoration: const InputDecoration(
                      labelText: 'Max amount (SDG)',
                      hintText: 'No limit',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => onFilterFieldsChanged?.call(),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusTabs extends StatelessWidget {
  final String activeTab;
  final int pendingCount;
  final int processingCount;
  final int completedCount;
  final int allCount;
  final ValueChanged<String> onTabChanged;

  const _StatusTabs({
    required this.activeTab,
    required this.pendingCount,
    required this.processingCount,
    required this.completedCount,
    required this.allCount,
    required this.onTabChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _TabChip(
              label: 'Pending',
              count: pendingCount,
              isSelected: activeTab == 'pending',
              onTap: () => onTabChanged('pending'),
            ),
            const SizedBox(width: 8),
            _TabChip(
              label: 'Processing',
              count: processingCount,
              isSelected: activeTab == 'processing',
              onTap: () => onTabChanged('processing'),
            ),
            const SizedBox(width: 8),
            _TabChip(
              label: 'Completed',
              count: completedCount,
              isSelected: activeTab == 'completed',
              onTap: () => onTabChanged('completed'),
            ),
            const SizedBox(width: 8),
            _TabChip(
              label: 'All',
              count: allCount,
              isSelected: activeTab == 'all',
              onTap: () => onTabChanged('all'),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  final String label;
  final int count;
  final bool isSelected;
  final VoidCallback onTap;

  const _TabChip({
    required this.label,
    required this.count,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text('$label $count'),
      selected: isSelected,
      onSelected: (_) => onTap(),
      showCheckmark: false,
    );
  }
}

class _StatsCards extends StatelessWidget {
  final DownPaymentStats stats;

  const _StatsCards({required this.stats});

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(
      symbol: 'SDG ',
      decimalDigits: 0,
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        children: [
          Expanded(
            child: _StatCard(
              title: 'Total',
              value: '${stats.totalRequests}',
              icon: Icons.receipt_long,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatCard(
              title: 'Pending',
              value: '${stats.pendingCount}',
              icon: Icons.pending_actions,
              color: Colors.orange,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatCard(
              title: 'Paid',
              value: currencyFormat.format(stats.totalPaidSdg),
              icon: Icons.paid,
              color: Colors.green,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatCard(
              title: 'Remaining',
              value: currencyFormat.format(stats.remainingSdg),
              icon: Icons.savings,
              color: AppColors.primaryBlue,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color? color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final themeColor = color ?? AppColors.textDark;
    return Card(
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 20, color: themeColor),
            const SizedBox(height: 4),
            Text(
              value,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: themeColor,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.labelSmall?.copyWith(color: AppColors.textLight),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _DownPaymentRequestCard extends StatelessWidget {
  final DownPaymentRequest request;
  final bool isAdminTier;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const _DownPaymentRequestCard({
    required this.request,
    required this.isAdminTier,
    required this.onApprove,
    required this.onReject,
  });

  bool get _showActions =>
      (!isAdminTier && request.isPendingSupervisor) ||
      (isAdminTier && request.isPendingAdmin);

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(
      symbol: 'SDG ',
      decimalDigits: 0,
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 0),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.siteName.isNotEmpty ? request.siteName : 'Site',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: request.status == 'pending_supervisor'
                        ? Colors.orange.shade100
                        : request.status == 'pending_admin'
                        ? Colors.amber.shade100
                        : Colors.blue.shade100,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    request.status.replaceAll('_', ' '),
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Amount: ${currencyFormat.format(request.requestedAmount)}',
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            if (request.hubName != null && request.hubName!.isNotEmpty)
              Text(
                'Hub: ${request.hubName}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            Text(
              'Requested: ${DateFormat('MMM dd, yyyy').format(request.requestedAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (request.justification.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                request.justification,
                style: Theme.of(context).textTheme.bodySmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            if (_showActions) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(onPressed: onReject, child: const Text('Reject')),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: onApprove,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                    ),
                    child: const Text('Approve'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
