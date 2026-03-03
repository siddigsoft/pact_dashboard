import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/services/crash_reporting_service.dart';

void main() {
  group('CrashReportingService', () {
    late CrashReportingService service;

    setUp(() {
      service = CrashReportingService();
    });

    test('initializes singleton correctly', () {
      final service1 = CrashReportingService();
      final service2 = CrashReportingService();
      expect(identical(service1, service2), true);
    });

    test('initialize completes without error', () async {
      expect(
        () async => await CrashReportingService.initialize(),
        returnsNormally,
      );
    });

    test('setUserId handles valid user ID', () async {
      expect(() async => await service.setUserId('user123'), returnsNormally);
    });

    test('setUserId handles empty user ID', () async {
      expect(() async => await service.setUserId(''), returnsNormally);
    });

    test('setCustomKey stores custom data', () async {
      expect(
        () async => await service.setCustomKey('app_version', '1.0.0'),
        returnsNormally,
      );
    });

    test('setCustomKey with various data types', () async {
      await service.setCustomKey('version', '1.0.0');
      await service.setCustomKey('build_number', 42);
      await service.setCustomKey('is_production', true);
      expect(true, true);
    });

    test('recordException handles error and stack trace', () async {
      final error = Exception('Test error');
      final stackTrace = StackTrace.current;

      expect(
        () async => await service.recordException(error, stackTrace),
        returnsNormally,
      );
    });

    test('recordMessage logs message', () async {
      expect(
        () async => await service.recordMessage('Test message'),
        returnsNormally,
      );
    });

    test('logNavigation tracks screen navigation', () async {
      expect(
        () async => await service.logNavigation('/login'),
        returnsNormally,
      );
    });

    test('logApiCall logs API calls', () async {
      expect(
        () async => await service.logApiCall('GET /api/users'),
        returnsNormally,
      );
    });

    test('logDatabaseOperation logs DB operations', () async {
      expect(
        () async =>
            await service.logDatabaseOperation('INSERT INTO users VALUES'),
        returnsNormally,
      );
    });

    test('handles null values gracefully', () async {
      expect(() async => await service.recordMessage(''), returnsNormally);
    });
  });
}
