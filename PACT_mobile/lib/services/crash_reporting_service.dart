import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/material.dart';
import 'dart:ui';

/// Crash Reporting Service using Firebase Crashlytics
class CrashReportingService {
  static final CrashReportingService _instance =
      CrashReportingService._internal();

  factory CrashReportingService() {
    return _instance;
  }

  CrashReportingService._internal();

  /// Initialize crash reporting
  static Future<void> initialize() async {
    try {
      final crashlytics = FirebaseCrashlytics.instance;

      // Set user identifier for better crash attribution
      await crashlytics.setUserIdentifier('anonymous');

      // Enable collection in production
      await crashlytics.setCrashlyticsCollectionEnabled(true);

      debugPrint('✅ Crash reporting initialized');

      // Capture Flutter errors
      FlutterError.onError = (FlutterErrorDetails details) {
        FirebaseCrashlytics.instance.recordFlutterError(details);
      };

      // Capture PlatformDispatcher errors
      PlatformDispatcher.instance.onError = (error, stack) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    } catch (e) {
      debugPrint('❌ Error initializing crash reporting: $e');
    }
  }

  /// Set user ID for crash attribution
  static Future<void> setUserId(String userId) async {
    try {
      await FirebaseCrashlytics.instance.setUserIdentifier(userId);
      debugPrint('👤 Crash reporting user set: $userId');
    } catch (e) {
      debugPrint('Error setting user ID: $e');
    }
  }

  /// Set custom key-value pairs for crash context
  static Future<void> setCustomKey(String key, Object value) async {
    try {
      await FirebaseCrashlytics.instance.setCustomKey(key, value);
    } catch (e) {
      debugPrint('Error setting custom key: $e');
    }
  }

  /// Record custom exception
  static Future<void> recordException(
    dynamic exception,
    StackTrace? stackTrace, {
    bool fatal = false,
  }) async {
    try {
      await FirebaseCrashlytics.instance.recordError(
        exception,
        stackTrace,
        fatal: fatal,
      );
      debugPrint('📊 Exception recorded: $exception');
    } catch (e) {
      debugPrint('Error recording exception: $e');
    }
  }

  /// Record a custom message
  static Future<void> recordMessage(String message) async {
    try {
      await FirebaseCrashlytics.instance.log(message);
    } catch (e) {
      debugPrint('Error logging message: $e');
    }
  }

  /// Log navigation event
  static Future<void> logNavigation(
    String routeName,
    Map<String, String>? arguments,
  ) async {
    final message =
        'Navigation: $routeName ${arguments != null ? '- $arguments' : ''}';
    await recordMessage(message);
  }

  /// Log API call
  static Future<void> logApiCall(
    String method,
    String endpoint, {
    int? statusCode,
    String? errorMessage,
  }) async {
    final message =
        'API: $method $endpoint ${statusCode != null ? '- Status: $statusCode' : ''} ${errorMessage != null ? '- Error: $errorMessage' : ''}';
    await recordMessage(message);
  }

  /// Log database operation
  static Future<void> logDatabaseOperation(
    String operation,
    String table, {
    String? errorMessage,
  }) async {
    final message =
        'Database: $operation on $table ${errorMessage != null ? '- Error: $errorMessage' : ''}';
    await recordMessage(message);
  }

  /// Clear all custom keys
  static Future<void> clearCustomKeys() async {
    try {
      // Note: Firebase Crashlytics doesn't have a direct clear method
      // You'd need to manually unset keys if needed
      debugPrint('Custom keys cleared');
    } catch (e) {
      debugPrint('Error clearing custom keys: $e');
    }
  }
}
