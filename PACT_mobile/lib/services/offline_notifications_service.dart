import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/material.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:async';
// import '../models/notification_model.dart'; // Not used - notifications stored as Map

/// Notification priority levels
enum NotificationPriority { low, normal, high, urgent }

/// Notification sync status
enum NotificationSyncStatus { idle, syncing, success, failed, partiallyFailed }

/// Service for managing offline notification queue
/// Stores notifications when offline and syncs when connection restored
/// Features: DND support, retry logic, storage management, stream updates
class OfflineNotificationsService {
  static const String _boxName = 'offline_notifications_queue';
  static const String _dndSettingsBox = 'dnd_settings';
  static const String _metricsBoxName = 'notification_metrics';

  // Storage limits
  static const int MAX_QUEUE_SIZE = 500;
  static const int HIGH_WATER_MARK = 400;
  static const Duration RETENTION_PERIOD = Duration(days: 7);

  late Box<Map> _notificationBox;
  late Box<Map> _dndBox;
  late Box<dynamic> _metricsBox;

  // Stream controllers for real-time updates
  final _queueCountController = StreamController<int>.broadcast();
  final _syncStatusController =
      StreamController<NotificationSyncStatus>.broadcast();

  // Services
  final _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isOnline = true;

  // Auto-sync callback
  Future<void> Function()? _onConnectivityRestored;

  Stream<int> get queueCountStream => _queueCountController.stream;
  Stream<NotificationSyncStatus> get syncStatusStream =>
      _syncStatusController.stream;

  /// Dispose the service
  void dispose() {
    _queueCountController.close();
    _syncStatusController.close();
    _connectivitySubscription?.cancel();
  }

  /// Check if currently online
  bool get isOnline => _isOnline;

  /// Get connectivity stream for external subscribers
  Stream<bool> get connectivityStream => _connectivity.onConnectivityChanged
      .map((results) => !results.contains(ConnectivityResult.none))
      .distinct();

  /// Register auto-sync callback to be triggered when connectivity restored
  void onConnectivityRestored(Future<void> Function() callback) {
    _onConnectivityRestored = callback;
    debugPrint('[OfflineNotifications] Auto-sync callback registered');
  }

  /// Manually trigger sync (can be called from UI or other services)
  Future<int> triggerSync(
    Future<void> Function(Map<String, dynamic> notification) syncFunction,
  ) async {
    return syncOfflineNotifications(syncFunction);
  }

  /// Initialize the service
  Future<void> initialize() async {
    _notificationBox = await Hive.openBox<Map>(_boxName);
    _dndBox = await Hive.openBox<Map>(_dndSettingsBox);
    _metricsBox = await Hive.openBox(_metricsBoxName);

    // Initialize metrics if not exist
    if (!_metricsBox.containsKey('totalQueued')) {
      await _initializeMetrics();
    }

    // Check initial connectivity
    final result = await _connectivity.checkConnectivity();
    _isOnline = !result.contains(ConnectivityResult.none);

    // Listen to connectivity changes and auto-sync when online
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((
      results,
    ) {
      final wasOnline = _isOnline;
      _isOnline = !results.contains(ConnectivityResult.none);

      if (!wasOnline && _isOnline) {
        debugPrint(
          '[OfflineNotifications] Network restored, triggering auto-sync',
        );
        // Will be triggered by parent service that calls syncOfflineNotifications
      }
    });

    debugPrint(
      '[OfflineNotifications] Service initialized with ${_notificationBox.length} queued notifications (online: $_isOnline)',
    );
  }

  Future<void> _initializeMetrics() async {
    await _metricsBox.putAll({
      'totalQueued': 0,
      'totalSynced': 0,
      'totalFailed': 0,
      'lastSyncTime': DateTime.now().toIso8601String(),
      'averageSyncTimeMs': 0,
    });
  }

  /// Add notification to offline queue with DND awareness
  /// Returns true if queued successfully
  Future<bool> queueNotification({
    required String title,
    required String body,
    required String type, // 'chat', 'call', 'update'
    Map<String, dynamic>? data,
    NotificationPriority priority = NotificationPriority.normal,
  }) async {
    try {
      // Check storage limits
      final queueSize = _notificationBox.length;
      if (queueSize >= MAX_QUEUE_SIZE) {
        debugPrint(
          '[OfflineNotifications] Queue full ($queueSize/$MAX_QUEUE_SIZE), cannot queue',
        );
        _syncStatusController.add(NotificationSyncStatus.failed);
        return false;
      }

      // Trigger cleanup if approaching high water mark
      if (queueSize >= HIGH_WATER_MARK) {
        debugPrint(
          '[OfflineNotifications] Queue at $queueSize/$MAX_QUEUE_SIZE, triggering cleanup',
        );
        await _cleanupOldNotifications();
      }

      // Check DND status
      final dndSettings = await getDndSettings();
      final dndActive =
          dndSettings['dndEnabled'] as bool &&
          isDndActive(dndSettings['startTime'], dndSettings['endTime']);

      // Determine if notification should be suppressed
      bool dnsSuppressed = false;
      if (dndActive && priority != NotificationPriority.urgent) {
        dnsSuppressed = true;
        debugPrint(
          '[OfflineNotifications] DND active, notification suppressed',
        );
      }

      final timestamp = DateTime.now().toIso8601String();
      final notification = {
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'title': title,
        'body': body,
        'type': type,
        'timestamp': timestamp,
        'data': data ?? {},
        'priority': priority.toString(),
        'dnd_suppressed': dnsSuppressed,
        'isOffline': true,
        'synced': false,
        'retry_count': 0,
      };

      await _notificationBox.add(notification);
      _updateMetrics('totalQueued', (_metricsBox.get('totalQueued') ?? 0) + 1);

      // Emit updated queue count
      _queueCountController.add(_notificationBox.length);

      debugPrint(
        '[OfflineNotifications] Queued notification: ${notification['id']} (DND: $dnsSuppressed, Priority: ${priority.name})',
      );
      return true;
    } catch (e) {
      debugPrint('[OfflineNotifications] Error queuing notification: $e');
      _syncStatusController.add(NotificationSyncStatus.failed);
      return false;
    }
  }

  /// Get all queued notifications
  Future<List<Map<String, dynamic>>> getQueuedNotifications() async {
    try {
      final notifications = _notificationBox.values
          .map((n) => Map<String, dynamic>.from(n))
          .toList();
      return notifications;
    } catch (e) {
      debugPrint('[OfflineNotifications] Error getting queued: $e');
      return [];
    }
  }

  /// Clear synced notifications
  Future<void> clearSyncedNotifications() async {
    try {
      final keys = <dynamic>[];
      for (int i = 0; i < _notificationBox.length; i++) {
        final notification = Map<String, dynamic>.from(
          _notificationBox.getAt(i) ?? {},
        );
        if (notification['synced'] == true) {
          keys.add(i);
        }
      }

      for (final key in keys.reversed) {
        await _notificationBox.deleteAt(key);
      }

      debugPrint(
        '[OfflineNotifications] Cleared ${keys.length} synced notifications',
      );
    } catch (e) {
      debugPrint('[OfflineNotifications] Error clearing synced: $e');
    }
  }

  /// Mark notification as synced
  Future<void> markAsSynced(String notificationId) async {
    try {
      for (int i = 0; i < _notificationBox.length; i++) {
        final notification = Map<String, dynamic>.from(
          _notificationBox.getAt(i) ?? {},
        );
        if (notification['id'] == notificationId) {
          notification['synced'] = true;
          await _notificationBox.putAt(i, notification);
          // Emit updated count
          _queueCountController.add(_notificationBox.length);
          break;
        }
      }
    } catch (e) {
      debugPrint('[OfflineNotifications] Error marking synced: $e');
    }
  }

  /// Clean up old notifications based on retention period
  Future<void> _cleanupOldNotifications() async {
    try {
      final cutoffTime = DateTime.now().subtract(RETENTION_PERIOD);
      final keysToDelete = <dynamic>[];

      for (int i = 0; i < _notificationBox.length; i++) {
        final notif = _notificationBox.getAt(i);
        if (notif != null) {
          final timestamp = DateTime.tryParse(
            notif['timestamp'] as String? ?? '',
          );
          if (timestamp != null && timestamp.isBefore(cutoffTime)) {
            keysToDelete.add(i);
          }
        }
      }

      // Delete in reverse order to maintain indices
      for (final key in keysToDelete.reversed) {
        await _notificationBox.deleteAt(key);
      }

      debugPrint(
        '[OfflineNotifications] Cleaned ${keysToDelete.length} old notifications',
      );
      _queueCountController.add(_notificationBox.length);
    } catch (e) {
      debugPrint('[OfflineNotifications] Error cleaning up: $e');
    }
  }

  /// Retry failed notifications with exponential backoff
  Future<int> retryFailedNotifications(
    Future<void> Function(Map<String, dynamic> notification) syncFunction, {
    int maxRetries = 3,
    Duration initialDelay = const Duration(seconds: 5),
  }) async {
    try {
      var delay = initialDelay;
      final failedNotifications = await _getFailedNotifications();

      if (failedNotifications.isEmpty) {
        return 0;
      }

      int successCount = 0;

      for (int attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
          await Future.delayed(delay);
          // Exponential backoff
          delay = Duration(milliseconds: (delay.inMilliseconds * 1.5).toInt());
        }

        debugPrint(
          '[OfflineNotifications] Retry attempt ${attempt + 1}/$maxRetries',
        );

        for (final notification in failedNotifications) {
          try {
            _syncStatusController.add(NotificationSyncStatus.syncing);
            await syncFunction(notification);
            await markAsSynced(notification['id'] as String);
            successCount++;
            _updateMetrics(
              'totalSynced',
              (_metricsBox.get('totalSynced') ?? 0) + 1,
            );
          } catch (e) {
            debugPrint(
              '[OfflineNotifications] Retry failed for ${notification['id']}: $e',
            );
          }
        }

        if (successCount == failedNotifications.length) {
          break; // All successful
        }
      }

      _syncStatusController.add(
        successCount == failedNotifications.length
            ? NotificationSyncStatus.success
            : NotificationSyncStatus.partiallyFailed,
      );

      return successCount;
    } catch (e) {
      debugPrint('[OfflineNotifications] Error in retry: $e');
      _syncStatusController.add(NotificationSyncStatus.failed);
      return 0;
    }
  }

  /// Get notifications that failed to sync
  Future<List<Map<String, dynamic>>> _getFailedNotifications() async {
    try {
      final failed = <Map<String, dynamic>>[];
      for (int i = 0; i < _notificationBox.length; i++) {
        final notif = Map<String, dynamic>.from(
          _notificationBox.getAt(i) ?? {},
        );
        if (notif['synced'] != true &&
            (notif['retry_count'] as int? ?? 0) > 0) {
          failed.add(notif);
        }
      }
      return failed;
    } catch (e) {
      debugPrint('[OfflineNotifications] Error getting failed: $e');
      return [];
    }
  }

  /// Update metrics tracking
  void _updateMetrics(String key, dynamic value) {
    try {
      _metricsBox.put(key, value);
    } catch (e) {
      debugPrint('[OfflineNotifications] Error updating metrics: $e');
    }
  }

  /// Check if DND is currently active
  bool isDndActive(TimeOfDay startTime, TimeOfDay endTime) {
    final now = TimeOfDay.now();
    final nowMinutes = now.hour * 60 + now.minute;
    final startMinutes = startTime.hour * 60 + startTime.minute;
    final endMinutes = endTime.hour * 60 + endTime.minute;

    // Handle end time being next day (e.g., 22:00 to 08:00)
    if (endMinutes < startMinutes) {
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }

    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  /// Save DND settings
  Future<void> saveDndSettings({
    required bool dndEnabled,
    required TimeOfDay startTime,
    required TimeOfDay endTime,
    List<String> dndDays = const [],
  }) async {
    try {
      await _dndBox.put('dnd_enabled', {'value': dndEnabled});
      await _dndBox.put('start_time', {
        'hour': startTime.hour,
        'minute': startTime.minute,
      });
      await _dndBox.put('end_time', {
        'hour': endTime.hour,
        'minute': endTime.minute,
      });
      await _dndBox.put('dnd_days', {'days': dndDays});
      debugPrint('[OfflineNotifications] Saved DND settings');
    } catch (e) {
      debugPrint('[OfflineNotifications] Error saving DND: $e');
    }
  }

  /// Get DND settings
  Future<Map<String, dynamic>> getDndSettings() async {
    try {
      final enabled = (_dndBox.get('dnd_enabled'))?['value'] as bool? ?? false;
      final startMap = _dndBox.get('start_time') ?? {};
      final endMap = _dndBox.get('end_time') ?? {};
      final daysMap = _dndBox.get('dnd_days') ?? {};

      return {
        'dndEnabled': enabled,
        'startTime': TimeOfDay(
          hour: (startMap['hour'] as int?) ?? 22,
          minute: (startMap['minute'] as int?) ?? 0,
        ),
        'endTime': TimeOfDay(
          hour: (endMap['hour'] as int?) ?? 8,
          minute: (endMap['minute'] as int?) ?? 0,
        ),
        'dndDays': List<String>.from((daysMap['days'] as List?) ?? []),
      };
    } catch (e) {
      debugPrint('[OfflineNotifications] Error getting DND: $e');
      return {
        'dndEnabled': false,
        'startTime': const TimeOfDay(hour: 22, minute: 0),
        'endTime': const TimeOfDay(hour: 8, minute: 0),
        'dndDays': [],
      };
    }
  }

  /// Get queue size (for badge display)
  Future<int> getQueueSize() async {
    try {
      return _notificationBox.length;
    } catch (e) {
      debugPrint('[OfflineNotifications] Error getting queue size: $e');
      return 0;
    }
  }

  /// Clear all queued notifications
  Future<void> clearAll() async {
    try {
      await _notificationBox.clear();
      debugPrint('[OfflineNotifications] Cleared all queued notifications');
    } catch (e) {
      debugPrint('[OfflineNotifications] Error clearing all: $e');
    }
  }

  /// Sync offline notifications (call this when connection restored)
  Future<int> syncOfflineNotifications(
    Future<void> Function(Map<String, dynamic> notification) syncFunction,
  ) async {
    try {
      _syncStatusController.add(NotificationSyncStatus.syncing);

      final queued = await getQueuedNotifications();
      int syncedCount = 0;
      int failedCount = 0;

      final startTime = DateTime.now();

      for (final notification in queued) {
        if (notification['synced'] != true) {
          try {
            await syncFunction(notification);
            await markAsSynced(notification['id'] as String);
            syncedCount++;
            _updateMetrics(
              'totalSynced',
              (_metricsBox.get('totalSynced') ?? 0) + 1,
            );
          } catch (e) {
            failedCount++;
            debugPrint('[OfflineNotifications] Error syncing notification: $e');

            // Track failure metrics
            _updateMetrics(
              'totalFailed',
              (_metricsBox.get('totalFailed') ?? 0) + 1,
            );
          }
        }
      }

      await clearSyncedNotifications();

      // Update metrics
      _updateMetrics('lastSyncTime', DateTime.now().toIso8601String());

      final syncDuration = DateTime.now().difference(startTime);
      if (syncedCount > 0) {
        final avgTime = syncDuration.inMilliseconds ~/ syncedCount;
        _updateMetrics('averageSyncTimeMs', avgTime);
      }

      // Emit final status
      if (failedCount == 0 && syncedCount > 0) {
        _syncStatusController.add(NotificationSyncStatus.success);
      } else if (failedCount > 0 && syncedCount > 0) {
        _syncStatusController.add(NotificationSyncStatus.partiallyFailed);
      } else if (failedCount > 0) {
        _syncStatusController.add(NotificationSyncStatus.failed);
      } else {
        _syncStatusController.add(NotificationSyncStatus.idle);
      }

      debugPrint(
        '[OfflineNotifications] Synced $syncedCount/${syncedCount + failedCount} notifications (${syncDuration.inMilliseconds}ms)',
      );
      return syncedCount;
    } catch (e) {
      debugPrint('[OfflineNotifications] Error syncing: $e');
      _syncStatusController.add(NotificationSyncStatus.failed);
      return 0;
    }
  }
}

/// Notification model
class OfflineNotification {
  final String id;
  final String title;
  final String body;
  final String type;
  final DateTime timestamp;
  final Map<String, dynamic> data;
  bool synced;

  OfflineNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.timestamp,
    this.data = const {},
    this.synced = false,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'body': body,
    'type': type,
    'timestamp': timestamp.toIso8601String(),
    'data': data,
    'synced': synced,
  };

  factory OfflineNotification.fromJson(Map<String, dynamic> json) =>
      OfflineNotification(
        id: json['id'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        type: json['type'] as String,
        timestamp: DateTime.parse(json['timestamp'] as String),
        data: json['data'] as Map<String, dynamic>? ?? {},
        synced: json['synced'] as bool? ?? false,
      );
}
