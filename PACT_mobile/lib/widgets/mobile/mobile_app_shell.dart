import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import '../../services/offline/offline_db.dart';
import '../../services/offline/models.dart';
import '../../screens/wallet_screen.dart';
import '../../providers/offline_provider.dart';
import '../../services/notification_route_resolver.dart';
import '../../services/user_notification_service.dart';
import '../notifications_panel.dart';
import '../offline/sync_status_widget.dart'
    show SyncStatusBar, SyncProgressToast, OfflineBanner;

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
    this.autoSyncIntervalMs = 60000,
  });

  @override
  ConsumerState<MobileAppShell> createState() => _MobileAppShellState();
}

class _MobileAppShellState extends ConsumerState<MobileAppShell>
    with WidgetsBindingObserver {
  // Initialized directly — no `late` to avoid LateInitializationError
  final Connectivity _connectivity = Connectivity();
  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  bool _isOnline = true;
  bool _fcmInitialized = false;

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

      _connectivity.onConnectivityChanged.listen((result) {
        final isOnline = !(result as List).contains(ConnectivityResult.none);
        _handleNetworkChange(isOnline);
      });

      final result = await _connectivity.checkConnectivity();
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
      debugPrint('[OfflineMode] Network restored, forcing sync...');
      syncManager.forceSync();
    }

    debugPrint(
      '[OfflineMode] Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}',
    );

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
      final permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        debugPrint('[GPSTracking] Location permission denied');
        return;
      }

      final isServiceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!isServiceEnabled) {
        debugPrint('[GPSTracking] Location services disabled');
        return;
      }

      const locationSettings = LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 100,
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
        userId: '',
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

  /// Setup Firebase Cloud Messaging — properly awaits permission before fetching token
  Future<void> _setupFirebaseMessaging() async {
    try {
      final settings = await _firebaseMessaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      debugPrint(
        '[FCM] Notification permission: ${settings.authorizationStatus}',
      );

      // ── Foreground: app is open ──────────────────────────────────────────────
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('[FCM] Foreground message: ${message.notification?.title}');
        final msgType = _resolveType(message);
        if (msgType == 'sync') {
          _handleSyncRequest();
          return;
        }
        _showForegroundBanner(message);
      });

      // ── Background tap: app was in background, user tapped notification ──────
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        debugPrint(
          '[FCM] Opened from background: ${message.notification?.title}',
        );
        // Small delay so the navigator is fully mounted
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _routeFromFCMMessage(message);
        });
      });

      // ── Terminated tap: app was fully closed, user tapped notification ────────
      // getInitialMessage() returns the message that launched the app from killed state.
      final initialMessage = await FirebaseMessaging.instance
          .getInitialMessage();
      if (initialMessage != null) {
        debugPrint('[FCM] App launched from terminated state via notification');
        WidgetsBinding.instance.addPostFrameCallback((_) {
          // Give the app a bit more time to fully initialise routes
          Future.delayed(const Duration(milliseconds: 500), () {
            _routeFromFCMMessage(initialMessage);
          });
        });
      }

      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        final token = await _firebaseMessaging.getToken();
        if (token != null) {
          debugPrint('[FCM] Got token: ${token.substring(0, 20)}...');
          await _saveFCMToken(token);
          _fcmInitialized = true;
        } else {
          debugPrint('[FCM] getToken() returned null');
        }
      } else {
        debugPrint('[FCM] Permission denied — skipping token registration');
      }

      _firebaseMessaging.onTokenRefresh.listen((newToken) {
        _saveFCMToken(newToken);
      });
    } catch (e) {
      debugPrint('[FCM] Setup error: $e');
    }
  }

  /// Resolve the notification type from FCM data — prefers `notification_type`, falls back to `type`.
  String _resolveType(RemoteMessage message) {
    final d = message.data;
    return (d['notification_type'] as String? ?? d['type'] as String? ?? '')
        .toLowerCase();
  }

  // ─── Unified deep-link router ────────────────────────────────────────────────
  /// Called when the user taps a notification to open the app (background or terminated state).
  /// Routes to the appropriate screen based on notification_type / data payload.
  void _routeFromFCMMessage(RemoteMessage message) {
    if (!mounted) return;
    final data = message.data;
    final type = _resolveType(message);
    final navigator = Navigator.of(context, rootNavigator: true);
    final decision = NotificationRouteResolver.fromFcmMessage(
      type: type,
      data: data,
    );
    final notificationId =
        (data['notification_id'] ?? data['notificationId'] ?? data['id'] ?? '')
            .toString();
    if (notificationId.isNotEmpty) {
      unawaited(UserNotificationService().markAsOpened(notificationId));
    }

    debugPrint('[FCM] Routing for type="$type" data=$data');
    NotificationRouteResolver.logDecision('mobile_shell_fcm', decision);

    switch (decision.kind) {
      case NotificationRouteKind.sync:
        _handleSyncRequest();
        return;

      case NotificationRouteKind.wallet:
        navigator.push(
          MaterialPageRoute(
            builder: (_) => WalletScreen(initialTab: decision.walletTab ?? 3),
          ),
        );
        return;

      case NotificationRouteKind.notificationsPanel:
        if (mounted) {
          NotificationsPanel.show(context, initialTab: decision.panelTab);
        }
        return;

      case NotificationRouteKind.main:
        navigator.pushNamed('/main', arguments: decision.mainArgs);
        return;

      case NotificationRouteKind.chat:
        navigator.pushNamed('/chat', arguments: decision.chatId);
        return;
      case NotificationRouteKind.call:
        navigator.pushNamedAndRemoveUntil(
          '/main',
          (route) => false,
          arguments: {'activeCall': true},
        );
        return;
      case NotificationRouteKind.updateDownload:
      case NotificationRouteKind.none:
      default:
        if (mounted) {
          NotificationsPanel.show(context, initialTab: 'all');
        }
        return;
    }
  }

  // ─── Foreground banner ────────────────────────────────────────────────────────
  /// Shown when a push arrives while the app is in the foreground.
  /// Displays a colour-coded SnackBar with title/body and a tap-action button.
  void _showForegroundBanner(RemoteMessage message) {
    if (!mounted) return;
    final data = message.data;
    final type = _resolveType(message);
    final title =
        message.notification?.title ??
        data['title']?.toString() ??
        'Notification / إشعار';
    final body = message.notification?.body ?? data['body']?.toString() ?? '';
    final priority = data['priority']?.toString() ?? 'normal';

    // Choose banner colour based on type / priority
    Color bannerColor;
    IconData bannerIcon;
    String actionLabel;

    if (priority == 'urgent') {
      bannerColor = Colors.red.shade700;
      bannerIcon = Icons.warning_rounded;
      actionLabel = NotificationRouteResolver.localizedActionLabelForType(type);
    } else {
      switch (type) {
        case 'broadcast':
          bannerColor = Colors.indigo.shade700;
          bannerIcon = Icons.campaign;
          actionLabel = NotificationRouteResolver.localizedActionLabelForType(
            type,
          );
          break;
        case 'fund_receipt_confirmation':
        case 'advance_disbursed':
          bannerColor = Colors.green.shade700;
          bannerIcon = Icons.account_balance_wallet;
          actionLabel = NotificationRouteResolver.localizedActionLabelForType(
            type,
          );
          break;
        case 'cost_submission_approved':
        case 'cost_submission_rejected':
        case 'cost_submission_revision':
          bannerColor = Colors.blue.shade700;
          bannerIcon = Icons.receipt_long;
          actionLabel = NotificationRouteResolver.localizedActionLabelForType(
            type,
          );
          break;
        case 'withdrawal_approved':
        case 'withdrawal_rejected':
          bannerColor = Colors.teal.shade700;
          bannerIcon = Icons.payments;
          actionLabel = NotificationRouteResolver.localizedActionLabelForType(
            type,
          );
          break;
        default:
          bannerColor = priority == 'high'
              ? Colors.orange.shade700
              : Colors.blueGrey.shade700;
          bannerIcon = Icons.notifications;
          actionLabel = NotificationRouteResolver.localizedActionLabelForType(
            type,
          );
      }
    }

    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 10),
        backgroundColor: bannerColor,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        content: Row(
          children: [
            Icon(bannerIcon, color: Colors.white, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      fontSize: 13,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      body,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.white70,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: actionLabel,
          textColor: Colors.yellow,
          onPressed: () {
            ScaffoldMessenger.of(context).hideCurrentSnackBar();
            _routeFromFCMMessage(message);
          },
        ),
      ),
    );
  }

  /// Re-register FCM token when app resumes (in case it wasn't registered yet)
  Future<void> _refreshFCMToken() async {
    if (_fcmInitialized) return;
    try {
      final token = await _firebaseMessaging.getToken();
      if (token != null) {
        await _saveFCMToken(token);
        _fcmInitialized = true;
      }
    } catch (e) {
      debugPrint('[FCM] Token refresh failed: $e');
    }
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
          content: Text('Syncing updates... / جارٍ مزامنة التحديثات...'),
        ),
      );
    }
  }

  /// Save FCM token to user profile in Supabase — shows visible feedback
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
        debugPrint(
          '[FCM] Token saved for user $userId: ${token.substring(0, 20)}...',
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              duration: Duration(seconds: 3),
              backgroundColor: Color(0xFF1976D2),
              content: Text(
                'Push notifications activated / تم تفعيل الإشعارات',
                style: TextStyle(color: Colors.white),
              ),
            ),
          );
        }
      } else {
        debugPrint('[FCM] Token already registered for user $userId');
        _fcmInitialized = true;
      }
    } catch (e) {
      debugPrint('[FCM] Failed to save token: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 4),
            backgroundColor: Colors.red.shade700,
            content: Text(
              'Push setup error: $e',
              style: const TextStyle(color: Colors.white, fontSize: 12),
            ),
          ),
        );
      }
    }
  }

  /// Show local notification as snackbar when app is in foreground
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
        debugPrint('[AppLifecycle] App resumed');
        _refreshFCMToken();
        if (!_isOnline) {
          _connectivity.checkConnectivity().then((result) {
            final isOnline = !(result as List).contains(
              ConnectivityResult.none,
            );
            if (isOnline) _handleNetworkChange(true);
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
        const Positioned(top: 0, left: 0, right: 0, child: OfflineBanner()),
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

    final diagnostics = db.getDiagnostics();
    debugPrint('[OfflineMode] Diagnostics: $diagnostics');
  } catch (e) {
    debugPrint('[OfflineMode] Initialization failed: $e');
    rethrow;
  }
}
