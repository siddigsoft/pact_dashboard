import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/services/analytics_service.dart';

void main() {
  group('AnalyticsService', () {
    test('initializes without error', () async {
      expect(() async => await AnalyticsService.initialize(), returnsNormally);
    });

    test('sets user ID successfully', () async {
      expect(
        () async => await AnalyticsService.setUserId('user123'),
        returnsNormally,
      );
    });

    test('sets user property successfully', () async {
      expect(
        () async =>
            await AnalyticsService.setUserProperty('role', 'coordinator'),
        returnsNormally,
      );
    });

    test('logs screen view', () async {
      expect(
        () async => await AnalyticsService.logScreenView('LoginScreen'),
        returnsNormally,
      );
    });

    test('logs custom event', () async {
      expect(
        () async => await AnalyticsService.logEvent(
          'test_event',
          parameters: {'key': 'value'},
        ),
        returnsNormally,
      );
    });

    test('logs login event', () async {
      expect(
        () async => await AnalyticsService.logLogin(method: 'email'),
        returnsNormally,
      );
    });

    test('logs signup event', () async {
      expect(
        () async => await AnalyticsService.logSignUp(signUpMethod: 'email'),
        returnsNormally,
      );
    });

    test('logs logout event', () async {
      expect(() async => await AnalyticsService.logLogout(), returnsNormally);
    });

    test('logs API call', () async {
      expect(
        () async => await AnalyticsService.logApiCall(
          '/api/users',
          method: 'GET',
          statusCode: 200,
          duration: 1500,
        ),
        returnsNormally,
      );
    });

    test('logs error event', () async {
      expect(
        () async => await AnalyticsService.logError(
          'test_error',
          details: 'test details',
        ),
        returnsNormally,
      );
    });

    test('logs field operation created', () async {
      expect(
        () async =>
            await AnalyticsService.logFieldOperationCreated(siteId: 'site123'),
        returnsNormally,
      );
    });

    test('logs field operation completed', () async {
      expect(
        () async => await AnalyticsService.logFieldOperationCompleted(
          siteId: 'site123',
          durationMinutes: 30,
          costAmount: 500.0,
        ),
        returnsNormally,
      );
    });

    test('logs cost submission', () async {
      expect(
        () async => await AnalyticsService.logCostSubmission(
          category: 'equipment',
          amount: 1500.0,
        ),
        returnsNormally,
      );
    });

    test('logs communication event', () async {
      expect(
        () async => await AnalyticsService.logCommunicationEvent(
          type: 'call',
          duration: '300',
        ),
        returnsNormally,
      );
    });

    test('logs sync event', () async {
      expect(
        () async => await AnalyticsService.logSyncEvent(
          status: 'success',
          itemCount: 10,
          durationMs: 5000,
        ),
        returnsNormally,
      );
    });

    test('logs offline event', () async {
      expect(
        () async =>
            await AnalyticsService.logOfflineEvent(reason: 'no_internet'),
        returnsNormally,
      );
    });

    test('logs feature usage', () async {
      expect(
        () async => await AnalyticsService.logFeatureUsage('field_operations'),
        returnsNormally,
      );
    });

    test('resets analytics data', () async {
      expect(
        () async => await AnalyticsService.resetAnalyticsData(),
        returnsNormally,
      );
    });
  });
}
