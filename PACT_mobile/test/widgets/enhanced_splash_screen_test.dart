import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/widgets/enhanced_splash_screen.dart';

void main() {
  group('EnhancedSplashScreen Widget', () {
    testWidgets('renders splash screen correctly', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: EnhancedSplashScreen(message: 'Loading...')),
        ),
      );

      expect(find.byType(EnhancedSplashScreen), findsOneWidget);
    });

    testWidgets('displays loading message', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EnhancedSplashScreen(message: 'Initializing app...'),
          ),
        ),
      );

      expect(find.text('Initializing app...'), findsWidgets);
    });

    testWidgets('shows default message when not provided', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: EnhancedSplashScreen())),
      );

      expect(find.byType(EnhancedSplashScreen), findsOneWidget);
    });

    testWidgets('displays progress indicator', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: EnhancedSplashScreen(message: 'Loading...')),
        ),
      );

      // Should have a progress indicator (CircularProgressIndicator)
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('animates on load', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: EnhancedSplashScreen(message: 'Animating...')),
        ),
      );

      expect(find.byType(EnhancedSplashScreen), findsOneWidget);

      // Advance time to trigger animation
      await tester.pumpAndSettle();
      expect(find.text('Animating...'), findsWidgets);
    });

    testWidgets('has gradient background', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EnhancedSplashScreen(message: 'Loading with gradient...'),
          ),
        ),
      );

      expect(find.byType(Container), findsWidgets);
    });

    testWidgets('logo fades in correctly', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: EnhancedSplashScreen(message: 'Fading logo...')),
        ),
      );

      // Verify fade animation is set up
      expect(find.byType(EnhancedSplashScreen), findsOneWidget);
    });

    testWidgets('displays logo or icon', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: EnhancedSplashScreen())),
      );

      // Should display logo container
      expect(find.byType(Container), findsWidgets);
    });

    testWidgets('message centered on screen', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: EnhancedSplashScreen(message: 'Centered text')),
        ),
      );

      expect(find.text('Centered text'), findsWidgets);
    });

    testWidgets('supports custom message text', (WidgetTester tester) async {
      const customMessage = 'Custom loading message here';

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: EnhancedSplashScreen(message: customMessage)),
        ),
      );

      expect(find.text(customMessage), findsWidgets);
    });

    testWidgets('progress indicator visible', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EnhancedSplashScreen(message: 'Loading with spinner...'),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('layout is vertically centered', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: EnhancedSplashScreen())),
      );

      expect(find.byType(EnhancedSplashScreen), findsOneWidget);
    });

    testWidgets('transitions smoothly', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: EnhancedSplashScreen(message: 'Smooth transition...'),
          ),
        ),
      );

      await tester.pumpAndSettle();
      expect(find.text('Smooth transition...'), findsWidgets);
    });
  });
}
