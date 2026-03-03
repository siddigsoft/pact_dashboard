import 'package:hive/hive.dart';
import 'package:flutter/foundation.dart';
import 'models.dart';
import 'hive_adapters.dart';

/// Offline database service using Hive for local storage.
/// Manages:
/// - pendingSync: Actions waiting to be synced
/// - siteVisits: Offline site visit data
/// - locations: Cached GPS locations
/// - requests: Queued HTTP requests
/// - caches: TTL-based caches for various data types
class OfflineDb {
  static final OfflineDb _instance = OfflineDb._internal();

  factory OfflineDb() {
    return _instance;
  }

  OfflineDb._internal();

  // Box names
  static const String pendingSyncBox = 'pending_sync';
  static const String siteVisitsBox = 'site_visits';
  static const String locationsBox = 'locations';
  static const String requestsBox = 'offline_requests';
  static const String siteCacheBox = 'site_cache';
  static const String mmpCacheBox = 'mmp_cache';
  static const String notificationsCacheBox = 'notifications_cache';
  static const String chatCacheBox = 'chat_cache';
  static const String projectsCacheBox = 'projects_cache';
  static const String walletCacheBox = 'wallet_cache';
  static const String budgetCacheBox = 'budget_cache';
  static const String reportsCacheBox = 'reports_cache';
  static const String profileCacheBox = 'profile_cache';
  static const String metadataBox = 'offline_metadata';

  late Box<PendingSyncAction> _pendingSync;
  late Box<OfflineSiteVisit> _siteVisits;
  late Box<CachedLocation> _locations;
  late Box<QueuedRequest> _requests;
  late Box<CachedItem> _siteCache;
  late Box<CachedItem> _mmpCache;
  late Box<CachedItem> _notificationsCache;
  late Box<CachedItem> _chatCache;
  late Box<CachedItem> _projectsCache;
  late Box<CachedItem> _walletCache;
  late Box<CachedItem> _budgetCache;
  late Box<CachedItem> _reportsCache;
  late Box<CachedItem> _profileCache;
  late Box<dynamic> _metadata;

  /// Initialize all Hive boxes
  /// Hive adapters are registered here to ensure they're available for all entry points
  Future<void> init() async {
    // Register adapters (idempotent - checks if already registered)
    // This ensures adapters are available regardless of entry point (main, background, tests)
    registerHiveAdapters();

    // Open boxes
    _pendingSync = await Hive.openBox<PendingSyncAction>(pendingSyncBox);
    _siteVisits = await Hive.openBox<OfflineSiteVisit>(siteVisitsBox);
    _locations = await Hive.openBox<CachedLocation>(locationsBox);
    _requests = await Hive.openBox<QueuedRequest>(requestsBox);
    _siteCache = await Hive.openBox<CachedItem>(siteCacheBox);
    _mmpCache = await Hive.openBox<CachedItem>(mmpCacheBox);
    _notificationsCache = await Hive.openBox<CachedItem>(notificationsCacheBox);
    _chatCache = await Hive.openBox<CachedItem>(chatCacheBox);
    _projectsCache = await Hive.openBox<CachedItem>(projectsCacheBox);
    _walletCache = await Hive.openBox<CachedItem>(walletCacheBox);
    _budgetCache = await Hive.openBox<CachedItem>(budgetCacheBox);
    _reportsCache = await Hive.openBox<CachedItem>(reportsCacheBox);
    _profileCache = await Hive.openBox<CachedItem>(profileCacheBox);
    _metadata = await Hive.openBox(metadataBox);
  }

  // ============================================================================
  // PENDING SYNC ACTIONS
  // ============================================================================

  Future<void> addPendingSync(PendingSyncAction action) async {
    await _pendingSync.put(action.id, action);
  }

  List<PendingSyncAction> getPendingSyncActions({
    String? type,
    String? status,
  }) {
    var actions = _pendingSync.values.toList();
    if (type != null) {
      actions = actions.where((a) => a.type == type).toList();
    }
    if (status != null) {
      actions = actions.where((a) => a.status == status).toList();
    }

    // Debug: Print pending sync actions
    debugPrint(
      '[OfflineDb] Found ${actions.length} pending sync actions (type: ${type ?? 'all'}, status: ${status ?? 'all'}):',
    );
    for (final action in actions) {
      debugPrint(
        '[OfflineDb]   - Action ID: ${action.id}, Type: ${action.type}, Status: ${action.status}',
      );
      debugPrint(
        '[OfflineDb]     Retries: ${action.retries}, Timestamp: ${action.timestamp}',
      );
      if (action.type == 'site_visit_complete') {
        debugPrint('[OfflineDb]     Visit ID: ${action.payload['visit_id']}');
        debugPrint(
          '[OfflineDb]     Notes: ${action.payload['notes'] ?? 'none'}',
        );
        debugPrint(
          '[OfflineDb]     Photos: ${(action.payload['photos'] as List?)?.length ?? 0}',
        );
      }
    }

    return actions;
  }

  PendingSyncAction? getPendingSyncAction(String id) {
    return _pendingSync.get(id);
  }

  /// Returns the payload of the first site_visit_complete action for this site entry (any status), or null.
  /// Used during sync to get user_id, activities, duration_minutes, photos for report creation.
  Map<String, dynamic>? getCompleteVisitPayloadForSite(String siteEntryId) {
    final actions = _pendingSync.values
        .where((a) => a.type == 'site_visit_complete')
        .toList();
    for (final a in actions) {
      if (a.payload['visit_id'] == siteEntryId) return a.payload;
    }
    return null;
  }

  Future<void> updateSyncActionStatus(
    String id, {
    required String status,
    int? retries,
    String? errorMessage,
  }) async {
    final action = _pendingSync.get(id);
    if (action != null) {
      action.status = status;
      if (retries != null) action.retries = retries;
      if (errorMessage != null) action.errorMessage = errorMessage;
      await action.save();
    }
  }

  Future<void> removeSyncAction(String id) async {
    await _pendingSync.delete(id);
  }

  Future<void> requeueFailedAction(String id) async {
    final action = _pendingSync.get(id);
    if (action != null) {
      action.status = 'pending';
      action.errorMessage = null;
      await action.save();
    }
  }

  Future<void> requeueAllFailedActions() async {
    final failed = getPendingSyncActions(status: 'failed');
    for (final action in failed) {
      action.status = 'pending';
      action.errorMessage = null;
      await action.save();
    }
  }

  // ============================================================================
  // SITE VISITS
  // ============================================================================

  Future<void> saveSiteVisitOffline(OfflineSiteVisit visit) async {
    await _siteVisits.put(visit.id, visit);
  }

  OfflineSiteVisit? getOfflineSiteVisit(String id) {
    return _siteVisits.get(id);
  }

  /// Get unsynced site visits that are ready to sync (excludes drafts)
  List<OfflineSiteVisit> getUnsyncedSiteVisits() {
    final unsynced = _siteVisits.values
        .where((v) => !v.synced && v.status != 'draft')
        .toList();

    // Debug: Print all unsynced visits
    debugPrint('[OfflineDb] Found ${unsynced.length} unsynced site visits:');
    for (final visit in unsynced) {
      debugPrint(
        '[OfflineDb]   - Visit ID: ${visit.id}, Site: ${visit.siteEntryId}, Status: ${visit.status}, Synced: ${visit.synced}',
      );
      debugPrint(
        '[OfflineDb]     Notes: ${visit.notes ?? 'none'}, Photos: ${visit.photos?.length ?? 0}',
      );
      debugPrint(
        '[OfflineDb]     Started: ${visit.startedAt}, Completed: ${visit.completedAt}',
      );
    }

    return unsynced;
  }

  List<OfflineSiteVisit> getAllSiteVisits() {
    return _siteVisits.values.toList();
  }

  /// Get all draft site visits (not yet completed, saved for later)
  List<OfflineSiteVisit> getDraftSiteVisits() {
    return _siteVisits.values.where((v) => v.status == 'draft').toList();
  }

  /// Get all pending site visits (not yet synced - includes drafts and completed)
  List<OfflineSiteVisit> getPendingSiteVisits() {
    return _siteVisits.values.where((v) => !v.synced).toList();
  }

  /// Get draft for a specific site entry
  OfflineSiteVisit? getDraftForSite(String siteEntryId) {
    try {
      return _siteVisits.values.firstWhere(
        (v) => v.siteEntryId == siteEntryId && v.status == 'draft',
      );
    } catch (e) {
      return null;
    }
  }

  /// Get completed but unsynced visits (ready to sync when online)
  List<OfflineSiteVisit> getCompletedUnsyncedVisits() {
    final completed = _siteVisits.values
        .where((v) => v.status == 'completed' && !v.synced)
        .toList();

    // Debug: Print all completed unsynced visits
    debugPrint(
      '[OfflineDb] Found ${completed.length} completed unsynced visits:',
    );
    for (final visit in completed) {
      debugPrint(
        '[OfflineDb]   - Visit ID: ${visit.id}, Site: ${visit.siteEntryId}',
      );
      debugPrint(
        '[OfflineDb]     Site Name: ${visit.siteName}, Code: ${visit.siteCode}',
      );
      debugPrint('[OfflineDb]     Notes: ${visit.notes ?? 'none'}');
      debugPrint('[OfflineDb]     Photos: ${visit.photos?.length ?? 0} photos');
      debugPrint(
        '[OfflineDb]     Started: ${visit.startedAt}, Completed: ${visit.completedAt}',
      );
      debugPrint('[OfflineDb]     Start Location: ${visit.startLocation}');
      debugPrint('[OfflineDb]     End Location: ${visit.endLocation}');
    }

    return completed;
  }

  Future<void> updateSiteVisitOffline(
    String id, {
    required String status,
    DateTime? completedAt,
    Map<String, dynamic>? endLocation,
    List<String>? photos,
    String? notes,
  }) async {
    final visit = _siteVisits.get(id);
    if (visit != null) {
      visit.status = status;
      if (completedAt != null) visit.completedAt = completedAt;
      if (endLocation != null) visit.endLocation = endLocation;
      if (photos != null) visit.photos = photos;
      if (notes != null) visit.notes = notes;
      await visit.save();
    }
  }

  Future<void> markSiteVisitSynced(String id, {DateTime? syncedAt}) async {
    final visit = _siteVisits.get(id);
    if (visit != null) {
      visit.synced = true;
      visit.syncedAt = syncedAt ?? DateTime.now();
      await visit.save();
    }
  }

  Future<void> deleteSiteVisit(String id) async {
    await _siteVisits.delete(id);
  }

  // ============================================================================
  // BUSINESS LOGIC METHODS (replaces OfflineDataService)
  // ============================================================================

  /// Queue a start visit operation using PendingSyncAction
  Future<String> queueStartVisit({
    required String visitId,
    required String userId,
    required Map<String, dynamic> startLocation,
    String? siteName,
    String? siteCode,
    String? state,
    String? locality,
  }) async {
    final id = 'start_visit_${DateTime.now().millisecondsSinceEpoch}';
    final now = DateTime.now();

    final syncAction = PendingSyncAction(
      id: id,
      type: 'site_visit_start',
      payload: {
        'visit_id': visitId,
        'user_id': userId,
        'start_location': startLocation,
        'started_at': now.toIso8601String(),
      },
      timestamp: now.millisecondsSinceEpoch,
      status: 'pending',
    );
    await addPendingSync(syncAction);

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
    await saveSiteVisitOffline(offlineVisit);

    return id;
  }

  /// Queue a complete visit operation using PendingSyncAction
  Future<String> queueCompleteVisit({
    required String visitId,
    required String userId,
    required Map<String, dynamic> endLocation,
    String? notes,
    String? activities,
    int? durationMinutes,
    List<String>? photoDataUrls,
    String? siteName,
    String? siteCode,
    String? state,
    String? locality,
    Map<String, dynamic>? startLocation,
  }) async {
    final id = 'complete_visit_${DateTime.now().millisecondsSinceEpoch}';
    final now = DateTime.now();

    debugPrint('[OfflineDb] queueCompleteVisit called for visit: $visitId');
    debugPrint(
      '[OfflineDb]   Notes: $notes, Photos: ${photoDataUrls?.length ?? 0}',
    );

    // Create PendingSyncAction for sync queue
    final syncAction = PendingSyncAction(
      id: id,
      type: 'site_visit_complete',
      payload: {
        'visit_id': visitId,
        'user_id': userId,
        'end_location': endLocation,
        'notes': notes,
        'activities': activities,
        'duration_minutes': durationMinutes,
        'completed_at': now.toIso8601String(),
        'photos': photoDataUrls ?? [],
      },
      timestamp: now.millisecondsSinceEpoch,
      status: 'pending',
    );
    await addPendingSync(syncAction);
    debugPrint(
      '[OfflineDb] Created PendingSyncAction: $id (type: site_visit_complete)',
    );

    // Update or create OfflineDb entry
    final existingDraft = getDraftForSite(visitId);

    if (existingDraft != null) {
      await updateSiteVisitOffline(
        existingDraft.id,
        status: 'completed',
        completedAt: now,
        endLocation: endLocation.isNotEmpty ? endLocation : null,
        photos: photoDataUrls,
        notes: notes,
      );
    } else {
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
      await saveSiteVisitOffline(offlineVisit);
    }

    return id;
  }

  /// Queue an accept visit operation using PendingSyncAction
  /// This replaces OfflineDataService.queueAcceptVisit()
  Future<String> queueAcceptVisit({
    required String visitId,
    required String userId,
    Map<String, dynamic>? locationData,
  }) async {
    final id = 'accept_visit_${DateTime.now().millisecondsSinceEpoch}';
    final now = DateTime.now();

    // Create PendingSyncAction for sync queue
    final syncAction = PendingSyncAction(
      id: id,
      type: 'site_visit_accept',
      payload: {
        'visit_id': visitId,
        'user_id': userId,
        'accepted_at': now.toIso8601String(),
        'location_data': ?locationData,
      },
      timestamp: now.millisecondsSinceEpoch,
      status: 'pending',
    );
    await addPendingSync(syncAction);

    return id;
  }

  /// Get pending actions count by type
  Map<String, int> getPendingActionsByType() {
    final actions = getPendingSyncActions(status: 'pending');
    final counts = <String, int>{};
    for (final action in actions) {
      counts[action.type] = (counts[action.type] ?? 0) + 1;
    }
    return counts;
  }

  /// Get all pending visit IDs that have offline changes
  Set<String> getPendingVisitIds() {
    final actions = getPendingSyncActions(status: 'pending');
    final ids = <String>{};
    for (final action in actions) {
      final type = action.type;
      if (type == 'site_visit_accept' ||
          type == 'site_visit_start' ||
          type == 'site_visit_complete') {
        final visitId = action.payload['visit_id'] as String?;
        if (visitId != null) {
          ids.add(visitId);
        }
      }
    }
    return ids;
  }

  /// Get all draft visit IDs (saved but not completed)
  Set<String> getDraftVisitIds() {
    final drafts = getDraftSiteVisits();
    return drafts.map((d) => d.siteEntryId).toSet();
  }

  /// Get total count of pending sync actions
  int getPendingSyncCount() {
    return getPendingSyncActions(status: 'pending').length;
  }

  // ============================================================================
  // LOCATIONS
  // ============================================================================

  Future<void> saveLocationOffline(CachedLocation location) async {
    await _locations.put(location.id, location);
  }

  List<CachedLocation> getUnsyncedLocations({String? userId}) {
    var locations = _locations.values.where((l) => !l.synced).toList();
    if (userId != null) {
      locations = locations.where((l) => l.userId == userId).toList();
    }
    return locations;
  }

  List<CachedLocation> getAllLocations({String? userId}) {
    var locations = _locations.values.toList();
    if (userId != null) {
      locations = locations.where((l) => l.userId == userId).toList();
    }
    // Return sorted by timestamp descending (most recent first)
    locations.sort((a, b) => b.timestamp.compareTo(a.timestamp));
    return locations;
  }

  CachedLocation? getLatestLocation({String? userId}) {
    final locations = getAllLocations(userId: userId);
    return locations.isNotEmpty ? locations.first : null;
  }

  Future<void> markLocationsSynced(
    List<String> ids, {
    DateTime? syncedAt,
  }) async {
    for (final id in ids) {
      final location = _locations.get(id);
      if (location != null) {
        location.synced = true;
        await location.save();
      }
    }
  }

  Future<void> deleteLocation(String id) async {
    await _locations.delete(id);
  }

  Future<void> clearOldLocations({int daysOld = 30}) async {
    final cutoffTime = DateTime.now()
        .subtract(Duration(days: daysOld))
        .millisecondsSinceEpoch;
    final oldLocations = _locations.values
        .where((l) => l.timestamp < cutoffTime)
        .toList();
    for (final loc in oldLocations) {
      await loc.delete();
    }
  }

  // ============================================================================
  // OFFLINE REQUESTS QUEUE
  // ============================================================================

  Future<void> queueRequest(QueuedRequest request) async {
    await _requests.put(request.id, request);
  }

  List<QueuedRequest> getQueuedRequests({String? status}) {
    var requests = _requests.values.toList();
    if (status != null) {
      requests = requests.where((r) => r.status == status).toList();
    }
    return requests;
  }

  QueuedRequest? getQueuedRequest(String id) {
    return _requests.get(id);
  }

  Future<void> updateRequestStatus(
    String id, {
    required String status,
    int? retries,
    String? errorMessage,
  }) async {
    final request = _requests.get(id);
    if (request != null) {
      request.status = status;
      if (retries != null) request.retries = retries;
      if (errorMessage != null) request.errorMessage = errorMessage;
      await request.save();
    }
  }

  Future<void> removeRequest(String id) async {
    await _requests.delete(id);
  }

  Future<void> clearQueue() async {
    await _requests.clear();
  }

  // ============================================================================
  // GENERIC CACHING (TTL-BASED)
  // ============================================================================

  Future<void> cacheItem(
    String boxName,
    String key, {
    required Map<String, dynamic> data,
    Duration? ttl,
    String? version,
  }) async {
    final box = _getCache(boxName);
    final expiresAt = ttl != null
        ? DateTime.now().add(ttl).millisecondsSinceEpoch
        : null;
    final item = CachedItem(
      key: key,
      data: data,
      cachedAt: DateTime.now().millisecondsSinceEpoch,
      expiresAt: expiresAt,
      version: version,
    );
    await box.put(key, item);
  }

  CachedItem? getCachedItem(String boxName, String key) {
    final box = _getCache(boxName);
    final item = box.get(key);
    if (item != null && item.isExpired) {
      box.delete(key);
      return null;
    }
    return item;
  }

  Future<void> removeCachedItem(String boxName, String key) async {
    final box = _getCache(boxName);
    await box.delete(key);
  }

  Future<void> cleanExpiredCache(String boxName) async {
    final box = _getCache(boxName);
    final expiredKeys = <String>[];
    for (final item in box.values) {
      if (item.isExpired) {
        expiredKeys.add(item.key);
      }
    }
    for (final key in expiredKeys) {
      await box.delete(key);
    }
  }

  Future<void> clearCache(String boxName) async {
    final box = _getCache(boxName);
    await box.clear();
  }

  Box<CachedItem> _getCache(String boxName) {
    switch (boxName) {
      case siteCacheBox:
        return _siteCache;
      case mmpCacheBox:
        return _mmpCache;
      case notificationsCacheBox:
        return _notificationsCache;
      case chatCacheBox:
        return _chatCache;
      case projectsCacheBox:
        return _projectsCache;
      case walletCacheBox:
        return _walletCache;
      case budgetCacheBox:
        return _budgetCache;
      case reportsCacheBox:
        return _reportsCache;
      case profileCacheBox:
        return _profileCache;
      default:
        throw Exception('Unknown cache box: $boxName');
    }
  }

  // ============================================================================
  // METADATA
  // ============================================================================

  Future<void> setLastSyncTime(DateTime time) async {
    await _metadata.put('lastSyncTime', time.toIso8601String());
  }

  DateTime? getLastSyncTime() {
    final timeStr = _metadata.get('lastSyncTime');
    if (timeStr != null) {
      return DateTime.tryParse(timeStr);
    }
    return null;
  }

  Future<void> setSyncInProgress(bool value) async {
    await _metadata.put('syncInProgress', value);
  }

  bool isSyncInProgress() {
    return _metadata.get('syncInProgress') ?? false;
  }

  // ============================================================================
  // STATISTICS & DIAGNOSTICS
  // ============================================================================

  OfflineStats getOfflineStats({required bool isOnline}) {
    return OfflineStats(
      pendingActions: _pendingSync.length,
      unsyncedVisits: getUnsyncedSiteVisits().length,
      unsyncedLocations: getUnsyncedLocations().length,
      cachedSites: _siteCache.length,
      cachedMMPs: _mmpCache.length,
      queuedRequests: getQueuedRequests(status: 'pending').length,
      lastSyncTime: getLastSyncTime(),
      isOnline: isOnline,
    );
  }

  /// Debug info for logging
  Map<String, dynamic> getDiagnostics() {
    return {
      'pendingSync': {
        'total': _pendingSync.length,
        'pending': getPendingSyncActions(status: 'pending').length,
        'syncing': getPendingSyncActions(status: 'syncing').length,
        'failed': getPendingSyncActions(status: 'failed').length,
      },
      'siteVisits': {
        'total': _siteVisits.length,
        'unsynced': getUnsyncedSiteVisits().length,
        'synced': _siteVisits.values.where((v) => v.synced).length,
      },
      'locations': {
        'total': _locations.length,
        'unsynced': getUnsyncedLocations().length,
        'synced': _locations.values.where((l) => l.synced).length,
      },
      'requests': {
        'total': _requests.length,
        'pending': getQueuedRequests(status: 'pending').length,
        'failed': getQueuedRequests(status: 'failed').length,
      },
      'caches': {
        'sites': _siteCache.length,
        'mmps': _mmpCache.length,
        'notifications': _notificationsCache.length,
        'chat': _chatCache.length,
        'projects': _projectsCache.length,
        'wallets': _walletCache.length,
        'budgets': _budgetCache.length,
      },
      'lastSyncTime': getLastSyncTime()?.toIso8601String(),
      'syncInProgress': isSyncInProgress(),
    };
  }

  // ============================================================================
  // CLEANUP & RESET
  // ============================================================================

  Future<void> clearAllData() async {
    await _pendingSync.clear();
    await _siteVisits.clear();
    await _locations.clear();
    await _requests.clear();
    await _siteCache.clear();
    await _mmpCache.clear();
    await _notificationsCache.clear();
    await _chatCache.clear();
    await _projectsCache.clear();
    await _walletCache.clear();
    await _budgetCache.clear();
    await _metadata.clear();
  }

  Future<void> close() async {
    await _pendingSync.close();
    await _siteVisits.close();
    await _locations.close();
    await _requests.close();
    await _siteCache.close();
    await _mmpCache.close();
    await _notificationsCache.close();
    await _chatCache.close();
    await _projectsCache.close();
    await _walletCache.close();
    await _budgetCache.close();
    await _metadata.close();
  }
}
