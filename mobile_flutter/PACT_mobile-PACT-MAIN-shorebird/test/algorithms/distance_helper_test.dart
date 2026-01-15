import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/algorithms/distance_helper.dart';
import 'dart:math';

void main() {
  group('DistanceHelper', () {
    test('haversine should calculate known distances correctly', () {
      // Test case 1: Same point should return 0 meters
      expect(
        DistanceHelper.haversine(0, 0, 0, 0),
        0.0,
      );

      // Test case 2: Known distance between two points
      // London (51.5074, -0.1278) to Paris (48.8566, 2.3522)
      // ~343 km
      final londonToParis = DistanceHelper.haversine(
        51.5074,
        -0.1278,
        48.8566,
        2.3522,
      );
      expect(
        londonToParis,
        closeTo(343000, 1000), // Within 1km of expected
      );

      // Test case 3: Points on opposite sides of Earth
      // Should be approximately half the Earth's circumference
      final antipodes = DistanceHelper.haversine(0, 0, 0, 180);
      expect(
        antipodes,
        closeTo(2 * pi * DistanceHelper.earthRadius / 2, 1000),
      );
    });

    test('isWithinRadius should correctly determine point inclusion', () {
      // Test point within radius
      expect(
        DistanceHelper.isWithinRadius(0, 0, 0, 0.001, 1000),
        true,
      );

      // Test point outside radius
      expect(
        DistanceHelper.isWithinRadius(0, 0, 1, 1, 1000),
        false,
      );

      // Test point exactly on radius
      final lat2 = 0.008983; // Approximately 1000m north
      expect(
        DistanceHelper.isWithinRadius(0, 0, lat2, 0, 1000),
        true,
      );
    });
  });
}