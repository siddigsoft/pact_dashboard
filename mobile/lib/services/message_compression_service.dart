import 'dart:convert';
import 'package:flutter/foundation.dart';

/// Service for compressing and optimizing message data
class MessageCompressionService {
  /// Compression levels
  static const int compressionLevelFast = 1;
  static const int compressionLevelDefault = 6;
  static const int compressionLevelBest = 9;

  /// Check if message should be compressed
  static bool shouldCompress(String content, {int minLength = 500}) {
    return content.length > minLength;
  }

  /// Compress message content
  static Future<Map<String, dynamic>> compressMessage(
    String content, {
    int compressionLevel = compressionLevelDefault,
  }) async {
    try {
      // For text, convert to UTF-8 bytes first
      final bytes = utf8.encode(content);
      final originalSize = bytes.length;

      // Use simple compression: base64 encoding with length marker
      // In production, consider using gzip or other compression
      final compressed = base64Encode(bytes);

      final compressionRatio = (compressed.length / originalSize * 100)
          .toStringAsFixed(2);

      return {
        'success': true,
        'original_size': originalSize,
        'compressed_size': compressed.length,
        'compression_ratio': double.parse(compressionRatio),
        'data': compressed,
        'is_compressed': compressed.length < originalSize,
      };
    } catch (e) {
      debugPrint('[MessageCompression] Error compressing: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// Decompress message content
  static Future<String?> decompressMessage(String compressedContent) async {
    try {
      final bytes = base64Decode(compressedContent);
      return utf8.decode(bytes);
    } catch (e) {
      debugPrint('[MessageCompression] Error decompressing: $e');
      return null;
    }
  }

  /// Optimize message metadata to reduce size
  static Map<String, dynamic> optimizeMetadata(Map<String, dynamic> metadata) {
    final optimized = <String, dynamic>{};

    // Keep only essential metadata
    const essentialKeys = [
      'reactions',
      'edited_at',
      'forwarded_from',
      'reply_to',
    ];

    for (final key in essentialKeys) {
      if (metadata.containsKey(key) && metadata[key] != null) {
        optimized[key] = metadata[key];
      }
    }

    return optimized;
  }

  /// Batch compress multiple messages
  static Future<List<Map<String, dynamic>>> batchCompress(
    List<String> messages, {
    int compressionLevel = compressionLevelDefault,
  }) async {
    final results = <Map<String, dynamic>>[];

    for (final message in messages) {
      if (shouldCompress(message)) {
        final compressed = await compressMessage(
          message,
          compressionLevel: compressionLevel,
        );
        results.add(compressed);
      } else {
        results.add({'success': true, 'is_compressed': false, 'data': message});
      }
    }

    return results;
  }

  /// Calculate total size savings from compression
  static Map<String, dynamic> calculateCompressionStats(
    List<Map<String, dynamic>> compressionResults,
  ) {
    int totalOriginal = 0;
    int totalCompressed = 0;
    int messagesCompressed = 0;

    for (final result in compressionResults) {
      if (result['success'] == true && result['is_compressed'] == true) {
        totalOriginal += (result['original_size'] as int? ?? 0);
        totalCompressed += (result['compressed_size'] as int? ?? 0);
        messagesCompressed++;
      }
    }

    final ratio = totalOriginal > 0
        ? ((totalOriginal - totalCompressed) / totalOriginal * 100)
        : 0.0;

    return {
      'total_original_size': totalOriginal,
      'total_compressed_size': totalCompressed,
      'space_saved': totalOriginal - totalCompressed,
      'compression_percentage': ratio.toStringAsFixed(2),
      'messages_compressed': messagesCompressed,
      'total_messages': compressionResults.length,
    };
  }

  /// Truncate long messages for preview
  static String createPreview(String content, {int maxLength = 100}) {
    if (content.length <= maxLength) return content;
    return '${content.substring(0, maxLength)}...';
  }

  /// Remove unnecessary whitespace to reduce size
  static String trimWhitespace(String content) {
    return content
        .replaceAll(RegExp(r'\n\s*\n'), '\n')
        .replaceAll(RegExp(r'[ \t]+'), ' ')
        .trim();
  }

  /// Detect and handle emojis efficiently
  static Map<String, dynamic> analyzeContent(String content) {
    final emojiRegex = RegExp(
      r'[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]',
      unicode: true,
    );

    final emojiMatches = emojiRegex.allMatches(content).toList();
    final hasLinks = RegExp(r'https?://').hasMatch(content);
    final hasMentions = RegExp(r'@\w+').hasMatch(content);

    return {
      'length': content.length,
      'emoji_count': emojiMatches.length,
      'has_links': hasLinks,
      'has_mentions': hasMentions,
      'word_count': content.split(RegExp(r'\s+')).length,
      'should_compress': content.length > 500,
    };
  }
}

/// Cache for compression results
class CompressionCache {
  static final CompressionCache _instance = CompressionCache._internal();
  final Map<String, String> _cache = {};
  static const int maxCacheSize = 1000;

  factory CompressionCache() {
    return _instance;
  }

  CompressionCache._internal();

  /// Get cached compression result
  String? get(String contentHash) {
    return _cache[contentHash];
  }

  /// Store compression result
  Future<void> put(String contentHash, String compressedData) async {
    if (_cache.length >= maxCacheSize) {
      // Remove oldest entry
      _cache.remove(_cache.keys.first);
    }
    _cache[contentHash] = compressedData;
  }

  /// Clear cache
  Future<void> clear() async {
    _cache.clear();
  }

  /// Get cache statistics
  Map<String, dynamic> getStats() {
    return {
      'cache_size': _cache.length,
      'max_size': maxCacheSize,
      'fill_percentage': (_cache.length / maxCacheSize * 100).toStringAsFixed(
        2,
      ),
    };
  }
}
