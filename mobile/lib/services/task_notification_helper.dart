import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/personal_task.dart';

/// Channel policy aligned with tpm-workflow `taskNotificationPolicy.ts`.
abstract final class TaskNotificationHelper {
  static const _emailEvents = {'task_completed', 'task_cancelled'};

  static bool isEmailEvent(String event) => _emailEvents.contains(event);

  static List<String> participantIds(PersonalTask task) {
    final ids = <String>{};
    if (task.userId.isNotEmpty) ids.add(task.userId);
    if (task.assignedTo != null && task.assignedTo!.isNotEmpty) {
      ids.add(task.assignedTo!);
    }
    for (final c in task.coAssignees) {
      if (c.id.isNotEmpty) ids.add(c.id);
    }
    return ids.toList();
  }

  static Future<void> notifyParticipants({
    required SupabaseClient supabase,
    required PersonalTask task,
    required String event,
    required String actorId,
    String? messageEn,
    String? titleEn,
  }) async {
    final recipients = participantIds(task)
        .where((id) => id != actorId)
        .toList();
    if (recipients.isEmpty) return;

    final title = titleEn ?? _defaultTitle(event);
    final message = messageEn ??
        'Task "${task.title}" was updated ($event).';

    try {
      await supabase.functions.invoke(
        'dispatch-notification',
        body: {
          'event_type': event,
          'entity_type': 'task',
          'entity_id': task.id,
          'recipient_ids': recipients,
          'title_en': title,
          'title_ar': title,
          'message_en': message,
          'message_ar': message,
          'triggered_by': actorId,
          'action_url': '/my-tasks/${task.id}',
          'metadata': {
            'task_name': task.title,
            if (task.dueDate != null)
              'due_date': task.dueDate!.toIso8601String().split('T').first,
          },
          'send_email': isEmailEvent(event),
        },
      );
    } catch (e) {
      debugPrint('[TaskNotificationHelper] dispatch: $e');
    }
  }

  static Future<void> notifyUser({
    required SupabaseClient supabase,
    required String recipientId,
    required String taskId,
    required String taskTitle,
    required String event,
    required String actorId,
    String? messageEn,
    String? titleEn,
    DateTime? dueDate,
  }) async {
    if (recipientId == actorId) return;
    try {
      await supabase.functions.invoke(
        'dispatch-notification',
        body: {
          'event_type': event,
          'entity_type': 'task',
          'entity_id': taskId,
          'recipient_ids': [recipientId],
          'title_en': titleEn ?? _defaultTitle(event),
          'title_ar': titleEn ?? _defaultTitle(event),
          'message_en': messageEn ?? 'You have been assigned: "$taskTitle".',
          'message_ar': messageEn ?? 'You have been assigned: "$taskTitle".',
          'triggered_by': actorId,
          'send_email': isEmailEvent(event),
          if (dueDate != null)
            'metadata': {
              'task_name': taskTitle,
              'due_date': dueDate.toIso8601String().split('T').first,
            },
        },
      );
    } catch (e) {
      debugPrint('[TaskNotificationHelper] notifyUser: $e');
    }
  }

  static String _defaultTitle(String event) {
    switch (event) {
      case 'task_assigned':
        return 'New Task Assigned';
      case 'task_acknowledged':
        return 'Task Acknowledged';
      case 'task_started':
        return 'Task In Progress';
      case 'task_completed':
        return 'Task Completed';
      case 'task_cancelled':
        return 'Task Cancelled';
      case 'task_status_changed':
        return 'Task Status Updated';
      default:
        return 'Task Update';
    }
  }
}
