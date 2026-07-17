import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/task_assignee_element.dart';

class TaskAssigneeElementsService {
  TaskAssigneeElementsService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  Future<List<TaskAssigneeElement>> fetchForTask(String taskId) async {
    final rows = await _supabase
        .from('task_assignee_elements')
        .select()
        .eq('task_id', taskId)
        .order('position', ascending: true);
    return (rows as List)
        .map((r) => TaskAssigneeElement.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<void> toggleDone(String elementId, bool done) async {
    await _supabase.from('task_assignee_elements').update({
      'done': done,
      'done_at': done ? DateTime.now().toUtc().toIso8601String() : null,
    }).eq('id', elementId);
  }

  Future<String?> updateProgress(
    String elementId,
    double value, {
    String? note,
  }) async {
    try {
      await _supabase.rpc(
        'update_task_element_progress',
        params: {
          'p_element_id': elementId,
          'p_value': value,
          'p_note': note,
        },
      );
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    }
  }
}
