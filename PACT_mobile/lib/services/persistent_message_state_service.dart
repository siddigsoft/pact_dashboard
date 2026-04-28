import 'package:hive_flutter/hive_flutter.dart';
import 'package:flutter/foundation.dart';

/// Service for persisting unread messages across app kills
/// Allows recovery and pop-up display of messages even when app is terminated
class PersistentMessageStateService {
  static final PersistentMessageStateService _instance =
      PersistentMessageStateService._internal();

  factory PersistentMessageStateService() => _instance;
  PersistentMessageStateService._internal();

  static const String _boxName = 'persistent_message_state';
  static const String _messagesKey = 'pending_unread_messages';
  static const String _messageCountKey = 'unread_count';

  bool _initialized = false;
  late Box _box;

  /// Initialize the service
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      _box = await Hive.openBox(_boxName);
      _initialized = true;
      debugPrint('[PersistentMessageState] Initialized successfully');
    } catch (e) {
      debugPrint('[PersistentMessageState] Initialization error: $e');
    }
  }

  /// Store an unread message for pop-up display
  Future<void> storeUnreadMessage({
    required String messageId,
    required String chatId,
    required String senderId,
    required String senderName,
    required String senderAvatar,
    required String messageBody,
    required String messagePreview,
  }) async {
    if (!_initialized) {
      debugPrint('[PersistentMessageState] Not initialized, skipping store');
      return;
    }

    try {
      final messageData = {
        'messageId': messageId,
        'chatId': chatId,
        'senderId': senderId,
        'senderName': senderName,
        'senderAvatar': senderAvatar,
        'messageBody': messageBody,
        'messagePreview': messagePreview,
        'receivedAt': DateTime.now().millisecondsSinceEpoch,
      };

      // Get existing messages or create new list
      final existingMessages = _box.get(_messagesKey) as List<dynamic>? ?? [];
      existingMessages.add(messageData);

      // Keep only last 20 messages
      if (existingMessages.length > 20) {
        existingMessages.removeAt(0);
      }

      await _box.put(_messagesKey, existingMessages);
      await _box.put(_messageCountKey, existingMessages.length);

      debugPrint(
        '[PersistentMessageState] Stored message: messageId=$messageId from=$senderName',
      );
    } catch (e) {
      debugPrint('[PersistentMessageState] Error storing message: $e');
    }
  }

  /// Get stored unread messages
  Future<List<Map<String, dynamic>>> getStoredMessages() async {
    if (!_initialized) {
      debugPrint('[PersistentMessageState] Not initialized, skipping retrieve');
      return [];
    }

    try {
      final messagesData = _box.get(_messagesKey) as List<dynamic>? ?? [];

      if (messagesData.isEmpty) {
        debugPrint('[PersistentMessageState] No stored messages found');
        return [];
      }

      final messages = <Map<String, dynamic>>[];

      for (final msg in messagesData) {
        if (msg is Map) {
          final messageMap = Map<String, dynamic>.from(msg);

          // Check if message is too old (older than 5 minutes)
          final receivedAt = messageMap['receivedAt'] as int?;
          if (receivedAt != null) {
            final ageMs = DateTime.now().millisecondsSinceEpoch - receivedAt;
            if (ageMs > 5 * 60 * 1000) {
              debugPrint(
                '[PersistentMessageState] Message too old (${ageMs / 1000 / 60} min), skipping',
              );
              continue; // Skip old messages
            }
          }

          messages.add(messageMap);
        }
      }

      debugPrint(
        '[PersistentMessageState] Retrieved ${messages.length} valid messages',
      );
      return messages;
    } catch (e) {
      debugPrint('[PersistentMessageState] Error retrieving messages: $e');
      return [];
    }
  }

  /// Get count of stored messages
  Future<int> getMessageCount() async {
    if (!_initialized) return 0;
    try {
      return _box.get(_messageCountKey) as int? ?? 0;
    } catch (e) {
      return 0;
    }
  }

  /// Clear stored messages
  Future<void> clearStoredMessages() async {
    if (!_initialized) return;

    try {
      await _box.delete(_messagesKey);
      await _box.delete(_messageCountKey);
      debugPrint('[PersistentMessageState] Cleared all stored messages');
    } catch (e) {
      debugPrint('[PersistentMessageState] Error clearing messages: $e');
    }
  }

  /// Remove a specific message
  Future<void> removeMessage(String messageId) async {
    if (!_initialized) return;

    try {
      final messagesData = _box.get(_messagesKey) as List<dynamic>? ?? [];
      messagesData.removeWhere(
        (msg) => msg is Map && (msg['messageId'] as String?) == messageId,
      );
      await _box.put(_messagesKey, messagesData);
      await _box.put(_messageCountKey, messagesData.length);

      debugPrint('[PersistentMessageState] Removed message: $messageId');
    } catch (e) {
      debugPrint('[PersistentMessageState] Error removing message: $e');
    }
  }

  bool get isInitialized => _initialized;
}
