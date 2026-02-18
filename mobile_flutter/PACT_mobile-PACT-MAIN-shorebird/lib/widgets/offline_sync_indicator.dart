import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/offline/offline_db.dart';
import '../services/offline/sync_manager.dart';
import '../theme/app_colors.dart';

/// Widget that shows offline sync status and allows manual sync
class OfflineSyncIndicator extends StatefulWidget {
  const OfflineSyncIndicator({super.key});

  @override
  State<OfflineSyncIndicator> createState() => _OfflineSyncIndicatorState();
}

class _OfflineSyncIndicatorState extends State<OfflineSyncIndicator> {
  final _offlineDb = OfflineDb();
  bool _isOnline = false;
  int _pendingCount = 0;
  bool _isSyncing = false;

  @override
  void initState() {
    super.initState();
    _checkStatus();
  }

  Future<void> _checkStatus() async {
    final connectivity = await Connectivity().checkConnectivity();
    final isOnline = !connectivity.contains(ConnectivityResult.none);
    final pendingCount = _offlineDb.getPendingSyncCount();

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
      final syncManager = SyncManager();
      try {
        syncManager.setSupabaseClient(Supabase.instance.client);
      } catch (e) {
        debugPrint('[OfflineSyncIndicator] Error setting Supabase client: $e');
      }
      debugPrint('[OfflineSyncIndicator] Starting sync...');
      final result = await syncManager.forceSync();
      debugPrint('[OfflineSyncIndicator] Sync completed: ${result.success}, synced: ${result.synced}, failed: ${result.failed}');

      if (mounted) {
        if (result.success && result.synced > 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Synced ${result.synced} items successfully'),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 2),
            ),
          );
        } else if (result.failed > 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Sync completed with ${result.failed} error${result.failed > 1 ? 's' : ''}'),
              backgroundColor: Colors.orange,
              duration: const Duration(seconds: 3),
            ),
          );
        }
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
