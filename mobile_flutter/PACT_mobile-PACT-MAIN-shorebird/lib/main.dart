// lib/main.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart' hide ChangeNotifierProvider, Consumer;
import 'package:hive_flutter/hive_flutter.dart';
import 'services/authentication_service.dart';
import '../services/biometric_auth_service.dart';
import 'authentication/login_screen.dart';
import 'authentication/improved_register_screen.dart';
import 'authentication/forgot_password_screen.dart';
import 'authentication/biometric_prompt_screen.dart';
import 'screens/main_screen.dart';
import 'screens/field_operations_enhanced_screen.dart';
import 'screens/comprehensive_monitoring_form_screen.dart';
import 'theme/app_colors.dart';
import 'l10n/app_localizations.dart';
import 'providers/locale_provider.dart';
import 'providers/sync_provider.dart';
import 'services/connectivity_service.dart';
import 'services/local_storage_service.dart';
import 'services/data_migration_service.dart';
import 'services/offline_data_service.dart';
import 'services/notification_service.dart';
import 'services/update_service.dart';
import 'services/map_tile_cache_service.dart'
    if (dart.library.html) 'services/map_tile_cache_service_web.dart';

// Conditionally import web plugins only when needed
// This prevents errors on non-web platforms
import 'utils/web_config.dart'
    if (dart.library.html) 'utils/web_config_web.dart';

// Global navigator key to use for navigation from anywhere
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> _requestLocationPermission() async {
  if (!kIsWeb) {
    var status = await Permission.location.request();
    if (status.isGranted) {
      debugPrint('Location permission granted');
    } else {
      debugPrint('Location permission denied');
    }
  } else {
    debugPrint('Running on web - location permissions not requested');
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Request location permission
  await _requestLocationPermission();

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

  // Initialize web-specific configuration and URL strategy
  configureApp();

  // Debug log - helpful for troubleshooting routing
  debugPrint('🚀 Starting PACT Consultancy app');

  // Sets the status bar to be transparent for a modern look
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.transparent, // Make navigation bar transparent
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
  final connectivityService = ConnectivityService(Connectivity());
  await connectivityService.initialize();

  // Initialize offline data services
  await OfflineDataService.initialize();

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
        if (payload.startsWith('chat:')) {
          // Navigate to specific chat
          final chatId = payload.substring(5);
          navigatorKey.currentState?.pushNamed('/chat', arguments: chatId);
        }
        // MMP code commented out
        // else if (payload.startsWith('mmp:')) {
        //   // Navigate to MMP file details
        //   final fileId = payload.substring(4);
        //   navigatorKey.currentState
        //       ?.pushNamed('/mmp-detail', arguments: fileId);
        // }
        else if (payload.startsWith('notif:')) {
          final notificationId = payload.substring(6);
          navigatorKey.currentState?.pushNamed(
            '/main',
            arguments: {'notificationId': notificationId},
          );        } else if (payload.startsWith('cost_submission_approved:')) {
          final submissionId = payload.substring(24);
          navigatorKey.currentState?.pushNamed(
            '/main',
            arguments: {'costSubmissionId': submissionId, 'tab': 'cost_submissions'},
          );
        } else if (payload.startsWith('cost_submission_rejected:')) {
          final submissionId = payload.substring(24);
          navigatorKey.currentState?.pushNamed(
            '/main',
            arguments: {'costSubmissionId': submissionId, 'tab': 'cost_submissions'},
          );
        } else if (payload.startsWith('cost_submission_revision:')) {
          final submissionId = payload.substring(23);
          navigatorKey.currentState?.pushNamed(
            '/main',
            arguments: {'costSubmissionId': submissionId, 'tab': 'cost_submissions'},
          );
        } else if (payload.startsWith('budget_alert:')) {
          final siteVisitId = payload.substring(13);
          navigatorKey.currentState?.pushNamed(
            '/main',
            arguments: {'siteVisitId': siteVisitId, 'tab': 'cost_submissions'},
          );
        } else if (payload == 'offline_sync_completed') {
          navigatorKey.currentState?.pushNamed(
            '/main',
            arguments: {'tab': 'cost_submissions'},
          );        } else if (payload.startsWith('update:')) {
          // Handle update notification tap
          UpdateService().downloadAndInstallUpdate();
        }
      }
    },
  );

  // Initialize update service and check for updates
  final updateService = UpdateService();
  await updateService.checkForUpdatesOnStartup();
  updateService.startPeriodicUpdateCheck(); // Check every 30 minutes

  // Initialize realtime notification service for chat and MMP files
  // Note: This will be activated after user logs in

  debugPrint('📱 Notification services initialized');

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
      debugPrint('🔐 Biometric authentication enabled, showing biometric prompt');
    } else if (currentUser != null) {
      // User is logged in but no biometrics, go to main
      initialRoute = '/main';
      debugPrint('✅ User logged in, no biometrics, going to main screen');
    } else {
      // No biometrics and not logged in, go to login
      initialRoute = '/login';
      debugPrint('🔑 No biometrics enabled and user not logged in, showing login screen');
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

class MyApp extends StatelessWidget {
  final RouteObserver<PageRoute>? routeObserver;
  final String initialRoute;

  const MyApp({super.key, this.routeObserver, required this.initialRoute});

  @override
  Widget build(BuildContext context) {
    return Consumer<LocaleProvider>(
      builder: (context, localeProvider, child) {
        return MaterialApp(
          // App title shown in task switcher
          title: 'Pact Consultancy',

          // Removes the debug banner in the top-right corner
          debugShowCheckedModeBanner: false,

          // Reactive locale from provider
          locale: localeProvider.locale,

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

          // Define theme using AppColors
          theme: ThemeData(
            primaryColor: AppColors.primaryOrange,
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: AppColors.primaryOrange,
              primary: AppColors.primaryOrange,
              secondary: AppColors.primaryBlue,
              surface: AppColors.primaryWhite,
              background: AppColors.backgroundGray,
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

          // Set up routing for proper URL display
          // Do not set home when using initialRoute
          initialRoute: initialRoute,

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
          },

          // Backup with onGenerateRoute for dynamic routes and better debugging
          onGenerateRoute: (settings) {
            debugPrint('⚠️ Fallback route generation: ${settings.name}');

            // Only for routes not defined in routes map
            switch (settings.name) {
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
                      return FadeTransition(opacity: animation, child: child);
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
          navigatorObservers: [if (routeObserver != null) routeObserver!],

          // Use global navigator key for navigation
          navigatorKey: navigatorKey,
        );
      },
    );
  }
}
