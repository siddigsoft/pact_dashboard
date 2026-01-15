import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/offline_data_service.dart';
import '../theme/app_colors.dart';

/// Widget that shows offline sync status and allows manual sync
class OfflineSyncIndicator extends StatefulWidget {
  const OfflineSyncIndicator({super.key});

  @override
  State<OfflineSyncIndicator> createState() => _OfflineSyncIndicatorState();
}

class _OfflineSyncIndicatorState extends State<OfflineSyncIndicator> {
  final _offlineService = OfflineDataService();
  bool _isOnline = false;
  int _pendingCount = 0;
  bool _isSyncing = false;

  @override
  void initState() {
    super.initState();
    _checkStatus();
  }

  Future<void> _checkStatus() async {
    final isOnline = await _offlineService.isOnline();
    final pendingCount = await _offlineService.getPendingSyncCount();

    if (mounted) {
      setState(() {
        _isOnline = isOnline;
        _pendingCount = pendingCount;
      });
    }
  }

  Future<void> _syncNow() async {
    if (_isSyncing || !_isOnline) return;

    setState(() => _isSyncing = true);

    try {
      final results = await _offlineService.syncAll();
      final totalSynced = results.values.reduce((a, b) => a + b);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Synced $totalSynced items successfully'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );

        // Clear synced items
        await _offlineService.clearSyncedItems();
        await _checkStatus();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sync failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSyncing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Don't show if online and no pending items
    if (_isOnline && _pendingCount == 0) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: _isOnline ? Colors.orange.shade50 : Colors.red.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _isOnline ? Colors.orange.shade200 : Colors.red.shade200,
          width: 1,
        ),
      ),
      child: Row(
        children: [
          // Status Icon
          Icon(
            _isOnline ? Icons.sync : Icons.cloud_off,
            color: _isOnline ? AppColors.primaryOrange : Colors.red,
            size: 24,
          ),
          const SizedBox(width: 12),

          // Status Text
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _isOnline ? 'Pending Sync' : 'Offline Mode',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: _isOnline
                        ? AppColors.primaryOrange
                        : Colors.red.shade700,
                  ),
                ),
                if (_pendingCount > 0)
                  Text(
                    '$_pendingCount items waiting to sync',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey.shade700,
                    ),
                  ),
              ],
            ),
          ),

          // Sync Button
          if (_isOnline && _pendingCount > 0)
            Material(
              color: AppColors.primaryOrange,
              borderRadius: BorderRadius.circular(8),
              child: InkWell(
                onTap: _isSyncing ? null : _syncNow,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: _isSyncing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          'Sync Now',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
