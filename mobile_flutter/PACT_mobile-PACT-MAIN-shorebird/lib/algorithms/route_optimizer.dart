import 'distance_helper.dart';
import '../models/site_visit.dart';
import 'nearest_site_visits.dart';

/// Optimizes routes for multiple site visits using a nearest neighbor approach
class RouteOptimizer {
  /// Generates an optimized route for a list of site visits
  /// Uses a simple nearest neighbor algorithm
  /// 
  /// [visits] List of site visits to optimize
  /// [startLocation] Starting location for the route
  /// [endLocation] Optional end location constraint
  /// 
  /// Returns ordered list of site visits representing the optimized route
  static List<SiteVisit> optimizeRoute({
    required List<SiteVisit> visits,
    required Location startLocation,
    Location? endLocation,
  }) {
    if (visits.isEmpty) return [];
    if (visits.length == 1) return visits;

    final optimizedRoute = <SiteVisit>[];
    final unvisited = List<SiteVisit>.from(visits);
    var currentLocation = startLocation;

    // Build route by repeatedly finding nearest unvisited site
    while (unvisited.isNotEmpty) {
      // Special case: if one site left and endLocation specified,
      // check if another site would be better positioned as last stop
      if (unvisited.length == 1 && endLocation != null) {
        final lastSite = unvisited.first;
        final distanceToEnd = DistanceHelper.haversine(
          lastSite.latitude!,
          lastSite.longitude!,
          endLocation.latitude,
          endLocation.longitude,
        );

        // Check if any site in optimizedRoute would be better as last stop
        var bestLastStop = lastSite;
        var bestScore = double.infinity;

        for (final visit in optimizedRoute) {
          final score = DistanceHelper.haversine(
            currentLocation.latitude,
            currentLocation.longitude,
            visit.latitude!,
            visit.longitude!,
          ) + DistanceHelper.haversine(
            visit.latitude!,
            visit.longitude!,
            endLocation.latitude,
            endLocation.longitude,
          );

          if (score < bestScore) {
            bestScore = score;
            bestLastStop = visit;
          }
        }

        // If a better last stop was found, swap it
        if (bestLastStop != lastSite) {
          final index = optimizedRoute.indexOf(bestLastStop);
          optimizedRoute[index] = lastSite;
          unvisited.clear();
          optimizedRoute.add(bestLastStop);
          break;
        }
      }

      // Find nearest unvisited site to current location
      var nearestSite = unvisited.reduce((curr, next) {
        final currDistance = DistanceHelper.haversine(
          currentLocation.latitude,
          currentLocation.longitude,
          curr.latitude!,
          curr.longitude!,
        );
        final nextDistance = DistanceHelper.haversine(
          currentLocation.latitude,
          currentLocation.longitude,
          next.latitude!,
          next.longitude!,
        );
        return currDistance < nextDistance ? curr : next;
      });

      optimizedRoute.add(nearestSite);
      unvisited.remove(nearestSite);
      currentLocation = Location(
        latitude: nearestSite.latitude!,
        longitude: nearestSite.longitude!,
      );
    }

    return optimizedRoute;
  }

  /// Estimates the total route distance in meters
  static double calculateRouteDistance(List<SiteVisit> route) {
    if (route.isEmpty) return 0;
    if (route.length == 1) return 0;

    var totalDistance = 0.0;
    for (var i = 0; i < route.length - 1; i++) {
      totalDistance += DistanceHelper.haversine(
        route[i].latitude!,
        route[i].longitude!,
        route[i + 1].latitude!,
        route[i + 1].longitude!,
      );
    }

    return totalDistance;
  }

  /// Splits a route into sub-routes based on maximum time or distance constraints
  static List<List<SiteVisit>> splitRoute({
    required List<SiteVisit> route,
    double? maxDistanceMeters,
    Duration? maxDuration,
    double averageSpeedMps = 13.4, // ~30mph in meters per second
  }) {
    final subRoutes = <List<SiteVisit>>[];
    var currentSubRoute = <SiteVisit>[];
    var currentDistance = 0.0;
    var currentDuration = Duration.zero;

    for (final visit in route) {
      if (currentSubRoute.isEmpty) {
        currentSubRoute.add(visit);
        continue;
      }

      final lastVisit = currentSubRoute.last;
      final distanceToNext = DistanceHelper.haversine(
        lastVisit.latitude!,
        lastVisit.longitude!,
        visit.latitude!,
        visit.longitude!,
      );

      final timeToNext = Duration(
        seconds: (distanceToNext / averageSpeedMps).round(),
      );

      // Check if adding this visit would exceed constraints
      if ((maxDistanceMeters != null &&
              currentDistance + distanceToNext > maxDistanceMeters) ||
          (maxDuration != null &&
              currentDuration + timeToNext > maxDuration)) {
        // Start new sub-route
        subRoutes.add(currentSubRoute);
        currentSubRoute = [visit];
        currentDistance = 0;
        currentDuration = Duration.zero;
      } else {
        // Add to current sub-route
        currentSubRoute.add(visit);
        currentDistance += distanceToNext;
        currentDuration += timeToNext;
      }
    }

    // Add final sub-route if not empty
    if (currentSubRoute.isNotEmpty) {
      subRoutes.add(currentSubRoute);
    }

    return subRoutes;
  }
}