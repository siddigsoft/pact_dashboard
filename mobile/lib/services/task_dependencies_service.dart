import 'package:flutter/foundation.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/personal_task.dart';
import '../models/task_dependency.dart';

class TaskDependenciesService {
  TaskDependenciesService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  String? get _userId => _supabase.auth.currentUser?.id;

  Future<List<TaskDependency>> fetchForTask(String taskId) async {
    final rows = await _supabase
        .from('task_dependencies')
        .select()
        .or('parent_task_id.eq.$taskId,dependent_task_id.eq.$taskId');
    return (rows as List)
        .map((r) => TaskDependency.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<List<BlockingTaskInfo>> blockingTasks(String taskId) async {
    final gate = await _supabase.rpc(
      'task_can_start',
      params: {'p_task_id': taskId},
    );
    if (gate is! Map) return [];
    final blocking = gate['blocking'];
    if (blocking is! List) return [];
    return blocking
        .whereType<Map>()
        .map(
          (b) => BlockingTaskInfo(
            id: b['id']?.toString() ?? '',
            title: b['title']?.toString() ?? 'Task',
            status: b['status']?.toString() ?? 'todo',
            dependencyId: b['dependency_id']?.toString(),
          ),
        )
        .toList();
  }

  Future<List<PersonalTask>> searchTasksForLink(String query, {int limit = 20}) async {
    final userId = _userId;
    if (userId == null) return [];
    final q = query.trim();
    if (q.isEmpty) return [];
    final rows = await _supabase
        .from('personal_tasks')
        .select()
        .ilike('title', '%$q%')
        .limit(limit);
    return (rows as List)
        .map((r) => PersonalTask.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<String?> addDependency({
    required String parentTaskId,
    required String dependentTaskId,
    String dependencyType = 'blocks',
    String? description,
  }) async {
    if (_userId == null) return 'Not signed in';
    if (parentTaskId == dependentTaskId) {
      return 'Cannot link a task to itself';
    }
    try {
      final circular = await _supabase.rpc(
        'check_circular_dependencies',
        params: {
          'p_parent_id': parentTaskId,
          'p_dependent_id': dependentTaskId,
        },
      );
      if (circular == true) {
        return 'This would create a circular dependency';
      }
    } catch (e) {
      debugPrint('[TaskDependencies] circular check: $e');
    }

    try {
      await _supabase.from('task_dependencies').insert({
        'parent_task_id': parentTaskId,
        'dependent_task_id': dependentTaskId,
        'dependency_type': dependencyType,
        'description': description,
        'created_by': _userId,
      });
      try {
        await _supabase.rpc('recalculate_task_schedules');
      } catch (_) {}
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    }
  }

  Future<Map<String, dynamic>> findCriticalPath({String? projectId}) async {
    try {
      final raw = await _supabase.rpc(
        'find_critical_path',
        params: {'p_project_id': projectId},
      );
      if (raw is Map) return Map<String, dynamic>.from(raw);
      return {};
    } catch (e) {
      debugPrint('[TaskDependencies] critical path: $e');
      return {};
    }
  }

  Future<String?> removeDependency(String dependencyId) async {
    try {
      await _supabase.from('task_dependencies').delete().eq('id', dependencyId);
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    }
  }
}
