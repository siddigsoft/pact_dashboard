import '../models/site_visit.dart';
import 'distance_helper.dart';

/// Algorithm for finding the nearest available site visits to a given location
class NearestSiteVisits {
  /// Returns the k nearest available site visits to the given location
  ///
  /// [userLocation] The current location of the user (latitude, longitude)
  /// [availableVisits] List of all available site visits
  /// [k] Number of nearest visits to return
  /// [maxRadiusMeters] Optional maximum radius to consider (null means no limit)
  ///
  /// Returns a list of [SiteVisit] objects sorted by distance, with distances included
  static List<SiteVisitWithDistance> findNearest({
    required Location userLocation,
    required List<SiteVisit> availableVisits,
    required int k,
    double? maxRadiusMeters,
  }) {
    // Filter out visits without valid coordinates
    final validVisits = availableVisits.where((visit) {
      return visit.latitude != null &&
          visit.longitude != null &&
          visit.status == 'available';
    }).toList();

    // Calculate distances for all valid visits
    final visitsWithDistances = validVisits.map((visit) {
      final distance = DistanceHelper.haversine(
        userLocation.latitude,
        userLocation.longitude,
        visit.latitude!,
        visit.longitude!,
      );
      return SiteVisitWithDistance(visit: visit, distanceMeters: distance);
    }).toList();

    // Filter by radius if specified
    if (maxRadiusMeters != null) {
      visitsWithDistances.removeWhere(
        (visit) => visit.distanceMeters > maxRadiusMeters,
      );
    }

    // Sort by distance
    visitsWithDistances.sort(
      (a, b) => a.distanceMeters.compareTo(b.distanceMeters),
    );

    // Return k nearest (or all if less than k available)
    return visitsWithDistances.take(k).toList();
  }
}

/// Data class to hold a site visit with its calculated distance
class SiteVisitWithDistance {
  final SiteVisit visit;
  final double distanceMeters;

  SiteVisitWithDistance({
    required this.visit,
    required this.distanceMeters,
  });

  /// Get distance in kilometers
  double get distance => distanceMeters / 1000;

  /// Get human-readable distance text
  String get distanceText {
    if (distanceMeters < 1000) {
      return '${distanceMeters.round()}m';
    } else {
      return '${(distanceMeters / 1000).toStringAsFixed(1)}km';
    }
  }
}

/// Simple location class for latitude/longitude pairs
class Location {
  final double latitude;
  final double longitude;

  const Location({
    required this.latitude,
    required this.longitude,
  });
}
