import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:pact_mobile/models/notification_models.dart';
import 'package:pact_mobile/services/notification_trigger_service.dart';

/// Test script to send a bilingual notification to a specific user
/// Run with: dart run tools/send_test_notification.dart
void main() async {
  print('🚀 Starting notification test...\n');

  // Initialize Supabase
  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL'),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
  );

  final supabase = Supabase.instance.client;
  final notificationService = NotificationTriggerService();

  try {
    // Find user by email
    print('📧 Looking up user: Siddisoft123@gmail.com');
    final userResponse = await supabase
        .from('profiles')
        .select('id, full_name, preferred_language')
        .eq('email', 'Siddisoft123@gmail.com')
        .maybeSingle();

    if (userResponse == null) {
      print('❌ User not found with email: Siddisoft123@gmail.com');
      print('   Please check the email address or create the user first.');
      return;
    }

    final userId = userResponse['id'] as String;
    final userName = userResponse['full_name'] as String? ?? 'User';
    final language = userResponse['preferred_language'] as String? ?? 'en';

    print('✅ User found:');
    print('   ID: $userId');
    print('   Name: $userName');
    print('   Preferred Language: $language\n');

    // Create bilingual message
    final title = language == 'fr'
        ? '🧪 Test de Notification Bilingue'
        : '🧪 Bilingual Notification Test';

    final message = language == 'fr'
        ? 'Bonjour! Ceci est une notification de test pour vérifier que le système de notifications bilingues fonctionne correctement. 🇫🇷'
        : 'Hello! This is a test notification to verify that the bilingual notification system is working correctly. 🇬🇧';

    print('📨 Sending notification...');
    print('   Title: $title');
    print('   Message: $message\n');

    // Send the test notification
    final success = await notificationService.send(
      NotificationTriggerOptions(
        userId: userId,
        title: title,
        message: message,
        type: NotificationType.info,
        category: NotificationCategory.system,
        priority: NotificationPriority.high,
        link: '/notifications',
      ),
    );

    if (success) {
      print('✅ Notification sent successfully!');
      print('   Check the app to see if it appears.');
    } else {
      print('❌ Failed to send notification.');
      print('   Check user notification preferences or service logs.');
    }
  } catch (e, stackTrace) {
    print('❌ Error sending notification: $e');
    print('Stack trace: $stackTrace');
  }

  print('\n✨ Test completed.');
}
