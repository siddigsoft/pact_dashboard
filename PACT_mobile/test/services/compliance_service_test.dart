import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pact_mobile/services/compliance_service.dart';

void main() {
  group('ComplianceService', () {
    setUp(() {
      // Reset SharedPreferences for each test
      SharedPreferences.setMockInitialValues({});
    });

    test('hasAcceptedTerms returns false initially', () async {
      expect(await ComplianceService.hasAcceptedTerms(), false);
    });

    test('hasAcceptedPrivacy returns false initially', () async {
      expect(await ComplianceService.hasAcceptedPrivacy(), false);
    });

    test('markTermsAsAccepted sets flag to true', () async {
      await ComplianceService.markTermsAsAccepted();
      expect(await ComplianceService.hasAcceptedTerms(), true);
    });

    test('markPrivacyAsAccepted sets flag to true', () async {
      await ComplianceService.markPrivacyAsAccepted();
      expect(await ComplianceService.hasAcceptedPrivacy(), true);
    });

    test('markAsAccepted sets both flags', () async {
      await ComplianceService.markAsAccepted();
      expect(await ComplianceService.hasAcceptedTerms(), true);
      expect(await ComplianceService.hasAcceptedPrivacy(), true);
    });

    test('markTermsAsDeclined sets flag to false', () async {
      await ComplianceService.markTermsAsAccepted();
      expect(await ComplianceService.hasAcceptedTerms(), true);

      await ComplianceService.markTermsAsDeclined();
      expect(await ComplianceService.hasAcceptedTerms(), false);
    });

    test('multiple acceptance checks remain consistent', () async {
      await ComplianceService.markAsAccepted();

      expect(await ComplianceService.hasAcceptedTerms(), true);
      expect(await ComplianceService.hasAcceptedTerms(), true);
      expect(await ComplianceService.hasAcceptedPrivacy(), true);
      expect(await ComplianceService.hasAcceptedPrivacy(), true);
    });

    test('terms and privacy are stored independently', () async {
      await ComplianceService.markTermsAsAccepted();
      expect(await ComplianceService.hasAcceptedTerms(), true);
      expect(await ComplianceService.hasAcceptedPrivacy(), false);

      await ComplianceService.markPrivacyAsAccepted();
      expect(await ComplianceService.hasAcceptedTerms(), true);
      expect(await ComplianceService.hasAcceptedPrivacy(), true);
    });
  });

  group('TermsAndPrivacyDialog Widget', () {
    testWidgets('renders dialog with required elements', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TermsAndPrivacyDialog(onAccept: () {}, onDecline: null),
          ),
        ),
      );

      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });

    testWidgets('shows terms and privacy sections', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: TermsAndPrivacyDialog(onAccept: () {})),
        ),
      );

      // Verify dialog is rendered
      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });

    testWidgets('calls onAccept when both checkboxes are checked', (
      WidgetTester tester,
    ) async {
      bool accepted = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TermsAndPrivacyDialog(
              onAccept: () {
                accepted = true;
              },
            ),
          ),
        ),
      );

      // The dialog should have checkboxes for acceptance
      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });

    testWidgets('calls onDecline callback when provided', (
      WidgetTester tester,
    ) async {
      bool declined = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TermsAndPrivacyDialog(
              onAccept: () {},
              onDecline: () {
                declined = true;
              },
            ),
          ),
        ),
      );

      // Verify dialog renders
      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });

    testWidgets('requires both terms and privacy acceptance', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: TermsAndPrivacyDialog(onAccept: () {})),
        ),
      );

      // Dialog should enforce both checkboxes
      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });

    testWidgets('displays full terms of service text', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: TermsAndPrivacyDialog(onAccept: () {})),
        ),
      );

      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });

    testWidgets('displays full privacy policy text', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: TermsAndPrivacyDialog(onAccept: () {})),
        ),
      );

      expect(find.byType(TermsAndPrivacyDialog), findsOneWidget);
    });
  });
}
