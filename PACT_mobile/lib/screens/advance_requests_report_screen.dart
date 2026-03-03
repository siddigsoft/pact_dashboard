import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/advance_request_report.dart';
import '../services/advance_report_service.dart';
import '../widgets/advance_receipt_confirmation_dialog.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:csv/csv.dart';

class AdvanceRequestsReportScreen extends StatefulWidget {
  final bool isArabic;
  const AdvanceRequestsReportScreen({super.key, this.isArabic = false});

  @override
  State<AdvanceRequestsReportScreen> createState() =>
      _AdvanceRequestsReportScreenState();
}

class _AdvanceRequestsReportScreenState
    extends State<AdvanceRequestsReportScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<AdvanceRequestData> _requests = [];
  List<AdvanceRequestData> _reclaimedAdvances = [];
  bool _isLoading = true;
  bool _hasError = false;
  String _errorMessage = '';
  String _filterPeriod = 'all';
  ReportStats _stats = ReportStats();
  ReclaimStats _reclaimStats = ReclaimStats();
  String _reclaimFilter = 'all';
  bool _hasAccess = false;
  String? _userRole;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 7, vsync: this);
    _checkAccessAndLoad();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _checkAccessAndLoad() async {
    final hasAccess = await AdvanceReportService.checkUserHasReportAccess();
    final role = await AdvanceReportService.getCurrentUserRole();

    if (mounted) {
      setState(() {
        _hasAccess = hasAccess;
        _userRole = role;
      });

      if (hasAccess) {
        _loadData();
      } else {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
      _errorMessage = '';
    });

    try {
      final results = await Future.wait([
        AdvanceReportService.fetchFilteredRequests(),
        AdvanceReportService.fetchReclaimedAdvances(),
      ]);

      final requests = results[0];
      final reclaimedAdvances = results[1];
      final filteredRequests = _applyPeriodFilter(requests);
      final stats = AdvanceReportService.calculateStats(filteredRequests);
      final reclaimStats = AdvanceReportService.calculateReclaimStats(
        reclaimedAdvances,
      );

      if (mounted) {
        setState(() {
          _requests = filteredRequests;
          _reclaimedAdvances = reclaimedAdvances;
          _stats = stats;
          _reclaimStats = reclaimStats;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _hasError = true;
          _errorMessage =
              'Failed to load report data. Please check your connection and try again.';
        });
      }
    }
  }

  List<AdvanceRequestData> _applyPeriodFilter(
    List<AdvanceRequestData> requests,
  ) {
    final now = DateTime.now();

    switch (_filterPeriod) {
      case 'thisMonth':
        return requests
            .where(
              (r) =>
                  r.requestedAt.year == now.year &&
                  r.requestedAt.month == now.month,
            )
            .toList();
      case 'lastMonth':
        final lastMonth = DateTime(now.year, now.month - 1, 1);
        return requests
            .where(
              (r) =>
                  r.requestedAt.year == lastMonth.year &&
                  r.requestedAt.month == lastMonth.month,
            )
            .toList();
      case 'last3Months':
        final threeMonthsAgo = DateTime(now.year, now.month - 3, now.day);
        return requests
            .where((r) => r.requestedAt.isAfter(threeMonthsAgo))
            .toList();
      default:
        return requests;
    }
  }

  Future<void> _exportToCSV(String groupType) async {
    try {
      List<List<dynamic>> rows = [];

      switch (groupType) {
        case 'all':
          rows.add([
            'Date',
            'Team Member',
            'Site',
            'Hub',
            'State',
            'Project',
            'Amount (SDG)',
            'Status',
            'Paid',
            'Remaining',
            'Receipt Confirmed',
            'Signature Method',
            'Confirmed At',
          ]);
          for (var req in _requests) {
            rows.add([
              DateFormat('yyyy-MM-dd').format(req.requestedAt),
              req.requesterName ?? 'Unknown',
              req.siteName,
              req.hubName ?? 'N/A',
              req.stateName ?? 'Unknown',
              req.projectName ?? 'Unknown',
              req.requestedAmount,
              req.status.replaceAll('_', ' '),
              req.totalPaidAmount,
              (req.remainingAmount ??
                  (req.requestedAmount - req.totalPaidAmount)),
              req.isReceiptConfirmed ? 'Yes' : 'No',
              req.receiptSignatureMethod ?? 'N/A',
              req.receiptConfirmedAt ?? 'N/A',
            ]);
          }
          break;
        case 'byTeam':
          final grouped = AdvanceReportService.groupByTeamMember(_requests);
          rows.add([
            'Team Member',
            'Requests',
            'Total Requested (SDG)',
            'Total Approved (SDG)',
            'Pending',
          ]);
          for (var g in grouped) {
            rows.add([
              g.name,
              g.requests,
              g.totalRequested,
              g.totalApproved,
              g.pending,
            ]);
          }
          break;
        case 'byHub':
          final grouped = AdvanceReportService.groupByHub(_requests);
          rows.add([
            'Hub',
            'Requests',
            'Total Requested (SDG)',
            'Total Approved (SDG)',
            'Pending',
          ]);
          for (var g in grouped) {
            rows.add([
              g.name,
              g.requests,
              g.totalRequested,
              g.totalApproved,
              g.pending,
            ]);
          }
          break;
        case 'byStatus':
          final grouped = AdvanceReportService.groupByStatus(_requests);
          rows.add([
            'Status',
            'Requests',
            'Total Requested (SDG)',
            'Total Approved (SDG)',
            'Pending',
          ]);
          for (var g in grouped) {
            rows.add([
              g.name,
              g.requests,
              g.totalRequested,
              g.totalApproved,
              g.pending,
            ]);
          }
          break;
        case 'byState':
          final grouped = AdvanceReportService.groupByState(_requests);
          rows.add([
            'State',
            'Requests',
            'Total Requested (SDG)',
            'Total Approved (SDG)',
            'Pending',
          ]);
          for (var g in grouped) {
            rows.add([
              g.name,
              g.requests,
              g.totalRequested,
              g.totalApproved,
              g.pending,
            ]);
          }
          break;
        case 'byProject':
          final grouped = AdvanceReportService.groupByProject(_requests);
          rows.add([
            'Project',
            'Requests',
            'Total Requested (SDG)',
            'Total Approved (SDG)',
            'Pending',
          ]);
          for (var g in grouped) {
            rows.add([
              g.name,
              g.requests,
              g.totalRequested,
              g.totalApproved,
              g.pending,
            ]);
          }
          break;
      }

      final csv = const ListToCsvConverter().convert(rows);
      final directory = await getTemporaryDirectory();
      final fileName =
          'advance_report_${groupType}_${DateFormat('yyyyMMdd').format(DateTime.now())}.csv';
      final file = File('${directory.path}/$fileName');
      await file.writeAsString(csv);

      await Share.shareXFiles([
        XFile(file.path),
      ], subject: 'Advance Requests Report');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Report exported successfully'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Export failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasAccess && !_isLoading) {
      return Scaffold(
        appBar: AppBar(
          title: Text(
            widget.isArabic ? 'تقرير طلبات السلفة' : 'Advance Requests Report',
          ),
          backgroundColor: const Color(0xFF1E40AF),
          foregroundColor: Colors.white,
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.lock_outline, size: 64, color: Colors.grey[400]),
                const SizedBox(height: 16),
                Text(
                  widget.isArabic ? 'الوصول مقيد' : 'Access Restricted',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  widget.isArabic
                      ? 'ليس لديك صلاحية لعرض هذا التقرير. فقط المسؤولين والمشرفين والمنسقين ومديري الميدان والمالية ومديري الدولة وفريق البيانات يمكنهم الوصول.'
                      : 'You do not have permission to view this report. Only Admins, Supervisors, Coordinators, FOM, Finance, Country Directors, and Data Team members can access this page.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey[600]),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          _buildSliverAppBar(),
          SliverToBoxAdapter(child: _buildStatsCards()),
          SliverPersistentHeader(
            pinned: true,
            delegate: _SliverTabBarDelegate(
              TabBar(
                controller: _tabController,
                isScrollable: true,
                labelColor: const Color(0xFF1E40AF),
                unselectedLabelColor: Colors.grey,
                indicatorColor: const Color(0xFF1E40AF),
                tabs: [
                  const Tab(icon: Icon(Icons.list_alt, size: 18), text: 'All'),
                  const Tab(icon: Icon(Icons.people, size: 18), text: 'Team'),
                  const Tab(icon: Icon(Icons.business, size: 18), text: 'Hub'),
                  const Tab(
                    icon: Icon(Icons.pending_actions, size: 18),
                    text: 'Status',
                  ),
                  const Tab(
                    icon: Icon(Icons.location_on, size: 18),
                    text: 'State',
                  ),
                  const Tab(
                    icon: Icon(Icons.folder, size: 18),
                    text: 'Project',
                  ),
                  Tab(
                    icon: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        const Icon(Icons.rotate_left, size: 18),
                        if (_reclaimStats.needsReconciliationCount > 0)
                          Positioned(
                            top: -4,
                            right: -6,
                            child: Container(
                              padding: const EdgeInsets.all(2),
                              decoration: const BoxDecoration(
                                color: Colors.orange,
                                shape: BoxShape.circle,
                              ),
                              constraints: const BoxConstraints(
                                minWidth: 14,
                                minHeight: 14,
                              ),
                              child: Text(
                                _reclaimStats.needsReconciliationCount > 99
                                    ? '99+'
                                    : '${_reclaimStats.needsReconciliationCount}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                      ],
                    ),
                    text: widget.isArabic ? 'الاسترداد' : 'Reclaim',
                  ),
                ],
              ),
            ),
          ),
        ],
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _hasError
            ? _buildErrorState()
            : TabBarView(
                controller: _tabController,
                children: [
                  _buildAllRequestsTab(),
                  _buildGroupedTab(
                    'byTeam',
                    AdvanceReportService.groupByTeamMember(_requests),
                    'Team Member',
                  ),
                  _buildGroupedTab(
                    'byHub',
                    AdvanceReportService.groupByHub(_requests),
                    'Hub',
                  ),
                  _buildGroupedTab(
                    'byStatus',
                    AdvanceReportService.groupByStatus(_requests),
                    'Status',
                  ),
                  _buildGroupedTab(
                    'byState',
                    AdvanceReportService.groupByState(_requests),
                    'State',
                  ),
                  _buildGroupedTab(
                    'byProject',
                    AdvanceReportService.groupByProject(_requests),
                    'Project',
                  ),
                  _buildReclaimImpactTab(),
                ],
              ),
      ),
    );
  }

  List<AdvanceRequestData> get _filteredReclaimedAdvances {
    switch (_reclaimFilter) {
      case 'needs_reconciliation':
        return _reclaimedAdvances
            .where(
              (r) =>
                  r.needsManualReconciliation &&
                  !r.isWrittenOff &&
                  !r.isReconciliationResolved,
            )
            .toList();
      case 'auto_cancelled':
        return _reclaimedAdvances
            .where(
              (r) =>
                  r.isAutoCancelledOnReclaim &&
                  !r.needsManualReconciliation &&
                  !r.isWrittenOff,
            )
            .toList();
      case 'resolved':
        return _reclaimedAdvances
            .where((r) => r.isReconciliationResolved)
            .toList();
      case 'written_off':
        return _reclaimedAdvances.where((r) => r.isWrittenOff).toList();
      default:
        return _reclaimedAdvances;
    }
  }

  Widget _buildReclaimImpactTab() {
    final isArabic = widget.isArabic;
    final formatter = NumberFormat('#,###');
    final displayed = _filteredReclaimedAdvances;

    return Column(
      children: [
        // ── Stats strip ────────────────────────────────────────────────────
        Container(
          color: const Color(0xFFFFF7ED),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              _ReclaimStatChip(
                label: isArabic ? 'الكل' : 'All',
                count: _reclaimStats.totalReclaimedCount,
                color: Colors.blueGrey,
              ),
              const SizedBox(width: 6),
              _ReclaimStatChip(
                label: isArabic ? 'للمطابقة' : 'Pending',
                count: _reclaimStats.needsReconciliationCount,
                color: Colors.orange,
              ),
              const SizedBox(width: 6),
              _ReclaimStatChip(
                label: isArabic ? 'تمت' : 'Resolved',
                count: _reclaimStats.resolvedCount,
                color: Colors.teal,
              ),
              const SizedBox(width: 6),
              _ReclaimStatChip(
                label: isArabic ? 'مشطوب' : 'Written Off',
                count: _reclaimStats.writtenOffCount,
                color: Colors.grey[600]!,
              ),
            ],
          ),
        ),

        // ── Exposure amounts ───────────────────────────────────────────────
        Container(
          color: const Color(0xFFFEF2F2),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? 'إجمالي المبلغ' : 'Total Exposure',
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                    Text(
                      'SDG ${formatter.format(_reclaimStats.totalReclaimedAmount)}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFDC2626),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? 'قيد المطابقة' : 'Pending Reconciliation',
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                    Text(
                      'SDG ${formatter.format(_reclaimStats.pendingReconciliationAmount)}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFD97706),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isArabic ? 'المشطوب' : 'Written Off',
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                    Text(
                      'SDG ${formatter.format(_reclaimStats.writtenOffAmount)}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey[700],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // ── Filter chips ───────────────────────────────────────────────────
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              _FilterChipWidget(
                label: isArabic ? 'الكل' : 'All',
                selected: _reclaimFilter == 'all',
                onSelected: (_) => setState(() => _reclaimFilter = 'all'),
              ),
              const SizedBox(width: 6),
              _FilterChipWidget(
                label: isArabic ? 'تحتاج مطابقة' : 'Needs Reconciliation',
                selected: _reclaimFilter == 'needs_reconciliation',
                onSelected: (_) =>
                    setState(() => _reclaimFilter = 'needs_reconciliation'),
                color: Colors.orange,
              ),
              const SizedBox(width: 6),
              _FilterChipWidget(
                label: isArabic ? 'ملغى تلقائياً' : 'Auto-Cancelled',
                selected: _reclaimFilter == 'auto_cancelled',
                onSelected: (_) =>
                    setState(() => _reclaimFilter = 'auto_cancelled'),
                color: Colors.deepOrange,
              ),
              const SizedBox(width: 6),
              _FilterChipWidget(
                label: isArabic ? 'تم الحل' : 'Resolved',
                selected: _reclaimFilter == 'resolved',
                onSelected: (_) => setState(() => _reclaimFilter = 'resolved'),
                color: Colors.teal,
              ),
              const SizedBox(width: 6),
              _FilterChipWidget(
                label: isArabic ? 'مشطوب' : 'Written Off',
                selected: _reclaimFilter == 'written_off',
                onSelected: (_) =>
                    setState(() => _reclaimFilter = 'written_off'),
                color: Colors.grey[600]!,
              ),
            ],
          ),
        ),

        // ── List ───────────────────────────────────────────────────────────
        Expanded(
          child: displayed.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.check_circle_outline,
                        size: 64,
                        color: Colors.green[300],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        isArabic
                            ? 'لا توجد سلف متأثرة بالاسترداد'
                            : 'No reclaim-impacted advances',
                        style: TextStyle(color: Colors.grey[600], fontSize: 16),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 4,
                  ),
                  itemCount: displayed.length,
                  itemBuilder: (context, index) {
                    return _ReclaimAdvanceCard(
                      request: displayed[index],
                      isArabic: isArabic,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      expandedHeight: 140,
      pinned: true,
      backgroundColor: const Color(0xFF1E40AF),
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1E40AF), Color(0xFF3B82F6)],
            ),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 48, 16, 16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Image.asset(
                      'assets/images/pact_logo.png',
                      height: 40,
                      width: 40,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.account_balance_wallet,
                        color: Colors.white,
                        size: 40,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'PACT',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          widget.isArabic
                              ? 'تقرير تكلفة سلفة النقل'
                              : 'Transportation Advance Cost Report',
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.9),
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      actions: [
        PopupMenuButton<String>(
          icon: const Icon(Icons.filter_list, color: Colors.white),
          onSelected: (value) {
            setState(() => _filterPeriod = value);
            _loadData();
          },
          itemBuilder: (context) => [
            PopupMenuItem(
              value: 'all',
              child: Text(widget.isArabic ? 'كل الفترات' : 'All Time'),
            ),
            PopupMenuItem(
              value: 'thisMonth',
              child: Text(widget.isArabic ? 'هذا الشهر' : 'This Month'),
            ),
            PopupMenuItem(
              value: 'lastMonth',
              child: Text(widget.isArabic ? 'الشهر الماضي' : 'Last Month'),
            ),
            PopupMenuItem(
              value: 'last3Months',
              child: Text(widget.isArabic ? 'آخر 3 أشهر' : 'Last 3 Months'),
            ),
          ],
        ),
        IconButton(
          icon: const Icon(Icons.refresh, color: Colors.white),
          onPressed: _loadData,
        ),
      ],
    );
  }

  Widget _buildStatsCards() {
    final formatter = NumberFormat('#,###');

    final isArabic = widget.isArabic;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  title: isArabic ? 'إجمالي المطلوب' : 'Total Requested',
                  value: 'SDG ${formatter.format(_stats.totalRequested)}',
                  subtitle:
                      '${_stats.totalCount} ${isArabic ? "طلب" : "requests"}',
                  icon: Icons.account_balance_wallet,
                  color: const Color(0xFF1E40AF),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  title: isArabic ? 'الموافق عليها' : 'Approved',
                  value: 'SDG ${formatter.format(_stats.totalApproved)}',
                  subtitle:
                      '${_stats.approvedCount} ${isArabic ? "طلب" : "requests"}',
                  icon: Icons.check_circle,
                  color: Colors.green,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  title: isArabic ? 'قيد الانتظار' : 'Pending',
                  value: 'SDG ${formatter.format(_stats.totalPending)}',
                  subtitle:
                      '${_stats.pendingCount} ${isArabic ? "طلب" : "requests"}',
                  icon: Icons.pending_actions,
                  color: Colors.orange,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  title: isArabic ? 'المرفوضة' : 'Rejected',
                  value: 'SDG ${formatter.format(_stats.totalRejected)}',
                  subtitle:
                      '${_stats.rejectedCount} ${isArabic ? "طلب" : "requests"}',
                  icon: Icons.cancel,
                  color: Colors.red,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAllRequestsTab() {
    return Column(
      children: [
        _buildExportButtons('all'),
        Expanded(
          child: _requests.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _requests.length,
                  itemBuilder: (context, index) {
                    final req = _requests[index];
                    return _RequestCard(
                      request: req,
                      isArabic: widget.isArabic,
                      onReceiptConfirmed: _loadData,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildGroupedTab(
    String groupType,
    List<ReportGroupData> grouped,
    String groupLabel,
  ) {
    return Column(
      children: [
        _buildExportButtons(groupType),
        Expanded(
          child: grouped.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: grouped.length,
                  itemBuilder: (context, index) {
                    final group = grouped[index];
                    return _GroupCard(
                      group: group,
                      groupLabel: groupLabel,
                      isArabic: widget.isArabic,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildExportButtons(String groupType) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          OutlinedButton.icon(
            onPressed: () => _exportToCSV(groupType),
            icon: const Icon(Icons.download, size: 18),
            label: Text(widget.isArabic ? 'تصدير CSV' : 'Export CSV'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF1E40AF),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inbox_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            widget.isArabic ? 'لم يتم العثور على طلبات' : 'No requests found',
            style: TextStyle(color: Colors.grey[600], fontSize: 16),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red[400]),
            const SizedBox(height: 16),
            Text(
              'Error Loading Report',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(color: Colors.red[700]),
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E40AF),
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reclaim Impact Tab helper widgets
// ─────────────────────────────────────────────────────────────────────────────

class _ReclaimStatChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _ReclaimStatChip({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChipWidget extends StatelessWidget {
  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;
  final Color? color;

  const _FilterChipWidget({
    required this.label,
    required this.selected,
    required this.onSelected,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFF1E40AF);
    return GestureDetector(
      onTap: () => onSelected(!selected),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? c : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? c : Colors.grey[300]!),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: selected ? Colors.white : Colors.grey[700],
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}

class _ReclaimAdvanceCard extends StatelessWidget {
  final AdvanceRequestData request;
  final bool isArabic;

  const _ReclaimAdvanceCard({required this.request, this.isArabic = false});

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat('#,###');

    Color borderColor;
    Color badgeColor;
    String badgeLabel;
    IconData badgeIcon;

    if (request.isWrittenOff) {
      borderColor = Colors.blueGrey.shade300;
      badgeColor = Colors.blueGrey;
      badgeLabel = isArabic ? 'مشطوب' : 'Written Off';
      badgeIcon = Icons.do_not_disturb_alt;
    } else if (request.isReconciliationResolved) {
      borderColor = Colors.teal.shade300;
      badgeColor = Colors.teal;
      badgeLabel = isArabic ? 'تم الحل' : 'Resolved';
      badgeIcon = Icons.check_circle_outline;
    } else if (request.needsManualReconciliation) {
      borderColor = Colors.orange.shade400;
      badgeColor = Colors.orange;
      badgeLabel = isArabic ? 'تحتاج مطابقة' : 'Needs Reconciliation';
      badgeIcon = Icons.warning_amber_rounded;
    } else if (request.isAutoCancelledOnReclaim) {
      borderColor = Colors.deepOrange.shade300;
      badgeColor = Colors.deepOrange;
      badgeLabel = isArabic ? 'ملغى تلقائياً' : 'Auto-Cancelled';
      badgeIcon = Icons.cancel_schedule_send;
    } else {
      borderColor = Colors.grey.shade300;
      badgeColor = Colors.grey;
      badgeLabel = isArabic ? 'مسترد' : 'Reclaimed';
      badgeIcon = Icons.rotate_left;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: borderColor, width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    request.requesterName ?? 'Unknown',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: badgeColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: badgeColor.withOpacity(0.4)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(badgeIcon, size: 12, color: badgeColor),
                      const SizedBox(width: 4),
                      Text(
                        badgeLabel,
                        style: TextStyle(
                          color: badgeColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Site & amount
            Row(
              children: [
                const Icon(Icons.location_on, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    request.siteName.isNotEmpty
                        ? request.siteName
                        : 'Unknown Site',
                    style: TextStyle(fontSize: 13, color: Colors.grey[700]),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  'SDG ${formatter.format(request.requestedAmount)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: Color(0xFF1E40AF),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),

            // Reclaim reason
            if (request.siteReclaimReason != null) ...[
              Row(
                children: [
                  Icon(Icons.rotate_left, size: 13, color: Colors.orange[700]),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '${isArabic ? "سبب الاسترداد" : "Reclaim reason"}: ${request.siteReclaimReason}',
                      style: TextStyle(fontSize: 12, color: Colors.orange[800]),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
            ],

            // Write-off info
            if (request.isWrittenOff && request.writeOffReason != null) ...[
              Row(
                children: [
                  Icon(
                    Icons.do_not_disturb_alt,
                    size: 13,
                    color: Colors.blueGrey[600],
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '${isArabic ? "سبب الشطب" : "Write-off reason"}: ${request.writeOffReason}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.blueGrey[700],
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              if (request.writeOffAt != null) ...[
                const SizedBox(height: 2),
                Padding(
                  padding: const EdgeInsets.only(left: 17),
                  child: Text(
                    '${isArabic ? "تاريخ الشطب" : "Written off"}: ${_formatDate(request.writeOffAt!)}',
                    style: TextStyle(fontSize: 11, color: Colors.grey[500]),
                  ),
                ),
              ],
            ],

            // Resolution info
            if (request.isReconciliationResolved) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  Icon(
                    Icons.check_circle_outline,
                    size: 13,
                    color: Colors.teal[600],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${isArabic ? "تم الحل" : "Resolved"}'
                    '${request.reconciliationResolvedAt != null ? " · ${_formatDate(request.reconciliationResolvedAt!)}" : ""}',
                    style: TextStyle(fontSize: 12, color: Colors.teal[700]),
                  ),
                ],
              ),
            ],

            // Reclaimed date
            if (request.reclaimedAt != null) ...[
              const SizedBox(height: 4),
              Text(
                '${isArabic ? "تاريخ الاسترداد" : "Reclaimed"}: ${_formatDate(request.reclaimedAt!)}',
                style: TextStyle(fontSize: 11, color: Colors.grey[500]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return DateFormat('dd MMM yyyy').format(dt);
    } catch (_) {
      return iso;
    }
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final String subtitle;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.subtitle,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  ),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      value,
                      style: TextStyle(
                        color: color,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: Colors.grey[500], fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  final AdvanceRequestData request;
  final bool isArabic;
  final VoidCallback? onReceiptConfirmed;

  const _RequestCard({
    required this.request,
    this.isArabic = false,
    this.onReceiptConfirmed,
  });

  @override
  Widget build(BuildContext context) {
    final statusInfo = StatusBadgeInfo.fromStatus(request.status);
    final formatter = NumberFormat('#,###');
    final remaining =
        request.remainingAmount ??
        (request.requestedAmount - request.totalPaidAmount);

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
                    request.requesterName ?? 'Unknown',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: statusInfo.color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusInfo.icon, size: 14, color: statusInfo.color),
                      const SizedBox(width: 4),
                      Text(
                        statusInfo.label,
                        style: TextStyle(
                          color: statusInfo.color,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildInfoRow(
              Icons.calendar_today,
              DateFormat('MMM dd, yyyy').format(request.requestedAt),
            ),
            _buildInfoRow(Icons.location_on, request.siteName),
            if (request.hubName != null)
              _buildInfoRow(Icons.business, request.hubName!),
            if (request.stateName != null)
              _buildInfoRow(Icons.map, request.stateName!),
            if (request.projectName != null)
              _buildInfoRow(Icons.folder, request.projectName!),
            const Divider(height: 24),
            Row(
              children: [
                Expanded(
                  child: _buildAmountColumn(
                    isArabic ? 'المطلوب' : 'Requested',
                    formatter.format(request.requestedAmount),
                    const Color(0xFF1E40AF),
                  ),
                ),
                Expanded(
                  child: _buildAmountColumn(
                    isArabic ? 'المدفوع' : 'Paid',
                    formatter.format(request.totalPaidAmount),
                    Colors.green,
                  ),
                ),
                Expanded(
                  child: _buildAmountColumn(
                    isArabic ? 'المتبقي' : 'Remaining',
                    formatter.format(remaining),
                    remaining > 0 ? Colors.orange : Colors.grey,
                  ),
                ),
              ],
            ),
            if (request.isReceiptConfirmed) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      size: 16,
                      color: Colors.green,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Receipt Confirmed / تم تأكيد الاستلام',
                        style: TextStyle(
                          color: Colors.green[700],
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (request.receiptSignatureMethod != null) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.draw, size: 14, color: Colors.blue[600]),
                    const SizedBox(width: 6),
                    Text(
                      'Signature: ${request.receiptSignatureMethod} / التوقيع: ${request.receiptSignatureMethod}',
                      style: TextStyle(fontSize: 11, color: Colors.blue[600]),
                    ),
                  ],
                ),
              ],
              if (request.receiptConfirmedAt != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.access_time, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 6),
                    Text(
                      request.receiptConfirmedAt!,
                      style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
            ],
            if (_canShowConfirmButton(request)) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _showReceiptConfirmation(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.draw, size: 18),
                  label: const Text('Confirm Receipt / تأكيد الاستلام'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  bool _canShowConfirmButton(AdvanceRequestData req) {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return false;
    if (req.requestedBy != userId) return false;
    final status = req.status.toLowerCase();
    if (status != 'partially_paid' && status != 'fully_paid') return false;
    if (req.isReceiptConfirmed) return false;
    return true;
  }

  void _showReceiptConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AdvanceReceiptConfirmationDialog(
        requestId: request.id,
        amount: request.requestedAmount,
        siteName: request.siteName,
        onConfirmed: () {
          onReceiptConfirmed?.call();
        },
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(icon, size: 14, color: Colors.grey[500]),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: Colors.grey[700], fontSize: 13),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAmountColumn(String label, String value, Color color) {
    return Column(
      children: [
        Text(label, style: TextStyle(color: Colors.grey[500], fontSize: 11)),
        const SizedBox(height: 4),
        Text(
          'SDG $value',
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.bold,
            fontSize: 13,
          ),
        ),
      ],
    );
  }
}

class _GroupCard extends StatelessWidget {
  final ReportGroupData group;
  final String groupLabel;
  final bool isArabic;

  const _GroupCard({
    required this.group,
    required this.groupLabel,
    this.isArabic = false,
  });

  @override
  Widget build(BuildContext context) {
    final formatter = NumberFormat('#,###');

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
                    group.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E40AF).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${group.requests} ${isArabic ? "طلب" : "requests"}',
                    style: const TextStyle(
                      color: Color(0xFF1E40AF),
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildMetricColumn(
                    isArabic ? 'إجمالي المطلوب' : 'Total Requested',
                    'SDG ${formatter.format(group.totalRequested)}',
                    const Color(0xFF1E40AF),
                  ),
                ),
                Expanded(
                  child: _buildMetricColumn(
                    isArabic ? 'إجمالي الموافق' : 'Total Approved',
                    'SDG ${formatter.format(group.totalApproved)}',
                    Colors.green,
                  ),
                ),
                Expanded(
                  child: _buildMetricColumn(
                    isArabic ? 'قيد الانتظار' : 'Pending',
                    '${group.pending}',
                    group.pending > 0 ? Colors.orange : Colors.grey,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricColumn(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(color: Colors.grey[500], fontSize: 11),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            value,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ),
      ],
    );
  }
}

class _SliverTabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;

  _SliverTabBarDelegate(this.tabBar);

  @override
  double get minExtent => tabBar.preferredSize.height;

  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: tabBar,
    );
  }

  @override
  bool shouldRebuild(_SliverTabBarDelegate oldDelegate) {
    return tabBar != oldDelegate.tabBar;
  }
}
