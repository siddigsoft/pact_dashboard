// Web stub for map tile cache service
// This file is used when compiling for web platform
import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

/// Service for managing offline map tile caching (Web stub - no functionality)
class MapTileCacheService {
  static const String _storeName = 'mapTileCache';

  /// Initialize the tile caching system (no-op on web)
  static Future<void> initialize() async {
    debugPrint('Map tile cache not available on web');
  }

  /// Get the tile provider for use in flutter_map (returns null on web)
  static dynamic getTileProvider(String urlTemplate) {
    return null; // Web always uses default network provider
  }

  /// Download tiles for a specific region (no-op on web)
  static Future<void> downloadRegion({
    required LatLng center,
    required double radiusKm,
    required int minZoom,
    required int maxZoom,
    Function(double progress)? onProgress,
  }) async {
    debugPrint('Tile download not available on web');
  }

  /// Download tiles for multiple site visit locations (no-op on web)
  static Future<void> downloadSiteVisitRegions({
    required List<LatLng> locations,
    double radiusKm = 5,
    int minZoom = 10,
    int maxZoom = 18,
    Function(double progress)? onProgress,
  }) async {
    debugPrint('Tile download not available on web');
  }

  /// Get cache statistics (returns zeros on web)
  static Future<Map<String, dynamic>> getCacheStats() async {
    return {
      'tileCount': 0,
      'sizeInBytes': 0,
      'sizeInMB': '0.00',
    };
  }

  /// Clear all cached tiles (no-op on web)
  static Future<void> clearCache() async {
    debugPrint('Cache clearing not available on web');
  }

  /// Delete old tiles (no-op on web)
  static Future<void> deleteOldTiles({int olderThanDays = 30}) async {
    debugPrint('Old tiles cleanup not available on web');
  }

  /// Check if specific area has cached tiles (always false on web)
  static Future<bool> hasOfflineTiles(LatLng center, double radiusKm) async {
    return false;
  }
}
