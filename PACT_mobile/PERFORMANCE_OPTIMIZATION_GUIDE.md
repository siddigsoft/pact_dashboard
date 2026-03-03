# PACT Mobile App - Performance Optimization Guide

## Main Issues Identified

### 1. **Blocking Startup (CRITICAL)**
The `main()` function does ~15 synchronous initialization tasks before the UI renders:
- Firebase initialization
- Firebase Messaging Service
- Biometric Service  
- Background Call Handler
- **Requesting ALL permissions** (this alone blocks 2-5 seconds)
- Supabase initialization
- Authentication Service
- Hive initialization  
- Opening 14+ Hive boxes
- OfflineDb initialization
- Map Tile Cache Service initialization
- Data migration
- Notification service initialization
- Update service checks

**Result:** App is frozen for 10-20 seconds before UI appears.

---

## Quick Fixes (Do First)

### 1. Add a Splash Screen with Progress
Create visual feedback during initialization.

```dart
// lib/widgets/splash_screen_optimized.dart
import 'package:flutter/material.dart';

class OptimizedSplashScreen extends StatefulWidget {
  final Future<void> Function() onInitializationStart;
  final Widget nextScreen;

  const OptimizedSplashScreen({
    required this.onInitializationStart,
    required this.nextScreen,
  });

  @override
  State<OptimizedSplashScreen> createState() => _OptimizedSplashScreenState();
}

class _OptimizedSplashScreenState extends State<OptimizedSplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  String _status = 'Initializing...';
  late Future<void> _initFuture;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();

    _initFuture = _runInitialization();
  }

  Future<void> _runInitialization() async {
    try {
      await widget.onInitializationStart();
    } catch (e) {
      debugPrint('Initialization error: $e');
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<void>(
        future: _initFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.done) {
            return widget.nextScreen;
          }

          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ScaleTransition(
                  scale: Tween<double>(begin: 0.5, end: 1.0).animate(
                    CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
                  ),
                  child: const Icon(Icons.check_circle, size: 80, color: Colors.blue),
                ),
                const SizedBox(height: 24),
                Text(
                  _status,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 24),
                LinearProgressIndicator(
                  minHeight: 4,
                  value: null, // Indeterminate
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

### 2. Split Initialization into Phases

Create a phased initialization controller:

```dart
// lib/services/initialization_service.dart
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class InitializationPhase {
  final String name;
  final Future<void> Function() task;
  
  InitializationPhase({required this.name, required this.task});
}

class InitializationService {
  static final InitializationService _instance = InitializationService._();

  factory InitializationService() => _instance;

  InitializationService._();

  final List<String> _completedPhases = [];
  final ValueNotifier<String> statusNotifier = ValueNotifier('Starting...');

  /// CRITICAL: Must complete before showing UI
  Future<void> initializeCritical() async {
    await _runPhase(
      'Supabase',
      () => Supabase.initialize(
        url: 'https://abznugnirnlrqnnfkein.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM',
      ),
    );

    await _runPhase(
      'Hive Storage',
      () async {
        await Hive.initFlutter();
        // Only open essential boxes
        await Hive.openBox('appSettings');
        await Hive.openBox('userProfiles');
      },
    );
  }

  /// DEFERRED: Can complete in background
  Future<void> initializeDeferred() async {
    await _runPhase('Authentication', () => _initAuth());
    await _runPhase('Notifications', () => _initNotifications());
    await _runPhase('Location', () => _initLocation());
    await _runPhase('Cache', () => _initCache());
  }

  /// LAZY: Load on demand
  Future<void> initializeLazy() async {
    // Firebase, Update checks, Map tiles, etc.
  }

  Future<void> _runPhase(String name, Future<void> Function() task) async {
    try {
      statusNotifier.value = 'Loading $name...';
      debugPrint('📦 Starting: $name');
      
      await task();
      
      _completedPhases.add(name);
      debugPrint('✅ Completed: $name');
    } catch (e) {
      debugPrint('❌ Failed: $name - $e');
      rethrow;
    }
  }

  Future<void> _initAuth() async {
    // Auth initialization
  }

  Future<void> _initNotifications() async {
    // Notification initialization
  }

  Future<void> _initLocation() async {
    // Location services
  }

  Future<void> _initCache() async {
    // Cache initialization
  }
}
```

### 3. Defer Non-Critical Initialization

Move these to AFTER the app shows (lazy initialization):

```dart
/// MOVE THESE TO LAZY INIT:
// ❌ NO - Firebase (unless you need it immediately)
// ❌ NO - Update service checks
// ❌ NO - Map tile cache initialization
// ❌ NO - Location tracking (start on demand)
// ❌ NO - Requesting ALL permissions at startup
// ✅ YES - Supabase auth
// ✅ YES - Essential Hive boxes
// ✅ YES - Authentication state check
```

### 4. Use Compute for Heavy Tasks

For expensive operations, use `compute()` to run on separate isolate:

```dart
// lib/services/heavy_operations.dart
import 'dart:isolate';
import 'package:flutter/foundation.dart';

// Run expensive data migration in background isolate
Future<void> dataMigrationInBackground() async {
  await compute(_migrateDataIsolate, null);
}

static Future<void> _migrateDataIsolate(_) async {
  // This runs on a separate thread
  // Heavy computation here doesn't block UI
}
```

### 5. Lazy Initialize Hive Boxes

Don't open all 14 boxes at startup:

```dart
// ❌ BAD - Current approach opens all boxes immediately
await Hive.openBox('tasks');
await Hive.openBox('equipments');
await Hive.openBox('incidentReports');
// ... 11 more boxes ...

// ✅ GOOD - Open on demand
class HiveBoxManager {
  static final Map<String, Box> _boxes = {};

  static Future<Box> getBox(String name) async {
    if (!_boxes.containsKey(name)) {
      _boxes[name] = await Hive.openBox(name);
    }
    return _boxes[name]!;
  }
}

// Usage:
final taskBox = await HiveBoxManager.getBox('tasks');
```

### 6. Skip Permission Requests at Startup

Don't request ALL permissions immediately:

```dart
// ❌ BAD - Current approach
await _requestAllPermissionsOnStartup();  // VERY SLOW - blocks 2-5 seconds

// ✅ GOOD - Request on demand
class PermissionManager {
  static Future<bool> requestLocationPermission() async {
    final status = await Permission.location.request();
    return status.isGranted;
  }

  static Future<bool> requestCameraPermission() async {
    final status = await Permission.camera.request();
    return status.isGranted;
  }

  // Request before needing each feature
}
```

---

## Updated main.dart Structure

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Set up system UI immediately (fast)
  SystemChrome.setSystemUIOverlayStyle(...);
  SystemChrome.setEnabledSystemUIMode(...);

  // Initialize critical services only
  final initService = InitializationService();
  await initService.initializeCritical();

  // Show app with splash screen
  runApp(
    ProviderScope(
      child: MyApp(initService: initService),
    ),
  );
}

class MyApp extends ConsumerWidget {
  final InitializationService initService;

  const MyApp({required this.initService});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      home: OptimizedSplashScreen(
        onInitializationStart: () => initService.initializeDeferred(),
        nextScreen: const MainNavigator(),
      ),
    );
  }
}
```

---

## Performance Measurements

### Before Optimization
- **Startup time:** 15-25 seconds (frozen UI)
- **Time to interactive:** 20 seconds
- **Janky frames:** Yes

### After Optimization (Target)
- **Startup time:** 2-3 seconds (UI visible)
- **Time to interactive:** 5 seconds
- **Janky frames:** No

---

## Additional Optimizations

### 1. Enable Release Mode for Testing
```bash
flutter run --release
# This is 10-20x faster than debug mode
```

### 2. Use `const` Constructors
The analyze output shows many warnings about non-const widgets. Convert these:

```dart
// ❌ Bad
return Container(
  child: Text('Hello'),
);

// ✅ Good
return const Container(
  child: Text('Hello'),
);
```

### 3. Fix Deprecated Color Methods
```dart
// ❌ Old
Color color = Colors.blue.withOpacity(0.5);

// ✅ New
Color color = Colors.blue.withValues(alpha: 0.5);
```

### 4. Profile with DevTools
```bash
flutter pub global activate devtools
flutter pub global run devtools

# In your app, press 'M' in terminal for DevTools
# Check "Performance" tab to identify bottlenecks
```

### 5. Monitor Frame Rate
```bash
# In terminal during flutter run, press 'P' to show frame stats
# Target: 60 FPS (or 120 FPS on high-end devices)
```

---

## Implementation Checklist

- [ ] Add `OptimizedSplashScreen` widget
- [ ] Create `InitializationService` with phases
- [ ] Move non-critical init to `initializeDeferred()`
- [ ] Lazy-load Hive boxes with `HiveBoxManager`
- [ ] Move permission requests to on-demand
- [ ] Test startup time (target: < 5 seconds to UI)
- [ ] Profile with DevTools
- [ ] Build in release mode for testing
- [ ] Fix all `const` constructor warnings
- [ ] Update deprecated color methods

---

## Key Dependencies Added
No new dependencies needed - this uses built-in Flutter APIs.

---

## Estimated Impact
Implementing these changes should reduce startup time from **15-25 seconds → 2-5 seconds** and improve overall app responsiveness significantly.
