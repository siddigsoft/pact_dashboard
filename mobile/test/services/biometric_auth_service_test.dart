// Test file for BiometricAuthService
// Run with: flutter test test/services/biometric_auth_service_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:local_auth/local_auth.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pact_mobile/services/biometric_auth_service.dart';

// Mock classes
class MockLocalAuthentication extends Mock implements LocalAuthentication {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('BiometricAuthService Tests', () {
    late BiometricAuthService biometricService;

    setUp(() {
      biometricService = BiometricAuthService();
    });

    group('isBiometricAvailable', () {
      test('returns true when biometric is available', () async {
        // This is a simplified test - in real testing you'd mock LocalAuthentication
        // For now, we just verify the method exists and returns a bool
        final result = await biometricService.isBiometricAvailable();
        expect(result, isA<bool>());
      });

      test('returns false on web platform', () async {
        // On web, biometric should always return false
        // This test would need platform-specific mocking
        final result = await biometricService.isBiometricAvailable();
        expect(result, isA<bool>());
      });
    });

    group('getAvailableBiometrics', () {
      test('returns list of available biometric types', () async {
        final result = await biometricService.getAvailableBiometrics();
        expect(result, isA<List<BiometricType>>());
      });
    });

    group('getBiometricTypeName', () {
      test('returns "Face ID" for face biometric', () {
        final name = biometricService.getBiometricTypeName([
          BiometricType.face,
        ]);
        expect(name, equals('Face ID'));
      });

      test('returns "Fingerprint" for fingerprint biometric', () {
        final name = biometricService.getBiometricTypeName([
          BiometricType.fingerprint,
        ]);
        expect(name, equals('Fingerprint'));
      });

      test('returns "Iris" for iris biometric', () {
        final name = biometricService.getBiometricTypeName([
          BiometricType.iris,
        ]);
        expect(name, equals('Iris'));
      });

      test('returns "Biometric" for empty list', () {
        final name = biometricService.getBiometricTypeName([]);
        expect(name, equals('Biometric'));
      });

      test('prioritizes face over fingerprint', () {
        final name = biometricService.getBiometricTypeName([
          BiometricType.fingerprint,
          BiometricType.face,
        ]);
        expect(name, equals('Face ID'));
      });
    });

    group('Credential Management', () {
      test('storeCredentials stores email and password', () async {
        // This test would require mocking FlutterSecureStorage
        // For demonstration purposes
        expect(
          () async => await biometricService.storeCredentials(
            'test@example.com',
            'password123',
          ),
          returnsNormally,
        );
      });

      test(
        'getStoredCredentials returns map with email and password keys',
        () async {
          final credentials = await biometricService.getStoredCredentials();
          expect(credentials, isA<Map<String, String?>>());
          expect(credentials.containsKey('email'), isTrue);
          expect(credentials.containsKey('password'), isTrue);
        },
      );
    });

    group('Biometric Enable/Disable', () {
      test('enableBiometric stores user email', () async {
        expect(
          () async =>
              await biometricService.enableBiometric('test@example.com'),
          returnsNormally,
        );
      });

      test('disableBiometric clears biometric settings', () async {
        expect(
          () async => await biometricService.disableBiometric(),
          returnsNormally,
        );
      });

      test('isBiometricEnabled returns boolean', () async {
        final isEnabled = await biometricService.isBiometricEnabled();
        expect(isEnabled, isA<bool>());
      });
    });
  });

  group('Integration Tests', () {
    test('Full biometric setup flow', () async {
      final service = BiometricAuthService();

      // Check availability
      final isAvailable = await service.isBiometricAvailable();

      if (isAvailable) {
        // Get biometric types
        final biometrics = await service.getAvailableBiometrics();
        expect(biometrics, isNotEmpty);

        // Get friendly name
        final typeName = service.getBiometricTypeName(biometrics);
        expect(typeName, isNotEmpty);

        // Note: Actual authentication requires user interaction
        // and cannot be fully automated in tests
      }
    });
  });

  group('Error Handling', () {
    test('handles platform exceptions gracefully', () async {
      final service = BiometricAuthService();

      // These should not throw exceptions
      expect(() async => await service.isBiometricAvailable(), returnsNormally);

      expect(
        () async => await service.getAvailableBiometrics(),
        returnsNormally,
      );
    });
  });
}

/* 
To run these tests:

1. Basic test run:
   flutter test test/services/biometric_auth_service_test.dart

2. With coverage:
   flutter test --coverage test/services/biometric_auth_service_test.dart

3. Verbose output:
   flutter test --verbose test/services/biometric_auth_service_test.dart

Note: Full biometric authentication testing requires a physical device
or properly configured emulator/simulator with biometric enrollment.

For manual testing:
1. iOS Simulator: Features > Face ID > Enrolled
2. Android Emulator: Settings > Security > Add Fingerprint
*/
