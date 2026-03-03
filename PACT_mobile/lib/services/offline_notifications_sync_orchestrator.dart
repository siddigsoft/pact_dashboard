import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:async';
import 'offline_notifications_retry_handler.dart';
import 'offline_queue_manager.dart';

/// Enhanced sync orchestrator that coordinates retry logic with notification syncing
class OfflineNotificationsSyncOrchestrator {
  final OfflineNotificationRetryHandler _retryHandler =
      OfflineNotificationRetryHandler();
  final RetryMetrics _metrics = RetryMetrics();

  late Box<Map> _notificationBox;
  final _syncProgressController = StreamController<SyncProgress>.broadcast();

  Stream<SyncProgress> get syncProgressStream => _syncProgressController.stream;

  RetryMetrics get metrics => _metrics;

  /// Initialize the orchestrator
  Future<void> initialize(Box<Map> notificationBox) async {
    _notificationBox = notificationBox;
    debugPrint('[SyncOrchestrator] Initialized with retry handler');
  }

  /// Orchestrate sync with automatic retry logic
  /// Returns number of successfully synced items
  Future<int> orchestrateSync(
    Future<bool> Function(Map<String, dynamic> notification) syncFunction, {
    bool retryFailed = true,
    int maxRetries = 3,
  }) async {
    int totalSynced = 0;

    try {
      // Get all notifications
      final notifications = _notificationBox.values
          .map((n) => Map<String, dynamic>.from(n))
          .toList();

      if (notifications.isEmpty) {
        debugPrint('[SyncOrchestrator] No notifications to sync');
        return 0;
      }

      // Sort by priority
      final sorted = OfflineQueueManager.sortByPriority(notifications);

      _syncProgressController.add(
        SyncProgress(
          total: sorted.length,
          completed: 0,
          failed: 0,
          status: 'Syncing priority queue...',
        ),
      );

      // Sync in priority order with retry logic
      int completed = 0;
      int failed = 0;

      for (final item in sorted) {
        final itemId = item['id'] as String;

        // Skip already synced or recently failed
        if (item['synced'] == true) {
          completed++;
          continue;
        }

        // Check if should retry based on retry state
        if (!_retryHandler.shouldRetry(itemId)) {
          debugPrint(
            '[SyncOrchestrator] Skipping $itemId - retry window not ready',
          );
          failed++;
          _syncProgressController.add(
            SyncProgress(
              total: sorted.length,
              completed: completed,
              failed: failed,
              status: 'Retrying failed items...',
              currentItem: item['title'],
            ),
          );
          continue;
        }

        // Attempt sync
        try {
          final success = await syncFunction(item);

          if (success) {
            // Mark as synced
            final index = _notificationBox.values.toList().indexWhere((n) {
              final notif = Map<String, dynamic>.from(n);
              return notif['id'] == itemId;
            });

            if (index >= 0) {
              item['synced'] = true;
              await _notificationBox.putAt(index, item);
            }

            _retryHandler.clearRetry(itemId);
            _metrics.recordSuccess();
            debugPrint('[SyncOrchestrator] ✓ Synced $itemId');
            totalSynced++;
          } else {
            _retryHandler.recordRetryAttempt(itemId);
            _metrics.recordFailure(itemId);
            debugPrint(
              '[SyncOrchestrator] ✗ Failed to sync $itemId, will retry',
            );
            failed++;
          }
        } catch (e) {
          _retryHandler.recordRetryAttempt(itemId);
          _metrics.recordFailure(itemId);
          debugPrint('[SyncOrchestrator] Error syncing $itemId: $e');
          failed++;
        }

        completed++;
        _syncProgressController.add(
          SyncProgress(
            total: sorted.length,
            completed: completed,
            failed: failed,
            status: 'Syncing $completed/${sorted.length}',
            currentItem: item['title'],
          ),
        );

        // Throttle to avoid overwhelming server
        await Future.delayed(const Duration(milliseconds: 100));
      }

      debugPrint(
        '[SyncOrchestrator] Sync complete: $totalSynced/${sorted.length} synced',
      );

      return totalSynced;
    } catch (e) {
      debugPrint('[SyncOrchestrator] Orchestration error: $e');
      rethrow;
    }
  }

  /// Get pending retries for manual trigger
  List<String> getPendingRetries() => _retryHandler.getPendingRetries();

  /// Manually retry a specific notification
  Future<bool> retryNotification(
    String notificationId,
    Future<bool> Function(Map<String, dynamic> notification) syncFunction,
  ) async {
    try {
      final index = _notificationBox.values.toList().indexWhere((n) {
        final notif = Map<String, dynamic>.from(n);
        return notif['id'] == notificationId;
      });

      if (index < 0) return false;

      final item = Map<String, dynamic>.from(_notificationBox.getAt(index)!);
      final success = await syncFunction(item);

      if (success) {
        item['synced'] = true;
        await _notificationBox.putAt(index, item);
        _retryHandler.clearRetry(notificationId);
        _metrics.recordSuccess();
        return true;
      } else {
        _retryHandler.recordRetryAttempt(notificationId);
        _metrics.recordFailure(notificationId);
        return false;
      }
    } catch (e) {
      debugPrint('[SyncOrchestrator] Error retrying: $e');
      return false;
    }
  }

  /// Get retry state for a notification
  int getRetryCount(String notificationId) =>
      _retryHandler.getRetryCount(notificationId);

  /// Get next retry time for a notification
  DateTime? getNextRetryTime(String notificationId) {
    final retryCount = _retryHandler.getRetryCount(notificationId);
    if (retryCount < OfflineNotificationRetryHandler.MAX_RETRIES) {
      final state = _retryHandler._retryStates[notificationId];
      if (state != null) return state.nextRetryTime;
    }
    return null;
  }

  /// Reset all retry states
  void reset() {
    _retryHandler.reset();
    _metrics.reset();
    debugPrint('[SyncOrchestrator] Reset all retry states and metrics');
  }

  /// Cleanup and dispose
  void dispose() {
    _syncProgressController.close();
  }
}

/// Tracks sync progress for UI updates
class SyncProgress {
  final int total;
  final int completed;
  final int failed;
  final String status;
  final String? currentItem;

  int get pending => total - completed - failed;

  double get progress => total > 0 ? completed / total : 0;

  SyncProgress({
    required this.total,
    required this.completed,
    required this.failed,
    required this.status,
    this.currentItem,
  });

  @override
  String toString() =>
      'SyncProgress(total: $total, done: $completed, failed: $failed, status: $status)';
}
