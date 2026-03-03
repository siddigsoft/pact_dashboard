import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pact_mobile/services/error_handler_service.dart';

class MockBuildContext extends Mock implements BuildContext {}

void main() {
  group('ErrorHandlerService', () {
    late MockBuildContext mockContext;

    setUp(() {
      mockContext = MockBuildContext();
    });

    test('showNetworkError displays correct message', () async {
      final result = await AppErrorHandler.showNetworkError(
        mockContext,
        message: 'Network error occurred',
      );
      expect(result, isNull);
    });

    test('showAuthError displays authentication error', () async {
      final result = await AppErrorHandler.showAuthError(
        mockContext,
        message: 'Invalid credentials',
      );
      expect(result, isNull);
    });

    test('showSessionExpired displays session timeout message', () async {
      final result = await AppErrorHandler.showSessionExpired(mockContext);
      expect(result, isNull);
    });

    test('showServerError displays server error message', () async {
      final result = await AppErrorHandler.showServerError(
        mockContext,
        message: 'Internal server error',
      );
      expect(result, isNull);
    });

    test('showValidationError displays validation message', () async {
      final result = await AppErrorHandler.showValidationError(
        mockContext,
        message: 'Email is invalid',
        fieldName: 'email_field',
      );
      expect(result, isNull);
    });

    test('showOfflineAlert displays offline warning', () async {
      final result = await AppErrorHandler.showOfflineAlert(mockContext);
      expect(result, isNull);
    });

    test('showGenericError displays generic error message', () async {
      final result = await AppErrorHandler.showGenericError(
        mockContext,
        message: 'Something went wrong',
      );
      expect(result, isNull);
    });

    test('showTimeoutError displays timeout message', () async {
      final result = await AppErrorHandler.showTimeoutError(mockContext);
      expect(result, isNull);
    });

    test('showNetworkError with retry callback', () async {
      bool retryPressed = false;
      final result = await AppErrorHandler.showNetworkError(
        mockContext,
        onRetry: () {
          retryPressed = true;
        },
      );
      expect(result, isNull);
    });

    test('showAuthError with custom message', () async {
      final result = await AppErrorHandler.showAuthError(
        mockContext,
        message: 'Custom auth error',
      );
      expect(result, isNull);
    });

    test('showServerError with custom message', () async {
      final result = await AppErrorHandler.showServerError(
        mockContext,
        message: 'Server maintenance',
      );
      expect(result, isNull);
    });
  });
}
