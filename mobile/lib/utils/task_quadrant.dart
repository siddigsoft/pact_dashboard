import '../models/personal_task.dart';

enum TaskQuadrant { doFirst, schedule, delegate, drop }

abstract final class TaskQuadrantHelper {
  static TaskQuadrant classify(PersonalTask task) {
    final manual = task.planningQuadrant;
    if (manual != null) {
      switch (manual) {
        case 'do':
          return TaskQuadrant.doFirst;
        case 'schedule':
          return TaskQuadrant.schedule;
        case 'delegate':
          return TaskQuadrant.delegate;
        case 'drop':
          return TaskQuadrant.drop;
      }
    }

    final isHigh = task.priority == PersonalTaskPriority.high ||
        task.priority == PersonalTaskPriority.critical;
    final overdue = task.isOverdue;
    final dueToday = task.isDueToday;

    if (isHigh && (overdue || dueToday)) return TaskQuadrant.doFirst;
    if (isHigh) return TaskQuadrant.schedule;
    if (overdue || dueToday) return TaskQuadrant.delegate;
    return TaskQuadrant.drop;
  }

  static String label(TaskQuadrant q) {
    switch (q) {
      case TaskQuadrant.doFirst:
        return 'Do first';
      case TaskQuadrant.schedule:
        return 'Schedule';
      case TaskQuadrant.delegate:
        return 'Delegate';
      case TaskQuadrant.drop:
        return 'Later';
    }
  }

  static String dbKey(TaskQuadrant q) {
    switch (q) {
      case TaskQuadrant.doFirst:
        return 'do';
      case TaskQuadrant.schedule:
        return 'schedule';
      case TaskQuadrant.delegate:
        return 'delegate';
      case TaskQuadrant.drop:
        return 'drop';
    }
  }
}
