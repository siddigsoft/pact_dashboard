import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/create_task_input.dart';
import '../models/personal_task.dart';
import '../models/profile_option.dart';
import '../models/project_field_task.dart';
import 'personal_task_service.dart';
import 'task_notification_helper.dart';

class TeamMemberWorkload {
  final ProfileOption profile;
  final String? phoneNumber;
  final String department;
  final int total;
  final int completed;
  final int inProgress;
  final int overdue;
  final int todo;
  final int completionRate;
  final String efficiency;
  final List<int> weekDueCounts;
  final List<PersonalTask> personalTasks;
  final List<ProjectFieldTask> projectTasks;

  const TeamMemberWorkload({
    required this.profile,
    this.phoneNumber,
    required this.department,
    required this.total,
    required this.completed,
    required this.inProgress,
    required this.overdue,
    required this.todo,
    required this.completionRate,
    required this.efficiency,
    required this.weekDueCounts,
    required this.personalTasks,
    this.projectTasks = const [],
  });
}

class TeamTasksSnapshot {
  final List<TeamMemberWorkload> members;
  final List<PersonalTask> allTasks;
  final Map<String, String> departments;

  const TeamTasksSnapshot({
    required this.members,
    required this.allTasks,
    required this.departments,
  });
}

class TeamTasksService {
  TeamTasksService({
    SupabaseClient? client,
    PersonalTaskService? taskService,
  })  : _supabase = client ?? Supabase.instance.client,
        _tasks = taskService ?? PersonalTaskService();

  final SupabaseClient _supabase;
  final PersonalTaskService _tasks;

  static bool _isDone(String status) {
    final s = status.toLowerCase();
    return s == 'done' || s == 'completed' || s == 'complete';
  }

  static bool _isOverdue(PersonalTask t) {
    if (t.dueDate == null || _isDone(PersonalTask.statusToDb(t.status))) {
      return false;
    }
    final end = DateTime(
      t.dueDate!.year,
      t.dueDate!.month,
      t.dueDate!.day,
      23,
      59,
      59,
    );
    return end.isBefore(DateTime.now());
  }

  bool _taskBelongsTo(String empId, PersonalTask t) {
    if (t.userId == empId || t.assignedTo == empId) return true;
    return t.coAssignees.any((c) => c.id == empId);
  }

  List<int> _weekDueCounts(List<PersonalTask> tasks, DateTime weekStart) {
    return List.generate(7, (i) {
      final day = weekStart.add(Duration(days: i));
      return tasks.where((t) {
        final d = t.dueDate;
        if (d == null) return false;
        return d.year == day.year && d.month == day.month && d.day == day.day;
      }).length;
    });
  }

  Future<TeamTasksSnapshot> fetchSnapshot() async {
    final now = DateTime.now();
    final weekStart = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));

    final results = await Future.wait([
      _supabase
          .from('profiles')
          .select(
            'id, full_name, role, email, phone_number, department_id, status',
          )
          .neq('status', 'inactive')
          .order('full_name'),
      _supabase
          .from('personal_tasks')
          .select()
          .order('created_at', ascending: false)
          .limit(2000),
      _supabase
          .from('project_field_tasks')
          .select()
          .order('created_at', ascending: false)
          .limit(1000),
      _supabase.from('departments').select('id, name'),
    ]);

    final profiles = (results[0] as List)
        .map((r) => ProfileOption.fromJson(Map<String, dynamic>.from(r)))
        .toList();
    final tasks = (results[1] as List)
        .map((r) => PersonalTask.fromJson(Map<String, dynamic>.from(r)))
        .toList();
    final projectRows = (results[2] as List)
        .map((r) => ProjectFieldTask.fromJson(Map<String, dynamic>.from(r)))
        .toList();
    final deptRows = results[3] as List;
    final deptMap = <String, String>{};
    for (final d in deptRows) {
      final m = Map<String, dynamic>.from(d);
      deptMap[m['id']?.toString() ?? ''] = m['name']?.toString() ?? '';
    }

    final phoneMap = <String, String>{};
    for (final row in results[0] as List) {
      final m = Map<String, dynamic>.from(row);
      phoneMap[m['id']?.toString() ?? ''] =
          m['phone_number']?.toString() ?? '';
    }

    final members = <TeamMemberWorkload>[];
    for (final p in profiles) {
      final mine = tasks.where((t) => _taskBelongsTo(p.id, t)).toList();
      final proj = projectRows.where((t) => t.assignedTo == p.id).toList();
      if (mine.isEmpty && proj.isEmpty) continue;

      final allPersonal = mine;
      final completed =
          allPersonal.where((t) => _isDone(PersonalTask.statusToDb(t.status))).length;
      final inProgress = allPersonal
          .where((t) => t.status == PersonalTaskStatus.inprogress)
          .length;
      final overdue = allPersonal.where(_isOverdue).length;
      final todo =
          allPersonal.where((t) => t.status == PersonalTaskStatus.todo).length;
      final total = allPersonal.length + proj.length;
      final completionRate =
          total > 0 ? ((completed / total) * 100).round() : 0;
      final efficiency = completionRate >= 70 && overdue == 0
          ? 'high'
          : completionRate >= 40
          ? 'medium'
          : 'low';

      members.add(
        TeamMemberWorkload(
          profile: p,
          phoneNumber: phoneMap[p.id],
          department: deptMap[p.departmentId ?? ''] ?? '—',
          total: total,
          completed: completed,
          inProgress: inProgress,
          overdue: overdue,
          todo: todo,
          completionRate: completionRate,
          efficiency: efficiency,
          weekDueCounts: _weekDueCounts(allPersonal, weekStart),
          personalTasks: mine,
          projectTasks: proj,
        ),
      );
    }

    members.sort((a, b) => b.overdue.compareTo(a.overdue));

    return TeamTasksSnapshot(
      members: members,
      allTasks: tasks,
      departments: deptMap,
    );
  }

  Future<PersonalTask> createTaskForEmployee({
    required String employeeId,
    required String employeeName,
    required CreateTaskInput input,
  }) async {
    return _tasks.createTaskFull(
      CreateTaskInput(
        title: input.title,
        description: input.description,
        notes: input.notes,
        priority: input.priority,
        dueDate: input.dueDate,
        assignedToId: employeeId,
        assignedToName: employeeName,
        category: input.category,
        estimatedHours: input.estimatedHours,
      ),
    );
  }

  Future<PersonalTask> updateTaskStatusForEmployee({
    required String taskId,
    required PersonalTaskStatus status,
    required String employeeId,
  }) async {
    final updated = await _tasks.updateStatus(taskId, status);
    final actorId = _supabase.auth.currentUser?.id;
    if (actorId != null) {
      await TaskNotificationHelper.notifyParticipants(
        supabase: _supabase,
        task: updated,
        event: status == PersonalTaskStatus.done
            ? 'task_completed'
            : status == PersonalTaskStatus.cancelled
            ? 'task_cancelled'
            : 'task_status_changed',
        actorId: actorId,
        messageEn:
            'Manager updated "${updated.title}" to ${PersonalTask.statusLabel(status)}.',
      );
    }
    return updated;
  }

  Future<void> sendWhatsAppNudge({
    required String employeeId,
    required String message,
  }) async {
    try {
      await _supabase.functions.invoke(
        'send-whatsapp',
        body: {
          'user_ids': [employeeId],
          'event_type': 'task_overdue',
          'data': {'message': message, 'message_ar': message},
        },
      );
    } catch (_) {}
  }
}
