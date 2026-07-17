import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';

class AnalyticsService {
  static final AnalyticsService _instance = AnalyticsService._internal();

  static final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  factory AnalyticsService() {
    return _instance;
  }

  AnalyticsService._internal();

  static Future<void> initialize() async {
    try {
      await _analytics.setAnalyticsCollectionEnabled(true);
      debugPrint('✅ Firebase Analytics initialized');
    } catch (e) {
      debugPrint('❌ Error initializing Firebase Analytics: $e');
    }
  }

  static Future<void> setUserId(String userId) async {
    try {
      await _analytics.setUserId(id: userId);
      debugPrint('👤 Analytics user ID set: $userId');
    } catch (e) {
      debugPrint('❌ Error setting user ID: $e');
    }
  }

  static Future<void> setUserProperty(String name, String? value) async {
    try {
      await _analytics.setUserProperty(name: name, value: value);
      debugPrint('🏷️ User property set: $name = $value');
    } catch (e) {
      debugPrint('❌ Error setting user property: $e');
    }
  }

  static Future<void> logScreenView(String screenName) async {
    try {
      await _analytics.logScreenView(screenName: screenName);
      debugPrint('📱 Screen view logged: $screenName');
    } catch (e) {
      debugPrint('❌ Error logging screen view: $e');
    }
  }

  static Future<void> logEvent(
    String eventName, {
    Map<String, Object?>? parameters,
  }) async {
    try {
      await _analytics.logEvent(
        name: eventName,
        parameters: parameters?.map((k, v) => MapEntry(k, v ?? '')),
      );
      debugPrint('📊 Event logged: $eventName with $parameters');
    } catch (e) {
      debugPrint('❌ Error logging event: $e');
    }
  }

  static Future<void> logLogin({String? method}) async {
    try {
      await _analytics.logLogin(loginMethod: method);
      debugPrint('🔐 Login logged: method=$method');
    } catch (e) {
      debugPrint('❌ Error logging login: $e');
    }
  }

  static Future<void> logSignUp({String? signUpMethod}) async {
    try {
      await _analytics.logSignUp(signUpMethod: signUpMethod ?? 'unknown');
      debugPrint('✍️ Sign up logged: method=$signUpMethod');
    } catch (e) {
      debugPrint('❌ Error logging sign up: $e');
    }
  }

  static Future<void> logLogout() async {
    try {
      await _analytics.logEvent(name: 'logout');
      debugPrint('✌️ Logout logged');
    } catch (e) {
      debugPrint('❌ Error logging logout: $e');
    }
  }

  static Future<void> logApiCall(
    String endpoint, {
    String? method,
    int? statusCode,
    int? duration,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'api_call',
        parameters: {
          'endpoint': endpoint,
          'method': method ?? 'GET',
          'status_code': statusCode ?? 0,
          'duration_ms': duration ?? 0,
        },
      );
      debugPrint('📡 API call logged: $endpoint - $method - $statusCode');
    } catch (e) {
      debugPrint('❌ Error logging API call: $e');
    }
  }

  static Future<void> logError(String error, {String? details}) async {
    try {
      await _analytics.logEvent(
        name: 'app_error',
        parameters: {
          'error': error,
          'details': details ?? 'No additional details',
        },
      );
      debugPrint('❌ Error event logged: $error - $details');
    } catch (e) {
      debugPrint('❌ Error logging error event: $e');
    }
  }

  static Future<void> logFieldOperationCreated({
    String? siteId,
    String? type,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'field_operation_created',
        parameters: {
          'site_id': siteId ?? 'unknown',
          'operation_type': type ?? 'standard',
        },
      );
      debugPrint('🏗️ Field operation created: site=$siteId, type=$type');
    } catch (e) {
      debugPrint('❌ Error logging field operation: $e');
    }
  }

  static Future<void> logFieldOperationCompleted({
    String? siteId,
    int? durationMinutes,
    double? costAmount,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'field_operation_completed',
        parameters: {
          'site_id': siteId ?? 'unknown',
          'duration_minutes': durationMinutes ?? 0,
          'cost_amount': costAmount ?? 0.0,
        },
      );
      debugPrint(
        '✅ Field operation completed: site=$siteId, duration=$durationMinutes min, cost=$costAmount',
      );
    } catch (e) {
      debugPrint('❌ Error logging field operation completion: $e');
    }
  }

  static Future<void> logCostSubmission({
    String? category,
    double? amount,
    String? status,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'cost_submitted',
        parameters: {
          'category': category ?? 'other',
          'amount': amount ?? 0.0,
          'status': status ?? 'pending',
        },
      );
      debugPrint(
        '💰 Cost submitted: category=$category, amount=$amount, status=$status',
      );
    } catch (e) {
      debugPrint('❌ Error logging cost submission: $e');
    }
  }

  static Future<void> logCommunicationEvent({
    String? type,
    String? duration,
    String? participantCount,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'communication_event',
        parameters: {
          'type': type ?? 'unknown',
          'duration': duration ?? '0',
          'participant_count': participantCount ?? '2',
        },
      );
      debugPrint(
        '💬 Communication event: type=$type, duration=$duration, participants=$participantCount',
      );
    } catch (e) {
      debugPrint('❌ Error logging communication event: $e');
    }
  }

  static Future<void> logSyncEvent({
    String? status,
    int? itemCount,
    int? durationMs,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'data_sync',
        parameters: {
          'status': status ?? 'pending',
          'item_count': itemCount ?? 0,
          'duration_ms': durationMs ?? 0,
        },
      );
      debugPrint(
        '🔄 Sync event: status=$status, items=$itemCount, duration=$durationMs ms',
      );
    } catch (e) {
      debugPrint('❌ Error logging sync event: $e');
    }
  }

  static Future<void> logOfflineEvent({
    String? reason,
    int? durationSeconds,
  }) async {
    try {
      await _analytics.logEvent(
        name: 'offline_mode',
        parameters: {
          'reason': reason ?? 'unknown',
          'duration_seconds': durationSeconds ?? 0,
        },
      );
      debugPrint(
        '📵 Offline event: reason=$reason, duration=$durationSeconds sec',
      );
    } catch (e) {
      debugPrint('❌ Error logging offline event: $e');
    }
  }

  static Future<void> logFeatureUsage(String featureName) async {
    try {
      await _analytics.logEvent(
        name: 'feature_used',
        parameters: {'feature': featureName},
      );
      debugPrint('🎯 Feature used: $featureName');
    } catch (e) {
      debugPrint('❌ Error logging feature usage: $e');
    }
  }

  static Future<void> resetAnalyticsData() async {
    try {
      await _analytics.resetAnalyticsData();
      debugPrint('🗑️ Analytics data reset');
    } catch (e) {
      debugPrint('❌ Error resetting analytics data: $e');
    }
  }
}
