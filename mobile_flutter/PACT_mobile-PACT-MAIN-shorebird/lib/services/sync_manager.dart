// lib/services/sync_manager.dart
import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

import '../models/location_log_model.dart';
import '../models/report_model.dart';
import '../models/visit_model.dart';
import 'field_operations_repository.dart';

class SyncManager {
  static final SyncManager _instance = SyncManager._internal();
  factory SyncManager() => _instance;

  SyncManager._internal();

  final FieldOperationsRepository _repository = FieldOperationsRepository();
  final Connectivity _connectivity = Connectivity();

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _periodicSyncTimer;

  bool _isSyncing = false;
  bool _isInitialized = false;
  Database? _database;

  // API endpoints for sync - replace with real API endpoints
  static const String _apiBaseUrl = 'https://api.example.com';
  static const String _visitsSyncEndpoint = '/visits';
  static const String _locationLogsSyncEndpoint = '/location-logs';
  static const String _reportsSyncEndpoint = '/reports';

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize SQLite database for sync queue
  Future<void> _initializeDatabase() async {
    if (_database != null) return;

    // Skip database initialization on web platform
    if (kIsWeb) {
      debugPrint(
          'SyncManager: Skipping database initialization on web platform');
      return;
    }

    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, 'sync_manager.db');

    _database = await openDatabase(
      path,
      version: 1,
      onCreate: _createDatabaseTables,
    );
  }

  /// Create database tables
  Future<void> _createDatabaseTables(Database db, int version) async {
    // Sync queue table for offline operations
    await db.execute('''
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        data_type TEXT NOT NULL,
        data_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        status TEXT DEFAULT 'pending'
      )
    ''');

    // Conflicts table for handling sync conflicts
    await db.execute('''
      CREATE TABLE sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        data_id TEXT NOT NULL,
        local_data TEXT NOT NULL,
        remote_data TEXT NOT NULL,
        conflict_reason TEXT,
        resolution_strategy TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        status TEXT DEFAULT 'pending'
      )
    ''');

    // Sync metadata table
    await db.execute('''
      CREATE TABLE sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    ''');
  }

  /// Queue an operation for later sync
  Future<void> queueOperationForSync({
    required String operationType,
    required String dataType,
    required String dataId,
    required Map<String, dynamic> data,
  }) async {
    await _initializeDatabase();

    // Skip queuing on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping queue operation on web platform or when database unavailable');
      return;
    }

    await _database!.insert('sync_queue', {
      'operation_type': operationType,
      'data_type': dataType,
      'data_id': dataId,
      'data': jsonEncode(data),
      'created_at': DateTime.now().toIso8601String(),
      'status': 'pending',
    });

    debugPrint('Queued $operationType operation for $dataType $dataId');
  }

  /// Get all pending sync operations
  Future<List<Map<String, dynamic>>> getPendingSyncOperations() async {
    await _initializeDatabase();

    // Return empty list on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Returning empty sync operations on web platform or when database unavailable');
      return [];
    }

    final results = await _database!.query(
      'sync_queue',
      where: 'status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at ASC',
    );

    return results;
  }

  /// Mark sync operation as completed
  Future<void> markOperationCompleted(String operationId) async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping mark operation completed on web platform or when database unavailable');
      return;
    }

    await _database!.update(
      'sync_queue',
      {'status': 'completed'},
      where: 'id = ?',
      whereArgs: [operationId],
    );
  }

  /// Mark sync operation as failed
  Future<void> markOperationFailed(String operationId, String error) async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping mark operation failed on web platform or when database unavailable');
      return;
    }

    await _database!.update(
      'sync_queue',
      {
        'status': 'failed',
        'last_error': error,
        'retry_count': 1, // Will be incremented by retry logic
      },
      where: 'id = ?',
      whereArgs: [operationId],
    );
  }

  /// Retry failed operations
  Future<void> retryFailedOperations() async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping retry failed operations on web platform or when database unavailable');
      return;
    }

    final failedOps = await _database!.query(
      'sync_queue',
      where: 'status = ? AND retry_count < ?',
      whereArgs: ['failed', 3], // Max 3 retries
    );

    for (final op in failedOps) {
      // Increment retry count and reset status
      final currentRetryCount = (op['retry_count'] as int?) ?? 0;
      await _database!.update(
        'sync_queue',
        {
          'status': 'pending',
          'retry_count': currentRetryCount + 1,
        },
        where: 'id = ?',
        whereArgs: [op['id']],
      );
    }
  }

  /// Process sync queue when online
  Future<void> processSyncQueue() async {
    if (_isSyncing) return;

    _isSyncing = true;
    debugPrint('Processing sync queue');

    try {
      final pendingOps = await getPendingSyncOperations();

      for (final op in pendingOps) {
        try {
          final success = await _executeQueuedOperation(op);
          if (success) {
            await markOperationCompleted(op['id'].toString());
          } else {
            await markOperationFailed(op['id'].toString(), 'Execution failed');
          }
        } catch (e) {
          await markOperationFailed(op['id'].toString(), e.toString());
        }
      }

      // Clean up old completed operations (older than 7 days)
      await _cleanupOldOperations();
    } catch (e) {
      debugPrint('Error processing sync queue: $e');
    } finally {
      _isSyncing = false;
    }
  }

  /// Execute a queued operation
  Future<bool> _executeQueuedOperation(Map<String, dynamic> operation) async {
    final operationType = operation['operation_type'];
    final dataType = operation['data_type'];
    final data = jsonDecode(operation['data']);

    switch (dataType) {
      case 'visit':
        return await _executeVisitOperation(operationType, data);
      case 'location_log':
        return await _executeLocationLogOperation(operationType, data);
      case 'report':
        return await _executeReportOperation(operationType, data);
      default:
        debugPrint('Unknown data type: $dataType');
        return false;
    }
  }

  /// Execute visit operation
  Future<bool> _executeVisitOperation(
      String operationType, Map<String, dynamic> data) async {
    switch (operationType) {
      case 'create':
      case 'update':
        final response = await http.post(
          Uri.parse('$_apiBaseUrl$_visitsSyncEndpoint'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(data),
        );
        return response.statusCode == 200 || response.statusCode == 201;

      case 'delete':
        final response = await http.delete(
          Uri.parse('$_apiBaseUrl$_visitsSyncEndpoint/${data['id']}'),
        );
        return response.statusCode == 200 || response.statusCode == 204;

      default:
        return false;
    }
  }

  /// Execute location log operation
  Future<bool> _executeLocationLogOperation(
      String operationType, Map<String, dynamic> data) async {
    if (operationType == 'create' || operationType == 'update') {
      final response = await http.post(
        Uri.parse('$_apiBaseUrl$_locationLogsSyncEndpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(data),
      );
      return response.statusCode == 200 || response.statusCode == 201;
    }
    return false;
  }

  /// Execute report operation
  Future<bool> _executeReportOperation(
      String operationType, Map<String, dynamic> data) async {
    if (operationType == 'create' || operationType == 'update') {
      final response = await http.post(
        Uri.parse('$_apiBaseUrl$_reportsSyncEndpoint'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(data),
      );
      return response.statusCode == 200 || response.statusCode == 201;
    }
    return false;
  }

  /// Handle sync conflicts
  Future<void> handleSyncConflict({
    required String dataType,
    required String dataId,
    required Map<String, dynamic> localData,
    required Map<String, dynamic> remoteData,
    required String conflictReason,
  }) async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping handle sync conflict on web platform or when database unavailable');
      return;
    }

    await _database!.insert('sync_conflicts', {
      'data_type': dataType,
      'data_id': dataId,
      'local_data': jsonEncode(localData),
      'remote_data': jsonEncode(remoteData),
      'conflict_reason': conflictReason,
      'created_at': DateTime.now().toIso8601String(),
      'status': 'pending',
    });

    debugPrint('Recorded sync conflict for $dataType $dataId');
  }

  /// Get pending conflicts
  Future<List<Map<String, dynamic>>> getPendingConflicts() async {
    await _initializeDatabase();

    // Return empty list on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Returning empty conflicts on web platform or when database unavailable');
      return [];
    }

    return await _database!.query(
      'sync_conflicts',
      where: 'status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at DESC',
    );
  }

  /// Resolve conflict with strategy
  Future<void> resolveConflict(
    int conflictId,
    String resolutionStrategy, // 'local_wins', 'remote_wins', 'merge', 'manual'
  ) async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping resolve conflict on web platform or when database unavailable');
      return;
    }

    await _database!.update(
      'sync_conflicts',
      {
        'resolution_strategy': resolutionStrategy,
        'resolved_at': DateTime.now().toIso8601String(),
        'status': 'resolved',
      },
      where: 'id = ?',
      whereArgs: [conflictId],
    );
  }

  /// Clean up old operations
  Future<void> _cleanupOldOperations() async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping cleanup old operations on web platform or when database unavailable');
      return;
    }

    final cutoffDate =
        DateTime.now().subtract(const Duration(days: 7)).toIso8601String();

    await _database!.delete(
      'sync_queue',
      where: 'status = ? AND created_at < ?',
      whereArgs: ['completed', cutoffDate],
    );
  }

  /// Get sync statistics
  Future<Map<String, dynamic>> getSyncStats() async {
    await _initializeDatabase();

    // Return empty stats on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Returning empty sync stats on web platform or when database unavailable');
      return {
        'queue_stats': {},
        'conflict_stats': {},
        'last_sync_time': null,
        'total_operations': 0,
        'pending_operations': 0,
        'failed_operations': 0,
      };
    }

    final queueStats = await _database!.rawQuery('''
      SELECT status, COUNT(*) as count
      FROM sync_queue
      GROUP BY status
    ''');

    final conflictStats = await _database!.rawQuery('''
      SELECT status, COUNT(*) as count
      FROM sync_conflicts
      GROUP BY status
    ''');

    final lastSync = await _database!.query(
      'sync_metadata',
      where: 'key = ?',
      whereArgs: ['last_sync_time'],
    );

    return {
      'queue_stats': Map.fromEntries(
        queueStats.map((row) => MapEntry(row['status'], row['count'])),
      ),
      'conflict_stats': Map.fromEntries(
        conflictStats.map((row) => MapEntry(row['status'], row['count'])),
      ),
      'last_sync': lastSync.isNotEmpty ? lastSync.first['value'] : null,
    };
  }

  /// Update sync metadata
  Future<void> updateSyncMetadata(String key, String value) async {
    await _initializeDatabase();

    // Skip on web platform (no offline sync)
    if (kIsWeb || _database == null) {
      debugPrint(
          'SyncManager: Skipping update sync metadata on web platform or when database unavailable');
      return;
    }

    await _database!.insert(
      'sync_metadata',
      {
        'key': key,
        'value': value,
        'updated_at': DateTime.now().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  // Initialize the sync manager
  Future<void> initialize() async {
    if (_isInitialized) return;

    await _repository.initialize();
    await _initializeDatabase(); // Initialize SQLite database

    // Set up connectivity monitoring
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen(
      _handleConnectivityChange,
    );

    // Set up periodic sync (every 30 minutes)
    _periodicSyncTimer = Timer.periodic(
      const Duration(minutes: 30),
      (_) => _checkAndSync(),
    );

    // Check connectivity immediately
    final connectivityResult = await _connectivity.checkConnectivity();
    _handleConnectivityChange(connectivityResult);

    _isInitialized = true;
    debugPrint('SyncManager initialized with local storage');
  }

  // Handle connectivity changes
  void _handleConnectivityChange(List<ConnectivityResult> results) {
    final hasConnectivity = results.contains(ConnectivityResult.mobile) ||
        results.contains(ConnectivityResult.wifi) ||
        results.contains(ConnectivityResult.ethernet);

    if (hasConnectivity) {
      debugPrint('Connectivity restored, checking for sync');
      _checkAndSync();
      // Also process any queued operations
      processSyncQueue();
    }
  }

  // Check and sync data if needed
  Future<void> _checkAndSync() async {
    // Skip if already syncing or not online
    if (_isSyncing) return;

    final isCollectorOnline = await _repository.getCollectorStatus();
    if (!isCollectorOnline) {
      debugPrint('Collector is offline, skipping sync');
      return;
    }

    await syncData();
  }

  // Sync all data
  Future<bool> syncData() async {
    if (_isSyncing) return false;

    _isSyncing = true;
    debugPrint('Starting data sync');

    try {
      // Get all unsynced data
      final unsyncedVisits = await _repository.getUnsyncedVisits();
      final unsyncedLogs = await _repository.getUnsyncedLocationLogs();
      final unsyncedReports = await _repository.getUnsyncedReports();

      debugPrint(
        'Unsynced data: ${unsyncedVisits.length} visits, '
        '${unsyncedLogs.length} location logs, '
        '${unsyncedReports.length} reports',
      );

      // Sync each type of data
      final visitsSuccess = await _syncVisits(unsyncedVisits);
      final logsSuccess = await _syncLocationLogs(unsyncedLogs);
      final reportsSuccess = await _syncReports(unsyncedReports);

      // Clean up old data
      await _repository.wipeOldSyncedData(30); // Wipe data older than 30 days

      // Update sync metadata
      await updateSyncMetadata(
          'last_sync_time', DateTime.now().toIso8601String());

      _isSyncing = false;
      return visitsSuccess && logsSuccess && reportsSuccess;
    } catch (e) {
      debugPrint('Error during sync: $e');
      _isSyncing = false;
      return false;
    }
  }

  // Force sync immediately
  Future<bool> forceSyncNow() async {
    return syncData();
  }

  // Sync visits
  Future<bool> _syncVisits(List<Visit> visits) async {
    if (visits.isEmpty) return true;

    try {
      for (final visit in visits) {
        // In a real app, this would be an API call
        final response = await http.post(
          Uri.parse('$_apiBaseUrl$_visitsSyncEndpoint'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(visit.toMap()),
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          await _repository.markVisitSynced(visit.id);
          debugPrint('Synced visit ${visit.id}');
        } else if (response.statusCode == 409) {
          // Conflict - another collector took this visit
          final updatedVisit = visit.copyWith(status: VisitStatus.rejected);
          await _repository.saveVisit(updatedVisit);
          await _repository.markVisitSynced(visit.id);
          debugPrint('Visit ${visit.id} rejected due to conflict');
        } else {
          debugPrint(
            'Failed to sync visit ${visit.id}: ${response.statusCode}',
          );
          // Don't mark as synced, will retry later
        }
      }
      return true;
    } catch (e) {
      debugPrint('Error syncing visits: $e');
      return false;
    }
  }

  // Sync location logs
  Future<bool> _syncLocationLogs(List<LocationLog> logs) async {
    if (logs.isEmpty) return true;

    try {
      // Group logs by visit ID for efficiency
      final Map<String, List<LocationLog>> groupedLogs = {};
      for (final log in logs) {
        final key = log.visitId ?? log.userId ?? 'unknown';
        if (!groupedLogs.containsKey(key)) {
          groupedLogs[key] = [];
        }
        groupedLogs[key]!.add(log);
      }

      // Sync each group
      for (final entry in groupedLogs.entries) {
        final visitId = entry.key;
        final visitLogs = entry.value;

        // In a real app, this would be an API call
        final response = await http.post(
          Uri.parse('$_apiBaseUrl$_locationLogsSyncEndpoint'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'visitId': visitId,
            'logs': visitLogs.map((log) => log.toMap()).toList(),
          }),
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          for (final log in visitLogs) {
            await _repository.markLocationLogSynced(log.id);
          }
          debugPrint(
            'Synced ${visitLogs.length} location logs for visit $visitId',
          );
        } else {
          debugPrint(
            'Failed to sync location logs for visit $visitId: ${response.statusCode}',
          );
          // Don't mark as synced, will retry later
        }
      }
      return true;
    } catch (e) {
      debugPrint('Error syncing location logs: $e');
      return false;
    }
  }

  // Sync reports
  Future<bool> _syncReports(List<Report> reports) async {
    if (reports.isEmpty) return true;

    try {
      for (final report in reports) {
        // In a real app, this would be an API call
        final response = await http.post(
          Uri.parse('$_apiBaseUrl$_reportsSyncEndpoint'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(report.toMap()),
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          await _repository.markReportSynced(report.id);
          debugPrint('Synced report ${report.id} for visit ${report.visitId}');
        } else {
          debugPrint(
            'Failed to sync report ${report.id}: ${response.statusCode}',
          );
          // Don't mark as synced, will retry later
        }
      }
      return true;
    } catch (e) {
      debugPrint('Error syncing reports: $e');
      return false;
    }
  }

  // Check if currently syncing
  bool isSyncing() {
    return _isSyncing;
  }

  // Dispose resources
  void dispose() {
    _connectivitySubscription?.cancel();
    _periodicSyncTimer?.cancel();
    _database?.close();
    _isInitialized = false;
  }
}
