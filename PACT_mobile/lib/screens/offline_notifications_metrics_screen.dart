import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pact_mobile/theme/app_colors.dart';
import 'package:pact_mobile/services/offline_notifications_service.dart';

/// Dashboard for viewing offline notifications metrics and statistics
class OfflineNotificationsMetricsScreen extends StatefulWidget {
  const OfflineNotificationsMetricsScreen({super.key});

  @override
  State<OfflineNotificationsMetricsScreen> createState() =>
      _OfflineNotificationsMetricsScreenState();
}

class _OfflineNotificationsMetricsScreenState
    extends State<OfflineNotificationsMetricsScreen> {
  late OfflineNotificationsService _service;
  int _queueCount = 0;
  final int _totalQueued = 0;
  final int _totalSynced = 0;
  final int _totalFailed = 0;
  final double _averageSyncTime = 0;
  NotificationSyncStatus _syncStatus = NotificationSyncStatus.idle;

  @override
  void initState() {
    super.initState();
    _service = OfflineNotificationsService();
    _initializeService();
  }

  Future<void> _initializeService() async {
    await _service.initialize();
    _updateMetrics();

    _service.queueCountStream.listen((count) {
      if (mounted) {
        setState(() => _queueCount = count);
      }
    });

    _service.syncStatusStream.listen((status) {
      if (mounted) {
        setState(() => _syncStatus = status);
      }
    });
  }

  Future<void> _updateMetrics() async {
    try {
      final queue = await _service.getQueuedNotifications();
      final dnd = await _service.getDndSettings();

      if (mounted) {
        setState(() {
          _queueCount = queue.length;
          // These would come from metrics box in real implementation
        });
      }
    } catch (e) {
      debugPrint('[Metrics] Error updating metrics: $e');
    }
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Offline Notifications',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        elevation: 0,
        backgroundColor: AppColors.primaryBlue,
      ),
      body: RefreshIndicator(
        onRefresh: _updateMetrics,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Status Overview Card
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.primaryBlue, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Sync Status',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textDark,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: _getStatusColor(_syncStatus),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _syncStatus.name.toUpperCase(),
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Current Queue: $_queueCount notifications',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primaryBlue,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Metrics Grid
              Text(
                'Statistics',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                children: [
                  _buildMetricCard(
                    label: 'Total Queued',
                    value: '$_totalQueued',
                    icon: Icons.cloud_queue,
                  ),
                  _buildMetricCard(
                    label: 'Successfully Synced',
                    value: '$_totalSynced',
                    icon: Icons.check_circle,
                  ),
                  _buildMetricCard(
                    label: 'Failed Syncs',
                    value: '$_totalFailed',
                    icon: Icons.error_outline,
                  ),
                  _buildMetricCard(
                    label: 'Avg Sync Time',
                    value: '${_averageSyncTime.toStringAsFixed(2)}ms',
                    icon: Icons.timer,
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Queue Details
              Text(
                'Queue Details',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade200, width: 1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildDetailRow('Current Queue Size', '$_queueCount'),
                    const Divider(height: 16),
                    _buildDetailRow('Max Capacity', '500'),
                    const Divider(height: 16),
                    _buildDetailRow(
                      'Usage',
                      '${((_queueCount / 500) * 100).toStringAsFixed(1)}%',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _updateMetrics,
                      icon: const Icon(Icons.refresh),
                      label: Text(
                        'Refresh',
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _showQueueDetails,
                      icon: const Icon(Icons.list),
                      label: Text(
                        'View Queue',
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.accentGreen,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricCard({
    required String label,
    required String value,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: AppColors.primaryBlue, size: 28),
          const SizedBox(height: 8),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: AppColors.textLight,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: GoogleFonts.poppins(fontSize: 14, color: AppColors.textDark),
        ),
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.primaryBlue,
          ),
        ),
      ],
    );
  }

  Color _getStatusColor(NotificationSyncStatus status) {
    switch (status) {
      case NotificationSyncStatus.idle:
        return Colors.grey;
      case NotificationSyncStatus.syncing:
        return Colors.orange;
      case NotificationSyncStatus.success:
        return AppColors.accentGreen;
      case NotificationSyncStatus.failed:
        return Colors.red;
      case NotificationSyncStatus.partiallyFailed:
        return Colors.amber;
    }
  }

  void _showQueueDetails() {
    showModalBottomSheet(
      context: context,
      builder: (context) => FutureBuilder<List<Map<String, dynamic>>>(
        future: _service.getQueuedNotifications(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final notifications = snapshot.data!;
          return ListView.builder(
            itemCount: notifications.length,
            itemBuilder: (context, index) {
              final notif = notifications[index];
              return ListTile(
                title: Text(notif['title'] ?? 'Unknown'),
                subtitle: Text(notif['body'] ?? ''),
                trailing: Icon(
                  notif['synced'] == true ? Icons.check : Icons.pending,
                  color: notif['synced'] == true
                      ? AppColors.accentGreen
                      : Colors.orange,
                ),
              );
            },
          );
        },
      ),
    );
  }
}
