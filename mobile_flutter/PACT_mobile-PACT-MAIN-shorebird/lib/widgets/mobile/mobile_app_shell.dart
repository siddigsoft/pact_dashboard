import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../services/offline/offline_db.dart';
import '../services/offline/sync_manager.dart';
import '../providers/offline_provider.dart';
import 'offline/sync_status_widget.dart';

/// Main app shell for mobile that sets up offline functionality
class MobileAppShell extends ConsumerStatefulWidget {
  final Widget child;
  final bool enableOfflineMode;
  final bool enableGPSTracking;
  final int autoSyncIntervalMs;

  const MobileAppShell({
    super.key,
    required this.child,
    this.enableOfflineMode = true,
    this.enableGPSTracking = true,
    this.autoSyncIntervalMs = 60000, // 1 minute
  });

  @override
  ConsumerState<MobileAppShell> createState() => _MobileAppShellState();
}

class _MobileAppShellState extends ConsumerState<MobileAppShell>
    with WidgetsBindingObserver {
  late Connectivity _connectivity;
  late FirebaseMessaging _firebaseMessaging;
  bool _isOnline = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    if (widget.enableOfflineMode) {
      _initializeOfflineMode();
    }

    if (widget.enableGPSTracking) {
      _startGPSTracking();
    }

    _setupFirebaseMessaging();
  }

  /// Initialize offline database and sync manager
  Future<void> _initializeOfflineMode() async {
    try {
      final db = OfflineDb();
      await db.init();

      final syncManager = ref.read(syncManagerProvider);
      syncManager.setupAutoSync(widget.autoSyncIntervalMs);

      // Setup network connectivity monitoring
      _connectivity = Connectivity();
      _connectivity.onConnectivityChanged.listen((result) {
        final isOnline = result != ConnectivityResult.none;
        _handleNetworkChange(isOnline);
      });

      // Initial network check
      final result = await _connectivity.checkConnectivity();
      _isOnline = result != ConnectivityResult.none;
      _handleNetworkChange(_isOnline);

      print('[OfflineMode] Initialization complete. Online: $_isOnline');
    } catch (e) {
      print('[OfflineMode] Initialization error: $e');
    }
  }

  /// Handle network connectivity changes
  void _handleNetworkChange(bool isOnline) {
    setState(() => _isOnline = isOnline);

    final syncManager = ref.read(syncManagerProvider);
    syncManager.onNetworkChange((isOnline) {
      if (isOnline && !syncManager.isSyncing) {
        // Network came back online, force sync
        print('[OfflineMode] Network restored, forcing sync...');
        syncManager.forceSync();
      }
    });

    print(
      '[OfflineMode] Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}',
    );

    // Show snackbar for network changes
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 2),
        backgroundColor: isOnline ? Colors.green : Colors.orange,
        content: Text(
          isOnline ? 'Back online' : 'Lost connection - offline mode',
        ),
      ),
    );
  }

  /// Start GPS tracking for location updates
  Future<void> _startGPSTracking() async {
    try {
      // Request location permission
      final permission = await Geolocator.requestLocationPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        print('[GPSTracking] Location permission denied');
        return;
      }

      // Check if location services are enabled
      final isServiceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!isServiceEnabled) {
        print('[GPSTracking] Location services disabled');
        return;
      }

      // Start position stream
      const locationSettings = LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 100, // Update every 100 meters
      );

      Geolocator.getPositionStream(locationSettings: locationSettings).listen(
        (Position position) {
          _saveLocationOffline(
            lat: position.latitude,
            lng: position.longitude,
            accuracy: position.accuracy,
          );
        },
        onError: (error) {
          print('[GPSTracking] Error: $error');
        },
      );

      print('[GPSTracking] Started tracking location');
    } catch (e) {
      print('[GPSTracking] Initialization error: $e');
    }
  }

  /// Save location to offline database
  Future<void> _saveLocationOffline({
    required double lat,
    required double lng,
    required double accuracy,
  }) async {
    try {
      await ref.read(
        saveLocationOfflineProvider({
          lat: lat,
          lng: lng,
          accuracy: accuracy,
        }).future,
      );
    } catch (e) {
      print('[GPSTracking] Failed to save location: $e');
    }
  }

  /// Setup Firebase Cloud Messaging
  void _setupFirebaseMessaging() {
    _firebaseMessaging = FirebaseMessaging.instance;

    // Request notification permission (iOS)
    _firebaseMessaging.requestPermission();

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('[FCM] Foreground message: ${message.notification?.title}');

      // Check if this is a sync request
      if (message.data['type'] == 'sync') {
        _handleSyncRequest();
      }

      // Show local notification if available
      if (message.notification != null) {
        _showLocalNotification(
          title: message.notification?.title ?? 'Notification',
          body: message.notification?.body ?? '',
        );
      }
    });

    // Handle background/terminated messages
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('[FCM] Message opened app: ${message.notification?.title}');

      // Handle navigation based on message data
      if (message.data['type'] == 'sync') {
        _handleSyncRequest();
      }
    });

    // Get FCM token and save to user profile
    _firebaseMessaging.getToken().then((token) {
      if (token != null) {
        _saveFCMToken(token);
      }
    });

    // Listen for token refresh
    _firebaseMessaging.onTokenRefresh.listen((newToken) {
      _saveFCMToken(newToken);
    });
  }

  /// Handle sync request from push notification
  void _handleSyncRequest() {
    print('[FCM] Sync requested via push');
    ref.read(syncNotifierProvider.notifier).forceSync();

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        duration: Duration(seconds: 2),
        content: Text('Syncing updates...'),
      ),
    );
  }

  /// Save FCM token to user profile
  Future<void> _saveFCMToken(String token) async {
    try {
      // This would typically update the user's profile with the FCM token
      // await supabase.from('profiles').update({'fcm_token': token}).eq('id', userId);
      print('[FCM] Token saved: ${token.substring(0, 20)}...');
    } catch (e) {
      print('[FCM] Failed to save token: $e');
    }
  }

  /// Show local notification
  void _showLocalNotification({required String title, required String body}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 5),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(body),
          ],
        ),
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        print('[AppLifecycle] App resumed - checking for offline sync');
        if (!_isOnline) {
          // App came to foreground, check if we're online again
          _connectivity.checkConnectivity().then((result) {
            if (result != ConnectivityResult.none) {
              _handleNetworkChange(true);
            }
          });
        }
        break;
      case AppLifecycleState.paused:
        print('[AppLifecycle] App paused');
        break;
      case AppLifecycleState.detached:
        print('[AppLifecycle] App detached');
        break;
      case AppLifecycleState.inactive:
        print('[AppLifecycle] App inactive');
        break;
      case AppLifecycleState.hidden:
        print('[AppLifecycle] App hidden');
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        // Offline banner at top
        const Positioned(top: 0, left: 0, right: 0, child: OfflineBanner()),
        // Sync progress toast at bottom
        const SyncProgressToast(),
      ],
    );
  }
}

/// Wrapper widget that initializes offline mode and provides sync UI
class OfflineModeWrapper extends ConsumerWidget {
  final Widget child;
  final bool showStatusBar;
  final bool enableGPSTracking;

  const OfflineModeWrapper({
    super.key,
    required this.child,
    this.showStatusBar = true,
    this.enableGPSTracking = true,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        if (showStatusBar)
          SyncStatusBar(
            onSyncPressed: () {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text('Starting sync...')));
            },
          ),
        Expanded(
          child: MobileAppShell(
            enableOfflineMode: true,
            enableGPSTracking: enableGPSTracking,
            child: child,
          ),
        ),
      ],
    );
  }
}

/// Helper to initialize offline mode on app startup
Future<void> initializeOfflineMode() async {
  try {
    final db = OfflineDb();
    await db.init();
    print('[OfflineMode] Hive boxes initialized successfully');

    // Log diagnostics
    final diagnostics = db.getDiagnostics();
    print('[OfflineMode] Diagnostics: $diagnostics');
  } catch (e) {
    print('[OfflineMode] Initialization failed: $e');
    rethrow;
  }
}
