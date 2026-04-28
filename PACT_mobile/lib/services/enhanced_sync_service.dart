import 'dart:async';
import 'package:flutter/foundation.dart';
import 'connectivity_service.dart';

/// Result of a batch sync operation
class BatchSyncResult {
  final bool success;
  final int itemsProcessed;
  final int itemsFailed;
  final Duration duration;
  final String? error;
  final List<String> failedIds;

  BatchSyncResult({
    required this.success,
    required this.itemsProcessed,
    required this.itemsFailed,
    required this.duration,
    this.error,
    this.failedIds = const [],
  });

  double get successRate {
    final total = itemsProcessed + itemsFailed;
    return total == 0 ? 1.0 : itemsProcessed / total;
  }
}

/// Enhanced sync service for batch operations
class EnhancedSyncService {
  final ConnectivityService _connectivity;

  /// Sync states
  static const String stateIdle = 'idle';
  static const String stateSyncing = 'syncing';
  static const String stateQueued = 'queued';

  String _syncState = stateIdle;
  final StreamController<String> _syncStateController =
      StreamController<String>.broadcast();
  final StreamController<int> _progressController =
      StreamController<int>.broadcast();

  Timer? _autoSyncTimer;
  final Queue<Map<String, dynamic>> _syncQueue = Queue();
  bool _isSyncing = false;

  EnhancedSyncService(this._connectivity) {
    _initializeAutoSync();
  }

  String get syncState => _syncState;
  Stream<String> get syncStateStream => _syncStateController.stream;
  Stream<int> get progressStream => _progressController.stream;
  int get queueLength => _syncQueue.length;

  void _initializeAutoSync() {
    // Auto-sync every 2 minutes when online
    _autoSyncTimer = Timer.periodic(const Duration(minutes: 2), (timer) {
      if (_connectivity.isOnline && !_isSyncing) {
        performAutoSync();
      }
    });
  }

  /// Queue items for batch sync
  Future<void> queueForSync(
    String itemId,
    String operation, // 'create', 'update', 'delete'
    Map<String, dynamic> data,
  ) async {
    _syncQueue.add({
      'item_id': itemId,
      'operation': operation,
      'data': data,
      'timestamp': DateTime.now(),
      'retries': 0,
    });

    _updateSyncState(stateQueued);
    debugPrint('[EnhancedSync] Queued $operation for $itemId');
  }

  /// Perform batch sync of queued items
  Future<BatchSyncResult> performBatchSync({
    int maxRetries = 3,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (!_connectivity.isOnline) {
      return BatchSyncResult(
        success: false,
        itemsProcessed: 0,
        itemsFailed: _syncQueue.length,
        duration: Duration.zero,
        error: 'No internet connection',
        failedIds: _syncQueue.map((item) => item['item_id'] as String).toList(),
      );
    }

    _isSyncing = true;
    _updateSyncState(stateSyncing);

    final stopwatch = Stopwatch()..start();
    int processed = 0;
    int failed = 0;
    final failedIds = <String>[];

    try {
      final queueSize = _syncQueue.length;

      while (_syncQueue.isNotEmpty) {
        final item = _syncQueue.removeFirst();
        final itemId = item['item_id'] as String;

        try {
          final retries = item['retries'] as int;

          if (retries >= maxRetries) {
            failed++;
            failedIds.add(itemId);
            debugPrint('[EnhancedSync] Max retries exceeded for $itemId');
            continue;
          }

          // Simulate sync operation
          await _syncItem(item, timeout);

          processed++;
          _progressController.add((processed ~/ queueSize * 100).toInt());

          debugPrint('[EnhancedSync] Synced $itemId (${item['operation']})');
        } catch (e) {
          // Re-queue with incremented retry count
          item['retries'] = (item['retries'] as int) + 1;
          _syncQueue.add(item);

          failed++;
          failedIds.add(itemId);

          debugPrint('[EnhancedSync] Failed to sync $itemId: $e');
        }
      }

      stopwatch.stop();

      if (processed > 0 || failed > 0) {
        _updateSyncState(stateIdle);
      }

      return BatchSyncResult(
        success: failed == 0,
        itemsProcessed: processed,
        itemsFailed: failed,
        duration: stopwatch.elapsed,
        failedIds: failedIds,
      );
    } catch (e) {
      stopwatch.stop();
      _updateSyncState(stateIdle);

      return BatchSyncResult(
        success: false,
        itemsProcessed: processed,
        itemsFailed: _syncQueue.length,
        duration: stopwatch.elapsed,
        error: e.toString(),
      );
    } finally {
      _isSyncing = false;
    }
  }

  /// Sync a single item
  Future<void> _syncItem(Map<String, dynamic> item, Duration timeout) async {
    // This is a placeholder implementation
    // Override in subclasses to implement actual sync logic
    await Future.delayed(const Duration(milliseconds: 100));
  }

  /// Perform automatic sync
  Future<void> performAutoSync() async {
    if (_syncQueue.isEmpty) return;

    debugPrint('[EnhancedSync] Starting auto-sync...');
    final result = await performBatchSync(maxRetries: 2);

    if (result.success) {
      debugPrint(
        '[EnhancedSync] Auto-sync completed: ${result.itemsProcessed} items',
      );
    } else {
      debugPrint(
        '[EnhancedSync] Auto-sync failed: ${result.itemsFailed} items failed',
      );
    }
  }

  /// Get sync statistics
  Map<String, dynamic> getSyncStats() {
    return {
      'state': _syncState,
      'queuedItems': _syncQueue.length,
      'isSyncing': _isSyncing,
    };
  }

  void _updateSyncState(String newState) {
    _syncState = newState;
    _syncStateController.add(newState);
  }

  /// Clear entire sync queue
  Future<void> clearQueue() async {
    _syncQueue.clear();
    _updateSyncState(stateIdle);
    debugPrint('[EnhancedSync] Sync queue cleared');
  }

  /// Dispose service
  Future<void> dispose() async {
    _autoSyncTimer?.cancel();
    await _syncStateController.close();
    await _progressController.close();
  }
}
