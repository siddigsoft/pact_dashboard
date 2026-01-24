// lib/widgets/offline_queue_dashboard.dart

import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/offline_queue_service.dart';
import '../theme/app_colors.dart';

class OfflineQueueDashboard extends StatefulWidget {
  final bool isArabic;
  final VoidCallback? onRetryAll;
  final VoidCallback? onClearCompleted;

  const OfflineQueueDashboard({
    super.key,
    this.isArabic = false,
    this.onRetryAll,
    this.onClearCompleted,
  });

  @override
  State<OfflineQueueDashboard> createState() => _OfflineQueueDashboardState();
}

class _OfflineQueueDashboardState extends State<OfflineQueueDashboard> {
  final _queueService = OfflineQueueService();

  @override
  void initState() {
    super.initState();
    _queueService.initialize();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<OfflineQueueItem>>(
      stream: _queueService.queueStream,
      builder: (context, snapshot) {
        final items = snapshot.data ?? _queueService.allItems;
        final status = _queueService.getStatus();

        return Container(
          margin: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildHeader(status),
              if (items.isNotEmpty) ...[
                const Divider(height: 1),
                _buildItemsList(items),
              ] else
                _buildEmptyState(),
              if (status.hasFailed || status.hasPending)
                _buildActions(status),
            ],
          ),
        );
      },
    );
  }

  Widget _buildHeader(OfflineQueueStatus status) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: status.isSyncing
            ? LinearGradient(colors: [AppColors.primaryBlue, AppColors.primaryBlue.withOpacity(0.8)])
            : status.hasFailed
                ? LinearGradient(colors: [Colors.red.shade400, Colors.red.shade300])
                : status.hasPending
                    ? LinearGradient(colors: [AppColors.primaryOrange, AppColors.primaryOrange.withOpacity(0.8)])
                    : LinearGradient(colors: [Colors.green.shade400, Colors.green.shade300]),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16),
          topRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              status.isSyncing
                  ? Icons.sync
                  : status.hasFailed
                      ? Icons.error_outline
                      : status.hasPending
                          ? Icons.cloud_upload_outlined
                          : Icons.cloud_done_outlined,
              color: Colors.white,
              size: 24,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.isArabic ? 'قائمة المزامنة' : 'Sync Queue',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                Text(
                  _getStatusText(status),
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.white.withOpacity(0.9),
                  ),
                ),
              ],
            ),
          ),
          if (status.isSyncing)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ),
        ],
      ),
    );
  }

  String _getStatusText(OfflineQueueStatus status) {
    if (status.isSyncing) {
      return widget.isArabic ? 'جاري المزامنة...' : 'Syncing...';
    }
    if (status.hasFailed) {
      return widget.isArabic 
          ? '${status.failedCount} عناصر فشلت' 
          : '${status.failedCount} items failed';
    }
    if (status.hasPending) {
      return widget.isArabic 
          ? '${status.pendingCount} عناصر في الانتظار' 
          : '${status.pendingCount} items pending';
    }
    return widget.isArabic ? 'كل شيء متزامن' : 'All synced';
  }

  Widget _buildItemsList(List<OfflineQueueItem> items) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 300),
      child: ListView.separated(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 56),
        itemBuilder: (context, index) => _buildQueueItem(items[index]),
      ),
    );
  }

  Widget _buildQueueItem(OfflineQueueItem item) {
    Color statusColor;
    IconData statusIcon;
    String statusText;

    switch (item.status) {
      case QueueItemStatus.pending:
        statusColor = AppColors.primaryOrange;
        statusIcon = Icons.schedule;
        statusText = widget.isArabic ? 'في الانتظار' : 'Pending';
        break;
      case QueueItemStatus.syncing:
        statusColor = AppColors.primaryBlue;
        statusIcon = Icons.sync;
        statusText = widget.isArabic ? 'جاري المزامنة' : 'Syncing';
        break;
      case QueueItemStatus.completed:
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        statusText = widget.isArabic ? 'مكتمل' : 'Completed';
        break;
      case QueueItemStatus.failed:
        statusColor = Colors.red;
        statusIcon = Icons.error;
        statusText = widget.isArabic ? 'فشل' : 'Failed';
        break;
      case QueueItemStatus.retrying:
        statusColor = AppColors.primaryOrange;
        statusIcon = Icons.refresh;
        statusText = widget.isArabic ? 'إعادة المحاولة' : 'Retrying';
        break;
    }

    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: statusColor.withOpacity(0.1),
          shape: BoxShape.circle,
        ),
        child: Icon(
          _getTypeIcon(item.type),
          color: statusColor,
          size: 20,
        ),
      ),
      title: Text(
        widget.isArabic ? item.typeLabelAr : item.typeLabel,
        style: GoogleFonts.poppins(
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _formatTime(item.createdAt),
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: Colors.grey.shade600,
            ),
          ),
          if (item.errorMessage != null)
            Text(
              item.errorMessage!,
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: Colors.red,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(statusIcon, size: 14, color: statusColor),
                const SizedBox(width: 4),
                Text(
                  statusText,
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: statusColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          if (item.status == QueueItemStatus.failed)
            IconButton(
              icon: const Icon(Icons.refresh, size: 20),
              onPressed: () => _queueService.retryItem(item.id),
              tooltip: widget.isArabic ? 'إعادة المحاولة' : 'Retry',
            ),
        ],
      ),
    );
  }

  IconData _getTypeIcon(QueueItemType type) {
    switch (type) {
      case QueueItemType.siteVisitStart:
        return Icons.play_circle_outline;
      case QueueItemType.siteVisitComplete:
        return Icons.check_circle_outline;
      case QueueItemType.costSubmission:
        return Icons.attach_money;
      case QueueItemType.photoUpload:
        return Icons.photo_camera;
      case QueueItemType.signatureUpload:
        return Icons.draw;
      case QueueItemType.reportSubmission:
        return Icons.description;
      case QueueItemType.gpsLocation:
        return Icons.location_on;
      case QueueItemType.permitUpload:
        return Icons.file_upload;
    }
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 1) {
      return widget.isArabic ? 'الآن' : 'Just now';
    }
    if (diff.inMinutes < 60) {
      return widget.isArabic 
          ? 'منذ ${diff.inMinutes} دقيقة' 
          : '${diff.inMinutes}m ago';
    }
    if (diff.inHours < 24) {
      return widget.isArabic 
          ? 'منذ ${diff.inHours} ساعة' 
          : '${diff.inHours}h ago';
    }
    return widget.isArabic 
        ? 'منذ ${diff.inDays} يوم' 
        : '${diff.inDays}d ago';
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          Icon(
            Icons.cloud_done,
            size: 48,
            color: Colors.grey.shade300,
          ),
          const SizedBox(height: 12),
          Text(
            widget.isArabic 
                ? 'لا توجد عناصر في قائمة الانتظار' 
                : 'No items in queue',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey.shade500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActions(OfflineQueueStatus status) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(16),
          bottomRight: Radius.circular(16),
        ),
      ),
      child: Row(
        children: [
          if (status.hasFailed)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  await _queueService.retryFailed();
                  widget.onRetryAll?.call();
                },
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(widget.isArabic ? 'إعادة المحاولة' : 'Retry All'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primaryBlue,
                ),
              ),
            ),
          if (status.hasFailed) const SizedBox(width: 8),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () async {
                await _queueService.clearCompleted();
                widget.onClearCompleted?.call();
              },
              icon: const Icon(Icons.delete_sweep, size: 18),
              label: Text(widget.isArabic ? 'مسح المكتمل' : 'Clear Done'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey.shade200,
                foregroundColor: Colors.grey.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class OfflineQueueIndicator extends StatelessWidget {
  final bool isArabic;
  final VoidCallback? onTap;

  const OfflineQueueIndicator({
    super.key,
    this.isArabic = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final queueService = OfflineQueueService();

    return StreamBuilder<OfflineQueueStatus>(
      stream: queueService.statusStream,
      builder: (context, snapshot) {
        final status = snapshot.data ?? queueService.getStatus();

        if (status.isEmpty) return const SizedBox.shrink();

        return GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: status.hasFailed 
                  ? Colors.red.shade100 
                  : status.isSyncing 
                      ? AppColors.primaryBlue.withOpacity(0.1)
                      : AppColors.primaryOrange.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (status.isSyncing)
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(
                    status.hasFailed ? Icons.error_outline : Icons.cloud_upload,
                    size: 16,
                    color: status.hasFailed ? Colors.red : AppColors.primaryOrange,
                  ),
                const SizedBox(width: 6),
                Text(
                  '${status.pendingCount + status.failedCount}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: status.hasFailed ? Colors.red : AppColors.primaryOrange,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
