/// Extended offline queue that supports multiple data types
/// Extends notifications to include chats, calls, and other operations
class OfflineQueueManager {
  static const String _notificationQueueBox = 'offline_notifications_queue';
  static const String _chatQueueBox = 'offline_chat_queue';
  static const String _callQueueBox = 'offline_call_queue';
  static const String _updateQueueBox = 'offline_update_queue';

  /// Queue types supported
  static const List<String> SUPPORTED_TYPES = [
    'notification',
    'chat_message',
    'call_signal',
    'status_update',
  ];

  /// Item priorities
  static const Map<String, int> PRIORITY_WEIGHTS = {
    'call_signal': 4, // Highest
    'notification': 3,
    'chat_message': 2,
    'status_update': 1, // Lowest
  };

  /// Get the appropriate box name for a queue item type
  static String getBoxNameForType(String type) {
    switch (type) {
      case 'chat_message':
        return _chatQueueBox;
      case 'call_signal':
        return _callQueueBox;
      case 'status_update':
        return _updateQueueBox;
      default:
        return _notificationQueueBox;
    }
  }

  /// Get priority weight for a type
  static int getPriorityWeight(String type) {
    return PRIORITY_WEIGHTS[type] ?? 1;
  }

  /// Create a universal queue item that works across all types
  static Map<String, dynamic> createQueueItem({
    required String id,
    required String type,
    required String title,
    required String body,
    required DateTime timestamp,
    Map<String, dynamic>? data,
    int priority = 1,
    bool isOffline = true,
    bool synced = false,
    int retryCount = 0,
  }) {
    return {
      'id': id,
      'type': type,
      'title': title,
      'body': body,
      'timestamp': timestamp.toIso8601String(),
      'data': data ?? {},
      'priority': priority,
      'isOffline': isOffline,
      'synced': synced,
      'retryCount': retryCount,
      'queuedAt': DateTime.now().toIso8601String(),
    };
  }

  /// Sort queue items by priority and timestamp
  static List<Map<String, dynamic>> sortByPriority(
    List<Map<String, dynamic>> items,
  ) {
    items.sort((a, b) {
      final priorityA = getPriorityWeight(a['type'] ?? 'notification');
      final priorityB = getPriorityWeight(b['type'] ?? 'notification');

      // Higher priority first
      if (priorityA != priorityB) {
        return priorityB.compareTo(priorityA);
      }

      // Same priority: older first (FIFO)
      final timeA =
          DateTime.tryParse(a['timestamp']?.toString() ?? '') ?? DateTime.now();
      final timeB =
          DateTime.tryParse(b['timestamp']?.toString() ?? '') ?? DateTime.now();
      return timeA.compareTo(timeB);
    });

    return items;
  }

  /// Get total queue size across all types
  static int getTotalQueueSize(
    int notificationCount,
    int chatCount,
    int callCount,
    int updateCount,
  ) {
    return notificationCount + chatCount + callCount + updateCount;
  }

  /// Check if item can be queued given storage constraints
  static bool canQueue(int currentSize, int maxSize, String type) {
    // Calls and notifications get priority
    if (type == 'call_signal' || type == 'notification') {
      return currentSize < maxSize;
    }

    // Other types only if we have more space
    return currentSize < (maxSize * 0.8).toInt();
  }

  /// Cleanup old items of a specific type
  static List<Map<String, dynamic>> cleanupOldItems(
    List<Map<String, dynamic>> items,
    Duration retention, {
    String? typeFilter,
  }) {
    final cutoffTime = DateTime.now().subtract(retention);
    final filtered = items.where((item) {
      if (typeFilter != null && item['type'] != typeFilter) {
        return true; // Keep if not matching filter
      }

      final itemTime =
          DateTime.tryParse(item['timestamp']?.toString() ?? '') ??
          DateTime.now();
      return itemTime.isAfter(cutoffTime);
    }).toList();

    return filtered;
  }
}

/// Advanced sync strategy for multi-type queues
class QueueSyncStrategy {
  /// Sync in priority order with type-specific handlers
  static Future<int> syncPrioritized(
    List<Map<String, dynamic>> queue,
    Future<bool> Function(Map<String, dynamic> item) syncHandler,
  ) async {
    int successCount = 0;
    final sorted = OfflineQueueManager.sortByPriority(queue);

    for (final item in sorted) {
      try {
        final success = await syncHandler(item);
        if (success) successCount++;
      } catch (e) {
        continue;
      }
    }

    return successCount;
  }

  /// Batch sync with type-specific batching
  static Future<int> syncBatched(
    List<Map<String, dynamic>> queue,
    Future<bool> Function(List<Map<String, dynamic>> batch) batchSyncHandler, {
    int batchSize = 10,
  }) async {
    int successCount = 0;

    // Group by type
    final byType = <String, List<Map<String, dynamic>>>{};
    for (final item in queue) {
      final type = item['type'] ?? 'notification';
      byType.putIfAbsent(type, () => []).add(item);
    }

    // Sync each type in batches
    for (final typedItems in byType.values) {
      for (int i = 0; i < typedItems.length; i += batchSize) {
        final batch = typedItems.skip(i).take(batchSize).toList();
        try {
          final success = await batchSyncHandler(batch);
          if (success) successCount += batch.length;
        } catch (e) {
          continue;
        }
      }
    }

    return successCount;
  }

  /// Throttled sync to avoid overwhelming server
  static Future<int> syncThrottled(
    List<Map<String, dynamic>> queue,
    Future<bool> Function(Map<String, dynamic> item) syncHandler, {
    Duration throttle = const Duration(milliseconds: 500),
  }) async {
    int successCount = 0;
    for (final item in queue) {
      try {
        await Future.delayed(throttle);
        final success = await syncHandler(item);
        if (success) successCount++;
      } catch (e) {
        continue;
      }
    }
    return successCount;
  }
}
