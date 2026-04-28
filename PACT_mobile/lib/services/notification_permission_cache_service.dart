// lib/services/notification_permission_cache_service.dart
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:developer' as developer;

/// GAP #3: Handles notification caching when permission denied
/// Stores messages/calls locally and retries when permission granted
class NotificationPermissionCacheService {
  static const String debugTag = '[NotificationPermissionCache]';
  static const String _boxName = 'notification_cache';
  static const String _messagesKey = 'cached_messages';
  static const String _callsKey = 'cached_calls';
  static const String _permissionStatusKey = 'permission_status';

  static final NotificationPermissionCacheService _instance =
      NotificationPermissionCacheService._internal();

  factory NotificationPermissionCacheService() => _instance;
  NotificationPermissionCacheService._internal();

  Box? _box;
  bool _permissionDenied = false;

  /// Initialize the cache
  Future<void> initialize() async {
    try {
      _box = await Hive.openBox(_boxName);
      _permissionDenied =
          _box?.get(_permissionStatusKey, defaultValue: false) ?? false;
      developer.log(
        '$debugTag Initialized. Permission denied: $_permissionDenied',
        name: debugTag,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error initializing: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  /// Cache a message when permission denied
  Future<void> cacheMessage({
    required String messageId,
    required String senderId,
    required String senderName,
    required String messagePreview,
    required String chatId,
    required DateTime timestamp,
  }) async {
    if (!_permissionDenied) return;

    try {
      final messages = await getCachedMessages();
      messages.add({
        'id': messageId,
        'senderId': senderId,
        'senderName': senderName,
        'preview': messagePreview,
        'chatId': chatId,
        'timestamp': timestamp.toIso8601String(),
      });

      await _box?.put(_messagesKey, messages);
      developer.log(
        '$debugTag Cached message from $senderName. Total: ${messages.length}',
        name: debugTag,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error caching message: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  /// Cache a call when permission denied
  Future<void> cacheCall({
    required String callId,
    required String callerId,
    required String callerName,
    required bool isVideoCall,
    required DateTime timestamp,
  }) async {
    if (!_permissionDenied) return;

    try {
      final calls = await getCachedCalls();
      calls.add({
        'id': callId,
        'callerId': callerId,
        'callerName': callerName,
        'isVideoCall': isVideoCall,
        'timestamp': timestamp.toIso8601String(),
      });

      await _box?.put(_callsKey, calls);
      developer.log(
        '$debugTag Cached call from $callerName. Total: ${calls.length}',
        name: debugTag,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error caching call: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  /// Get all cached messages
  Future<List<Map<String, dynamic>>> getCachedMessages() async {
    try {
      final messages = _box?.get(_messagesKey, defaultValue: <Map>[]);
      return List<Map<String, dynamic>>.from(messages ?? []);
    } catch (e) {
      developer.log(
        '$debugTag Error getting cached messages: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Get all cached calls
  Future<List<Map<String, dynamic>>> getCachedCalls() async {
    try {
      final calls = _box?.get(_callsKey, defaultValue: <Map>[]);
      return List<Map<String, dynamic>>.from(calls ?? []);
    } catch (e) {
      developer.log(
        '$debugTag Error getting cached calls: $e',
        name: debugTag,
        error: e,
      );
      return [];
    }
  }

  /// Get unread message count
  Future<int> getUnreadMessageCount() async {
    final messages = await getCachedMessages();
    return messages.length;
  }

  /// Get missed call count
  Future<int> getMissedCallCount() async {
    final calls = await getCachedCalls();
    return calls.length;
  }

  /// Set permission denied status
  Future<void> setPermissionDenied(bool denied) async {
    try {
      _permissionDenied = denied;
      await _box?.put(_permissionStatusKey, denied);
      developer.log(
        '$debugTag Permission denied status set to: $denied',
        name: debugTag,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error setting permission status: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  /// Check if permission is denied
  bool isPermissionDenied() => _permissionDenied;

  /// Clear all cached data (call when permission granted)
  Future<void> clearAllCache() async {
    try {
      await _box?.delete(_messagesKey);
      await _box?.delete(_callsKey);
      developer.log(
        '$debugTag Cleared all cached notifications',
        name: debugTag,
      );
    } catch (e) {
      developer.log(
        '$debugTag Error clearing cache: $e',
        name: debugTag,
        error: e,
      );
    }
  }

  /// Get summary of cached items
  Future<Map<String, int>> getCacheSummary() async {
    final messages = await getCachedMessages();
    final calls = await getCachedCalls();

    return {
      'messages': messages.length,
      'calls': calls.length,
      'total': messages.length + calls.length,
    };
  }
}
