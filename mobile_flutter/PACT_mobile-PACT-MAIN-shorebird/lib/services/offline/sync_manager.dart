import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'offline_db.dart';
import 'models.dart';
import '../offline_data_service.dart';
import '../chat_service.dart';

typedef SyncProgressCallback = void Function(SyncProgress progress);
typedef SyncCompleteCallback = void Function(SyncResult result);
typedef NetworkChangeCallback = void Function(bool isOnline);

/// Core sync manager service for offline/online synchronization.
/// Handles site visits, locations, pending actions, conflict resolution, retries.
class SyncManager {
  static final SyncManager _instance = SyncManager._internal();

  factory SyncManager() {
    return _instance;
  }

  SyncManager._internal();

  final OfflineDb _db = OfflineDb();
  late final SupabaseClient _supabase;

  // Callbacks
  final List<SyncProgressCallback> _onProgressCallbacks = [];
  final List<SyncCompleteCallback> _onCompleteCallbacks = [];
  final List<NetworkChangeCallback> _onNetworkChangeCallbacks = [];

  // State
  bool _isSyncing = false;
  int _consecutiveFailures = 0;
  Timer? _retryTimer;
  Timer? _autoSyncTimer;

  // Configuration
  static const int maxRetries = 3;
  static const int maxRetryDelayMs = 60000; // 1 minute
  static const int autoSyncIntervalMs = 60000; // 1 minute

  void setSupabaseClient(SupabaseClient client) {
    _supabase = client;
  }

  bool get isSyncing => _isSyncing;
  bool get hasConsecutiveFailures => _consecutiveFailures > 0;

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  void onProgress(SyncProgressCallback callback) {
    _onProgressCallbacks.add(callback);
  }

  void onComplete(SyncCompleteCallback callback) {
    _onCompleteCallbacks.add(callback);
  }

  void onNetworkChange(NetworkChangeCallback callback) {
    _onNetworkChangeCallbacks.add(callback);
  }

  void _notifyProgress(SyncProgress progress) {
    for (final callback in _onProgressCallbacks) {
      callback(progress);
    }
  }

  void _notifyComplete(SyncResult result) {
    for (final callback in _onCompleteCallbacks) {
      callback(result);
    }
  }

  void _notifyNetworkChange(bool isOnline) {
    for (final callback in _onNetworkChangeCallbacks) {
      callback(isOnline);
    }
  }

  // ============================================================================
  // AUTO SYNC SETUP
  // ============================================================================

  /// Setup automatic syncing with interval and network change listeners
  void setupAutoSync(int intervalMs) {
    // Periodic sync
    _autoSyncTimer = Timer.periodic(Duration(milliseconds: intervalMs), (_) {
      syncAll();
    });

    // Listen to visibility changes (pause sync when app is backgrounded)
    // This would be handled by lifecycle listeners in the UI layer
  }

  void stopAutoSync() {
    _autoSyncTimer?.cancel();
    _autoSyncTimer = null;
  }

  // ============================================================================
  // MAIN SYNC ORCHESTRATION
  // ============================================================================

  /// Perform complete sync of all offline data
  Future<SyncResult> syncAll({bool force = false}) async {
    if (_isSyncing && !force) {
      return SyncResult(
        success: false,
        synced: 0,
        failed: 0,
        errors: ['Sync already in progress'],
        duration: 0,
        timestamp: DateTime.now(),
      );
    }

    _isSyncing = true;
    _db.setSyncInProgress(true);
    final startTime = DateTime.now();
    final errors = <String>[];
    int syncedCount = 0;
    int failedCount = 0;

    try {
      const totalPhases = 5;
      
      // Phase 1: Sync site visits
      _notifyProgress(SyncProgress(
        phase: 'site_visits',
        current: 1,
        total: totalPhases,
        percentage: 0,
        message: 'Syncing site visits...',
      ));
      final (siteSynced, siteFailed, siteErrors) = await _syncSiteVisits();
      syncedCount += siteSynced;
      failedCount += siteFailed;
      errors.addAll(siteErrors);

      // Phase 2: Sync locations
      _notifyProgress(SyncProgress(
        phase: 'locations',
        current: 2,
        total: totalPhases,
        percentage: 20,
        message: 'Syncing location data...',
      ));
      final (locSynced, locFailed, locErrors) = await _syncLocations();
      syncedCount += locSynced;
      failedCount += locFailed;
      errors.addAll(locErrors);

      // Phase 3: Sync pending actions
      _notifyProgress(SyncProgress(
        phase: 'pending_actions',
        current: 3,
        total: totalPhases,
        percentage: 40,
        message: 'Processing pending actions...',
      ));
      final (actionSynced, actionFailed, actionErrors) = await _syncPendingActions();
      syncedCount += actionSynced;
      failedCount += actionFailed;
      errors.addAll(actionErrors);

      // Phase 4: Sync chat messages
      _notifyProgress(SyncProgress(
        phase: 'chat_messages',
        current: 4,
        total: totalPhases,
        percentage: 60,
        message: 'Syncing messages...',
      ));
      final (chatSynced, chatFailed, chatErrors) = await _syncChatMessages();
      syncedCount += chatSynced;
      failedCount += chatFailed;
      errors.addAll(chatErrors);

      // Phase 5: Cleanup
      _notifyProgress(SyncProgress(
        phase: 'cleanup',
        current: 5,
        total: totalPhases,
        percentage: 80,
        message: 'Cleaning up...',
      ));
      await _cleanupExpiredData();
      
      // Final progress
      _notifyProgress(SyncProgress(
        phase: 'complete',
        current: totalPhases,
        total: totalPhases,
        percentage: 100,
        message: 'Sync complete',
      ));

      // Success
      _consecutiveFailures = 0;
      _db.setLastSyncTime(DateTime.now());

      final result = SyncResult(
        success: failedCount == 0,
        synced: syncedCount,
        failed: failedCount,
        errors: errors,
        duration: DateTime.now().difference(startTime).inMilliseconds,
        timestamp: DateTime.now(),
        details: {
          'siteVisits': siteSynced,
          'locations': locSynced,
          'pendingActions': actionSynced,
        },
      );

      _notifyComplete(result);
      return result;
    } catch (e) {
      _consecutiveFailures++;
      final result = SyncResult(
        success: false,
        synced: syncedCount,
        failed: failedCount,
        errors: [...errors, e.toString()],
        duration: DateTime.now().difference(startTime).inMilliseconds,
        timestamp: DateTime.now(),
      );
      _notifyComplete(result);

      // Schedule retry with exponential backoff
      _scheduleRetry();

      return result;
    } finally {
      _isSyncing = false;
      _db.setSyncInProgress(false);
    }
  }

  /// Force immediate sync, canceling any pending retries
  Future<SyncResult> forceSync() async {
    _retryTimer?.cancel();
    _consecutiveFailures = 0;
    return syncAll(force: true);
  }

  // ============================================================================
  // PHASE 1: SYNC SITE VISITS
  // ============================================================================

  Future<(int, int, List<String>)> _syncSiteVisits() async {
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    final unsyncedVisits = _db.getUnsyncedSiteVisits();

    for (int i = 0; i < unsyncedVisits.length; i++) {
      final visit = unsyncedVisits[i];

      try {
        // Check server state first
        final serverVisit = await _getServerSiteVisit(visit.siteEntryId);

        if (serverVisit != null && _isTerminalOrAdvancedStatus(serverVisit['status'])) {
          // Server is in a terminal state, skip update
          await _db.markSiteVisitSynced(visit.id);
          synced++;
        } else {
          // Perform conflict resolution
          final resolved = _resolveConflict(
            local: visit.toJson(),
            server: serverVisit,
            strategy: 'last_write_wins',
          );

          // Sync to server based on visit status
          if (visit.status == 'started') {
            await _syncSiteVisitStart(visit);
          } else if (visit.status == 'completed') {
            await _syncSiteVisitComplete(visit);
          }

          await _db.markSiteVisitSynced(visit.id);
          synced++;
        }
      } catch (e) {
        failed++;
        errors.add('Site visit sync failed: ${visit.id} - $e');
      }

      // Update progress
      _notifyProgress(SyncProgress(
        phase: 'site_visits',
        current: i + 1,
        total: unsyncedVisits.length,
        percentage: ((i + 1) / unsyncedVisits.length * 33),
        message: 'Syncing site visit ${i + 1}/${unsyncedVisits.length}',
      ));
    }

    return (synced, failed, errors);
  }

  Future<void> _syncSiteVisitStart(OfflineSiteVisit visit) async {
    await _supabase.from('mmp_site_entries').update({
      'status': 'in-progress',
      'visit_started_at': visit.startedAt.toIso8601String(),
      'additional_data': {
        'offline_start': true,
        'start_location': visit.startLocation,
      },
    }).eq('id', visit.siteEntryId);
  }

  Future<void> _syncSiteVisitComplete(OfflineSiteVisit visit) async {
    // Upload any photos first
    if (visit.photos != null && visit.photos!.isNotEmpty) {
      for (int i = 0; i < visit.photos!.length; i++) {
        final photoPath = visit.photos![i];
        // If it's base64, upload it
        if (photoPath.startsWith('data:image')) {
          // Extract base64 and upload
          final base64Data = photoPath.split(',').last;
          final fileName = '${visit.siteEntryId}_${DateTime.now().millisecondsSinceEpoch}_$i.jpg';
          await _uploadPhotoToStorage(base64Data, fileName, visit.siteEntryId);
        }
      }
    }

    // Update site visit
    await _supabase.from('mmp_site_entries').update({
      'status': 'completed',
      'visit_completed_at': visit.completedAt?.toIso8601String(),
      'additional_data': {
        'offline_complete': true,
        'end_location': visit.endLocation,
        'notes': visit.notes,
      },
    }).eq('id', visit.siteEntryId);

    // Create wallet transaction if visit is for a site claim
    await _createWalletTransactionIfNeeded(visit.siteEntryId);
  }

  // ============================================================================
  // PHASE 2: SYNC LOCATIONS
  // ============================================================================

  Future<(int, int, List<String>)> _syncLocations() async {
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    final unsyncedLocations = _db.getUnsyncedLocations();

    if (unsyncedLocations.isEmpty) {
      return (0, 0, <String>[]);
    }

    try {
      // Get latest location
      final latest = unsyncedLocations.last;

      // Update user profile with latest location
      final userId = latest.userId;
      await _supabase.from('profiles').update({
        'location': {
          'lat': latest.lat,
          'lng': latest.lng,
          'accuracy': latest.accuracy,
        },
        'last_location_update': DateTime.now().toIso8601String(),
      }).eq('id', userId);

      // Mark all as synced
      await _db.markLocationsSynced(unsyncedLocations.map((l) => l.id).toList());
      synced = unsyncedLocations.length;
    } catch (e) {
      failed = unsyncedLocations.length;
      errors.add('Location sync failed: $e');
    }

    _notifyProgress(SyncProgress(
      phase: 'locations',
      current: unsyncedLocations.length,
      total: unsyncedLocations.length,
      percentage: 66,
      message: 'Location sync complete',
    ));

    return (synced, failed, errors);
  }

  // ============================================================================
  // PHASE 3: SYNC PENDING ACTIONS
  // ============================================================================

  Future<(int, int, List<String>)> _syncPendingActions() async {
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    final pendingActions = _db.getPendingSyncActions(status: 'pending');

    for (int i = 0; i < pendingActions.length; i++) {
      final action = pendingActions[i];

      try {
        await _db.updateSyncActionStatus(action.id, status: 'syncing');

        bool success = false;
        String? errorMsg;

        switch (action.type) {
          case 'site_visit_claim':
            success = await _processClaim(action);
            break;
          case 'photo_upload':
            success = await _processPhotoUpload(action);
            break;
          case 'cost_submission':
            success = await _processCostSubmission(action);
            break;
          case 'location_update':
            success = await _processLocationUpdate(action);
            break;
          default:
            errorMsg = 'Unknown action type: ${action.type}';
            success = false;
        }

        if (success) {
          await _db.removeSyncAction(action.id);
          synced++;
        } else {
          action.retries++;
          if (action.retries >= maxRetries) {
            await _db.updateSyncActionStatus(action.id,
              status: 'failed',
              retries: action.retries,
              errorMessage: errorMsg,
            );
            failed++;
            if (errorMsg != null) errors.add(errorMsg);
          } else {
            await _db.updateSyncActionStatus(action.id,
              status: 'pending',
              retries: action.retries,
            );
          }
        }
      } catch (e) {
        failed++;
        action.retries++;
        await _db.updateSyncActionStatus(action.id,
          status: action.retries >= maxRetries ? 'failed' : 'pending',
          retries: action.retries,
          errorMessage: e.toString(),
        );
        errors.add('Action ${action.id} failed: $e');
      }

      // Update progress
      _notifyProgress(SyncProgress(
        phase: 'pending_actions',
        current: i + 1,
        total: pendingActions.length,
        percentage: 66 + ((i + 1) / pendingActions.length * 34),
        message: 'Processing action ${i + 1}/${pendingActions.length}',
      ));
    }

    // Also sync pending actions from OfflineDataService (accept_visit, start_visit, etc.)
    try {
      final offlineDataService = OfflineDataService();
      final offlineSyncResults = await offlineDataService.syncAll();
      
      // Count synced items from OfflineDataService
      for (final entry in offlineSyncResults.entries) {
        synced += entry.value;
      }
    } catch (e) {
      errors.add('OfflineDataService sync failed: $e');
    }

    return (synced, failed, errors);
  }

  // ============================================================================
  // PHASE 4: SYNC CHAT MESSAGES
  // ============================================================================

  Future<(int, int, List<String>)> _syncChatMessages() async {
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    try {
      final chatService = ChatService();
      final syncedCount = await chatService.syncPendingMessages();
      synced = syncedCount;
      
      if (syncedCount > 0) {
        debugPrint('[SyncManager] Synced $syncedCount chat messages');
      }
    } catch (e) {
      failed++;
      errors.add('Chat message sync failed: $e');
      debugPrint('[SyncManager] Error syncing chat messages: $e');
    }

    return (synced, failed, errors);
  }

  // ============================================================================
  // ACTION PROCESSORS
  // ============================================================================

  Future<bool> _processClaim(PendingSyncAction action) async {
    final payload = action.payload;
    final siteEntryId = payload['siteEntryId'] as String;
    final userId = payload['userId'] as String;

    // Update site entry status to claimed
    await _supabase.from('mmp_site_entries').update({
      'status': 'claimed',
      'claimed_by_user_id': userId,
      'claimed_at': DateTime.now().toIso8601String(),
    }).eq('id', siteEntryId);

    return true;
  }

  Future<bool> _processPhotoUpload(PendingSyncAction action) async {
    final payload = action.payload;
    final base64Data = payload['base64'] as String;
    final siteEntryId = payload['siteEntryId'] as String;
    final fileName = payload['fileName'] as String;

    final storagePath = await _uploadPhotoToStorage(base64Data, fileName, siteEntryId);

    // Update site entry with photo
    final response = await _supabase.from('mmp_site_entries').select().eq('id', siteEntryId).single();
    final additionalData = response['additional_data'] ?? {};
    final photos = List<String>.from(additionalData['photos'] ?? []);
    photos.add(storagePath);

    await _supabase.from('mmp_site_entries').update({
      'additional_data': {
        ...additionalData,
        'photos': photos,
      },
    }).eq('id', siteEntryId);

    return true;
  }

  Future<bool> _processCostSubmission(PendingSyncAction action) async {
    final payload = action.payload;

    await _supabase.from('cost_submissions').insert({
      'user_id': payload['userId'],
      'site_visit_id': payload['siteVisitId'],
      'amount': payload['amount'],
      'description': payload['description'],
      'category': payload['category'],
      'receipt_url': payload['receiptUrl'],
      'status': 'pending',
      'created_at': DateTime.now().toIso8601String(),
    });

    return true;
  }

  Future<bool> _processLocationUpdate(PendingSyncAction action) async {
    final payload = action.payload;

    await _supabase.from('profiles').update({
      'location': {
        'lat': payload['lat'],
        'lng': payload['lng'],
        'accuracy': payload['accuracy'],
      },
      'last_location_update': DateTime.now().toIso8601String(),
    }).eq('id', payload['userId']);

    return true;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  Future<Map<String, dynamic>?> _getServerSiteVisit(String id) async {
    try {
      final response = await _supabase.from('mmp_site_entries').select().eq('id', id).maybeSingle();
      return response;
    } catch (e) {
      return null;
    }
  }

  Future<String> _uploadPhotoToStorage(String base64Data, String fileName, String siteEntryId) async {
    // Decode base64 to bytes
    final bytes = base64Decode(base64Data);

    // Upload to storage
    final path = 'site-photos/$siteEntryId/$fileName';
    await _supabase.storage.from('site-visit-media').uploadBinary(path, bytes);

    // Get public URL
    final publicUrl = _supabase.storage.from('site-visit-media').getPublicUrl(path);
    return publicUrl;
  }

  Future<void> _createWalletTransactionIfNeeded(String siteEntryId) async {
    try {
      // Check if transaction already exists
      final existing = await _supabase
          .from('wallet_transactions')
          .select()
          .eq('reference_id', siteEntryId)
          .maybeSingle();

      if (existing != null) {
        return; // Transaction already created
      }

      // Get site entry to determine fee
      final site = await _supabase
          .from('mmp_site_entries')
          .select()
          .eq('id', siteEntryId)
          .single();

      // Create transaction (fee logic would go here)
      await _supabase.from('wallet_transactions').insert({
        'user_id': site['user_id'],
        'reference_id': siteEntryId,
        'type': 'visit_completion',
        'amount': 50, // Example fee
        'status': 'completed',
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      // Log but don't fail the sync
      print('Wallet transaction creation failed: $e');
    }
  }

  bool _isTerminalOrAdvancedStatus(String? status) {
    if (status == null) return false;
    final normalized = status.toLowerCase().replaceAll(RegExp(r'\s+'), '');
    final terminalStatuses = ['completed', 'cancelled', 'archived', 'rejected'];
    return terminalStatuses.contains(normalized);
  }

  Map<String, dynamic> _resolveConflict({
    required Map<String, dynamic> local,
    required Map<String, dynamic>? server,
    required String strategy,
  }) {
    if (server == null) {
      return local;
    }

    switch (strategy) {
      case 'client_wins':
        return local;
      case 'server_wins':
        return server;
      case 'last_write_wins':
      default:
        final localTime = DateTime.tryParse(local['syncedAt'] as String? ?? '');
        final serverTime = DateTime.tryParse(server['updated_at'] as String? ?? '');

        if (localTime != null && serverTime != null) {
          return localTime.isAfter(serverTime) ? local : server;
        }
        return local; // Default to local if can't determine
    }
  }

  Future<void> _cleanupExpiredData() async {
    // Clean expired caches
    await _db.cleanExpiredCache(OfflineDb.siteCacheBox);
    await _db.cleanExpiredCache(OfflineDb.mmpCacheBox);
    await _db.cleanExpiredCache(OfflineDb.notificationsCacheBox);

    // Clean old locations (> 30 days)
    await _db.clearOldLocations(daysOld: 30);
  }

  void _scheduleRetry() {
    if (_consecutiveFailures >= 3) {
      // Stop retrying after 3 failures
      return;
    }

    final delay = _calculateBackoff(_consecutiveFailures);
    _retryTimer = Timer(Duration(milliseconds: delay), () {
      syncAll();
    });
  }

  int _calculateBackoff(int failureCount) {
    // Exponential backoff with jitter
    final base = 1000 * (1 << failureCount); // 2^n seconds
    final jitter = (DateTime.now().millisecond % 1000).toInt();
    return (base + jitter).clamp(0, maxRetryDelayMs);
  }
}
