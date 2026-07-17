import 'package:supabase_flutter/supabase_flutter.dart';

class TaskStatusHistoryEntry {
  final String id;
  final String? fromStatus;
  final String toStatus;
  final String? changedByName;
  final String? reason;
  final DateTime createdAt;

  const TaskStatusHistoryEntry({
    required this.id,
    this.fromStatus,
    required this.toStatus,
    this.changedByName,
    this.reason,
    required this.createdAt,
  });

  factory TaskStatusHistoryEntry.fromJson(Map<String, dynamic> json) {
    return TaskStatusHistoryEntry(
      id: json['id']?.toString() ?? '',
      fromStatus: json['from_status']?.toString(),
      toStatus: json['to_status']?.toString() ?? '',
      changedByName: json['changed_by_name']?.toString(),
      reason: json['reason']?.toString(),
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

class TaskActivityEntry {
  final String id;
  final String? userName;
  final String kind;
  final String? body;
  final DateTime createdAt;

  const TaskActivityEntry({
    required this.id,
    this.userName,
    required this.kind,
    this.body,
    required this.createdAt,
  });

  factory TaskActivityEntry.fromJson(Map<String, dynamic> json) {
    return TaskActivityEntry(
      id: json['id']?.toString() ?? '',
      userName: json['user_name']?.toString(),
      kind: json['kind']?.toString() ?? 'activity',
      body: json['body']?.toString(),
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

class TaskActivityService {
  TaskActivityService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  Future<List<TaskStatusHistoryEntry>> fetchStatusHistory(String taskId) async {
    try {
      final rows = await _supabase
          .from('task_status_history')
          .select()
          .eq('task_id', taskId)
          .order('created_at', ascending: false)
          .limit(50);
      return (rows as List)
          .map(
            (r) => TaskStatusHistoryEntry.fromJson(
              Map<String, dynamic>.from(r),
            ),
          )
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<TaskActivityEntry>> fetchActivity(String taskId) async {
    try {
      final rows = await _supabase
          .from('task_activity')
          .select()
          .eq('task_id', taskId)
          .order('created_at', ascending: false)
          .limit(50);
      return (rows as List)
          .map(
            (r) => TaskActivityEntry.fromJson(Map<String, dynamic>.from(r)),
          )
          .toList();
    } catch (_) {
      return [];
    }
  }
}
