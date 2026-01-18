// lib/widgets/sync_status_indicator.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../services/offline_data_service.dart';
import '../theme/app_colors.dart';

class SyncStatusIndicator extends StatefulWidget {
  final bool showDetails;
  final VoidCallback? onSyncPressed;
  
  const SyncStatusIndicator({
    super.key,
    this.showDetails = false,
    this.onSyncPressed,
  });

  @override
  State<SyncStatusIndicator> createState() => _SyncStatusIndicatorState();
}

class _SyncStatusIndicatorState extends State<SyncStatusIndicator> with SingleTickerProviderStateMixin {
  final OfflineDataService _offlineService = OfflineDataService();
  
  int _pendingCount = 0;
  Map<String, int> _pendingByType = {};
  bool _isOnline = true;
  bool _isSyncing = false;
  Timer? _refreshTimer;
  late AnimationController _animationController;
  StreamSubscription? _connectivitySubscription;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    );
    _checkConnectivity();
    _loadPendingCount();
    _startPeriodicRefresh();
    _listenToConnectivity();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _animationController.dispose();
    _connectivitySubscription?.cancel();
    super.dispose();
  }

  void _startPeriodicRefresh() {
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _loadPendingCount();
    });
  }

  void _listenToConnectivity() {
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((result) {
      final wasOffline = !_isOnline;
      setState(() {
        _isOnline = !result.contains(ConnectivityResult.none);
      });
      
      // Auto-sync when coming back online
      if (wasOffline && _isOnline && _pendingCount > 0 && !_isSyncing) {
        _syncAll();
      }
    });
  }

  Future<void> _checkConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    if (mounted) {
      setState(() {
        _isOnline = !result.contains(ConnectivityResult.none);
      });
    }
  }

  Future<void> _loadPendingCount() async {
    try {
      final count = await _offlineService.getPendingSyncCount();
      final byType = await _offlineService.getPendingActionsByType();
      if (mounted) {
        setState(() {
          _pendingCount = count;
          _pendingByType = byType;
        });
      }
    } catch (e) {
      debugPrint('[SyncStatusIndicator] Error loading pending count: $e');
    }
  }

  Future<void> _syncAll() async {
    if (!_isOnline || _isSyncing) return;
    
    setState(() => _isSyncing = true);
    _animationController.repeat();

    try {
      final results = await _offlineService.syncAll();
      final totalSynced = results.values.fold<int>(0, (sum, val) => sum + val);
      
      if (mounted && totalSynced > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Synced $totalSynced pending item${totalSynced > 1 ? 's' : ''}'),
            backgroundColor: AppColors.primaryGreen,
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 2),
          ),
        );
      }
      
      await _loadPendingCount();
    } catch (e) {
      debugPrint('[SyncStatusIndicator] Error syncing: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sync failed: $e'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSyncing = false);
        _animationController.stop();
        _animationController.reset();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pendingCount == 0 && !widget.showDetails) {
      return const SizedBox.shrink();
    }

    if (widget.showDetails) {
      return _buildDetailedView();
    }

    return _buildCompactView();
  }

  Widget _buildCompactView() {
    return GestureDetector(
      onTap: _isOnline && _pendingCount > 0 && !_isSyncing ? _syncAll : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: _isOnline ? AppColors.primaryOrange : Colors.grey,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isSyncing)
              RotationTransition(
                turns: _animationController,
                child: const Icon(Icons.sync, color: Colors.white, size: 16),
              )
            else
              const Icon(Icons.cloud_upload_outlined, color: Colors.white, size: 16),
            const SizedBox(width: 4),
            Text(
              _isSyncing ? 'Syncing...' : '$_pendingCount pending',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailedView() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: _isOnline 
                      ? AppColors.primaryGreen.withOpacity(0.1)
                      : Colors.orange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  _isOnline ? Icons.cloud_done : Icons.cloud_off,
                  color: _isOnline ? AppColors.primaryGreen : Colors.orange,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Sync Status',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      _isOnline ? 'Connected' : 'Offline - Will sync when connected',
                      style: GoogleFonts.poppins(
                        color: Colors.grey[600],
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (_pendingCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '$_pendingCount',
                    style: GoogleFonts.poppins(
                      color: Colors.orange[800],
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
            ],
          ),
          
          if (_pendingByType.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Text(
              'Pending Actions',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 8),
            ..._pendingByType.entries.map((entry) => _buildPendingItem(
              _getTypeLabel(entry.key),
              entry.value,
              _getTypeIcon(entry.key),
            )),
          ],
          
          if (_pendingCount > 0 && _isOnline) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isSyncing ? null : _syncAll,
                icon: _isSyncing
                    ? SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.sync, size: 18),
                label: Text(_isSyncing ? 'Syncing...' : 'Sync Now'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPendingItem(String label, int count, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey[600]),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 13,
                color: Colors.grey[700],
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.primaryOrange.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              count.toString(),
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryOrange,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _getTypeLabel(String type) {
    switch (type) {
      case 'accept_visit':
        return 'Accepted Visits';
      case 'start_visit':
        return 'Started Visits';
      case 'complete_visit':
        return 'Completed Visits';
      case 'visit_status':
        return 'Status Updates';
      case 'report':
        return 'Reports';
      case 'chat_message':
        return 'Messages';
      case 'site_location':
        return 'Site Locations';
      default:
        return type.replaceAll('_', ' ').toUpperCase();
    }
  }

  IconData _getTypeIcon(String type) {
    switch (type) {
      case 'accept_visit':
        return Icons.check_circle_outline;
      case 'start_visit':
        return Icons.play_circle_outline;
      case 'complete_visit':
        return Icons.task_alt;
      case 'visit_status':
        return Icons.update;
      case 'report':
        return Icons.article_outlined;
      case 'chat_message':
        return Icons.chat_bubble_outline;
      case 'site_location':
        return Icons.location_on_outlined;
      default:
        return Icons.pending_outlined;
    }
  }
}

class SyncStatusBadge extends StatefulWidget {
  const SyncStatusBadge({super.key});

  @override
  State<SyncStatusBadge> createState() => _SyncStatusBadgeState();
}

class _SyncStatusBadgeState extends State<SyncStatusBadge> {
  final OfflineDataService _offlineService = OfflineDataService();
  int _pendingCount = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadCount();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _loadCount());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadCount() async {
    final count = await _offlineService.getPendingSyncCount();
    if (mounted) {
      setState(() => _pendingCount = count);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pendingCount == 0) return const SizedBox.shrink();
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.primaryOrange,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$_pendingCount',
        style: GoogleFonts.poppins(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
