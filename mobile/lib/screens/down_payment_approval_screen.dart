import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
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

String _formatCompactSdg(double amount) {
  final formatter = NumberFormat('#,###');
  if (amount.abs() >= 1000000) {
    return 'SDG ${(amount / 1000000).toStringAsFixed(1)}M';
  }
  if (amount.abs() >= 10000) {
    return 'SDG ${(amount / 1000).toStringAsFixed(0)}K';
  }
  return 'SDG ${formatter.format(amount)}';
}

/// Down-Payment Approval screen for supervisors and admins.
/// Stats, filters, refresh, export, status tabs (Pending/Processing/Completed/All), approve/reject.
/// Thin chrome wrapper — own Scaffold/drawer/app bar for direct navigation
/// (deep links, drawer, "More"). The [DownPaymentApprovalBody] below holds
/// all the actual logic so the same content can also be embedded as a tab
/// in ApprovalDashboardScreen without duplicating it.
class DownPaymentApprovalScreen extends StatefulWidget {
  const DownPaymentApprovalScreen({super.key});

  @override
  State<DownPaymentApprovalScreen> createState() =>
      _DownPaymentApprovalScreenState();
}

class _DownPaymentApprovalScreenState
    extends State<DownPaymentApprovalScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

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
              title: 'Down-Payment Approval',
              scaffoldKey: _scaffoldKey,
            ),
            const Expanded(child: DownPaymentApprovalBody()),
          ],
        ),
      ),
    );
  }
}

/// Reusable body: access gating, filters, stats, status tabs, approve/reject.
/// Used standalone (above) and as a tab inside ApprovalDashboardScreen.
class DownPaymentApprovalBody extends ConsumerStatefulWidget {
  const DownPaymentApprovalBody({super.key});

  @override
  ConsumerState<DownPaymentApprovalBody> createState() =>
      _DownPaymentApprovalBodyState();
}

class _DownPaymentApprovalBodyState
    extends ConsumerState<DownPaymentApprovalBody> {
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
      return const Center(child: Text('Please sign in to continue'));
    }

    // Profile may not be loaded yet (e.g. navigated from bottom nav before drawer opened). Load and show loading until we know the role.
    if (profile == null && !profileState.isLoading) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(profileProvider.notifier).loadProfile();
      });
    }
    if (profile == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (!_canAccess(role)) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              const Text(
                'Access denied',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
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
      );
    }

    final useAdminTier = showTierSwitcher && _tierIndex == 1;
    final dashboardAsync = useAdminTier
        ? ref.watch(adminDownPaymentDashboardProvider)
        : ref.watch(
            supervisorDownPaymentDashboardProvider((userId, profile.hubId)),
          );

    return RefreshIndicator(
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

                    return ColoredBox(
                      color: AppColors.backgroundGray,
                      child: CustomScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        slivers: [
                          SliverToBoxAdapter(
                            child: _DownPaymentToolbar(
                              showFilters: _showFilters,
                              onToggleFilters: () => setState(
                                () => _showFilters = !_showFilters,
                              ),
                              onRefresh: () => _refresh(userId, profile.hubId),
                              onExport: (format) => _export(format, userId),
                            ),
                          ),
                          if (showTierSwitcher) ...[
                            SliverToBoxAdapter(
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                                child: SegmentedButton<int>(
                                  style: SegmentedButton.styleFrom(
                                    backgroundColor: AppColors.surface,
                                    selectedBackgroundColor:
                                        AppColors.primaryOrange.withValues(
                                          alpha: 0.12,
                                        ),
                                    selectedForegroundColor:
                                        AppColors.primaryOrange,
                                    foregroundColor: AppColors.textDark,
                                    side: const BorderSide(
                                      color: AppColors.borderColor,
                                    ),
                                  ),
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
                              child: _EmptyState(activeTab: _activeTab),
                            )
                          else
                            SliverPadding(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
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
                      ),
                    );
                  },
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

class _DownPaymentToolbar extends StatelessWidget {
  final bool showFilters;
  final VoidCallback onToggleFilters;
  final VoidCallback onRefresh;
  final ValueChanged<String> onExport;

  const _DownPaymentToolbar({
    required this.showFilters,
    required this.onToggleFilters,
    required this.onRefresh,
    required this.onExport,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Down-payments',
                  style: GoogleFonts.outfit(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textDark,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Review and approve team requests',
                  style: GoogleFonts.outfit(
                    fontSize: 13,
                    color: AppColors.textLight,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _ToolbarIconButton(
            icon: showFilters ? Icons.filter_list : Icons.filter_list_outlined,
            tooltip: 'Filters',
            isActive: showFilters,
            onPressed: onToggleFilters,
          ),
          PopupMenuButton<String>(
            tooltip: 'Export',
            offset: const Offset(0, 40),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            onSelected: onExport,
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'csv', child: Text('Export CSV')),
              PopupMenuItem(value: 'excel', child: Text('Export Excel')),
              PopupMenuItem(value: 'pdf', child: Text('Export PDF')),
            ],
            child: Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Material(
                color: AppColors.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                  side: const BorderSide(color: AppColors.borderColor),
                ),
                child: const SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(
                    Icons.download_outlined,
                    size: 20,
                    color: AppColors.textDark,
                  ),
                ),
              ),
            ),
          ),
          _ToolbarIconButton(
            icon: Icons.refresh_rounded,
            tooltip: 'Refresh',
            onPressed: onRefresh,
          ),
        ],
      ),
    );
  }
}

class _ToolbarIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool isActive;

  const _ToolbarIconButton({
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.isActive = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Material(
        color: isActive
            ? AppColors.primaryOrange.withValues(alpha: 0.1)
            : AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: isActive
                ? AppColors.primaryOrange.withValues(alpha: 0.35)
                : AppColors.borderColor,
          ),
        ),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(10),
          child: Tooltip(
            message: tooltip,
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(
                icon,
                size: 20,
                color: isActive ? AppColors.primaryOrange : AppColors.textDark,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String activeTab;

  const _EmptyState({required this.activeTab});

  @override
  Widget build(BuildContext context) {
    final (icon, title, subtitle) = switch (activeTab) {
      'pending' => (
        Icons.inbox_outlined,
        'No pending requests',
        'New down-payment requests will appear here.',
      ),
      'processing' => (
        Icons.hourglass_empty_rounded,
        'Nothing in processing',
        'Approved requests awaiting payment show up here.',
      ),
      'completed' => (
        Icons.check_circle_outline_rounded,
        'No completed requests',
        'Fully paid requests are listed here.',
      ),
      _ => (
        Icons.receipt_long_outlined,
        'No requests found',
        'Try adjusting your filters.',
      ),
    };

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.borderColor),
              ),
              child: Icon(icon, size: 28, color: AppColors.textLight),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: GoogleFonts.outfit(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: GoogleFonts.outfit(
                fontSize: 13,
                color: AppColors.textLight,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
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
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Filters',
                style: GoogleFonts.outfit(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
              TextButton.icon(
                onPressed: onClear,
                icon: const Icon(Icons.clear_rounded, size: 16),
                label: const Text('Clear'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.primaryOrange,
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: searchController,
            decoration: InputDecoration(
              labelText: 'Search',
              hintText: 'Site, hub, justification...',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              isDense: true,
            ),
            onChanged: (_) => onFilterFieldsChanged?.call(),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: filters.hubId ?? 'all',
            decoration: InputDecoration(
              labelText: 'Hub',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
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
          const SizedBox(height: 12),
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
                  borderRadius: BorderRadius.circular(12),
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Date from',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      isDense: true,
                    ),
                    child: Text(
                      filters.dateFrom != null
                          ? DateFormat('MMM dd, yyyy').format(filters.dateFrom!)
                          : 'Select date',
                      style: TextStyle(
                        color: filters.dateFrom != null
                            ? AppColors.textDark
                            : Theme.of(context).hintColor,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
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
                  borderRadius: BorderRadius.circular(12),
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Date to',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      isDense: true,
                    ),
                    child: Text(
                      filters.dateTo != null
                          ? DateFormat('MMM dd, yyyy').format(filters.dateTo!)
                          : 'Select date',
                      style: TextStyle(
                        color: filters.dateTo != null
                            ? AppColors.textDark
                            : Theme.of(context).hintColor,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: amountMinController,
                  decoration: InputDecoration(
                    labelText: 'Min amount (SDG)',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    isDense: true,
                  ),
                  keyboardType: TextInputType.number,
                  onChanged: (_) => onFilterFieldsChanged?.call(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: amountMaxController,
                  decoration: InputDecoration(
                    labelText: 'Max amount (SDG)',
                    hintText: 'No limit',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
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
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
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
    return Material(
      color: isSelected ? AppColors.surface : Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(
          color: isSelected
              ? AppColors.primaryOrange.withValues(alpha: 0.4)
              : AppColors.borderColor,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: GoogleFonts.outfit(
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  color: isSelected
                      ? AppColors.primaryOrange
                      : AppColors.textDark,
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: isSelected
                      ? AppColors.primaryOrange.withValues(alpha: 0.12)
                      : AppColors.borderColor.withValues(alpha: 0.8),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$count',
                  style: GoogleFonts.outfit(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isSelected
                        ? AppColors.primaryOrange
                        : AppColors.textLight,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatsCards extends StatelessWidget {
  final DownPaymentStats stats;

  const _StatsCards({required this.stats});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  title: 'Total requests',
                  value: '${stats.totalRequests}',
                  icon: Icons.receipt_long_outlined,
                  accent: AppColors.textDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  title: 'Pending',
                  value: '${stats.pendingCount}',
                  icon: Icons.pending_actions_outlined,
                  accent: AppColors.accentYellow,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  title: 'Paid out',
                  value: _formatCompactSdg(stats.totalPaidSdg),
                  icon: Icons.payments_outlined,
                  accent: AppColors.accentGreen,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  title: 'Remaining',
                  value: _formatCompactSdg(stats.remainingSdg),
                  icon: Icons.account_balance_wallet_outlined,
                  accent: AppColors.primaryBlue,
                ),
              ),
            ],
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
  final Color accent;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: accent),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.outfit(
                    fontSize: 11,
                    color: AppColors.textLight,
                    height: 1.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    style: GoogleFonts.outfit(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textDark,
                      height: 1.1,
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
}

class _DownPaymentStatusBadge extends StatelessWidget {
  final String status;

  const _DownPaymentStatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (status) {
      'pending_supervisor' => (
        'Pending supervisor',
        AppColors.accentYellow.withValues(alpha: 0.14),
        const Color(0xFFB7791F),
      ),
      'pending_admin' => (
        'Pending admin',
        AppColors.primaryOrange.withValues(alpha: 0.12),
        AppColors.darkOrange,
      ),
      'approved' || 'paid' => (
        status == 'paid' ? 'Paid' : 'Approved',
        AppColors.accentGreen.withValues(alpha: 0.12),
        AppColors.accentGreen,
      ),
      'rejected' => (
        'Rejected',
        AppColors.accentRed.withValues(alpha: 0.1),
        AppColors.accentRed,
      ),
      _ => (
        status.replaceAll('_', ' '),
        AppColors.primaryBlue.withValues(alpha: 0.1),
        AppColors.darkBlue,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: GoogleFonts.outfit(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: fg,
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
    final siteName = request.siteName.isNotEmpty ? request.siteName : 'Site';

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppColors.primaryOrange.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        siteName.isNotEmpty ? siteName[0].toUpperCase() : '?',
                        style: GoogleFonts.outfit(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primaryOrange,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            siteName,
                            style: GoogleFonts.outfit(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textDark,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            currencyFormat.format(request.requestedAmount),
                            style: GoogleFonts.outfit(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textDark,
                              height: 1.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _DownPaymentStatusBadge(status: request.status),
                  ],
                ),
                const SizedBox(height: 14),
                if (request.hubName != null && request.hubName!.isNotEmpty)
                  _MetaRow(
                    icon: Icons.location_on_outlined,
                    label: request.hubName!,
                  ),
                _MetaRow(
                  icon: Icons.calendar_today_outlined,
                  label: DateFormat('MMM d, yyyy').format(request.requestedAt),
                ),
                if (request.justification.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.backgroundGray,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      request.justification,
                      style: GoogleFonts.outfit(
                        fontSize: 13,
                        color: AppColors.textLight,
                        height: 1.45,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (_showActions) ...[
            const Divider(height: 1, color: AppColors.borderColor),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: onReject,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.accentRed,
                        side: BorderSide(
                          color: AppColors.accentRed.withValues(alpha: 0.35),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        'Reject',
                        style: GoogleFonts.outfit(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: onApprove,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.accentGreen,
                        foregroundColor: AppColors.surface,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        'Approve',
                        style: GoogleFonts.outfit(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String label;

  const _MetaRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(icon, size: 14, color: AppColors.textTertiary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.outfit(
                fontSize: 13,
                color: AppColors.textLight,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
