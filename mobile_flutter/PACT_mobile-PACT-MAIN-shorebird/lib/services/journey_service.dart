// lib/services/journey_service.dart

import 'dart:async';
import 'dart:math' as math;
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart' as latlong;
import 'package:hive_flutter/hive_flutter.dart';
import '../models/site_visit.dart';
import '../algorithms/route_optimizer.dart';
import '../algorithms/nearest_site_visits.dart';
import '../services/location_tracking_service.dart';
import '../services/staff_tracking_service.dart';

class JourneyWaypoint {
  final SiteVisit visit;
  final latlong.LatLng position;
  final int order;
  final bool isCompleted;

  JourneyWaypoint({
    required this.visit,
    required this.position,
    required this.order,
    this.isCompleted = false,
  });
}

class JourneyProgress {
  final List<JourneyWaypoint> waypoints;
  final JourneyWaypoint? currentWaypoint;
  final double distanceTraveled;
  final Duration timeElapsed;
  final latlong.LatLng currentPosition;

  JourneyProgress({
    required this.waypoints,
    this.currentWaypoint,
    required this.distanceTraveled,
    required this.timeElapsed,
    required this.currentPosition,
  });

  double get progressPercentage {
    final completedCount = waypoints.where((w) => w.isCompleted).length;
    return waypoints.isEmpty ? 0.0 : (completedCount / waypoints.length) * 100;
  }
}

class JourneyService {
  final LocationTrackingService _locationTracking;
  final StaffTrackingService _staffTracking;

  JourneyService(this._locationTracking, this._staffTracking);

  StreamSubscription<Position>? _journeyTrackingSubscription;
  List<JourneyWaypoint> _currentJourney = [];
  DateTime? _journeyStartTime;
  double _lastDistance = 0.0;

  /// Start a journey with optimized route for assigned tasks
  Future<List<JourneyWaypoint>> startJourney({
    required List<SiteVisit> assignedTasks,
    required latlong.LatLng startPosition,
  }) async {
    // Optimize route using route_optimizer algorithm
    final optimizedRoute = RouteOptimizer.optimizeRoute(
      visits: assignedTasks,
      startLocation: Location(
        latitude: startPosition.latitude,
        longitude: startPosition.longitude,
      ),
    );

    // Create journey waypoints
    _currentJourney = [];
    for (int i = 0; i < optimizedRoute.length; i++) {
      final visit = optimizedRoute[i];
      _currentJourney.add(JourneyWaypoint(
        visit: visit,
        position: latlong.LatLng(visit.latitude!, visit.longitude!),
        order: i + 1,
      ));
    }

    // Start journey tracking
    _journeyStartTime = DateTime.now();
    await _startJourneyTracking();

    return _currentJourney;
  }

  /// Start location tracking for the journey
  Future<void> _startJourneyTracking() async {
    // Start location tracking with journey-specific settings
    await _locationTracking.initialize();

    // Configure for journey tracking - balance between accuracy and battery
    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10, // Update every 10 meters
      timeLimit: Duration(seconds: 30),
    );

    _journeyTrackingSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(_onLocationUpdate);
  }

  /// Handle location updates during journey
  void _onLocationUpdate(Position position) {
    final currentLatLng = latlong.LatLng(position.latitude, position.longitude);

    // Check if we've reached the current waypoint
    _checkWaypointCompletion(currentLatLng);

    // Update journey progress
    _updateJourneyProgress(currentLatLng, position);
  }

  /// Check if current waypoint has been reached
  void _checkWaypointCompletion(latlong.LatLng currentPosition) {
    if (_currentJourney.isEmpty) return;

    final currentWaypoint = _currentJourney.firstWhere(
      (waypoint) => !waypoint.isCompleted,
      orElse: () => _currentJourney.last,
    );

    if (currentWaypoint.isCompleted) return;

    // Calculate distance to current waypoint
    final distance =
        _calculateDistance(currentPosition, currentWaypoint.position);

    // If within 50 meters of waypoint, mark as completed
    if (distance <= 50.0) {
      _markWaypointCompleted(currentWaypoint);
    }
  }

  /// Mark a waypoint as completed
  void _markWaypointCompleted(JourneyWaypoint waypoint) {
    final index = _currentJourney.indexOf(waypoint);
    if (index != -1) {
      _currentJourney[index] = JourneyWaypoint(
        visit: waypoint.visit,
        position: waypoint.position,
        order: waypoint.order,
        isCompleted: true,
      );
    }
  }

  /// Update journey progress metrics
  void _updateJourneyProgress(
      latlong.LatLng currentPosition, Position position) {
    // Calculate distance traveled since last update
    if (_lastDistance > 0) {
      final newDistance = _calculateDistanceFromLastPosition(currentPosition);
      _lastDistance += newDistance;
    } else {
      _lastDistance = 0.0;
    }
  }

  /// Get current journey progress
  JourneyProgress getCurrentProgress(latlong.LatLng currentPosition) {
    final currentWaypoint = _currentJourney.isNotEmpty
        ? _currentJourney.firstWhere(
            (waypoint) => !waypoint.isCompleted,
            orElse: () => _currentJourney.last,
          )
        : null;

    final timeElapsed = _journeyStartTime != null
        ? DateTime.now().difference(_journeyStartTime!)
        : Duration.zero;

    return JourneyProgress(
      waypoints: _currentJourney,
      currentWaypoint: currentWaypoint,
      distanceTraveled: _lastDistance,
      timeElapsed: timeElapsed,
      currentPosition: currentPosition,
    );
  }

  /// Stop journey tracking
  Future<void> stopJourney() async {
    await _journeyTrackingSubscription?.cancel();
    _journeyTrackingSubscription = null;
    _currentJourney.clear();
    _journeyStartTime = null;
    _lastDistance = 0.0;

    await _locationTracking.stopTracking();
  }

  /// Calculate distance between two LatLng points
  double _calculateDistance(latlong.LatLng point1, latlong.LatLng point2) {
    return _haversineDistance(
      point1.latitude,
      point1.longitude,
      point2.latitude,
      point2.longitude,
    );
  }

  /// Calculate distance from last known position
  double _calculateDistanceFromLastPosition(latlong.LatLng currentPosition) {
    // This would need to track the last position
    // For simplicity, returning 0 - implement proper distance calculation
    return 0.0;
  }

  /// Haversine distance calculation
  double _haversineDistance(
      double lat1, double lon1, double lat2, double lon2) {
    const double earthRadius = 6371000; // meters
    final double dLat = _degreesToRadians(lat2 - lat1);
    final double dLon = _degreesToRadians(lon2 - lon1);

    final double a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1) *
            math.cos(lat2) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    final double c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));

    return earthRadius * c;
  }

  double _degreesToRadians(double degrees) =>
      degrees * (3.141592653589793 / 180);

  /// Get optimized route polyline for map display
  List<latlong.LatLng> getRoutePolyline() {
    return _currentJourney.map((waypoint) => waypoint.position).toList();
  }

  /// Check if journey is completed
  bool get isJourneyCompleted {
    return _currentJourney.every((waypoint) => waypoint.isCompleted);
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
  }

  /// Get journeys box
  Future<Box> _getJourneysBox() async {
    return await Hive.openBox('journeys_cache');
  }

  /// Get journey progress box
  Future<Box> _getJourneyProgressBox() async {
    return await Hive.openBox('journey_progress');
  }

  /// Cache journey route and waypoints
  Future<void> cacheJourneyRoute(
    List<JourneyWaypoint> waypoints,
    String journeyId,
    latlong.LatLng startPosition,
  ) async {
    try {
      final box = await _getJourneysBox();

      final waypointsData = waypoints
          .map((waypoint) => {
                'visit_id': waypoint.visit.id,
                'visit_data': waypoint.visit.toJson(),
                'position': {
                  'latitude': waypoint.position.latitude,
                  'longitude': waypoint.position.longitude,
                },
                'order': waypoint.order,
                'is_completed': waypoint.isCompleted,
              })
          .toList();

      await box.put('journey_$journeyId', {
        'waypoints': waypointsData,
        'start_position': {
          'latitude': startPosition.latitude,
          'longitude': startPosition.longitude,
        },
        'created_at': DateTime.now().toIso8601String(),
        'total_waypoints': waypoints.length,
        'journey_id': journeyId,
      });
    } catch (e) {
      print('Error caching journey route: $e');
    }
  }

  /// Get cached journey route
  Future<List<JourneyWaypoint>?> getCachedJourneyRoute(String journeyId) async {
    try {
      final box = await _getJourneysBox();
      final cached = box.get('journey_$journeyId');
      if (cached == null) return null;

      final waypointsData = cached['waypoints'] as List<dynamic>;
      return waypointsData.map((waypointData) {
        final visit = SiteVisit.fromJson(waypointData['visit_data']);
        final position = latlong.LatLng(
          waypointData['position']['latitude'],
          waypointData['position']['longitude'],
        );

        return JourneyWaypoint(
          visit: visit,
          position: position,
          order: waypointData['order'],
          isCompleted: waypointData['is_completed'] ?? false,
        );
      }).toList();
    } catch (e) {
      print('Error getting cached journey route: $e');
      return null;
    }
  }

  /// Cache journey progress
  Future<void> cacheJourneyProgress(
    String journeyId,
    JourneyProgress progress,
  ) async {
    try {
      final box = await _getJourneyProgressBox();

      final waypointsData = progress.waypoints
          .map((waypoint) => {
                'visit_id': waypoint.visit.id,
                'order': waypoint.order,
                'is_completed': waypoint.isCompleted,
              })
          .toList();

      await box.put('progress_$journeyId', {
        'waypoints': waypointsData,
        'current_waypoint_order': progress.currentWaypoint?.order,
        'distance_traveled': progress.distanceTraveled,
        'time_elapsed_seconds': progress.timeElapsed.inSeconds,
        'current_position': {
          'latitude': progress.currentPosition.latitude,
          'longitude': progress.currentPosition.longitude,
        },
        'progress_percentage': progress.progressPercentage,
        'last_updated': DateTime.now().toIso8601String(),
        'journey_id': journeyId,
      });
    } catch (e) {
      print('Error caching journey progress: $e');
    }
  }

  /// Get cached journey progress
  Future<JourneyProgress?> getCachedJourneyProgress(String journeyId) async {
    try {
      final box = await _getJourneyProgressBox();
      final cached = box.get('progress_$journeyId');
      if (cached == null) return null;

      final waypointsData = cached['waypoints'] as List<dynamic>;

      // Need to get the full journey waypoints to reconstruct progress
      final journeyWaypoints = await getCachedJourneyRoute(journeyId);
      if (journeyWaypoints == null) return null;

      // Update completion status from cached progress
      final updatedWaypoints = journeyWaypoints.map((waypoint) {
        final progressData = waypointsData.firstWhere(
          (w) => w['order'] == waypoint.order,
          orElse: () => {'is_completed': false},
        );

        return JourneyWaypoint(
          visit: waypoint.visit,
          position: waypoint.position,
          order: waypoint.order,
          isCompleted: progressData['is_completed'] ?? false,
        );
      }).toList();

      final currentWaypoint = updatedWaypoints.firstWhere(
        (w) => !w.isCompleted,
        orElse: () => updatedWaypoints.last,
      );

      final currentPosition = latlong.LatLng(
        cached['current_position']['latitude'],
        cached['current_position']['longitude'],
      );

      return JourneyProgress(
        waypoints: updatedWaypoints,
        currentWaypoint: currentWaypoint,
        distanceTraveled: cached['distance_traveled'] ?? 0.0,
        timeElapsed: Duration(seconds: cached['time_elapsed_seconds'] ?? 0),
        currentPosition: currentPosition,
      );
    } catch (e) {
      print('Error getting cached journey progress: $e');
      return null;
    }
  }

  /// Start journey with local caching
  Future<List<JourneyWaypoint>> startJourneyCached({
    required List<SiteVisit> assignedTasks,
    required latlong.LatLng startPosition,
    String? journeyId,
  }) async {
    final id = journeyId ?? 'journey_${DateTime.now().millisecondsSinceEpoch}';

    // Start the journey
    final waypoints = await startJourney(
      assignedTasks: assignedTasks,
      startPosition: startPosition,
    );

    // Cache the journey route
    await cacheJourneyRoute(waypoints, id, startPosition);

    return waypoints;
  }

  /// Resume cached journey
  Future<List<JourneyWaypoint>?> resumeJourney(String journeyId) async {
    try {
      // Get cached journey route
      final cachedWaypoints = await getCachedJourneyRoute(journeyId);
      if (cachedWaypoints == null) return null;

      // Restore journey state
      _currentJourney = List.from(cachedWaypoints);
      _journeyStartTime =
          DateTime.now(); // Reset start time for resumed journey

      // Get cached progress
      final cachedProgress = await getCachedJourneyProgress(journeyId);
      if (cachedProgress != null) {
        _lastDistance = cachedProgress.distanceTraveled;
        // Restore completion status
        _currentJourney = List.from(cachedProgress.waypoints);
      }

      // Restart journey tracking
      await _startJourneyTracking();

      return _currentJourney;
    } catch (e) {
      print('Error resuming journey: $e');
      return null;
    }
  }

  /// Update journey progress with caching
  void updateJourneyProgressCached(
      latlong.LatLng currentPosition, String journeyId) {
    _updateJourneyProgress(
        currentPosition,
        Position(
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          timestamp: DateTime.now(),
          accuracy: 0.0,
          altitude: 0.0,
          heading: 0.0,
          speed: 0.0,
          speedAccuracy: 0.0,
          altitudeAccuracy: 0.0,
          headingAccuracy: 0.0,
        ));

    // Cache the progress
    final progress = getCurrentProgress(currentPosition);
    cacheJourneyProgress(journeyId, progress);
  }

  /// Stop journey with final cache update
  Future<void> stopJourneyCached(String journeyId) async {
    // Get final progress
    final finalPosition = latlong.LatLng(0, 0); // Would need actual position
    final finalProgress = getCurrentProgress(finalPosition);

    // Cache final progress
    await cacheJourneyProgress(journeyId, finalProgress);

    // Stop journey
    await stopJourney();
  }

  /// Get cached route polyline for offline map display
  Future<List<latlong.LatLng>?> getCachedRoutePolyline(String journeyId) async {
    try {
      final cachedWaypoints = await getCachedJourneyRoute(journeyId);
      if (cachedWaypoints == null) return null;

      return cachedWaypoints.map((waypoint) => waypoint.position).toList();
    } catch (e) {
      print('Error getting cached route polyline: $e');
      return null;
    }
  }

  /// Export journey data for reporting
  Future<Map<String, dynamic>?> exportJourneyData(String journeyId) async {
    try {
      final route = await getCachedJourneyRoute(journeyId);
      final progress = await getCachedJourneyProgress(journeyId);

      if (route == null) return null;

      return {
        'journey_id': journeyId,
        'waypoints': route
            .map((w) => {
                  'visit_id': w.visit.id,
                  'site_name': w.visit.siteName,
                  'position': {
                    'lat': w.position.latitude,
                    'lng': w.position.longitude,
                  },
                  'order': w.order,
                  'completed': w.isCompleted,
                })
            .toList(),
        'progress': progress != null
            ? {
                'distance_traveled': progress.distanceTraveled,
                'time_elapsed': progress.timeElapsed.inSeconds,
                'progress_percentage': progress.progressPercentage,
                'completed_waypoints':
                    progress.waypoints.where((w) => w.isCompleted).length,
                'total_waypoints': progress.waypoints.length,
              }
            : null,
        'exported_at': DateTime.now().toIso8601String(),
      };
    } catch (e) {
      print('Error exporting journey data: $e');
      return null;
    }
  }

  /// Clear cached journey data
  Future<void> clearJourneyCache(String journeyId) async {
    try {
      final journeysBox = await _getJourneysBox();
      final progressBox = await _getJourneyProgressBox();

      await journeysBox.delete('journey_$journeyId');
      await progressBox.delete('progress_$journeyId');

      print('Cleared cache for journey: $journeyId');
    } catch (e) {
      print('Error clearing journey cache: $e');
    }
  }

  /// Clear all journey cache data
  Future<void> clearAllJourneyCache() async {
    try {
      final journeysBox = await _getJourneysBox();
      final progressBox = await _getJourneyProgressBox();

      await journeysBox.clear();
      await progressBox.clear();

      print('Cleared all journey cache');
    } catch (e) {
      print('Error clearing all journey cache: $e');
    }
  }

  /// Get journey cache statistics
  Future<Map<String, dynamic>> getJourneyCacheStats() async {
    try {
      final journeysBox = await _getJourneysBox();
      final progressBox = await _getJourneyProgressBox();

      return {
        'cached_journeys': journeysBox.length,
        'cached_progress_entries': progressBox.length,
        'total_cache_entries': journeysBox.length + progressBox.length,
      };
    } catch (e) {
      print('Error getting journey cache stats: $e');
      return {};
    }
  }

  /// List all cached journey IDs
  Future<List<String>> getCachedJourneyIds() async {
    try {
      final box = await _getJourneysBox();
      return box.keys
          .where((key) => key.toString().startsWith('journey_'))
          .map((key) => key.toString().substring(8)) // Remove 'journey_' prefix
          .toList();
    } catch (e) {
      print('Error getting cached journey IDs: $e');
      return [];
    }
  }
}
