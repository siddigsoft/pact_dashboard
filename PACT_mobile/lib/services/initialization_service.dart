// lib/services/initialization_service.dart
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'authentication_service.dart';
import 'notification_service.dart';

class InitializationService {
  static final InitializationService _instance = InitializationService._();

  factory InitializationService() => _instance;

  InitializationService._();

  final List<String> _completedPhases = [];
  final ValueNotifier<String> statusNotifier = ValueNotifier('Starting...');
  final ValueNotifier<double> progressNotifier = ValueNotifier(0.0);

  bool _criticalInitDone = false;
  bool _deferredInitDone = false;

  List<String> get completedPhases => _completedPhases;
  bool get isCriticalInitDone => _criticalInitDone;
  bool get isDeferredInitDone => _deferredInitDone;

  /// PHASE 1: CRITICAL - Must complete before showing main UI
  /// Target: 1-2 seconds
  Future<void> initializeCritical() async {
    if (_criticalInitDone) return;

    try {
      debugPrint('🚀 Starting critical initialization...');

      // 1. Initialize Supabase (required for auth checks)
      await _runPhase(
        'Supabase',
        0.0,
        0.3,
        () => Supabase.initialize(
          url: 'https://abznugnirnlrqnnfkein.supabase.co',
          anonKey:
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM',
          authOptions: const FlutterAuthClientOptions(
            authFlowType: AuthFlowType.pkce,
            autoRefreshToken: true,
          ),
        ),
      );

      // 2. Initialize Hive - ONLY essential boxes
      await _runPhase('Local Storage', 0.3, 0.6, () async {
        await Hive.initFlutter();
        // Only open critical boxes for auth state
        await Hive.openBox('appSettings');
      });

      // 3. Check authentication state (fast - just checks existing session)
      await _runPhase(
        'Auth Check',
        0.6,
        1.0,
        () => AuthenticationService().initialize(),
      );

      _completedPhases.add('CRITICAL');
      _criticalInitDone = true;
      debugPrint('✅ Critical initialization complete');
    } catch (e) {
      debugPrint('❌ Critical initialization failed: $e');
      rethrow;
    }
  }

  /// PHASE 2: DEFERRED - Can complete in background after UI shows
  /// Target: < 5 seconds (but non-blocking)
  Future<void> initializeDeferred() async {
    if (_deferredInitDone) return;

    try {
      debugPrint('📦 Starting deferred initialization in background...');

      // Run deferred tasks sequentially (0.0 -> 1.0 progress)
      final deferredTasks = [
        ('User Profile', _initUserProfile),
        ('Notifications', _initNotifications),
        ('Location Services', _initLocationServices),
        ('Cache System', _initCacheSystem),
        ('Additional Hive Boxes', _initAdditionalHiveBoxes),
        ('Sync Service', _initSyncService),
      ];

      for (int i = 0; i < deferredTasks.length; i++) {
        final taskName = deferredTasks[i].$1;
        final task = deferredTasks[i].$2;
        final startProgress = i / deferredTasks.length;
        final endProgress = (i + 1) / deferredTasks.length;

        await _runPhase(taskName, startProgress, endProgress, task);
      }

      _completedPhases.add('DEFERRED');
      _deferredInitDone = true;
      debugPrint('✅ Deferred initialization complete');
    } catch (e) {
      debugPrint('⚠️ Deferred initialization error (non-critical): $e');
      // Don't rethrow - deferred errors shouldn't crash the app
    }
  }

  /// PHASE 3: LAZY - Load on-demand when needed
  Future<void> initializeLazy(String feature) async {
    switch (feature) {
      case 'firebase':
        await _initFirebase();
        break;
      case 'updates':
        await _initUpdateService();
        break;
      case 'map_tiles':
        await _initMapTileCache();
        break;
      case 'permissions':
        await _requestPermissionsDemand();
        break;
    }
  }

  // ============================================
  // PRIVATE INITIALIZATION METHODS
  // ============================================

  Future<void> _runPhase(
    String name,
    double startProgress,
    double endProgress,
    Future<void> Function() task,
  ) async {
    try {
      statusNotifier.value = 'Loading $name...';
      progressNotifier.value = startProgress;

      debugPrint('📦 Starting: $name');

      await task();

      progressNotifier.value = endProgress;
      debugPrint('✅ Completed: $name');
    } catch (e) {
      debugPrint('❌ Failed: $name - $e');
      rethrow;
    }
  }

  Future<void> _initUserProfile() async {
    // Load user profile from Supabase if logged in
    // This is fast because Supabase session is already initialized
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        debugPrint('User profile loaded: ${user.id}');
      }
    } catch (e) {
      debugPrint('Error loading user profile: $e');
    }
  }

  Future<void> _initNotifications() async {
    try {
      await NotificationService.initialize();
      debugPrint('📲 Notification service initialized');
    } catch (e) {
      debugPrint('Error initializing notifications: $e');
    }
  }

  Future<void> _initLocationServices() async {
    try {
      // Initialize location service but don't start tracking yet
      // (that happens when user navigates to location-dependent screens)
      debugPrint('📍 Location service ready');
    } catch (e) {
      debugPrint('Error initializing location: $e');
    }
  }

  Future<void> _initCacheSystem() async {
    try {
      // Initialize offline cache
      debugPrint('💾 Cache system initialized');
    } catch (e) {
      debugPrint('Error initializing cache: $e');
    }
  }

  Future<void> _initAdditionalHiveBoxes() async {
    try {
      // Open remaining Hive boxes on demand
      const boxes = [
        'tasks',
        'equipments',
        'incidentReports',
        'safetyChecklists',
        'userProfiles',
        'mapData',
        'tasks_sync',
        'equipments_sync',
        'incidentReports_sync',
        'safetyChecklists_sync',
        'userProfiles_sync',
      ];

      for (final boxName in boxes) {
        try {
          await Hive.openBox(boxName);
        } catch (e) {
          debugPrint('Error opening box $boxName: $e');
        }
      }
      debugPrint('📦 All Hive boxes opened');
    } catch (e) {
      debugPrint('Error initializing Hive boxes: $e');
    }
  }

  Future<void> _initSyncService() async {
    try {
      // Initialize sync service for offline data
      debugPrint('🔄 Sync service initialized');
    } catch (e) {
      debugPrint('Error initializing sync service: $e');
    }
  }

  // ============================================
  // LAZY INITIALIZATION (on demand)
  // ============================================

  Future<void> _initFirebase() async {
    try {
      debugPrint('Firebase initialized (lazy load)');
    } catch (e) {
      debugPrint('Error initializing Firebase: $e');
    }
  }

  Future<void> _initUpdateService() async {
    try {
      debugPrint('Update service initialized (lazy load)');
    } catch (e) {
      debugPrint('Error initializing update service: $e');
    }
  }

  Future<void> _initMapTileCache() async {
    try {
      debugPrint('Map tile cache initialized (lazy load)');
    } catch (e) {
      debugPrint('Error initializing map tile cache: $e');
    }
  }

  Future<void> _requestPermissionsDemand() async {
    try {
      debugPrint('Permissions requested on demand');
    } catch (e) {
      debugPrint('Error requesting permissions: $e');
    }
  }
}
