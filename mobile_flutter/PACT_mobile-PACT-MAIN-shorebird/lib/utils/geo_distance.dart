import 'dart:math';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';

class GeoCoordinates {
  final double latitude;
  final double longitude;

  GeoCoordinates({required this.latitude, required this.longitude});

  factory GeoCoordinates.fromJson(Map<String, dynamic> json) {
    final lat = json['latitude'] ?? json['lat'];
    final lng = json['longitude'] ?? json['lng'] ?? json['lon'];
    
    if (lat is num && lng is num) {
      return GeoCoordinates(
        latitude: lat.toDouble(),
        longitude: lng.toDouble(),
      );
    }
    throw FormatException('Invalid coordinates format');
  }

  Map<String, dynamic> toJson() => {
    'latitude': latitude,
    'longitude': longitude,
  };

  bool isValid() {
    return latitude >= -90 && latitude <= 90 && 
           longitude >= -180 && longitude <= 180;
  }
}

class ProximityConfig {
  final double radiusKm;
  final bool enabled;
  final bool requireLocationSharing;

  ProximityConfig({
    this.radiusKm = 80.0,
    this.enabled = true,
    this.requireLocationSharing = true,
  });

  factory ProximityConfig.fromJson(Map<String, dynamic> json) {
    return ProximityConfig(
      radiusKm: (json['radiusKm'] as num?)?.toDouble() ?? 80.0,
      enabled: json['enabled'] as bool? ?? true,
      requireLocationSharing: json['requireLocationSharing'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
    'radiusKm': radiusKm,
    'enabled': enabled,
    'requireLocationSharing': requireLocationSharing,
  };
}

class SiteProximityCheck {
  final bool isWithinState;
  final bool isWithinRadius;
  final bool hasGpsCoordinates;
  final double? distanceKm;
  final bool canAccess;
  final String? reason;

  SiteProximityCheck({
    required this.isWithinState,
    required this.isWithinRadius,
    required this.hasGpsCoordinates,
    this.distanceKm,
    required this.canAccess,
    this.reason,
  });
}

class GeoDistanceUtils {
  static const String _proximityConfigKey = 'PACT_PROXIMITY_CONFIG';
  static const ProximityConfig defaultConfig = ProximityConfig();

  static double calculateHaversineDistance(
    GeoCoordinates point1,
    GeoCoordinates point2,
  ) {
    const double R = 6371; // Earth's radius in km

    final lat1Rad = _toRadians(point1.latitude);
    final lat2Rad = _toRadians(point2.latitude);
    final deltaLatRad = _toRadians(point2.latitude - point1.latitude);
    final deltaLonRad = _toRadians(point2.longitude - point1.longitude);

    final a = sin(deltaLatRad / 2) * sin(deltaLatRad / 2) +
        cos(lat1Rad) * cos(lat2Rad) *
        sin(deltaLonRad / 2) * sin(deltaLonRad / 2);

    final c = 2 * atan2(sqrt(a), sqrt(1 - a));

    return R * c;
  }

  static double _toRadians(double degrees) {
    return degrees * (pi / 180);
  }

  static bool isWithinProximity(
    GeoCoordinates userLocation,
    GeoCoordinates siteLocation, {
    double radiusKm = 80.0,
  }) {
    final distance = calculateHaversineDistance(userLocation, siteLocation);
    return distance <= radiusKm;
  }

  static GeoCoordinates? parseGpsCoordinates(dynamic location) {
    if (location == null) return null;

    try {
      Map<String, dynamic> parsed;
      
      if (location is String) {
        parsed = jsonDecode(location) as Map<String, dynamic>;
      } else if (location is Map) {
        parsed = Map<String, dynamic>.from(location);
      } else {
        return null;
      }

      final coords = GeoCoordinates.fromJson(parsed);
      if (coords.isValid()) {
        return coords;
      }
    } catch (e) {
      return null;
    }

    return null;
  }

  static Future<ProximityConfig> getProximityConfig() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_proximityConfigKey);
      if (stored != null) {
        final json = jsonDecode(stored) as Map<String, dynamic>;
        return ProximityConfig.fromJson(json);
      }
    } catch (e) {
      print('Failed to load proximity config: $e');
    }
    return const ProximityConfig();
  }

  static Future<void> setProximityConfig(ProximityConfig config) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_proximityConfigKey, jsonEncode(config.toJson()));
    } catch (e) {
      print('Failed to save proximity config: $e');
    }
  }

  static SiteProximityCheck checkSiteProximity({
    required String? userStateName,
    required GeoCoordinates? userLocation,
    required String? siteStateName,
    required GeoCoordinates? siteLocation,
    ProximityConfig? config,
  }) {
    final cfg = config ?? const ProximityConfig();

    if (userStateName == null || userStateName.isEmpty) {
      return SiteProximityCheck(
        isWithinState: false,
        isWithinRadius: false,
        hasGpsCoordinates: siteLocation != null,
        canAccess: false,
        reason: 'Your profile has no state assigned. Contact your supervisor.',
      );
    }

    if (cfg.requireLocationSharing && userLocation == null) {
      return SiteProximityCheck(
        isWithinState: false,
        isWithinRadius: false,
        hasGpsCoordinates: siteLocation != null,
        canAccess: false,
        reason: 'Location sharing must be enabled to claim sites. Please enable GPS.',
      );
    }

    final normalizedUserState = userStateName.toLowerCase().trim();
    final normalizedSiteState = (siteStateName ?? '').toLowerCase().trim();

    final isWithinState = normalizedSiteState == normalizedUserState ||
        normalizedSiteState.contains(normalizedUserState) ||
        normalizedUserState.contains(normalizedSiteState);

    if (!isWithinState) {
      return SiteProximityCheck(
        isWithinState: false,
        isWithinRadius: false,
        hasGpsCoordinates: siteLocation != null,
        canAccess: false,
        reason: 'This site is in a different state.',
      );
    }

    if (siteLocation == null) {
      return SiteProximityCheck(
        isWithinState: true,
        isWithinRadius: true,
        hasGpsCoordinates: false,
        canAccess: true,
        reason: null,
      );
    }

    if (userLocation == null) {
      return SiteProximityCheck(
        isWithinState: true,
        isWithinRadius: true,
        hasGpsCoordinates: true,
        canAccess: true,
        reason: null,
      );
    }

    final distanceKm = calculateHaversineDistance(userLocation, siteLocation);
    final isWithinRadius = distanceKm <= cfg.radiusKm;

    if (isWithinRadius) {
      return SiteProximityCheck(
        isWithinState: true,
        isWithinRadius: true,
        hasGpsCoordinates: true,
        distanceKm: distanceKm,
        canAccess: true,
        reason: null,
      );
    } else {
      return SiteProximityCheck(
        isWithinState: true,
        isWithinRadius: false,
        hasGpsCoordinates: true,
        distanceKm: distanceKm,
        canAccess: false,
        reason: 'This site is ${distanceKm.round()} km away, beyond the ${cfg.radiusKm.round()} km limit.',
      );
    }
  }

  static String formatDistance(double? distanceKm) {
    if (distanceKm == null) return 'Unknown';
    if (distanceKm < 1) {
      return '${(distanceKm * 1000).round()} m';
    }
    return '${distanceKm.round()} km';
  }

  static Future<GeoCoordinates?> getCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return null;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          return null;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        return null;
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      return GeoCoordinates(
        latitude: position.latitude,
        longitude: position.longitude,
      );
    } catch (e) {
      print('Error getting current location: $e');
      return null;
    }
  }

  static Future<bool> isLocationServiceEnabled() async {
    return await Geolocator.isLocationServiceEnabled();
  }

  static Future<bool> hasLocationPermission() async {
    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always || 
           permission == LocationPermission.whileInUse;
  }
}

const ProximityConfig defaultProximityConfig = ProximityConfig();
