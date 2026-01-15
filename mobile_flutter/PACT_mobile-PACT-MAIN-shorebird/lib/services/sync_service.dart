import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';
import '../repositories/equipment_repository.dart';
import '../repositories/incident_repository.dart';
import '../repositories/safety_checklist_repository.dart';
import '../services/auto_release_service.dart';
import '../services/database_service.dart';
import '../services/supabase_service.dart';

class SyncService {
  static const String syncTaskKey = 'syncData';
  static const String autoReleaseTaskKey = 'autoReleaseSites';
  final DatabaseService _databaseService;
  final SupabaseService _supabaseService;
  Timer? _syncTimer;

  SyncService(this._databaseService, this._supabaseService);

  Future<void> initialize() async {
    if (kIsWeb) {
      // Web: Workmanager unsupported; rely on connectivity + manual triggers
      debugPrint('Skipping Workmanager init on web platform');
      _setupConnectivityListener();
      return;
    }
    await Workmanager().initialize(callbackDispatcher);
    await _setupPeriodicSync();
    _setupConnectivityListener();
  }

  Future<void> _setupPeriodicSync() async {
    if (kIsWeb) return; // Guard
    await Workmanager().registerPeriodicTask(
      syncTaskKey,
      syncTaskKey,
      frequency: const Duration(hours: 1),
      constraints: Constraints(
        networkType: NetworkType.connected,
        requiresBatteryNotLow: true,
      ),
    );
    
    // Register auto-release task to run every 30 minutes
    await Workmanager().registerPeriodicTask(
      autoReleaseTaskKey,
      autoReleaseTaskKey,
      frequency: const Duration(minutes: 30),
      constraints: Constraints(
        networkType: NetworkType.connected,
        requiresBatteryNotLow: true,
      ),
    );
  }

  void _setupConnectivityListener() {
    Connectivity().onConnectivityChanged.listen((result) {
      if (result != ConnectivityResult.none) {
        syncData();
      }
    });
  }

  Future<void> syncData() async {
    if (_syncTimer?.isActive ?? false) return;

    _syncTimer = Timer(const Duration(seconds: 30), () async {
      final db = await _databaseService.database;

      // Create repositories
      final equipmentRepo = EquipmentRepository(
        database: db,
        supabaseService: _supabaseService,
      );
      final incidentRepo = IncidentRepository(
        database: db,
        supabaseService: _supabaseService,
      );
      final safetyChecklistRepo = SafetyChecklistRepository(
        database: db,
        supabaseService: _supabaseService,
      );

      // Sync all repositories
      await Future.wait([
        equipmentRepo.syncWithSupabase(),
        incidentRepo.syncWithSupabase(),
        safetyChecklistRepo.syncWithSupabase(),
      ]);
    });
  }
}

@pragma('vm:entry-point')
void callbackDispatcher() {
  WidgetsFlutterBinding.ensureInitialized();

  Workmanager().executeTask((taskName, inputData) async {
    switch (taskName) {
      case SyncService.syncTaskKey:
        final db = await DatabaseService().database;
        final supabase = SupabaseService();
        
        final syncService = SyncService(DatabaseService(), supabase);
        await syncService.syncData();
        break;
      case SyncService.autoReleaseTaskKey:
        final autoReleaseService = AutoReleaseService();
        final releasedCount = await autoReleaseService.checkAndReleaseSites();
        debugPrint('Auto-release task completed: $releasedCount sites released');
        break;
    }
    return true;
  });
}