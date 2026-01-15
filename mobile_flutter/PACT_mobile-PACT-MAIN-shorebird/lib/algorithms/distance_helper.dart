import 'dart:math';

/// A utility class for calculating distances between geographical coordinates
class DistanceHelper {
  /// Earth's radius in meters
  static const double earthRadius = 6371000.0;

  /// Calculates the distance between two points on Earth using the Haversine formula
  /// 
  /// [lat1] Latitude of the first point in degrees
  /// [lon1] Longitude of the first point in degrees
  /// [lat2] Latitude of the second point in degrees
  /// [lon2] Longitude of the second point in degrees
  /// 
  /// Returns the distance in meters
  static double haversine(double lat1, double lon1, double lat2, double lon2) {
    // Convert degrees to radians
    final phi1 = lat1 * pi / 180;
    final phi2 = lat2 * pi / 180;
    final deltaPhi = (lat2 - lat1) * pi / 180;
    final deltaLambda = (lon2 - lon1) * pi / 180;

    // Haversine formula
    final a = sin(deltaPhi / 2) * sin(deltaPhi / 2) +
        cos(phi1) * cos(phi2) * sin(deltaLambda / 2) * sin(deltaLambda / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));

    // Calculate distance
    return earthRadius * c;
  }

  /// Determines if a point is within a given radius of another point
  /// 
  /// [centerLat] Latitude of the center point in degrees
  /// [centerLon] Longitude of the center point in degrees
  /// [pointLat] Latitude of the point to check in degrees
  /// [pointLon] Longitude of the point to check in degrees
  /// [radiusMeters] The radius to check within, in meters
  /// 
  /// Returns true if the point is within the radius
  static bool isWithinRadius(
    double centerLat,
    double centerLon,
    double pointLat,
    double pointLon,
    double radiusMeters,
  ) {
    final distance = haversine(centerLat, centerLon, pointLat, pointLon);
    return distance <= radiusMeters;
  }
}
