import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/create_task_input.dart';
import '../models/daily_task_definition.dart';
import '../models/personal_task.dart';
import '../models/task_output_file.dart';
import '../models/profile_option.dart';
import '../models/project_field_task.dart';
import '../models/start_task_input.dart';
import '../utils/task_html_utils.dart';
import 'personal_task_notification_service.dart';
import 'personal_task_offline_store.dart';
import 'project_field_task_service.dart';
import 'task_notification_helper.dart';

class TaskCanStartResult {
  final bool canStart;
  final List<Map<String, dynamic>> blocking;

  const TaskCanStartResult({
    required this.canStart,
    this.blocking = const [],
  });

  factory TaskCanStartResult.fromRpc(dynamic raw) {
    if (raw is! Map) {
      return const TaskCanStartResult(canStart: true);
    }
    final blocking = <Map<String, dynamic>>[];
    final b = raw['blocking'];
    if (b is List) {
      for (final item in b) {
        if (item is Map) {
          blocking.add(Map<String, dynamic>.from(item));
        }
      }
    }
    return TaskCanStartResult(
      canStart: raw['can_start'] == true,
      blocking: blocking,
    );
  }
}

class PersonalTaskFetchResult {
  final List<PersonalTask> tasks;
  final List<ProjectFieldTask> projectTasks;
  final bool fromCache;
  final bool isOffline;

  const PersonalTaskFetchResult({
    required this.tasks,
    this.projectTasks = const [],
    this.fromCache = false,
    this.isOffline = false,
  });

  List<PersonalTask> get allForDisplay {
    final adapters = projectTasks.map((p) {
      final t = p.toListAdapter();
      return PersonalTask(
        id: t.id,
        userId: t.userId,
        assignedTo: t.assignedTo,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        category: 'project',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        projectId: t.projectId,
        isProjectAdapter: true,
      );
    });
    return [...tasks, ...adapters];
  }
}

class PersonalTaskService {
  PersonalTaskService({
    SupabaseClient? client,
    PersonalTaskOfflineStore? store,
  }) : _supabase = client ?? Supabase.instance.client,
       _store = store ?? PersonalTaskOfflineStore();

  final SupabaseClient _supabase;
  final PersonalTaskOfflineStore _store;
  final ProjectFieldTaskService _projectTasks = ProjectFieldTaskService();

  String? get _userId => _supabase.auth.currentUser?.id;

  bool _isMissingColumnError(Object? error) {
    if (error is! PostgrestException) return false;
    final msg = error.message;
    return error.code == '42703' ||
        error.code == 'PGRST204' ||
        msg.contains('does not exist') ||
        msg.contains('schema cache');
  }

  Future<bool> _isOnline() async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }

  Future<PersonalTaskFetchResult> fetchMyTasks({bool forceRefresh = false}) async {
    final userId = _userId;
    if (userId == null) {
      return const PersonalTaskFetchResult(tasks: []);
    }

    final online = await _isOnline();
    if (!online) {
      final cached = await _store.loadCachedTasks(userId);
      return PersonalTaskFetchResult(
        tasks: cached,
        fromCache: true,
        isOffline: true,
      );
    }

    try {
      if (!forceRefresh) {
        await _syncPendingMutations(userId);
      }
      final tasks = await _fetchFromServer(userId);
      List<ProjectFieldTask> projectTasks = [];
      try {
        projectTasks = await _projectTasks.fetchAssignedToMe();
      } catch (e) {
        debugPrint('[PersonalTaskService] project tasks: $e');
      }
      await _store.saveTasks(userId, tasks);
      await PersonalTaskNotificationService.instance.refreshBadge();
      return PersonalTaskFetchResult(
        tasks: tasks,
        projectTasks: projectTasks,
      );
    } catch (e) {
      debugPrint('[PersonalTaskService] fetch error: $e');
      final cached = await _store.loadCachedTasks(userId);
      if (cached.isNotEmpty) {
        return PersonalTaskFetchResult(
          tasks: cached,
          fromCache: true,
          isOffline: !online,
        );
      }
      rethrow;
    }
  }

  Future<List<PersonalTask>> _fetchFromServer(String userId) async {
    final primary = await _supabase
        .from('personal_tasks')
        .select()
        .or(
          'assigned_to.eq.$userId,and(user_id.eq.$userId,assigned_to.is.null)',
        )
        .isFilter('parent_task_id', null)
        .order('created_at', ascending: false);

    final coResult = await _supabase
        .from('personal_tasks')
        .select()
        .filter('co_assignees', 'cs', jsonEncode([{'id': userId}]))
        .order('created_at', ascending: false);

    final primaryList = (primary as List)
        .map((r) => PersonalTask.fromJson(Map<String, dynamic>.from(r)))
        .toList();
    final seen = primaryList.map((t) => t.id).toSet();
    for (final row in coResult as List) {
      final task = PersonalTask.fromJson(Map<String, dynamic>.from(row));
      if (!seen.contains(task.id)) {
        primaryList.add(task);
        seen.add(task.id);
      }
    }

    primaryList.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return primaryList;
  }

  Future<PersonalTask?> fetchTaskById(String id) async {
    final userId = _userId;
    if (userId != null) {
      final cached = await _store.loadCachedTasks(userId);
      final match = cached.where((t) => t.id == id).firstOrNull;
      if (match != null && !await _isOnline()) return match;
    }

    if (!await _isOnline()) return null;

    final row = await _supabase
        .from('personal_tasks')
        .select()
        .eq('id', id)
        .maybeSingle();
    if (row == null) return null;
    final task = PersonalTask.fromJson(Map<String, dynamic>.from(row));
    if (userId != null) await _store.upsertTask(userId, task);
    return task;
  }

  Future<void> _syncPendingMutations(String userId) async {
    final pending = await _store.pendingMutations(userId);
    for (final entry in pending) {
      final taskId = entry['task_id']?.toString() ?? '';
      final patch = entry['patch'];
      final hiveKey = entry['_hive_key'];
      if (taskId.isEmpty || patch is! Map) continue;
      try {
        await _updateAndReturn(taskId, Map<String, dynamic>.from(patch));
        if (hiveKey != null) await _store.removePending(hiveKey);
      } catch (e) {
        debugPrint('[PersonalTaskService] pending sync failed: $e');
      }
    }
  }

  Future<TaskCanStartResult> checkCanStart(String taskId) async {
    if (!await _isOnline()) {
      return const TaskCanStartResult(canStart: true);
    }
    try {
      final raw = await _supabase.rpc(
        'task_can_start',
        params: {'p_task_id': taskId},
      );
      return TaskCanStartResult.fromRpc(raw);
    } catch (e) {
      debugPrint('[PersonalTaskService] task_can_start: $e');
      return const TaskCanStartResult(canStart: true);
    }
  }

  Future<List<ProfileOption>> searchProfiles(String query, {int limit = 25}) async {
    final q = query.trim();
    if (q.length < 2) return [];
    final rows = await _supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .or('full_name.ilike.%$q%,email.ilike.%$q%')
        .neq('status', 'inactive')
        .limit(limit);
    return (rows as List)
        .map((r) => ProfileOption.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<PersonalTask> createTaskFull(CreateTaskInput input) async {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');
    if (!await _isOnline()) {
      throw Exception('Connect to the internet to create a task');
    }

    final assignedTo = input.assignedToId ?? userId;
    final payload = <String, dynamic>{
      'user_id': userId,
      'assigned_to': assignedTo,
      'assigned_to_name': input.assignedToName,
      'title': input.title.trim(),
      'description': input.description?.trim(),
      'notes': input.notes?.trim(),
      'priority': PersonalTask.priorityToDb(input.priority),
      'status': 'todo',
      'category': input.category,
    };
    if (input.dueDate != null) {
      payload['due_date'] =
          input.dueDate!.toIso8601String().split('T').first;
    }
    if (input.estimatedHours != null) {
      payload['estimated_hours'] = input.estimatedHours;
    }
    if (input.tags.isNotEmpty) {
      payload['tags'] = input.tags;
    }
    if (input.recurrence != 'none') {
      payload['recurrence'] = input.recurrence;
    }
    if (input.parentTaskId != null) {
      payload['parent_task_id'] = input.parentTaskId;
    }
    if (input.coAssignees.isNotEmpty) {
      payload['co_assignees'] = input.coAssignees
          .where((c) => c.id != assignedTo)
          .map(
            (c) => {
              'id': c.id,
              'name': c.name,
              if (c.email != null) 'email': c.email,
            },
          )
          .toList();
    }

    final row = await _supabase
        .from('personal_tasks')
        .insert(payload)
        .select()
        .single();
    final task = PersonalTask.fromJson(Map<String, dynamic>.from(row));
    await _store.upsertTask(userId, task);

    final notified = <String>{userId};
    if (assignedTo != userId) {
      await TaskNotificationHelper.notifyUser(
        supabase: _supabase,
        recipientId: assignedTo,
        taskId: task.id,
        taskTitle: task.title,
        event: 'task_assigned',
        actorId: userId,
        dueDate: task.dueDate,
      );
      notified.add(assignedTo);
    }
    for (final co in input.coAssignees) {
      if (notified.contains(co.id)) continue;
      await TaskNotificationHelper.notifyUser(
        supabase: _supabase,
        recipientId: co.id,
        taskId: task.id,
        taskTitle: task.title,
        event: 'task_assigned',
        actorId: userId,
        titleEn: 'Added to a Task',
        messageEn: 'You were added to task: "${task.title}".',
        dueDate: task.dueDate,
      );
      notified.add(co.id);
    }
    return task;
  }

  Future<List<PersonalTask>> fetchSubtasks(String parentTaskId) async {
    final rows = await _supabase
        .from('personal_tasks')
        .select()
        .eq('parent_task_id', parentTaskId)
        .order('created_at', ascending: true);
    return (rows as List)
        .map((r) => PersonalTask.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<PersonalTask> createSubtask({
    required String parentTaskId,
    required String title,
  }) async {
    return createTaskFull(
      CreateTaskInput(
        title: title,
        parentTaskId: parentTaskId,
        category: 'personal',
      ),
    );
  }

  Future<PersonalTask> updateTaskFields(
    String taskId,
    Map<String, dynamic> patch,
  ) async {
    return _mutate(taskId, patch, offlineAction: 'update');
  }

  Future<PersonalTask> createTask({
    required String title,
    String? description,
    PersonalTaskPriority priority = PersonalTaskPriority.medium,
    DateTime? dueDate,
  }) async {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');

    final payload = <String, dynamic>{
      'user_id': userId,
      'assigned_to': userId,
      'title': title.trim(),
      'description': description?.trim(),
      'priority': PersonalTask.priorityToDb(priority),
      'status': 'todo',
      'category': 'personal',
    };
    if (dueDate != null) {
      payload['due_date'] = dueDate.toIso8601String().split('T').first;
    }

    if (!await _isOnline()) {
      throw Exception('Connect to the internet to create a task');
    }

    final row = await _supabase
        .from('personal_tasks')
        .insert(payload)
        .select()
        .single();
    final task = PersonalTask.fromJson(Map<String, dynamic>.from(row));
    await _store.upsertTask(userId, task);
    return task;
  }

  Future<PersonalTask> acknowledgeTask(PersonalTask task) async {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');

    final now = DateTime.now().toUtc().toIso8601String();
    final patch = <String, dynamic>{};

    if (task.assignedTo == userId) {
      patch['acknowledged_at'] = now;
      patch['acknowledged_by'] = userId;
    } else {
      final updatedCo = task.coAssignees.map((c) {
        if (c.id == userId) return c.copyWithAcknowledgement(userId);
        return c;
      }).toList();
      patch['co_assignees'] = updatedCo.map((c) => c.toJson()).toList();
    }

    final updated = await _mutate(task.id, patch, offlineAction: 'acknowledge');
    if (await _isOnline()) {
      await TaskNotificationHelper.notifyParticipants(
        supabase: _supabase,
        task: updated,
        event: 'task_acknowledged',
        actorId: userId,
        messageEn: 'Task "${updated.title}" was acknowledged.',
      );
    }
    return updated;
  }

  Future<PersonalTask> startTask(String taskId, StartTaskInput input) async {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');

    final current = await fetchTaskById(taskId);
    if (current == null) throw Exception('Task not found');

    final gate = await checkCanStart(taskId);
    if (!gate.canStart) {
      final names = gate.blocking
          .map((b) => b['title']?.toString() ?? 'another task')
          .join(', ');
      throw Exception(
        'Cannot start: complete blocking task(s) first ($names)',
      );
    }
    if (current.hasPendingParticipantAcknowledgements(userId)) {
      throw Exception(
        'Cannot start: all assignees must acknowledge first',
      );
    }

    final now = DateTime.now().toUtc();
    final patch = <String, dynamic>{
      'status': 'inprogress',
      'started_at': now.toIso8601String(),
      'estimated_hours': input.estimatedHours,
      'start_estimated_days': input.estimatedDays,
      'start_requirements': input.requirements,
      'start_dependencies': input.dependencies,
    };

    final updated = await _mutate(taskId, patch, offlineAction: 'status');
    if (await _isOnline()) {
      await TaskNotificationHelper.notifyParticipants(
        supabase: _supabase,
        task: updated,
        event: 'task_started',
        actorId: userId,
        messageEn: 'Task "${updated.title}" is now in progress.',
      );
    }
    return updated;
  }

  Future<PersonalTask> submitProof(String taskId, String proofNote) async {
    final now = DateTime.now().toUtc().toIso8601String();
    return _mutate(
      taskId,
      {
        'proof_note': proofNote.trim(),
        'proof_submitted_at': now,
      },
      offlineAction: 'update',
    );
  }

  Future<bool> creditWalletForTask(String taskId) async {
    if (!await _isOnline()) return false;
    try {
      final data = await _supabase.functions.invoke(
        'credit-task-reward',
        body: {'taskId': taskId},
      );
      final resp = data.data;
      if (resp is Map && resp['ok'] == true) return true;
      return false;
    } catch (e) {
      debugPrint('[PersonalTaskService] credit-task-reward: $e');
      return false;
    }
  }

  Future<void> deleteTask(String taskId) async {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');
    if (!await _isOnline()) {
      throw Exception('Connect to the internet to delete a task');
    }
    final task = await fetchTaskById(taskId);
    if (task == null) throw Exception('Task not found');
    if (task.userId != userId) {
      throw Exception('Only the task creator can delete it');
    }
    await _supabase.from('personal_tasks').delete().eq('id', taskId);
    final cached = await _store.loadCachedTasks(userId);
    cached.removeWhere((t) => t.id == taskId);
    await _store.saveTasks(userId, cached);
  }

  Future<PersonalTask> updateTaskFromEdit({
    required String taskId,
    required String title,
    required PersonalTaskPriority priority,
    DateTime? dueDate,
    String? assignedToId,
    String? assignedToName,
  }) async {
    final patch = <String, dynamic>{
      'title': title.trim(),
      'priority': PersonalTask.priorityToDb(priority),
      'due_date': dueDate?.toIso8601String().split('T').first,
    };
    if (assignedToId != null) {
      patch['assigned_to'] = assignedToId;
      patch['assigned_to_name'] = assignedToName;
    }
    final updated = await _mutate(taskId, patch, offlineAction: 'update');
    final actorId = _userId;
    if (actorId != null && await _isOnline()) {
      await TaskNotificationHelper.notifyParticipants(
        supabase: _supabase,
        task: updated,
        event: 'task_status_changed',
        actorId: actorId,
        messageEn: 'Task "${updated.title}" was updated.',
      );
    }
    return updated;
  }

  Future<PersonalTask> updateStatus(
    String taskId,
    PersonalTaskStatus status, {
    String? holdReason,
    bool isProjectTask = false,
  }) async {
    if (isProjectTask) {
      await _projectTasks.updateStatus(
        taskId,
        PersonalTask.statusToDb(status),
      );
      return PersonalTask(
        id: taskId,
        userId: _userId ?? '',
        title: '',
        status: status,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
        isProjectAdapter: true,
      );
    }

    final current = await fetchTaskById(taskId);
    if (current == null) throw Exception('Task not found');

    if (status == PersonalTaskStatus.inprogress &&
        current.status != PersonalTaskStatus.onHold) {
      throw Exception('Use Start task to begin work');
    }

    if (status == PersonalTaskStatus.done) {
      _assertCanComplete(current);
    }

    final patch = <String, dynamic>{
      'status': PersonalTask.statusToDb(status),
    };
    if (holdReason != null &&
        (status == PersonalTaskStatus.onHold ||
            status == PersonalTaskStatus.cancelled ||
            status == PersonalTaskStatus.rescheduled)) {
      final existing = current.notes ?? '';
      patch['notes'] = existing.isEmpty
          ? holdReason
          : '$existing\n$holdReason';
    }

    final now = DateTime.now().toUtc();
    if (status == PersonalTaskStatus.done && current.completedAt == null) {
      patch['completed_at'] = now.toIso8601String();
      if (current.actualHours == null && current.startedAt != null) {
        final hours = now.difference(current.startedAt!).inMinutes / 60.0;
        patch['actual_hours'] = (hours * 4).round() / 4;
      }
    }
    if (status == PersonalTaskStatus.rescheduled) {
      patch['rescheduled_at'] = now.toIso8601String();
    }
    if (status == PersonalTaskStatus.cancelled) {
      patch['cancelled_at'] = now.toIso8601String();
    }
    if (status == PersonalTaskStatus.onHold) {
      patch['on_hold_at'] = now.toIso8601String();
    }

    final updated = await _mutate(taskId, patch, offlineAction: 'status');

    if (await _isOnline()) {
      final actorId = _userId ?? '';
      final event = _eventForStatus(status);
      await TaskNotificationHelper.notifyParticipants(
        supabase: _supabase,
        task: updated,
        event: event,
        actorId: actorId,
        messageEn: _messageForStatus(status, updated.title, holdReason),
      );
      if (status == PersonalTaskStatus.done &&
          updated.completionRewardAmount != null &&
          updated.completionRewardAmount! > 0) {
        await creditWalletForTask(taskId);
      }
    }
    return updated;
  }

  static String _eventForStatus(PersonalTaskStatus status) {
    switch (status) {
      case PersonalTaskStatus.done:
        return 'task_completed';
      case PersonalTaskStatus.cancelled:
        return 'task_cancelled';
      default:
        return 'task_status_changed';
    }
  }

  static String _messageForStatus(
    PersonalTaskStatus status,
    String title,
    String? reason,
  ) {
    final why = reason != null && reason.isNotEmpty ? ' ($reason)' : '';
    switch (status) {
      case PersonalTaskStatus.done:
        return 'Task "$title" was marked complete.';
      case PersonalTaskStatus.cancelled:
        return 'Task "$title" was cancelled.$why';
      case PersonalTaskStatus.onHold:
        return 'Task "$title" was put on hold.$why';
      case PersonalTaskStatus.rescheduled:
        return 'Task "$title" was rescheduled.$why';
      default:
        return 'Task "$title" status was updated.';
    }
  }

  Future<PersonalTask> updateOutput(String taskId, String outputText) async {
    return _mutate(
      taskId,
      {'output_text': outputText.trim()},
      offlineAction: 'output',
    );
  }

  Future<PersonalTask> _mutate(
    String id,
    Map<String, dynamic> patch, {
    required String offlineAction,
  }) async {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');

    if (!await _isOnline()) {
      await _store.enqueuePending(
        userId: userId,
        taskId: id,
        action: offlineAction,
        patch: patch,
      );
      final current = await fetchTaskById(id);
      if (current == null) throw Exception('Task not found');
      final optimistic = _applyPatchLocally(current, patch);
      await _store.upsertTask(userId, optimistic);
      return optimistic;
    }

    final updated = await _updateAndReturn(id, patch);
    await _store.upsertTask(userId, updated);
    await PersonalTaskNotificationService.instance.refreshBadge();
    return updated;
  }

  PersonalTask _applyPatchLocally(PersonalTask task, Map<String, dynamic> patch) {
    var status = task.status;
    if (patch['status'] != null) {
      status = _parseStatusFromDb(patch['status']?.toString());
    }
    return PersonalTask(
      id: task.id,
      userId: task.userId,
      assignedTo: patch['assigned_to']?.toString() ?? task.assignedTo,
      assignedToName:
          patch['assigned_to_name']?.toString() ?? task.assignedToName,
      coAssignees: patch['co_assignees'] is List
          ? (patch['co_assignees'] as List)
                .whereType<Map>()
                .map((e) => TaskAssignee.fromJson(Map<String, dynamic>.from(e)))
                .toList()
          : task.coAssignees,
      title: patch['title']?.toString() ?? task.title,
      description: patch['description']?.toString() ?? task.description,
      priority: patch['priority'] != null
          ? _parsePriorityFromDb(patch['priority']?.toString())
          : task.priority,
      status: status,
      dueDate: patch['due_date'] != null
          ? DateTime.tryParse(patch['due_date'].toString())
          : task.dueDate,
      category: task.category,
      tags: task.tags,
      notes: patch['notes']?.toString() ?? task.notes,
      createdAt: task.createdAt,
      updatedAt: DateTime.now(),
      completionRewardAmount: task.completionRewardAmount,
      completionRewardCurrency: task.completionRewardCurrency,
      proofRequired: task.proofRequired,
      proofNote: patch['proof_note']?.toString() ?? task.proofNote,
      proofFileUrl: patch['proof_file_url']?.toString() ?? task.proofFileUrl,
      proofSubmittedAt: patch['proof_submitted_at'] != null
          ? DateTime.tryParse(patch['proof_submitted_at'].toString())
          : task.proofSubmittedAt,
      estimatedHours: (patch['estimated_hours'] as num?)?.toDouble() ??
          task.estimatedHours,
      startEstimatedDays: (patch['start_estimated_days'] as num?)?.toInt() ??
          task.startEstimatedDays,
      startRequirements:
          patch['start_requirements']?.toString() ?? task.startRequirements,
      actualHours: (patch['actual_hours'] as num?)?.toDouble() ?? task.actualHours,
      startedAt: patch['started_at'] != null
          ? DateTime.tryParse(patch['started_at'].toString())
          : task.startedAt,
      completedAt: patch['completed_at'] != null
          ? DateTime.tryParse(patch['completed_at'].toString())
          : task.completedAt,
      acknowledgedAt: patch['acknowledged_at'] != null
          ? DateTime.tryParse(patch['acknowledged_at'].toString())
          : task.acknowledgedAt,
      acknowledgedBy: patch['acknowledged_by']?.toString() ?? task.acknowledgedBy,
      outputText: patch['output_text']?.toString() ?? task.outputText,
      projectId: task.projectId,
      parentTaskId: patch['parent_task_id']?.toString() ?? task.parentTaskId,
      recurrence: patch['recurrence']?.toString() ?? task.recurrence,
      planningQuadrant:
          patch['planning_quadrant']?.toString() ?? task.planningQuadrant,
      descriptionHtml:
          patch['description_html']?.toString() ?? task.descriptionHtml,
      outputFiles: patch['output_files'] is List
          ? (patch['output_files'] as List)
                .whereType<Map>()
                .map(
                  (e) => TaskOutputFile.fromJson(Map<String, dynamic>.from(e)),
                )
                .toList()
          : task.outputFiles,
      approvalStage: patch['approval_stage']?.toString() ?? task.approvalStage,
    );
  }

  void _assertCanComplete(PersonalTask task) {
    final userId = _userId;
    if (userId == null) throw Exception('Not signed in');

    if (task.isAssignedTo(userId) && !task.isAcknowledgedBy(userId)) {
      throw Exception('Acknowledge the task before marking it done');
    }
    if (task.startedAt == null && task.status != PersonalTaskStatus.inprogress) {
      throw Exception('Start the task before marking it done');
    }
    if (task.needsProofBeforeComplete) {
      throw Exception(
        'Submit proof before marking this task done',
      );
    }
  }

  Future<PersonalTask> _updateAndReturn(
    String id,
    Map<String, dynamic> patch,
  ) async {
    try {
      final row = await _supabase
          .from('personal_tasks')
          .update(patch)
          .eq('id', id)
          .select()
          .single();
      return PersonalTask.fromJson(Map<String, dynamic>.from(row));
    } on PostgrestException catch (e) {
      if (!_isMissingColumnError(e)) rethrow;
      final fallback = Map<String, dynamic>.from(patch)
        ..removeWhere(
          (key, _) => {
            'on_hold_at',
            'rescheduled_at',
            'cancelled_at',
            'acknowledged_at',
            'acknowledged_by',
            'start_estimated_days',
            'start_requirements',
            'start_dependencies',
            'output_text',
            'start_date',
            'hours_per_day',
            'reward_deductions',
          }.contains(key),
        );
      final row = await _supabase
          .from('personal_tasks')
          .update(fallback)
          .eq('id', id)
          .select()
          .single();
      return PersonalTask.fromJson(Map<String, dynamic>.from(row));
    }
  }

  static PersonalTaskPriority _parsePriorityFromDb(String? raw) {
    switch (raw) {
      case 'low':
        return PersonalTaskPriority.low;
      case 'high':
        return PersonalTaskPriority.high;
      case 'critical':
        return PersonalTaskPriority.critical;
      default:
        return PersonalTaskPriority.medium;
    }
  }

  static PersonalTaskStatus _parseStatusFromDb(String? raw) {
    switch (raw) {
      case 'inprogress':
        return PersonalTaskStatus.inprogress;
      case 'on_hold':
        return PersonalTaskStatus.onHold;
      case 'rescheduled':
        return PersonalTaskStatus.rescheduled;
      case 'done':
        return PersonalTaskStatus.done;
      case 'cancelled':
        return PersonalTaskStatus.cancelled;
      default:
        return PersonalTaskStatus.todo;
    }
  }

  Future<void> materialiseDailyTasks() async {
    if (!await _isOnline()) return;
    try {
      await _supabase.rpc('materialise_daily_tasks_for_user');
    } catch (e) {
      debugPrint('[PersonalTaskService] materialise_daily_tasks: $e');
    }
  }

  Future<List<PersonalTask>> fetchDelegatedByMe() async {
    final userId = _userId;
    if (userId == null) return [];
    final rows = await _supabase
        .from('personal_tasks')
        .select()
        .eq('user_id', userId)
        .neq('assigned_to', userId)
        .not('assigned_to', 'is', null)
        .isFilter('parent_task_id', null)
        .order('created_at', ascending: false);
    return (rows as List)
        .map((r) => PersonalTask.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<List<DailyTaskDefinition>> fetchDailyTaskDefinitions() async {
    final rows = await _supabase
        .from('daily_task_definitions')
        .select()
        .order('title');
    return (rows as List)
        .map((r) => DailyTaskDefinition.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<PersonalTask> updatePlanningQuadrant(
    String taskId,
    String? quadrant,
  ) async {
    return updateTaskFields(taskId, {'planning_quadrant': quadrant});
  }

  Future<PersonalTask> saveDescription(
    String taskId,
    String plainText, {
    bool asHtml = true,
  }) async {
    final patch = <String, dynamic>{
      'description': plainText.trim(),
    };
    if (asHtml) {
      patch['description_html'] = TaskHtmlUtils.plainToSimpleHtml(plainText);
    }
    return updateTaskFields(taskId, patch);
  }

  Future<String?> applyWorkSessionHours(String taskId, double hours) async {
    try {
      await _supabase.rpc(
        'set_task_actual_hours',
        params: {'p_task_id': taskId, 'p_hours': hours},
      );
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    }
  }
}
