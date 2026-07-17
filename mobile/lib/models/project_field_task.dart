import 'personal_task.dart';

/// Field project task from `project_field_tasks` (shown alongside personal tasks).
class ProjectFieldTask {
  final String id;
  final String title;
  final String? description;
  final String status;
  final String? priority;
  final DateTime? dueDate;
  final String? projectId;
  final String projectName;
  final String? assignedTo;
  final DateTime createdAt;

  const ProjectFieldTask({
    required this.id,
    required this.title,
    this.description,
    required this.status,
    this.priority,
    this.dueDate,
    this.projectId,
    this.projectName = 'Project',
    this.assignedTo,
    required this.createdAt,
  });

  factory ProjectFieldTask.fromJson(
    Map<String, dynamic> json, {
    String projectName = 'Project',
  }) {
    return ProjectFieldTask(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Task',
      description: json['description']?.toString(),
      status: json['status']?.toString() ?? 'todo',
      priority: json['priority']?.toString(),
      dueDate: DateTime.tryParse(json['due_date']?.toString() ?? ''),
      projectId: json['project_id']?.toString(),
      projectName: projectName,
      assignedTo: json['assigned_to']?.toString(),
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  PersonalTaskStatus get mappedStatus {
    switch (status.toLowerCase()) {
      case 'inprogress':
      case 'in_progress':
        return PersonalTaskStatus.inprogress;
      case 'done':
      case 'completed':
        return PersonalTaskStatus.done;
      case 'cancelled':
        return PersonalTaskStatus.cancelled;
      case 'on_hold':
        return PersonalTaskStatus.onHold;
      default:
        return PersonalTaskStatus.todo;
    }
  }

  PersonalTaskPriority get mappedPriority {
    switch (priority?.toLowerCase()) {
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

  bool get isActive =>
      mappedStatus != PersonalTaskStatus.done &&
      mappedStatus != PersonalTaskStatus.cancelled;

  bool get isOverdue {
    if (dueDate == null || !isActive) return false;
    final today = DateTime.now();
    final due = DateTime(dueDate!.year, dueDate!.month, dueDate!.day);
    final now = DateTime(today.year, today.month, today.day);
    return due.isBefore(now);
  }

  /// Display adapter for shared list/kanban widgets.
  PersonalTask toListAdapter() {
    return PersonalTask(
      id: id,
      userId: assignedTo ?? '',
      assignedTo: assignedTo,
      title: title,
      description: description,
      priority: mappedPriority,
      status: mappedStatus,
      dueDate: dueDate,
      category: 'project',
      createdAt: createdAt,
      updatedAt: createdAt,
      projectId: projectId,
    );
  }
}
