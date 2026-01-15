import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';
import 'auth_service.dart';
import 'database_service.dart';
import 'location_tracking_service.dart';
import 'supabase_service.dart';
import 'sync_service.dart';

class AppConfigService {
  static final AppConfigService _instance = AppConfigService._internal();
  bool _initialized = false;

  factory AppConfigService() {
    return _instance;
  }

  AppConfigService._internal();

  Future<void> initialize() async {
    if (_initialized) return;

    try {
      // Initialize Supabase
      await SupabaseService().initialize(
        supabaseUrl: const String.fromEnvironment('SUPABASE_URL'),
        supabaseAnonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
      );

      // Initialize Auth Service
      await AuthService().initialize();

      // Initialize Database
      await DatabaseService().database;

      // Initialize Background Workers
      await Workmanager().initialize(callbackDispatcher);

      // Initialize Location Tracking
      final locationService = LocationTrackingService();
      await locationService.initialize();

      // Initialize Sync Service
      final syncService = SyncService(
        DatabaseService(),
        SupabaseService(),
      );
      await syncService.initialize();

      _initialized = true;
    } catch (e) {
      debugPrint('Error initializing app: $e');
      rethrow;
    }
  }
}

@pragma('vm:entry-point')
void callbackDispatcher() {
  WidgetsFlutterBinding.ensureInitialized();

  Workmanager().executeTask((taskName, inputData) async {
    switch (taskName) {
      case 'locationTracking':  // Match the constant from LocationTrackingService
        final locationService = LocationTrackingService();
        await locationService.initialize();
        break;
      case SyncService.syncTaskKey:
        final syncService = SyncService(
          DatabaseService(),
          SupabaseService(),
        );
        await syncService.syncData();
        break;
    }
    return true;
  });
}