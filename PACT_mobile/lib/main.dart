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
import 'authentication/login_screen.dart';
import 'authentication/improved_register_screen.dart';
import 'authentication/forgot_password_screen.dart';
import 'authentication/biometric_prompt_screen.dart';
import 'screens/main_screen.dart';
import 'screens/wallet_screen.dart';
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
import 'services/offline/hive_adapters.dart';
import 'services/offline/offline_db.dart';
import 'screens/onboarding_screen.dart';
import 'screens/compliance_check_screen.dart';
import 'widgets/global_fund_confirmation_panel.dart';

// Conditionally import web plugins only when needed
// This prevents errors on non-web platforms
import 'utils/web_config.dart'
    if (dart.library.html) 'utils/web_config_web.dart';

// Global navigator key to use for navigation from anywhere
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// Global instance of notification routing service
final NotificationRoutingService _notificationRoutingService =
    NotificationRoutingService();

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

    // Initialize services for background context
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[FCM Background] Firebase already initialized');
    }

    // Create handler instance and process message
    final handler = BackgroundNotificationHandler();
    await handler.initialize();
    await handler.handleMessage(message, isBackground: true);

    debugPrint('[FCM Background] Message processing complete');
  } catch (e) {
    debugPrint('[FCM Background] Error handling message: $e');
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase (if present) and register background message handler
  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('Firebase.initializeApp() failed or not configured: $e');
  }

  // Register the background message handler (mobile only)
  if (!kIsWeb) {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Initialize background notification handler (manages all notifications)
    final backgroundHandler = BackgroundNotificationHandler();
    try {
      await backgroundHandler.initialize();
      debugPrint('✅ Background notification handler initialized');
    } catch (e) {
      debugPrint('❌ Background notification handler error: $e');
    }
  } else {
    debugPrint('🌐 Running on web - background notification handler skipped');
  }

  // Request all permissions on startup (location, camera, microphone, storage, notifications, etc.)
  await _requestAllPermissionsOnStartup();

  // Initialize Supabase
  await Supabase.initialize(
    url: 'https://abznugnirnlrqnnfkein.supabase.co',
    anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM',
    authOptions: const FlutterAuthClientOptions(
      authFlowType: AuthFlowType.pkce,
      autoRefreshToken: true,
    ),
  );

  // Initialize AuthenticationService so we can observe auth state changes
  await AuthenticationService().initialize();

  // Initialize Hive for local storage
  await Hive.initFlutter();

  // Register Hive type adapters for offline data models
  // CRITICAL: Must be done BEFORE opening typed boxes
  registerHiveAdapters();

  // Open boxes for offline data storage
  await Hive.openBox('tasks');
  await Hive.openBox('equipments');
  await Hive.openBox('incidentReports');
  await Hive.openBox('safetyChecklists');
  await Hive.openBox('userProfiles');
  await Hive.openBox('appSettings');
  await Hive.openBox('mapData');
  // Open sync status boxes
  await Hive.openBox('tasks_sync');
  await Hive.openBox('equipments_sync');
  await Hive.openBox('incidentReports_sync');
  await Hive.openBox('safetyChecklists_sync');
  await Hive.openBox('userProfiles_sync');

  // Initialize OfflineDb which opens typed Hive boxes used by offline services
  await OfflineDb().init();

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

  // Initialize services
  final localStorageService = LocalStorageService();
  final appPreferencesProvider = AppPreferencesProvider(localStorageService);
  await appPreferencesProvider.load();
  final connectivityService = ConnectivityService(Connectivity());
  await connectivityService.initialize();

  // Initialize map tile cache service (mobile only, not supported on web)
  if (!kIsWeb) {
    await MapTileCacheService.initialize();
  }

  // Migrate data from SharedPreferences to Hive
  final migrationService = DataMigrationService(localStorageService);
  await migrationService.migrateAllData();

  // Initialize notification service
  await NotificationService.initialize(
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
              unawaited(UserNotificationService().markAsOpened(notificationId));
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
  );

  // Initialize update service and check for updates
  final updateService = UpdateService();
  await updateService.checkForUpdatesOnStartup();
  updateService.startPeriodicUpdateCheck(); // Check every 30 minutes

  // Initialize notification routing service with navigation callback
  await _notificationRoutingService.initialize(
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
          navigatorKey.currentState?.pushNamed('/main', arguments: {'tab': 0});
          break;
        case 'wallet':
          final tab = params['tab'] == 'advances' ? 3 : 4;
          navigatorKey.currentState?.push(
            MaterialPageRoute(builder: (_) => WalletScreen(initialTab: tab)),
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
            '/main': (_) => MainScreen(),
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
            // Project list and detail routes (dynamic path: /projects/<id>)
            final _routeName = settings.name ?? '';
            if (_routeName == RouteNames.projectsList ||
                _routeName.startsWith('/projects/')) {
              return RouteGenerator.generateRoute(settings);
            }

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
                  '/main': (_) => MainScreen(),
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
                const GlobalSosOverlay(),
              ],
            );
          },
        );
      },
    );
  }
}
