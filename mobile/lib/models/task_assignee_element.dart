class TaskAssigneeElement {
  final String id;
  final String taskId;
  final String label;
  final bool done;
  final double? targetValue;
  final double? currentValue;
  final String? unit;

  const TaskAssigneeElement({
    required this.id,
    required this.taskId,
    required this.label,
    this.done = false,
    this.targetValue,
    this.currentValue,
    this.unit,
  });

  factory TaskAssigneeElement.fromJson(Map<String, dynamic> json) {
    return TaskAssigneeElement(
      id: json['id']?.toString() ?? '',
      taskId: json['task_id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Item',
      done: json['done'] as bool? ?? false,
      targetValue: (json['target_value'] as num?)?.toDouble(),
      currentValue: (json['current_value'] as num?)?.toDouble(),
      unit: json['unit']?.toString(),
    );
  }

  bool get isQuantitative => targetValue != null && targetValue! > 0;

  double get progress =>
      isQuantitative ? ((currentValue ?? 0) / targetValue!).clamp(0, 1) : (done ? 1 : 0);
}
