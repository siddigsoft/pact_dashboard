import 'analytics_service.dart';

/// Event Tracker - Centralized event logging with predefined event names
class EventTracker {
  static final EventTracker _instance = EventTracker._internal();

  factory EventTracker() {
    return _instance;
  }

  EventTracker._internal();

  // ==================== Authentication Events ====================

  /// Track login attempt
  static Future<void> trackLoginAttempt({String? method}) async {
    await AnalyticsService.logLogin(method: method ?? 'email');
  }

  /// Track login success
  static Future<void> trackLoginSuccess({String? method}) async {
    await AnalyticsService.logEvent(
      'login_success',
      parameters: {'method': method ?? 'email'},
    );
  }

  /// Track login failure
  static Future<void> trackLoginFailure({String? reason}) async {
    await AnalyticsService.logEvent(
      'login_failure',
      parameters: {'reason': reason ?? 'unknown'},
    );
  }

  /// Track signup attempt
  static Future<void> trackSignupAttempt({String? method}) async {
    await AnalyticsService.logSignUp(signUpMethod: method ?? 'email');
  }

  /// Track logout
  static Future<void> trackLogout() async {
    await AnalyticsService.logLogout();
  }

  /// Track biometric authentication
  static Future<void> trackBiometricAuth({String? type}) async {
    await AnalyticsService.logEvent(
      'biometric_auth',
      parameters: {'type': type ?? 'fingerprint'},
    );
  }

  // ==================== Field Operations ====================

  /// Track field visit creation
  static Future<void> trackFieldVisitCreated({
    String? siteId,
    String? coordinatorId,
  }) async {
    await AnalyticsService.logFieldOperationCreated(
      siteId: siteId,
      type: 'field_visit',
    );
  }

  /// Track field visit completed
  static Future<void> trackFieldVisitCompleted({
    String? siteId,
    int? durationMinutes,
    double? totalCost,
  }) async {
    await AnalyticsService.logFieldOperationCompleted(
      siteId: siteId,
      durationMinutes: durationMinutes,
      costAmount: totalCost,
    );
  }

  /// Track cost item added
  static Future<void> trackCostItemAdded({
    String? category,
    double? amount,
  }) async {
    await AnalyticsService.logCostSubmission(
      category: category,
      amount: amount,
      status: 'added',
    );
  }

  /// Track cost submitted
  static Future<void> trackCostSubmitted({
    String? visitId,
    double? totalAmount,
    int? itemCount,
  }) async {
    await AnalyticsService.logCostSubmission(
      category: 'bulk_submission',
      amount: totalAmount,
      status: 'submitted',
    );

    if (itemCount != null) {
      await AnalyticsService.logEvent(
        'cost_items_count',
        parameters: {'count': itemCount},
      );
    }
  }

  // ==================== Communication ====================

  /// Track call initiated
  static Future<void> trackCallInitiated({
    String? callType,
    String? recipientId,
  }) async {
    await AnalyticsService.logCommunicationEvent(
      type: callType ?? 'voice_call',
    );
  }

  /// Track call completed
  static Future<void> trackCallCompleted({
    String? callType,
    int? durationSeconds,
    bool? successful,
  }) async {
    await AnalyticsService.logEvent(
      'call_completed',
      parameters: {
        'type': callType ?? 'voice_call',
        'duration_seconds': durationSeconds ?? 0,
        'successful': successful ?? true,
      },
    );
  }

  /// Track message sent
  static Future<void> trackMessageSent({
    String? chatId,
    String? messageType,
  }) async {
    await AnalyticsService.logEvent(
      'message_sent',
      parameters: {'type': messageType ?? 'text'},
    );
  }

  // ==================== Data Sync ====================

  /// Track sync started
  static Future<void> trackSyncStarted() async {
    await AnalyticsService.logEvent('sync_started');
  }

  /// Track sync completed
  static Future<void> trackSyncCompleted({
    int? itemsCount,
    int? durationMs,
  }) async {
    await AnalyticsService.logSyncEvent(
      status: 'success',
      itemCount: itemsCount,
      durationMs: durationMs,
    );
  }

  /// Track sync failed
  static Future<void> trackSyncFailed({String? reason}) async {
    await AnalyticsService.logSyncEvent(status: 'failed');

    if (reason != null) {
      await AnalyticsService.logEvent(
        'sync_error',
        parameters: {'reason': reason},
      );
    }
  }

  // ==================== Connectivity ====================

  /// Track offline mode activated
  static Future<void> trackOfflineModeActivated() async {
    await AnalyticsService.logOfflineEvent(reason: 'no_internet');
  }

  /// Track offline mode deactivated
  static Future<void> trackOfflineModeDeactivated({
    int? offlineDurationSeconds,
  }) async {
    await AnalyticsService.logEvent(
      'online_mode_restored',
      parameters: {'offline_duration_seconds': offlineDurationSeconds ?? 0},
    );
  }

  // ==================== Data Search & Filter ====================

  /// Track search performed
  static Future<void> trackSearch({String? query, int? resultsCount}) async {
    await AnalyticsService.logEvent(
      'search_performed',
      parameters: {'query': query ?? '', 'results_count': resultsCount ?? 0},
    );
  }

  /// Track filter applied
  static Future<void> trackFilterApplied({
    String? filterType,
    List<String>? filterValues,
  }) async {
    await AnalyticsService.logEvent(
      'filter_applied',
      parameters: {
        'filter_type': filterType ?? 'unknown',
        'value_count': filterValues?.length ?? 0,
      },
    );
  }

  // ==================== Data Export ====================

  /// Track data export
  static Future<void> trackDataExport({
    String? format,
    int? recordCount,
  }) async {
    await AnalyticsService.logEvent(
      'data_exported',
      parameters: {'format': format ?? 'csv', 'record_count': recordCount ?? 0},
    );
  }

  // ==================== Settings & Preferences ====================

  /// Track settings changed
  static Future<void> trackSettingChanged({
    String? settingName,
    String? newValue,
  }) async {
    await AnalyticsService.logEvent(
      'setting_changed',
      parameters: {
        'setting': settingName ?? 'unknown',
        'new_value': newValue ?? 'unknown',
      },
    );
  }

  /// Track language changed
  static Future<void> trackLanguageChanged({String? language}) async {
    await AnalyticsService.logEvent(
      'language_changed',
      parameters: {'language': language ?? 'en'},
    );
  }

  /// Track notification preference changed
  static Future<void> trackNotificationPreferenceChanged({
    String? notificationType,
    bool? enabled,
  }) async {
    await AnalyticsService.logEvent(
      'notification_preference_changed',
      parameters: {
        'type': notificationType ?? 'all',
        'enabled': enabled ?? false,
      },
    );
  }

  // ==================== Errors & Troubleshooting ====================

  /// Track error occurred
  static Future<void> trackError({
    String? errorMessage,
    String? errorType,
    String? screen,
  }) async {
    await AnalyticsService.logError(
      errorMessage ?? 'unknown_error',
      details: 'screen: $screen, type: $errorType',
    );
  }

  /// Track crash reported
  static Future<void> trackCrashReported({String? crashType}) async {
    await AnalyticsService.logEvent(
      'crash_reported',
      parameters: {'crash_type': crashType ?? 'unknown'},
    );
  }

  // ==================== Feature Usage ====================

  /// Track feature used
  static Future<void> trackFeatureUsed({
    required String featureName,
    Map<String, Object?>? details,
  }) async {
    await AnalyticsService.logFeatureUsage(featureName);

    if (details != null) {
      await AnalyticsService.logEvent(
        'feature_details',
        parameters: {'feature': featureName, ...details},
      );
    }
  }

  /// Track onboarding completed
  static Future<void> trackOnboardingCompleted({int? stepsCount}) async {
    await AnalyticsService.logEvent(
      'onboarding_completed',
      parameters: {'steps_count': stepsCount ?? 5},
    );
  }

  /// Track app update
  static Future<void> trackAppUpdate({
    String? fromVersion,
    String? toVersion,
  }) async {
    await AnalyticsService.logEvent(
      'app_updated',
      parameters: {
        'from_version': fromVersion ?? 'unknown',
        'to_version': toVersion ?? 'unknown',
      },
    );
  }

  // ==================== Performance ====================

  /// Track API call performance
  static Future<void> trackApiPerformance({
    required String endpoint,
    required int durationMs,
    required int statusCode,
  }) async {
    await AnalyticsService.logApiCall(
      endpoint,
      method: 'GET',
      statusCode: statusCode,
      duration: durationMs,
    );
  }

  /// Track app startup time
  static Future<void> trackAppStartup({required int durationMs}) async {
    await AnalyticsService.logEvent(
      'app_startup',
      parameters: {'duration_ms': durationMs},
    );
  }
}
