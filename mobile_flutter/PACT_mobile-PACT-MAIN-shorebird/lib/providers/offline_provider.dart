import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/offline/offline_db.dart';
import '../services/offline/sync_manager.dart';
import '../services/offline/offline_queue.dart';
import '../services/offline/models.dart';

// ============================================================================
// CORE SERVICE PROVIDERS
// ============================================================================

final offlineDbProvider = Provider((ref) {
  return OfflineDb();
});

final syncManagerProvider = Provider((ref) {
  final supabase = Supabase.instance.client;
  final syncManager = SyncManager();
  syncManager.setSupabaseClient(supabase);
  return syncManager;
});

final offlineQueueProvider = Provider((ref) {
  final supabase = Supabase.instance.client;
  final queue = OfflineQueue();
  queue.setSupabaseClient(supabase);
  return queue;
});

// ============================================================================
// NETWORK STATUS PROVIDER
// ============================================================================

final networkStatusProvider = StreamProvider<bool>((ref) async* {
  // This would integrate with connectivity_plus or similar
  // For now, we'll just check online status
  yield !DateTime.now().second.isEven; // Placeholder: always online for demo
  
  // Real implementation:
  // yield* Connectivity().onConnectivityChanged
  //     .map((result) => result != ConnectivityResult.none);
});

// ============================================================================
// OFFLINE STATISTICS PROVIDER
// ============================================================================

final offlineStatsProvider = FutureProvider<OfflineStats>((ref) async {
  final db = ref.watch(offlineDbProvider);
  final network = await ref.watch(networkStatusProvider.future);
  return db.getOfflineStats(isOnline: network);
});

final offlineStatsStreamProvider = StreamProvider<OfflineStats>((ref) async* {
  final db = ref.watch(offlineDbProvider);
  
  while (true) {
    final network = !DateTime.now().second.isEven; // Placeholder
    final stats = db.getOfflineStats(isOnline: network);
    yield stats;
    await Future.delayed(const Duration(seconds: 2));
  }
});

// ============================================================================
// PENDING SYNC ACTIONS PROVIDERS
// ============================================================================

final pendingSyncActionsProvider = FutureProvider<List<PendingSyncAction>>((ref) async {
  final db = ref.watch(offlineDbProvider);
  return db.getPendingSyncActions();
});

final pendingSyncActionsStreamProvider = StreamProvider<List<PendingSyncAction>>((ref) async* {
  final db = ref.watch(offlineDbProvider);
  
  while (true) {
    final actions = db.getPendingSyncActions();
    yield actions;
    await Future.delayed(const Duration(seconds: 1));
  }
});

// ============================================================================
// SITE VISITS PROVIDERS
// ============================================================================

final offlineSiteVisitsProvider = FutureProvider<List<OfflineSiteVisit>>((ref) async {
  final db = ref.watch(offlineDbProvider);
  return db.getAllSiteVisits();
});

final offlineSiteVisitsStreamProvider = StreamProvider<List<OfflineSiteVisit>>((ref) async* {
  final db = ref.watch(offlineDbProvider);
  
  while (true) {
    final visits = db.getAllSiteVisits();
    yield visits;
    await Future.delayed(const Duration(seconds: 1));
  }
});

// ============================================================================
// LOCATIONS PROVIDERS
// ============================================================================

final offlineLocationsProvider = FutureProvider<List<CachedLocation>>((ref) async {
  final db = ref.watch(offlineDbProvider);
  final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
  return db.getAllLocations(userId: userId);
});

final latestLocationProvider = FutureProvider<CachedLocation?>((ref) async {
  final db = ref.watch(offlineDbProvider);
  final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
  return db.getLatestLocation(userId: userId);
});

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/// Family provider for syncing with different strategies
final syncNotifierProvider = StateNotifierProvider<SyncNotifier, AsyncValue<SyncResult>>((ref) {
  final syncManager = ref.watch(syncManagerProvider);
  return SyncNotifier(syncManager);
});

class SyncNotifier extends StateNotifier<AsyncValue<SyncResult>> {
  final SyncManager _syncManager;

  SyncNotifier(this._syncManager) : super(const AsyncValue.loading()) {
    // Initialize with empty state
    state = AsyncValue.data(
      SyncResult(
        success: true,
        synced: 0,
        failed: 0,
        errors: [],
        duration: 0,
        timestamp: null,
      ),
    );
  }

  Future<void> syncNow({bool force = false}) async {
    state = const AsyncValue.loading();
    try {
      final result = await _syncManager.syncAll(force: force);
      state = AsyncValue.data(result);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> forceSync() => syncNow(force: true);
}

// ============================================================================
// OFFLINE ACTIONS
// ============================================================================

/// Start a site visit offline
final startSiteVisitOfflineProvider = FutureProvider.autoDispose
    .family<String, ({String siteEntryId, String siteName, String siteCode, String state, String locality})>((ref, params) async {
  final db = ref.watch(offlineDbProvider);
  final syncManager = ref.watch(syncManagerProvider);

  final visitId = const Uuid().v4();
  final now = DateTime.now();

  // Save visit locally
  final visit = OfflineSiteVisit(
    id: visitId,
    siteEntryId: params.siteEntryId,
    siteName: params.siteName,
    siteCode: params.siteCode,
    state: params.state,
    locality: params.locality,
    status: 'started',
    startedAt: now,
  );
  await db.saveSiteVisitOffline(visit);

  // Add pending sync action
  await db.addPendingSync(PendingSyncAction(
    id: const Uuid().v4(),
    type: 'site_visit_start',
    payload: {
      'siteEntryId': params.siteEntryId,
      'userId': Supabase.instance.client.auth.currentUser?.id ?? '',
      'startedAt': now.toIso8601String(),
    },
    timestamp: DateTime.now().millisecondsSinceEpoch,
  ));

  // Trigger sync
  syncManager.forceSync();

  return visitId;
});

/// Complete a site visit offline
final completeSiteVisitOfflineProvider = FutureProvider.autoDispose
    .family<void, ({String visitId, String? notes, List<String>? photos})>((ref, params) async {
  final db = ref.watch(offlineDbProvider);
  final syncManager = ref.watch(syncManagerProvider);

  // Update visit
  await db.updateSiteVisitOffline(
    params.visitId,
    status: 'completed',
    completedAt: DateTime.now(),
    notes: params.notes,
    photos: params.photos,
  );

  // Add pending sync action
  final visit = db.getOfflineSiteVisit(params.visitId);
  if (visit != null) {
    await db.addPendingSync(PendingSyncAction(
      id: const Uuid().v4(),
      type: 'site_visit_complete',
      payload: {
        'siteEntryId': visit.siteEntryId,
        'userId': Supabase.instance.client.auth.currentUser?.id ?? '',
        'completedAt': DateTime.now().toIso8601String(),
        'notes': params.notes,
      },
      timestamp: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  // Trigger sync
  syncManager.forceSync();
});

/// Claim a site visit offline
final claimSiteOfflineProvider = FutureProvider.autoDispose
    .family<void, String>((ref, siteEntryId) async {
  final db = ref.watch(offlineDbProvider);
  final syncManager = ref.watch(syncManagerProvider);

  await db.addPendingSync(PendingSyncAction(
    id: const Uuid().v4(),
    type: 'site_visit_claim',
    payload: {
      'siteEntryId': siteEntryId,
      'userId': Supabase.instance.client.auth.currentUser?.id ?? '',
    },
    timestamp: DateTime.now().millisecondsSinceEpoch,
  ));

  syncManager.forceSync();
});

/// Accept an assignment offline
final acceptAssignmentOfflineProvider = FutureProvider.autoDispose
    .family<void, String>((ref, siteEntryId) async {
  final db = ref.watch(offlineDbProvider);
  final syncManager = ref.watch(syncManagerProvider);

  await db.addPendingSync(PendingSyncAction(
    id: const Uuid().v4(),
    type: 'assignment_accept',
    payload: {
      'siteEntryId': siteEntryId,
      'userId': Supabase.instance.client.auth.currentUser?.id ?? '',
    },
    timestamp: DateTime.now().millisecondsSinceEpoch,
  ));

  syncManager.forceSync();
});

/// Queue a photo upload
final queuePhotoUploadProvider = FutureProvider.autoDispose
    .family<void, ({String base64Data, String fileName, String siteEntryId})>((ref, params) async {
  final db = ref.watch(offlineDbProvider);
  final syncManager = ref.watch(syncManagerProvider);

  await db.addPendingSync(PendingSyncAction(
    id: const Uuid().v4(),
    type: 'photo_upload',
    payload: {
      'base64': params.base64Data,
      'fileName': params.fileName,
      'siteEntryId': params.siteEntryId,
    },
    timestamp: DateTime.now().millisecondsSinceEpoch,
  ));

  syncManager.forceSync();
});

/// Save a location for offline tracking
final saveLocationOfflineProvider = FutureProvider.autoDispose
    .family<void, ({double lat, double lng, double? accuracy})>((ref, params) async {
  final db = ref.watch(offlineDbProvider);
  final userId = Supabase.instance.client.auth.currentUser?.id ?? '';

  final location = CachedLocation(
    id: const Uuid().v4(),
    userId: userId,
    lat: params.lat,
    lng: params.lng,
    accuracy: params.accuracy,
    timestamp: DateTime.now().millisecondsSinceEpoch,
  );

  await db.saveLocationOffline(location);
});

/// Queue a cost submission
final queueCostSubmissionProvider = FutureProvider.autoDispose
    .family<void, ({String siteVisitId, double amount, String description, String category, String? receiptUrl})>((ref, params) async {
  final db = ref.watch(offlineDbProvider);
  final syncManager = ref.watch(syncManagerProvider);

  await db.addPendingSync(PendingSyncAction(
    id: const Uuid().v4(),
    type: 'cost_submission',
    payload: {
      'userId': Supabase.instance.client.auth.currentUser?.id ?? '',
      'siteVisitId': params.siteVisitId,
      'amount': params.amount,
      'description': params.description,
      'category': params.category,
      'receiptUrl': params.receiptUrl,
    },
    timestamp: DateTime.now().millisecondsSinceEpoch,
  ));

  syncManager.forceSync();
});

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

final queuedRequestsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final queue = ref.watch(offlineQueueProvider);
  return queue.getQueueStatus();
});

final syncQueueProvider = FutureProvider((ref) async {
  final queue = ref.watch(offlineQueueProvider);
  return await queue.syncQueue();
});

// ============================================================================
// SYNC CALLBACKS/LISTENERS
// ============================================================================

final syncProgressProvider = StreamProvider<SyncProgress>((ref) async* {
  final syncManager = ref.watch(syncManagerProvider);
  
  final streamController = StreamController<SyncProgress>();
  
  syncManager.onProgress((progress) {
    streamController.add(progress);
  });

  yield* streamController.stream;
});

final syncCompleteProvider = StreamProvider<SyncResult>((ref) async* {
  final syncManager = ref.watch(syncManagerProvider);
  
  final streamController = StreamController<SyncResult>();
  
  syncManager.onComplete((result) {
    streamController.add(result);
  });

  yield* streamController.stream;
});

// ============================================================================
// DIAGNOSTICS
// ============================================================================

final diagnosticsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final db = ref.watch(offlineDbProvider);
  return db.getDiagnostics();
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/// Riverpod watch helper for sync operations
extension SyncRefExtension on Ref {
  Future<void> syncNow({bool force = false}) async {
    final notifier = read(syncNotifierProvider.notifier);
    await notifier.syncNow(force: force);
  }

  Future<void> forceSync() async {
    final notifier = read(syncNotifierProvider.notifier);
    await notifier.forceSync();
  }

  OfflineDb get offlineDb => read(offlineDbProvider);
  SyncManager get syncManager => read(syncManagerProvider);
  OfflineQueue get offlineQueue => read(offlineQueueProvider);
}
