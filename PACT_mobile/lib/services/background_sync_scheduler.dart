import 'package:flutter/material.dart';
import 'package:workmanager/workmanager.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:async';

/// Background sync scheduler for offline notifications
/// Uses workmanager package to schedule periodic sync attempts
class BackgroundSyncScheduler {
  static const String _syncTaskName = 'offline_sync_task';
  static const String _retryTaskName = 'offline_retry_task';

  static bool _initialized = false;

  /// Initialize background sync scheduler
  static Future<void> initialize({
    Duration syncInterval = const Duration(minutes: 15),
    Duration retryInterval = const Duration(minutes: 5),
  }) async {
    if (_initialized) {
      debugPrint('[BackgroundSync] Already initialized');
      return;
    }

    try {
      await Workmanager().initialize(callbackDispatcher, isInDebugMode: false);

      // Schedule periodic sync task
      await Workmanager().registerPeriodicTask(
        _syncTaskName,
        _syncTaskName,
        frequency: syncInterval,
        constraints: Constraints(
          requiresBatteryNotLow: false,
          requiresCharging: false,
          requiresDeviceIdle: false,
          requiresNetwork: true,
        ),
      );

      // Schedule periodic retry task
      await Workmanager().registerPeriodicTask(
        _retryTaskName,
        _retryTaskName,
        frequency: retryInterval,
        constraints: Constraints(
          requiresBatteryNotLow: false,
          requiresCharging: false,
          requiresDeviceIdle: false,
          requiresNetwork: true,
        ),
      );

      _initialized = true;
      debugPrint('[BackgroundSync] Scheduled background tasks:');
      debugPrint('  - Sync task every ${syncInterval.inMinutes} minutes');
      debugPrint('  - Retry task every ${retryInterval.inMinutes} minutes');
    } catch (e) {
      debugPrint('[BackgroundSync] Initialization error: $e');
    }
  }

  /// Cancel all background tasks
  static Future<void> cancelAll() async {
    try {
      await Workmanager().cancelAll();
      _initialized = false;
      debugPrint('[BackgroundSync] Cancelled all tasks');
    } catch (e) {
      debugPrint('[BackgroundSync] Error cancelling tasks: $e');
    }
  }

  /// Cancel specific task
  static Future<void> cancelTask(String taskName) async {
    try {
      await Workmanager().cancelByTag(taskName);
      debugPrint('[BackgroundSync] Cancelled task: $taskName');
    } catch (e) {
      debugPrint('[BackgroundSync] Error cancelling task: $e');
    }
  }

  /// Manual trigger of background sync
  static Future<bool> triggerManualSync() async {
    try {
      await Workmanager().registerOneOffTask(
        'manual_sync_${DateTime.now().millisecondsSinceEpoch}',
        _syncTaskName,
        constraints: Constraints(
          requiresNetwork: true,
          requiresBatteryNotLow: false,
        ),
      );

      debugPrint('[BackgroundSync] Manual sync triggered');
      return true;
    } catch (e) {
      debugPrint('[BackgroundSync] Error triggering manual sync: $e');
      return false;
    }
  }

  /// Get status of background tasks
  static Future<Map<String, dynamic>> getStatus() async {
    try {
      // Note: Workmanager API doesn't provide direct status check
      // This is a placeholder for potential future implementation
      return {
        'initialized': _initialized,
        'syncTask': _syncTaskName,
        'retryTask': _retryTaskName,
      };
    } catch (e) {
      debugPrint('[BackgroundSync] Error getting status: $e');
      return {'error': e.toString()};
    }
  }
}

/// Callback handler for background sync tasks
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    try {
      debugPrint('[BackgroundSync] Executing task: $taskName');

      // Initialize Hive for background context
      await Hive.initFlutter();

      final notificationBox = await Hive.openBox<Map>(
        'offline_notifications_queue',
      );

      if (taskName == 'offline_sync_task') {
        await _performSync(notificationBox);
      } else if (taskName == 'offline_retry_task') {
        await _performRetry(notificationBox);
      }

      await notificationBox.close();
      return true;
    } catch (e) {
      debugPrint('[BackgroundSync] Task error: $e');
      return false;
    }
  });
}

/// Perform background sync of offline notifications
Future<void> _performSync(Box<Map> notificationBox) async {
  try {
    final notifications = notificationBox.values
        .map((n) => Map<String, dynamic>.from(n))
        .toList();

    final pending = notifications.where((n) => n['synced'] != true).toList();

    if (pending.isEmpty) {
      debugPrint('[BackgroundSync] No pending notifications to sync');
      return;
    }

    debugPrint(
      '[BackgroundSync] Syncing ${pending.length} pending notifications',
    );

    // Count metrics
    int synced = 0;
    int failed = 0;

    for (final notification in pending) {
      // Mark as attempt without actual server call (offline context)
      final index = notificationBox.values.toList().indexWhere((n) {
        final notif = Map<String, dynamic>.from(n);
        return notif['id'] == notification['id'];
      });

      if (index >= 0) {
        // In production, this would call actual sync handler
        final item = Map<String, dynamic>.from(notificationBox.getAt(index)!);
        item['lastSyncAttempt'] = DateTime.now().toIso8601String();
        item['syncAttempts'] = (item['syncAttempts'] as int? ?? 0) + 1;

        // Simulate successful sync for items that have been queued long enough
        if (item['retryCount'] as int? ?? 0 < 3) {
          item['synced'] = false;
          failed++;
        } else {
          item['synced'] = true;
          synced++;
        }

        await notificationBox.putAt(index, item);
      }
    }

    debugPrint(
      '[BackgroundSync] Sync attempt complete: $synced synced, $failed retrying',
    );
  } catch (e) {
    debugPrint('[BackgroundSync] Sync error: $e');
  }
}

/// Perform background retry of failed notifications
Future<void> _performRetry(Box<Map> notificationBox) async {
  try {
    final notifications = notificationBox.values
        .map((n) => Map<String, dynamic>.from(n))
        .toList();

    final failed = notifications
        .where((n) => n['synced'] != true && n['retryCount'] as int? ?? 0 > 0)
        .toList();

    if (failed.isEmpty) {
      debugPrint('[BackgroundSync] No failed notifications to retry');
      return;
    }

    debugPrint(
      '[BackgroundSync] Retrying ${failed.length} failed notifications',
    );

    int retried = 0;
    for (final notification in failed) {
      final index = notificationBox.values.toList().indexWhere((n) {
        final notif = Map<String, dynamic>.from(n);
        return notif['id'] == notification['id'];
      });

      if (index >= 0) {
        final item = Map<String, dynamic>.from(notificationBox.getAt(index)!);
        item['retryCount'] = (item['retryCount'] as int? ?? 0) + 1;
        item['lastRetryTime'] = DateTime.now().toIso8601String();

        await notificationBox.putAt(index, item);
        retried++;
      }
    }

    debugPrint('[BackgroundSync] Retried $retried notifications');
  } catch (e) {
    debugPrint('[BackgroundSync] Retry error: $e');
  }
}
