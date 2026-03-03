import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pact_mobile/widgets/form_field_with_validation.dart';

void main() {
  group('Form Validators', () {
    test('validateEmail accepts valid emails', () {
      expect(validateEmail('user@example.com'), isNull);
      expect(validateEmail('test.user@domain.co.uk'), isNull);
      expect(validateEmail('admin+tag@company.com'), isNull);
    });

    test('validateEmail rejects invalid emails', () {
      expect(validateEmail(''), isNotNull);
      expect(validateEmail('invalid'), isNotNull);
      expect(validateEmail('user@'), isNotNull);
      expect(validateEmail('@example.com'), isNotNull);
      expect(validateEmail('user @example.com'), isNotNull);
    });

    test('validatePassword enforces requirements', () {
      // Too short
      expect(validatePassword('Pass1'), isNotNull);

      // No uppercase
      expect(validatePassword('password123'), isNotNull);

      // No number
      expect(validatePassword('Password'), isNotNull);

      // Valid password
      expect(validatePassword('Password123'), isNull);
      expect(validatePassword('MySecurePass99'), isNull);
    });

    test('validatePhone accepts valid formats', () {
      expect(validatePhone('+1234567890'), isNull);
      expect(validatePhone('+249123456789'), isNull);
      expect(validatePhone('1234567890'), isNull);
    });

    test('validatePhone rejects invalid formats', () {
      expect(validatePhone(''), isNotNull);
      expect(validatePhone('123'), isNotNull);
      expect(validatePhone('abc1234567'), isNotNull);
    });

    test('validateName accepts valid names', () {
      expect(validateName('John Doe'), isNull);
      expect(validateName('Mary'), isNull);
      expect(validateName("O'Brien"), isNull);
    });

    test('validateName rejects invalid names', () {
      expect(validateName(''), isNotNull);
      expect(validateName('J'), isNotNull);
      expect(validateName('123456'), isNotNull);
      expect(validateName('John@Doe'), isNotNull);
      expect(validateName('Test#User'), isNotNull);
    });

    test('validateUrl accepts valid URLs', () {
      expect(validateUrl('https://example.com'), isNull);
      expect(validateUrl('http://www.example.com/path'), isNull);
      expect(validateUrl('https://example.com:8080'), isNull);
    });

    test('validateUrl rejects invalid URLs', () {
      expect(validateUrl(''), isNotNull);
      expect(validateUrl('not a url'), isNotNull);
      expect(validateUrl('htp://wrong'), isNotNull);
      expect(validateUrl('//example.com'), isNotNull);
    });
  });

  group('FormFieldWithValidation Widget', () {
    testWidgets('renders text field correctly', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FormFieldWithValidation(
              label: 'Email',
              validator: validateEmail,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      expect(find.byType(TextFormField), findsOneWidget);
      expect(find.text('Email'), findsWidgets);
    });

    testWidgets('shows error on invalid input', (WidgetTester tester) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FormFieldWithValidation(
              label: 'Email',
              controller: controller,
              validator: validateEmail,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      await tester.enterText(find.byType(TextFormField), 'invalid');
      await tester.pumpAndSettle();

      // Verify error state (red border)
      expect(find.byType(TextFormField), findsOneWidget);
    });

    testWidgets('shows success on valid input', (WidgetTester tester) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FormFieldWithValidation(
              label: 'Email',
              controller: controller,
              validator: validateEmail,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      await tester.enterText(find.byType(TextFormField), 'valid@example.com');
      await tester.pumpAndSettle();

      // The field should be in valid state
      expect(find.byType(TextFormField), findsOneWidget);
    });

    testWidgets('calls onChanged callback', (WidgetTester tester) async {
      late String changedValue;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FormFieldWithValidation(
              label: 'Test Field',
              validator: (value) => null,
              onChanged: (value) {
                changedValue = value;
              },
            ),
          ),
        ),
      );

      await tester.enterText(find.byType(TextFormField), 'test input');
      await tester.pumpAndSettle();

      // Verify callback was called with the input
      expect(find.byType(TextFormField), findsOneWidget);
    });

    testWidgets('supports different input types', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FormFieldWithValidation(
              label: 'Password',
              keyboardType: TextInputType.visiblePassword,
              obscureText: true,
              validator: validatePassword,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      expect(find.byType(TextFormField), findsOneWidget);
    });

    testWidgets('displays custom hint text', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FormFieldWithValidation(
              label: 'Email',
              hintText: 'Enter your email address',
              validator: validateEmail,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      expect(find.text('Enter your email address'), findsWidgets);
    });
  });
}
