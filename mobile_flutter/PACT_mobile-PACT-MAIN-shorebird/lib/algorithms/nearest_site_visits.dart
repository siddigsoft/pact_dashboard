import '../models/site_visit.dart';
import 'distance_helper.dart';

/// Simple immutable location value.
class Location {
  final double latitude;
  final double longitude;

  const Location({required this.latitude, required this.longitude});
}

/// Wrapper that pairs a site visit with its computed distance from the user.
class SiteVisitWithDistance {
  final SiteVisit visit;
  final double distanceMeters;

  const SiteVisitWithDistance(
      {required this.visit, required this.distanceMeters});

  /// Distance in kilometers (legacy compatibility).
  double get distance => distanceMeters / 1000;

  /// Human-readable distance label.
  String get distanceText => distanceMeters >= 1000
      ? '${distance.toStringAsFixed(1)} km'
      : '${distanceMeters.toStringAsFixed(0)} m';

  Map<String, dynamic> toJson() => {
        'visit': visit.toJson(),
        'distanceMeters': distanceMeters,
        'distance': distance, // kept for backward compatibility
        'distanceText': distanceText,
      };
}

class NearestSiteVisits {
  /// Returns up to [k] nearest site visits to [userLocation].
  ///
  /// - Filters out visits without valid coordinates.
  /// - Filters out visits whose status is not `available`.
  /// - Applies [maxRadiusMeters] if provided.
  static List<SiteVisitWithDistance> findNearest({
    required Location userLocation,
    required List<SiteVisit> availableVisits,
    int k = 10,
    double? maxRadiusMeters,
  }) {
    final filtered = availableVisits.where((visit) {
      final lat = visit.latitude;
      final lng = visit.longitude;
      return visit.status.toLowerCase() == 'available' &&
          lat != null &&
          lng != null;
    });

    final withDistances = filtered.map((visit) {
      final distance = DistanceHelper.haversine(
        userLocation.latitude,
        userLocation.longitude,
        visit.latitude!,
        visit.longitude!,
      );
      return SiteVisitWithDistance(visit: visit, distanceMeters: distance);
    }).where((entry) {
      if (maxRadiusMeters == null) return true;
      return entry.distanceMeters <= maxRadiusMeters;
    }).toList();

    withDistances.sort((a, b) => a.distanceMeters.compareTo(b.distanceMeters));
    if (withDistances.length <= k) return withDistances;
    return withDistances.sublist(0, k);
  }
}
