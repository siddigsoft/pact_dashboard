import 'package:hive/hive.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// Service for managing user preferences including favorites, DND mode, and per-chat settings
class UserPreferencesService {
  static const String _favoritesBoxName = 'favorite_contacts';
  static const String _pinnedChatsBoxName = 'pinned_chats';
  static const String _dndBoxName = 'dnd_settings';
  static const String _chatNotificationsBoxName = 'chat_notifications';
  static const String _dndKey = 'dnd_enabled';

  static Future<void> initializeBoxes() async {
    try {
      // Initialize favorite contacts box
      if (!Hive.isBoxOpen(_favoritesBoxName)) {
        await Hive.openBox<String>(_favoritesBoxName);
      }

      // Initialize pinned chats box
      if (!Hive.isBoxOpen(_pinnedChatsBoxName)) {
        await Hive.openBox<String>(_pinnedChatsBoxName);
      }

      // Initialize DND settings box
      if (!Hive.isBoxOpen(_dndBoxName)) {
        await Hive.openBox<dynamic>(_dndBoxName);
      }

      // Initialize chat notifications box
      if (!Hive.isBoxOpen(_chatNotificationsBoxName)) {
        await Hive.openBox<String>(_chatNotificationsBoxName);
      }
    } catch (e) {
      print('Error initializing preference boxes: $e');
    }
  }

  // ==================== FAVORITES ====================

  /// Add contact to favorites
  static Future<void> addFavorite(String contactId) async {
    try {
      final box = Hive.box<String>(_favoritesBoxName);
      await box.put(contactId, contactId);
    } catch (e) {
      print('Error adding favorite: $e');
    }
  }

  /// Remove contact from favorites
  static Future<void> removeFavorite(String contactId) async {
    try {
      final box = Hive.box<String>(_favoritesBoxName);
      await box.delete(contactId);
    } catch (e) {
      print('Error removing favorite: $e');
    }
  }

  /// Toggle favorite status
  static Future<bool> toggleFavorite(String contactId) async {
    try {
      final isFavorite = await getFavoriteStatus(contactId);
      if (isFavorite) {
        await removeFavorite(contactId);
        return false;
      } else {
        await addFavorite(contactId);
        return true;
      }
    } catch (e) {
      print('Error toggling favorite: $e');
      return false;
    }
  }

  /// Check if contact is favorite
  static Future<bool> getFavoriteStatus(String contactId) async {
    try {
      final box = Hive.box<String>(_favoritesBoxName);
      return box.containsKey(contactId);
    } catch (e) {
      print('Error getting favorite status: $e');
      return false;
    }
  }

  /// Get all favorite contacts
  static Future<List<String>> getFavoriteContacts() async {
    try {
      final box = Hive.box<String>(_favoritesBoxName);
      return box.values.toList();
    } catch (e) {
      print('Error getting favorites: $e');
      return [];
    }
  }

  // ==================== PINNED CHATS ====================

  /// Add chat to pinned
  static Future<void> addPinnedChat(String chatId) async {
    try {
      final box = Hive.box<String>(_pinnedChatsBoxName);
      await box.put(chatId, chatId);
    } catch (e) {
      print('Error pinning chat: $e');
    }
  }

  /// Remove chat from pinned
  static Future<void> removePinnedChat(String chatId) async {
    try {
      final box = Hive.box<String>(_pinnedChatsBoxName);
      await box.delete(chatId);
    } catch (e) {
      print('Error unpinning chat: $e');
    }
  }

  /// Toggle pinned status
  static Future<bool> togglePinnedChat(String chatId) async {
    try {
      final isPinned = await getPinnedStatus(chatId);
      if (isPinned) {
        await removePinnedChat(chatId);
        return false;
      } else {
        await addPinnedChat(chatId);
        return true;
      }
    } catch (e) {
      print('Error toggling pinned chat: $e');
      return false;
    }
  }

  /// Check if chat is pinned
  static Future<bool> getPinnedStatus(String chatId) async {
    try {
      final box = Hive.box<String>(_pinnedChatsBoxName);
      return box.containsKey(chatId);
    } catch (e) {
      print('Error getting pinned status: $e');
      return false;
    }
  }

  /// Get all pinned chats
  static Future<List<String>> getPinnedChats() async {
    try {
      final box = Hive.box<String>(_pinnedChatsBoxName);
      return box.values.toList();
    } catch (e) {
      print('Error getting pinned chats: $e');
      return [];
    }
  }

  // ==================== DO NOT DISTURB ====================

  /// Enable Do Not Disturb mode
  static Future<void> enableDND() async {
    try {
      final box = Hive.box<dynamic>(_dndBoxName);
      await box.put(_dndKey, true);
    } catch (e) {
      print('Error enabling DND: $e');
    }
  }

  /// Disable Do Not Disturb mode
  static Future<void> disableDND() async {
    try {
      final box = Hive.box<dynamic>(_dndBoxName);
      await box.put(_dndKey, false);
    } catch (e) {
      print('Error disabling DND: $e');
    }
  }

  /// Toggle Do Not Disturb mode
  static Future<bool> toggleDND() async {
    try {
      final isDND = await isDNDEnabled();
      if (isDND) {
        await disableDND();
        return false;
      } else {
        await enableDND();
        return true;
      }
    } catch (e) {
      print('Error toggling DND: $e');
      return false;
    }
  }

  /// Check if DND is enabled
  static Future<bool> isDNDEnabled() async {
    try {
      final box = Hive.box<dynamic>(_dndBoxName);
      return box.get(_dndKey, defaultValue: false) ?? false;
    } catch (e) {
      print('Error checking DND status: $e');
      return false;
    }
  }

  // ==================== CHAT NOTIFICATIONS ====================

  /// Set notification mode for a specific chat
  /// modes: 'all', 'mentions', 'none'
  static Future<void> setChatNotificationMode(
    String chatId,
    String mode,
  ) async {
    try {
      final box = Hive.box<String>(_chatNotificationsBoxName);
      await box.put(chatId, mode);
    } catch (e) {
      print('Error setting chat notification mode: $e');
    }
  }

  /// Get notification mode for a specific chat
  static Future<String> getChatNotificationMode(String chatId) async {
    try {
      final box = Hive.box<String>(_chatNotificationsBoxName);
      return box.get(chatId, defaultValue: 'all') ?? 'all';
    } catch (e) {
      print('Error getting chat notification mode: $e');
      return 'all';
    }
  }

  /// Check if chat notifications are muted
  static Future<bool> isChatMuted(String chatId) async {
    try {
      final mode = await getChatNotificationMode(chatId);
      return mode == 'none';
    } catch (e) {
      print('Error checking if chat is muted: $e');
      return false;
    }
  }

  /// Get all muted chats
  static Future<List<String>> getMutedChats() async {
    try {
      final box = Hive.box<String>(_chatNotificationsBoxName);
      final mutedChats = <String>[];
      for (var key in box.keys) {
        if (box.get(key) == 'none') {
          mutedChats.add(key as String);
        }
      }
      return mutedChats;
    } catch (e) {
      print('Error getting muted chats: $e');
      return [];
    }
  }

  /// Mute chat notifications
  static Future<void> muteChat(String chatId) async {
    await setChatNotificationMode(chatId, 'none');
  }

  /// Unmute chat notifications
  static Future<void> unmuteChat(String chatId) async {
    await setChatNotificationMode(chatId, 'all');
  }
}
