// lib/services/geographical_task_service.dart

import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/site_visit.dart';
import '../models/pact_user_profile.dart';
import '../algorithms/nearest_site_visits.dart';
import '../services/site_visit_service.dart';

class GeographicalTaskService {
  final SiteVisitService _service;

  GeographicalTaskService(this._service);

  /// Gets available tasks in the user's geographical area
  /// Uses current location and nearest_site_visits algorithm
  Future<List<SiteVisitWithDistance>> getNearbyAvailableTasks({
    int maxTasks = 10,
    double maxRadiusKm = 50.0, // 50km radius
    PACTUserProfile? userProfile,
  }) async {
    try {
      // Get current user location
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      final userLocation = Location(
        latitude: position.latitude,
        longitude: position.longitude,
      );

      // Get all available site visits from service (respect user profile filtering)
      final allAvailableVisits = await _service.getAvailableSiteVisits(userProfile);

      // Filter visits with valid coordinates
      final validVisits = allAvailableVisits.where((visit) {
        return visit.latitude != null && visit.longitude != null;
      }).toList();

      // Use nearest_site_visits algorithm to find closest tasks
      final nearbyTasks = NearestSiteVisits.findNearest(
        userLocation: userLocation,
        availableVisits: validVisits,
        k: maxTasks,
        maxRadiusMeters: maxRadiusKm * 1000, // Convert km to meters
      );

      return nearbyTasks;
    } catch (e) {
      // If location access fails, return empty list
      // Could implement fallback logic here
      return [];
    }
  }

  /// Gets tasks assigned to current user that are in progress
  Future<List<SiteVisit>> getAssignedTasks(String userId) async {
    return await _service.getAcceptedSiteVisits(userId);
  }

  /// Gets tasks assigned to user that need acceptance/decline
  Future<List<SiteVisit>> getPendingAcceptanceTasks(String userId) async {
    return await _service.getAssignedPendingSiteVisits(userId);
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
  }

  /// Get nearby tasks box
  Future<Box> _getNearbyTasksBox() async {
    return await Hive.openBox('nearby_tasks_cache');
  }

  /// Get user location box
  Future<Box> _getUserLocationBox() async {
    return await Hive.openBox('user_location_cache');
  }

  /// Cache user location for offline calculations
  Future<void> cacheUserLocation(double latitude, double longitude) async {
    try {
      final box = await _getUserLocationBox();
      await box.put('last_location', {
        'latitude': latitude,
        'longitude': longitude,
        'timestamp': DateTime.now().toIso8601String(),
        'accuracy': 'high',
      });
    } catch (e) {
      print('Error caching user location: $e');
    }
  }

  /// Get cached user location
  Future<Map<String, dynamic>?> getCachedUserLocation() async {
    try {
      final box = await _getUserLocationBox();
      return box.get('last_location');
    } catch (e) {
      print('Error getting cached user location: $e');
      return null;
    }
  }

  /// Cache nearby tasks results
  Future<void> cacheNearbyTasks(
    List<SiteVisitWithDistance> tasks,
    double userLat,
    double userLng,
    int maxTasks,
    double maxRadiusKm,
  ) async {
    try {
      final box = await _getNearbyTasksBox();
      final cacheKey =
          'nearby_${userLat.round()}_${userLng.round()}_${maxTasks}_${maxRadiusKm.round()}';

      final tasksData = tasks
          .map((task) => {
                'visit': task.visit.toJson(),
                'distance':
                    task.distance, // Store in km for backward compatibility
                'distanceText': task.distanceText,
                'distanceMeters': task.distanceMeters, // Store actual meters
              })
          .toList();

      await box.put(cacheKey, {
        'tasks': tasksData,
        'user_location': {'lat': userLat, 'lng': userLng},
        'parameters': {
          'maxTasks': maxTasks,
          'maxRadiusKm': maxRadiusKm,
        },
        'cached_at': DateTime.now().toIso8601String(),
        'expires_at':
            DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
      });
    } catch (e) {
      print('Error caching nearby tasks: $e');
    }
  }

  /// Get cached nearby tasks
  Future<List<SiteVisitWithDistance>?> getCachedNearbyTasks(
    double userLat,
    double userLng,
    int maxTasks,
    double maxRadiusKm,
  ) async {
    try {
      final box = await _getNearbyTasksBox();
      final cacheKey =
          'nearby_${userLat.round()}_${userLng.round()}_${maxTasks}_${maxRadiusKm.round()}';

      final cached = box.get(cacheKey);
      if (cached == null) return null;

      // Check if cache is expired
      final expiresAt = DateTime.parse(cached['expires_at']);
      if (DateTime.now().isAfter(expiresAt)) {
        await box.delete(cacheKey);
        return null;
      }

      final tasksData = cached['tasks'] as List<dynamic>;
      return tasksData.map((taskData) {
        final visit = SiteVisit.fromJson(taskData['visit']);
        return SiteVisitWithDistance(
          visit: visit,
          distanceMeters: (taskData['distance'] as num).toDouble() *
              1000, // Convert km back to meters
        );
      }).toList();
    } catch (e) {
      print('Error getting cached nearby tasks: $e');
      return null;
    }
  }

  /// Get nearby available tasks with local caching
  Future<List<SiteVisitWithDistance>> getNearbyAvailableTasksCached({
    int maxTasks = 10,
    double maxRadiusKm = 50.0,
    PACTUserProfile? userProfile,
  }) async {
    try {
      // Try to get current location
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      final userLat = position.latitude;
      final userLng = position.longitude;

      // Cache user location
      await cacheUserLocation(userLat, userLng);

      // Check for cached results first
      final cachedTasks =
          await getCachedNearbyTasks(userLat, userLng, maxTasks, maxRadiusKm);
      if (cachedTasks != null && cachedTasks.isNotEmpty) {
        print('Using cached nearby tasks: ${cachedTasks.length} tasks');
        return cachedTasks;
      }

      // Get fresh data
      final freshTasks = await getNearbyAvailableTasks(
        maxTasks: maxTasks,
        maxRadiusKm: maxRadiusKm,
        userProfile: userProfile,
      );

      // Cache the results
      await cacheNearbyTasks(
          freshTasks, userLat, userLng, maxTasks, maxRadiusKm);

      return freshTasks;
    } catch (e) {
      // If location fails, try to use cached location
      print('Location access failed, trying cached location: $e');

      final cachedLocation = await getCachedUserLocation();
      if (cachedLocation != null) {
        final userLat = cachedLocation['latitude'];
        final userLng = cachedLocation['longitude'];

        final cachedTasks =
            await getCachedNearbyTasks(userLat, userLng, maxTasks, maxRadiusKm);
        if (cachedTasks != null) {
          print(
              'Using cached tasks with cached location: ${cachedTasks.length} tasks');
          return cachedTasks;
        }
      }

      // Last resort: return empty list
      return [];
    }
  }

  /// Get offline-capable nearby tasks (works without GPS)
  Future<List<SiteVisitWithDistance>> getNearbyTasksOffline({
    int maxTasks = 10,
    double maxRadiusKm = 50.0,
  }) async {
    try {
      // Try cached location first
      final cachedLocation = await getCachedUserLocation();
      if (cachedLocation != null) {
        final userLat = cachedLocation['latitude'];
        final userLng = cachedLocation['longitude'];

        // Try cached tasks
        final cachedTasks =
            await getCachedNearbyTasks(userLat, userLng, maxTasks, maxRadiusKm);
        if (cachedTasks != null && cachedTasks.isNotEmpty) {
          return cachedTasks;
        }

        // If no cached tasks, try to calculate with cached visits
        final cachedVisits = await _service.getCachedVisits('available_visits');
        if (cachedVisits != null && cachedVisits.isNotEmpty) {
          final userLocation = Location(latitude: userLat, longitude: userLng);

          final nearbyTasks = NearestSiteVisits.findNearest(
            userLocation: userLocation,
            availableVisits: cachedVisits,
            k: maxTasks,
            maxRadiusMeters: maxRadiusKm * 1000,
          );

          // Cache the calculated results
          await cacheNearbyTasks(
              nearbyTasks, userLat, userLng, maxTasks, maxRadiusKm);

          return nearbyTasks;
        }
      }

      return [];
    } catch (e) {
      print('Error getting offline nearby tasks: $e');
      return [];
    }
  }

  /// Cache assigned tasks for offline access
  Future<void> cacheAssignedTasks(List<SiteVisit> tasks, String userId) async {
    try {
      final box = await _getNearbyTasksBox();
      final tasksData = tasks.map((task) => task.toJson()).toList();

      await box.put('assigned_$userId', {
        'tasks': tasksData,
        'cached_at': DateTime.now().toIso8601String(),
        'expires_at':
            DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
      });
    } catch (e) {
      print('Error caching assigned tasks: $e');
    }
  }

  /// Get cached assigned tasks
  Future<List<SiteVisit>?> getCachedAssignedTasks(String userId) async {
    try {
      final box = await _getNearbyTasksBox();
      final cached = box.get('assigned_$userId');
      if (cached == null) return null;

      // Check if cache is expired
      final expiresAt = DateTime.parse(cached['expires_at']);
      if (DateTime.now().isAfter(expiresAt)) {
        await box.delete('assigned_$userId');
        return null;
      }

      final tasksData = cached['tasks'] as List<dynamic>;
      return tasksData.map((taskData) => SiteVisit.fromJson(taskData)).toList();
    } catch (e) {
      print('Error getting cached assigned tasks: $e');
      return null;
    }
  }

  /// Get assigned tasks with caching
  Future<List<SiteVisit>> getAssignedTasksCached(String userId) async {
    try {
      // Try remote first
      final remoteTasks = await getAssignedTasks(userId);

      // Cache the results
      await cacheAssignedTasks(remoteTasks, userId);

      return remoteTasks;
    } catch (e) {
      // Fall back to cache
      print('Remote assigned tasks failed, using cache: $e');
      final cachedTasks = await getCachedAssignedTasks(userId);
      return cachedTasks ?? [];
    }
  }

  /// Clear all cached geographical data
  Future<void> clearGeographicalCache() async {
    try {
      final tasksBox = await _getNearbyTasksBox();
      final locationBox = await _getUserLocationBox();

      await tasksBox.clear();
      await locationBox.clear();

      print('Cleared geographical cache');
    } catch (e) {
      print('Error clearing geographical cache: $e');
    }
  }

  /// Get cache statistics
  Future<Map<String, dynamic>> getCacheStats() async {
    try {
      final tasksBox = await _getNearbyTasksBox();
      final locationBox = await _getUserLocationBox();

      return {
        'cached_task_queries': tasksBox.keys
            .where((key) => key.toString().startsWith('nearby_'))
            .length,
        'cached_assigned_tasks': tasksBox.keys
            .where((key) => key.toString().startsWith('assigned_'))
            .length,
        'cached_locations': locationBox.length,
        'total_cache_entries': tasksBox.length + locationBox.length,
      };
    } catch (e) {
      print('Error getting cache stats: $e');
      return {};
    }
  }
}
