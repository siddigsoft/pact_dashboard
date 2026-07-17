class TaskDependency {
  final String id;
  final String parentTaskId;
  final String dependentTaskId;
  final String dependencyType;
  final int leadTimeDays;
  final String? description;
  final DateTime createdAt;

  const TaskDependency({
    required this.id,
    required this.parentTaskId,
    required this.dependentTaskId,
    this.dependencyType = 'blocks',
    this.leadTimeDays = 0,
    this.description,
    required this.createdAt,
  });

  factory TaskDependency.fromJson(Map<String, dynamic> json) {
    return TaskDependency(
      id: json['id']?.toString() ?? '',
      parentTaskId: json['parent_task_id']?.toString() ?? '',
      dependentTaskId: json['dependent_task_id']?.toString() ?? '',
      dependencyType: json['dependency_type']?.toString() ?? 'blocks',
      leadTimeDays: (json['lead_time_days'] as num?)?.toInt() ?? 0,
      description: json['description']?.toString(),
      createdAt: DateTime.tryParse(json['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  bool blocksTask(String taskId) =>
      dependentTaskId == taskId &&
      (dependencyType == 'blocks' || dependencyType == 'blocked_by');
}

class BlockingTaskInfo {
  final String id;
  final String title;
  final String status;
  final String? dependencyId;

  const BlockingTaskInfo({
    required this.id,
    required this.title,
    required this.status,
    this.dependencyId,
  });

  bool get isDone => status == 'done';
}
