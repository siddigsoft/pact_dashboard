import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/chat.dart';

/// Service for managing offline chat functionality
class OfflineChatService {
  static const String _offlineChatBoxName = 'offline_chats_box';
  static const String _chatMetadataKey = 'chat_metadata_';
  static const String _lastSyncKey = 'chats_last_sync';

  /// Get or create offline chats box
  Future<Box> _getChatsBox() async {
    return Hive.openBox(_offlineChatBoxName);
  }

  /// Cache all chats for offline access
  Future<void> cacheChatsOffline(List<Chat> chats) async {
    try {
      final box = await _getChatsBox();

      // Store chat list
      final chatIds = <String>[];
      for (final chat in chats) {
        chatIds.add(chat.id);
        await box.put('$_chatMetadataKey${chat.id}', {
          'id': chat.id,
          'name': chat.name,
          'chat_type': chat.chatType,
          'is_group': chat.isGroup,
          'created_by': chat.createdBy,
          'created_at': chat.createdAt.toIso8601String(),
          'other_participant_id': chat.otherParticipantId,
          'other_participant_name': chat.otherParticipantName,
          'disappearing_timer': chat.disappearingTimer,
          'last_message_preview': chat.lastMessagePreview,
          'last_message_time': chat.lastMessageTime?.toIso8601String(),
          'is_muted': chat.isMuted,
          'background_color': chat.backgroundColor,
        });
      }

      // Store metadata
      await box.put('chat_list', chatIds);

      // Update sync timestamp
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastSyncKey, DateTime.now().toIso8601String());

      debugPrint('[OfflineChatService] Cached ${chats.length} chats');
    } catch (e) {
      debugPrint('[OfflineChatService] Error caching chats: $e');
    }
  }

  /// Get cached chats for offline access
  Future<List<Chat>> getCachedChatsOffline() async {
    try {
      final box = await _getChatsBox();
      final chatIds = box.get('chat_list');

      if (chatIds is! List) return [];

      final chats = <Chat>[];
      for (final chatId in chatIds) {
        final chatData = box.get('$_chatMetadataKey$chatId');
        if (chatData is! Map) continue;

        final map = Map<String, dynamic>.from(chatData);

        final chat = Chat(
          id: map['id'] ?? '',
          name: map['name'],
          chatType: map['chat_type'] ?? 'private',
          isGroup: map['is_group'] ?? false,
          createdBy: map['created_by'],
          createdAt:
              DateTime.tryParse(map['created_at'] ?? '') ?? DateTime.now(),
          participants: [],
          otherParticipantId: map['other_participant_id'],
          otherParticipantName: map['other_participant_name'],
          disappearingTimer: map['disappearing_timer'],
          lastMessagePreview: map['last_message_preview'],
          lastMessageTime: DateTime.tryParse(map['last_message_time'] ?? ''),
          isMuted: map['is_muted'] ?? false,
          backgroundColor: map['background_color'],
        );

        chats.add(chat);
      }

      return chats;
    } catch (e) {
      debugPrint('[OfflineChatService] Error loading cached chats: $e');
      return [];
    }
  }

  /// Get last sync timestamp
  Future<DateTime?> getLastSyncTime() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final lastSync = prefs.getString(_lastSyncKey);
      return lastSync != null ? DateTime.tryParse(lastSync) : null;
    } catch (e) {
      debugPrint('[OfflineChatService] Error getting sync time: $e');
      return null;
    }
  }

  /// Check if offline data needs refresh
  Future<bool> shouldRefreshOfflineData() async {
    try {
      final lastSync = await getLastSyncTime();
      if (lastSync == null) return true;

      // Refresh if data is older than 1 hour
      final age = DateTime.now().difference(lastSync);
      return age.inHours >= 1;
    } catch (e) {
      return true;
    }
  }

  /// Update a single chat in offline cache
  Future<void> updateChatOffline(Chat chat) async {
    try {
      final box = await _getChatsBox();

      await box.put('$_chatMetadataKey${chat.id}', {
        'id': chat.id,
        'name': chat.name,
        'chat_type': chat.chatType,
        'is_group': chat.isGroup,
        'created_by': chat.createdBy,
        'created_at': chat.createdAt.toIso8601String(),
        'other_participant_id': chat.otherParticipantId,
        'other_participant_name': chat.otherParticipantName,
        'disappearing_timer': chat.disappearingTimer,
        'last_message_preview': chat.lastMessagePreview,
        'last_message_time': chat.lastMessageTime?.toIso8601String(),
        'is_muted': chat.isMuted,
        'background_color': chat.backgroundColor,
      });

      debugPrint('[OfflineChatService] Updated chat ${chat.id}');
    } catch (e) {
      debugPrint('[OfflineChatService] Error updating chat: $e');
    }
  }

  /// Remove a chat from offline cache
  Future<void> removeChatOffline(String chatId) async {
    try {
      final box = await _getChatsBox();

      await box.delete('$_chatMetadataKey$chatId');

      // Update chat list
      final chatIds = box.get('chat_list');
      if (chatIds is List) {
        chatIds.remove(chatId);
        await box.put('chat_list', chatIds);
      }

      debugPrint('[OfflineChatService] Removed chat $chatId from cache');
    } catch (e) {
      debugPrint('[OfflineChatService] Error removing chat: $e');
    }
  }

  /// Search chats offline
  Future<List<Chat>> searchChatsOffline(String query) async {
    try {
      final allChats = await getCachedChatsOffline();
      final lowerQuery = query.toLowerCase();

      return allChats
          .where(
            (chat) =>
                (chat.name.toLowerCase().contains(lowerQuery) ?? false) ||
                (chat.otherParticipantName?.toLowerCase().contains(
                      lowerQuery,
                    ) ??
                    false),
          )
          .toList();
    } catch (e) {
      debugPrint('[OfflineChatService] Error searching chats: $e');
      return [];
    }
  }

  /// Get statistics about offline data
  Future<Map<String, dynamic>> getOfflineStats() async {
    try {
      final chats = await getCachedChatsOffline();
      final lastSync = await getLastSyncTime();

      return {
        'cached_chats': chats.length,
        'last_sync': lastSync?.toIso8601String(),
        'needs_refresh': await shouldRefreshOfflineData(),
      };
    } catch (e) {
      return {'cached_chats': 0, 'error': e.toString()};
    }
  }

  /// Clear all offline chat data
  Future<void> clearOfflineChats() async {
    try {
      final box = await _getChatsBox();
      await box.clear();

      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_lastSyncKey);

      debugPrint('[OfflineChatService] Cleared all offline chat data');
    } catch (e) {
      debugPrint('[OfflineChatService] Error clearing offline data: $e');
    }
  }
}
