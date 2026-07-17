import 'package:hive/hive.dart';

/// Service for managing unread messages and chat metadata
class ChatMetadataService {
  static const String _unreadCountBoxName = 'chat_unread_counts';
  static const String _lastMessageBoxName = 'chat_last_messages';
  static const String _lastMessageTimeBoxName = 'chat_last_message_times';

  static Future<void> initializeBoxes() async {
    try {
      // Initialize unread count box
      if (!Hive.isBoxOpen(_unreadCountBoxName)) {
        await Hive.openBox<int>(_unreadCountBoxName);
      }

      // Initialize last message box
      if (!Hive.isBoxOpen(_lastMessageBoxName)) {
        await Hive.openBox<String>(_lastMessageBoxName);
      }

      // Initialize last message time box
      if (!Hive.isBoxOpen(_lastMessageTimeBoxName)) {
        await Hive.openBox<String>(_lastMessageTimeBoxName);
      }
    } catch (e) {
      print('Error initializing chat metadata boxes: $e');
    }
  }

  // ==================== UNREAD COUNTS ====================

  /// Get unread count for a chat
  static Future<int> getUnreadCount(String chatId) async {
    try {
      final box = Hive.box<int>(_unreadCountBoxName);
      return box.get(chatId, defaultValue: 0) ?? 0;
    } catch (e) {
      print('Error getting unread count: $e');
      return 0;
    }
  }

  /// Increment unread count for a chat
  static Future<void> incrementUnreadCount(
    String chatId, [
    int amount = 1,
  ]) async {
    try {
      final box = Hive.box<int>(_unreadCountBoxName);
      final current = box.get(chatId, defaultValue: 0) ?? 0;
      await box.put(chatId, current + amount);
    } catch (e) {
      print('Error incrementing unread count: $e');
    }
  }

  /// Clear unread count for a chat
  static Future<void> clearUnreadCount(String chatId) async {
    try {
      final box = Hive.box<int>(_unreadCountBoxName);
      await box.put(chatId, 0);
    } catch (e) {
      print('Error clearing unread count: $e');
    }
  }

  /// Get total unread count across all chats
  static Future<int> getTotalUnreadCount() async {
    try {
      final box = Hive.box<int>(_unreadCountBoxName);
      return box.values.fold<int>(0, (sum, count) => sum + (count ?? 0));
    } catch (e) {
      print('Error getting total unread count: $e');
      return 0;
    }
  }

  // ==================== LAST MESSAGES ====================

  /// Store last message for a chat
  static Future<void> setLastMessage(String chatId, String message) async {
    try {
      final box = Hive.box<String>(_lastMessageBoxName);
      await box.put(chatId, message);
    } catch (e) {
      print('Error setting last message: $e');
    }
  }

  /// Get last message for a chat
  static Future<String> getLastMessage(String chatId) async {
    try {
      final box = Hive.box<String>(_lastMessageBoxName);
      return box.get(chatId, defaultValue: '') ?? '';
    } catch (e) {
      print('Error getting last message: $e');
      return '';
    }
  }

  // ==================== LAST MESSAGE TIMES ====================

  /// Store last message time for a chat (ISO 8601 string)
  static Future<void> setLastMessageTime(String chatId, DateTime time) async {
    try {
      final box = Hive.box<String>(_lastMessageTimeBoxName);
      await box.put(chatId, time.toIso8601String());
    } catch (e) {
      print('Error setting last message time: $e');
    }
  }

  /// Get last message time for a chat
  static Future<DateTime?> getLastMessageTime(String chatId) async {
    try {
      final box = Hive.box<String>(_lastMessageTimeBoxName);
      final timeString = box.get(chatId, defaultValue: null);
      if (timeString != null) {
        return DateTime.tryParse(timeString);
      }
      return null;
    } catch (e) {
      print('Error getting last message time: $e');
      return null;
    }
  }

  /// Batch get all chat metadata for sorting
  static Future<Map<String, ChatMetadata>> getAllChatMetadata() async {
    try {
      final unreadBox = Hive.box<int>(_unreadCountBoxName);
      final messageBox = Hive.box<String>(_lastMessageBoxName);
      final timeBox = Hive.box<String>(_lastMessageTimeBoxName);

      final metadata = <String, ChatMetadata>{};

      // Get unique chat IDs from all boxes
      final chatIds = <String>{};
      chatIds.addAll(unreadBox.keys.cast<String>());
      chatIds.addAll(messageBox.keys.cast<String>());
      chatIds.addAll(timeBox.keys.cast<String>());

      for (final chatId in chatIds) {
        final unreadCount = unreadBox.get(chatId, defaultValue: 0) ?? 0;
        final lastMessage = messageBox.get(chatId, defaultValue: '') ?? '';
        final timeString = timeBox.get(chatId, defaultValue: null);
        final lastTime = timeString != null
            ? DateTime.tryParse(timeString)
            : null;

        metadata[chatId] = ChatMetadata(
          chatId: chatId,
          unreadCount: unreadCount,
          lastMessage: lastMessage,
          lastMessageTime: lastTime,
        );
      }

      return metadata;
    } catch (e) {
      print('Error getting all chat metadata: $e');
      return {};
    }
  }
}

/// Data class for chat metadata
class ChatMetadata {
  final String chatId;
  final int unreadCount;
  final String lastMessage;
  final DateTime? lastMessageTime;

  ChatMetadata({
    required this.chatId,
    required this.unreadCount,
    required this.lastMessage,
    this.lastMessageTime,
  });
}
