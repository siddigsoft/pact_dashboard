// lib/screens/admin/monitoring_dashboard_screen.dart
// Super Admin monitoring dashboard for reviewing and managing all system actions

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;
import '../../models/monitoring_action.dart';
import '../../providers/monitoring_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/reusable_app_bar.dart';
import '../../widgets/custom_drawer_menu.dart';

class MonitoringDashboardScreen extends ConsumerStatefulWidget {
  final String? initialActionId;
  final String? initialCategory;

  const MonitoringDashboardScreen({
    super.key,
    this.initialActionId,
    this.initialCategory,
  });

  @override
  ConsumerState<MonitoringDashboardScreen> createState() =>
      _MonitoringDashboardScreenState();
}

class _MonitoringDashboardScreenState
    extends ConsumerState<MonitoringDashboardScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final Set<String> _selectedActionIds = {};
  final TextEditingController _searchController = TextEditingController();
  String _selectedCategory = 'all';
  String _selectedStatus = 'all';
  bool _isMultiSelectMode = false;
  String _searchQuery = '';
  bool _hasLoggedNotification = false;

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
            // App Bar
            ReusableAppBar(
              title: 'System Monitoring',
              scaffoldKey: _scaffoldKey,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: () {
                    ref.refresh(monitoringActionsProvider);
                  },
                ),
              ],
            ),

            // Summary Chips
            _buildSummaryChips(context),

            // Search Bar
            _buildSearchBar(context),

            // Filter Row
            _buildFilterRow(context),

            // Bulk Action Bar (visible when items selected)
            if (_isMultiSelectMode) _buildBulkActionBar(context),

            // Category Expansion List
            Expanded(child: _buildCategoryList(context)),

            // Export Buttons
            _buildExportBar(context),
          ],
        ),
      ),
    );
  }

  /// Build summary chips showing statistics
  Widget _buildSummaryChips(BuildContext context) {
    return ref
        .watch(monitoringSummaryProvider)
        .when(
          data: (summary) => SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  _buildSummaryChip(
                    label: 'Total',
                    count: summary.totalActions,
                    color: Colors.blue,
                  ),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                    label: 'Acted',
                    count: summary.actedCount,
                    color: Colors.green,
                  ),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                    label: 'Ignored',
                    count: summary.ignoredCount,
                    color: Colors.orange,
                  ),
                  const SizedBox(width: 8),
                  _buildSummaryChip(
                    label: 'No Response',
                    count: summary.noResponseCount,
                    color: Colors.grey,
                  ),
                ],
              ),
            ),
          ),
          loading: () => const Padding(
            padding: EdgeInsets.all(12),
            child: SizedBox(
              height: 40,
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
          ),
          error: (err, stack) => Padding(
            padding: const EdgeInsets.all(12),
            child: Text('Error: $err'),
          ),
        );
  }

  /// Build individual summary chip
  Widget _buildSummaryChip({
    required String label,
    required int count,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        border: Border.all(color: color.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Text(label, style: const TextStyle(fontSize: 12)),
          const SizedBox(width: 8),
          Text(
            count.toString(),
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  /// Build search bar for quick action lookup
  Widget _buildSearchBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: TextField(
        controller: _searchController,
        decoration: InputDecoration(
          hintText: 'Search by sender, ID, or details...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _searchController.clear();
                    setState(() => _searchQuery = '');
                  },
                )
              : null,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
        ),
      ),
    );
  }

  /// Build filter row for category and status
  Widget _buildFilterRow(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<String>(
              value: _selectedCategory,
              decoration: InputDecoration(
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                labelText: 'Category',
              ),
              items: [
                const DropdownMenuItem(value: 'all', child: Text('All')),
                const DropdownMenuItem(
                  value: 'mmp_lifecycle',
                  child: Text('MMP Lifecycle'),
                ),
                const DropdownMenuItem(
                  value: 'site_visits',
                  child: Text('Site Visits'),
                ),
                const DropdownMenuItem(
                  value: 'cost_reimbursements',
                  child: Text('Cost Reimbursements'),
                ),
                const DropdownMenuItem(
                  value: 'advance_payments',
                  child: Text('Advance Payments'),
                ),
                const DropdownMenuItem(
                  value: 'operational_costs',
                  child: Text('Operational Costs'),
                ),
                const DropdownMenuItem(
                  value: 'wallet_withdrawals',
                  child: Text('Wallet Withdrawals'),
                ),
                const DropdownMenuItem(
                  value: 'feedback',
                  child: Text('Feedback'),
                ),
                const DropdownMenuItem(
                  value: 'role_changes',
                  child: Text('Role Changes'),
                ),
              ],
              onChanged: (value) {
                setState(() => _selectedCategory = value ?? 'all');
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonFormField<String>(
              value: _selectedStatus,
              decoration: InputDecoration(
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                labelText: 'Status',
              ),
              items: const [
                DropdownMenuItem(value: 'all', child: Text('All')),
                DropdownMenuItem(value: 'PENDING', child: Text('Pending')),
                DropdownMenuItem(value: 'FORWARDED', child: Text('Forwarded')),
                DropdownMenuItem(value: 'APPROVED', child: Text('Approved')),
                DropdownMenuItem(value: 'REJECTED', child: Text('Rejected')),
                DropdownMenuItem(value: 'RETURNED', child: Text('Returned')),
              ],
              onChanged: (value) {
                setState(() => _selectedStatus = value ?? 'all');
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Build bulk action bar (appears when items selected)
  Widget _buildBulkActionBar(BuildContext context) {
    return Container(
      color: AppColors.primaryBlue.withOpacity(0.1),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${_selectedActionIds.length} selected',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          ElevatedButton(
            onPressed: () => _markAsActed(),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
            child: const Text('Acted'),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: () => _markAsIgnored(),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
            child: const Text('Ignored'),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () {
              setState(() {
                _selectedActionIds.clear();
                _isMultiSelectMode = false;
              });
            },
          ),
        ],
      ),
    );
  }

  /// Build the main category expansion list with real-time updates
  Widget _buildCategoryList(BuildContext context) {
    // Use real-time stream if available, fallback to initial future load
    return ref
        .watch(monitoringRealtimeProvider)
        .when(
          data: (allActions) {
            return _buildFilteredCategoryList(context, allActions);
          },
          loading: () {
            // Show initial data while stream loads
            return ref
                .watch(monitoringActionsProvider)
                .when(
                  data: (initialActions) =>
                      _buildFilteredCategoryList(context, initialActions),
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (err, _) => Center(child: Text('Error: $err')),
                );
          },
          error: (err, _) {
            // Fallback to future provider on real-time error
            return ref
                .watch(monitoringActionsProvider)
                .when(
                  data: (actions) =>
                      _buildFilteredCategoryList(context, actions),
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('Error: $e')),
                );
          },
        );
  }

  /// Build filtered and grouped category list
  Widget _buildFilteredCategoryList(
    BuildContext context,
    List<MonitoringAction> allActions,
  ) {
    // Group actions by category
    final Map<String, List<MonitoringAction>> grouped = {};
    for (final action in allActions) {
      final key = action.type;
      grouped.putIfAbsent(key, () => []).add(action);
    }

    // Apply filters (category, status, search)
    final filtered = grouped.map((key, actions) {
      var filtered = actions;

      if (_selectedCategory != 'all') {
        filtered = filtered.where((a) => a.type == _selectedCategory).toList();
      }

      if (_selectedStatus != 'all') {
        filtered = filtered.where((a) => a.status == _selectedStatus).toList();
      }

      // Apply search filter across multiple fields
      if (_searchQuery.isNotEmpty) {
        filtered = filtered.where((a) {
          return a.senderName.toLowerCase().contains(_searchQuery) ||
              a.id.toLowerCase().contains(_searchQuery) ||
              (a.details?.toLowerCase().contains(_searchQuery) ?? false);
        }).toList();
      }

      return MapEntry(key, filtered);
    });

    // Remove empty categories
    filtered.removeWhere((_, v) => v.isEmpty);

    return RefreshIndicator(
      onRefresh: () async {
        ref.refresh(monitoringActionsProvider);
      },
      child: filtered.isEmpty
          ? Center(
              child: Text(
                _searchQuery.isNotEmpty
                    ? 'No actions match your search'
                    : 'No actions to display',
              ),
            )
          : ListView(
              children: filtered.entries.map((entry) {
                return _buildCategoryTile(entry.key, entry.value);
              }).toList(),
            ),
    );
  }

  /// Build category expansion tile
  Widget _buildCategoryTile(
    String categoryType,
    List<MonitoringAction> actions,
  ) {
    final action = MonitoringAction(
      id: '',
      type: categoryType,
      senderId: '',
      senderName: '',
      status: 'PENDING',
      createdAt: DateTime.now(),
    );

    return ExpansionTile(
      title: Text(
        '${action.categoryLabel} (${actions.length})',
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
      children: actions.map((action) {
        return _buildActionRow(action);
      }).toList(),
    );
  }

  /// Build individual action row
  Widget _buildActionRow(MonitoringAction action) {
    final isSelected = _selectedActionIds.contains(action.id);

    return GestureDetector(
      onLongPress: () {
        setState(() {
          if (isSelected) {
            _selectedActionIds.remove(action.id);
          } else {
            _selectedActionIds.add(action.id);
          }
          _isMultiSelectMode = _selectedActionIds.isNotEmpty;
        });
      },
      onTap: () {
        if (_isMultiSelectMode) {
          setState(() {
            if (isSelected) {
              _selectedActionIds.remove(action.id);
            } else {
              _selectedActionIds.add(action.id);
            }
            _isMultiSelectMode = _selectedActionIds.isNotEmpty;
          });
        } else {
          _showActionDetails(action);
        }
      },
      child: Container(
        color: isSelected
            ? AppColors.primaryBlue.withOpacity(0.1)
            : Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Checkbox
            if (_isMultiSelectMode)
              Checkbox(
                value: isSelected,
                onChanged: (value) {
                  setState(() {
                    if (value ?? false) {
                      _selectedActionIds.add(action.id);
                    } else {
                      _selectedActionIds.remove(action.id);
                    }
                    _isMultiSelectMode = _selectedActionIds.isNotEmpty;
                  });
                },
              )
            else
              // Online indicator
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: action.isOnline ? Colors.green : Colors.grey,
                  ),
                ),
              ),

            // Sender avatar
            if (action.senderAvatar != null)
              CircleAvatar(
                radius: 20,
                backgroundImage: NetworkImage(action.senderAvatar!),
              )
            else
              const CircleAvatar(radius: 20, child: Icon(Icons.person)),

            const SizedBox(width: 12),

            // Sender info and details
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    action.senderName,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: action.statusColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          action.statusLabel,
                          style: TextStyle(
                            fontSize: 12,
                            color: action.statusColor,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        action.timeElapsed,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Chevron
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }

  /// Build export button bar at bottom
  Widget _buildExportBar(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey.shade300)),
      ),
      child: Row(
        children: [
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _exportCSV(),
              icon: const Icon(Icons.download),
              label: const Text('Export CSV'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () => _exportPDF(),
              icon: const Icon(Icons.picture_as_pdf),
              label: const Text('Export PDF'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Show action details in bottom sheet
  void _showActionDetails(MonitoringAction action) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return _ActionDetailsSheet(action: action);
      },
    );
  }

  /// Mark selected actions as acted
  Future<void> _markAsActed() async {
    try {
      final repository = ref.read(monitoringRepositoryProvider);
      await repository.changeStatusBulk(
        actionIds: _selectedActionIds.toList(),
        newStatus: 'acted',
      );

      // Refresh the provider to update UI
      ref.refresh(monitoringActionsProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_selectedActionIds.length} marked as acted'),
            backgroundColor: Colors.green,
          ),
        );
      }

      setState(() {
        _selectedActionIds.clear();
        _isMultiSelectMode = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  /// Mark selected actions as ignored
  Future<void> _markAsIgnored() async {
    try {
      final repository = ref.read(monitoringRepositoryProvider);
      await repository.changeStatusBulk(
        actionIds: _selectedActionIds.toList(),
        newStatus: 'ignored',
      );

      // Refresh the provider to update UI
      ref.refresh(monitoringActionsProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${_selectedActionIds.length} marked as ignored'),
            backgroundColor: Colors.orange,
          ),
        );
      }

      setState(() {
        _selectedActionIds.clear();
        _isMultiSelectMode = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  /// Export to CSV
  Future<void> _exportCSV() async {
    try {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Preparing CSV export...')));

      final repository = ref.read(monitoringRepositoryProvider);
      final downloadUrl = await repository.exportActions(
        format: 'csv',
        actionIds: _selectedActionIds.isNotEmpty
            ? _selectedActionIds.toList()
            : null,
        filters: null,
      );

      // Download file from URL
      final response_data = await http.get(Uri.parse(downloadUrl));

      if (response_data.statusCode == 200) {
        final directory = await getApplicationDocumentsDirectory();
        final fileName =
            'monitoring_export_${DateTime.now().millisecondsSinceEpoch}.csv';
        final filePath = '${directory.path}/$fileName';
        final file = File(filePath);
        await file.writeAsBytes(response_data.bodyBytes);

        // Share the file
        await Share.shareXFiles([
          XFile(filePath),
        ], subject: 'System Monitoring Export - CSV');

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('CSV exported successfully'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        throw Exception('Failed to download file');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Export error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Export to PDF
  Future<void> _exportPDF() async {
    try {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Preparing PDF export...')));

      final repository = ref.read(monitoringRepositoryProvider);
      final downloadUrl = await repository.exportActions(
        format: 'pdf',
        actionIds: _selectedActionIds.isNotEmpty
            ? _selectedActionIds.toList()
            : null,
        filters: null,
      );

      // Download file from URL
      final response_data = await http.get(Uri.parse(downloadUrl));

      if (response_data.statusCode == 200) {
        final directory = await getApplicationDocumentsDirectory();
        final fileName =
            'monitoring_export_${DateTime.now().millisecondsSinceEpoch}.pdf';
        final filePath = '${directory.path}/$fileName';
        final file = File(filePath);
        await file.writeAsBytes(response_data.bodyBytes);

        // Share the file
        await Share.shareXFiles([
          XFile(filePath),
        ], subject: 'System Monitoring Export - PDF');

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('PDF exported successfully'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        throw Exception('Failed to download file');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Export error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

/// Bottom sheet showing full action details with workflow controls
class _ActionDetailsSheet extends ConsumerStatefulWidget {
  final MonitoringAction action;

  const _ActionDetailsSheet({required this.action});

  @override
  ConsumerState<_ActionDetailsSheet> createState() =>
      _ActionDetailsSheetState();
}

class _ActionDetailsSheetState extends ConsumerState<_ActionDetailsSheet> {
  late TextEditingController _notesController;
  String _selectedAwareness = 'no_response';

  @override
  void initState() {
    super.initState();
    _notesController = TextEditingController(text: widget.action.notes ?? '');
    _selectedAwareness = widget.action.adminAwareness;
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      widget.action.senderName,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: widget.action.statusColor,
                      child: Icon(
                        _getStatusIcon(widget.action.status),
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Status info
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: widget.action.statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Status: ${widget.action.statusLabel}',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: widget.action.statusColor,
                        ),
                      ),
                      Text(
                        'Created: ${DateFormat('MMM d, yyyy HH:mm').format(widget.action.createdAt)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Details
                Text(
                  'Details',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                if (widget.action.details != null)
                  Text(widget.action.details!)
                else
                  const Text('No additional details'),
                const SizedBox(height: 16),

                // Receipt section (if available)
                if (widget.action.receiptUrl != null) ...[
                  _buildReceiptSection(),
                  const SizedBox(height: 16),
                ],

                // Status history timeline
                Text(
                  'Status History',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                ...widget.action.statusHistory.map((status) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.blue,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(status)),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: 16),

                // Workflow action buttons
                Text(
                  'Workflow Actions',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _executeWorkflow('approve'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('Approve'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _executeWorkflow('reject'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('Reject'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _executeWorkflow('return'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('Return'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Admin awareness section
                Text(
                  'Mark as',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Acted'),
                        selected: _selectedAwareness == 'acted',
                        onSelected: (selected) {
                          setState(() => _selectedAwareness = 'acted');
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Ignored'),
                        selected: _selectedAwareness == 'ignored',
                        onSelected: (selected) {
                          setState(() => _selectedAwareness = 'ignored');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Notes section
                Text(
                  'Notes',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _notesController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Add your notes here',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Close button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Close'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Build receipt section with document display (not just link)
  Widget _buildReceiptSection() {
    final receiptType = widget.action.receiptType ?? 'document';
    final receiptName = widget.action.receiptFileName ?? 'Receipt Document';

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF20C997), width: 2),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Receipt label
          Text(
            'Payment Receipt / إيصال الدفع',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
              color: Color(0xFF20C997),
            ),
          ),
          const SizedBox(height: 12),

          // Document info box
          Container(
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                // File icon based on type
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: _getReceiptIconColor(receiptType),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Center(
                    child: Icon(
                      _getReceiptIcon(receiptType),
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                ),
                const SizedBox(width: 12),

                // File details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Document / وثيقة',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.grey,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        receiptName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w500,
                          fontSize: 13,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Open document button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _openReceiptDocument(),
              icon: const Icon(Icons.open_in_new),
              label: const Text('Open Full Document'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF20C997),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Get icon for receipt type
  IconData _getReceiptIcon(String receiptType) {
    switch (receiptType.toLowerCase()) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'image':
      case 'jpg':
      case 'png':
        return Icons.image;
      case 'document':
      case 'docx':
      case 'doc':
        return Icons.description;
      default:
        return Icons.insert_drive_file;
    }
  }

  /// Get background color for receipt icon
  Color _getReceiptIconColor(String receiptType) {
    switch (receiptType.toLowerCase()) {
      case 'pdf':
        return Colors.red;
      case 'image':
      case 'jpg':
      case 'png':
        return Colors.blue;
      case 'document':
      case 'docx':
      case 'doc':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  /// Open receipt document (triggers download/view)
  Future<void> _openReceiptDocument() async {
    try {
      if (widget.action.receiptUrl == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No receipt URL available')),
        );
        return;
      }

      // Download and open the document
      final response = await http.get(Uri.parse(widget.action.receiptUrl!));

      if (response.statusCode == 200) {
        final directory = await getApplicationDocumentsDirectory();
        final fileName =
            widget.action.receiptFileName ??
            'receipt_${DateTime.now().millisecondsSinceEpoch}';
        final filePath = '${directory.path}/$fileName';
        final file = File(filePath);
        await file.writeAsBytes(response.bodyBytes);

        // Share the file to view it
        await Share.shareXFiles([XFile(filePath)], subject: 'Receipt Document');
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to download receipt')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error opening receipt: $e')));
      }
    }
  }

  /// Execute workflow action
  Future<void> _executeWorkflow(String action) async {
    try {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Executing: $action...')));

      final repository = ref.read(monitoringRepositoryProvider);
      await repository.executeWorkflowAction(
        actionId: widget.action.id,
        action: action, // 'approve', 'reject', or 'return'
        notes: _notesController.text.isNotEmpty ? _notesController.text : null,
      );

      // Refresh the provider to update UI
      ref.refresh(monitoringActionsProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Action $action executed successfully'),
            backgroundColor: Colors.green,
          ),
        );

        // Close the bottom sheet
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  /// Get icon for status
  IconData _getStatusIcon(String status) {
    switch (status) {
      case 'APPROVED':
        return Icons.check_circle;
      case 'REJECTED':
        return Icons.cancel;
      case 'RETURNED':
        return Icons.refresh;
      default:
        return Icons.pending;
    }
  }
}
