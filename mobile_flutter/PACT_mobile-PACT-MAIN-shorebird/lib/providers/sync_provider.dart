import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/connectivity_service.dart';
import '../services/local_storage_service.dart';
import '../services/offline_sync_service.dart';

class SyncProvider extends ChangeNotifier {
  final OfflineSyncService _syncService;
  final ConnectivityService _connectivityService;

  SyncProvider(SupabaseClient supabase, LocalStorageService localStorage, ConnectivityService connectivity)
      : _syncService = OfflineSyncService(supabase, localStorage, connectivity),
        _connectivityService = connectivity {
    // Listen to sync status changes
    _syncService.syncStatus.listen((status) {
      notifyListeners();
    });

    // Listen to connectivity changes and trigger sync when coming online
    _connectivityService.connectivityStream.listen((isOnline) {
      if (isOnline && _syncService.currentStatus != SyncStatus.syncing) {
        // Auto-sync when coming back online
        performFullSync();
      }
    });
  }

  OfflineSyncService get syncService => _syncService;
  SyncStatus get syncStatus => _syncService.currentStatus;
  Stream<SyncStatus> get syncStatusStream => _syncService.syncStatus;
  Stream<String> get syncMessages => _syncService.syncMessages;
  bool get isOnline => _connectivityService.isOnline;

  Future<SyncResult> performFullSync() async {
    final result = await _syncService.performFullSync();
    notifyListeners();
    return result;
  }

  Future<void> syncTasks() async {
    await _syncService.syncTasks();
    notifyListeners();
  }

  Future<void> syncEquipment() async {
    await _syncService.syncEquipment();
    notifyListeners();
  }

  Future<void> syncIncidentReports() async {
    await _syncService.syncIncidentReports();
    notifyListeners();
  }

  Future<void> syncSafetyChecklists() async {
    await _syncService.syncSafetyChecklists();
    notifyListeners();
  }

  Future<void> syncComprehensiveSafetyChecklists() async {
    await _syncService.syncComprehensiveSafetyChecklists();
    notifyListeners();
  }

  Future<void> syncUserProfile() async {
    await _syncService.syncUserProfile();
    notifyListeners();
  }

  Future<SyncResult> forceSync() async {
    final result = await _syncService.forceSync();
    notifyListeners();
    return result;
  }

  @override
  void dispose() {
    _syncService.dispose();
    super.dispose();
  }
}