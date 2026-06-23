import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'hive_manager.dart';
import '../constants/app_constants.dart';

typedef SyncCallback = Future<void> Function();

class SyncManager {
  static final SyncManager _instance = SyncManager._internal();
  factory SyncManager() => _instance;
  SyncManager._internal();

  Timer? _syncTimer;
  StreamSubscription? _connectivitySub;
  bool _isSyncing = false;
  bool _isOnline = true;
  final List<SyncCallback> _syncCallbacks = [];

  bool get isOnline => _isOnline;

  void addSyncCallback(SyncCallback callback) {
    _syncCallbacks.add(callback);
  }

  Future<void> init() async {
    final connectivity = Connectivity();
    final result = await connectivity.checkConnectivity();
    _isOnline = result.any((r) => r != ConnectivityResult.none);

    _connectivitySub = connectivity.onConnectivityChanged.listen((results) {
      final wasOnline = _isOnline;
      _isOnline = results.any((r) => r != ConnectivityResult.none);

      if (!wasOnline && _isOnline) {
        _flushOfflineQueue();
        syncAll();
      }
    });

    _syncTimer = Timer.periodic(AppConstants.syncInterval, (_) {
      if (_isOnline) syncAll();
    });
  }

  Future<void> syncAll() async {
    if (_isSyncing || !_isOnline) return;
    _isSyncing = true;
    try {
      for (final callback in _syncCallbacks) {
        try {
          await callback();
        } catch (_) {}
      }
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> queueOfflineAction({
    required String table,
    required String action,
    required Map<String, dynamic> data,
    String? recordId,
  }) async {
    final queue = HiveManager.getList(HiveManager.offlineActionsBox, 'queue');
    queue.add({
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'table': table,
      'action': action,
      'data': data,
      'record_id': recordId,
      'created_at': DateTime.now().toIso8601String(),
    });
    HiveManager.saveList(HiveManager.offlineActionsBox, 'queue', queue);
  }

  Future<void> _flushOfflineQueue() async {
    final client = Supabase.instance.client;
    final queue = HiveManager.getList(HiveManager.offlineActionsBox, 'queue');
    if (queue.isEmpty) return;

    final failed = <Map<String, dynamic>>[];

    for (final action in queue) {
      try {
        final table = action['table'] as String;
        final act = action['action'] as String;
        final data = Map<String, dynamic>.from(action['data'] as Map);
        final recordId = action['record_id'] as String?;

        switch (act) {
          case 'insert':
            await client.from(table).insert(data);
            break;
          case 'update':
            if (recordId != null) {
              await client.from(table).update(data).eq('id', recordId);
            }
            break;
          case 'upsert':
            await client.from(table).upsert(data);
            break;
        }
      } catch (_) {
        failed.add(action);
      }
    }

    HiveManager.saveList(HiveManager.offlineActionsBox, 'queue', failed);
  }

  void dispose() {
    _syncTimer?.cancel();
    _connectivitySub?.cancel();
  }
}
