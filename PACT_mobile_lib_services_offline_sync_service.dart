// Phase 2.4: Flutter Mobile Offline Sync Service
// File: PACT_mobile/lib/services/offline_sync_service.dart

import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class OfflineSyncService {
  static const String SYNC_QUEUE_BOX = 'sync_queue';
  static const String TASKS_BOX = 'tasks_local';
  static const String DEVICE_INFO_BOX = 'device_info';

  final SupabaseClient _supabase;
  final Connectivity _connectivity;
  late Box<SyncQueueItem> _syncQueueBox;
  late Box<Map> _tasksBox;
  late Box<Map> _deviceBox;

  // Callbacks
  Function(int pending, int conflicts)? onSyncStatusChanged;
  Function(String message)? onSyncError;
  Function(int synced)? onSyncComplete;

  OfflineSyncService(this._supabase, this._connectivity);

  /// Initialize local storage boxes
  Future<void> initialize() async {
    _syncQueueBox = await Hive.openBox<SyncQueueItem>(SYNC_QUEUE_BOX);
    _tasksBox = await Hive.openBox<Map>(TASKS_BOX);
    _deviceBox = await Hive.openBox<Map>(DEVICE_INFO_BOX);
  }

  /// Register or update device
  Future<void> registerDevice({
    required String deviceId,
    required String deviceName,
    required String appVersion,
    String osVersion = 'unknown',
  }) async {
    try {
      // Store locally
      await _deviceBox.put('device_id', deviceId);
      await _deviceBox.put('device_name', deviceName);
      await _deviceBox.put('app_version', appVersion);
      await _deviceBox.put('os_version', osVersion);

      // Sync to server
      if (await _isConnected()) {
        await _supabase.from('mobile_devices').upsert({
          'device_id': deviceId,
          'device_name': deviceName,
          'device_type': 'android', // or 'ios'
          'app_version': appVersion,
          'os_version': osVersion,
          'last_seen_at': DateTime.now().toIso8601String(),
        });
      }
    } catch (e) {
      print('Error registering device: $e');
      onSyncError?.call('Failed to register device: $e');
    }
  }

  /// Create a task (locally first, then sync if online)
  Future<String> createTask({
    required String title,
    required String description,
    required String priority,
    String? dueDate,
    Map<String, dynamic>? additionalData,
  }) async {
    final taskId = const Uuid().v4();
    final timestamp = DateTime.now().toIso8601String();

    final taskData = {
      'id': taskId,
      'title': title,
      'description': description,
      'priority': priority,
      'due_date': dueDate,
      'status': 'todo',
      'created_at': timestamp,
      'updated_at': timestamp,
      ...?additionalData,
    };

    try {
      // Store task locally
      await _tasksBox.put(taskId, taskData);

      // Queue for sync
      final queueItem = SyncQueueItem(
        id: const Uuid().v4(),
        table: 'personal_tasks',
        operation: 'CREATE',
        localId: taskId,
        data: taskData,
        createdAt: DateTime.now(),
        syncStatus: 'pending',
      );

      await _syncQueueBox.add(queueItem);

      // Try to sync immediately if online
      if (await _isConnected()) {
        await _syncQueueEntry(queueItem);
      }

      _notifyStatusChanged();
      return taskId;
    } catch (e) {
      print('Error creating task: $e');
      onSyncError?.call('Failed to create task: $e');
      rethrow;
    }
  }

  /// Update a task
  Future<void> updateTask({
    required String taskId,
    String? title,
    String? description,
    String? priority,
    String? status,
    String? dueDate,
  }) async {
    try {
      // Get current task
      final currentTask = _tasksBox.get(taskId) ?? {};

      // Update locally
      final updatedTask = {
        ...currentTask,
        'id': taskId,
        if (title != null) 'title': title,
        if (description != null) 'description': description,
        if (priority != null) 'priority': priority,
        if (status != null) 'status': status,
        if (dueDate != null) 'due_date': dueDate,
        'updated_at': DateTime.now().toIso8601String(),
      };

      await _tasksBox.put(taskId, updatedTask);

      // Queue for sync
      final queueItem = SyncQueueItem(
        id: const Uuid().v4(),
        table: 'personal_tasks',
        operation: 'UPDATE',
        recordId: taskId,
        data: updatedTask,
        createdAt: DateTime.now(),
        syncStatus: 'pending',
      );

      await _syncQueueBox.add(queueItem);

      // Try to sync immediately if online
      if (await _isConnected()) {
        await _syncQueueEntry(queueItem);
      }

      _notifyStatusChanged();
    } catch (e) {
      print('Error updating task: $e');
      onSyncError?.call('Failed to update task: $e');
      rethrow;
    }
  }

  /// Delete a task
  Future<void> deleteTask(String taskId) async {
    try {
      // Get current task
      final task = _tasksBox.get(taskId) ?? {};

      // Queue deletion for sync
      final queueItem = SyncQueueItem(
        id: const Uuid().v4(),
        table: 'personal_tasks',
        operation: 'DELETE',
        recordId: taskId,
        data: task,
        createdAt: DateTime.now(),
        syncStatus: 'pending',
      );

      await _syncQueueBox.add(queueItem);

      // Remove from local storage immediately
      await _tasksBox.delete(taskId);

      // Try to sync immediately if online
      if (await _isConnected()) {
        await _syncQueueEntry(queueItem);
      }

      _notifyStatusChanged();
    } catch (e) {
      print('Error deleting task: $e');
      onSyncError?.call('Failed to delete task: $e');
      rethrow;
    }
  }

  /// Get all local tasks
  Future<List<Map<String, dynamic>>> getLocalTasks() async {
    try {
      return _tasksBox.values.cast<Map<String, dynamic>>().toList();
    } catch (e) {
      print('Error getting local tasks: $e');
      return [];
    }
  }

  /// Get a single task
  Future<Map<String, dynamic>?> getLocalTask(String taskId) async {
    try {
      return _tasksBox.get(taskId)?.cast<String, dynamic>();
    } catch (e) {
      print('Error getting task: $e');
      return null;
    }
  }

  /// Sync all pending items
  Future<SyncResult> syncAll() async {
    int synced = 0;
    int failed = 0;
    int conflicts = 0;

    try {
      if (!await _isConnected()) {
        onSyncError?.call('No internet connection');
        return SyncResult(
          queued: _syncQueueBox.length,
          synced: 0,
          failed: 0,
          conflicts: 0,
        );
      }

      final queueItems = _syncQueueBox.values.toList();

      for (var item in queueItems) {
        if (item.syncStatus == 'pending') {
          try {
            await _syncQueueEntry(item);
            synced++;
          } catch (e) {
            if (e.toString().contains('conflict')) {
              conflicts++;
            } else {
              failed++;
            }
          }
        }
      }

      onSyncComplete?.call(synced);
      _notifyStatusChanged();

      return SyncResult(
        queued: queueItems.length,
        synced: synced,
        failed: failed,
        conflicts: conflicts,
      );
    } catch (e) {
      print('Error syncing all: $e');
      onSyncError?.call('Sync failed: $e');
      return SyncResult(
        queued: _syncQueueBox.length,
        synced: synced,
        failed: failed,
        conflicts: conflicts,
      );
    }
  }

  /// Sync a single queue entry
  Future<void> _syncQueueEntry(SyncQueueItem item) async {
    try {
      item.syncStatus = 'syncing';
      await item.save();

      final result = await _supabase.rpc(
        'process_sync_queue_entry',
        params: {'p_sync_queue_id': item.id},
      );

      if (result['success'] ?? false) {
        item.syncStatus = 'synced';
        item.syncedAt = DateTime.now();

        // If this was a CREATE operation, update the local ID
        if (item.operation == 'CREATE' && result['new_record_id'] != null) {
          item.recordId = result['new_record_id'];
        }
      } else {
        item.syncStatus = 'failed';
        item.lastError = result['message'];
      }

      await item.save();
    } catch (e) {
      print('Error syncing queue entry: $e');
      throw e;
    }
  }

  /// Watch for connectivity changes and auto-sync
  void watchConnectivity() {
    _connectivity.onConnectivityChanged.listen((result) async {
      if (result != ConnectivityResult.none && await _isConnected()) {
        print('Connection restored - attempting sync...');
        await Future.delayed(const Duration(seconds: 2));
        await syncAll();
      }
    });
  }

  /// Get pending sync count
  int getPendingCount() {
    return _syncQueueBox.values
        .where((item) => item.syncStatus == 'pending')
        .length;
  }

  /// Get conflict count
  int getConflictCount() {
    return _syncQueueBox.values
        .where(
          (item) =>
              item.syncStatus == 'failed' &&
              (item.lastError?.contains('conflict') ?? false),
        )
        .length;
  }

  /// Check if online
  Future<bool> _isConnected() async {
    final result = await _connectivity.checkConnectivity();
    return result != ConnectivityResult.none;
  }

  /// Notify listeners of status change
  void _notifyStatusChanged() {
    onSyncStatusChanged?.call(getPendingCount(), getConflictCount());
  }

  /// Clear all local data
  Future<void> clearAllLocalData() async {
    await _syncQueueBox.clear();
    await _tasksBox.clear();
  }

  /// Export sync queue for debugging
  Future<String> exportSyncQueue() async {
    final items = _syncQueueBox.values
        .map(
          (item) => {
            'id': item.id,
            'table': item.table,
            'operation': item.operation,
            'recordId': item.recordId,
            'localId': item.localId,
            'syncStatus': item.syncStatus,
            'createdAt': item.createdAt.toIso8601String(),
            'syncedAt': item.syncedAt?.toIso8601String(),
            'lastError': item.lastError,
          },
        )
        .toList();

    return jsonEncode(items);
  }
}

/// Hive Model for sync queue items
class SyncQueueItem extends HiveObject {
  late String id;
  late String table;
  late String operation;
  String? recordId;
  String? localId;
  late Map<String, dynamic> data;
  late String syncStatus;
  late DateTime createdAt;
  DateTime? syncedAt;
  String? lastError;

  SyncQueueItem({
    required this.id,
    required this.table,
    required this.operation,
    this.recordId,
    this.localId,
    required this.data,
    required this.createdAt,
    this.syncStatus = 'pending',
    this.syncedAt,
    this.lastError,
  });
}

/// Sync result model
class SyncResult {
  final int queued;
  final int synced;
  final int failed;
  final int conflicts;

  SyncResult({
    required this.queued,
    required this.synced,
    required this.failed,
    required this.conflicts,
  });

  bool get isSuccess => failed == 0 && conflicts == 0;

  @override
  String toString() =>
      'SyncResult(queued: $queued, synced: $synced, failed: $failed, conflicts: $conflicts)';
}
