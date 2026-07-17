import 'personal_task.dart';
import 'profile_option.dart';

class CreateTaskInput {
  final String title;
  final String? description;
  final String? notes;
  final PersonalTaskPriority priority;
  final DateTime? dueDate;
  final String? assignedToId;
  final String? assignedToName;
  final List<ProfileOption> coAssignees;
  final double? estimatedHours;
  final String category;
  final List<String> tags;
  final String recurrence;
  final String? parentTaskId;

  const CreateTaskInput({
    required this.title,
    this.description,
    this.notes,
    this.priority = PersonalTaskPriority.medium,
    this.dueDate,
    this.assignedToId,
    this.assignedToName,
    this.coAssignees = const [],
    this.estimatedHours,
    this.category = 'personal',
    this.tags = const [],
    this.recurrence = 'none',
    this.parentTaskId,
  });
}
