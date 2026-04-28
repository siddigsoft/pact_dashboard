import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/wallet_audit_service.dart';
import '../theme/app_colors.dart';

/// Modal dialog showing audit log history
class AuditLogViewerModal extends StatefulWidget {
  final String userId;
  final bool isArabic;
  final WalletAuditService auditService;

  const AuditLogViewerModal({
    super.key,
    required this.userId,
    this.isArabic = false,
    required this.auditService,
  });

  @override
  State<AuditLogViewerModal> createState() => _AuditLogViewerModalState();
}

class _AuditLogViewerModalState extends State<AuditLogViewerModal> {
  late Future<List<Map<String, dynamic>>> _auditLogsFuture;
  String _selectedFilter = 'all';

  final Map<String, String> _actionTypeLabels = {
    'withdrawal_request': 'Withdrawal Request',
    'receipt_confirmation': 'Receipt Confirmation',
    'receipt_decline': 'Receipt Decline',
    'wallet_sync': 'Wallet Sync',
    'statement_export': 'Statement Export',
    'transaction_search': 'Search',
  };

  final Map<String, Color> _actionTypeColors = {
    'withdrawal_request': Colors.blue,
    'receipt_confirmation': Colors.green,
    'receipt_decline': Colors.orange,
    'wallet_sync': Colors.teal,
    'statement_export': Colors.purple,
    'transaction_search': Colors.indigo,
  };

  @override
  void initState() {
    super.initState();
    _loadAuditLogs();
  }

  void _loadAuditLogs() {
    setState(() {
      _auditLogsFuture = widget.auditService.getAuditLogs(
        userId: widget.userId,
        limit: 50,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            widget.isArabic ? 'سجل النشاط' : 'Activity Log',
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w700,
              fontSize: 18,
            ),
          ),
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: () => Navigator.pop(context),
          ),
          backgroundColor: AppColors.primaryBlue,
          elevation: 0,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
        ),
        body: Column(
          children: [
            // Filter tabs
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildFilterChip('all', widget.isArabic ? 'الكل' : 'All'),
                    ...[
                      'withdrawal_request',
                      'receipt_confirmation',
                      'wallet_sync',
                    ].map(
                      (type) => _buildFilterChip(
                        type,
                        _actionTypeLabels[type] ?? type,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Audit logs list
            Expanded(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: _auditLogsFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return Center(
                      child: CircularProgressIndicator(
                        color: AppColors.primaryBlue,
                      ),
                    );
                  }

                  if (snapshot.hasError) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.error_outline_rounded,
                              size: 48,
                              color: Colors.red,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              widget.isArabic
                                  ? 'خطأ في تحميل السجلات'
                                  : 'Error loading logs',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  final logs = snapshot.data ?? [];

                  // Filter logs
                  final filteredLogs = _selectedFilter == 'all'
                      ? logs
                      : logs
                            .where(
                              (log) => log['action_type'] == _selectedFilter,
                            )
                            .toList();

                  if (filteredLogs.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.history_rounded,
                              size: 48,
                              color: Colors.grey.shade400,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              widget.isArabic
                                  ? 'لا توجد سجلات'
                                  : 'No activity yet',
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: filteredLogs.length,
                    itemBuilder: (context, index) {
                      final log = filteredLogs[index];
                      return _buildAuditLogItem(log);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String value, String label) {
    final isSelected = _selectedFilter == value;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: FilterChip(
        label: Text(
          label,
          style: GoogleFonts.poppins(
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            fontSize: 12,
          ),
        ),
        selected: isSelected,
        onSelected: (_) {
          setState(() => _selectedFilter = value);
        },
        backgroundColor: Colors.grey.shade200,
        selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
        labelStyle: TextStyle(
          color: isSelected ? AppColors.primaryBlue : Colors.grey.shade700,
        ),
        side: BorderSide(
          color: isSelected ? AppColors.primaryBlue : Colors.transparent,
          width: 1.5,
        ),
      ),
    );
  }

  Widget _buildAuditLogItem(Map<String, dynamic> log) {
    final actionType = log['action_type'] as String? ?? 'unknown';
    final timestamp = log['timestamp'];
    final description = log['description'] as String? ?? '';
    final status = log['status'] as String? ?? 'success';

    DateTime parsedTime;
    try {
      parsedTime = DateTime.parse(timestamp.toString());
    } catch (_) {
      parsedTime = DateTime.now();
    }

    final relativeTime = widget.auditService.formatRelativeTime(parsedTime);
    final actionColor = _actionTypeColors[actionType] ?? Colors.grey;
    final actionLabel = _actionTypeLabels[actionType] ?? actionType;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 4),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Action icon
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: actionColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _getIconForActionType(actionType),
                color: actionColor,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            // Action details
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Flexible(
                        child: Text(
                          actionLabel,
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                            color: Colors.grey.shade800,
                          ),
                        ),
                      ),
                      if (status == 'success')
                        Icon(
                          Icons.check_circle_rounded,
                          size: 16,
                          color: Colors.green.shade600,
                        )
                      else
                        Icon(
                          Icons.error_rounded,
                          size: 16,
                          color: Colors.red.shade600,
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  if (description.isNotEmpty)
                    Text(
                      description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  const SizedBox(height: 6),
                  Text(
                    relativeTime,
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      color: Colors.grey.shade500,
                      fontWeight: FontWeight.w500,
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

  IconData _getIconForActionType(String actionType) {
    return {
          'withdrawal_request': Icons.arrow_downward_rounded,
          'receipt_confirmation': Icons.check_circle_rounded,
          'receipt_decline': Icons.cancel_rounded,
          'wallet_sync': Icons.sync_rounded,
          'statement_export': Icons.file_download_rounded,
          'transaction_search': Icons.search_rounded,
        }[actionType] ??
        Icons.description_rounded;
  }
}
