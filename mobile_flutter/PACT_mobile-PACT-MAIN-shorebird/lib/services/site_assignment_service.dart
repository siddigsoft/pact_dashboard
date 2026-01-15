import 'package:geolocator/geolocator.dart';
import '../models/site_visit.dart';
import 'dart:math' as math;

class SiteAssignmentService {
  // Haversine formula for accurate distance calculation
  double _calculateDistance(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const double earthRadius = 6371000; // Earth's radius in meters
    
    final double dLat = _toRadians(lat2 - lat1);
    final double dLon = _toRadians(lon2 - lon1);
    
    final double a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRadians(lat1)) *
            math.cos(_toRadians(lat2)) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
            
    final double c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadius * c;
  }

  double _toRadians(double degree) {
    return degree * math.pi / 180;
  }

  Future<List<SiteVisit>> rankSiteVisits(List<SiteVisit> siteVisits) async {
    try {
      final position = await Geolocator.getCurrentPosition();
      
      // Calculate distances and sort
      final rankedVisits = siteVisits.map((visit) {
        final distance = _calculateDistance(
          position.latitude,
          position.longitude,
          visit.latitude ?? 0.0,
          visit.longitude ?? 0.0,
        );
        
        return _RankedSiteVisit(visit: visit, distance: distance);
      }).toList();
      
      rankedVisits.sort((a, b) => a.distance.compareTo(b.distance));
      
      return rankedVisits.map((ranked) => ranked.visit).toList();
    } catch (e) {
      // If location is not available, return original order
      return siteVisits;
    }
  }
}

class _RankedSiteVisit {
  final SiteVisit visit;
  final double distance;
  
  _RankedSiteVisit({
    required this.visit,
    required this.distance,
  });
}