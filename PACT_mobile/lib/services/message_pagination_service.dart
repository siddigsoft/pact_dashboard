import '../models/chat_message.dart';

/// Service for paginated message loading to improve performance and reduce memory
class MessagePaginationService {
  static const int defaultPageSize = 30;
  static const int maxLoadedMessages = 500;

  final Map<String, List<ChatMessage>> _messageCache = {};
  final Map<String, int> _pageCounters = {};
  final Map<String, bool> _hasMoreMessages = {};

  /// Get paginated messages with lazy loading
  Future<List<ChatMessage>> getMessagePage(
    String chatId, {
    int pageSize = defaultPageSize,
    int pageNumber = 0,
  }) async {
    // For now, return cached messages
    // In practice, this would query with offset/limit
    final key = '${chatId}_page_$pageNumber';
    return _messageCache[key] ?? [];
  }

  /// Cache a batch of messages
  Future<void> cacheMessageBatch(
    String chatId,
    List<ChatMessage> messages, {
    int pageNumber = 0,
  }) async {
    if (messages.isEmpty) {
      _hasMoreMessages[chatId] = false;
      return;
    }

    final key = '${chatId}_page_$pageNumber';
    _messageCache[key] = messages;

    // Update page counter
    _pageCounters[chatId] = (pageNumber + 1);

    // Check if we have more messages to load
    _hasMoreMessages[chatId] = messages.length >= defaultPageSize;
  }

  /// Check if there are more messages to load
  bool hasMoreMessages(String chatId) {
    return _hasMoreMessages[chatId] ?? true;
  }

  /// Clear old messages to free memory
  Future<void> pruneOldMessages(String chatId) async {
    final keys = _messageCache.keys
        .where((key) => key.startsWith(chatId))
        .toList();

    // Keep only the 10 most recent pages
    if (keys.length > 10) {
      final oldKeys = keys.sublist(0, keys.length - 10);
      for (final key in oldKeys) {
        _messageCache.remove(key);
      }
    }
  }

  /// Get all cached messages for a chat
  List<ChatMessage> getAllCachedMessages(String chatId) {
    final result = <ChatMessage>[];
    final keys = _messageCache.keys
        .where((key) => key.startsWith(chatId))
        .toList();

    keys.sort((a, b) {
      final pageA = int.tryParse(a.split('_').last) ?? 0;
      final pageB = int.tryParse(b.split('_').last) ?? 0;
      return pageA.compareTo(pageB);
    });

    for (final key in keys) {
      result.addAll(_messageCache[key] ?? []);
    }

    return result;
  }

  /// Clear cache for a specific chat
  Future<void> clearChatCache(String chatId) async {
    final keys = _messageCache.keys
        .where((key) => key.startsWith(chatId))
        .toList();

    for (final key in keys) {
      _messageCache.remove(key);
    }

    _pageCounters.remove(chatId);
    _hasMoreMessages.remove(chatId);
  }

  /// Clear all pagination cache
  Future<void> clearAllCache() async {
    _messageCache.clear();
    _pageCounters.clear();
    _hasMoreMessages.clear();
  }

  /// Get memory usage statistics
  Map<String, dynamic> getMemoryStats() {
    int totalMessages = 0;
    for (final messages in _messageCache.values) {
      totalMessages += messages.length;
    }

    return {
      'totalCacheEntries': _messageCache.length,
      'totalCachedMessages': totalMessages,
      'activeChats': _pageCounters.length,
    };
  }
}
