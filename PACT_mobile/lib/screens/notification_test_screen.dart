import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/notification_models.dart';
import '../services/notification_trigger_service.dart';

/// Test screen to send notifications to specific users
/// Useful for testing bilingual notifications
class NotificationTestScreen extends StatefulWidget {
  const NotificationTestScreen({super.key});

  @override
  State<NotificationTestScreen> createState() => _NotificationTestScreenState();
}

class _NotificationTestScreenState extends State<NotificationTestScreen> {
  final _emailController = TextEditingController(
    text: 'Siddisoft123@gmail.com',
  );
  final _supabase = Supabase.instance.client;
  final _notificationService = NotificationTriggerService();

  String? _status;
  bool _loading = false;
  Map<String, dynamic>? _userInfo;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _lookupUser() async {
    setState(() {
      _loading = true;
      _status = 'Looking up user...';
      _userInfo = null;
    });

    try {
      final response = await _supabase
          .from('profiles')
          .select('id, full_name, email, preferred_language, role')
          .eq('email', _emailController.text.trim())
          .maybeSingle();

      if (response == null) {
        setState(() {
          _status = '❌ User not found';
          _loading = false;
        });
        return;
      }

      setState(() {
        _userInfo = response;
        _status = '✅ User found!';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _status = '❌ Error: $e';
        _loading = false;
      });
    }
  }

  Future<void> _sendTestNotification() async {
    if (_userInfo == null) {
      setState(() => _status = '❌ Please lookup user first');
      return;
    }

    setState(() {
      _loading = true;
      _status = 'Sending notification...';
    });

    try {
      final userId = _userInfo!['id'] as String;
      final language = _userInfo!['preferred_language'] as String? ?? 'en';

      // Create bilingual message
      final title = language == 'fr'
          ? '🧪 Test de Notification'
          : '🧪 Notification Test';

      final message = language == 'fr'
          ? 'Bonjour! Ceci est une notification de test bilingue. Le système fonctionne correctement! 🇫🇷✨'
          : 'Hello! This is a bilingual test notification. The system is working correctly! 🇬🇧✨';

      final success = await _notificationService.send(
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

      setState(() {
        _status = success
            ? '✅ Notification sent successfully!'
            : '❌ Failed to send notification';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _status = '❌ Error: $e';
        _loading = false;
      });
    }
  }

  Future<void> _sendMultilingualDemo() async {
    if (_userInfo == null) {
      setState(() => _status = '❌ Please lookup user first');
      return;
    }

    setState(() {
      _loading = true;
      _status = 'Sending English notification...';
    });

    try {
      final userId = _userInfo!['id'] as String;

      // Send English notification
      await _notificationService.send(
        NotificationTriggerOptions(
          userId: userId,
          title: '🇬🇧 English Notification',
          message:
              'This is an English notification. Your site visit has been approved.',
          type: NotificationType.success,
          category: NotificationCategory.assignments,
          priority: NotificationPriority.medium,
          link: '/mmp',
        ),
      );

      setState(() => _status = 'Sending French notification...');
      await Future.delayed(const Duration(seconds: 1));

      // Send French notification
      await _notificationService.send(
        NotificationTriggerOptions(
          userId: userId,
          title: '🇫🇷 Notification Française',
          message:
              'Ceci est une notification en français. Votre visite de site a été approuvée.',
          type: NotificationType.success,
          category: NotificationCategory.assignments,
          priority: NotificationPriority.medium,
          link: '/mmp',
        ),
      );

      setState(() {
        _status = '✅ Both notifications sent!';
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _status = '❌ Error: $e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notification Test'),
        backgroundColor: Theme.of(context).colorScheme.primary,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                '📧 User Email',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _emailController,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'Enter user email',
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _loading ? null : _lookupUser,
                icon: const Icon(Icons.search),
                label: const Text('Lookup User'),
              ),
              const SizedBox(height: 24),
              if (_userInfo != null) ...[
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '👤 User Info',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _buildInfoRow('Name', _userInfo!['full_name'] ?? 'N/A'),
                        _buildInfoRow('Email', _userInfo!['email'] ?? 'N/A'),
                        _buildInfoRow(
                          'Language',
                          _userInfo!['preferred_language'] ?? 'en',
                        ),
                        _buildInfoRow('Role', _userInfo!['role'] ?? 'N/A'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _loading ? null : _sendTestNotification,
                  icon: const Icon(Icons.notifications_active),
                  label: const Text('Send Test Notification'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.all(16),
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _loading ? null : _sendMultilingualDemo,
                  icon: const Icon(Icons.language),
                  label: const Text('Send Multilingual Demo (EN + FR)'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.all(16),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              if (_status != null)
                Card(
                  color: _status!.contains('✅')
                      ? Colors.green.shade50
                      : _status!.contains('❌')
                      ? Colors.red.shade50
                      : Colors.blue.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        if (_loading)
                          const CircularProgressIndicator()
                        else
                          Text(
                            _status!,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                            textAlign: TextAlign.center,
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
