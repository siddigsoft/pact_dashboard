import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import './debug_log_service.dart';
import './background_notification_handler.dart';
import './call_notification_service.dart';
import './bilingual_notification_service.dart';
import './ringtone_service.dart';
import './notification_routing_service.dart';

/// Comprehensive Firebase Messaging setup service.
/// Ensures proper initialization of FCM for all app states (foreground, background, terminated).
class FirebaseMessagingSetupService {
  static final FirebaseMessagingSetupService _instance =
      FirebaseMessagingSetupService._internal();

  factory FirebaseMessagingSetupService() => _instance;
  FirebaseMessagingSetupService._internal();

  bool _isInitialized = false;
  FirebaseMessaging? _firebaseMessaging;
  String? _fcmToken;

  bool get isInitialized => _isInitialized;
  String? get fcmToken => _fcmToken;

  /// Initialize Firebase Messaging completely.
  /// This must be called ONCE in main() before the app starts.
  /// For mobile only; web is skipped.
  Future<void> initialize() async {
    if (_isInitialized || kIsWeb) return;

    try {
      debugPrint(
        '[FCM Setup] ========== FIREBASE MESSAGING INITIALIZATION START ==========',
      );
      debugLog('FCM_SETUP', 'Initialization START');

      // Step 1: Ensure Firebase is initialized
      await _initializeFirebase();

      // Step 2: Get FirebaseMessaging instance
      _firebaseMessaging = FirebaseMessaging.instance;

      // Step 3: Initialize notification services (CallNotificationService, etc.)
      await _initializeNotificationServices();

      // Step 4: Request notification permissions (iOS 13+, Android 13+)
      await _requestNotificationPermissions();

      // Step 5: Setup all message handlers (foreground, background, terminated)
      _setupMessageHandlers();

      // Step 6: Get and persist FCM token
      await _retrieveAndPersistToken();

      // Step 7: Listen for token refreshes
      _setupTokenRefreshListener();

      _isInitialized = true;

      debugPrint(
        '[FCM Setup] ========== FIREBASE MESSAGING INITIALIZED SUCCESSFULLY ==========',
      );
      debugPrint('[FCM Setup] FCM Token: $_fcmToken');
      debugPrint(
        '[FCM Setup] Ready to receive notifications in all app states',
      );
      debugLog('FCM_SETUP', 'Initialization COMPLETE fcmToken=$_fcmToken');
    } catch (e) {
      _isInitialized = true; // Mark as initialized to prevent retries
      debugPrint('[FCM Setup] ⚠️ Initialization error: $e');
      debugLog('FCM_SETUP', 'Initialization ERROR: $e');
    }
  }

  /// Initialize Firebase Core
  Future<void> _initializeFirebase() async {
    try {
      await Firebase.initializeApp().timeout(const Duration(seconds: 10));
      debugPrint('[FCM Setup] Firebase.initializeApp() SUCCESS');
      debugLog('FCM_SETUP', 'Firebase.initializeApp() OK');
    } catch (e) {
      // Firebase might already be initialized; this is OK
      debugPrint('[FCM Setup] Firebase initialization note: $e');
      debugLog('FCM_SETUP', 'Firebase already initialized or skipped: $e');
    }
  }

  /// Initialize all notification-related services
  Future<void> _initializeNotificationServices() async {
    try {
      // Step 1: Initialize BilingualNotificationService first (creates notification channels)
      await BilingualNotificationService.initialize().timeout(
        const Duration(seconds: 5),
      );
      debugPrint('[FCM Setup] BilingualNotificationService initialized');
      debugLog('FCM_SETUP', 'BilingualNotificationService OK');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ BilingualNotificationService init error: $e');
      debugLog('FCM_SETUP', 'BilingualNotificationService ERROR: $e');
    }

    try {
      // Step 2: Initialize RingtoneService (for audio playback)
      await RingtoneService().initialize().timeout(const Duration(seconds: 5));
      debugPrint('[FCM Setup] RingtoneService initialized');
      debugLog('FCM_SETUP', 'RingtoneService OK');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ RingtoneService init error: $e');
      debugLog('FCM_SETUP', 'RingtoneService ERROR: $e');
    }

    try {
      // Step 3: Initialize CallNotificationService (handles local notifications)
      final callNotifService = CallNotificationService();
      await callNotifService.initialize().timeout(const Duration(seconds: 5));
      debugPrint('[FCM Setup] CallNotificationService initialized');
      debugLog('FCM_SETUP', 'CallNotificationService OK');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ CallNotificationService init error: $e');
      debugLog('FCM_SETUP', 'CallNotificationService ERROR: $e');
    }

    try {
      // Step 4: Initialize NotificationRoutingService (routes messages to handlers)
      await NotificationRoutingService().initialize().timeout(
        const Duration(seconds: 5),
      );
      debugPrint('[FCM Setup] NotificationRoutingService initialized');
      debugLog('FCM_SETUP', 'NotificationRoutingService OK');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ NotificationRoutingService init error: $e');
      debugLog('FCM_SETUP', 'NotificationRoutingService ERROR: $e');
    }

    try {
      // Step 5: Initialize BackgroundNotificationHandler (processes all messages)
      final bgHandler = BackgroundNotificationHandler();
      await bgHandler.initialize().timeout(const Duration(seconds: 10));
      debugPrint('[FCM Setup] BackgroundNotificationHandler initialized');
      debugLog('FCM_SETUP', 'BackgroundNotificationHandler OK');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ BackgroundNotificationHandler init error: $e');
      debugLog('FCM_SETUP', 'BackgroundNotificationHandler ERROR: $e');
    }
  }

  /// Request notification permissions
  /// Android 13+: POST_NOTIFICATIONS permission required
  /// iOS 13+: User permission dialog shown
  Future<void> _requestNotificationPermissions() async {
    if (_firebaseMessaging == null) return;

    try {
      debugPrint('[FCM Setup] Requesting notification permissions...');

      final settings = await _firebaseMessaging!
          .requestPermission(
            alert: true,
            announcement: true,
            badge: true,
            carPlay: false,
            criticalAlert: true,
            provisional: false,
            sound: true,
          )
          .timeout(const Duration(seconds: 15));

      final authStatus = settings.authorizationStatus;

      debugPrint('[FCM Setup] Permission request result: $authStatus');
      debugLog('FCM_SETUP', 'Notification permission: $authStatus');

      // Log permission details
      if (authStatus == AuthorizationStatus.authorized) {
        debugPrint('[FCM Setup] ✅ Notifications AUTHORIZED');
      } else if (authStatus == AuthorizationStatus.provisional) {
        debugPrint('[FCM Setup] ✅ Notifications PROVISIONAL (iOS only)');
      } else if (authStatus == AuthorizationStatus.denied) {
        debugPrint('[FCM Setup] ⚠️ Notifications DENIED by user');
      } else if (authStatus == AuthorizationStatus.notDetermined) {
        debugPrint('[FCM Setup] ⚠️ Notifications NOT DETERMINED');
      }
    } on TimeoutException {
      debugPrint('[FCM Setup] ⚠️ Permission request TIMEOUT');
      debugLog('FCM_SETUP', 'Permission request timeout');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ Permission request error: $e');
      debugLog('FCM_SETUP', 'Permission request error: $e');
    }
  }

  /// Setup all message handlers for different app states
  void _setupMessageHandlers() {
    if (_firebaseMessaging == null) return;

    debugPrint('[FCM Setup] Setting up message handlers...');

    // 1. Foreground handler (app is open and in focus)
    // Process incoming calls and messages while app is active
    FirebaseMessaging.onMessage.listen(
      (RemoteMessage message) {
        debugPrint(
          '[FCM Setup] onMessage (foreground) received: '
          'messageId=${message.messageId} title=${message.notification?.title}',
        );
        debugLog(
          'FCM_SETUP',
          'onMessage (foreground) messageId=${message.messageId} '
              'title=${message.notification?.title}',
        );

        // Process the message using background handler
        // Mark as foreground so the handler can skip duplicates from Realtime
        unawaited(
          BackgroundNotificationHandler().handleMessage(
            message,
            isBackground: false, // App is in foreground
          ),
        );
      },
      onError: (error) {
        debugPrint('[FCM Setup] onMessage error: $error');
      },
    );

    // 2. Background handler (user taps notification while app is backgrounded)
    FirebaseMessaging.onMessageOpenedApp.listen(
      (RemoteMessage message) {
        debugPrint(
          '[FCM Setup] onMessageOpenedApp (background tap) received: '
          'messageId=${message.messageId} title=${message.notification?.title}',
        );
        debugLog(
          'FCM_SETUP',
          'onMessageOpenedApp messageId=${message.messageId} '
              'title=${message.notification?.title}',
        );

        // Process the message when notification is tapped from background
        unawaited(
          BackgroundNotificationHandler().handleMessage(
            message,
            isBackground: true, // App was backgrounded
          ),
        );
      },
      onError: (error) {
        debugPrint('[FCM Setup] onMessageOpenedApp error: $error');
      },
    );

    debugPrint('[FCM Setup] Message handlers SETUP COMPLETE');
    debugLog('FCM_SETUP', 'Message handlers setup complete');
  }

  /// Retrieve and persist FCM token
  Future<void> _retrieveAndPersistToken() async {
    if (_firebaseMessaging == null) return;

    try {
      _fcmToken = await _firebaseMessaging!.getToken().timeout(
        const Duration(seconds: 15),
      );

      if (_fcmToken != null && _fcmToken!.isNotEmpty) {
        debugPrint(
          '[FCM Setup] ✅ FCM Token retrieved (${_fcmToken!.length} chars)',
        );
        debugPrint(
          '[FCM Setup] Token (first 40 chars): ${_fcmToken!.substring(0, 40)}...',
        );
        debugLog(
          'FCM_SETUP',
          'FCM Token OK: ${_fcmToken!.substring(0, 20)}...',
        );

        // Save token to Supabase for backend to use
        _saveFcmTokenToSupabase(_fcmToken!);
      } else {
        debugPrint('[FCM Setup] ⚠️ FCM Token is empty');
        debugLog('FCM_SETUP', 'FCM Token is empty');
      }
    } on TimeoutException {
      debugPrint('[FCM Setup] ⚠️ FCM getToken timeout');
      debugLog('FCM_SETUP', 'getToken timeout');
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ Error getting FCM token: $e');
      debugLog('FCM_SETUP', 'getToken error: $e');
    }
  }

  /// Listen for FCM token refresh
  void _setupTokenRefreshListener() {
    if (_firebaseMessaging == null) return;

    _firebaseMessaging!.onTokenRefresh.listen(
      (String newToken) {
        debugPrint('[FCM Setup] 🔄 FCM Token refreshed');
        debugPrint(
          '[FCM Setup] New token (first 40 chars): ${newToken.substring(0, 40)}...',
        );
        _fcmToken = newToken;
        _saveFcmTokenToSupabase(newToken);
        debugLog(
          'FCM_SETUP',
          'Token refreshed: ${newToken.substring(0, 20)}...',
        );
      },
      onError: (error) {
        debugPrint('[FCM Setup] ⚠️ Token refresh error: $error');
      },
    );

    debugPrint('[FCM Setup] Token refresh listener ACTIVE');
  }

  /// Save FCM token to Supabase database for backend to use.
  /// Saves to both fcm_tokens (array) and fcm_token (legacy column).
  /// Retries up to 5 times with backoff to handle startup timing (user not yet logged in).
  Future<void> _saveFcmTokenToSupabase(String token) async {
    const maxRetries = 5;
    const baseDelayMs = 500;

    for (var attempt = 0; attempt < maxRetries; attempt++) {
      try {
        final supabase = Supabase.instance.client;
        final user = supabase.auth.currentUser;
        if (user == null) {
          debugPrint('[FCM Setup] ⚠️ No user yet (attempt $attempt), retrying...');
          debugLog('FCM_SETUP', 'No user attempt $attempt, will retry');
          await Future.delayed(
            Duration(milliseconds: baseDelayMs * (attempt + 1)),
          );
          continue;
        }

        // Get current tokens from the profile
        final response = await supabase
            .from('profiles')
            .select('fcm_tokens')
            .eq('id', user.id)
            .maybeSingle();

        List<String> tokens = [];
        final currentTokens = response?['fcm_tokens'] as List<dynamic>?;
        if (currentTokens != null) {
          tokens = List<String>.from(currentTokens);
        }

        // Always update: ensure legacy column is synced even if token is already in array
        if (!tokens.contains(token)) {
          tokens.add(token);
          // Keep only last 5 tokens to avoid bloat
          if (tokens.length > 5) {
            tokens = tokens.sublist(tokens.length - 5);
          }
        }

        await supabase.from('profiles').update({
          'fcm_tokens': tokens,
          'fcm_token': token,
          'fcm_token_updated_at': DateTime.now().toIso8601String(),
        }).eq('id', user.id);

        debugPrint(
          '[FCM Setup] ✅ FCM token saved to Supabase (total: ${tokens.length})',
        );
        debugLog(
          'FCM_SETUP',
          'Token saved: ${token.substring(0, 20)}... (total: ${tokens.length})',
        );
        return; // Success
      } catch (e) {
        debugPrint('[FCM Setup] ⚠️ Error saving token (attempt $attempt): $e');
        debugLog('FCM_SETUP', 'Error saving token attempt $attempt: $e');
        if (attempt < maxRetries - 1) {
          await Future.delayed(
            Duration(milliseconds: baseDelayMs * (attempt + 1)),
          );
        }
      }
    }
    debugPrint('[FCM Setup] ❌ Failed to save FCM token after $maxRetries attempts');
  }

  /// Get current FCM token if initialized
  Future<String?> getToken() async {
    if (!_isInitialized || _firebaseMessaging == null) {
      return null;
    }
    try {
      return await _firebaseMessaging!.getToken().timeout(
        const Duration(seconds: 10),
      );
    } catch (e) {
      debugPrint('[FCM Setup] Error getting token: $e');
      return null;
    }
  }

  /// Diagnostic info for debugging notification issues
  Future<String> getDiagnosticInfo() async {
    final buffer = StringBuffer();
    buffer.writeln('╔════════ FCM DIAGNOSTIC INFO ════════╗');
    buffer.writeln('Initialized: $_isInitialized');
    buffer.writeln('FCM Token: ${_fcmToken?.substring(0, 20) ?? "None"}...');
    buffer.writeln('Platform: ${kIsWeb ? "Web" : "Mobile"}');

    if (_firebaseMessaging != null) {
      try {
        final settings = await _firebaseMessaging!.getNotificationSettings();
        buffer.writeln('Authorization: ${settings.authorizationStatus}');
        buffer.writeln('Alert: ${settings.alert}');
        buffer.writeln('Badge: ${settings.badge}');
        buffer.writeln('Sound: ${settings.sound}');
        buffer.writeln('CriticalAlert: ${settings.criticalAlert}');
      } catch (e) {
        buffer.writeln('Settings Error: $e');
      }
    }

    buffer.writeln('╚═══════════════════════════════════╝');
    return buffer.toString();
  }

  /// Force token refresh (for testing)
  Future<String?> forceTokenRefresh() async {
    if (_firebaseMessaging == null) return null;

    try {
      debugPrint('[FCM Setup] 🔄 Forcing token refresh...');
      await _firebaseMessaging!.deleteToken();
      final token = await _firebaseMessaging!.getToken();
      debugPrint(
        '[FCM Setup] ✅ Token refresh complete: ${token?.substring(0, 20) ?? "None"}...',
      );
      return token;
    } catch (e) {
      debugPrint('[FCM Setup] ⚠️ Token refresh error: $e');
      return null;
    }
  }
}
