import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:geolocator/geolocator.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'offline_data_service.dart';
import 'package:geocoding/geocoding.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'notification_trigger_service.dart';
import '../models/site_visit.dart';
import '../models/pact_user_profile.dart';
import '../utils/site_visit_constraints.dart';

class SiteVisitService {
  final SupabaseClient _supabase = Supabase.instance.client;

  SupabaseClient get supabase => _supabase;

  Future<List<Map<String, dynamic>>> getAssignedSiteVisits(
    String userId,
  ) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('user_id', userId)
        .order('created_at', ascending: false);

    return List<Map<String, dynamic>>.from(response);
  }

  Future<Map<String, dynamic>> getSiteVisitDetails(String visitId) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('id', visitId)
        .single();

    return response;
  }

  Future<void> updateSiteVisitStatus(String visitId, String status) async {
    try {
      print('🔄 Updating visit status: $visitId -> $status');
      // Check connectivity
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;
      if (!hasConnection) {
        // Queue offline
        await OfflineDataService().queueVisitStatusUpdate(
          visitId: visitId,
          newStatus: status,
          extra: {'queued_at': DateTime.now().toIso8601String()},
        );
        print('📦 Visit status queued for sync (offline).');
        await _updateCachedVisitStatus(visitId, status);
        return;
      }
      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': status,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', visitId);
      print('✅ Visit status updated in mmp_site_entries');
      await _updateCachedVisitStatus(visitId, status);
    } catch (e) {
      print('❌ Failed to update visit status: $e');
      rethrow;
    }
  }

  Future<void> updateSiteVisit(SiteVisit visit) async {
    try {
      print('🔄 Updating visit: ${visit.id}');
      final connectivity = await Connectivity().checkConnectivity();
      final hasConnection = connectivity != ConnectivityResult.none;
      if (!hasConnection) {
        await _queueVisitForSync(visit);
        await _updateLocalCacheWithVisit(visit);
        print('📦 Visit update queued for sync (offline).');
        return;
      }
      final visitData = visit.toJson();
      await _supabase
          .from('mmp_site_entries')
          .update(visitData)
          .eq('id', visit.id);
      print('✅ Visit updated in mmp_site_entries');
      await _updateLocalCacheWithVisit(visit);
    } catch (e) {
      print('❌ Failed to update visit: $e');
      await _queueVisitForSync(visit);
      await _updateLocalCacheWithVisit(visit);
      rethrow;
    }
  }

  Future<List<SiteVisit>> getAvailableSiteVisits([
    PACTUserProfile? userProfile,
  ]) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('status', 'Dispatched')
        .order('created_at', ascending: false);

    final allSites = response.map((json) => SiteVisit.fromJson(json)).toList();

    // Apply constraints if user profile is provided
    if (userProfile != null) {
      return SiteVisitConstraints.filterVisibleSites(allSites, userProfile);
    }

    return allSites;
  }

  /// Check if user can claim a specific site visit
  Future<ConstraintCheckResult> canClaimSite(
    SiteVisit visit,
    PACTUserProfile userProfile,
  ) async {
    return SiteVisitConstraints.canClaimSite(visit, userProfile);
  }

  /// Check if user can accept a specific site visit
  Future<ConstraintCheckResult> canAcceptSite(
    SiteVisit visit,
    PACTUserProfile userProfile,
  ) async {
    return SiteVisitConstraints.canAcceptSite(visit, userProfile);
  }

  /// Get filtered site visits based on user constraints
  Future<List<SiteVisit>> getFilteredSiteVisits(
    PACTUserProfile userProfile,
  ) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .order('created_at', ascending: false);

    final allSites = response.map((json) => SiteVisit.fromJson(json)).toList();
    return SiteVisitConstraints.filterVisibleSites(allSites, userProfile);
  }

  Future<List<SiteVisit>> getClaimedSiteVisits(String userId) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('claimed_by', userId)
        .inFilter('status', [
          'Assigned',
          'Claimed',
        ]) // Sites claimed but not yet accepted
        .order('created_at', ascending: false);

    return response.map((json) => SiteVisit.fromJson(json)).toList();
  }

  Future<List<SiteVisit>> getAcceptedSiteVisits(String userId) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('accepted_by', userId)
        .inFilter('status', [
          'Accepted',
          'Accept',
        ]) // Support both for compatibility
        .order('created_at', ascending: false);

    return response.map((json) => SiteVisit.fromJson(json)).toList();
  }

  Future<List<SiteVisit>> getOngoingSiteVisits(String userId) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('accepted_by', userId)
        .inFilter('status', ['Ongoing', 'In Progress'])
        .order('created_at', ascending: false);

    return response.map((json) => SiteVisit.fromJson(json)).toList();
  }

  Future<List<SiteVisit>> getCompletedSiteVisits(String userId) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        // Some environments store status values in lowercase.
        .inFilter('status', ['Completed', 'Complete', 'completed', 'complete'])
        // Completed visits should be visible to the user who accepted them OR completed them.
        .or('accepted_by.eq.$userId,visit_completed_by.eq.$userId')
        .order('updated_at', ascending: false);

    return response.map((json) => SiteVisit.fromJson(json)).toList();
  }

  // Real-time stream for assigned site visits
  Stream<List<Map<String, dynamic>>> watchAssignedSiteVisits(String userId) {
    return _supabase
        .from('mmp_site_entries')
        .stream(primaryKey: ['id'])
        .eq('user_id', userId)
        .order('created_at', ascending: false)
        .map((data) => List<Map<String, dynamic>>.from(data));
  }

  // Real-time stream for available site visits
  Stream<List<SiteVisit>> watchAvailableSiteVisits() {
    return _supabase
        .from('mmp_site_entries')
        .stream(primaryKey: ['id'])
        .eq('status', 'Dispatched')
        .order('created_at', ascending: false)
        .map((data) => data.map((json) => SiteVisit.fromJson(json)).toList());
  }

  // Real-time stream for accepted site visits
  Stream<List<SiteVisit>> watchAcceptedSiteVisits(String userId) {
    return _supabase
        .from('mmp_site_entries')
        .stream(primaryKey: ['id'])
        .eq('accepted_by', userId)
        .order('created_at', ascending: false)
        .map(
          (data) => data
              .where((item) => ['Accepted', 'Accept'].contains(item['status']))
              .map((json) => SiteVisit.fromJson(json))
              .toList(),
        );
  }

  // Real-time stream for ongoing site visits
  Stream<List<SiteVisit>> watchOngoingSiteVisits(String userId) {
    return _supabase
        .from('mmp_site_entries')
        .stream(primaryKey: ['id'])
        .eq('accepted_by', userId)
        .order('created_at', ascending: false)
        .map(
          (data) => data
              .where(
                (item) => ['Ongoing', 'In Progress'].contains(item['status']),
              )
              .map((json) => SiteVisit.fromJson(json))
              .toList(),
        );
  }

  // Real-time stream for completed site visits
  Stream<List<SiteVisit>> watchCompletedSiteVisits(String userId) {
    return _supabase
        .from('mmp_site_entries')
        .stream(primaryKey: ['id'])
        // Supabase stream filters don't support `.or(...)`.
        // Reports screen relies on getCompletedSiteVisits() (non-stream) for the full query.
        .eq('accepted_by', userId)
        .order('updated_at', ascending: false)
        .map(
          (data) => data
              .where(
                (item) => [
                  'Completed',
                  'Complete',
                  'completed',
                  'complete',
                ].contains(item['status']),
              )
              .map((json) => SiteVisit.fromJson(json))
              .toList(),
        );
  }

  Future<void> acceptVisit(String visitId, String userId) async {
    print('Attempting to accept visit: $visitId by user: $userId');

    // Check connectivity first
    final connectivity = await Connectivity().checkConnectivity();
    final hasConnection = !connectivity.contains(ConnectivityResult.none);

    if (!hasConnection) {
      // OFFLINE: Queue for sync and update local cache
      print('📦 Offline mode - queuing accept visit for sync...');
      Map<String, dynamic>? locationData;

      // Try to get location even offline
      try {
        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.low,
          timeLimit: const Duration(seconds: 3),
        );
        locationData = {
          'lat': position.latitude,
          'lng': position.longitude,
          'accuracy': position.accuracy,
          'timestamp': DateTime.now().toIso8601String(),
        };
      } catch (e) {
        print('⚠️ Could not get location offline: $e');
      }

      await OfflineDataService().queueAcceptVisit(
        visitId: visitId,
        userId: userId,
        locationData: locationData,
      );

      print('✅ Accept visit queued for sync when online');
      return;
    }

    try {
      // First check whether the visit exists in mmp_site_entries
      final existing = await _supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data')
          .eq('id', visitId)
          .maybeSingle();

      if (existing == null) {
        // The record doesn't exist in mmp_site_entries
        throw Exception('Visit $visitId not found in mmp_site_entries');
      }

      // Attempt an update on the canonical table
      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Accepted',
            'accepted_by': userId,
            'accepted_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', visitId)
          .select();

      print('Update response: $response');

      if (response.isEmpty) {
        // Empty result means update did not succeed (possible RLS / permission issues)
        final msg =
            'Unable to update visit in mmp_site_entries. This is commonly caused by database row-level-security (RLS) or insufficient permissions for the current user.';
        print(msg);
        throw Exception(msg);
      }
      print('Successfully accepted visit: $visitId in mmp_site_entries');

      // Capture and store acceptance location in additional_data
      try {
        print('📍 Capturing location for visit acceptance...');

        // Try high accuracy first, then low accuracy. On web we do NOT call getLastKnownPosition.
        Position? position;
        try {
          position = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high,
            timeLimit: const Duration(seconds: 5),
          );
        } catch (e) {
          print('⚠️ High accuracy location failed: $e');
          try {
            print('⏱️ Trying low accuracy...');
            position = await Geolocator.getCurrentPosition(
              desiredAccuracy: LocationAccuracy.low,
              timeLimit: const Duration(seconds: 3),
            );
          } catch (e2) {
            print('⚠️ Low accuracy location failed: $e2');
            position = null;
          }
        }

        if (position != null) {
          print(
            '✓ Location captured: ${position.latitude}, ${position.longitude} (accuracy: ${position.accuracy}m)',
          );

          // Merge into existing additional_data (do not overwrite)
          final existingData =
              (existing['additional_data'] as Map<String, dynamic>?) ?? {};
          final merged = {
            ...existingData,
            'acceptance_location': {
              'lat': position.latitude,
              'lng': position.longitude,
              'accuracy': position.accuracy,
              'timestamp': DateTime.now().toIso8601String(),
            },
          };

          await _supabase
              .from('mmp_site_entries')
              .update({
                'additional_data': merged,
                'updated_at': DateTime.now().toIso8601String(),
              })
              .eq('id', visitId);

          print('✅ Acceptance location saved to additional_data');
        } else {
          print('⚠️ No position available (current or last known)');
        }
      } catch (locError) {
        // Log location error but don't fail the accept operation
        print(
          '⚠️ Warning: Could not capture location during acceptance: $locError',
        );
        print('Visit acceptance succeeded, but location capture failed.');
      }
    } catch (e) {
      print('Error accepting visit: $e');
      rethrow;
    }
  }

  Future<void> rejectVisit(String visitId, String userId, String reason) async {
    await _supabase.from('visit_rejections').insert({
      'visit_id': visitId,
      'user_id': userId,
      'reason': reason,
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Future<void> startVisit(String visitId) async {
    print('Starting visit: $visitId');
    final userId = _supabase.auth.currentUser?.id;

    // Capture start location first (needed for both online and offline)
    Map<String, dynamic> startLocationData = {};
    try {
      print('📍 Capturing start location...');
      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 5),
        );
      } catch (e) {
        print('⚠️ High accuracy start location failed: $e');
        try {
          position = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.low,
            timeLimit: const Duration(seconds: 3),
          );
        } catch (e2) {
          print('⚠️ Low accuracy start location failed: $e2');
          position = null;
        }
      }

      if (position != null) {
        startLocationData = {
          'lat': position.latitude,
          'lng': position.longitude,
          'accuracy': position.accuracy,
          'timestamp': DateTime.now().toIso8601String(),
        };
        print(
          '✓ Start location captured: ${position.latitude}, ${position.longitude}',
        );
      }
    } catch (e) {
      print('⚠️ Could not capture start location: $e');
    }

    // Check connectivity
    final connectivity = await Connectivity().checkConnectivity();
    final hasConnection = !connectivity.contains(ConnectivityResult.none);

    if (!hasConnection) {
      // OFFLINE: Queue for sync and update local cache
      print('📦 Offline mode - queuing start visit for sync...');

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      await OfflineDataService().queueStartVisit(
        visitId: visitId,
        userId: userId,
        startLocation: startLocationData,
      );

      print('✅ Start visit queued for sync when online');
      return;
    }

    try {
      // Verify whether this visit exists in mmp_site_entries
      final existing = await _supabase
          .from('mmp_site_entries')
          .select('id, status, additional_data')
          .eq('id', visitId)
          .maybeSingle();

      if (existing == null) {
        throw Exception('Visit $visitId not found in mmp_site_entries');
      }

      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Ongoing',
            'visit_started_by': userId,
            'visit_started_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
            if (startLocationData.isNotEmpty)
              'additional_data': {
                ...((existing['additional_data'] as Map<String, dynamic>?) ??
                    {}),
                'start_location': startLocationData,
              },
          })
          .eq('id', visitId)
          .select();

      if (response.isEmpty) {
        final msg =
            'Unable to update visit to Ongoing in mmp_site_entries. This may be caused by row-level-security (RLS) or insufficient permissions.';
        print(msg);
        throw Exception(msg);
      }

      print('✅ Visit started successfully with location data');
    } catch (e) {
      print('Error starting visit: $e');
      rethrow;
    }
  }

  Future<void> completeVisit(String visitId) async {
    print('Completing visit: $visitId');
    try {
      // Ensure the row is in mmp_site_entries and get registry_site_id
      final existing = await _supabase
          .from('mmp_site_entries')
          .select('id, status, registry_site_id, additional_data')
          .eq('id', visitId)
          .maybeSingle();

      if (existing == null) {
        throw Exception('Visit $visitId not found in mmp_site_entries');
      }

      // Capture end location
      Map<String, dynamic> endLocationData = {};
      Position? completionPosition;
      try {
        print('📍 Capturing completion location...');
        try {
          completionPosition = await Geolocator.getCurrentPosition(
            desiredAccuracy: LocationAccuracy.high,
            timeLimit: const Duration(seconds: 5),
          );
        } catch (e) {
          print('⚠️ High accuracy completion location failed: $e');
          try {
            completionPosition = await Geolocator.getCurrentPosition(
              desiredAccuracy: LocationAccuracy.low,
              timeLimit: const Duration(seconds: 3),
            );
          } catch (e2) {
            print('⚠️ Low accuracy completion location failed: $e2');
            completionPosition = null;
          }
        }

        if (completionPosition != null) {
          // Merge with existing additional_data
          final existingData =
              existing['additional_data'] as Map<String, dynamic>? ?? {};
          endLocationData = {
            ...existingData,
            'end_location': {
              'latitude': completionPosition.latitude,
              'longitude': completionPosition.longitude,
              'accuracy': completionPosition.accuracy,
              'timestamp': DateTime.now().toIso8601String(),
            },
          };
          print(
            '✓ End location captured: ${completionPosition.latitude}, ${completionPosition.longitude} (accuracy: ${completionPosition.accuracy}m)',
          );
        } else {
          endLocationData =
              existing['additional_data'] as Map<String, dynamic>? ?? {};
        }
      } catch (e) {
        print('⚠️ Could not capture end location: $e');
        endLocationData =
            existing['additional_data'] as Map<String, dynamic>? ?? {};
      }

      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Completed',
            'visit_completed_by': _supabase.auth.currentUser?.id,
            'visit_completed_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
            'additional_data': endLocationData,
          })
          .eq('id', visitId)
          .select();

      if (response.isEmpty) {
        final msg =
            'Unable to update visit to Completed in mmp_site_entries. This may be caused by row-level-security (RLS) or insufficient permissions.';
        print(msg);
        throw Exception(msg);
      }

      print('✅ Visit completed successfully');

      // Update sites_registry with GPS coordinates for future visits
      if (completionPosition != null &&
          completionPosition.accuracy <=
              30 && // Only save high-quality GPS (< 30m)
          existing['registry_site_id'] != null) {
        try {
          print('📍 Updating sites_registry with GPS coordinates...');
          await _supabase
              .from('sites_registry')
              .update({
                'gps_latitude': completionPosition.latitude,
                'gps_longitude': completionPosition.longitude,
                'gps_accuracy': completionPosition.accuracy,
                'gps_captured_at': DateTime.now().toIso8601String(),
                'gps_captured_by': _supabase.auth.currentUser?.id,
                'last_verified_at': DateTime.now().toIso8601String(),
              })
              .eq('id', existing['registry_site_id']);
          print('✅ Sites registry updated with GPS data');
        } catch (e) {
          print('⚠️ Could not update sites_registry: $e');
          // Don't fail the completion if registry update fails
        }
      } else if (completionPosition != null &&
          completionPosition.accuracy > 30) {
        print(
          '⚠️ GPS accuracy (${completionPosition.accuracy}m) too low to update registry (requires <30m)',
        );
      }
    } catch (e) {
      print('Error completing visit: $e');
      rethrow;
    }
  }

  Future<List<SiteVisit>> getAssignedPendingSiteVisits(String userId) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('user_id', userId)
        .eq('status', 'Dispatched')
        .order('created_at', ascending: false);

    return response.map((json) => SiteVisit.fromJson(json)).toList();
  }

  Future<SiteVisit?> getSiteVisitById(String id) async {
    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('id', id)
        .single();

    return SiteVisit.fromJson(response);
  }

  Future<void> markTaskDeclined(String taskId, String userId) async {
    // This could be implemented as a separate table for declined tasks
    // For now, we'll just log it locally or update a declined status
    await _supabase
        .from('mmp_site_entries')
        .update({
          'status': 'Declined',
          'rejected_by': userId,
          'rejected_at': DateTime.now().toIso8601String(),
          'updated_at': DateTime.now().toIso8601String(),
        })
        .eq('id', taskId);
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
    // Register adapters if needed for complex objects
  }

  /// Get local visits box
  Future<Box> _getVisitsBox() async {
    return await Hive.openBox('visits_cache');
  }

  /// Cache visits data locally for offline access
  Future<void> cacheVisitsLocally(
    List<SiteVisit> visits,
    String cacheKey,
  ) async {
    try {
      final box = await _getVisitsBox();
      final visitsJson = visits.map((visit) => visit.toJson()).toList();
      await box.put(cacheKey, {
        'data': visitsJson,
        'cached_at': DateTime.now().toIso8601String(),
        'count': visits.length,
      });
    } catch (e) {
      print('Error caching visits locally: $e');
    }
  }

  /// Get cached visits data
  Future<List<SiteVisit>?> getCachedVisits(String cacheKey) async {
    try {
      final box = await _getVisitsBox();
      final cached = box.get(cacheKey);
      if (cached == null) return null;

      final visitsJson = cached['data'] as List<dynamic>;
      return visitsJson.map((json) => SiteVisit.fromJson(json)).toList();
    } catch (e) {
      print('Error getting cached visits: $e');
      return null;
    }
  }

  Future<List<SiteVisit>> getAssignedSiteVisitsFromCache(String userId) async {
    final cached = await getCachedVisits('assigned_$userId');
    return cached ?? [];
  }

  /// Get assigned site visits with local caching
  Future<List<Map<String, dynamic>>> getAssignedSiteVisitsCached(
    String userId,
  ) async {
    try {
      // Try to get from remote first
      final remoteData = await getAssignedSiteVisits(userId);

      // Cache the data locally
      final visits = remoteData
          .map((json) => SiteVisit.fromJson(json))
          .toList();
      await cacheVisitsLocally(visits, 'assigned_$userId');

      return remoteData;
    } catch (e) {
      // If remote fails, try to get from cache
      print('Remote fetch failed, trying cache: $e');
      final cachedVisits = await getCachedVisits('assigned_$userId');
      if (cachedVisits != null) {
        return cachedVisits.map((visit) => visit.toJson()).toList();
      }
      rethrow; // Re-throw if no cache available
    }
  }

  /// Get available site visits with local caching
  Future<List<SiteVisit>> getAvailableSiteVisitsCached([
    PACTUserProfile? userProfile,
  ]) async {
    try {
      // Try to get from remote first
      final remoteData = await getAvailableSiteVisits(userProfile);

      // Cache the data locally
      await cacheVisitsLocally(remoteData, 'available_visits');

      return remoteData;
    } catch (e) {
      // If remote fails, try to get from cache
      print('Remote fetch failed, trying cache: $e');
      final cachedVisits = await getCachedVisits('available_visits');
      if (cachedVisits != null) {
        return cachedVisits;
      }
      rethrow; // Re-throw if no cache available
    }
  }

  /// Update site visit with local caching and sync queue
  Future<void> updateSiteVisitCached(SiteVisit visit) async {
    try {
      // Update remote first
      await updateSiteVisit(visit);

      // Update local cache if it exists
      await _updateLocalCacheWithVisit(visit);
    } catch (e) {
      // If remote fails, queue for later sync
      print('Remote update failed, queuing for sync: $e');
      await _queueVisitForSync(visit);
      await _updateLocalCacheWithVisit(visit);
      rethrow;
    }
  }

  /// Queue visit update for later synchronization
  Future<void> _queueVisitForSync(SiteVisit visit) async {
    try {
      final box = await Hive.openBox('sync_queue');
      final queueItem = {
        'id': visit.id,
        'data': visit.toJson(),
        'operation': 'update',
        'timestamp': DateTime.now().toIso8601String(),
        'retry_count': 0,
      };
      await box.put('visit_${visit.id}', queueItem);
    } catch (e) {
      print('Error queuing visit for sync: $e');
    }
  }

  /// Update local cache with single visit
  Future<void> _updateLocalCacheWithVisit(SiteVisit visit) async {
    try {
      final box = await _getVisitsBox();

      // Update in assigned visits cache
      final assignedCache = box.get('assigned_${visit.assignedTo}');
      if (assignedCache != null) {
        final visitsJson = assignedCache['data'] as List<dynamic>;
        final updatedVisits = visitsJson.map((json) {
          if (json['id'] == visit.id) {
            return visit.toJson();
          }
          return json;
        }).toList();

        await box.put('assigned_${visit.assignedTo}', {
          'data': updatedVisits,
          'cached_at': DateTime.now().toIso8601String(),
          'count': updatedVisits.length,
        });
      }

      // Update in available visits cache if applicable
      final availableCache = box.get('available_visits');
      if (availableCache != null && visit.status == 'available') {
        final visitsJson = availableCache['data'] as List<dynamic>;
        final updatedVisits = visitsJson.map((json) {
          if (json['id'] == visit.id) {
            return visit.toJson();
          }
          return json;
        }).toList();

        await box.put('available_visits', {
          'data': updatedVisits,
          'cached_at': DateTime.now().toIso8601String(),
          'count': updatedVisits.length,
        });
      }
    } catch (e) {
      print('Error updating local cache: $e');
    }
  }

  Future<void> _updateCachedVisitStatus(String visitId, String status) async {
    try {
      final box = await _getVisitsBox();
      for (final key in box.keys) {
        final cached = box.get(key);
        if (cached == null || cached['data'] == null) continue;
        final List<dynamic> visitsJson = List<dynamic>.from(cached['data']);
        bool updated = false;
        final updatedVisits = visitsJson.map((json) {
          if (json['id'] == visitId) {
            updated = true;
            return {
              ...json,
              'status': status,
              'last_modified': DateTime.now().toIso8601String(),
            };
          }
          return json;
        }).toList();

        if (updated) {
          await box.put(key, {
            'data': updatedVisits,
            'cached_at': DateTime.now().toIso8601String(),
            'count': updatedVisits.length,
          });
        }
      }
    } catch (e) {
      print('Error updating cached visit status: $e');
    }
  }

  /// Sync queued visit updates when online
  Future<void> syncQueuedVisits() async {
    try {
      final box = await Hive.openBox('sync_queue');
      final keys = box.keys.where((key) => key.toString().startsWith('visit_'));

      for (final key in keys) {
        final queueItem = box.get(key);
        if (queueItem != null) {
          try {
            final visit = SiteVisit.fromJson(queueItem['data']);
            await updateSiteVisit(visit);
            await box.delete(key); // Remove from queue on success
          } catch (e) {
            // Increment retry count
            queueItem['retry_count'] = (queueItem['retry_count'] ?? 0) + 1;
            if (queueItem['retry_count'] > 3) {
              await box.delete(key); // Remove after max retries
            } else {
              await box.put(key, queueItem);
            }
            print('Failed to sync visit ${queueItem['id']}: $e');
          }
        }
      }
    } catch (e) {
      print('Error syncing queued visits: $e');
    }
  }

  /// Clear all local cache data
  Future<void> clearLocalCache() async {
    try {
      final visitsBox = await _getVisitsBox();
      await visitsBox.clear();

      final syncBox = await Hive.openBox('sync_queue');
      await syncBox.clear();
    } catch (e) {
      print('Error clearing local cache: $e');
    }
  }

  /// Get cache statistics
  Future<Map<String, dynamic>> getCacheStats() async {
    try {
      final visitsBox = await _getVisitsBox();
      final syncBox = await Hive.openBox('sync_queue');

      return {
        'cached_visits_count': visitsBox.length,
        'queued_sync_operations': syncBox.length,
        'cache_keys': visitsBox.keys.toList(),
      };
    } catch (e) {
      print('Error getting cache stats: $e');
      return {};
    }
  }

  // ===== ADDITIONAL METHODS FROM SITE VISITS SERVICE =====

  Future<List<Map<String, dynamic>>>
  getAssignedSiteVisitsForCurrentUser() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return [];

    final response = await _supabase
        .from('mmp_site_entries')
        .select()
        .eq('user_id', user.id)
        .order('created_at', ascending: true);

    return List<Map<String, dynamic>>.from(response);
  }

  Future<String?> getCurrentCity() async {
    if (kIsWeb) {
      // On web, we can't reliably get location without user interaction
      // Return null to show all visits
      return null;
    }
    try {
      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      List<Placemark> placemarks = await placemarkFromCoordinates(
        position.latitude,
        position.longitude,
      );
      return placemarks.first.locality; // e.g., "Kampala"
    } catch (e) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> getNearbySiteVisits() async {
    final allVisits = await getAssignedSiteVisitsForCurrentUser();
    final currentCity = await getCurrentCity();
    if (currentCity == null) return allVisits;

    // Filter by site_code matching current city
    return allVisits
        .where((visit) => visit['site_code'] == currentCity)
        .toList();
  }

  Future<void> confirmArrival(String visitId) async {
    if (kIsWeb) {
      // On web, GPS might not be available, store a placeholder
      final gpsData = {
        'latitude': 0.0,
        'longitude': 0.0,
        'timestamp': DateTime.now().toIso8601String(),
        'note': 'Location not available on web',
      };

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('arrival_$visitId', gpsData.toString());

      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Arrived',
            'additional_data': {
              'arrival_recorded': true,
              'arrival_timestamp': DateTime.now().toIso8601String(),
            },
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', visitId);
      return;
    }

    try {
      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      // Update visit with arrival data
      await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Arrived',
            'additional_data': {
              'arrival_recorded': true,
              'arrival_latitude': position.latitude,
              'arrival_longitude': position.longitude,
              'arrival_timestamp': DateTime.now().toIso8601String(),
            },
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', visitId);
      // Store locally for backup
      final prefs = await SharedPreferences.getInstance();
      final gpsData = {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'timestamp': DateTime.now().toIso8601String(),
      };
      await prefs.setString('arrival_$visitId', gpsData.toString());
    } catch (e) {
      throw Exception('Failed to confirm arrival: $e');
    }
  }

  // Placeholder for loading MMPs based on site_code
  Future<List<Map<String, dynamic>>> getMMPsForSite(String siteCode) async {
    // Assuming an 'mmps' table exists; filter by site_code
    final response = await _supabase
        .from('mmps') // Replace with actual table name
        .select()
        .eq('site_code', siteCode);
    return List<Map<String, dynamic>>.from(response);
  }

  // ============================================================================
  // NEW HUB OPERATIONS & TRACKING METHODS
  // ============================================================================

  /// Update tracking columns: verified_by, verified_at, verified status
  Future<void> verifySiteEntry(String siteEntryId, String userId) async {
    try {
      print('✓ Verifying site entry: $siteEntryId by $userId');

      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'status': 'Verified',
            'verified_by': userId,
            'verified_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteEntryId)
          .select();

      if (response.isEmpty) {
        throw Exception('Failed to verify site entry: No rows updated');
      }
      print('✅ Site entry verified successfully');
    } catch (e) {
      print('❌ Error verifying site entry: $e');
      rethrow;
    }
  }

  /// Update dispatched columns: dispatched_by, dispatched_at, status
  Future<void> dispatchSiteEntry(
    String siteEntryId,
    String userId, {
    String? toDataCollectorId,
    String? siteName,
    double? enumeratorFee,
    double? transportFee,
  }) async {
    try {
      print('📤 Dispatching site entry: $siteEntryId');

      final updateData = {
        'status': 'Dispatched',
        'dispatched_by': userId,
        'dispatched_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      // Pre-fill accepted_by if specified (optional)
      if (toDataCollectorId != null) {
        updateData['accepted_by'] = toDataCollectorId;
      }

      final response = await _supabase
          .from('mmp_site_entries')
          .update(updateData)
          .eq('id', siteEntryId)
          .select()
          .single();

      print('✅ Site entry dispatched successfully');

      // ✅ NEW: Send notification to assigned collector
      if (toDataCollectorId != null) {
        try {
          final notificationService = NotificationTriggerService();
          await notificationService.siteAssigned(
            toDataCollectorId,
            siteName ?? (response['site_name'] ?? 'Unknown Site'),
            siteEntryId,
            enumeratorFee:
                enumeratorFee ?? (response['enumerator_fee'] as double?),
            transportFee:
                transportFee ?? (response['transport_fee'] as double?),
            assignedBy: userId,
          );
          print('✅ Notification sent to collector: $toDataCollectorId');
        } catch (notifError) {
          print('⚠️ Warning: Failed to send notification: $notifError');
          // Don't fail the dispatch if notification fails
        }
      }
    } catch (e) {
      print('❌ Error dispatching site entry: $e');
      rethrow;
    }
  }

  /// Flag a site entry for review
  Future<void> flagSiteEntry(
    String siteEntryId,
    String flagReason, {
    String? flaggedBy,
  }) async {
    try {
      print('🚩 Flagging site entry: $siteEntryId - $flagReason');

      final additionalData = await _getSiteAdditionalData(siteEntryId);
      additionalData['isFlagged'] = true;
      additionalData['flagReason'] = flagReason;
      additionalData['flaggedBy'] = flaggedBy ?? 'system';
      additionalData['flaggedAt'] = DateTime.now().toIso8601String();

      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'additional_data': additionalData,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteEntryId)
          .select();

      if (response.isEmpty) {
        throw Exception('Failed to flag site entry: No rows updated');
      }
      print('✅ Site entry flagged successfully');
    } catch (e) {
      print('❌ Error flagging site entry: $e');
      rethrow;
    }
  }

  /// Acknowledge cost for a site entry
  Future<void> acknowledgeCost(String siteEntryId, String userId) async {
    try {
      print('💰 Acknowledging cost for site entry: $siteEntryId');

      final response = await _supabase
          .from('mmp_site_entries')
          .update({
            'cost_acknowledged': true,
            'cost_acknowledged_at': DateTime.now().toIso8601String(),
            'cost_acknowledged_by': userId,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', siteEntryId)
          .select();

      if (response.isEmpty) {
        throw Exception('Failed to acknowledge cost: No rows updated');
      }
      print('✅ Cost acknowledged successfully');
    } catch (e) {
      print('❌ Error acknowledging cost: $e');
      rethrow;
    }
  }

  /// Get all hubs
  Future<List<Map<String, dynamic>>> getAllHubs() async {
    try {
      final response = await _supabase.from('hubs').select().order('name');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      print('❌ Error fetching hubs: $e');
      return [];
    }
  }

  /// Get all sites from registry
  Future<List<Map<String, dynamic>>> getAllSitesRegistry() async {
    try {
      final response = await _supabase
          .from('sites_registry')
          .select()
          .order('site_name');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      print('❌ Error fetching sites registry: $e');
      return [];
    }
  }

  /// Get registry linkage from site entry
  Future<Map<String, dynamic>?> getRegistryLinkage(String siteEntryId) async {
    try {
      final response = await _supabase
          .from('mmp_site_entries')
          .select('registry_site_id, additional_data')
          .eq('id', siteEntryId)
          .single();

      final registryLinkage = response['additional_data']?['registry_linkage'];
      return registryLinkage != null
          ? Map<String, dynamic>.from(registryLinkage)
          : null;
    } catch (e) {
      print('⚠️ Error getting registry linkage: $e');
      return null;
    }
  }

  /// Helper: get additional_data for a site entry
  Future<Map<String, dynamic>> _getSiteAdditionalData(
    String siteEntryId,
  ) async {
    try {
      final response = await _supabase
          .from('mmp_site_entries')
          .select('additional_data')
          .eq('id', siteEntryId)
          .single();

      return response['additional_data'] != null
          ? Map<String, dynamic>.from(response['additional_data'])
          : {};
    } catch (e) {
      print('⚠️ Error getting additional_data: $e');
      return {};
    }
  }

  /// Get cost summary for a site entry
  Future<Map<String, dynamic>?> getSiteCostSummary(String siteEntryId) async {
    try {
      final response = await _supabase
          .from('mmp_site_entries')
          .select(
            'enumerator_fee, transport_fee, cost_acknowledged, cost_acknowledged_at, cost_acknowledged_by',
          )
          .eq('id', siteEntryId)
          .single();

      final enumeratorFee = response['enumerator_fee'] ?? 0.0;
      final transport = response['transport_fee'] ?? 0.0;

      return {
        'enumerator_fee': enumeratorFee,
        'transport_fee': transport,
        'total_cost': enumeratorFee + transport,
        'cost_acknowledged': response['cost_acknowledged'] ?? false,
        'cost_acknowledged_at': response['cost_acknowledged_at'],
        'cost_acknowledged_by': response['cost_acknowledged_by'],
      };
    } catch (e) {
      print('⚠️ Error getting cost summary: $e');
      return null;
    }
  }

  /// Filter sites by status
  Future<List<SiteVisit>> getSitesByStatus(String status) async {
    try {
      final response = await _supabase
          .from('mmp_site_entries')
          .select()
          .eq('status', status)
          .order('updated_at', ascending: false);

      return (response as List)
          .map((item) => SiteVisit.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('❌ Error filtering sites by status: $e');
      return [];
    }
  }

  /// Filter sites by hub
  Future<List<SiteVisit>> getSitesByHub(String hubId) async {
    try {
      final response = await _supabase
          .from('mmp_site_entries')
          .select()
          .eq('hub_office', hubId)
          .order('site_name');

      return (response as List)
          .map((item) => SiteVisit.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('❌ Error filtering sites by hub: $e');
      return [];
    }
  }

  /// Get pending withdrawal requests from completed visits
  Future<List<Map<String, dynamic>>> getPendingCostAcknowledgments() async {
    try {
      final response = await _supabase
          .from('mmp_site_entries')
          .select()
          .eq('cost_acknowledged', false)
          .neq('enumerator_fee', 'null')
          .order('updated_at', ascending: true);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      print('❌ Error getting pending cost acknowledgments: $e');
      return [];
    }
  }
}
