// lib/services/location_tracking_service.dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:workmanager/workmanager.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/location_log_model.dart';
import 'field_operations_repository.dart';

// Background task name
const String locationTrackingTask = "locationTrackingTask";

// Background callback handler - must be a top-level function
@pragma('vm:entry-point')
void callbackDispatcher() {
  WidgetsFlutterBinding.ensureInitialized();

  Workmanager().executeTask((task, inputData) async {
    try {
      if (task == locationTrackingTask) {
        // Get current position
        final position = await Geolocator.getCurrentPosition();

        // Get visit ID from input data
        final visitId = inputData?['visitId'] as String?;
        if (visitId == null) return false;

        // Create location log
        final locationLog = LocationLog(
          visitId: visitId,
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
          speed: position.speed,
          heading: position.heading,
          altitude: position.altitude,
        );

        // Store location log
        final repository = FieldOperationsRepository();
        await repository.initialize();
        await repository.saveLocationLog(locationLog);

        debugPrint(
          'Background location tracked: ${position.latitude}, ${position.longitude}',
        );
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('Error in background location tracking: $e');
      return false;
    }
  });
}

class LocationTrackingService {
  static final LocationTrackingService _instance =
      LocationTrackingService._internal();
  factory LocationTrackingService() => _instance;

  LocationTrackingService._internal();

  final FieldOperationsRepository _repository = FieldOperationsRepository();

  StreamSubscription<Position>? _positionStreamSubscription;
  Timer? _backgroundRegistrationTimer;
  bool _isTrackingEnabled = false;
  String? _currentVisitId;
  List<LocationLog> _currentJourneyPath = [];

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
  }

  /// Get location logs box
  Future<Box> _getLocationLogsBox() async {
    return await Hive.openBox('location_logs_cache');
  }

  /// Get journey paths box
  Future<Box> _getJourneyPathsBox() async {
    return await Hive.openBox('journey_paths');
  }

  /// Cache location log locally for offline access
  Future<void> cacheLocationLogLocally(LocationLog log) async {
    try {
      final box = await _getLocationLogsBox();
      final logKey = '${log.visitId}_${log.timestamp.millisecondsSinceEpoch}';

      await box.put(logKey, {
        'visitId': log.visitId,
        'userId': log.userId,
        'latitude': log.latitude,
        'longitude': log.longitude,
        'accuracy': log.accuracy,
        'speed': log.speed,
        'heading': log.heading,
        'altitude': log.altitude,
        'timestamp': log.timestamp.toIso8601String(),
        'synced': false,
        'cached_at': DateTime.now().toIso8601String(),
      });

      // Add to current journey path
      _currentJourneyPath.add(log);

      // Update journey path cache
      if (log.visitId != null) {
        await _updateJourneyPathCache(log.visitId!);
      }
    } catch (e) {
      debugPrint('Error caching location log locally: $e');
    }
  }

  /// Update journey path cache for a visit
  Future<void> _updateJourneyPathCache(String visitId) async {
    try {
      final box = await _getJourneyPathsBox();

      final journeyData = {
        'visitId': visitId,
        'path': _currentJourneyPath
            .map((log) => {
                  'lat': log.latitude,
                  'lng': log.longitude,
                  'timestamp': log.timestamp.toIso8601String(),
                  'accuracy': log.accuracy,
                })
            .toList(),
        'start_time': _currentJourneyPath.isNotEmpty
            ? _currentJourneyPath.first.timestamp.toIso8601String()
            : null,
        'end_time': _currentJourneyPath.isNotEmpty
            ? _currentJourneyPath.last.timestamp.toIso8601String()
            : null,
        'total_points': _currentJourneyPath.length,
        'updated_at': DateTime.now().toIso8601String(),
      };

      await box.put('journey_$visitId', journeyData);
    } catch (e) {
      debugPrint('Error updating journey path cache: $e');
    }
  }

  /// Get cached journey path for a visit
  Future<List<Map<String, dynamic>>?> getCachedJourneyPath(
      String visitId) async {
    try {
      final box = await _getJourneyPathsBox();
      final journeyData = box.get('journey_$visitId');

      if (journeyData == null) return null;

      return List<Map<String, dynamic>>.from(journeyData['path']);
    } catch (e) {
      debugPrint('Error getting cached journey path: $e');
      return null;
    }
  }

  /// Get all cached location logs for a visit
  Future<List<LocationLog>> getCachedLocationLogs(String visitId) async {
    try {
      final box = await _getLocationLogsBox();
      final logs = <LocationLog>[];

      final keys =
          box.keys.where((key) => key.toString().startsWith('${visitId}_'));

      for (final key in keys) {
        final logData = box.get(key);
        if (logData != null) {
          logs.add(LocationLog(
            visitId: logData['visitId'],
            userId: logData['userId'],
            latitude: logData['latitude'],
            longitude: logData['longitude'],
            accuracy: logData['accuracy'],
            speed: logData['speed'],
            heading: logData['heading'],
            altitude: logData['altitude'],
            timestamp: DateTime.parse(logData['timestamp']),
          ));
        }
      }

      // Sort by timestamp
      logs.sort((a, b) => a.timestamp.compareTo(b.timestamp));

      return logs;
    } catch (e) {
      debugPrint('Error getting cached location logs: $e');
      return [];
    }
  }

  /// Sync cached location logs when online
  Future<void> syncCachedLocationLogs() async {
    try {
      print('🔄 Starting location logs sync...');
      final box = await _getLocationLogsBox();
      final keys = box.keys.toList();

      int syncedCount = 0;
      int failedCount = 0;

      for (final key in keys) {
        final logData = box.get(key);
        if (logData != null && !(logData['synced'] ?? false)) {
          try {
            final log = LocationLog(
              visitId: logData['visitId'],
              userId: logData['userId'],
              latitude: logData['latitude'],
              longitude: logData['longitude'],
              accuracy: logData['accuracy'],
              speed: logData['speed'],
              heading: logData['heading'],
              altitude: logData['altitude'],
              timestamp: DateTime.parse(logData['timestamp']),
            );

            // Save to repository (which stores locally)
            await _repository.saveLocationLog(log);

            // 🚀 NEW: Sync to Supabase location_logs table
            await _syncLocationLogToSupabase(log);

            // Mark as synced in cache
            logData['synced'] = true;
            await box.put(key, logData);

            syncedCount++;
            print('✅ Synced location log $key');
          } catch (e) {
            failedCount++;
            print('❌ Failed to sync location log $key: $e');
          }
        }
      }

      print(
          '🎉 Location logs sync complete: $syncedCount synced, $failedCount failed');
    } catch (e) {
      print('❌ Error syncing cached location logs: $e');
    }
  }

  /// NEW: Sync a single location log to Supabase
  Future<void> _syncLocationLogToSupabase(LocationLog log) async {
    try {
      // Import Supabase at the top of this file if not already
      final supabase = Supabase.instance.client;
      
      // Check if the visit_id exists in mmp_site_entries before syncing
      // If not, skip syncing this log (it will be synced when the visit is synced)
      if (log.visitId != null) {
        try {
          final visitExists = await supabase
              .from('mmp_site_entries')
              .select('id')
              .eq('id', log.visitId!)
              .maybeSingle();
          
          if (visitExists == null) {
            // Visit doesn't exist yet in Supabase, skip syncing this location log
            // It will be synced later when the visit is synced
            print('⏳ Skipping location log sync - visit ${log.visitId} not yet synced');
            return;
          }
        } catch (e) {
          // If we can't verify, skip to avoid foreign key errors
          print('⏳ Skipping location log sync - could not verify visit: $e');
          return;
        }
      }
      
      // Build payload using backend column names
      final logData = <String, dynamic>{
        'id': log.id, // UUID generated by model
        'visit_id': log.visitId,
        'user_id': log.userId ?? supabase.auth.currentUser?.id,
        'latitude': log.latitude,
        'longitude': log.longitude,
        'accuracy': log.accuracy,
        'speed': log.speed,
        'heading': log.heading,
        'timestamp': log.timestamp.toIso8601String(),
      }..removeWhere((k, v) => v == null); // Clean nulls to avoid schema issues

      // Only include altitude if available to avoid PostgREST schema errors
      if (log.altitude != null) {
        logData['altitude'] = log.altitude;
      }

      await supabase.from('location_logs').upsert(logData);

      print('📍 Location log synced to Supabase: ${log.id}');
    } catch (e) {
      print('❌ Failed to sync location log to Supabase: $e');
      rethrow;
    }
  }

  /// Start journey tracking with local storage
  Future<bool> startJourneyTracking(String visitId) async {
    _currentJourneyPath.clear();
    _currentVisitId = visitId;

    // Load existing journey path if available
    final cachedPath = await getCachedJourneyPath(visitId);
    if (cachedPath != null && cachedPath.isNotEmpty) {
      // Convert cached path back to LocationLog objects
      _currentJourneyPath = cachedPath
          .map((point) => LocationLog(
                visitId: visitId,
                latitude: point['lat'],
                longitude: point['lng'],
                accuracy: point['accuracy'] ?? 0.0,
                timestamp: DateTime.parse(point['timestamp']),
              ))
          .toList();

      debugPrint(
          'Loaded existing journey path with ${_currentJourneyPath.length} points');
    }

    return await startTracking(visitId);
  }

  /// Stop journey tracking and save final path
  Future<void> stopJourneyTracking() async {
    if (_currentVisitId != null) {
      await _updateJourneyPathCache(_currentVisitId!);
    }

    await stopTracking();
    _currentJourneyPath.clear();
  }

  /// Get current journey statistics
  Future<Map<String, dynamic>> getJourneyStats(String visitId) async {
    try {
      final journeyPath =
          _currentVisitId == visitId && _currentJourneyPath.isNotEmpty
              ? _currentJourneyPath
              : await getCachedLocationLogs(visitId);

      if (journeyPath.isEmpty) {
        return {'total_points': 0, 'duration': 0, 'distance': 0.0};
      }

      final startTime = journeyPath.first.timestamp;
      final endTime = journeyPath.last.timestamp;
      final duration = endTime.difference(startTime).inMinutes;

      // Calculate approximate distance (simplified)
      double totalDistance = 0.0;
      for (int i = 1; i < journeyPath.length; i++) {
        final prev = journeyPath[i - 1];
        final curr = journeyPath[i];
        // Simple distance calculation (not accurate for large distances)
        final distance = Geolocator.distanceBetween(
          prev.latitude,
          prev.longitude,
          curr.latitude,
          curr.longitude,
        );
        totalDistance += distance;
      }

      return {
        'total_points': journeyPath.length,
        'duration_minutes': duration,
        'distance_meters': totalDistance,
        'start_time': startTime.toIso8601String(),
        'end_time': endTime.toIso8601String(),
      };
    } catch (e) {
      debugPrint('Error getting journey stats: $e');
      return {'total_points': 0, 'duration': 0, 'distance': 0.0};
    }
  }

  /// Export journey data for reporting
  Future<Map<String, dynamic>> exportJourneyData(String visitId) async {
    try {
      final journeyPath = await getCachedJourneyPath(visitId);
      final stats = await getJourneyStats(visitId);

      return {
        'visit_id': visitId,
        'journey_path': journeyPath,
        'statistics': stats,
        'exported_at': DateTime.now().toIso8601String(),
      };
    } catch (e) {
      debugPrint('Error exporting journey data: $e');
      return {};
    }
  }

  /// Clear cached data for a specific visit
  Future<void> clearVisitCache(String visitId) async {
    try {
      final logsBox = await _getLocationLogsBox();
      final pathsBox = await _getJourneyPathsBox();

      // Remove location logs for this visit
      final logKeys =
          logsBox.keys.where((key) => key.toString().startsWith('${visitId}_'));
      for (final key in logKeys) {
        await logsBox.delete(key);
      }

      // Remove journey path
      await pathsBox.delete('journey_$visitId');

      debugPrint('Cleared cache for visit: $visitId');
    } catch (e) {
      debugPrint('Error clearing visit cache: $e');
    }
  }

  /// Get cache statistics
  Future<Map<String, dynamic>> getCacheStats() async {
    try {
      final logsBox = await _getLocationLogsBox();
      final pathsBox = await _getJourneyPathsBox();

      return {
        'cached_location_logs': logsBox.length,
        'cached_journey_paths': pathsBox.length,
        'current_journey_points': _currentJourneyPath.length,
        'current_visit_id': _currentVisitId,
      };
    } catch (e) {
      debugPrint('Error getting cache stats: $e');
      return {};
    }
  }

  // Initialize location service
  Future<void> initialize() async {
    await _repository.initialize();

    // Skip Workmanager initialization on web (unsupported) / during tests
    if (kIsWeb) {
      debugPrint('Workmanager not supported on web; skipping background init');
    } else {
      await Workmanager().initialize(
        callbackDispatcher,
        isInDebugMode: kDebugMode,
      );
    }

    // Check if location services are enabled
    await _checkLocationPermission();

    debugPrint('LocationTrackingService initialized');
  }

  // Check and request location permissions
  Future<bool> _checkLocationPermission() async {
    bool serviceEnabled;
    LocationPermission permission;

    // Check if location services are enabled
    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      debugPrint('Location services are disabled.');
      // We could request the user to enable location services here
      // but for now we'll just return false
      return false;
    }

    // Check location permission
    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        debugPrint('Location permissions are denied.');
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      // Permissions are denied forever, we cannot request permissions.
      debugPrint('Location permissions are permanently denied.');
      return false;
    }

    return true;
  }

  // Start tracking for a specific visit
  Future<bool> startTracking(String visitId) async {
    if (_isTrackingEnabled) {
      await stopTracking(); // Stop existing tracking
    }

    final hasPermission = await _checkLocationPermission();
    if (!hasPermission) return false;

    _currentVisitId = visitId;

    // Immediately capture one high-accuracy location point at start
    try {
      final initialPosition = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      // Reuse the same handler to persist and attempt sync
      await _onPositionUpdate(initialPosition);
    } catch (e) {
      debugPrint('Could not capture initial position on startTracking: $e');
    }

    // Start foreground tracking
    _positionStreamSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter:
            10, // Minimum distance (in meters) before receiving updates
      ),
    ).listen(_onPositionUpdate);

    // Register background task (native platforms only)
    if (!kIsWeb) {
      _registerBackgroundTask();
    }

    _isTrackingEnabled = true;
    debugPrint('Location tracking started for visit: $visitId');

    return true;
  }

  // Stop tracking
  Future<void> stopTracking() async {
    // Save final journey path
    if (_currentVisitId != null) {
      await _updateJourneyPathCache(_currentVisitId!);
    }

    // Cancel foreground tracking
    await _positionStreamSubscription?.cancel();
    _positionStreamSubscription = null;

    // Cancel background task registration timer
    _backgroundRegistrationTimer?.cancel();
    _backgroundRegistrationTimer = null;

    // Cancel background task
    await Workmanager().cancelByTag(_currentVisitId ?? 'location_tracking');

    _isTrackingEnabled = false;
    _currentVisitId = null;
    _currentJourneyPath.clear();

    debugPrint('Location tracking stopped');
  }

  // Position update handler
  Future<void> _onPositionUpdate(Position position) async {
    if (_currentVisitId == null) return;

    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    final locationLog = LocationLog(
      visitId: _currentVisitId!,
      userId: userId,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      speed: position.speed,
      heading: position.heading,
      altitude: position.altitude,
    );

    // Save to repository (for local storage)
    await _repository.saveLocationLog(locationLog);

    // Cache locally for offline access
    await cacheLocationLogLocally(locationLog);

    // 🚀 NEW: Try to sync to Supabase immediately if online
    try {
      await _syncLocationLogToSupabase(locationLog);
      print('📍 Real-time location synced to Supabase');
    } catch (e) {
      print('⚠️ Could not sync location to Supabase (will retry later): $e');
      // Don't throw - we've already cached it locally for later sync
    }

    debugPrint('Location tracked: ${position.latitude}, ${position.longitude}');
  }

  // Register background task that re-registers itself
  void _registerBackgroundTask() {
    if (kIsWeb) return; // Guard
    // Cancel existing timer
    _backgroundRegistrationTimer?.cancel();

    // Schedule the task
    _scheduleBackgroundTask();

    // Re-register the task periodically to ensure it keeps running
    _backgroundRegistrationTimer = Timer.periodic(
      const Duration(minutes: 15),
      (_) => _scheduleBackgroundTask(),
    );
  }

  // Schedule the background task
  Future<void> _scheduleBackgroundTask() async {
    if (kIsWeb) return; // Guard
    if (_currentVisitId == null) return;

    await Workmanager().registerPeriodicTask(
      _currentVisitId!, // Unique name
      locationTrackingTask, // Task name
      tag: _currentVisitId!, // Tag to cancel by later
      initialDelay: const Duration(seconds: 10),
      frequency: const Duration(minutes: 15),
      constraints: Constraints(
        requiresBatteryNotLow: false,
        requiresCharging: false,
        requiresDeviceIdle: false,
        requiresStorageNotLow: false,
      ),
      inputData: {'visitId': _currentVisitId},
      existingWorkPolicy: ExistingPeriodicWorkPolicy.replace,
    );

    debugPrint('Background location tracking task registered');
  }

  // Get current position
  Future<Position> getCurrentPosition() async {
    await _checkLocationPermission();
    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );
  }

  // Check if tracking is enabled
  bool isTrackingEnabled() {
    return _isTrackingEnabled;
  }

  // Get current visit ID being tracked
  String? getCurrentVisitId() {
    return _currentVisitId;
  }
}
