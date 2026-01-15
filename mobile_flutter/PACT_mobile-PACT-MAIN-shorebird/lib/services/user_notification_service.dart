import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_notification.dart';
import 'notification_service.dart';

class UserNotificationService {
  UserNotificationService._internal();

  static final UserNotificationService _instance =
      UserNotificationService._internal();

  factory UserNotificationService() => _instance;

  static const String _cacheBoxName = 'notifications_cache';
  static const int _maxCachedNotifications = 100;

  final SupabaseClient _supabase = Supabase.instance.client;
  final List<UserNotification> _notifications = <UserNotification>[];
  final StreamController<List<UserNotification>> _controller =
      StreamController<List<UserNotification>>.broadcast();

  Box<dynamic>? _cacheBox;
  RealtimeChannel? _realtimeChannel;
  bool _isInitialized = false;
  bool _isInitializing = false;

  Future<void> initialize() async {
    if (_isInitialized || _isInitializing) {
      if (_isInitialized) {
        _emit();
      }
      return;
    }

    final currentUser = _supabase.auth.currentUser;
    if (currentUser == null) {
      debugPrint('UserNotificationService: No authenticated user');
      return;
    }

    _isInitializing = true;

    try {
      _cacheBox ??= await Hive.openBox<dynamic>(_cacheBoxName);
      await _loadFromCache();
      await _fetchLatest(currentUser.id);
      _subscribeToRealtime(currentUser.id);
      _isInitialized = true;
      _emit();
    } catch (e) {
      debugPrint('UserNotificationService initialize error: $e');
    } finally {
      _isInitializing = false;
    }
  }

  Stream<List<UserNotification>> watchNotifications() => _controller.stream;

  List<UserNotification> get currentNotifications =>
      List<UserNotification>.unmodifiable(_notifications);

  int get unreadCount =>
      _notifications.where((notification) => !notification.isRead).length;

  Future<void> markAsRead(String id) async {
    final index = _notifications.indexWhere((item) => item.id == id);
    if (index == -1) {
      return;
    }
    if (_notifications[index].isRead) {
      return;
    }
    try {
      await _supabase
          .from('notifications')
          .update({'is_read': true})
          .eq('id', id);
    } catch (e) {
      debugPrint('UserNotificationService markAsRead error: $e');
    }
    _notifications[index] = _notifications[index].copyWith(isRead: true);
    await _cacheNotification(_notifications[index]);
    _emit();
  }

  Future<void> markManyAsRead(List<String> ids) async {
    if (ids.isEmpty) {
      return;
    }
    try {
      final sanitizedIds = ids
          .map((id) => '"${id.replaceAll('"', '""')}"')
          .join(',');

      await _supabase
          .from('notifications')
          .update({'is_read': true})
          .filter('id', 'in', '($sanitizedIds)');
    } catch (e) {
      debugPrint('UserNotificationService markManyAsRead error: $e');
    }
    for (final id in ids) {
      final index = _notifications.indexWhere((item) => item.id == id);
      if (index != -1) {
        _notifications[index] = _notifications[index].copyWith(isRead: true);
        unawaited(_cacheNotification(_notifications[index]));
      }
    }
    _emit();
  }

  Future<void> _fetchLatest(String userId) async {
    try {
      // Query notifications where user_id OR recipient_id matches
      // Using or filter to catch both columns
      final response = await _supabase
          .from('notifications')
          .select()
          .or('user_id.eq.$userId,recipient_id.eq.$userId')
          .order('created_at', ascending: false)
          .limit(_maxCachedNotifications);

      debugPrint(
        'UserNotificationService: Fetched ${response.length} notifications for user $userId',
      );

      for (final item in response) {
        _upsertNotification(UserNotification.fromJson(item));
      }
      await _writeCache();
    } catch (e) {
      debugPrint('UserNotificationService fetch error: $e');
    }
  }

  Future<void> _loadFromCache() async {
    if (_cacheBox == null) {
      return;
    }
    _notifications.clear();
    for (final key in _cacheBox!.keys) {
      final raw = _cacheBox!.get(key);
      if (raw is Map<String, dynamic>) {
        _notifications.add(UserNotification.fromJson(raw));
      } else if (raw is Map) {
        _notifications.add(
          UserNotification.fromJson(Map<String, dynamic>.from(raw)),
        );
      }
    }
    _notifications.sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  void _subscribeToRealtime(String userId) {
    _realtimeChannel?.unsubscribe();
    _realtimeChannel = _supabase.channel('user_notifications_$userId');

    debugPrint(
      'UserNotificationService: Subscribing to realtime for user $userId',
    );

    _realtimeChannel
      ?..onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'notifications',
        callback: (payload) {
          final data = payload.newRecord;
          debugPrint(
            'UserNotificationService: Received INSERT event: ${data.keys.toList()}',
          );
          // Check both user_id and recipient_id columns
          final notifUserId = data['user_id'];
          final notifRecipientId = data['recipient_id'];
          if (notifUserId != userId && notifRecipientId != userId) {
            debugPrint(
              'UserNotificationService: Notification not for this user (user_id: $notifUserId, recipient_id: $notifRecipientId)',
            );
            return;
          }
          try {
            final notification = UserNotification.fromJson(
              Map<String, dynamic>.from(data),
            );
            _handleInsert(notification);
          } catch (e) {
            debugPrint('UserNotificationService realtime insert error: $e');
          }
        },
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.update,
        schema: 'public',
        table: 'notifications',
        callback: (payload) {
          final data = payload.newRecord;
          debugPrint('UserNotificationService: Received UPDATE event');
          // Check both user_id and recipient_id columns
          final notifUserId = data['user_id'];
          final notifRecipientId = data['recipient_id'];
          if (notifUserId != userId && notifRecipientId != userId) {
            return;
          }
          try {
            final notification = UserNotification.fromJson(
              Map<String, dynamic>.from(data),
            );
            _handleUpdate(notification);
          } catch (e) {
            debugPrint('UserNotificationService realtime update error: $e');
          }
        },
      )
      ..subscribe((status, error) {
        debugPrint(
          'UserNotificationService: Realtime subscription status: $status, error: $error',
        );
      });
  }

  void _handleInsert(UserNotification notification) {
    final alreadyExists = _notifications.any(
      (item) => item.id == notification.id,
    );
    _upsertNotification(notification);
    if (!alreadyExists) {
      unawaited(
        NotificationService.showUserNotification(
          notificationId: notification.id,
          title: notification.title.isEmpty
              ? 'PACT Notification'
              : notification.title,
          body: notification.message.isEmpty
              ? 'You have a new update.'
              : notification.message,
          type: notification.type,
        ),
      );
    }
    _emit();
  }

  void _handleUpdate(UserNotification notification) {
    _upsertNotification(notification);
    _emit();
  }

  void _upsertNotification(UserNotification notification) {
    final index = _notifications.indexWhere(
      (item) => item.id == notification.id,
    );
    if (index >= 0) {
      _notifications[index] = notification;
    } else {
      _notifications.insert(0, notification);
    }
    _notifications.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    _trimCache();
    unawaited(_cacheNotification(notification));
  }

  void _trimCache() {
    if (_notifications.length <= _maxCachedNotifications) {
      return;
    }
    final removed = _notifications
        .sublist(_maxCachedNotifications)
        .toList(growable: false);
    _notifications.removeRange(_maxCachedNotifications, _notifications.length);
    if (_cacheBox != null) {
      for (final notification in removed) {
        unawaited(_cacheBox!.delete(notification.id));
      }
    }
  }

  Future<void> _cacheNotification(UserNotification notification) async {
    if (_cacheBox == null) {
      return;
    }
    await _cacheBox!.put(notification.id, notification.toJson());
  }

  Future<void> _writeCache() async {
    if (_cacheBox == null) {
      return;
    }
    final Map<String, Map<String, dynamic>> data =
        <String, Map<String, dynamic>>{};
    for (final notification in _notifications) {
      data[notification.id] = notification.toJson();
    }
    await _cacheBox!.putAll(data);
  }

  void _emit() {
    if (!_controller.isClosed) {
      _controller.add(List<UserNotification>.unmodifiable(_notifications));
    }
  }

  void dispose() {
    _realtimeChannel?.unsubscribe();
    _realtimeChannel = null;
    _cacheBox = null;
    if (!_controller.isClosed) {
      _controller.close();
    }
    _notifications.clear();
    _isInitialized = false;
  }
}
