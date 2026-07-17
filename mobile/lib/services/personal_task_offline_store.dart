import 'package:hive_flutter/hive_flutter.dart';

import '../models/personal_task.dart';

/// Hive-backed cache and offline mutation queue for personal tasks.
class PersonalTaskOfflineStore {
  static const String tasksBoxName = 'personal_tasks_cache';
  static const String pendingBoxName = 'personal_tasks_pending';
  static const String metaBoxName = 'personal_tasks_meta';
  static const String _listKey = 'tasks';
  static const String _syncedAtKey = 'synced_at';

  Box<dynamic>? _tasksBox;
  Box<dynamic>? _pendingBox;
  Box<dynamic>? _metaBox;

  Future<void> ensureOpen() async {
    _tasksBox ??= await Hive.openBox<dynamic>(tasksBoxName);
    _pendingBox ??= await Hive.openBox<dynamic>(pendingBoxName);
    _metaBox ??= await Hive.openBox<dynamic>(metaBoxName);
  }

  Future<List<PersonalTask>> loadCachedTasks(String userId) async {
    await ensureOpen();
    final raw = _tasksBox!.get('${userId}_$_listKey');
    if (raw is! List) return [];
    return raw
        .whereType<Map>()
        .map((e) => PersonalTask.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<void> saveTasks(String userId, List<PersonalTask> tasks) async {
    await ensureOpen();
    final encoded = tasks.map(_taskToMap).toList();
    await _tasksBox!.put('${userId}_$_listKey', encoded);
    await _metaBox!.put('${userId}_$_syncedAtKey', DateTime.now().toIso8601String());
  }

  DateTime? lastSyncedAt(String userId) {
    final raw = _metaBox?.get('${userId}_$_syncedAtKey')?.toString();
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }

  Future<void> upsertTask(String userId, PersonalTask task) async {
    final list = await loadCachedTasks(userId);
    final index = list.indexWhere((t) => t.id == task.id);
    if (index >= 0) {
      list[index] = task;
    } else {
      list.insert(0, task);
    }
    list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    await saveTasks(userId, list);
  }

  Future<void> enqueuePending({
    required String userId,
    required String taskId,
    required String action,
    required Map<String, dynamic> patch,
  }) async {
    await ensureOpen();
    final key = '${DateTime.now().millisecondsSinceEpoch}_$taskId';
    await _pendingBox!.put(key, {
      'user_id': userId,
      'task_id': taskId,
      'action': action,
      'patch': patch,
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  Future<List<Map<String, dynamic>>> pendingMutations(String userId) async {
    await ensureOpen();
    final items = <Map<String, dynamic>>[];
    for (final key in _pendingBox!.keys) {
      final raw = _pendingBox!.get(key);
      if (raw is Map && raw['user_id']?.toString() == userId) {
        items.add({...Map<String, dynamic>.from(raw), '_hive_key': key});
      }
    }
    items.sort(
      (a, b) => (a['created_at']?.toString() ?? '').compareTo(
        b['created_at']?.toString() ?? '',
      ),
    );
    return items;
  }

  Future<void> removePending(String key) async {
    await ensureOpen();
    await _pendingBox!.delete(key);
  }

  Future<void> clearPendingForUser(String userId) async {
    await ensureOpen();
    final keysToDelete = <dynamic>[];
    for (final key in _pendingBox!.keys) {
      final raw = _pendingBox!.get(key);
      if (raw is Map && raw['user_id']?.toString() == userId) {
        keysToDelete.add(key);
      }
    }
    for (final key in keysToDelete) {
      await _pendingBox!.delete(key);
    }
  }

  static Map<String, dynamic> _taskToMap(PersonalTask task) => {
    'id': task.id,
    'user_id': task.userId,
    'assigned_to': task.assignedTo,
    'assigned_to_name': task.assignedToName,
    'co_assignees': task.coAssignees.map((c) => c.toJson()).toList(),
    'title': task.title,
    'description': task.description,
    'priority': PersonalTask.priorityToDb(task.priority),
    'status': PersonalTask.statusToDb(task.status),
    'due_date': task.dueDate?.toIso8601String(),
    'category': task.category,
    'tags': task.tags,
    'notes': task.notes,
    'created_at': task.createdAt.toIso8601String(),
    'updated_at': task.updatedAt.toIso8601String(),
    'completion_reward_amount': task.completionRewardAmount,
    'completion_reward_currency': task.completionRewardCurrency,
    'proof_required': task.proofRequired,
    'proof_note': task.proofNote,
    'proof_file_url': task.proofFileUrl,
    'proof_submitted_at': task.proofSubmittedAt?.toIso8601String(),
    'estimated_hours': task.estimatedHours,
    'start_estimated_days': task.startEstimatedDays,
    'start_requirements': task.startRequirements,
    'actual_hours': task.actualHours,
    'started_at': task.startedAt?.toIso8601String(),
    'completed_at': task.completedAt?.toIso8601String(),
    'acknowledged_at': task.acknowledgedAt?.toIso8601String(),
    'acknowledged_by': task.acknowledgedBy,
    'output_text': task.outputText,
    'project_id': task.projectId,
    'parent_task_id': task.parentTaskId,
    'recurrence': task.recurrence,
    'planning_quadrant': task.planningQuadrant,
    'description_html': task.descriptionHtml,
    'output_files': task.outputFiles.map((f) => f.toJson()).toList(),
    'approval_stage': task.approvalStage,
  };
}
