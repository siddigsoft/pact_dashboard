// lib/algorithms/site_visit_assignment.dart

import 'dart:async';
import 'package:geolocator/geolocator.dart';
import '../models/site_visit.dart';
import '../algorithms/distance_helper.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SiteVisitAssignmentService {
  final SupabaseClient _supabase;
  final StreamController<List<SiteVisit>> _nearbyVisitsController = 
      StreamController<List<SiteVisit>>.broadcast();

  Stream<List<SiteVisit>> get nearbyVisits => _nearbyVisitsController.stream;

  SiteVisitAssignmentService(this._supabase);

  /// Updates available site visits based on current location
  Future<void> updateNearbyVisits({
    required Position currentLocation,
    double radiusKm = 10.0,
    int maxVisits = 5,
  }) async {
    try {
      // Get all available site visits
      final response = await _supabase
          .from('mmp_site_entries')
          .select()
          .eq('status', 'Dispatched');

      final visits = (response as List)
          .map((json) => SiteVisit.fromJson(json as Map<String, dynamic>))
          .where((visit) => visit.latitude != null && visit.longitude != null)
          .toList();

      // Calculate distances and sort
      final visitsWithDistance = visits.map((visit) {
        final distance = DistanceHelper.haversine(
          currentLocation.latitude,
          currentLocation.longitude,
          visit.latitude!,
          visit.longitude!,
        );
        return _VisitWithDistance(visit: visit, distance: distance);
      }).toList();

      // Sort by distance
      visitsWithDistance.sort((a, b) => a.distance.compareTo(b.distance));

      // Filter by radius and take top N
      final nearbyVisits = visitsWithDistance
          .where((v) => v.distance <= radiusKm * 1000) // Convert km to meters
          .take(maxVisits)
          .map((v) => v.visit)
          .toList();

      _nearbyVisitsController.add(nearbyVisits);
    } catch (e) {
      debugPrint('Error updating nearby visits: $e');
      _nearbyVisitsController.addError(e);
    }
  }

  /// Attempt to assign a site visit to a user
  Future<bool> assignSiteVisit({
    required String siteVisitId,
    required String userId,
  }) async {
    try {
      final response = await _supabase.rpc(
        'assign_site_visit',
        params: {
          'p_site_id': siteVisitId,
          'p_user_id': userId,
        },
      ).execute();

      if (response.error != null) {
        throw response.error!;
      }

      final result = response.data as Map<String, dynamic>;
      return result['success'] as bool;
    } catch (e) {
      debugPrint('Error assigning site visit: $e');
      return false;
    }
  }

  /// Get all MMPs associated with a site visit
  Future<List<MMPFile>> getSiteVisitMMPs(String siteVisitId) async {
    try {
      final response = await _supabase
          .from('mmp_files')
          .select()
          .eq('site_visit_id', siteVisitId)
          .execute();

      if (response.error != null) {
        throw response.error!;
      }

      return (response.data as List)
          .map((json) => MMPFile.fromJson(json))
          .toList();
    } catch (e) {
      debugPrint('Error fetching MMPs: $e');
      return [];
    }
  }

  void dispose() {
    _nearbyVisitsController.close();
  }
}

class _VisitWithDistance {
  final SiteVisit visit;
  final double distance;

  _VisitWithDistance({
    required this.visit,
    required this.distance,
  });
}