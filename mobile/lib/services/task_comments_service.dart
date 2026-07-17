import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/task_comment.dart';

class TaskCommentsService {
  TaskCommentsService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  String? get _userId => _supabase.auth.currentUser?.id;

  Future<List<TaskComment>> fetchComments(String taskId) async {
    final rows = await _supabase
        .from('task_comment_threads')
        .select('*, profiles:user_id(full_name)')
        .eq('task_id', taskId)
        .isFilter('deleted_at', null)
        .order('created_at', ascending: true);
    return (rows as List)
        .map((r) => TaskComment.fromJson(Map<String, dynamic>.from(r)))
        .toList();
  }

  Future<TaskComment?> addComment(String taskId, String content) async {
    final userId = _userId;
    if (userId == null) return null;
    final row = await _supabase
        .from('task_comment_threads')
        .insert({
          'task_id': taskId,
          'user_id': userId,
          'content': content.trim(),
          'mentions': [],
        })
        .select('*, profiles:user_id(full_name)')
        .single();
    return TaskComment.fromJson(Map<String, dynamic>.from(row));
  }
}
