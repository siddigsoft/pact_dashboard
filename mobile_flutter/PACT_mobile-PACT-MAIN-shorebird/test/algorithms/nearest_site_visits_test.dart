import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/algorithms/nearest_site_visits.dart';
import 'package:pact_mobile/models/site_visit.dart';

void main() {
  group('NearestSiteVisits', () {
    final testLocation = Location(latitude: 0, longitude: 0);
    
    late List<SiteVisit> testVisits;

    setUp(() {
      // Create test data
      testVisits = [
        SiteVisit(
          id: '1',
          latitude: 0.001, // ~111m north
          longitude: 0,
          status: 'available',
        ),
        SiteVisit(
          id: '2',
          latitude: 0.002, // ~222m north
          longitude: 0,
          status: 'available',
        ),
        SiteVisit(
          id: '3',
          latitude: 0.003, // ~333m north
          longitude: 0,
          status: 'assigned', // This one should be filtered out
        ),
        SiteVisit(
          id: '4',
          latitude: null, // Invalid coordinates
          longitude: null,
          status: 'available',
        ),
      ];
    });

    test('findNearest should return k nearest available visits', () {
      final result = NearestSiteVisits.findNearest(
        userLocation: testLocation,
        availableVisits: testVisits,
        k: 2,
      );

      // Should return 2 visits
      expect(result.length, 2);

      // First visit should be closest
      expect(result[0].visit.id, '1');

      // Second visit should be next closest
      expect(result[1].visit.id, '2');

      // Distances should be in ascending order
      expect(
        result[0].distanceMeters < result[1].distanceMeters,
        true,
      );
    });

    test('findNearest should respect maxRadiusMeters', () {
      final result = NearestSiteVisits.findNearest(
        userLocation: testLocation,
        availableVisits: testVisits,
        k: 10,
        maxRadiusMeters: 150, // Only include visits within 150m
      );

      // Should only return 1 visit (the closest one)
      expect(result.length, 1);
      expect(result[0].visit.id, '1');
    });

    test('findNearest should filter out invalid and non-available visits', () {
      final result = NearestSiteVisits.findNearest(
        userLocation: testLocation,
        availableVisits: testVisits,
        k: 10,
      );

      // Should only return 2 visits (excluding assigned and invalid)
      expect(result.length, 2);

      // Verify no assigned visits are included
      expect(
        result.every((v) => v.visit.status == 'available'),
        true,
      );

      // Verify no null coordinates are included
      expect(
        result.every((v) => v.visit.latitude != null && v.visit.longitude != null),
        true,
      );
    });
  });
}