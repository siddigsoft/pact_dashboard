# Performance Optimization Checklist

## Phase 1: Critical (Do First) - 30 mins
These changes will give you the biggest performance boost.

- [ ] **Create 4 new service files** (already created in this session)
  - `lib/services/initialization_service.dart` ✅
  - `lib/services/hive_box_manager.dart` ✅
  - `lib/services/permission_manager.dart` ✅
  - `lib/widgets/optimized_splash_screen.dart` ✅

- [ ] **Update main.dart**
  - Remove all initialization code except `SystemChrome.set*()` calls
  - Add `InitializationService` initialization
  - Use `OptimizedSplashScreen` as initial route
  - Keep `Supabase.initialize()` only (move everything else to `initService`)

- [ ] **Test startup time in release mode**
  ```bash
  flutter clean
  flutter pub get
  flutter run --release
  ```
  - Measure time from app start to UI visible
  - Target: < 2-3 seconds

---

## Phase 2: Medium Priority - 1-2 hours

- [ ] **Replace Hive box opening with HiveBoxManager**
  - Audit all files that call `Hive.openBox()`
  - Replace with `HiveBoxManager().getBox(name)`
  - Example locations:
    - `lib/services/app_config_service.dart`
    - `lib/services/offline_db.dart`
    - Any screen that accesses Hive data

- [ ] **Replace permission requests with PermissionManager**
  - Find `_requestAllPermissionsOnStartup()`
  - Remove from `main()`
  - Replace with context-specific requests in:
    - Camera features → request in camera screen
    - Location features → request in location screen
    - Microphone → request in call screen
    - Storage → request when accessing files

- [ ] **Move Firebase initialization to lazy load**
  - Create task in `initService.initializeLazy('firebase')`
  - Only initialize on screens that need Firebase
  - This saves 500ms-2s at startup

- [ ] **Update screens to request permissions on-demand**
  - Camera screen: request camera permission on mount
  - Call screen: request microphone/camera on mount
  - Location screen: request location on mount
  - File access: request storage on demand

---

## Phase 3: Performance Polish - 1-2 hours

- [ ] **Fix const constructor warnings**
  ```bash
  dart fix --apply
  dart fix --apply  # Run twice
  flutter analyze
  ```
  - This is free performance (prevents unnecessary rebuilds)
  - Target: 0 `prefer_const_constructors` warnings

- [ ] **Fix deprecated color methods**
  ```bash
  # Find deprecated withOpacity
  grep -r "withOpacity" lib/
  
  # Replace with withValues
  Color.withOpacity(0.5)  # ❌ Old
  Color.withValues(alpha: 0.5)  # ✅ New
  ```
  - Affects: Colors, Gradients, etc.

- [ ] **Optimize heavy widgets**
  - `ModernAppHeader` - consider const where possible
  - `ExcelPreviewWidget` - limit row count on screen
  - `SignaturePadWidget` - check memory usage for large strokes
  - Any `GridView`/`ListView` - add caching/paging

- [ ] **Profile with DevTools**
  ```bash
  flutter pub global activate devtools
  devtools
  flutter run --profile  # Run in profile mode
  ```
  - Check "Performance" tab for jank
  - Target: Consistent 60 FPS
  - Check "Memory" tab for leaks

---

## Phase 4: Advanced Optimization - 2+ hours

- [ ] **Use compute() for expensive operations**
  ```dart
  // Example: Heavy data processing
  final result = await compute(_processDataIsolate, largeData);
  
  static Future<List> _processDataIsolate(List data) async {
    // Heavy computation here - runs on separate thread
    return data.map((e) => expensive(e)).toList();
  }
  ```
  - Apply to: Data migrations, CSV parsing, image processing

- [ ] **Implement pagination for large lists**
  - Dashboard with many items → paginate
  - Site visits list → paginate
  - Task lists → paginate
  - Load 20-50 items at a time, not all

- [ ] **Memoize expensive calculations**
  ```dart
  // Example: Route optimization
  final memoizedRoutes = <List<Visit>, List<Visit>>{};
  
  List<Visit> optimizeRoute(List<Visit> visits) {
    if (memoizedRoutes.containsKey(visits)) {
      return memoizedRoutes[visits]!;
    }
    final result = _doOptimization(visits);
    memoizedRoutes[visits] = result;
    return result;
  }
  ```

- [ ] **Lazy load images with cached_network_image**
  - Already in pubspec.yaml ✅
  - Ensure all images use `CachedNetworkImage`
  - Set reasonable cache sizes

- [ ] **Implement image compression**
  - Before uploading user photos, compress
  - Example: 5MB → 200KB
  - Affects upload speed, storage, download speed

---

## Phase 5: Monitoring & Metrics - 30 mins

- [ ] **Add performance logging**
  ```dart
  final stopwatch = Stopwatch()..start();
  
  // Do work...
  
  debugPrint('Operation took ${stopwatch.elapsedMilliseconds}ms');
  ```
  - Track: Initialization phases, network requests, data loading

- [ ] **Set up error tracking**
  - Use Sentry/Bugsnag if available
  - Track: Crashes, slow operations, memory issues
  - Monitor: App startup, cold start vs warm start

- [ ] **Create performance baseline**
  - Measure startup time (cold & warm)
  - Measure screen navigation time
  - Measure data loading time
  - Document baseline metrics

- [ ] **Plan regular profiling**
  - Profile weekly during development
  - Watch for regressions
  - Update performance budget as needed

---

## Quick Implementation Guide

### Replace Hive Box Opening

```dart
// ❌ OLD (slow startup)
await Hive.openBox('tasks');
await Hive.openBox('equipments');

// ✅ NEW (lazy loading)
import 'services/hive_box_manager.dart';

final boxManager = HiveBoxManager();
final tasksBox = await boxManager.getBox('tasks');
```

### Replace Permission Requests

```dart
// ❌ OLD (blocks startup 2-5 seconds)
await _requestAllPermissionsOnStartup();

// ✅ NEW (on-demand)
import 'services/permission_manager.dart';

final permManager = PermissionManager();

// In camera screen:
if (await permManager.requestCameraPermission()) {
  initializeCamera();
}

// In call screen:
if (await permManager.requestMicrophonePermission()) {
  startCall();
}

// In location screen:
if (await permManager.requestLocationPermission()) {
  startTracking();
}
```

### Update main.dart

```dart
// ❌ OLD (20+ lines of initialization)
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await FirebaseMessagingService().initialize();
  await BiometricService().initialize();
  // ... 15 more initializations ...
  runApp(MyApp());
}

// ✅ NEW (3 essential steps)
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  SystemChrome.setSystemUIOverlayStyle(...);
  
  final initService = InitializationService();
  await initService.initializeCritical();
  
  runApp(MyApp(initService: initService));
}
```

---

## Success Metrics

### Before Optimization
```
App startup: 15-25 seconds 🐢
UI appears after: 15-20 seconds
User can interact: 20+ seconds
```

### After Optimization (Target)
```
App startup: 2-5 seconds 🚀
UI appears after: 1-2 seconds
User can interact: 3-5 seconds (deferred tasks loading in background)
```

### Performance Wins
- **75-80% faster startup** ⚡
- **Smooth 60 FPS** throughout ✨
- **Better battery life** 🔋
- **Happier users** 😊

---

## Files to Modify

### High Impact
1. `lib/main.dart` - Reduce initialization
2. `lib/services/app_config_service.dart` - Use HiveBoxManager
3. `lib/services/offline_db.dart` - Use HiveBoxManager
4. `lib/screens/main_screen.dart` - Request permissions on demand

### Medium Impact
5. `lib/screens/field_operations_enhanced_screen.dart` - Pagination
6. `lib/screens/dashboard_screen.dart` - Pagination
7. `lib/screens/agora_call_screen.dart` - Request mic/camera permission on mount
8. `lib/widgets/modern_app_header.dart` - Fix const constructors

### Good to Have
9. All widget files - Add `const` to constructors
10. All color usages - Replace `withOpacity` with `withValues`

---

## Testing Checklist

Before & After each optimization phase:

- [ ] **Startup Test**
  - Time from app launch to UI visible
  - Time from app launch to interactive
  - Check logs for errors

- [ ] **Release Build Test**
  ```bash
  flutter run --release
  ```
  - Always test in release mode
  - Debug mode is 10-20x slower

- [ ] **Memory Test**
  - Open DevTools Memory tab
  - Watch for memory leaks
  - Check heap size growing

- [ ] **Frame Rate Test**
  - Press 'P' during `flutter run`
  - Watch FPS counter
  - Target: 60 FPS minimum

- [ ] **Navigation Test**
  - Test all screen transitions
  - Check for jank while moving between screens
  - Verify data loads properly

- [ ] **Offline Test**
  - Turn off network
  - Verify app still works
  - Check cached data loads

- [ ] **Permission Test**
  - Grant/deny permissions
  - Verify features enable/disable correctly
  - Check settings can override

---

## Expected Timeline

| Phase | Time | Impact |
|-------|------|--------|
| Phase 1 (Critical) | 30 mins | **50-60% improvement** |
| Phase 2 (Medium) | 1-2 hrs | **+15-20% improvement** |
| Phase 3 (Polish) | 1-2 hrs | **+10-15% improvement** |
| Phase 4 (Advanced) | 2+ hrs | **+5-10% improvement** |
| **Total** | **4-6 hours** | **75-80% faster** |

---

## Getting Help

### Debugging Performance Issues

1. **Check logs** - Look for timeouts, errors
2. **Profile with DevTools** - Identify bottlenecks
3. **Use `flutter run --release`** - Always test in release
4. **Measure startup time** - Use Stopwatch/logs
5. **Check memory leaks** - Use DevTools Memory tab

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Still slow after optimization | Debug mode | Test with `--release` |
| Permission dialogs on startup | Requesting all at once | Use on-demand requests |
| "Box not found" errors | Using old Hive API | Use `HiveBoxManager` |
| Memory leaks | Unclosed boxes/listeners | Use HiveBoxManager, dispose properly |
| Jank while scrolling | Heavy widgets | Add `const` constructors, pagination |

---

## Next Steps

1. **Today:** Implement Phase 1 (Critical) - 30 mins
2. **Tomorrow:** Implement Phase 2 (Medium) - 1-2 hours
3. **This week:** Implement Phase 3 (Polish) - 1-2 hours
4. **Next week:** Implement Phase 4 (Advanced) - as time allows

**Result:** App will be **5-10x faster** to startup! 🚀
