import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/project_field_task.dart';

class ProjectFieldTaskService {
  ProjectFieldTaskService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  Future<List<ProjectFieldTask>> fetchAssignedToMe() async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return [];

    final rows = await _supabase
        .from('project_field_tasks')
        .select()
        .eq('assigned_to', userId)
        .neq('status', 'cancelled')
        .order('due_date', ascending: true);

    final list = rows as List;
    final projectIds = list
        .map((r) => Map<String, dynamic>.from(r)['project_id']?.toString())
        .whereType<String>()
        .toSet()
        .toList();

    final names = <String, String>{};
    if (projectIds.isNotEmpty) {
      final projects = await _supabase
          .from('projects')
          .select('id, name')
          .inFilter('id', projectIds);
      for (final p in projects as List) {
        final m = Map<String, dynamic>.from(p);
        names[m['id']?.toString() ?? ''] = m['name']?.toString() ?? 'Project';
      }
    }

    return list
        .map((r) {
          final m = Map<String, dynamic>.from(r);
          final pid = m['project_id']?.toString() ?? '';
          return ProjectFieldTask.fromJson(
            m,
            projectName: names[pid] ?? 'Project',
          );
        })
        .toList();
  }

  Future<void> updateStatus(String taskId, String status) async {
    await _supabase.from('project_field_tasks').update({
      'status': status,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('id', taskId);
  }
}
