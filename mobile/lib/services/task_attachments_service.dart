import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/task_output_file.dart';

class TaskAttachmentsService {
  TaskAttachmentsService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  static const _bucket = 'workspace-files';

  Future<List<TaskOutputFile>> fetchOutputFiles(String taskId) async {
    final row = await _supabase
        .from('personal_tasks')
        .select('output_files')
        .eq('id', taskId)
        .maybeSingle();
    if (row == null) return [];
    final files = row['output_files'];
    if (files is! List) return [];
    return files
        .whereType<Map>()
        .map((e) => TaskOutputFile.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<TaskOutputFile?> uploadOutputFile({
    required String taskId,
    required String filePath,
    required String fileName,
  }) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return null;

    final bytes = await File(filePath).readAsBytes();
    final path = 'tasks/$taskId/${DateTime.now().millisecondsSinceEpoch}_$fileName';

    await _supabase.storage.from(_bucket).uploadBinary(
      path,
      bytes,
      fileOptions: const FileOptions(upsert: true),
    );

    final url = _supabase.storage.from(_bucket).getPublicUrl(path);
    final file = TaskOutputFile(name: fileName, url: url);

    final existing = await fetchOutputFiles(taskId);
    final next = [...existing, file].map((f) => f.toJson()).toList();

    await _supabase.from('personal_tasks').update({
      'output_files': next,
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    }).eq('id', taskId);

    return file;
  }

  Future<void> removeOutputFile(String taskId, String fileUrl) async {
    final existing = await fetchOutputFiles(taskId);
    final next = existing.where((f) => f.url != fileUrl).map((f) => f.toJson()).toList();
    await _supabase.from('personal_tasks').update({
      'output_files': next,
    }).eq('id', taskId);

    try {
      final uri = Uri.parse(fileUrl);
      final idx = uri.pathSegments.indexOf(_bucket);
      if (idx >= 0 && idx < uri.pathSegments.length - 1) {
        final storagePath = uri.pathSegments.sublist(idx + 1).join('/');
        await _supabase.storage.from(_bucket).remove([storagePath]);
      }
    } catch (e) {
      debugPrint('[TaskAttachments] storage remove: $e');
    }
  }
}
