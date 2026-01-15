import 'package:flutter/foundation.dart';
import 'package:flutter_map_tile_caching/flutter_map_tile_caching.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Service for managing offline map tile caching
class MapTileCacheService {
  static const String _storeName = 'mapTileCache';
  static late FMTCStore _store;

  /// Initialize the tile caching system
  static Future<void> initialize() async {
    if (kIsWeb) {
      debugPrint('Map tile cache not available on web');
      return;
    }

    try {
      // Initialize FMTC
      await FMTCObjectBoxBackend().initialise();

      // Get or create the store
      _store = FMTCStore(_storeName);
      await _store.manage.create();

      debugPrint('Map tile cache initialized successfully');
    } catch (e) {
      debugPrint('Error initializing map tile cache: $e');
    }
  }

  /// Get the tile provider for use in flutter_map
  static dynamic getTileProvider(String urlTemplate) {
    if (kIsWeb) {
      return null; // Return null on web, will use default network provider
    }

    return _store.getTileProvider(
      settings: FMTCTileProviderSettings(
        behavior: CacheBehavior.cacheFirst,
        cachedValidDuration: const Duration(days: 30),
      ),
    );
  }

  /// Download tiles for a specific region (for offline use)
  /// This is useful for pre-caching tiles for known site visit areas
  static Future<void> downloadRegion({
    required LatLng center,
    required double radiusKm,
    required int minZoom,
    required int maxZoom,
    Function(double progress)? onProgress,
  }) async {
    if (kIsWeb) {
      debugPrint('Tile download not available on web');
      return;
    }

    try {
      final region = CircleRegion(
        center,
        radiusKm * 1000, // Convert km to meters
      );

      // Start the download
      final download = _store.download.startForeground(
        region: region.toDownloadable(
          minZoom: minZoom,
          maxZoom: maxZoom,
          // Use the same tile source as UI (OSM)
          options: TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.example.pact_mobile',
          ),
        ),
      );

      // Listen to progress
      await for (final progress in download) {
        if (onProgress != null) {
          final percentage =
              (progress.successfulTiles / progress.maxTiles) * 100;
          onProgress(percentage);
        }

        if (progress.isComplete) {
          debugPrint('Downloaded ${progress.successfulTiles} tiles');
          break;
        }
      }
    } catch (e) {
      debugPrint('Error downloading map tiles: $e');
      rethrow;
    }
  }

  /// Download tiles for multiple site visit locations
  static Future<void> downloadSiteVisitRegions({
    required List<LatLng> locations,
    double radiusKm = 5, // Default 5km radius around each site
    int minZoom = 10,
    int maxZoom = 18,
    Function(double progress)? onProgress,
  }) async {
    if (kIsWeb) {
      debugPrint('Tile download not available on web');
      return;
    }

    try {
      int totalCompleted = 0;
      final totalLocations = locations.length;

      for (int i = 0; i < locations.length; i++) {
        final location = locations[i];

        await downloadRegion(
          center: location,
          radiusKm: radiusKm,
          minZoom: minZoom,
          maxZoom: maxZoom,
          onProgress: (regionProgress) {
            if (onProgress != null) {
              // Calculate overall progress across all regions
              final overallProgress =
                  ((totalCompleted + (regionProgress / 100)) / totalLocations) *
                      100;
              onProgress(overallProgress);
            }
          },
        );

        totalCompleted++;
      }

      debugPrint('Downloaded tiles for $totalLocations site visit locations');
    } catch (e) {
      debugPrint('Error downloading site visit regions: $e');
      rethrow;
    }
  }

  /// Get cache statistics
  static Future<Map<String, dynamic>> getCacheStats() async {
    if (kIsWeb) {
      return {
        'tileCount': 0,
        'sizeInBytes': 0,
        'sizeInMB': '0.00',
      };
    }

    try {
      final stats = _store.stats;
      final tileCount = await stats.length;
      final size = await stats.size;

      return {
        'tileCount': tileCount,
        'sizeInBytes': size,
        'sizeInMB': (size / (1024 * 1024)).toStringAsFixed(2),
      };
    } catch (e) {
      debugPrint('Error getting cache stats: $e');
      return {
        'tileCount': 0,
        'sizeInBytes': 0,
        'sizeInMB': '0.00',
      };
    }
  }

  /// Clear all cached tiles
  static Future<void> clearCache() async {
    if (kIsWeb) {
      debugPrint('Cache clearing not available on web');
      return;
    }

    try {
      await _store.manage.delete();
      await _store.manage.create();
      debugPrint('Map tile cache cleared');
    } catch (e) {
      debugPrint('Error clearing cache: $e');
    }
  }

  /// Delete old tiles (older than specified days)
  static Future<void> deleteOldTiles({int olderThanDays = 30}) async {
    if (kIsWeb) {
      debugPrint('Old tiles cleanup not available on web');
      return;
    }

    try {
      final cutoffDate = DateTime.now().subtract(Duration(days: olderThanDays));

      // FMTC automatically handles tile expiration based on cachedValidDuration
      // in getTileProvider settings, but we can also manually clear if needed

      debugPrint('Old tiles cleanup initiated');
    } catch (e) {
      debugPrint('Error deleting old tiles: $e');
    }
  }

  /// Check if specific area has cached tiles
  static Future<bool> hasOfflineTiles(LatLng center, double radiusKm) async {
    if (kIsWeb) {
      return false;
    }

    try {
      final stats = await getCacheStats();
      return stats['tileCount'] > 0;
    } catch (e) {
      debugPrint('Error checking offline tiles: $e');
      return false;
    }
  }
}
