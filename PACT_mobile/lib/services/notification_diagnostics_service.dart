import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import './debug_log_service.dart';

/// Comprehensive notification diagnostics and debugging service.
/// Helps identify why notifications aren't working on the device.
class NotificationDiagnosticsService {
  static final NotificationDiagnosticsService _instance =
      NotificationDiagnosticsService._internal();

  factory NotificationDiagnosticsService() => _instance;
  NotificationDiagnosticsService._internal();

  /// Run comprehensive notification diagnostics
  Future<String> runFullDiagnostics() async {
    final buffer = StringBuffer();
    buffer.writeln('╔════════════════════════════════════════════════════════════╗');
    buffer.writeln('║        PACT MOBILE - NOTIFICATION DIAGNOSTICS              ║');
    buffer.writeln('╚════════════════════════════════════════════════════════════╝\n');

    // 1. Platform
    buffer.writeln('📱 PLATFORM INFO');
    buffer.writeln('─ Web: $kIsWeb');
    if (!kIsWeb) {
      buffer.writeln('─ Android: ${Platform.isAndroid}');
      buffer.writeln('─ iOS: ${Platform.isIOS}');
    }
    buffer.writeln();

    // 2. Firebase/FCM Status
    buffer.write(await _checkFirebaseStatus());

    // 3. Notification Permissions
    buffer.write(await _checkPermissions());

    // 4. FCM Token Status
    buffer.write(await _checkFcmToken());

    // 5. Device Information (useful for backend debugging)
    buffer.write(await _getDeviceInfo());

    // 6. Recommendations
    buffer.write(_getRecommendations());

    buffer.writeln('\n╔════════════════════════════════════════════════════════════╗');
    buffer.writeln('║                    END OF DIAGNOSTICS                      ║');
    buffer.writeln('╚════════════════════════════════════════════════════════════╝');

    return buffer.toString();
  }

  /// Check Firebase and FCM status
  Future<String> _checkFirebaseStatus() async {
    final buffer = StringBuffer();
    buffer.writeln('🔥 FIREBASE & FCM STATUS');
    buffer.writeln('─ Platform: ${kIsWeb ? "Web" : "Mobile"}');

    if (kIsWeb) {
      buffer.writeln('─ Status: N/A (Web doesn\'t support FCM via flutter_local_notifications)');
      return buffer.toString();
    }

    try {
      final messaging = FirebaseMessaging.instance;

      // Check if Firebase is initialized
      try {
        final settings = await messaging.getNotificationSettings();
        buffer.writeln('─ Firebase: ✅ Initialized');
        
        // Check APNS token status (iOS only)
        if (Platform.isIOS) {
          try {
            final apnsToken = await messaging.getAPNSToken();
            buffer.writeln('─ APNS Token: ${apnsToken?.isNotEmpty ?? false ? "✅ Present" : "❌ Missing"}');
            if (apnsToken != null && apnsToken.isNotEmpty) {
              buffer.writeln('  └─ ${apnsToken.substring(0, 20)}...');
            } else {
              buffer.writeln('  └─ ⚠️ iOS VoIP calls may not work properly');
            }
          } catch (e) {
            buffer.writeln('─ APNS Token: ❌ Error retrieving ($e)');
          }
        }
      } catch (e) {
        buffer.writeln('─ Firebase: ❌ Not initialized ($e)');
      }
    } catch (e) {
      buffer.writeln('─ Firebase: ❌ Error ($e)');
    }

    buffer.writeln();
    return buffer.toString();
  }

  /// Check notification permissions
  Future<String> _checkPermissions() async {
    final buffer = StringBuffer();
    buffer.writeln('🔔 NOTIFICATION PERMISSIONS');

    if (kIsWeb) {
      buffer.writeln('─ Status: N/A (Web)');
      buffer.writeln();
      return buffer.toString();
    }

    try {
      final notificationStatus = await Permission.notification.status;
      final phoneStatus = await Permission.phone.status;

      buffer.writeln('─ Notification Permission:');
      buffer.writeln('  └─ Status: ${_permissionStatusStr(notificationStatus)}');

      if (Platform.isAndroid) {
        // Android 13+ requires POST_NOTIFICATIONS permission
        buffer.writeln('─ AndroidManifest Configuration:');
        buffer.writeln('  └─ POST_NOTIFICATIONS: Expected (Android 13+)');
        buffer.writeln('  └─ FOREGROUND_SERVICE: Expected');
        buffer.writeln('  └─ WAKE_LOCK: Expected');

        if (notificationStatus.isDenied) {
          buffer.writeln('  └─ ⚠️ Permission is DENIED - user must re-enable in settings');
        }
      } else if (Platform.isIOS) {
        buffer.writeln('─ iOS Configuration:');
        buffer.writeln('  └─ UIBackgroundModes: Required (voip, remote-notification)');
        if (notificationStatus.isDenied) {
          buffer.writeln('  └─ ⚠️ User has disabled notifications in Settings');
        }
      }
    } catch (e) {
      buffer.writeln('─ Error checking permissions: $e');
    }

    buffer.writeln();
    return buffer.toString();
  }

  /// Check FCM token status
  Future<String> _checkFcmToken() async {
    final buffer = StringBuffer();
    buffer.writeln('🎫 FCM TOKEN STATUS');

    if (kIsWeb) {
      buffer.writeln('─ Status: N/A (Web)');
      buffer.writeln();
      return buffer.toString();
    }

    try {
      final messaging = FirebaseMessaging.instance;
      final token = await messaging.getToken().timeout(const Duration(seconds: 10));

      if (token != null && token.isNotEmpty) {
        buffer.writeln('─ Current Token: ✅ Available');
        buffer.writeln('─ Token Length: ${token.length} characters');
        buffer.writeln('─ Token (first 40 chars): ${token.substring(0, 40)}...');
        buffer.writeln('─ Status: ✅ READY FOR NOTIFICATIONS');

        // Check if token is saved to Supabase
        buffer.write(await _checkTokenInSupabase(token));
      } else {
        buffer.writeln('─ Current Token: ❌ NOT AVAILABLE');
        buffer.writeln('─ Status: ❌ Cannot receive notifications');
      }
    } on TimeoutException {
      buffer.writeln('─ Current Token: ⏱️ TIMEOUT (network issue?)');
    } catch (e) {
      buffer.writeln('─ Current Token: ❌ Error ($e)');
    }

    buffer.writeln();
    return buffer.toString();
  }

  /// Check if token is saved in Supabase
  Future<String> _checkTokenInSupabase(String token) async {
    final buffer = StringBuffer();
    buffer.writeln('─ Token in Database:');

    try {
      final supabase = Supabase.instance.client;
      final user = supabase.auth.currentUser;

      if (user == null) {
        buffer.writeln('  └─ ⚠️ User not authenticated');
        return buffer.toString();
      }

      final response = await supabase
          .from('profiles')
          .select('fcm_tokens, fcm_token')
          .eq('id', user.id)
          .maybeSingle()
          .timeout(const Duration(seconds: 5));

      if (response != null) {
        final fcmTokensArray = response['fcm_tokens'] as List<dynamic>?;
        final fcmTokenSingle = response['fcm_token'] as String?;

        if (fcmTokensArray != null && fcmTokensArray.contains(token)) {
          buffer.writeln('  └─ ✅ Token found in fcm_tokens array');
        } else if (fcmTokenSingle == token) {
          buffer.writeln('  └─ ✅ Token found in fcm_token field');
        } else {
          buffer.writeln('  └─ ❌ Token NOT in database');
          buffer.writeln('  └─ Current tokens: ${fcmTokensArray?.length ?? 0} in array, '
              '${fcmTokenSingle != null ? "1" : "0"} single');
        }
      } else {
        buffer.writeln('  └─ ❌ User profile not found');
      }
    } catch (e) {
      buffer.writeln('  └─ ⚠️ Error checking database: $e');
    }

    return buffer.toString();
  }

  /// Get device information for backend debugging
  Future<String> _getDeviceInfo() async {
    final buffer = StringBuffer();
    buffer.writeln('📋 DEVICE INFORMATION');

    if (Platform.isAndroid) {
      buffer.writeln('─ Platform: Android');
    } else if (Platform.isIOS) {
      buffer.writeln('─ Platform: iOS');
    } else {
      buffer.writeln('─ Platform: Web');
    }

    // Check current authentication
    try {
      final user = Supabase.instance.client.auth.currentUser;
      if (user != null) {
        buffer.writeln('─ User ID: ${user.id.substring(0, 8)}...');
        buffer.writeln('─ Email: ${user.email?.split('@').first}@...');
      } else {
        buffer.writeln('─ User: NOT AUTHENTICATED');
      }
    } catch (e) {
      buffer.writeln('─ User: Error checking ($e)');
    }

    buffer.writeln();
    return buffer.toString();
  }

  /// Get recommendations based on diagnostics
  String _getRecommendations() {
    final buffer = StringBuffer();
    buffer.writeln('💡 RECOMMENDATIONS');
    buffer.writeln();
    buffer.writeln('If notifications are not working:');
    buffer.writeln();
    buffer.writeln('1️⃣  CHECK PERMISSIONS:');
    buffer.writeln('   Android: Settings → Apps → PACT → Permissions → Notifications');
    buffer.writeln('   iOS: Settings → Notifications → PACT → Allow Notifications');
    buffer.writeln();
    buffer.writeln('2️⃣  CHECK INTERNET CONNECTION:');
    buffer.writeln('   • WiFi or mobile data must be active');
    buffer.writeln('   • Battery Saver may block notifications');
    buffer.writeln();
    buffer.writeln('3️⃣  CHECK DEVICE SETTINGS:');
    buffer.writeln('   • Do Not Disturb mode may silence notifications');
    buffer.writeln('   • App notification channel must be enabled');
    buffer.writeln('   • Volume settings should not be muted');
    buffer.writeln();
    buffer.writeln('4️⃣  ANDROID SPECIFIC:');
    buffer.writeln('   • Check if FCM service can start (App → Battery → Optimize battery)')');
    buffer.writeln('   • Disable battery optimization for PACT');
    buffer.writeln('   • Check Android version (must be 8.0 or higher)');
    buffer.writeln();
    buffer.writeln('5️⃣  iOS SPECIFIC:');
    buffer.writeln('   • Ensure VoIP notifications are enabled');
    buffer.writeln('   • Check if app is in Low Power Mode');
    buffer.writeln('   • Restart device if notifications still don\'t work');
    buffer.writeln();
    buffer.writeln('6️⃣  BACKEND VERIFICATION:');
    buffer.writeln('   • Ensure your FCM token is sent to backend');
    buffer.writeln('   • Backend must send to correct token format');
    buffer.writeln('   • Check Firebase Console for delivery failures');
    buffer.writeln();

    return buffer.toString();
  }

  /// Convert permission status to readable string
  String _permissionStatusStr(PermissionStatus status) {
    if (status.isGranted) return '✅ GRANTED';
    if (status.isDenied) return '❌ DENIED';
    if (status.isRestricted) return '🔒 RESTRICTED';
    if (status.isPermanentlyDenied) return '🚫 PERMANENTLY DENIED';
    if (status.isProvisional) return '⏳ PROVISIONAL';
    if (status.isLimited) return '⚙️ LIMITED';
    return '❓ UNKNOWN';
  }

  /// Quick check - returns true if notifications should work
  Future<bool> canReceiveNotifications() async {
    if (kIsWeb) return false;

    try {
      final notifStatus = await Permission.notification.status;
      if (notifStatus.isDenied || notifStatus.isPermanentlyDenied) {
        return false;
      }

      final messaging = FirebaseMessaging.instance;
      final token = await messaging.getToken().timeout(const Duration(seconds: 5));
      return token != null && token.isNotEmpty;
    } catch (e) {
      debugPrint('[NotificationDiagnostics] Error checking: $e');
      return false;
    }
  }

  /// Log full diagnostics to debug service
  Future<void> saveDiagnosticsToLog() async {
    try {
      final diagnostics = await runFullDiagnostics();
      debugLog('NOTIFICATION_DIAG', diagnostics);
      debugPrint('[NotificationDiagnostics] Saved to log service');
    } catch (e) {
      debugPrint('[NotificationDiagnostics] Error saving: $e');
    }
  }
}
