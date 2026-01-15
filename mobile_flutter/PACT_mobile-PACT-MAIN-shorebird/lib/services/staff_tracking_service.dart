import 'dart:async';
import 'dart:developer' as developer;
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/location_log_model.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'offline_data_service.dart';

class StaffTrackingService {
  final SupabaseClient _supabase;
  Timer? _uploadTimer;
  StreamSubscription<Position>? _positionStream;
  final List<LocationLog> _pendingLogs = [];
  final int _batchSize = 50;
  final int _uploadIntervalSeconds = 300; // 5 minutes

  StaffTrackingService(this._supabase);

  /// Start tracking staff movement
  Future<void> startTracking(String userId) async {
    // Request location permissions
    final permission = await _requestLocationPermission();
    if (!permission) {
      throw Exception('Location permission denied');
    }

    // Configure location tracking
    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 20, // meters
      timeLimit: Duration(seconds: 30),
    );

    // Start location updates
    _positionStream = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((position) async {
      final log = LocationLog(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        userId: userId,
        latitude: position.latitude,
        longitude: position.longitude,
        timestamp: DateTime.now(),
        accuracy: position.accuracy,
        speed: position.speed,
      );

      _pendingLogs.add(log);

      // If we have enough logs, try to upload
      if (_pendingLogs.length >= _batchSize) {
        await _uploadPendingLogs();
      }
    });

    // Set up periodic uploads
    _uploadTimer = Timer.periodic(
      Duration(seconds: _uploadIntervalSeconds),
      (_) => _uploadPendingLogs(),
    );
  }

  /// Upload pending location logs to Supabase
  Future<void> _uploadPendingLogs() async {
    if (_pendingLogs.isEmpty) return;

    // Check connectivity
    final connectivityResult = await Connectivity().checkConnectivity();
    if (connectivityResult == ConnectivityResult.none) {
      return; // No internet connection
    }

    try {
      // Take a batch of logs
      final logsToUpload = _pendingLogs.take(_batchSize).toList();
      final logData = logsToUpload.map((log) => log.toMap()).toList();

      // Upload to Supabase
      final response = await _supabase.rpc(
        'upload_location_logs',
        params: {
          'log_data': logData,
        },
      );

      // Remove uploaded logs from pending
      _pendingLogs.removeRange(0, logsToUpload.length);
    } catch (e) {
      developer.log('Error uploading location logs: $e');
      // Implement exponential backoff here if needed
    }
  }

  /// Record a specific site location
  Future<bool> recordSiteLocation({
    required String siteId,
    required Position position,
    String? notes,
  }) async {
    try {
      final userId = _supabase.auth.currentUser?.id;
      final payload = {
        'site_id': siteId,
        'user_id': userId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'recorded_at': DateTime.now().toIso8601String(),
        'notes': notes,
      };

      // If offline, queue for later sync
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;
      if (!hasConnection) {
        await OfflineDataService().queueSiteLocation(payload);
        return true; // queued successfully
      }

      // Online path: upsert immediately
      final inserted = await _supabase
          .from('site_locations')
          .upsert(payload, onConflict: 'site_id')
          .select()
          .single();
      return inserted['site_id'] == siteId;
    } catch (e) {
      developer.log('Error recording site location: $e');
      return false;
    }
  }

  /// Request location permissions
  Future<bool> _requestLocationPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  /// Stop tracking
  void stopTracking() {
    _positionStream?.cancel();
    _uploadTimer?.cancel();
    _uploadPendingLogs(); // Upload any remaining logs
  }

  /// Dispose of resources
  void dispose() {
    stopTracking();
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
  }

  /// Get staff location logs box
  Future<Box> _getStaffLocationLogsBox() async {
    return await Hive.openBox('staff_location_logs');
  }

  /// Get staff data box
  Future<Box> _getStaffDataBox() async {
    return await Hive.openBox('staff_data');
  }

  /// Cache location log locally
  Future<void> cacheLocationLogLocally(LocationLog log) async {
    try {
      final box = await _getStaffLocationLogsBox();
      final logKey = '${log.userId}_${log.timestamp.millisecondsSinceEpoch}';

      await box.put(logKey, {
        'id': log.id,
        'userId': log.userId,
        'latitude': log.latitude,
        'longitude': log.longitude,
        'timestamp': log.timestamp.toIso8601String(),
        'accuracy': log.accuracy,
        'speed': log.speed,
        'heading': log.heading,
        'altitude': log.altitude,
        'synced': false,
        'cached_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      developer.log('Error caching location log locally: $e');
    }
  }

  /// Get cached location logs for user
  Future<List<LocationLog>> getCachedLocationLogs(String userId,
      {int limit = 100}) async {
    try {
      final box = await _getStaffLocationLogsBox();
      final logs = <LocationLog>[];

      final keys = box.keys
          .where((key) => key.toString().startsWith('${userId}_'))
          .take(limit);

      for (final key in keys) {
        final logData = box.get(key);
        if (logData != null) {
          logs.add(LocationLog(
            id: logData['id'],
            userId: logData['userId'],
            latitude: logData['latitude'],
            longitude: logData['longitude'],
            timestamp: DateTime.parse(logData['timestamp']),
            accuracy: logData['accuracy'],
            speed: logData['speed'],
            heading: logData['heading'],
            altitude: logData['altitude'],
          ));
        }
      }

      // Sort by timestamp (newest first)
      logs.sort((a, b) => b.timestamp.compareTo(a.timestamp));

      return logs;
    } catch (e) {
      developer.log('Error getting cached location logs: $e');
      return [];
    }
  }

  /// Cache staff status and data
  Future<void> cacheStaffData(
      String userId, Map<String, dynamic> staffData) async {
    try {
      final box = await _getStaffDataBox();

      await box.put('staff_$userId', {
        'user_id': userId,
        'data': staffData,
        'last_updated': DateTime.now().toIso8601String(),
        'status': staffData['status'] ?? 'unknown',
      });
    } catch (e) {
      developer.log('Error caching staff data: $e');
    }
  }

  /// Get cached staff data
  Future<Map<String, dynamic>?> getCachedStaffData(String userId) async {
    try {
      final box = await _getStaffDataBox();
      return box.get('staff_$userId');
    } catch (e) {
      developer.log('Error getting cached staff data: $e');
      return null;
    }
  }

  /// Enhanced location tracking with local caching
  Future<void> startTrackingCached(String userId) async {
    await startTracking(userId);

    // Also cache initial staff data
    await cacheStaffData(userId, {
      'status': 'tracking',
      'last_seen': DateTime.now().toIso8601String(),
      'tracking_started': DateTime.now().toIso8601String(),
    });
  }

  /// Enhanced position handler with local caching
  void _onPositionUpdateCached(Position position, String userId) {
    final log = LocationLog(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      userId: userId,
      latitude: position.latitude,
      longitude: position.longitude,
      timestamp: DateTime.now(),
      accuracy: position.accuracy,
      speed: position.speed,
    );

    // Add to pending logs (for upload)
    _pendingLogs.add(log);

    // Also cache locally immediately
    cacheLocationLogLocally(log);

    // Update staff data
    cacheStaffData(userId, {
      'status': 'tracking',
      'last_location': {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'timestamp': DateTime.now().toIso8601String(),
        'accuracy': position.accuracy,
      },
      'last_seen': DateTime.now().toIso8601String(),
    });

    // Upload if batch size reached
    if (_pendingLogs.length >= _batchSize) {
      _uploadPendingLogsCached();
    }
  }

  /// Upload pending logs with local fallback
  Future<void> _uploadPendingLogsCached() async {
    if (_pendingLogs.isEmpty) return;

    // Check connectivity
    final connectivityResult = await Connectivity().checkConnectivity();
    final hasConnection = connectivityResult != ConnectivityResult.none;

    if (!hasConnection) {
      // No internet - logs are already cached locally
      developer.log('No internet connection - logs cached locally');
      return;
    }

    try {
      // Try to upload to Supabase
      await _uploadPendingLogs();

      // Mark uploaded logs as synced in local cache
      await _markLogsAsSynced(_pendingLogs);
    } catch (e) {
      developer.log('Upload failed, logs remain cached locally: $e');
      // Logs remain in cache for later retry
    }
  }

  /// Mark logs as synced in local cache
  Future<void> _markLogsAsSynced(List<LocationLog> logs) async {
    try {
      final box = await _getStaffLocationLogsBox();

      for (final log in logs) {
        final logKey = '${log.userId}_${log.timestamp.millisecondsSinceEpoch}';
        final existing = box.get(logKey);
        if (existing != null) {
          existing['synced'] = true;
          await box.put(logKey, existing);
        }
      }
    } catch (e) {
      developer.log('Error marking logs as synced: $e');
    }
  }

  /// Sync cached location logs when online
  Future<void> syncCachedLocationLogs() async {
    try {
      final box = await _getStaffLocationLogsBox();
      final keys = box.keys.toList();

      final unsyncedLogs = <LocationLog>[];

      for (final key in keys) {
        final logData = box.get(key);
        if (logData != null && !(logData['synced'] ?? false)) {
          unsyncedLogs.add(LocationLog(
            id: logData['id'],
            userId: logData['userId'],
            latitude: logData['latitude'],
            longitude: logData['longitude'],
            timestamp: DateTime.parse(logData['timestamp']),
            accuracy: logData['accuracy'],
            speed: logData['speed'],
            heading: logData['heading'],
            altitude: logData['altitude'],
          ));
        }
      }

      if (unsyncedLogs.isNotEmpty) {
        // Group by user and upload in batches
        final userGroups = <String, List<LocationLog>>{};
        for (final log in unsyncedLogs) {
          if (!userGroups.containsKey(log.userId)) {
            userGroups[log.userId!] = [];
          }
          userGroups[log.userId!]!.add(log);
        }

        for (final entry in userGroups.entries) {
          final userId = entry.key;
          final userLogs = entry.value;

          // Upload in batches
          for (int i = 0; i < userLogs.length; i += _batchSize) {
            final batch = userLogs.skip(i).take(_batchSize).toList();
            await _uploadLogBatch(batch);
          }
        }

        developer.log('Synced ${unsyncedLogs.length} cached location logs');
      }
    } catch (e) {
      developer.log('Error syncing cached location logs: $e');
    }
  }

  /// Upload a batch of logs
  Future<void> _uploadLogBatch(List<LocationLog> logs) async {
    try {
      final logData = logs.map((log) => log.toMap()).toList();

      await _supabase.rpc(
        'upload_location_logs',
        params: {'log_data': logData},
      );

      // Mark as synced
      await _markLogsAsSynced(logs);
    } catch (e) {
      developer.log('Error uploading log batch: $e');
      rethrow; // Re-throw to handle in caller
    }
  }

  /// Get staff location history (cached + recent)
  Future<List<Map<String, dynamic>>> getStaffLocationHistory(
    String userId, {
    Duration? timeRange,
    int limit = 100,
  }) async {
    try {
      final range = timeRange ?? const Duration(hours: 24);
      final cutoff = DateTime.now().subtract(range);

      final cachedLogs = await getCachedLocationLogs(userId, limit: limit);

      // Filter by time range and convert to map
      return cachedLogs
          .where((log) => log.timestamp.isAfter(cutoff))
          .take(limit)
          .map((log) => {
                'latitude': log.latitude,
                'longitude': log.longitude,
                'timestamp': log.timestamp.toIso8601String(),
                'accuracy': log.accuracy,
                'speed': log.speed,
              })
          .toList();
    } catch (e) {
      developer.log('Error getting staff location history: $e');
      return [];
    }
  }

  /// Get all tracked staff locations (for coordination)
  Future<List<Map<String, dynamic>>> getAllStaffLocations() async {
    try {
      final staffBox = await _getStaffDataBox();
      final locations = <Map<String, dynamic>>[];

      for (final key in staffBox.keys) {
        final staffData = staffBox.get(key);
        if (staffData != null && staffData['last_location'] != null) {
          locations.add({
            'user_id': staffData['user_id'],
            'location': staffData['last_location'],
            'status': staffData['status'],
            'last_seen': staffData['last_seen'],
          });
        }
      }

      return locations;
    } catch (e) {
      developer.log('Error getting all staff locations: $e');
      return [];
    }
  }

  /// Clear cached data for specific user
  Future<void> clearStaffCache(String userId) async {
    try {
      final logsBox = await _getStaffLocationLogsBox();
      final staffBox = await _getStaffDataBox();

      // Remove location logs for user
      final logKeys =
          logsBox.keys.where((key) => key.toString().startsWith('${userId}_'));
      for (final key in logKeys) {
        await logsBox.delete(key);
      }

      // Remove staff data
      await staffBox.delete('staff_$userId');

      developer.log('Cleared cache for staff: $userId');
    } catch (e) {
      developer.log('Error clearing staff cache: $e');
    }
  }

  /// Clear all cached staff data
  Future<void> clearAllStaffCache() async {
    try {
      final logsBox = await _getStaffLocationLogsBox();
      final staffBox = await _getStaffDataBox();

      await logsBox.clear();
      await staffBox.clear();

      developer.log('Cleared all staff cache');
    } catch (e) {
      developer.log('Error clearing all staff cache: $e');
    }
  }

  /// Get staff tracking cache statistics
  Future<Map<String, dynamic>> getStaffCacheStats() async {
    try {
      final logsBox = await _getStaffLocationLogsBox();
      final staffBox = await _getStaffDataBox();

      final syncedLogs = logsBox.keys.where((key) {
        final log = logsBox.get(key);
        return log != null && (log['synced'] ?? false);
      }).length;

      final unsyncedLogs = logsBox.length - syncedLogs;

      return {
        'total_location_logs': logsBox.length,
        'synced_logs': syncedLogs,
        'unsynced_logs': unsyncedLogs,
        'tracked_staff': staffBox.length,
      };
    } catch (e) {
      developer.log('Error getting staff cache stats: $e');
      return {};
    }
  }
}
