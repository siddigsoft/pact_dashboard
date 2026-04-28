import 'dart:async';
import 'package:flutter/foundation.dart';
import 'bilingual_notification_service.dart';

class NotificationBatchingService {
  static final NotificationBatchingService _instance =
      NotificationBatchingService._internal();
  factory NotificationBatchingService() => _instance;
  NotificationBatchingService._internal();

  final Map<String, List<Map<String, dynamic>>> _notificationBatches = {};
  final Map<String, Timer> _batchTimers = {};
  static const Duration _batchWindow = Duration(seconds: 5);

  /// Add notification to batch (similar notifications grouped by sender)
  Future<void> addToBatch({
    required String senderId,
    required String senderName,
    required String notificationType, // 'missed_call', 'message', etc.
    required Map<String, dynamic> payload,
  }) async {
    final batchKey = '$notificationType:$senderId';

    if (_notificationBatches[batchKey] == null) {
      _notificationBatches[batchKey] = [];
    }

    _notificationBatches[batchKey]!.add(payload);

    // Cancel existing timer if any
    _batchTimers[batchKey]?.cancel();

    // Set new timer to flush batch after window
    _batchTimers[batchKey] = Timer(_batchWindow, () {
      flushBatch(batchKey);
    });

    // Auto-flush if batch reaches threshold
    if (_notificationBatches[batchKey]!.length >= 5) {
      await flushBatch(batchKey);
    }
  }

  /// Flush a notification batch immediately
  Future<void> flushBatch(String batchKey) async {
    final notifications = _notificationBatches.remove(batchKey);
    _batchTimers[batchKey]?.cancel();
    _batchTimers.remove(batchKey);

    if (notifications == null || notifications.isEmpty) return;

    try {
      final parts = batchKey.split(':');
      final notificationType = parts[0];
      final senderId = parts.sublist(1).join(':');

      final senderName = notifications.first['senderName'] ?? 'Someone';

      if (notifications.length == 1) {
        // Single notification, show as-is
        await BilingualNotificationService.showNotification(
          title: _getBatchTitle(notificationType, senderName, 1),
          body: notifications.first['body'] ?? '',
          payload: notifications.first,
        );
      } else {
        // Multiple notifications, show batch
        await BilingualNotificationService.showNotification(
          title: _getBatchTitle(
            notificationType,
            senderName,
            notifications.length,
          ),
          body: _getBatchBody(notificationType, notifications.length),
          payload: {
            'type': 'batch_notification',
            'batch_type': notificationType,
            'sender_id': senderId,
            'count': notifications.length,
          },
        );
      }
    } catch (e) {
      debugPrint('[NotificationBatching] Error flushing batch: $e');
    }
  }

  /// Flush all pending batches
  Future<void> flushAll() async {
    final keys = List<String>.from(_notificationBatches.keys);
    for (final key in keys) {
      await flushBatch(key);
    }
  }

  String _getBatchTitle(String type, String name, int count) {
    switch (type) {
      case 'missed_call':
        return count == 1
            ? 'Missed call from $name'
            : '$count missed calls from $name';
      case 'message':
        return count == 1 ? 'Message from $name' : '$count messages from $name';
      case 'notification':
        return '$count notifications from $name';
      default:
        return '$count notifications';
    }
  }

  String _getBatchBody(String type, int count) {
    switch (type) {
      case 'missed_call':
        return 'Tap to view all missed calls';
      case 'message':
        return 'Tap to read messages';
      case 'notification':
        return 'Tap to view all notifications';
      default:
        return 'Tap to view details';
    }
  }

  /// Check pending batches
  Map<String, int> getPendingBatches() {
    return _notificationBatches.map(
      (key, value) => MapEntry(key, value.length),
    );
  }
}
