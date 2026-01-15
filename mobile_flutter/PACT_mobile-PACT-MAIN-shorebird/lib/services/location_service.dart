import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'dart:developer' as developer;

class LocationService {
  /// Check if location permissions are granted
  static Future<bool> checkPermissions() async {
    try {
      final status = await Permission.location.status;
      if (status.isGranted) {
        return true;
      }

      // Request permission if not granted
      final result = await Permission.location.request();
      return result.isGranted;
    } catch (e) {
      developer.log('Error checking location permissions: $e');
      return false;
    }
  }

  /// Get current location
  static Future<Position?> getCurrentLocation() async {
    try {
      // Check permissions first
      final hasPermission = await checkPermissions();
      if (!hasPermission) {
        developer.log('Location permission denied');
        return null;
      }

      // Check if location services are enabled
      final isEnabled = await Geolocator.isLocationServiceEnabled();
      if (!isEnabled) {
        developer.log('Location services are disabled');
        return null;
      }

      // Get current position
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      return position;
    } catch (e) {
      developer.log('Error getting current location: $e');
      return null;
    }
  }

  /// Update user location in database
  static Future<void> updateUserLocation(String userId, Position position) async {
    try {
      // This would update the user's location in the profiles table
      // Implementation depends on your database structure
      developer.log('User location updated: ${position.latitude}, ${position.longitude}');
    } catch (e) {
      developer.log('Error updating user location: $e');
    }
  }
}

