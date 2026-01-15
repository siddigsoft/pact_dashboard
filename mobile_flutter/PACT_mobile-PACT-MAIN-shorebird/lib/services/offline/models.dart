import 'package:hive/hive.dart';

// ============================================================================
// PENDING SYNC ACTION MODEL
// ============================================================================

@HiveType(typeId: 0)
class PendingSyncAction extends HiveObject {
  @HiveField(0)
  late String id;

  @HiveField(1)
  late String type; // 'site_visit_claim', 'site_visit_start', 'site_visit_complete', 'location_update', 'cost_submission', 'photo_upload'

  @HiveField(2)
  late Map<String, dynamic> payload;

  @HiveField(3)
  late int timestamp;

  @HiveField(4)
  late int retries;

  @HiveField(5)
  late String status; // 'pending', 'syncing', 'failed'

  @HiveField(6)
  String? errorMessage;

  PendingSyncAction({
    required this.id,
    required this.type,
    required this.payload,
    required this.timestamp,
    this.retries = 0,
    this.status = 'pending',
    this.errorMessage,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type,
    'payload': payload,
    'timestamp': timestamp,
    'retries': retries,
    'status': status,
    'errorMessage': errorMessage,
  };
}

// ============================================================================
// OFFLINE SITE VISIT MODEL
// ============================================================================

@HiveType(typeId: 1)
class OfflineSiteVisit extends HiveObject {
  @HiveField(0)
  late String id; // UUID

  @HiveField(1)
  late String siteEntryId; // Origin server ID

  @HiveField(2)
  late String siteName;

  @HiveField(3)
  late String siteCode;

  @HiveField(4)
  late String state;

  @HiveField(5)
  late String locality;

  @HiveField(6)
  late String status; // 'started', 'draft', 'completed'

  @HiveField(7)
  late DateTime startedAt;

  @HiveField(8)
  DateTime? completedAt;

  @HiveField(9)
  Map<String, dynamic>? startLocation; // {lat, lng, accuracy}

  @HiveField(10)
  Map<String, dynamic>? endLocation; // {lat, lng, accuracy}

  @HiveField(11)
  List<String>? photos; // Base64 encoded photos or file paths

  @HiveField(12)
  String? notes;

  @HiveField(13)
  bool synced;

  @HiveField(14)
  DateTime? syncedAt;

  OfflineSiteVisit({
    required this.id,
    required this.siteEntryId,
    required this.siteName,
    required this.siteCode,
    required this.state,
    required this.locality,
    required this.status,
    required this.startedAt,
    this.completedAt,
    this.startLocation,
    this.endLocation,
    this.photos,
    this.notes,
    this.synced = false,
    this.syncedAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'siteEntryId': siteEntryId,
    'siteName': siteName,
    'siteCode': siteCode,
    'state': state,
    'locality': locality,
    'status': status,
    'startedAt': startedAt.toIso8601String(),
    'completedAt': completedAt?.toIso8601String(),
    'startLocation': startLocation,
    'endLocation': endLocation,
    'photos': photos,
    'notes': notes,
    'synced': synced,
    'syncedAt': syncedAt?.toIso8601String(),
  };
}

// ============================================================================
// CACHED LOCATION MODEL
// ============================================================================

@HiveType(typeId: 2)
class CachedLocation extends HiveObject {
  @HiveField(0)
  late String id;

  @HiveField(1)
  late String userId;

  @HiveField(2)
  late double lat;

  @HiveField(3)
  late double lng;

  @HiveField(4)
  double? accuracy;

  @HiveField(5)
  late int timestamp;

  @HiveField(6)
  bool synced;

  CachedLocation({
    required this.id,
    required this.userId,
    required this.lat,
    required this.lng,
    this.accuracy,
    required this.timestamp,
    this.synced = false,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'lat': lat,
    'lng': lng,
    'accuracy': accuracy,
    'timestamp': timestamp,
    'synced': synced,
  };
}

// ============================================================================
// OFFLINE QUEUE REQUEST MODEL
// ============================================================================

@HiveType(typeId: 3)
class QueuedRequest extends HiveObject {
  @HiveField(0)
  late String id;

  @HiveField(1)
  late String url;

  @HiveField(2)
  late String method; // GET, POST, PUT, DELETE, PATCH

  @HiveField(3)
  Map<String, dynamic>? data;

  @HiveField(4)
  late int timestamp;

  @HiveField(5)
  late int retries;

  @HiveField(6)
  late String status; // 'pending', 'syncing', 'failed'

  @HiveField(7)
  String? errorMessage;

  QueuedRequest({
    required this.id,
    required this.url,
    required this.method,
    this.data,
    required this.timestamp,
    this.retries = 0,
    this.status = 'pending',
    this.errorMessage,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'url': url,
    'method': method,
    'data': data,
    'timestamp': timestamp,
    'retries': retries,
    'status': status,
    'errorMessage': errorMessage,
  };
}

// ============================================================================
// CACHED GENERIC MODEL (for TTL-based caches)
// ============================================================================

@HiveType(typeId: 4)
class CachedItem extends HiveObject {
  @override
  @HiveField(0)
  late String key;

  @HiveField(1)
  late Map<String, dynamic> data;

  @HiveField(2)
  late int cachedAt;

  @HiveField(3)
  int? expiresAt; // Timestamp when this item expires

  @HiveField(4)
  String? version; // For schema upgrades

  CachedItem({
    required this.key,
    required this.data,
    required this.cachedAt,
    this.expiresAt,
    this.version,
  });

  bool get isExpired =>
      expiresAt != null && DateTime.now().millisecondsSinceEpoch > expiresAt!;

  Map<String, dynamic> toJson() => {
    'key': key,
    'data': data,
    'cachedAt': cachedAt,
    'expiresAt': expiresAt,
    'version': version,
  };
}

// ============================================================================
// OFFLINE STATISTICS MODEL
// ============================================================================

class OfflineStats {
  final int pendingActions;
  final int unsyncedVisits;
  final int unsyncedLocations;
  final int cachedSites;
  final int cachedMMPs;
  final int queuedRequests;
  final DateTime? lastSyncTime;
  final bool isOnline;

  OfflineStats({
    required this.pendingActions,
    required this.unsyncedVisits,
    required this.unsyncedLocations,
    required this.cachedSites,
    required this.cachedMMPs,
    required this.queuedRequests,
    this.lastSyncTime,
    required this.isOnline,
  });

  int get totalPending =>
      pendingActions + unsyncedVisits + unsyncedLocations + queuedRequests;

  Map<String, dynamic> toJson() => {
    'pendingActions': pendingActions,
    'unsyncedVisits': unsyncedVisits,
    'unsyncedLocations': unsyncedLocations,
    'cachedSites': cachedSites,
    'cachedMMPs': cachedMMPs,
    'queuedRequests': queuedRequests,
    'totalPending': totalPending,
    'lastSyncTime': lastSyncTime?.toIso8601String(),
    'isOnline': isOnline,
  };
}

// ============================================================================
// SYNC RESULT MODEL
// ============================================================================

class SyncResult {
  final bool success;
  final int synced;
  final int failed;
  final List<String> errors;
  final int duration; // milliseconds
  final DateTime? timestamp;
  final Map<String, dynamic>? details;

  SyncResult({
    required this.success,
    required this.synced,
    required this.failed,
    required this.errors,
    required this.duration,
    this.timestamp,
    this.details,
  });

  Map<String, dynamic> toJson() => {
    'success': success,
    'synced': synced,
    'failed': failed,
    'errors': errors,
    'duration': duration,
    'timestamp': timestamp?.toIso8601String(),
    'details': details,
  };
}

// ============================================================================
// SYNC PROGRESS MODEL
// ============================================================================

class SyncProgress {
  final String
  phase; // 'site_visits', 'locations', 'pending_actions', 'cleanup'
  final int current;
  final int total;
  final double percentage;
  final String? message;

  SyncProgress({
    required this.phase,
    required this.current,
    required this.total,
    required this.percentage,
    this.message,
  });

  Map<String, dynamic> toJson() => {
    'phase': phase,
    'current': current,
    'total': total,
    'percentage': percentage,
    'message': message,
  };
}

// ============================================================================
// CONFLICT RESOLUTION MODEL
// ============================================================================

class ConflictResolution {
  final String
  strategy; // 'client_wins', 'server_wins', 'last_write_wins', 'manual'
  final Map<String, dynamic>? localData;
  final Map<String, dynamic>? serverData;
  final Map<String, dynamic>? resolvedData;
  final DateTime? localTimestamp;
  final DateTime? serverTimestamp;

  ConflictResolution({
    required this.strategy,
    this.localData,
    this.serverData,
    this.resolvedData,
    this.localTimestamp,
    this.serverTimestamp,
  });

  Map<String, dynamic> toJson() => {
    'strategy': strategy,
    'localData': localData,
    'serverData': serverData,
    'resolvedData': resolvedData,
    'localTimestamp': localTimestamp?.toIso8601String(),
    'serverTimestamp': serverTimestamp?.toIso8601String(),
  };
}
