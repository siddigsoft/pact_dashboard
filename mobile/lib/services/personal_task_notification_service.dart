import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/personal_task.dart';
import 'notification_service.dart';
import 'personal_task_offline_store.dart';

/// Realtime listener for personal task assignments + cache refresh.
class PersonalTaskNotificationService {
  PersonalTaskNotificationService._();
  static final PersonalTaskNotificationService instance =
      PersonalTaskNotificationService._();

  final SupabaseClient _supabase = Supabase.instance.client;
  final PersonalTaskOfflineStore _store = PersonalTaskOfflineStore();

  RealtimeChannel? _channel;
  bool _initialized = false;
  String? _userId;

  final StreamController<int> _badgeController =
      StreamController<int>.broadcast();

  Stream<int> get pendingAckBadgeStream => _badgeController.stream;

  Future<void> initialize() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return;
    if (_initialized && _userId == user.id) return;

    await dispose();
    _userId = user.id;
    _initialized = true;

    _subscribe(user.id);
  }

  void _subscribe(String userId) {
    _channel = _supabase.channel('personal_tasks_mobile_$userId');

    void onRow(Map<String, dynamic> row, {required bool isInsert}) {
      unawaited(_store.upsertTask(userId, PersonalTask.fromJson(row)));

      final assignedTo = row['assigned_to']?.toString();
      final title = row['title']?.toString() ?? 'Task';
      final taskId = row['id']?.toString() ?? '';

      if (isInsert &&
          assignedTo == userId &&
          row['user_id']?.toString() != userId &&
          taskId.isNotEmpty) {
        unawaited(
          NotificationService.showUserNotification(
            notificationId: 'task_assign_$taskId',
            title: 'New task assigned',
            body: title,
            type: 'info',
            payload: 'task:$taskId',
          ),
        );
      }

      _emitBadgeFromRow(row, userId);
    }

    _channel!
      ..onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'personal_tasks',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'assigned_to',
          value: userId,
        ),
        callback: (payload) {
          onRow(
            Map<String, dynamic>.from(payload.newRecord),
            isInsert: true,
          );
        },
      )
      ..onPostgresChanges(
        event: PostgresChangeEvent.update,
        schema: 'public',
        table: 'personal_tasks',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'assigned_to',
          value: userId,
        ),
        callback: (payload) {
          onRow(
            Map<String, dynamic>.from(payload.newRecord),
            isInsert: false,
          );
        },
      )
      ..subscribe();
  }

  void _emitBadgeFromRow(Map<String, dynamic> row, String userId) {
    final task = PersonalTask.fromJson(row);
    if (task.needsAcknowledgement(userId)) {
      _badgeController.add(1);
    }
  }

  /// Count active tasks needing acknowledgement for nav badge.
  Future<int> countNeedsAcknowledgement() async {
    final userId = _userId ?? _supabase.auth.currentUser?.id;
    if (userId == null) return 0;
    final tasks = await _store.loadCachedTasks(userId);
    return tasks.where((t) => t.isActive && t.needsAcknowledgement(userId)).length;
  }

  Future<void> refreshBadge() async {
    final count = await countNeedsAcknowledgement();
    if (!_badgeController.isClosed) _badgeController.add(count);
  }

  Future<void> dispose() async {
    await _channel?.unsubscribe();
    _channel = null;
    _initialized = false;
    _userId = null;
  }
}
