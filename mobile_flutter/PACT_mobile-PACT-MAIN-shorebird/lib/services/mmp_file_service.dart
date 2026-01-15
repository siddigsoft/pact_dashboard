import 'dart:io';
import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_file/open_file.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../models/mmp_file.dart';
import 'security/logger_service.dart';

class MMPFileService {
  static const String _storageBucket = 'mmps';

  final SupabaseClient _supabase = Supabase.instance.client;
  final _newFilesController =
      StreamController<List<Map<String, dynamic>>>.broadcast();
  StreamSubscription? _subscription;
  Directory? _cachedDirectory;
  Directory? _fallbackTempDirectory;

  Stream<List<Map<String, dynamic>>> get onNewFiles =>
      _newFilesController.stream;

  MMPFileService() {
    _initializeRealtimeSubscription();
  }

  String _safeFileName(String? rawName, {String fallbackExtension = '.xlsx'}) {
    final base = (rawName ?? '').trim();
    if (base.isEmpty) {
      return 'document$fallbackExtension';
    }

    final sanitized = base.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    if (!sanitized.contains('.')) {
      return '$sanitized$fallbackExtension';
    }
    return sanitized;
  }

  Future<Directory> _ensureCacheDirectory() async {
    if (_cachedDirectory != null) {
      return _cachedDirectory!;
    }

    if (kIsWeb) {
      throw UnsupportedError(
        'Local file caching is not supported on web platforms.',
      );
    }

    Directory baseDirectory;
    try {
      baseDirectory = await getApplicationDocumentsDirectory();
    } on MissingPluginException catch (error) {
      LoggerService.log(
        'path_provider unavailable, falling back to temp directory: $error',
        level: LogLevel.warning,
      );

      if (_fallbackTempDirectory == null) {
        final systemTemp = Directory.systemTemp;
        try {
          final resolvedPath = await systemTemp.resolveSymbolicLinks();
          _fallbackTempDirectory = Directory(resolvedPath);
        } catch (_) {
          _fallbackTempDirectory = systemTemp;
        }
      }
      baseDirectory = _fallbackTempDirectory!;
    }

    final cacheDir = Directory(p.join(baseDirectory.path, 'mmp_cache'));
    if (!await cacheDir.exists()) {
      await cacheDir.create(recursive: true);
    }

    _cachedDirectory = cacheDir;
    return cacheDir;
  }

  Future<Map<String, dynamic>?> _getLocalFileRecord(String fileId) async {
    final localFilesBox = await _getLocalFilesBox();
    final raw = localFilesBox.get('local_$fileId');
    if (raw == null) return null;
    if (raw is Map<String, dynamic>) return Map<String, dynamic>.from(raw);
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return null;
  }

  Future<void> _saveLocalFileRecord(
    String fileId,
    Map<String, dynamic> record,
  ) async {
    final localFilesBox = await _getLocalFilesBox();
    await localFilesBox.put('local_$fileId', record);
  }

  Future<void> _touchLocalFileRecord(String fileId) async {
    final record = await _getLocalFileRecord(fileId);
    if (record == null) return;
    record['last_accessed'] = DateTime.now().toIso8601String();
    await _saveLocalFileRecord(fileId, record);
  }

  void _initializeRealtimeSubscription() {
    _subscription = _supabase
        .from('mmp_files')
        .stream(primaryKey: ['id'])
        .listen((List<Map<String, dynamic>> data) {
          if (data.isNotEmpty) {
            _newFilesController.add(data);
          }
        });
  }

  Future<List<Map<String, dynamic>>> getMMPFiles() async {
    try {
      LoggerService.log('Fetching MMP files');

      final currentUser = _supabase.auth.currentUser;
      if (currentUser == null) {
        throw Exception('User is not authenticated');
      }

      final response = await _supabase
          .from('mmp_files')
          .select()
          .order('created_at', ascending: false);

      return response.map((item) => Map<String, dynamic>.from(item)).toList();

      return [];
    } catch (e) {
      LoggerService.log(
        'Failed to fetch MMP files: ${e.toString()}',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  Future<Map<String, dynamic>> getMMPFileDetails(String fileId) async {
    try {
      final response = await _supabase
          .from('mmp_files')
          .select()
          .eq('id', fileId)
          .single();

      return Map<String, dynamic>.from(response);
    } catch (e) {
      LoggerService.log(
        'Failed to fetch MMP file details: ${e.toString()}',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  Future<List<Map<String, dynamic>>> getPendingMMPFiles() async {
    try {
      final response = await _supabase
          .from('mmp_files')
          .select()
          .eq('status', 'pending')
          .order('created_at', ascending: false);

      return (response as List)
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (e) {
      LoggerService.log(
        'Failed to fetch pending MMP files: ${e.toString()}',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  Future<void> downloadAndOpenFile(String fileId, String fileName) async {
    LoggerService.log('Starting file download: $fileName');

    Map<String, dynamic>? fileData;
    try {
      final remoteData = await getMMPFileDetails(fileId);
      fileData = remoteData;
      await cacheFileDetailsLocally(fileId, remoteData);
    } catch (error) {
      LoggerService.log(
        'Remote file metadata unavailable for $fileId, falling back to cache: $error',
        level: LogLevel.warning,
      );
      fileData = await getCachedFileDetails(fileId);
    }

    if (fileData == null) {
      LoggerService.log(
        'Missing file metadata for $fileId; cannot download while offline.',
        level: LogLevel.error,
      );
      throw OfflineFileUnavailableException(
        'We could not find the information needed to download this document. Connect to the internet and try again.',
      );
    }

    final mmpFile = MMPFile.fromJson(fileData);

    try {
      await downloadAndOpenFileCached(mmpFile, forceRefresh: true);
    } on OfflineFileUnavailableException {
      rethrow;
    } catch (e) {
      LoggerService.log(
        'Error downloading/opening file: ${e.toString()}',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  void dispose() {
    _subscription?.cancel();
    _newFilesController.close();
  }

  // ===== LOCAL STORAGE METHODS =====

  /// Initialize Hive boxes for local storage
  static Future<void> initializeLocalStorage() async {
    await Hive.initFlutter();
  }

  /// Get MMP files cache box
  Future<Box> _getMMPFilesCacheBox() async {
    return await Hive.openBox('mmp_files_cache');
  }

  /// Get download queue box
  Future<Box> _getDownloadQueueBox() async {
    return await Hive.openBox('mmp_download_queue');
  }

  /// Get local files box
  Future<Box> _getLocalFilesBox() async {
    return await Hive.openBox('mmp_local_files');
  }

  /// Cache MMP files metadata locally
  Future<void> cacheMMPFilesLocally(List<Map<String, dynamic>> files) async {
    try {
      final box = await _getMMPFilesCacheBox();

      for (final file in files) {
        final fileId = file['id'];
        await box.put('file_$fileId', {
          'data': file,
          'cached_at': DateTime.now().toIso8601String(),
          'expires_at': DateTime.now()
              .add(const Duration(hours: 24))
              .toIso8601String(),
        });
      }

      LoggerService.log('Cached ${files.length} MMP files locally');
    } catch (e) {
      LoggerService.log(
        'Error caching MMP files locally: $e',
        level: LogLevel.error,
      );
    }
  }

  /// Get cached MMP files
  Future<List<Map<String, dynamic>>> getCachedMMPFiles() async {
    try {
      final box = await _getMMPFilesCacheBox();
      final cachedFiles = <Map<String, dynamic>>[];

      for (final key in box.keys) {
        final cached = box.get(key);
        if (cached != null) {
          // Check if cache is expired
          final expiresAt = DateTime.parse(cached['expires_at']);
          if (DateTime.now().isAfter(expiresAt)) {
            await box.delete(key);
            continue;
          }

          cachedFiles.add(cached['data']);
        }
      }

      return cachedFiles;
    } catch (e) {
      LoggerService.log(
        'Error getting cached MMP files: $e',
        level: LogLevel.error,
      );
      return [];
    }
  }

  /// Get MMP files with local caching
  Future<List<Map<String, dynamic>>> getMMPFilesCached() async {
    try {
      // Try remote fetch first
      final remoteFiles = await getMMPFiles();

      // Cache the results
      await cacheMMPFilesLocally(remoteFiles);

      return remoteFiles;
    } catch (e) {
      // Fall back to cached data
      LoggerService.log(
        'Remote MMP files fetch failed, using cache: $e',
        level: LogLevel.warning,
      );
      return await getCachedMMPFiles();
    }
  }

  /// Cache individual file details
  Future<void> cacheFileDetailsLocally(
    String fileId,
    Map<String, dynamic> fileData,
  ) async {
    try {
      final box = await _getMMPFilesCacheBox();

      await box.put('file_$fileId', {
        'data': fileData,
        'cached_at': DateTime.now().toIso8601String(),
        'expires_at': DateTime.now()
            .add(const Duration(hours: 24))
            .toIso8601String(),
      });
    } catch (e) {
      LoggerService.log(
        'Error caching file details locally: $e',
        level: LogLevel.error,
      );
    }
  }

  /// Get cached file details
  Future<Map<String, dynamic>?> getCachedFileDetails(String fileId) async {
    try {
      final box = await _getMMPFilesCacheBox();
      final cached = box.get('file_$fileId');

      if (cached == null) return null;

      // Check if cache is expired
      final expiresAt = DateTime.parse(cached['expires_at']);
      if (DateTime.now().isAfter(expiresAt)) {
        await box.delete('file_$fileId');
        return null;
      }

      return cached['data'];
    } catch (e) {
      LoggerService.log(
        'Error getting cached file details: $e',
        level: LogLevel.error,
      );
      return null;
    }
  }

  /// Get file details with caching
  Future<Map<String, dynamic>> getMMPFileDetailsCached(String fileId) async {
    try {
      // Try remote fetch first
      final remoteData = await getMMPFileDetails(fileId);

      // Cache the result
      await cacheFileDetailsLocally(fileId, remoteData);

      return remoteData;
    } catch (e) {
      // Fall back to cached data
      final cachedData = await getCachedFileDetails(fileId);
      if (cachedData != null) {
        LoggerService.log(
          'Using cached file details for: $fileId',
          level: LogLevel.info,
        );
        return cachedData;
      }

      throw Exception('File details not available offline');
    }
  }

  /// Queue file download for later
  Future<void> queueFileDownload(String fileId, String fileName) async {
    try {
      final box = await _getDownloadQueueBox();

      await box.put('download_$fileId', {
        'file_id': fileId,
        'file_name': fileName,
        'queued_at': DateTime.now().toIso8601String(),
        'status': 'pending',
        'retry_count': 0,
      });

      LoggerService.log('Queued download for file: $fileName');
    } catch (e) {
      LoggerService.log(
        'Error queuing file download: $e',
        level: LogLevel.error,
      );
    }
  }

  /// Get pending downloads
  Future<List<Map<String, dynamic>>> getPendingDownloads() async {
    try {
      final box = await _getDownloadQueueBox();
      final pending = <Map<String, dynamic>>[];

      for (final key in box.keys) {
        final download = box.get(key);
        if (download != null && download['status'] == 'pending') {
          pending.add(download);
        }
      }

      return pending;
    } catch (e) {
      LoggerService.log(
        'Error getting pending downloads: $e',
        level: LogLevel.error,
      );
      return [];
    }
  }

  /// Process download queue
  Future<void> processDownloadQueue() async {
    try {
      final pendingDownloads = await getPendingDownloads();

      for (final download in pendingDownloads) {
        try {
          await downloadAndOpenFile(download['file_id'], download['file_name']);

          // Mark as completed
          final box = await _getDownloadQueueBox();
          await box.delete('download_${download['file_id']}');

          LoggerService.log(
            'Successfully downloaded queued file: ${download['file_name']}',
          );
        } catch (e) {
          // Increment retry count
          final box = await _getDownloadQueueBox();
          download['retry_count'] = (download['retry_count'] ?? 0) + 1;

          if (download['retry_count'] > 3) {
            download['status'] = 'failed';
            LoggerService.log(
              'Download failed permanently for: ${download['file_name']}',
              level: LogLevel.error,
            );
          } else {
            download['status'] = 'pending';
            LoggerService.log(
              'Download retry ${download['retry_count']} for: ${download['file_name']}',
              level: LogLevel.warning,
            );
          }

          await box.put('download_${download['file_id']}', download);
        }
      }
    } catch (e) {
      LoggerService.log(
        'Error processing download queue: $e',
        level: LogLevel.error,
      );
    }
  }

  /// Download and cache file locally
  Future<String> downloadAndCacheFile({
    required String fileId,
    required String storagePath,
    required String fileName,
    DateTime? remoteUpdatedAt,
  }) async {
    try {
      LoggerService.log(
        'Downloading and caching file: $fileName from $storagePath',
      );

      final cacheDir = await _ensureCacheDirectory();
      final safeName = _safeFileName(fileName);
      final cacheFile = File(p.join(cacheDir.path, '$fileId-$safeName'));

      // Download from Supabase storage
      LoggerService.log(
        'Downloading from storage bucket: $_storageBucket, path: $storagePath',
      );

      final bytes = await _supabase.storage
          .from(_storageBucket)
          .download(storagePath);

      LoggerService.log('Downloaded ${bytes.length} bytes for $fileName');

      // Write to cache file
      await cacheFile.writeAsBytes(bytes, flush: true);
      LoggerService.log('Wrote file to cache: ${cacheFile.path}');

      // Verify file was written correctly
      if (!await cacheFile.exists()) {
        throw Exception('File was not saved correctly to cache');
      }

      final fileSize = await cacheFile.length();
      LoggerService.log('Cached file size: $fileSize bytes');

      // Save metadata
      await _saveLocalFileRecord(fileId, {
        'file_id': fileId,
        'storage_path': storagePath,
        'file_name': safeName,
        'local_path': cacheFile.path,
        'file_size': fileSize,
        'downloaded_at': DateTime.now().toIso8601String(),
        'last_accessed': DateTime.now().toIso8601String(),
        'remote_updated_at': remoteUpdatedAt?.toIso8601String(),
      });

      LoggerService.log('File successfully cached: ${cacheFile.path}');

      return cacheFile.path;
    } on UnsupportedError catch (e) {
      LoggerService.log(
        'Unsupported caching operation: $e',
        level: LogLevel.error,
      );
      throw OfflineFileUnavailableException(
        'This device does not support offline caching for these documents yet.',
      );
    } on StorageException catch (e) {
      LoggerService.log(
        'Supabase storage error downloading $fileName: ${e.message}',
        level: LogLevel.error,
      );
      throw StorageException('Failed to download file: ${e.message}');
    } catch (e) {
      LoggerService.log(
        'Error downloading and caching file $fileName: $e',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  /// Open cached file if available
  Future<bool> openCachedFile(String fileId) async {
    try {
      final cachedFile = await _getLocalFileRecord(fileId);

      if (cachedFile != null) {
        final filePath = cachedFile['local_path'] as String?;
        if (filePath != null) {
          final file = File(filePath);
          if (await file.exists()) {
            final result = await OpenFile.open(filePath);
            if (result.type == ResultType.done) {
              await _touchLocalFileRecord(fileId);
              LoggerService.log('Opened cached file: $filePath');
              return true;
            }
          } else {
            final localFilesBox = await _getLocalFilesBox();
            await localFilesBox.delete('local_$fileId');
          }
        }
      }

      return false;
    } catch (e) {
      LoggerService.log('Error opening cached file: $e', level: LogLevel.error);
      return false;
    }
  }

  /// Download and open file with local caching
  Future<void> downloadAndOpenFileCached(
    MMPFile file, {
    bool forceRefresh = false,
  }) async {
    try {
      final localPath = await ensureFileAvailable(
        file,
        forceRefresh: forceRefresh,
      );
      final result = await OpenFile.open(localPath);
      if (result.type != ResultType.done) {
        throw Exception('Could not open file: ${result.message}');
      }
    } catch (e) {
      LoggerService.log(
        'Error in cached download/open: $e',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  /// Return the cached file path if it exists on disk.
  Future<String?> getCachedFilePath(String fileId) async {
    try {
      final record = await _getLocalFileRecord(fileId);
      if (record == null) {
        LoggerService.log('No cache record found for file $fileId');
        return null;
      }

      final path = record['local_path'] as String?;
      if (path == null) {
        LoggerService.log('Cache record exists but no path for file $fileId');
        return null;
      }

      final file = File(path);
      final exists = await file.exists();

      if (exists) {
        final size = await file.length();
        LoggerService.log(
          'Cached file found for $fileId at $path (size: $size bytes)',
        );
        return path;
      } else {
        LoggerService.log(
          'Cached file path exists but file not found on disk for $fileId: $path',
        );
        // Clean up invalid record
        final localFilesBox = await _getLocalFilesBox();
        await localFilesBox.delete('local_$fileId');
        return null;
      }
    } catch (e) {
      LoggerService.log(
        'Error checking cached file path for $fileId: $e',
        level: LogLevel.error,
      );
      return null;
    }
  }

  /// Ensure a file is present on the device, downloading and caching if needed.
  Future<String> ensureFileAvailable(
    MMPFile file, {
    bool forceRefresh = false,
  }) async {
    // On web, we can't cache files locally, so we need to handle differently
    if (kIsWeb) {
      return await _handleWebFileAccess(file);
    }

    // Check if file is already cached
    final existingPath = await getCachedFilePath(file.id);

    if (existingPath != null && !forceRefresh) {
      // File exists locally, check if we need to update it
      final record = await _getLocalFileRecord(file.id);
      final remoteTimestamp =
          file.verifiedAt ?? file.approvedAt ?? file.createdAt;
      final remoteSignature = remoteTimestamp.toIso8601String();
      final cachedSignature = record?['remote_updated_at'] as String?;

      // If signatures match or we don't have a cached signature, use the cached file
      if (cachedSignature == null || cachedSignature == remoteSignature) {
        await _touchLocalFileRecord(file.id);
        LoggerService.log('Using cached file for ${file.name ?? file.id}');
        return existingPath;
      }

      // File needs updating, try to download new version
      LoggerService.log(
        'Cached file outdated, attempting update for ${file.name ?? file.id}',
      );
    }

    // File not cached or needs updating, attempt download
    final storagePath = file.fileUrl ?? file.filePath;
    if (storagePath == null) {
      throw Exception(
        'Storage path not available for file ${file.name ?? file.id}',
      );
    }

    try {
      final remoteTimestamp =
          file.verifiedAt ?? file.approvedAt ?? file.createdAt;
      final downloadedPath = await downloadAndCacheFile(
        fileId: file.id,
        storagePath: storagePath,
        fileName: file.originalFilename ?? file.name ?? '${file.id}.xlsx',
        remoteUpdatedAt: remoteTimestamp,
      );
      LoggerService.log(
        'Successfully downloaded and cached ${file.name ?? file.id}',
      );
      return downloadedPath;
    } on SocketException {
      // Offline - use cached version if available
      if (existingPath != null) {
        LoggerService.log(
          'Offline, using cached version for ${file.name ?? file.id}',
        );
        await _touchLocalFileRecord(file.id);
        return existingPath;
      }
      LoggerService.log(
        'File not cached and device is offline: ${file.name ?? file.id}',
        level: LogLevel.error,
      );
      throw OfflineFileUnavailableException(
        'This document is not available offline yet. Connect to the internet to download it once and try again.',
      );
    } on StorageException catch (e) {
      // Storage error - use cached version if available
      if (existingPath != null) {
        LoggerService.log(
          'Storage error, using cached version for ${file.name ?? file.id}: ${e.message}',
          level: LogLevel.warning,
        );
        await _touchLocalFileRecord(file.id);
        return existingPath;
      }
      throw Exception('Unable to download file from storage: ${e.message}');
    } catch (e) {
      // General error - use cached version if available
      if (existingPath != null) {
        LoggerService.log(
          'Error downloading file, using cached version for ${file.name ?? file.id}: $e',
          level: LogLevel.warning,
        );
        await _touchLocalFileRecord(file.id);
        return existingPath;
      }
      LoggerService.log(
        'Failed to download file and no cache available: ${file.name ?? file.id}: $e',
        level: LogLevel.error,
      );
      rethrow;
    }
  }

  /// Prefetch and cache a list of MMP files for offline use.
  Future<void> prefetchMMPFiles(
    List<MMPFile> files, {
    bool forceRefresh = false,
  }) async {
    LoggerService.log(
      'Starting automatic download for ${files.length} MMP files',
    );
    int successCount = 0;
    int failCount = 0;

    for (final file in files) {
      try {
        await ensureFileAvailable(file, forceRefresh: forceRefresh);
        successCount++;
        LoggerService.log(
          'Auto-download success for ${file.name ?? file.id} ($successCount/${files.length})',
        );
      } catch (e) {
        failCount++;
        LoggerService.log(
          'Auto-download failed for ${file.name ?? file.id}: $e',
          level: LogLevel.warning,
        );
      }
    }

    LoggerService.log(
      'Auto-download complete: $successCount succeeded, $failCount failed out of ${files.length}',
    );
  }

  /// Get locally cached files
  Future<List<Map<String, dynamic>>> getLocallyCachedFiles() async {
    try {
      final box = await _getLocalFilesBox();
      final cachedFiles = <Map<String, dynamic>>[];

      for (final key in box.keys) {
        final fileData = box.get(key);
        if (fileData != null) {
          cachedFiles.add(fileData);
        }
      }

      return cachedFiles;
    } catch (e) {
      LoggerService.log(
        'Error getting locally cached files: $e',
        level: LogLevel.error,
      );
      return [];
    }
  }

  /// Clear cached file data
  Future<void> clearFileCache() async {
    try {
      final cacheBox = await _getMMPFilesCacheBox();
      final queueBox = await _getDownloadQueueBox();
      final localBox = await _getLocalFilesBox();

      await cacheBox.clear();
      await queueBox.clear();

      // Optionally clear local files (be careful with this)
      // await localBox.clear();

      LoggerService.log('Cleared MMP file cache');
    } catch (e) {
      LoggerService.log('Error clearing file cache: $e', level: LogLevel.error);
    }
  }

  /// Get file cache statistics
  Future<Map<String, dynamic>> getFileCacheStats() async {
    try {
      final cacheBox = await _getMMPFilesCacheBox();
      final queueBox = await _getDownloadQueueBox();
      final localBox = await _getLocalFilesBox();

      final pendingDownloads = queueBox.keys.where((key) {
        final item = queueBox.get(key);
        return item != null && item['status'] == 'pending';
      }).length;

      final failedDownloads = queueBox.keys.where((key) {
        final item = queueBox.get(key);
        return item != null && item['status'] == 'failed';
      }).length;

      return {
        'cached_file_metadata': cacheBox.length,
        'pending_downloads': pendingDownloads,
        'failed_downloads': failedDownloads,
        'locally_cached_files': localBox.length,
      };
    } catch (e) {
      LoggerService.log(
        'Error getting file cache stats: $e',
        level: LogLevel.error,
      );
      return {};
    }
  }

  Future<String> _handleWebFileAccess(MMPFile file) async {
    // On web, we can't cache files locally, so we return a special URL that can be used for downloading
    final storagePath = file.fileUrl ?? file.filePath;
    if (storagePath == null) {
      throw Exception(
        'Storage path not available for file ${file.name ?? file.id}',
      );
    }

    // For web, we'll construct a download URL that can be used by the browser
    final downloadUrl = _supabase.storage
        .from(_storageBucket)
        .getPublicUrl(storagePath);
    LoggerService.log(
      'Web file access URL: $downloadUrl for ${file.name ?? file.id}',
    );

    // Return the download URL as the "local path" for web
    return downloadUrl;
  }
}

class OfflineFileUnavailableException implements Exception {
  final String message;
  OfflineFileUnavailableException(this.message);

  @override
  String toString() => message;
}
