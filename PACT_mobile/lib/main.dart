import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart'
    hide ChangeNotifierProvider, Consumer;
import 'package:hive_flutter/hive_flutter.dart';
import 'config/routes.dart';
import 'services/authentication_service.dart';
import 'services/biometric_auth_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_core/firebase_core.dart';
import 'services/background_notification_handler.dart';
import 'services/notification_routing_service.dart';
import 'services/debug_log_service.dart';
import 'authentication/login_screen.dart';
import 'authentication/improved_register_screen.dart';
import 'authentication/forgot_password_screen.dart';
import 'authentication/biometric_prompt_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/communications_screen.dart';
import 'screens/field_operations_enhanced_screen.dart';
import 'screens/comprehensive_monitoring_form_screen.dart';
import 'screens/approval_dashboard_screen.dart';
import 'screens/down_payment_approval_screen.dart';
import 'screens/chat_screen.dart';
import 'models/chat.dart';
import 'models/user_notification.dart';
import 'widgets/notifications_panel.dart';
import 'widgets/global_sos_overlay.dart';
import 'theme/app_colors.dart';
import 'l10n/app_localizations.dart';
import 'providers/locale_provider.dart';
import 'providers/app_preferences_provider.dart';
import 'providers/sync_provider.dart';
import 'services/connectivity_service.dart';
import 'services/local_storage_service.dart';
import 'services/data_migration_service.dart';
import 'services/notification_service.dart';
import 'services/notification_route_resolver.dart';
import 'services/update_service.dart';
import 'services/user_notification_service.dart';
import 'services/permission_handler_service.dart';
import 'services/map_tile_cache_service.dart'
    if (dart.library.html) 'services/map_tile_cache_service_web.dart';
import 'services/notification_permission_cache_service.dart';
import 'services/offline/hive_adapters.dart';
import 'services/offline/offline_db.dart';
import 'services/user_preferences_service.dart';
import 'services/chat_metadata_service.dart';
import 'services/last_call_service.dart';
import 'services/push_notification_service.dart';
import 'services/background_call_handler.dart';
import 'services/firebase_messaging_setup_service.dart';
import 'screens/onboarding_screen.dart';
import 'screens/compliance_check_screen.dart';
import 'widgets/global_fund_confirmation_panel.dart';
import 'widgets/main_layout.dart';
import 'package:flutter/gestures.dart';

// Conditionally import web plugins only when needed
// This prevents errors on non-web platforms
import 'utils/web_config.dart'
    if (dart.library.html) 'utils/web_config_web.dart';

class MyCustomScrollBehavior extends MaterialScrollBehavior {
  @override
  Set<PointerDeviceKind> get dragDevices => {
    PointerDeviceKind.touch,
    PointerDeviceKind.mouse,
    PointerDeviceKind.trackpad,
  };
}

// Global navigator key to use for navigation from anywhere
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// Global instance of notification routing service
final NotificationRoutingService _notificationRoutingService =
    NotificationRoutingService();

Widget _buildMainShell(Object? args) {
  int index = 0;
  Widget child = const DashboardScreen();
  int walletInitialTab = 0;

  if (args is Map) {
    final walletTabArg = args['walletTab'];
    if (walletTabArg is int) {
      walletInitialTab = walletTabArg;
    }

    final tabValue = args['tab']?.toString().toLowerCase().trim();
    if (tabValue == 'site_visits' || tabValue == 'site-visits' || tabValue == 'mmp') {
      index = 2;
      child = const FieldOperationsEnhancedScreen();
    } else if (tabValue == 'communications' || tabValue == 'chat') {
      index = 3;
      child = const CommunicationsScreen();
    } else if (tabValue == 'wallet') {
      index = 4;
      child = WalletScreen(initialTab: walletInitialTab);
    } else {
      final legacyTab = args['tab'];
      if (legacyTab is int) {
        switch (legacyTab) {
          case 1:
            index = 2;
            child = const FieldOperationsEnhancedScreen();
            break;
          case 2:
            index = 3;
            child = const CommunicationsScreen();
            break;
          case 3:
            index = 4;
            child = WalletScreen(initialTab: walletInitialTab);
            break;
          default:
            index = 0;
            child = const DashboardScreen();
        }
      }
    }
  }

  return MainLayout(currentIndex: index, child: child);
}

Future<void> _requestAllPermissionsOnStartup() async {
  if (!kIsWeb) {
    debugPrint('[Permissions] Requesting all permissions on startup...');
    final permissionService = PermissionHandlerService();
    final statuses = await permissionService.requestAllPermissions();

    // Log summary of permission results
    final granted = statuses.entries.where((e) => e.value.isGranted).length;
    final denied = statuses.entries.where((e) => e.value.isDenied).length;
    debugPrint(
      '[Permissions] Startup request complete: $granted granted, $denied denied',
    );
  } else {
    debugPrint('Running on web - permissions not requested');
  }
}

// Top-level background message handler for Firebase Messaging.
// Must be a top-level function to work with FCM background isolate.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    debugPrint(
      '[FCM Background] Received message: ${message.notification?.title}',
    );
    debugLog(
      'FCM_BG',
      'Received messageId=${message.messageId} title=${message.notification?.title} '
          'sentTime=${message.sentTime} data=${message.data}',
    );

    // Initialize services for background context
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[FCM Background] Firebase already initialized');
      debugLog('FCM_BG', 'Firebase already initialized');
    }

    // Initialize Hive for background isolate (needed by BilingualNotificationService)
    try {
      await Hive.initFlutter();
    } catch (e) {
      debugPrint('[FCM Background] Hive already initialized: $e');
    }

    // Initialize Supabase for background isolate (required for FCM background events)
    try {
      await Supabase.initialize(
        url: 'https://abznugnirnlrqnnfkein.supabase.co',
        anonKey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM',
        authOptions: const FlutterAuthClientOptions(
          authFlowType: AuthFlowType.pkce,
          autoRefreshToken: true,
        ),
      );
      debugPrint('[FCM Background] Supabase initialized');
    } catch (e) {
      debugPrint('[FCM Background] Supabase already initialized or failed: $e');
    }

    // Create handler instance and process message
    final handler = BackgroundNotificationHandler();
    await handler.initialize();
    await handler.handleMessage(message, isBackground: true);

    debugPrint('[FCM Background] Message processing complete');
    debugLog('FCM_BG', 'Message processing complete');
  } catch (e) {
    debugPrint('[FCM Background] Error handling message: $e');
    debugLog('FCM_BG', 'Error handling message: $e');
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load persisted debug logs written by background isolate so they appear in
  // the debug logs screen even after the background isolate exited.
  if (!kIsWeb) {
    unawaited(DebugLogService().loadFromDisk());
  }

  // Initialize Hive for local storage (needed by BilingualNotificationService, PersistentMessageStateService, etc.)
  if (!kIsWeb) {
    try {
      await Hive.initFlutter();
    } catch (e) {
      debugPrint('[Main] Hive already initialized: $e');
    }
  }

  // Register the top-level FCM background message handler (mobile only)
  if (!kIsWeb) {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  }

  // Initialize Supabase BEFORE FCM setup (FCM token save needs Supabase)
  try {
    await Supabase.initialize(
      url: 'https://abznugnirnlrqnnfkein.supabase.co',
      anonKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM',
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
        autoRefreshToken: true,
      ),
    );
    debugPrint('✅ Supabase initialized successfully');
  } catch (e) {
    debugPrint('❌ Supabase initialization error: $e');
    // App can continue in offline mode
  }

  // Initialize comprehensive Firebase Messaging setup (mobile only)
  // This handles: Firebase init, FCM token, permissions, and all message handlers
  if (!kIsWeb) {
    try {
      final fcmSetup = FirebaseMessagingSetupService();
      await fcmSetup.initialize();

      // Print diagnostic info
      debugPrint(await fcmSetup.getDiagnosticInfo());
    } catch (e) {
      debugPrint('❌ Firebase Messaging setup error: $e');
    }
  } else {
    debugPrint('🌐 Running on web - Firebase Messaging skipped');
  }

  // Register navigator key for notification routing (so taps on notifications navigate correctly)
  _notificationRoutingService.setNavigatorKey(navigatorKey);

  // Request all permissions on startup (location, camera, microphone, storage, notifications, etc.)
  // Do this in background - don't block UI startup
  unawaited(_requestAllPermissionsOnStartup());

  // Initialize AuthenticationService so we can observe auth state changes
  try {
    await AuthenticationService().initialize();
    debugPrint('✅ AuthenticationService initialized');
  } catch (e) {
    debugPrint('❌ AuthenticationService initialization error: $e');
  }

  // Initialize Hive for local storage (already called earlier for FCM background handler,
  // but try again for safety - Hive silently handles duplicate inits)
  // Register Hive type adapters for offline data models
  // CRITICAL: Must be done BEFORE opening typed boxes
  try {
    registerHiveAdapters();
    debugPrint('✅ Hive adapters registered');
  } catch (e) {
    debugPrint('⚠️ Error registering Hive adapters: $e');
  }

  // Open boxes for offline data storage with error handling
  final boxNames = [
    'tasks',
    'equipments',
    'incidentReports',
    'safetyChecklists',
    'userProfiles',
    'appSettings',
    'mapData',
    'tasks_sync',
    'equipments_sync',
    'incidentReports_sync',
    'safetyChecklists_sync',
    'userProfiles_sync',
    'pact_call_history',
    'user_profile_cache', // Ensure this box is always opened at startup
  ];

  for (final boxName in boxNames) {
    try {
      if (!Hive.isBoxOpen(boxName)) {
        await Hive.openBox(boxName);
        debugPrint('✅ Opened Hive box: $boxName');
      } else {
        debugPrint('ℹ️ Hive box already open: $boxName');
      }
    } catch (e) {
      debugPrint('⚠️ Warning opening Hive box $boxName: $e');
      // Try to recover by deleting corrupted box
      try {
        await Hive.deleteBoxFromDisk(boxName);
        if (!Hive.isBoxOpen(boxName)) {
          await Hive.openBox(boxName);
          debugPrint('✅ Recovered Hive box: $boxName');
        }
      } catch (e2) {
        debugPrint('❌ Failed to recover Hive box $boxName: $e2');
      }
    }
  }

  // Initialize OfflineDb which opens typed Hive boxes used by offline services
  try {
    await OfflineDb().init();
    debugPrint('✅ OfflineDb initialized');
  } catch (e) {
    debugPrint('⚠️ OfflineDb initialization error (app can continue): $e');
    // Don't crash the app if OfflineDb fails - offline features will just not work
  }

  // Ensure all critical boxes are opened before running app
  try {
    // Double-check that essential boxes exist
    final essentialBoxes = ['appSettings', 'userProfiles', 'pact_call_history'];
    for (final boxName in essentialBoxes) {
      if (!Hive.isBoxOpen(boxName)) {
        try {
          await Hive.openBox(boxName);
          debugPrint('✅ Re-opened essential box: $boxName');
        } catch (e) {
          debugPrint('⚠️ Could not re-open box $boxName: $e');
        }
      }
    }
  } catch (e) {
    debugPrint('⚠️ Error checking boxes: $e');
  }

  // Initialize communication feature services (Hive boxes for preferences, metadata, voice, etc.)
  try {
    await UserPreferencesService.initializeBoxes();
    debugPrint('✅ UserPreferencesService boxes initialized');
  } catch (e) {
    debugPrint('⚠️ UserPreferencesService initialization error: $e');
  }

  try {
    await ChatMetadataService.initializeBoxes();
    debugPrint('✅ ChatMetadataService boxes initialized');
  } catch (e) {
    debugPrint('⚠️ ChatMetadataService initialization error: $e');
  }

  try {
    await LastCallService.initializeBoxes();
    debugPrint('✅ LastCallService boxes initialized');
  } catch (e) {
    debugPrint('⚠️ LastCallService initialization error: $e');
  }

  // Initialize web-specific configuration and URL strategy
  configureApp();

  // Debug log - helpful for troubleshooting routing
  debugPrint('🚀 Starting PACT Consultancy app');

  // Sets the status bar to be transparent for a modern look
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor:
          Colors.transparent, // Make navigation bar transparent
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  // Enable edge-to-edge mode for better system navigation bar handling
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  // Set up a route observer for logging navigation (helps with debugging)
  final routeObserver = RouteObserver<PageRoute>();

  // Debug logging for route handling
  FlutterError.onError = (FlutterErrorDetails details) {
    if (details.exception.toString().contains('no route')) {
      debugPrint('❌ ROUTE ERROR: ${details.exception}');
    }
    FlutterError.presentError(details);
  };

  // Initialize services (lazy-loaded in background)
  final localStorageService = LocalStorageService();
  final appPreferencesProvider = AppPreferencesProvider(localStorageService);

  // Load app preferences without blocking UI
  try {
    await appPreferencesProvider.load();
    debugPrint('✅ App preferences loaded');
  } catch (e) {
    debugPrint('⚠️ App preferences load error: $e');
  }

  final connectivityService = ConnectivityService(Connectivity());

  // Initialize connectivity service in background (non-blocking)
  unawaited(
    connectivityService
        .initialize()
        .then((_) {
          debugPrint('✅ Connectivity service initialized');
        })
        .onError((e, stack) {
          debugPrint('⚠️ Connectivity service error: $e');
          return null;
        }),
  );

  // Initialize map tile cache service (mobile only, not supported on web)
  if (!kIsWeb) {
    unawaited(
      MapTileCacheService.initialize()
          .then((_) {
            debugPrint('✅ Map tile cache initialized');
          })
          .onError((e, stack) {
            debugPrint('⚠️ Map tile cache error: $e');
            return null;
          }),
    );
  }

  // Initialize notification permission cache service (for offline notification fallback)
  unawaited(
    NotificationPermissionCacheService()
        .initialize()
        .then((_) {
          debugPrint('✅ Notification permission cache initialized');
        })
        .onError((e, stack) {
          debugPrint('⚠️ Notification permission cache error: $e');
          return null;
        }),
  );

  // Migrate data from SharedPreferences to Hive (background)
  final migrationService = DataMigrationService(localStorageService);
  unawaited(
    migrationService
        .migrateAllData()
        .then((_) {
          debugPrint('✅ Data migration complete');
        })
        .onError((e, stack) {
          debugPrint('⚠️ Data migration error: $e');
          return null;
        }),
  );

  // Initialize notification service (background)
  unawaited(
    NotificationService.initialize(
          onNotificationTap: (response) {
            // Handle notification tap based on payload
            final payload = response.payload;
            if (payload != null) {
              final decision = NotificationRouteResolver.fromPayload(payload);
              NotificationRouteResolver.logDecision('main_payload', decision);

              switch (decision.kind) {
                case NotificationRouteKind.chat:
                  navigatorKey.currentState?.pushNamed(
                    '/chat',
                    arguments: decision.chatId,
                  );
                  break;
                case NotificationRouteKind.call:
                  navigatorKey.currentState?.pushNamedAndRemoveUntil(
                    '/main',
                    (route) => false,
                    arguments: {'activeCall': true},
                  );
                  break;
                case NotificationRouteKind.main:
                  final notificationId = decision.mainArgs?['notificationId'];
                  if (notificationId is String && notificationId.isNotEmpty) {
                    unawaited(
                      UserNotificationService().markAsOpened(notificationId),
                    );
                  }
                  navigatorKey.currentState?.pushNamed(
                    '/main',
                    arguments: decision.mainArgs,
                  );
                  break;
                case NotificationRouteKind.wallet:
                  navigatorKey.currentState?.push(
                    MaterialPageRoute(
                      builder: (_) =>
                          WalletScreen(initialTab: decision.walletTab ?? 3),
                    ),
                  );
                  break;
                case NotificationRouteKind.notificationsPanel:
                  final ctx = navigatorKey.currentContext;
                  if (ctx != null) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      NotificationsPanel.show(
                        ctx,
                        initialTab: decision.panelTab ?? 'broadcasts',
                      );
                    });
                  }
                  break;
                case NotificationRouteKind.updateDownload:
                  UpdateService().downloadAndInstallUpdate();
                  break;
                case NotificationRouteKind.sync:
                case NotificationRouteKind.none:
                  break;
              }
            }
          },
        )
        .then((_) {
          debugPrint('✅ Notification service initialized');
        })
        .onError((e, stack) {
          debugPrint('⚠️ Notification service error: $e');
          return null;
        }),
  );

  // Initialize update service (background)
  final updateService = UpdateService();
  unawaited(
    updateService
        .checkForUpdatesOnStartup()
        .then((_) {
          debugPrint('✅ Update check complete');
          updateService.startPeriodicUpdateCheck();
        })
        .onError((e, stack) {
          debugPrint('⚠️ Update check error: $e');
          return null;
        }),
  );

  // Initialize notification routing service with navigation callback (background)
  unawaited(
    _notificationRoutingService
        .initialize(
          onNotificationTap: (route, params) {
            debugPrint(
              '[AppStartup] Notification routing: $route with params: $params',
            );

            // Use the navigator key to navigate based on route
            switch (route) {
              case 'chat':
                navigatorKey.currentState?.pushNamed(
                  '/chat',
                  arguments: params['userId'],
                );
                break;
              case 'call':
                navigatorKey.currentState?.pushNamedAndRemoveUntil(
                  '/main',
                  (route) => false,
                  arguments: {'activeCall': true, 'callId': params['callId']},
                );
                break;
              case 'communications':
                navigatorKey.currentState?.pushNamed(
                  '/main',
                  arguments: {'tab': 'communications'},
                );
                break;
              case 'wallet':
                final tab = params['tab'] == 'advances' ? 3 : 4;
                navigatorKey.currentState?.pushNamed(
                  '/main',
                  arguments: {'tab': 'wallet', 'walletTab': tab},
                );
                break;
              case 'notifications':
                final ctx = navigatorKey.currentContext;
                if (ctx != null) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    NotificationsPanel.show(ctx, initialTab: 'broadcasts');
                  });
                }
                break;
              default:
                navigatorKey.currentState?.pushNamed('/main');
            }
          },
        )
        .then((_) {
          debugPrint('✅ Notification routing service initialized');
        })
        .onError((e, stack) {
          debugPrint('⚠️ Notification routing error: $e');
          return null;
        }),
  );

  // Initialize realtime notification service for chat and MMP files
  // Note: This will be activated after user logs in

  debugPrint(
    '📱 Notification services initialized (enhanced with FCM + ringtones)',
  );

  // Check authentication state and biometric status
  final currentUser = Supabase.instance.client.auth.currentUser;
  String initialRoute = '/login';

  // First check if biometrics are enabled and available (independent of Supabase login)
  try {
    final biometricService = BiometricAuthService();
    final isBiometricEnabled = await biometricService.isBiometricEnabled();
    final isBiometricAvailable = await biometricService.isBiometricAvailable();

    if (isBiometricEnabled && isBiometricAvailable) {
      // Show biometric prompt screen for authentication
      initialRoute = '/biometric-prompt';
      debugPrint(
        '🔐 Biometric authentication enabled, showing biometric prompt',
      );
    } else if (currentUser != null) {
      // User is logged in but no biometrics, go to main
      initialRoute = '/main';
      debugPrint('✅ User logged in, no biometrics, going to main screen');
    } else {
      // No biometrics and not logged in, go to login
      initialRoute = '/login';
      debugPrint(
        '🔑 No biometrics enabled and user not logged in, showing login screen',
      );
    }
  } catch (e) {
    debugPrint('❌ Error checking biometric status: $e');
    // Fallback: check Supabase auth if biometric check fails
    if (currentUser != null) {
      initialRoute = '/main';
    } else {
      initialRoute = '/login';
    }
  }

  // Runs the main application
  runApp(
    ProviderScope(
      child: MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (context) => LocaleProvider()),
          ChangeNotifierProvider.value(value: appPreferencesProvider),
          ChangeNotifierProvider(
            create: (context) => SyncProvider(
              Supabase.instance.client,
              localStorageService,
              connectivityService,
            ),
          ),
        ],
        child: MyApp(routeObserver: routeObserver, initialRoute: initialRoute),
      ),
    ),
  );
}

class MyApp extends StatefulWidget {
  final RouteObserver<PageRoute>? routeObserver;
  final String initialRoute;

  const MyApp({super.key, this.routeObserver, required this.initialRoute});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  StreamSubscription<UserNotification>? _globalBroadcastSub;
  final List<UserNotification> _pendingBlockingBroadcasts = [];
  bool _isShowingBlockingBroadcast = false;

  @override
  void initState() {
    super.initState();
    _globalBroadcastSub = UserNotificationService().broadcastStream.listen(
      _onBroadcastReceived,
    );

    // Initialize push notifications and background handlers
    _initializePushNotifications();
  }

  Future<void> _initializePushNotifications() async {
    try {
      // Initialize push notification service
      await PushNotificationService.instance.initialize();
      debugPrint('✅ Push Notification Service initialized');

      // Listen for incoming notifications
      PushNotificationService.instance.notificationStream.stream.listen((
        payload,
      ) {
        _handleIncomingNotification(payload);
      });

      // Initialize background call handler
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId != null) {
        await BackgroundCallHandler().initialize(
          userId: userId,
          userName:
              Supabase
                  .instance
                  .client
                  .auth
                  .currentUser
                  ?.userMetadata?['name'] ??
              'User',
        );
        debugPrint('✅ Background Call Handler initialized');
      }
    } catch (e) {
      debugPrint('❌ Error initializing push notifications: $e');
    }
  }

  void _handleIncomingNotification(NotificationPayload payload) {
    final context = navigatorKey.currentContext;
    if (context == null) return;

    switch (payload.type) {
      case 'call':
        _handleIncomingCall(payload);
        break;
      case 'message':
        _handleIncomingMessage(payload);
        break;
      case 'broadcast':
        _handleBroadcast(payload);
        break;
      default:
        debugPrint('Unknown notification type: ${payload.type}');
    }
  }

  void _handleIncomingCall(NotificationPayload payload) {
    debugPrint('Incoming call from: ${payload.senderId}');
    // Show full-screen call notification
    // This will be handled by call screen
  }

  void _handleIncomingMessage(NotificationPayload payload) {
    debugPrint('Incoming message from: ${payload.senderId}');
    ScaffoldMessenger.of(navigatorKey.currentContext!).showSnackBar(
      SnackBar(
        content: Text(payload.title),
        duration: const Duration(seconds: 5),
      ),
    );
  }

  void _handleBroadcast(NotificationPayload payload) {
    debugPrint('Broadcast: ${payload.title}');
  }

  @override
  void dispose() {
    _globalBroadcastSub?.cancel();
    super.dispose();
  }

  void _onBroadcastReceived(UserNotification notification) {
    final priority = notification.priority.toLowerCase().trim();
    final isBlockingPriority = priority == 'high' || priority == 'urgent';
    if (!isBlockingPriority) return;

    final alreadyQueued = _pendingBlockingBroadcasts.any(
      (n) => n.id == notification.id,
    );
    if (alreadyQueued) return;

    if (_isShowingBlockingBroadcast) {
      _pendingBlockingBroadcasts.add(notification);
      return;
    }

    unawaited(_showBlockingBroadcast(notification));
  }

  Future<void> _showBlockingBroadcast(UserNotification notification) async {
    final rootContext = navigatorKey.currentContext;
    if (rootContext == null) {
      _pendingBlockingBroadcasts.add(notification);
      return;
    }

    _isShowingBlockingBroadcast = true;

    final service = UserNotificationService();

    await showDialog<void>(
      context: rootContext,
      barrierDismissible: false,
      builder: (dialogContext) {
        return PopScope(
          canPop: false,
          child: Material(
            color: const Color(0xB3000000),
            child: SafeArea(
              child: Container(
                width: double.infinity,
                height: double.infinity,
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFB91C1C),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.warning_amber_rounded,
                            color: Colors.white,
                            size: 28,
                          ),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'High Priority Broadcast / بث عالي الأولوية',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                notification.title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                              if (notification.titleAr.isNotEmpty &&
                                  notification.titleAr != notification.title)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    notification.titleAr,
                                    textDirection: TextDirection.rtl,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 16,
                                    ),
                                  ),
                                ),
                              const SizedBox(height: 12),
                              Text(notification.message),
                              if (notification.messageAr.isNotEmpty &&
                                  notification.messageAr !=
                                      notification.message)
                                Padding(
                                  padding: const EdgeInsets.only(top: 6),
                                  child: Text(
                                    notification.messageAr,
                                    textDirection: TextDirection.rtl,
                                  ),
                                ),
                              const SizedBox(height: 16),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFEE2E2),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Text(
                                  'You must acknowledge this alert before continuing. / يجب تأكيد هذا التنبيه قبل المتابعة.',
                                  style: TextStyle(fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFB91C1C),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: () async {
                        await service.markAsOpened(notification.id);
                        await service.markAsRead(notification.id);

                        if (dialogContext.mounted) {
                          Navigator.of(dialogContext).pop();
                        }

                        final ctx = navigatorKey.currentContext;
                        if (ctx != null) {
                          WidgetsBinding.instance.addPostFrameCallback((_) {
                            NotificationsPanel.show(
                              ctx,
                              initialTab: 'broadcasts',
                            );
                          });
                        }
                      },
                      child: const Text('Acknowledge / تأكيد'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );

    _isShowingBlockingBroadcast = false;
    if (_pendingBlockingBroadcasts.isNotEmpty) {
      final next = _pendingBlockingBroadcasts.removeAt(0);
      unawaited(_showBlockingBroadcast(next));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<LocaleProvider, AppPreferencesProvider>(
      builder: (context, localeProvider, appPreferences, child) {
        return MaterialApp(
          scrollBehavior: MyCustomScrollBehavior(),
          // App title shown in task switcher
          title: 'Pact Consultancy',

          // Removes the debug banner in the top-right corner
          debugShowCheckedModeBanner: false,

          // Reactive locale from provider
          locale: localeProvider.locale,

          themeMode: appPreferences.darkMode ? ThemeMode.dark : ThemeMode.light,

          // Localization support
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [
            Locale('en', ''), // English
            Locale('ar', ''), // Arabic
          ],

          // Define themes using app appearance preferences
          theme: ThemeData(
            primaryColor: AppColors.primaryOrange,
            useMaterial3: true,
            visualDensity: appPreferences.compactDisplay
                ? VisualDensity.compact
                : VisualDensity.standard,
            colorScheme: ColorScheme.fromSeed(
              seedColor: AppColors.primaryOrange,
              primary: AppColors.primaryOrange,
              secondary: AppColors.primaryBlue,
              surface: AppColors.primaryWhite,
              surfaceContainerHighest: AppColors.backgroundGray,
              brightness: Brightness.light,
            ),
            appBarTheme: const AppBarTheme(
              backgroundColor: Colors.transparent,
              elevation: 0,
              centerTitle: true,
              iconTheme: IconThemeData(color: AppColors.textDark),
              titleTextStyle: TextStyle(
                color: AppColors.textDark,
                fontSize: 22,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
          ),
          darkTheme: ThemeData(
            useMaterial3: true,
            visualDensity: appPreferences.compactDisplay
                ? VisualDensity.compact
                : VisualDensity.standard,
            colorScheme: ColorScheme.fromSeed(
              seedColor: AppColors.primaryOrange,
              primary: AppColors.primaryOrange,
              secondary: AppColors.primaryBlue,
              brightness: Brightness.dark,
            ),
          ),

          // Set up routing for proper URL display
          // Do not set home when using initialRoute
          initialRoute: widget.initialRoute,

          // Define routes for navigation throughout the app
          routes: {
            '/': (_) => LoginScreen(),
            '/login': (_) => LoginScreen(),
            '/biometric-prompt': (_) => BiometricPromptScreen(),
            '/register': (_) => ImprovedRegisterScreen(),
            '/forgot-password': (_) => ForgotPasswordScreen(),
            '/main': (context) =>
                _buildMainShell(ModalRoute.of(context)?.settings.arguments),
            '/field-operations': (_) => FieldOperationsEnhancedScreen(),
            '/comprehensive-monitoring': (_) =>
                ComprehensiveMonitoringFormScreen(),
            '/approvals': (_) => const ApprovalDashboardScreen(),
            '/down-payment-approval': (_) => const DownPaymentApprovalScreen(),
            // New enhancement routes
            '/onboarding': (_) => OnboardingScreen(),
            '/compliance': (_) => ComplianceCheckScreen(),
          },

          // Backup with onGenerateRoute for dynamic routes and better debugging
          onGenerateRoute: (settings) {
            debugPrint('⚠️ Fallback route generation: ${settings.name}');

            // Handle /chat route with Chat argument or chatId string
            if (settings.name == '/chat') {
              final args = settings.arguments;
              if (args is Chat) {
                return MaterialPageRoute(
                  settings: settings,
                  builder: (context) => ChatScreen(chat: args),
                );
              }
              // If args is a Map (from notification with chatId and senderId)
              if (args is Map<String, dynamic>) {
                final chatId = args['chatId'] as String?;
                final senderId = args['senderId'] as String?;
                if (chatId != null) {
                  debugPrint(
                    '📱 Chat route with chatId: $chatId, senderId: $senderId',
                  );
                  // Create Chat object with sender info
                  final chat = Chat(
                    id: chatId,
                    isGroup: false,
                    name: 'Chat',
                    type: 'private',
                    createdAt: DateTime.now(),
                    updatedAt: DateTime.now(),
                    otherParticipantId: senderId,
                  );
                  return MaterialPageRoute(
                    settings: settings,
                    builder: (context) => ChatScreen(chat: chat),
                  );
                }
              }
              // If args is a string (chatId from notification), create a minimal Chat object
              if (args is String) {
                final chatId = args;
                debugPrint('📱 Chat route with chatId: $chatId');
                // Create a minimal Chat object - the ChatScreen will load full details
                final chat = Chat(
                  id: chatId,
                  isGroup: false,
                  name: 'Chat',
                  type: 'private',
                  createdAt: DateTime.now(),
                  updatedAt: DateTime.now(),
                );
                return MaterialPageRoute(
                  settings: settings,
                  builder: (context) => ChatScreen(chat: chat),
                );
              }
              // Fallback for unknown argument types
              debugPrint('⚠️ Chat route called without proper argument');
              return MaterialPageRoute(
                builder: (context) => const Scaffold(
                  body: Center(child: Text('Unable to open chat')),
                ),
              );
            }

            // Only for routes not defined in routes map
            switch (settings.name) {
              // Professional call screen routes
              case '/incoming-call-professional':
              case '/active-call-professional':
                return RouteGenerator.generateRoute(settings);

              case '/login':
              case '/biometric-prompt':
              case '/register':
              case '/forgot-password':
              case '/main':
              case '/':
                // These should be handled by the routes map above
                // Just a fallback
                final routeBuilders = {
                  '/': (_) => LoginScreen(),
                  '/login': (_) => LoginScreen(),
                  '/biometric-prompt': (_) => BiometricPromptScreen(),
                  '/register': (_) => ImprovedRegisterScreen(),
                  '/forgot-password': (_) => ForgotPasswordScreen(),
                  '/main': (_) => _buildMainShell(settings.arguments),
                };

                final builder = routeBuilders[settings.name];
                if (builder != null) {
                  return PageRouteBuilder(
                    settings: settings,
                    pageBuilder: (context, animation, secondaryAnimation) =>
                        builder(context),
                    transitionsBuilder:
                        (context, animation, secondaryAnimation, child) {
                          return FadeTransition(
                            opacity: animation,
                            child: child,
                          );
                        },
                  );
                }
                return null;
              default:
                // If route not found, pass to onUnknownRoute
                return null;
            }
          },

          // Handle unknown routes (404 page)
          onUnknownRoute: (settings) {
            debugPrint('Unknown route: ${settings.name}');
            return MaterialPageRoute(
              builder: (context) => Scaffold(
                body: Center(child: Text('Page not found: ${settings.name}')),
              ),
            );
          },

          // Add route observer for logging navigation
          navigatorObservers: [?widget.routeObserver],

          // Use global navigator key for navigation
          navigatorKey: navigatorKey,

          // Wrap with global fund confirmation panel
          builder: (context, child) {
            final mediaQuery = MediaQuery.of(context);
            final scaledChild = MediaQuery(
              data: mediaQuery.copyWith(
                textScaler: TextScaler.linear(appPreferences.fontScale),
              ),
              child: child ?? const SizedBox.shrink(),
            );

            return Stack(
              children: [
                scaledChild,
                const GlobalFundConfirmationPanel(),
                Overlay(
                  initialEntries: [
                    OverlayEntry(
                      builder: (context) => const GlobalSosOverlay(),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );
  }
}
