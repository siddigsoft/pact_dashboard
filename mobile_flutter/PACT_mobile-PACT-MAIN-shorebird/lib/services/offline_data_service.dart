import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'storage_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';
import 'offline/offline_db.dart';
import 'offline/models.dart';

/// Service for managing offline data storage and synchronization
class OfflineDataService {
  static const String _siteVisitsBox = 'site_visits';
  static const String _reportsBox = 'reports';
  static const String _mmpsBox = 'mmps';
  static const String _chatMessagesBox = 'chat_messages';
  static const String _syncQueueBox = 'sync_queue';
  static const String _lastSyncBox = 'last_sync';

  final SupabaseClient _supabase = Supabase.instance.client;

  /// Initialize Hive and register adapters
  static Future<void> initialize() async {
    await Hive.initFlutter();

    // Open boxes for different data types
    await Hive.openBox(_siteVisitsBox);
    await Hive.openBox(_reportsBox);
    await Hive.openBox(_mmpsBox);
    await Hive.openBox(_chatMessagesBox);
    await Hive.openBox(_syncQueueBox);
    await Hive.openBox(_lastSyncBox);
  }

  /// Check if device is online
  Future<bool> isOnline() async {
    final connectivityResult = await Connectivity().checkConnectivity();
    return !connectivityResult.contains(ConnectivityResult.none);
  }

  // ==================== SITE VISITS ====================

  /// Cache site visits for offline access (raw JSON)
  Future<void> cacheSiteVisits(List<Map<String, dynamic>> visits) async {
    final box = Hive.box(_siteVisitsBox);
    // Don't clear - merge with existing to preserve local modifications
    for (var visit in visits) {
      final id = visit['id']?.toString();
      if (id == null) continue;
      
      // Check if we have a local modification that hasn't synced
      final existingData = box.get(id);
      if (existingData != null) {
        final existing = Map<String, dynamic>.from(jsonDecode(existingData));
        if (existing['_offline_modified'] == true && existing['_synced'] != true) {
          // Skip - local changes take priority until synced
          continue;
        }
      }
      
      await box.put(id, jsonEncode(visit));
    }

    await _updateLastSync('site_visits');
  }

  /// Cache site visits by category for offline access
  Future<void> cacheSiteVisitsByCategory({
    List<Map<String, dynamic>>? available,
    List<Map<String, dynamic>>? claimed,
    List<Map<String, dynamic>>? accepted,
    List<Map<String, dynamic>>? ongoing,
    List<Map<String, dynamic>>? completed,
  }) async {
    final box = Hive.box(_siteVisitsBox);
    
    // Cache each category with a category marker
    void cacheCategory(List<Map<String, dynamic>>? visits, String category) {
      if (visits == null) return;
      for (var visit in visits) {
        final id = visit['id']?.toString();
        if (id == null) continue;
        
        // Check if we have a local modification that hasn't synced
        final existingData = box.get(id);
        if (existingData != null) {
          final existing = Map<String, dynamic>.from(jsonDecode(existingData));
          if (existing['_offline_modified'] == true && existing['_synced'] != true) {
            // Skip - local changes take priority until synced
            continue;
          }
        }
        
        visit['_category'] = category;
        box.put(id, jsonEncode(visit));
      }
    }
    
    cacheCategory(available, 'available');
    cacheCategory(claimed, 'claimed');
    cacheCategory(accepted, 'accepted');
    cacheCategory(ongoing, 'ongoing');
    cacheCategory(completed, 'completed');
    
    await _updateLastSync('site_visits');
  }

  /// Get cached site visits
  Future<List<Map<String, dynamic>>> getCachedSiteVisits() async {
    final box = Hive.box(_siteVisitsBox);
    final List<Map<String, dynamic>> visits = [];

    for (var key in box.keys) {
      final data = box.get(key);
      if (data != null) {
        visits.add(Map<String, dynamic>.from(jsonDecode(data)));
      }
    }

    return visits;
  }

  /// Get cached site visits by category
  Future<List<Map<String, dynamic>>> getCachedSiteVisitsByCategory(String category) async {
    final allVisits = await getCachedSiteVisits();
    return allVisits.where((v) => v['_category'] == category).toList();
  }

  /// Get cached site visits for a specific user
  Future<List<Map<String, dynamic>>> getCachedUserSiteVisits(String userId) async {
    final allVisits = await getCachedSiteVisits();
    return allVisits.where((v) => 
      v['accepted_by'] == userId || 
      v['claimed_by'] == userId ||
      v['assigned_to'] == userId
    ).toList();
  }

  /// Update a cached site visit locally (for offline modifications)
  Future<void> updateCachedSiteVisit(String visitId, Map<String, dynamic> updates) async {
    final box = Hive.box(_siteVisitsBox);
    final existingData = box.get(visitId);
    
    if (existingData != null) {
      final existing = Map<String, dynamic>.from(jsonDecode(existingData));
      existing.addAll(updates);
      existing['_offline_modified'] = true;
      existing['_synced'] = false;
      existing['_modified_at'] = DateTime.now().toIso8601String();
      await box.put(visitId, jsonEncode(existing));
    }
  }

  /// Mark a cached site visit as synced
  Future<void> markSiteVisitSynced(String visitId) async {
    final box = Hive.box(_siteVisitsBox);
    final existingData = box.get(visitId);
    
    if (existingData != null) {
      final existing = Map<String, dynamic>.from(jsonDecode(existingData));
      existing['_synced'] = true;
      existing['_offline_modified'] = false;
      await box.put(visitId, jsonEncode(existing));
    }
  }

  /// Get unsynced site visits (locally modified)
  Future<List<Map<String, dynamic>>> getUnsyncedSiteVisits() async {
    final allVisits = await getCachedSiteVisits();
    return allVisits.where((v) => v['_offline_modified'] == true && v['_synced'] != true).toList();
  }

  /// Get site visits (online or offline)
  Future<List<Map<String, dynamic>>> getSiteVisits({String? assignedTo}) async {
    if (await isOnline()) {
      try {
        // Fetch from Supabase
        var query = _supabase.from('mmp_site_entries').select();

        if (assignedTo != null) {
          query = query.eq('user_id', assignedTo);
        }

        final List<dynamic> data = await query;
        final visits = data.map((e) => Map<String, dynamic>.from(e)).toList();

        // Cache for offline use
        await cacheSiteVisits(visits);

        return visits;
      } catch (e) {
        debugPrint('Error fetching site visits online: $e');
        // Fall back to cached data
        return getCachedSiteVisits();
      }
    } else {
      // Return cached data
      return getCachedSiteVisits();
    }
  }

  // ==================== REPORTS ====================

  /// Save report to local queue for syncing
  Future<String> saveReportOffline(Map<String, dynamic> reportData) async {
    final box = Hive.box(_syncQueueBox);
    final id = DateTime.now().millisecondsSinceEpoch.toString();

    final queueItem = {
      'id': id,
      'type': 'report',
      'data': reportData,
      'timestamp': DateTime.now().toIso8601String(),
      'synced': false,
    };

    await box.put(id, jsonEncode(queueItem));

    // Also save to reports box for immediate viewing
    final reportsBox = Hive.box(_reportsBox);
    await reportsBox.put(id, jsonEncode(reportData));

    return id;
  }

  /// Get cached reports
  Future<List<Map<String, dynamic>>> getCachedReports() async {
    final box = Hive.box(_reportsBox);
    final List<Map<String, dynamic>> reports = [];

    for (var key in box.keys) {
      final data = box.get(key);
      if (data != null) {
        reports.add(Map<String, dynamic>.from(jsonDecode(data)));
      }
    }

    return reports;
  }

  /// Sync pending reports when online
  Future<int> syncPendingReports() async {
    if (!await isOnline()) {
      return 0;
    }

    final box = Hive.box(_syncQueueBox);
    int syncedCount = 0;

    for (var key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;

      final queueItem = Map<String, dynamic>.from(jsonDecode(data));

      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'report') continue;

      try {
        // Upload report to Supabase
        final reportData = Map<String, dynamic>.from(queueItem['data']);

        // Separate photos from main insert payload
        final List<dynamic> photosRaw = (reportData['photos'] as List?) ?? [];
        final reportInsert = Map<String, dynamic>.from(reportData)
          ..remove('photos');

        // Insert report
        final reportResponse = await _supabase
            .from('reports')
            .insert(reportInsert)
            .select()
            .single();

        // Upload photos to storage and insert metadata
        if (photosRaw.isNotEmpty) {
          final reportId = reportResponse['id'];
          final bucket = 'report_photos';
          final List<Map<String, dynamic>> photoInserts = [];
          for (final item in photosRaw) {
            final photo = Map<String, dynamic>.from(item as Map);
            final localPath = photo['photo_url']?.toString();
            if (localPath == null) continue;
            try {
              final file = File(localPath);
              if (await file.exists()) {
                final fileName = p.basename(localPath);
                final folder = 'reports/$reportId';
                // Upload and get public URL
                final publicUrl = await StorageService().uploadFile(
                  file,
                  bucket,
                  folder: folder,
                );
                photoInserts.add({
                  'report_id': reportId,
                  'photo_url': publicUrl,
                  'storage_path': '$folder/$fileName',
                  'is_synced': true,
                  'last_modified': DateTime.now().toIso8601String(),
                });
              } else {
                // If file no longer exists, skip or insert placeholder
              }
            } catch (e) {
              debugPrint('Failed to upload offline photo $localPath: $e');
            }
          }
          if (photoInserts.isNotEmpty) {
            await _supabase.from('report_photos').insert(photoInserts);
          }
        }

        // Mark as synced
        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        syncedCount++;

        debugPrint('Synced report: ${queueItem['id']}');
      } catch (e) {
        debugPrint('Error syncing report ${queueItem['id']}: $e');
      }
    }

    return syncedCount;
  }

  // ==================== MMPs (Files) ====================

  /// Cache MMP file data for offline access
  Future<void> cacheMMP(
      String mmpId, Map<String, dynamic> mmpData, List<int>? fileBytes) async {
    final box = Hive.box(_mmpsBox);

    final cacheData = {
      'metadata': mmpData,
      'fileBytes': fileBytes != null ? base64Encode(fileBytes) : null,
      'cachedAt': DateTime.now().toIso8601String(),
    };

    await box.put(mmpId, jsonEncode(cacheData));
  }

  /// Get cached MMP
  Future<Map<String, dynamic>?> getCachedMMP(String mmpId) async {
    final box = Hive.box(_mmpsBox);
    final data = box.get(mmpId);

    if (data == null) return null;

    final cacheData = Map<String, dynamic>.from(jsonDecode(data));

    // Decode file bytes if present
    if (cacheData['fileBytes'] != null) {
      cacheData['fileBytes'] = base64Decode(cacheData['fileBytes']);
    }

    return cacheData;
  }

  /// Get all cached MMPs
  Future<List<Map<String, dynamic>>> getCachedMMPs() async {
    final box = Hive.box(_mmpsBox);
    final List<Map<String, dynamic>> mmps = [];

    for (var key in box.keys) {
      final data = box.get(key);
      if (data != null) {
        final cacheData = Map<String, dynamic>.from(jsonDecode(data));
        mmps.add(cacheData['metadata'] as Map<String, dynamic>);
      }
    }

    return mmps;
  }

  // ==================== CHAT MESSAGES ====================

  /// Cache chat messages for offline access
  Future<void> cacheChatMessages(
      String chatId, List<Map<String, dynamic>> messages) async {
    final box = Hive.box(_chatMessagesBox);
    await box.put(chatId, jsonEncode(messages));
  }

  /// Get cached chat messages
  Future<List<Map<String, dynamic>>> getCachedChatMessages(
      String chatId) async {
    final box = Hive.box(_chatMessagesBox);
    final data = box.get(chatId);

    if (data == null) return [];

    final List<dynamic> messages = jsonDecode(data);
    return messages.map((e) => Map<String, dynamic>.from(e)).toList();
  }

  /// Save chat message to local queue for syncing
  Future<String> saveChatMessageOffline(
      Map<String, dynamic> messageData) async {
    final box = Hive.box(_syncQueueBox);
    final id = DateTime.now().millisecondsSinceEpoch.toString();

    final queueItem = {
      'id': id,
      'type': 'chat_message',
      'data': messageData,
      'timestamp': DateTime.now().toIso8601String(),
      'synced': false,
    };

    await box.put(id, jsonEncode(queueItem));

    return id;
  }

  /// Sync pending chat messages when online
  Future<int> syncPendingChatMessages() async {
    if (!await isOnline()) {
      return 0;
    }

    final box = Hive.box(_syncQueueBox);
    int syncedCount = 0;

    for (var key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;

      final queueItem = Map<String, dynamic>.from(jsonDecode(data));

      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'chat_message') continue;

      try {
        // Upload message to Supabase
        final messageData = Map<String, dynamic>.from(queueItem['data']);

        await _supabase.from('chat_messages').insert(messageData);

        // Mark as synced
        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        syncedCount++;

        debugPrint('Synced chat message: ${queueItem['id']}');
      } catch (e) {
        debugPrint('Error syncing chat message ${queueItem['id']}: $e');
      }
    }

    return syncedCount;
  }

  // ==================== SYNC MANAGEMENT ====================

  /// Sync all pending data
  Future<Map<String, int>> syncAll() async {
    final results = {
      'accept_visit': await syncPendingAcceptVisits(),
      'start_visit': await syncPendingStartVisits(),
      'complete_visit': await syncPendingCompleteVisits(),
      'visit_status': await syncPendingVisitStatuses(),
      'reports': await syncPendingReports(),
      'site_locations': await syncPendingSiteLocations(),
      'chat_messages': await syncPendingChatMessages(),
    };

    return results;
  }

  /// Sync pending complete visit operations
  Future<int> syncPendingCompleteVisits() async {
    if (!await isOnline()) return 0;

    final box = Hive.box(_syncQueueBox);
    int synced = 0;
    
    for (final key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;
      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'complete_visit') continue;

      try {
        final payload = Map<String, dynamic>.from(queueItem['data']);
        final visitId = payload['visit_id'] as String;
        final userId = payload['user_id'] as String;
        final completedAt = payload['completed_at'] as String;
        final endLocation = payload['end_location'] as Map<String, dynamic>?;
        final notes = payload['notes'] as String?;
        final activities = payload['activities'] as String?;
        final durationMinutes = payload['duration_minutes'] as int?;
        final photos = payload['photos'] as List<dynamic>? ?? [];

        // First get existing additional_data
        final existing = await _supabase
            .from('mmp_site_entries')
            .select('additional_data')
            .eq('id', visitId)
            .maybeSingle();

        final existingData = (existing?['additional_data'] as Map<String, dynamic>?) ?? {};
        final mergedData = {
          ...existingData,
          if (endLocation != null) 'end_location': endLocation,
          'visit_completed': true,
          'completed_notes': notes,
          'completed_activities': activities,
          'duration_minutes': durationMinutes,
        };

        // Update site entry status
        await _supabase.from('mmp_site_entries').update({
          'status': 'Completed',
          'visit_completed_by': userId,
          'visit_completed_at': completedAt,
          'additional_data': mergedData,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', visitId);

        // Upload photos if any (base64 encoded)
        if (photos.isNotEmpty) {
          for (int i = 0; i < photos.length; i++) {
            try {
              final photoData = photos[i] as String;
              if (photoData.startsWith('data:image')) {
                // Extract base64 data
                final base64Data = photoData.split(',').last;
                final bytes = base64Decode(base64Data);
                final fileName = 'offline_${visitId}_${DateTime.now().millisecondsSinceEpoch}_$i.jpg';
                final storagePath = 'site_visits/$visitId/$fileName';
                
                await _supabase.storage.from('photos').uploadBinary(
                  storagePath,
                  bytes,
                  fileOptions: const FileOptions(contentType: 'image/jpeg'),
                );
                debugPrint('Uploaded offline photo: $storagePath');
              }
            } catch (e) {
              debugPrint('Error uploading offline photo: $e');
            }
          }
        }

        // Mark as synced
        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        await markSiteVisitSynced(visitId);
        synced++;

        debugPrint('Synced complete visit: $visitId');
      } catch (e) {
        debugPrint('Error syncing complete visit $key: $e');
      }
    }

    return synced;
  }

  /// Get pending sync count
  Future<int> getPendingSyncCount() async {
    final box = Hive.box(_syncQueueBox);
    int count = 0;

    for (var key in box.keys) {
      final data = box.get(key);
      if (data == null) continue;

      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] != true) {
        count++;
      }
    }

    return count;
  }

  /// Clear synced items from queue
  Future<void> clearSyncedItems() async {
    final box = Hive.box(_syncQueueBox);

    for (var key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;

      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) {
        await box.delete(key);
      }
    }
  }

  /// Update last sync timestamp
  Future<void> _updateLastSync(String dataType) async {
    final box = Hive.box(_lastSyncBox);
    await box.put(dataType, DateTime.now().toIso8601String());
  }

  /// Get last sync timestamp
  Future<DateTime?> getLastSync(String dataType) async {
    final box = Hive.box(_lastSyncBox);
    final timestamp = box.get(dataType);

    if (timestamp == null) return null;

    return DateTime.parse(timestamp);
  }

  /// Clear all cached data
  Future<void> clearAllCache() async {
    await Hive.box(_siteVisitsBox).clear();
    await Hive.box(_reportsBox).clear();
    await Hive.box(_mmpsBox).clear();
    await Hive.box(_chatMessagesBox).clear();
    await Hive.box(_lastSyncBox).clear();
  }

  /// Close all boxes
  static Future<void> dispose() async {
    await Hive.close();
  }

  // ==================== VISIT STATUS OFFLINE QUEUE ====================

  /// Queue a visit status change for later sync
  Future<String> queueVisitStatusUpdate({
    required String visitId,
    required String newStatus,
    Map<String, dynamic>? extra,
  }) async {
    final box = Hive.box(_syncQueueBox);
    final id = DateTime.now().millisecondsSinceEpoch.toString();

    final payload = {
      'visit_id': visitId,
      'status': newStatus,
      'extra': extra,
      'timestamp': DateTime.now().toIso8601String(),
    };

    final queueItem = {
      'id': id,
      'type': 'visit_status',
      'data': payload,
      'timestamp': DateTime.now().toIso8601String(),
      'synced': false,
    };
    await box.put(id, jsonEncode(queueItem));
    return id;
  }

  /// Sync pending visit status updates
  Future<int> syncPendingVisitStatuses() async {
    if (!await isOnline()) return 0;

    final box = Hive.box(_syncQueueBox);
    int synced = 0;
    for (final key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;
      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'visit_status') continue;

      try {
        final payload = Map<String, dynamic>.from(queueItem['data']);
        final visitId = payload['visit_id'] as String;
        final status = payload['status'] as String;

        await _supabase.from('mmp_site_entries').update({
          'status': status,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', visitId);

        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        synced++;
      } catch (e) {
        debugPrint('Error syncing visit status $key: $e');
      }
    }

    return synced;
  }

  // ==================== SITE LOCATIONS OFFLINE QUEUE ====================

  /// Queue site location capture for later sync
  Future<String> queueSiteLocation(Map<String, dynamic> locationData) async {
    final box = Hive.box(_syncQueueBox);
    final id = 'site_location_${DateTime.now().millisecondsSinceEpoch}';
    final queueItem = {
      'id': id,
      'type': 'site_location',
      'data': locationData,
      'timestamp': DateTime.now().toIso8601String(),
      'synced': false,
    };
    await box.put(id, jsonEncode(queueItem));
    return id;
  }

  /// Sync pending site locations
  Future<int> syncPendingSiteLocations() async {
    if (!await isOnline()) return 0;

    final box = Hive.box(_syncQueueBox);
    int synced = 0;
    for (final key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;
      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'site_location') continue;

      try {
        final payload = Map<String, dynamic>.from(queueItem['data']);
        await _supabase
            .from('site_locations')
            .upsert(payload, onConflict: 'site_id')
            .select('site_id')
            .single();

        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        synced++;
      } catch (e) {
        debugPrint('Error syncing site location $key: $e');
      }
    }
    return synced;
  }

  // ==================== ACCEPT VISIT OFFLINE QUEUE ====================

  /// Queue an accept visit operation for later sync
  Future<String> queueAcceptVisit({
    required String visitId,
    required String userId,
    Map<String, dynamic>? locationData,
  }) async {
    final box = Hive.box(_syncQueueBox);
    final id = 'accept_visit_${DateTime.now().millisecondsSinceEpoch}';

    final payload = {
      'visit_id': visitId,
      'user_id': userId,
      'location': locationData,
      'accepted_at': DateTime.now().toIso8601String(),
    };

    final queueItem = {
      'id': id,
      'type': 'accept_visit',
      'data': payload,
      'timestamp': DateTime.now().toIso8601String(),
      'synced': false,
    };
    await box.put(id, jsonEncode(queueItem));

    // Also update the cached visit locally
    await updateCachedSiteVisit(visitId, {
      'status': 'Accepted',
      'accepted_by': userId,
      'accepted_at': DateTime.now().toIso8601String(),
      '_category': 'accepted',
    });

    return id;
  }

  /// Sync pending accept visit operations
  Future<int> syncPendingAcceptVisits() async {
    if (!await isOnline()) return 0;

    final box = Hive.box(_syncQueueBox);
    int synced = 0;
    for (final key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;
      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'accept_visit') continue;

      try {
        final payload = Map<String, dynamic>.from(queueItem['data']);
        final visitId = payload['visit_id'] as String;
        final userId = payload['user_id'] as String;
        final acceptedAt = payload['accepted_at'] as String;

        await _supabase.from('mmp_site_entries').update({
          'status': 'Accepted',
          'accepted_by': userId,
          'accepted_at': acceptedAt,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', visitId);

        // Mark as synced
        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        await markSiteVisitSynced(visitId);
        synced++;

        debugPrint('Synced accept visit: $visitId');
      } catch (e) {
        debugPrint('Error syncing accept visit $key: $e');
      }
    }

    return synced;
  }

  // ==================== START VISIT OFFLINE QUEUE ====================

  /// Queue a start visit operation for later sync
  Future<String> queueStartVisit({
    required String visitId,
    required String userId,
    required Map<String, dynamic> startLocation,
    String? siteName,
    String? siteCode,
    String? state,
    String? locality,
  }) async {
    final box = Hive.box(_syncQueueBox);
    final id = 'start_visit_${DateTime.now().millisecondsSinceEpoch}';
    final now = DateTime.now();

    final payload = {
      'visit_id': visitId,
      'user_id': userId,
      'start_location': startLocation,
      'started_at': now.toIso8601String(),
    };

    final queueItem = {
      'id': id,
      'type': 'start_visit',
      'data': payload,
      'timestamp': now.toIso8601String(),
      'synced': false,
    };
    await box.put(id, jsonEncode(queueItem));

    // Also update the cached visit locally
    await updateCachedSiteVisit(visitId, {
      'status': 'Ongoing',
      'visit_started_by': userId,
      'visit_started_at': now.toIso8601String(),
      '_category': 'ongoing',
    });

    // Save to OfflineDb for persistent draft storage
    try {
      final offlineDb = OfflineDb();
      final offlineVisit = OfflineSiteVisit(
        id: id,
        siteEntryId: visitId,
        siteName: siteName ?? 'Unknown Site',
        siteCode: siteCode ?? '',
        state: state ?? '',
        locality: locality ?? '',
        status: 'draft',
        startedAt: now,
        startLocation: startLocation.isNotEmpty ? startLocation : null,
        synced: false,
      );
      await offlineDb.saveSiteVisitOffline(offlineVisit);
      debugPrint('[queueStartVisit] Saved offline visit draft: $visitId');
    } catch (e) {
      debugPrint('[queueStartVisit] Error saving offline visit: $e');
    }

    return id;
  }

  /// Sync pending start visit operations
  Future<int> syncPendingStartVisits() async {
    if (!await isOnline()) return 0;

    final box = Hive.box(_syncQueueBox);
    int synced = 0;
    for (final key in box.keys.toList()) {
      final data = box.get(key);
      if (data == null) continue;
      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;
      if (queueItem['type'] != 'start_visit') continue;

      try {
        final payload = Map<String, dynamic>.from(queueItem['data']);
        final visitId = payload['visit_id'] as String;
        final userId = payload['user_id'] as String;
        final startedAt = payload['started_at'] as String;
        final startLocation = payload['start_location'] as Map<String, dynamic>;

        // First get existing additional_data
        final existing = await _supabase
            .from('mmp_site_entries')
            .select('additional_data')
            .eq('id', visitId)
            .maybeSingle();

        final existingData = (existing?['additional_data'] as Map<String, dynamic>?) ?? {};
        final mergedData = {
          ...existingData,
          'start_location': startLocation,
        };

        await _supabase.from('mmp_site_entries').update({
          'status': 'Ongoing',
          'visit_started_by': userId,
          'visit_started_at': startedAt,
          'additional_data': mergedData,
          'updated_at': DateTime.now().toIso8601String(),
        }).eq('id', visitId);

        // Mark as synced
        queueItem['synced'] = true;
        await box.put(key, jsonEncode(queueItem));
        await markSiteVisitSynced(visitId);
        synced++;

        debugPrint('Synced start visit: $visitId');
      } catch (e) {
        debugPrint('Error syncing start visit $key: $e');
      }
    }

    return synced;
  }

  // ==================== COMPLETE VISIT OFFLINE QUEUE ====================

  /// Queue a complete visit operation for later sync (photos handled separately)
  Future<String> queueCompleteVisit({
    required String visitId,
    required String userId,
    required Map<String, dynamic> endLocation,
    String? notes,
    String? activities,
    int? durationMinutes,
    List<String>? photoDataUrls, // base64 encoded photos
    String? siteName,
    String? siteCode,
    String? state,
    String? locality,
    Map<String, dynamic>? startLocation,
  }) async {
    final box = Hive.box(_syncQueueBox);
    final id = 'complete_visit_${DateTime.now().millisecondsSinceEpoch}';
    final now = DateTime.now();

    final payload = {
      'visit_id': visitId,
      'user_id': userId,
      'end_location': endLocation,
      'notes': notes,
      'activities': activities,
      'duration_minutes': durationMinutes,
      'completed_at': now.toIso8601String(),
      'photos': photoDataUrls ?? [],
    };

    final queueItem = {
      'id': id,
      'type': 'complete_visit',
      'data': payload,
      'timestamp': now.toIso8601String(),
      'synced': false,
    };
    await box.put(id, jsonEncode(queueItem));

    // Also update the cached visit locally
    await updateCachedSiteVisit(visitId, {
      'status': 'Completed',
      'visit_completed_by': userId,
      'visit_completed_at': now.toIso8601String(),
      '_category': 'completed',
    });

    // Update or create OfflineDb entry for persistent storage
    try {
      final offlineDb = OfflineDb();
      // Check if we have an existing draft for this site
      final existingDraft = offlineDb.getDraftForSite(visitId);
      
      if (existingDraft != null) {
        // Update existing draft to completed
        await offlineDb.updateSiteVisitOffline(
          existingDraft.id,
          status: 'completed',
          completedAt: now,
          endLocation: endLocation.isNotEmpty ? endLocation : null,
          photos: photoDataUrls,
          notes: notes,
        );
        debugPrint('[queueCompleteVisit] Updated draft to completed: $visitId');
      } else {
        // Create new completed visit entry
        final offlineVisit = OfflineSiteVisit(
          id: id,
          siteEntryId: visitId,
          siteName: siteName ?? 'Unknown Site',
          siteCode: siteCode ?? '',
          state: state ?? '',
          locality: locality ?? '',
          status: 'completed',
          startedAt: now.subtract(Duration(minutes: durationMinutes ?? 0)),
          completedAt: now,
          startLocation: startLocation,
          endLocation: endLocation.isNotEmpty ? endLocation : null,
          photos: photoDataUrls,
          notes: notes,
          synced: false,
        );
        await offlineDb.saveSiteVisitOffline(offlineVisit);
        debugPrint('[queueCompleteVisit] Created new completed visit: $visitId');
      }
    } catch (e) {
      debugPrint('[queueCompleteVisit] Error saving offline visit: $e');
    }

    return id;
  }

  /// Get pending actions count by type
  Future<Map<String, int>> getPendingActionsByType() async {
    final box = Hive.box(_syncQueueBox);
    final counts = <String, int>{};

    for (var key in box.keys) {
      final data = box.get(key);
      if (data == null) continue;

      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;

      final type = queueItem['type'] as String? ?? 'unknown';
      counts[type] = (counts[type] ?? 0) + 1;
    }

    return counts;
  }

  /// Get all pending visit IDs that have offline changes
  Future<Set<String>> getPendingVisitIds() async {
    final box = Hive.box(_syncQueueBox);
    final ids = <String>{};

    for (var key in box.keys) {
      final data = box.get(key);
      if (data == null) continue;

      final queueItem = Map<String, dynamic>.from(jsonDecode(data));
      if (queueItem['synced'] == true) continue;

      final type = queueItem['type'] as String?;
      if (type == 'accept_visit' || type == 'start_visit' || type == 'complete_visit' || type == 'visit_status') {
        final payload = queueItem['data'] as Map<String, dynamic>?;
        final visitId = payload?['visit_id'] as String?;
        if (visitId != null) {
          ids.add(visitId);
        }
      }
    }

    return ids;
  }

  /// Get all draft visit IDs (saved but not completed)
  Future<Set<String>> getDraftVisitIds() async {
    try {
      final db = OfflineDb();
      final drafts = db.getDraftSiteVisits();
      return drafts.map((d) => d.siteEntryId).toSet();
    } catch (e) {
      debugPrint('Error getting draft visit IDs: $e');
      return {};
    }
  }

  // ==================== WALLET CACHING ====================

  static const String _walletBox = 'wallet_cache';

  /// Cache wallet data for offline access
  Future<void> cacheWalletData(String key, Map<String, dynamic> data) async {
    try {
      if (!Hive.isBoxOpen(_walletBox)) {
        await Hive.openBox(_walletBox);
      }
      final box = Hive.box(_walletBox);
      await box.put(key, jsonEncode({
        'data': data,
        'cachedAt': DateTime.now().toIso8601String(),
      }));
    } catch (e) {
      debugPrint('Error caching wallet data: $e');
    }
  }

  /// Get cached wallet data
  Future<Map<String, dynamic>?> getCachedWalletData(String key) async {
    try {
      if (!Hive.isBoxOpen(_walletBox)) {
        await Hive.openBox(_walletBox);
      }
      final box = Hive.box(_walletBox);
      final cached = box.get(key);
      if (cached != null) {
        final decoded = Map<String, dynamic>.from(jsonDecode(cached));
        return Map<String, dynamic>.from(decoded['data']);
      }
    } catch (e) {
      debugPrint('Error getting cached wallet data: $e');
    }
    return null;
  }

  // ==================== PROFILE CACHING ====================

  static const String _profileBox = 'profile_cache';

  /// Cache user profile for offline access
  Future<void> cacheUserProfile(String userId, Map<String, dynamic> profile) async {
    try {
      if (!Hive.isBoxOpen(_profileBox)) {
        await Hive.openBox(_profileBox);
      }
      final box = Hive.box(_profileBox);
      await box.put(userId, jsonEncode({
        'data': profile,
        'cachedAt': DateTime.now().toIso8601String(),
      }));
    } catch (e) {
      debugPrint('Error caching user profile: $e');
    }
  }

  /// Get cached user profile
  Future<Map<String, dynamic>?> getCachedUserProfile(String userId) async {
    try {
      if (!Hive.isBoxOpen(_profileBox)) {
        await Hive.openBox(_profileBox);
      }
      final box = Hive.box(_profileBox);
      final cached = box.get(userId);
      if (cached != null) {
        final decoded = Map<String, dynamic>.from(jsonDecode(cached));
        return Map<String, dynamic>.from(decoded['data']);
      }
    } catch (e) {
      debugPrint('Error getting cached user profile: $e');
    }
    return null;
  }

  // ==================== COMPLETED VISITS CACHING ====================

  static const String _completedVisitsBox = 'completed_visits_cache';

  /// Cache completed visits for offline access
  Future<void> cacheCompletedVisits(String userId, List<Map<String, dynamic>> visits) async {
    try {
      if (!Hive.isBoxOpen(_completedVisitsBox)) {
        await Hive.openBox(_completedVisitsBox);
      }
      final box = Hive.box(_completedVisitsBox);
      await box.put(userId, jsonEncode({
        'data': visits,
        'cachedAt': DateTime.now().toIso8601String(),
      }));
    } catch (e) {
      debugPrint('Error caching completed visits: $e');
    }
  }

  /// Get cached completed visits
  Future<List<Map<String, dynamic>>> getCachedCompletedVisits(String userId) async {
    try {
      if (!Hive.isBoxOpen(_completedVisitsBox)) {
        await Hive.openBox(_completedVisitsBox);
      }
      final box = Hive.box(_completedVisitsBox);
      final cached = box.get(userId);
      if (cached != null) {
        final decoded = Map<String, dynamic>.from(jsonDecode(cached));
        final data = decoded['data'] as List;
        return data.map((e) => Map<String, dynamic>.from(e)).toList();
      }
    } catch (e) {
      debugPrint('Error getting cached completed visits: $e');
    }
    return [];
  }

  // ==================== WALLET STATS CACHING ====================

  /// Cache wallet stats for offline access
  Future<void> cacheWalletStats(String userId, Map<String, dynamic> stats) async {
    try {
      if (!Hive.isBoxOpen(_walletBox)) {
        await Hive.openBox(_walletBox);
      }
      final box = Hive.box(_walletBox);
      await box.put('stats_$userId', jsonEncode({
        'data': stats,
        'cachedAt': DateTime.now().toIso8601String(),
      }));
    } catch (e) {
      debugPrint('Error caching wallet stats: $e');
    }
  }

  /// Get cached wallet stats
  Future<Map<String, dynamic>?> getCachedWalletStats(String userId) async {
    try {
      if (!Hive.isBoxOpen(_walletBox)) {
        await Hive.openBox(_walletBox);
      }
      final box = Hive.box(_walletBox);
      final cached = box.get('stats_$userId');
      if (cached != null) {
        final decoded = Map<String, dynamic>.from(jsonDecode(cached));
        return Map<String, dynamic>.from(decoded['data']);
      }
    } catch (e) {
      debugPrint('Error getting cached wallet stats: $e');
    }
    return null;
  }

  // ==================== REPORTS CACHING (for Reports Screen) ====================

  static const String _reportsCacheBox = 'reports_cache';

  /// Cache reports data for offline access (keyed by userId)
  Future<void> cacheReports(String userId, Map<String, Map<String, dynamic>> reports) async {
    try {
      if (!Hive.isBoxOpen(_reportsCacheBox)) {
        await Hive.openBox(_reportsCacheBox);
      }
      final box = Hive.box(_reportsCacheBox);
      await box.put('reports_$userId', jsonEncode({
        'data': reports,
        'cachedAt': DateTime.now().toIso8601String(),
      }));
    } catch (e) {
      debugPrint('Error caching reports: $e');
    }
  }

  /// Get cached reports data
  Future<Map<String, Map<String, dynamic>>?> getCachedReportsData(String userId) async {
    try {
      if (!Hive.isBoxOpen(_reportsCacheBox)) {
        await Hive.openBox(_reportsCacheBox);
      }
      final box = Hive.box(_reportsCacheBox);
      final cached = box.get('reports_$userId');
      if (cached != null) {
        final decoded = Map<String, dynamic>.from(jsonDecode(cached));
        final data = decoded['data'] as Map<String, dynamic>;
        return data.map((key, value) => MapEntry(key, Map<String, dynamic>.from(value)));
      }
    } catch (e) {
      debugPrint('Error getting cached reports: $e');
    }
    return null;
  }

  // ==================== SITE LOCATIONS CACHING ====================

  static const String _siteLocationsCacheBox = 'site_locations_cache';

  /// Cache site locations for offline access
  Future<void> cacheSiteLocations(String userId, Map<String, Map<String, dynamic>> locations) async {
    try {
      if (!Hive.isBoxOpen(_siteLocationsCacheBox)) {
        await Hive.openBox(_siteLocationsCacheBox);
      }
      final box = Hive.box(_siteLocationsCacheBox);
      await box.put('locations_$userId', jsonEncode({
        'data': locations,
        'cachedAt': DateTime.now().toIso8601String(),
      }));
    } catch (e) {
      debugPrint('Error caching site locations: $e');
    }
  }

  /// Get cached site locations
  Future<Map<String, Map<String, dynamic>>?> getCachedSiteLocations(String userId) async {
    try {
      if (!Hive.isBoxOpen(_siteLocationsCacheBox)) {
        await Hive.openBox(_siteLocationsCacheBox);
      }
      final box = Hive.box(_siteLocationsCacheBox);
      final cached = box.get('locations_$userId');
      if (cached != null) {
        final decoded = Map<String, dynamic>.from(jsonDecode(cached));
        final data = decoded['data'] as Map<String, dynamic>;
        return data.map((key, value) => MapEntry(key, Map<String, dynamic>.from(value)));
      }
    } catch (e) {
      debugPrint('Error getting cached site locations: $e');
    }
    return null;
  }
}
