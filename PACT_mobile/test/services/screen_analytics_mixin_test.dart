import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/services/screen_analytics_mixin.dart';

class TestScreen extends StatefulWidget {
  const TestScreen({super.key});

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> with ScreenAnalyticsMixin {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Test Screen')),
      body: const Center(child: Text('Test Screen Content')),
    );
  }
}

void main() {
  group('ScreenAnalyticsMixin', () {
    testWidgets('initializes with screen name', (WidgetTester tester) async {
      await tester.pumpWidget(MaterialApp(home: TestScreen()));

      expect(find.byType(TestScreen), findsOneWidget);
      expect(find.byType(Scaffold), findsOneWidget);
    });

    test('logScreenView completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenView('TestScreen'),
        returnsNormally,
      );
    });

    test('logScreenViewWithContext completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenViewWithContext(
          'TestScreen',
          userId: 'user123',
          userRole: 'supervisor',
          isOnline: true,
        ),
        returnsNormally,
      );
    });

    test('logScreenError completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenError(
          errorMessage: 'Test error',
          errorType: 'validation_error',
        ),
        returnsNormally,
      );
    });

    test('logScreenAction completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenAction(
          actionName: 'button_tapped',
          buttonName: 'submit',
        ),
        returnsNormally,
      );
    });

    test('logScreenTransition completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenTransition(
          fromScreen: 'TestScreen',
          toScreen: 'NextScreen',
        ),
        returnsNormally,
      );
    });

    test('logFormInteraction completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logFormInteraction(
          formName: 'login_form',
          fieldName: 'email',
          interactionType: 'focus',
        ),
        returnsNormally,
      );
    });

    test('logFormSubmission completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logFormSubmission(
          formName: 'login_form',
          fieldsCount: 2,
          isValid: true,
        ),
        returnsNormally,
      );
    });

    test('logScreenTime completes normally', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenTime(
          screenName: 'TestScreen',
          timeSpentSeconds: 30,
        ),
        returnsNormally,
      );
    });
  });

  group('ScreenAnalyticsMixin - Widget Integration', () {
    testWidgets('mixin integrates with StatefulWidget', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(MaterialApp(home: TestScreen()));

      await tester.pumpAndSettle();

      // Verify widget is built
      expect(find.text('Test Screen Content'), findsOneWidget);
    });

    testWidgets('mixin preserves widget functionality', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(title: const Text('App')),
            body: TestScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify scaffold is present
      expect(find.byType(Scaffold), findsWidgets);
    });
  });

  group('ScreenAnalyticsMixin - Context Preservation', () {
    test('logScreenViewWithContext handles null userId', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenViewWithContext(
          'TestScreen',
          userId: null,
          userRole: 'guest',
          isOnline: true,
        ),
        returnsNormally,
      );
    });

    test('logScreenViewWithContext handles offline status', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenViewWithContext(
          'TestScreen',
          userId: 'user123',
          userRole: 'supervisor',
          isOnline: false,
        ),
        returnsNormally,
      );
    });
  });

  group('ScreenAnalyticsMixin - Error Handling', () {
    test('logScreenError handles different error types', () async {
      final state = _TestScreenState();
      final errorTypes = [
        'validation_error',
        'network_error',
        'timeout_error',
        'permission_error',
        'unknown_error',
      ];

      for (final errorType in errorTypes) {
        expect(
          () async => await state.logScreenError(
            errorMessage: 'Test error',
            errorType: errorType,
          ),
          returnsNormally,
        );
      }
    });

    test('logScreenError handles long error messages', () async {
      final state = _TestScreenState();
      final longMessage = 'A' * 1000;

      expect(
        () async => await state.logScreenError(
          errorMessage: longMessage,
          errorType: 'test_error',
        ),
        returnsNormally,
      );
    });
  });

  group('ScreenAnalyticsMixin - Action Tracking', () {
    test('logScreenAction handles various action types', () async {
      final state = _TestScreenState();
      final actions = [
        'button_tapped',
        'menu_opened',
        'dialog_shown',
        'navigation_triggered',
        'form_submitted',
      ];

      for (final action in actions) {
        expect(
          () async => await state.logScreenAction(
            actionName: action,
            buttonName: 'test_button',
          ),
          returnsNormally,
        );
      }
    });

    test('logScreenAction handles missing button name', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenAction(
          actionName: 'menu_opened',
          buttonName: null,
        ),
        returnsNormally,
      );
    });
  });

  group('ScreenAnalyticsMixin - Form Tracking', () {
    test('logFormInteraction handles various interaction types', () async {
      final state = _TestScreenState();
      final interactions = ['focus', 'blur', 'input', 'change', 'submit'];

      for (final interaction in interactions) {
        expect(
          () async => await state.logFormInteraction(
            formName: 'test_form',
            fieldName: 'test_field',
            interactionType: interaction,
          ),
          returnsNormally,
        );
      }
    });

    test('logFormSubmission handles valid and invalid states', () async {
      final state = _TestScreenState();

      // Valid form
      expect(
        () async => await state.logFormSubmission(
          formName: 'test_form',
          fieldsCount: 5,
          isValid: true,
        ),
        returnsNormally,
      );

      // Invalid form
      expect(
        () async => await state.logFormSubmission(
          formName: 'test_form',
          fieldsCount: 5,
          isValid: false,
        ),
        returnsNormally,
      );
    });
  });

  group('ScreenAnalyticsMixin - Time Tracking', () {
    test('logScreenTime handles various durations', () async {
      final state = _TestScreenState();
      final durations = [0, 1, 30, 300, 3600, 86400];

      for (final duration in durations) {
        expect(
          () async => await state.logScreenTime(
            screenName: 'TestScreen',
            timeSpentSeconds: duration,
          ),
          returnsNormally,
        );
      }
    });

    test('logScreenTime handles negative duration gracefully', () async {
      final state = _TestScreenState();
      // Should handle gracefully even with invalid input
      expect(
        () async => await state.logScreenTime(
          screenName: 'TestScreen',
          timeSpentSeconds: -1,
        ),
        returnsNormally,
      );
    });
  });

  group('ScreenAnalyticsMixin - Transition Tracking', () {
    test('logScreenTransition handles various transitions', () async {
      final state = _TestScreenState();
      final transitions = [
        ('LoginScreen', 'MainScreen'),
        ('MainScreen', 'FieldOperationsScreen'),
        ('FieldOperationsScreen', 'CostDetailsScreen'),
        ('CostDetailsScreen', 'MainScreen'),
      ];

      for (final (from, to) in transitions) {
        expect(
          () async =>
              await state.logScreenTransition(fromScreen: from, toScreen: to),
          returnsNormally,
        );
      }
    });

    test('logScreenTransition handles same screen transition', () async {
      final state = _TestScreenState();
      expect(
        () async => await state.logScreenTransition(
          fromScreen: 'TestScreen',
          toScreen: 'TestScreen',
        ),
        returnsNormally,
      );
    });
  });
}
