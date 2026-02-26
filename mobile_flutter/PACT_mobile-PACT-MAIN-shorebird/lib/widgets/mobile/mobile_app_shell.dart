 _connectivity.checkConnectivity();
      _isOnline = !(result as List).contains(ConnectivityResult.none);
      _handleNetworkChange(_isOnline);

      debugPrint('[OfflineMode] Initialization complete. Online: $_isOnline');
    } catch (e) {
      debugPrint('[OfflineMode] Initialization error: $e');
    }
  }

  /// Handle network connectivity changes
  void _handleNetworkChange(bool isOnline) {
    setState(() => _isOnline = isOnline);

    final syncManager = ref.read(syncManagerProvider);
    if (isOnline && !syncManager.isSyncing) {
      // Network came back online, force sync
      debugPrint('[OfflineMode] Network restored, forcing sync...');
      syncManager.forceSync();
    }

    debugPrint(
      '[OfflineMode] Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}',
    );

    // Show snackbar for network changes
    if (mounted) {
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
  }

  /// Start GPS tracking for location updates
  Future<void> _startGPSTracking() async {
    try {
      // Request location permission (correct method name)
      final permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        debugPrint('[GPSTracking] Location permission denied');
        return;
      }

      // Check if location services are enabled
      final isServiceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!isServiceEnabled) {
        debugPrint('[GPSTracking] Location services disabled');
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
          debugPrint('[GPSTracking] Error: $error');
        },
      );

      debugPrint('[GPSTracking] Started tracking location');
    } catch (e) {
      debugPrint('[GPSTracking] Initialization error: $e');
    }
  }

  /// Save location to offline database
  Future<void> _saveLocationOffline({
    required double lat,
    required double lng,
    required double accuracy,
  }) async {
    try {
      final db = OfflineDb();
      final location = CachedLocation(
        id: const Uuid().v4(),
        userId: '', // Will be set by sync manager if needed
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        timestamp: DateTime.now().millisecondsSinceEpoch,
        synced: false,
      );
      await db.saveLocationOffline(location);
    } catch (e) {
      debugPrint('[GPSTracking] Failed to save location: $e');
    }
  }

  /// Setup Firebase Cloud Messaging
  Future<void> _setupFirebaseMessaging() async {
    _firebaseMessaging = FirebaseMessaging.instance;

    // Request notification permission and wait for the result
    final settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    debugPrint('[FCM] Notification permission: ${settings.authorizationStatus}');

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('[FCM] Foreground message: ${message.notification?.title}');

      if (message.data['type'] == 'sync') {
        _handleSyncRequest();
      }

      if (message.notification != null) {
        _showLocalNotification(
          title: message.notification?.title ?? 'Notification',
          body: message.notification?.body ?? '',
        );
      }
    });

    // Handle background/terminated messages
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint('[FCM] Message opened app: ${message.notification?.title}');

      if (message.data['type'] == 'sync') {
        _handleSyncRequest();
      }
    });

    // Only fetch and save token if permission was granted
    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      final token = await _firebaseMessaging.getToken();
      if (token != null) {
        debugPrint('[FCM] Got token: ${token.substring(0, 20)}...');
        await _saveFCMToken(token);
      } else {
        debugPrint('[FCM] getToken() returned null');
      }
    } else {
      debugPrint('[FCM] Permission denied — skipping token registration');
    }

    // Listen for token refresh
    _firebaseMessaging.onTokenRefresh.listen((newToken) {
      _saveFCMToken(newToken);
    });
  }

  /// Handle sync request from push notification
  void _handleSyncRequest() {
    debugPrint('[FCM] Sync requested via push');
    final syncManager = ref.read(syncManagerProvider);
    syncManager.forceSync();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          duration: Duration(seconds: 2),
          content: Text('Syncing updates...'),
        ),
      );
    }
  }

  /// Save FCM token to user profile in Supabase
  Future<void> _saveFCMToken(String token) async {
    try {
      final supabase = Supabase.instance.client;
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        debugPrint('[FCM] No authenticated user, cannot save token');
        return;
      }

      final profileData = await supabase
          .from('profiles')
          .select('fcm_tokens')
          .eq('id', userId)
          .maybeSingle();

      final currentTokens = List<String>.from(
        (profileData?['fcm_tokens'] as List?) ?? [],
      );

      if (!currentTokens.contains(token)) {
        currentTokens.add(token);
        await supabase
            .from('profiles')
            .update({'fcm_tokens': currentTokens})
            .eq('id', userId);
        debugPrint('[FCM] Token saved for user $userId: ${token.substring(0, 20)}...');
      } else {
        debugPrint('[FCM] Token already registered for user $userId');
      }
    } catch (e) {
      debugPrint('[FCM] Failed to save token: $e');
    }
  }

  /// Show local notification
  void _showLocalNotification({required String title, required String body}) {
    if (!mounted) return;
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
        debugPrint('[AppLifecycle] App resumed - checking for offline sync');
        if (!_isOnline) {
          // App came to foreground, check if we're online again
          _connectivity.checkConnectivity().then((result) {
            final isOnline = !(result as List).contains(
              ConnectivityResult.none,
            );
            if (isOnline) {
              _handleNetworkChange(true);
            }
          });
        }
        break;
      case AppLifecycleState.paused:
        debugPrint('[AppLifecycle] App paused');
        break;
      case AppLifecycleState.detached:
        debugPrint('[AppLifecycle] App detached');
        break;
      case AppLifecycleState.inactive:
        debugPrint('[AppLifecycle] App inactive');
        break;
      case AppLifecycleState.hidden:
        debugPrint('[AppLifecycle] App hidden');
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
    debugPrint('[OfflineMode] Hive boxes initialized successfully');

    // Log diagnostics
    final diagnostics = db.getDiagnostics();
    debugPrint('[OfflineMode] Diagnostics: $diagnostics');
  } catch (e) {
    debugPrint('[OfflineMode] Initialization failed: $e');
    rethrow;
  }
}
