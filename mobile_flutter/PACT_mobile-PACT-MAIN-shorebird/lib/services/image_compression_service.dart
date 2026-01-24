// lib/services/image_compression_service.dart

import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';

enum CompressionQuality {
  low(quality: 50, maxWidth: 800, maxHeight: 800),
  medium(quality: 70, maxWidth: 1200, maxHeight: 1200),
  high(quality: 85, maxWidth: 1920, maxHeight: 1920),
  original(quality: 100, maxWidth: 4096, maxHeight: 4096);

  final int quality;
  final int maxWidth;
  final int maxHeight;

  const CompressionQuality({
    required this.quality,
    required this.maxWidth,
    required this.maxHeight,
  });
}

class CompressionResult {
  final String originalPath;
  final String compressedPath;
  final int originalSize;
  final int compressedSize;
  final double compressionRatio;

  CompressionResult({
    required this.originalPath,
    required this.compressedPath,
    required this.originalSize,
    required this.compressedSize,
  }) : compressionRatio = originalSize > 0 
      ? (1 - (compressedSize / originalSize)) * 100 
      : 0;

  String get originalSizeText => _formatBytes(originalSize);
  String get compressedSizeText => _formatBytes(compressedSize);
  String get savedText => _formatBytes(originalSize - compressedSize);

  static String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class ImageCompressionService {
  static final ImageCompressionService _instance = ImageCompressionService._internal();
  factory ImageCompressionService() => _instance;
  ImageCompressionService._internal();

  CompressionQuality _defaultQuality = CompressionQuality.medium;
  bool _autoCompress = true;
  int _autoCompressThreshold = 500 * 1024;

  CompressionQuality get defaultQuality => _defaultQuality;
  bool get autoCompress => _autoCompress;
  int get autoCompressThreshold => _autoCompressThreshold;

  void setDefaultQuality(CompressionQuality quality) {
    _defaultQuality = quality;
    debugPrint('[ImageCompressionService] Default quality set to: ${quality.name}');
  }

  void setAutoCompress(bool enabled) {
    _autoCompress = enabled;
  }

  void setAutoCompressThreshold(int bytes) {
    _autoCompressThreshold = bytes;
  }

  Future<CompressionResult?> compressImage(
    String imagePath, {
    CompressionQuality? quality,
    String? outputPath,
  }) async {
    try {
      final file = File(imagePath);
      if (!await file.exists()) {
        debugPrint('[ImageCompressionService] File not found: $imagePath');
        return null;
      }

      final originalSize = await file.length();
      final compressionQuality = quality ?? _defaultQuality;

      if (_autoCompress && originalSize < _autoCompressThreshold) {
        debugPrint('[ImageCompressionService] Skipping compression - file under threshold');
        return CompressionResult(
          originalPath: imagePath,
          compressedPath: imagePath,
          originalSize: originalSize,
          compressedSize: originalSize,
        );
      }

      final directory = await getTemporaryDirectory();
      final fileName = 'compressed_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final targetPath = outputPath ?? '${directory.path}/$fileName';

      final result = await FlutterImageCompress.compressAndGetFile(
        imagePath,
        targetPath,
        quality: compressionQuality.quality,
        minWidth: compressionQuality.maxWidth,
        minHeight: compressionQuality.maxHeight,
        format: CompressFormat.jpeg,
      );

      if (result == null) {
        debugPrint('[ImageCompressionService] Compression failed');
        return null;
      }

      final compressedSize = await result.length();

      debugPrint('[ImageCompressionService] Compressed: ${_formatBytes(originalSize)} -> ${_formatBytes(compressedSize)}');

      return CompressionResult(
        originalPath: imagePath,
        compressedPath: result.path,
        originalSize: originalSize,
        compressedSize: compressedSize,
      );
    } catch (e) {
      debugPrint('[ImageCompressionService] Error compressing image: $e');
      return null;
    }
  }

  Future<Uint8List?> compressImageBytes(
    Uint8List bytes, {
    CompressionQuality? quality,
  }) async {
    try {
      final compressionQuality = quality ?? _defaultQuality;

      if (_autoCompress && bytes.length < _autoCompressThreshold) {
        return bytes;
      }

      final result = await FlutterImageCompress.compressWithList(
        bytes,
        quality: compressionQuality.quality,
        minWidth: compressionQuality.maxWidth,
        minHeight: compressionQuality.maxHeight,
        format: CompressFormat.jpeg,
      );

      debugPrint('[ImageCompressionService] Bytes compressed: ${_formatBytes(bytes.length)} -> ${_formatBytes(result.length)}');

      return result;
    } catch (e) {
      debugPrint('[ImageCompressionService] Error compressing bytes: $e');
      return null;
    }
  }

  Future<List<CompressionResult>> compressMultiple(
    List<String> imagePaths, {
    CompressionQuality? quality,
  }) async {
    final results = <CompressionResult>[];

    for (final path in imagePaths) {
      final result = await compressImage(path, quality: quality);
      if (result != null) {
        results.add(result);
      }
    }

    return results;
  }

  Future<void> cleanupTempFiles() async {
    try {
      final directory = await getTemporaryDirectory();
      final files = directory.listSync();
      
      int deleted = 0;
      for (final file in files) {
        if (file is File && file.path.contains('compressed_')) {
          final stat = await file.stat();
          final age = DateTime.now().difference(stat.modified);
          
          if (age > const Duration(hours: 24)) {
            await file.delete();
            deleted++;
          }
        }
      }

      debugPrint('[ImageCompressionService] Cleaned up $deleted temp files');
    } catch (e) {
      debugPrint('[ImageCompressionService] Error cleaning temp files: $e');
    }
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
