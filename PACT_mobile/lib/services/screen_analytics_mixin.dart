import 'analytics_service.dart';

/// Mixin for automatic screen view tracking
/// Usage: class MyScreen extends StatefulWidget with ScreenAnalyticsMixin {}
/// Then call logScreenView('Screen Name') in initState()
mixin ScreenAnalyticsMixin {
  /// Log screen view with optional parameters
  Future<void> logScreenView(
    String screenName, {
    Map<String, Object?>? parameters,
  }) async {
    await AnalyticsService.logScreenView(screenName);

    // Log additional parameters if provided
    if (parameters != null && parameters.isNotEmpty) {
      await AnalyticsService.logEvent(
        'screen_view_details',
        parameters: {'screen': screenName, ...parameters},
      );
    }
  }

  /// Log screen with user context
  Future<void> logScreenViewWithContext(
    String screenName, {
    String? userId,
    String? userRole,
    bool? isOnline,
  }) async {
    await AnalyticsService.logScreenView(screenName);

    if (userId != null || userRole != null || isOnline != null) {
      await AnalyticsService.logEvent(
        'screen_view_context',
        parameters: {
          'screen': screenName,
          'user_id': ?userId,
          'user_role': ?userRole,
          'is_online': ?isOnline,
        },
      );
    }
  }

  /// Log screen error
  Future<void> logScreenError(
    String screenName,
    String errorMessage, {
    String? errorType,
  }) async {
    await AnalyticsService.logEvent(
      'screen_error',
      parameters: {
        'screen': screenName,
        'error_message': errorMessage,
        'error_type': errorType ?? 'unknown',
      },
    );
  }

  /// Log screen action (button tap, form submit, etc.)
  Future<void> logScreenAction(
    String screenName,
    String actionName, {
    Map<String, Object?>? details,
  }) async {
    await AnalyticsService.logEvent(
      'screen_action',
      parameters: {
        'screen': screenName,
        'action': actionName,
        if (details != null) ...details,
      },
    );
  }

  /// Log screen transition
  Future<void> logScreenTransition(
    String fromScreen,
    String toScreen, {
    String? trigger,
  }) async {
    await AnalyticsService.logEvent(
      'screen_transition',
      parameters: {
        'from_screen': fromScreen,
        'to_screen': toScreen,
        'trigger': trigger ?? 'navigation',
      },
    );
  }

  /// Log form interaction
  Future<void> logFormInteraction(
    String screenName,
    String fieldName, {
    String? action,
    String? value,
  }) async {
    await AnalyticsService.logEvent(
      'form_interaction',
      parameters: {
        'screen': screenName,
        'field': fieldName,
        'action': action ?? 'focus',
        if (value != null) 'value_length': value.length,
      },
    );
  }

  /// Log form submission
  Future<void> logFormSubmission(
    String screenName,
    String formName, {
    bool? isValid,
    String? submissionType,
  }) async {
    await AnalyticsService.logEvent(
      'form_submitted',
      parameters: {
        'screen': screenName,
        'form': formName,
        'is_valid': isValid ?? true,
        'submission_type': submissionType ?? 'standard',
      },
    );
  }

  /// Log screen time (call with duration in seconds)
  Future<void> logScreenTime(String screenName, int durationSeconds) async {
    await AnalyticsService.logEvent(
      'screen_time',
      parameters: {'screen': screenName, 'duration_seconds': durationSeconds},
    );
  }
}
