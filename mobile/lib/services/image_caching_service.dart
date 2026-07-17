import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Service for optimized image caching on mobile
class ImageCachingService {
  static final ImageCachingService _instance = ImageCachingService._internal();
  factory ImageCachingService() => _instance;
  ImageCachingService._internal();

  // Cache size: 100MB
  static const int maxCacheSize = 100 * 1024 * 1024;

  // Image sizes for different screen dimensions
  static const int avatarSize = 96; // For profile avatars
  static const int thumbnailSize = 200; // For message thumbnails
  static const int mediumImageSize = 400; // For medium displays
  static const int fullImageSize = 800; // For full-screen display

  /// Build cached network image with automatic sizing
  static Widget buildCachedImage({
    required String imageUrl,
    String? cacheKey,
    BoxFit fit = BoxFit.cover,
    Alignment alignment = Alignment.center,
    int? width,
    int? height,
    ImageSize size = ImageSize.medium,
    VoidCallback? onImageLoaded,
    VoidCallback? onImageError,
    bool isCircle = false,
    BorderRadius? borderRadius,
    double? elevation,
    Color? placeholderColor,
  }) {
    int cacheWidth = width ?? _getSizeValue(size);
    int cacheHeight = height ?? _getSizeValue(size);

    final imageWidget = CachedNetworkImage(
      imageUrl: imageUrl,
      cacheKey: cacheKey,
      fit: fit,
      alignment: alignment,
      width: width?.toDouble(),
      height: height?.toDouble(),
      memCacheWidth: cacheWidth,
      memCacheHeight: cacheHeight,
      maxHeightDiskCache: cacheHeight,
      maxWidthDiskCache: cacheWidth,
      placeholder: (context, url) =>
          _buildPlaceholder(size: size, color: placeholderColor),
      errorWidget: (context, url, error) {
        onImageError?.call();
        return _buildErrorWidget(size);
      },
      imageBuilder: (context, imageProvider) {
        onImageLoaded?.call();
        if (isCircle) {
          return CircleAvatar(
            backgroundImage: imageProvider,
            radius: (cacheWidth / 2).toDouble(),
          );
        }
        return Image(image: imageProvider, fit: fit);
      },
    );

    // Wrap with decoration if needed
    if (isCircle) {
      return imageWidget;
    }

    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius, child: imageWidget);
    }

    if (elevation != null && elevation > 0) {
      return Card(elevation: elevation, child: imageWidget);
    }

    return imageWidget;
  }

  /// Build cached user avatar
  static Widget buildCachedAvatar({
    required String imageUrl,
    required String fallbackInitials,
    double size = 48,
    bool online = false,
  }) {
    return Stack(
      children: [
        CachedNetworkImage(
          imageUrl: imageUrl,
          memCacheWidth: avatarSize,
          memCacheHeight: avatarSize,
          imageBuilder: (context, imageProvider) {
            return CircleAvatar(
              radius: size / 2,
              backgroundImage: imageProvider,
            );
          },
          placeholder: (context, url) {
            return CircleAvatar(
              radius: size / 2,
              backgroundColor: Colors.grey[300],
              child: Text(
                fallbackInitials,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            );
          },
          errorWidget: (context, url, error) {
            return CircleAvatar(
              radius: size / 2,
              backgroundColor: Colors.grey[400],
              child: Text(
                fallbackInitials,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            );
          },
        ),
        // Online indicator
        if (online)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: size / 4,
              height: size / 4,
              decoration: BoxDecoration(
                color: Colors.green,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
      ],
    );
  }

  /// Build cached message image with preview
  static Widget buildCachedMessageImage({
    required String imageUrl,
    int? width,
    int? height,
    VoidCallback? onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: CachedNetworkImage(
          imageUrl: imageUrl,
          memCacheWidth: thumbnailSize,
          memCacheHeight: thumbnailSize,
          fit: BoxFit.cover,
          width: width?.toDouble() ?? 200,
          height: height?.toDouble() ?? 200,
          placeholder: (context, url) {
            return Container(
              color: Colors.grey[300],
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            );
          },
          errorWidget: (context, url, error) {
            return Container(
              color: Colors.grey[300],
              child: Icon(Icons.broken_image, color: Colors.grey[600]),
            );
          },
        ),
      ),
    );
  }

  /// Get optimized size based on ImageSize enum
  static int _getSizeValue(ImageSize size) {
    switch (size) {
      case ImageSize.avatar:
        return avatarSize;
      case ImageSize.thumbnail:
        return thumbnailSize;
      case ImageSize.medium:
        return mediumImageSize;
      case ImageSize.full:
        return fullImageSize;
    }
  }

  /// Build placeholder widget
  static Widget _buildPlaceholder({required ImageSize size, Color? color}) {
    final double sizeValue = _getSizeValue(size).toDouble();
    return Container(
      width: sizeValue,
      height: sizeValue,
      color: color ?? Colors.grey[300],
      child: Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(Colors.grey[500]!),
          ),
        ),
      ),
    );
  }

  /// Build error widget
  static Widget _buildErrorWidget(ImageSize size) {
    final double sizeValue = _getSizeValue(size).toDouble();
    return Container(
      width: sizeValue,
      height: sizeValue,
      color: Colors.grey[300],
      child: Icon(Icons.broken_image, color: Colors.grey[600], size: 32),
    );
  }

  /// Precache images
  static Future<void> precacheImages(
    BuildContext context,
    List<String> imageUrls, {
    bool showProgress = true,
  }) async {
    try {
      int loaded = 0;
      for (String url in imageUrls) {
        try {
          await precacheImage(CachedNetworkImageProvider(url), context);
          loaded++;
          if (showProgress) {
            debugPrint('[ImageCaching] Cached $loaded/${imageUrls.length}');
          }
        } catch (e) {
          debugPrint('[ImageCaching] Failed to cache $url: $e');
        }
      }
      debugPrint('[ImageCaching] Precached $loaded images');
    } catch (e) {
      debugPrint('[ImageCaching] Precache error: $e');
    }
  }

  /// Clear image cache
  static Future<void> clearCache() async {
    try {
      await DefaultCacheManager().emptyCache();
      debugPrint('[ImageCaching] Cache cleared');
    } catch (e) {
      debugPrint('[ImageCaching] Clear cache error: $e');
    }
  }

  /// Get cache size
  static Future<int> getCacheSize() async {
    try {
      return await DefaultCacheManager().cacheSize();
    } catch (e) {
      debugPrint('[ImageCaching] Get cache size error: $e');
      return 0;
    }
  }

  /// Format cache size for display
  static String formatCacheSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(2)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
  }
}

/// Image size enum
enum ImageSize { avatar, thumbnail, medium, full }

/// Extension helper for custom cache management
extension CacheManagerExtension on DefaultCacheManager {
  /// Remove specific image from cache
  Future<void> removeImageFromCache(String url) async {
    await removeFile(url);
  }

  /// Get image from cache without network
  Future<FileInfo?> getImageFromCache(String url) async {
    try {
      return await getFileFromCache(url);
    } catch (e) {
      debugPrint('[Cache] Error getting image: $e');
      return null;
    }
  }
}
