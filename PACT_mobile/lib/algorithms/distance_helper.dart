import 'dart:math' as math;

/// Lightweight helpers for distance calculations.
class DistanceHelper {
  /// Earth radius in meters.
  static const double earthRadius = 6371000;

  /// Returns the great-circle distance between two WGS84 coordinates in meters.
  static double haversine(double lat1, double lon1, double lat2, double lon2) {
    final dLat = _degToRad(lat2 - lat1);
    final dLon = _degToRad(lon2 - lon1);

    final a =
        math.pow(math.sin(dLat / 2), 2) +
        math.cos(_degToRad(lat1)) *
            math.cos(_degToRad(lat2)) *
            math.pow(math.sin(dLon / 2), 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadius * c;
  }

  /// Returns true if the second coordinate is within [radiusMeters] of the first.
  static bool isWithinRadius(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
    double radiusMeters,
  ) {
    return haversine(lat1, lon1, lat2, lon2) <= radiusMeters;
  }

  static double _degToRad(double deg) => deg * (math.pi / 180.0);
}
