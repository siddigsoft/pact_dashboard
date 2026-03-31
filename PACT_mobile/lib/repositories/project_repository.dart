import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/project_model.dart';

class ProjectRepository {
  final SupabaseClient _supabase;

  ProjectRepository(this._supabase);

  /// Fetches projects where the current user is a team member (by userId in
  /// team->'teamComposition') or admin (gets all).
  /// Uses server-side filtering via containedBy on JSONB array text match.
  Future<List<ProjectModel>> fetchProjects({
    required String userId,
    bool isAdmin = false,
    int page = 0,
    int pageSize = 20,
  }) async {
    final offset = page * pageSize;
    late final List<dynamic> data;

    if (isAdmin) {
      final result = await _supabase
          .from('projects')
          .select('id, name, project_code, description, project_type, status, start_date, end_date, current_flow_stage, team, created_at')
          .order('created_at', ascending: false)
          .range(offset, offset + pageSize - 1);
      data = result as List<dynamic>;
    } else {
      // Filter to projects where team->teamComposition contains the user's id
      final result = await _supabase
          .from('projects')
          .select('id, name, project_code, description, project_type, status, start_date, end_date, current_flow_stage, team, created_at')
          .filter('team->teamComposition', 'cs', '[{"userId":"$userId"}]')
          .order('created_at', ascending: false)
          .range(offset, offset + pageSize - 1);
      data = result as List<dynamic>;
    }

    return data
        .map((e) => ProjectModel.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  /// Fetches a single project by id with its full flow log.
  Future<ProjectModel?> fetchProjectDetail(String projectId) async {
    final projectData = await _supabase
        .from('projects')
        .select('id, name, project_code, description, project_type, status, start_date, end_date, current_flow_stage, team')
        .eq('id', projectId)
        .maybeSingle();

    if (projectData == null) return null;

    final logData = await _supabase
        .from('project_flow_log')
        .select('id, project_id, stage_id, stage_label, advanced_by, advanced_at, notes')
        .eq('project_id', projectId)
        .order('advanced_at', ascending: true);

    final log = (logData as List<dynamic>)
        .map((e) => ProjectFlowLog.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();

    return ProjectModel.fromMap(
      Map<String, dynamic>.from(projectData as Map),
      log: log,
    );
  }

  /// Advance a project to the next stage.
  Future<void> advanceStage({
    required String projectId,
    required String nextStageId,
    required String nextStageLabel,
    required String advancedById,
    String? notes,
  }) async {
    await _supabase.from('project_flow_log').insert({
      'project_id': projectId,
      'stage_id': nextStageId,
      'stage_label': nextStageLabel,
      'advanced_by': advancedById,
      'notes': notes,
    });

    await _supabase
        .from('projects')
        .update({'current_flow_stage': nextStageId})
        .eq('id', projectId);
  }
}
