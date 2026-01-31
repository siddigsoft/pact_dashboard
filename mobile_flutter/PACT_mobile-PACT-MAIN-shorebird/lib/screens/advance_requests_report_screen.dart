import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/advance_request_report.dart';
import '../services/advance_report_service.dart';
import '../widgets/pact_header.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:csv/csv.dart';

class AdvanceRequestsReportScreen extends StatefulWidget {
  const AdvanceRequestsReportScreen({super.key});

  @override
  State<AdvanceRequestsReportScreen> createState() => _AdvanceRequestsReportScreenState();
}

class _AdvanceRequestsReportScreenState extends State<AdvanceRequestsReportScreen> 
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<AdvanceRequestData> _requests = [];
  bool _isLoading = true;
  String _filterPeriod = 'all';
  ReportStats _stats = ReportStats();
  bool _hasAccess = false;
  String? _userRole;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
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
    setState(() => _isLoading = true);
    
    final requests = await AdvanceReportService.fetchAllRequests();
    final filteredRequests = _applyPeriodFilter(requests);
    final stats = AdvanceReportService.calculateStats(filteredRequests);
    
    if (mounted) {
      setState(() {
        _requests = filteredRequests;
        _stats = stats;
        _isLoading = false;
      });
    }
  }

  List<AdvanceRequestData> _applyPeriodFilter(List<AdvanceRequestData> requests) {
    final now = DateTime.now();
    
    switch (_filterPeriod) {
      case 'thisMonth':
        return requests.where((r) => 
          r.requestedAt.year == now.year && r.requestedAt.month == now.month
        ).toList();
      case 'lastMonth':
        final lastMonth = DateTime(now.year, now.month - 1, 1);
        return requests.where((r) => 
          r.requestedAt.year == lastMonth.year && r.requestedAt.month == lastMonth.month
        ).toList();
      case 'last3Months':
        final threeMonthsAgo = DateTime(now.year, now.month - 3, now.day);
        return requests.where((r) => r.requestedAt.isAfter(threeMonthsAgo)).toList();
      default:
        return requests;
    }
  }

  Future<void> _exportToCSV(String groupType) async {
    try {
      List<List<dynamic>> rows = [];
      
      switch (groupType) {
        case 'all':
          rows.add(['Date', 'Team Member', 'Site', 'Hub', 'State', 'Project', 'Amount (SDG)', 'Status', 'Paid', 'Remaining']);
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
              (req.remainingAmount ?? (req.requestedAmount - req.totalPaidAmount)),
            ]);
          }
          break;
        case 'byTeam':
          final grouped = AdvanceReportService.groupByTeamMember(_requests);
          rows.add(['Team Member', 'Requests', 'Total Requested (SDG)', 'Total Approved (SDG)', 'Pending']);
          for (var g in grouped) {
            rows.add([g.name, g.requests, g.totalRequested, g.totalApproved, g.pending]);
          }
          break;
        case 'byHub':
          final grouped = AdvanceReportService.groupByHub(_requests);
          rows.add(['Hub', 'Requests', 'Total Requested (SDG)', 'Total Approved (SDG)', 'Pending']);
          for (var g in grouped) {
            rows.add([g.name, g.requests, g.totalRequested, g.totalApproved, g.pending]);
          }
          break;
        case 'byStatus':
          final grouped = AdvanceReportService.groupByStatus(_requests);
          rows.add(['Status', 'Requests', 'Total Requested (SDG)', 'Total Approved (SDG)', 'Pending']);
          for (var g in grouped) {
            rows.add([g.name, g.requests, g.totalRequested, g.totalApproved, g.pending]);
          }
          break;
        case 'byState':
          final grouped = AdvanceReportService.groupByState(_requests);
          rows.add(['State', 'Requests', 'Total Requested (SDG)', 'Total Approved (SDG)', 'Pending']);
          for (var g in grouped) {
            rows.add([g.name, g.requests, g.totalRequested, g.totalApproved, g.pending]);
          }
          break;
        case 'byProject':
          final grouped = AdvanceReportService.groupByProject(_requests);
          rows.add(['Project', 'Requests', 'Total Requested (SDG)', 'Total Approved (SDG)', 'Pending']);
          for (var g in grouped) {
            rows.add([g.name, g.requests, g.totalRequested, g.totalApproved, g.pending]);
          }
          break;
      }

      final csv = const ListToCsvConverter().convert(rows);
      final directory = await getTemporaryDirectory();
      final fileName = 'advance_report_${groupType}_${DateFormat('yyyyMMdd').format(DateTime.now())}.csv';
      final file = File('${directory.path}/$fileName');
      await file.writeAsString(csv);

      await Share.shareXFiles([XFile(file.path)], subject: 'Advance Requests Report');
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report exported successfully'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Export failed: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasAccess && !_isLoading) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Advance Requests Report'),
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
                  'Access Restricted',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  'You do not have permission to view this report. Only Admins, Supervisors, FOM, Finance, and Country Directors can access this page.',
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
                tabs: const [
                  Tab(icon: Icon(Icons.list_alt, size: 18), text: 'All'),
                  Tab(icon: Icon(Icons.people, size: 18), text: 'Team'),
                  Tab(icon: Icon(Icons.business, size: 18), text: 'Hub'),
                  Tab(icon: Icon(Icons.pending_actions, size: 18), text: 'Status'),
                  Tab(icon: Icon(Icons.location_on, size: 18), text: 'State'),
                  Tab(icon: Icon(Icons.folder, size: 18), text: 'Project'),
                ],
              ),
            ),
          ),
        ],
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                controller: _tabController,
                children: [
                  _buildAllRequestsTab(),
                  _buildGroupedTab('byTeam', AdvanceReportService.groupByTeamMember(_requests), 'Team Member'),
                  _buildGroupedTab('byHub', AdvanceReportService.groupByHub(_requests), 'Hub'),
                  _buildGroupedTab('byStatus', AdvanceReportService.groupByStatus(_requests), 'Status'),
                  _buildGroupedTab('byState', AdvanceReportService.groupByState(_requests), 'State'),
                  _buildGroupedTab('byProject', AdvanceReportService.groupByProject(_requests), 'Project'),
                ],
              ),
      ),
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
                      errorBuilder: (_, __, ___) => const Icon(
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
                          'Transportation Advance Cost Report',
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
            const PopupMenuItem(value: 'all', child: Text('All Time')),
            const PopupMenuItem(value: 'thisMonth', child: Text('This Month')),
            const PopupMenuItem(value: 'lastMonth', child: Text('Last Month')),
            const PopupMenuItem(value: 'last3Months', child: Text('Last 3 Months')),
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
    
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  title: 'Total Requested',
                  value: 'SDG ${formatter.format(_stats.totalRequested)}',
                  subtitle: '${_stats.totalCount} requests',
                  icon: Icons.account_balance_wallet,
                  color: const Color(0xFF1E40AF),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  title: 'Approved',
                  value: 'SDG ${formatter.format(_stats.totalApproved)}',
                  subtitle: '${_stats.approvedCount} requests',
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
                  title: 'Pending',
                  value: 'SDG ${formatter.format(_stats.totalPending)}',
                  subtitle: '${_stats.pendingCount} requests',
                  icon: Icons.pending_actions,
                  color: Colors.orange,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  title: 'Rejected',
                  value: 'SDG ${formatter.format(_stats.totalRejected)}',
                  subtitle: '${_stats.rejectedCount} requests',
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
                    return _RequestCard(request: req);
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildGroupedTab(String groupType, List<ReportGroupData> grouped, String groupLabel) {
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
                    return _GroupCard(group: group, groupLabel: groupLabel);
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
            label: const Text('Export CSV'),
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
            'No requests found',
            style: TextStyle(color: Colors.grey[600], fontSize: 16),
          ),
        ],
      ),
    );
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
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 12,
                    ),
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
                    style: TextStyle(
                      color: Colors.grey[500],
                      fontSize: 11,
                    ),
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

  const _RequestCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final statusInfo = StatusBadgeInfo.fromStatus(request.status);
    final formatter = NumberFormat('#,###');
    final remaining = request.remainingAmount ?? (request.requestedAmount - request.totalPaidAmount);

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
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
            _buildInfoRow(Icons.calendar_today, DateFormat('MMM dd, yyyy').format(request.requestedAt)),
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
                  child: _buildAmountColumn('Requested', formatter.format(request.requestedAmount), const Color(0xFF1E40AF)),
                ),
                Expanded(
                  child: _buildAmountColumn('Paid', formatter.format(request.totalPaidAmount), Colors.green),
                ),
                Expanded(
                  child: _buildAmountColumn('Remaining', formatter.format(remaining), remaining > 0 ? Colors.orange : Colors.grey),
                ),
              ],
            ),
          ],
        ),
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
        Text(
          label,
          style: TextStyle(color: Colors.grey[500], fontSize: 11),
        ),
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

  const _GroupCard({required this.group, required this.groupLabel});

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
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E40AF).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${group.requests} requests',
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
                    'Total Requested',
                    'SDG ${formatter.format(group.totalRequested)}',
                    const Color(0xFF1E40AF),
                  ),
                ),
                Expanded(
                  child: _buildMetricColumn(
                    'Total Approved',
                    'SDG ${formatter.format(group.totalApproved)}',
                    Colors.green,
                  ),
                ),
                Expanded(
                  child: _buildMetricColumn(
                    'Pending',
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
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
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
