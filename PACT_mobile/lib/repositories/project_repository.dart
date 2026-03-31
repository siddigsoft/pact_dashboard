import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/project_model.dart';

class ProjectRepository {
  final SupabaseClient _supabase;

  ProjectRepository(this._supabase);

  /// Fetches projects visible to the current user.
  /// Admins / FOM / super_admin see all projects.
  /// Non-admins see projects where they appear in any of:
  ///   • team->teamComposition (array of {userId, name, …})
  ///   • team->members (array of name strings, matched by fullName)
  ///   • team->projectManager (string name, matched by fullName)
  Future<List<ProjectModel>> fetchProjects({
    required String userId,
    required String fullName,
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
      // Fetch all and filter client-side — necessary because Postgres JSONB
      // operator for string-array membership ('cs' with a plain string)
      // and a mixed team schema (teamComposition array + members array +
      // projectManager string) cannot be expressed in a single Supabase
      // PostgREST filter chain without a custom RPC. Pagination is applied
      // after filtering.
      final result = await _supabase
          .from('projects')
          .select('id, name, project_code, description, project_type, status, start_date, end_date, current_flow_stage, team, created_at')
          .order('created_at', ascending: false);

      final all = result as List<dynamic>;
      final filtered = all.where((row) {
        final teamRaw = row['team'];
        if (teamRaw == null) return false;
        final team = teamRaw as Map<String, dynamic>;

        // 1. projectManager string (name comparison, matching web logic)
        final pm = team['projectManager'] as String?;
        if (pm != null && pm == fullName) return true;

        // 2. members array of name strings
        final members = team['members'];
        if (members is List && members.contains(fullName)) return true;

        // 3. teamComposition array of {userId, name, …} objects
        final tc = team['teamComposition'];
        if (tc is List) {
          for (final m in tc) {
            if (m is Map) {
              if (m['userId'] == userId) return true;
              if (m['name'] == fullName) return true;
            }
          }
        }
        return false;
      }).toList();

      // Paginate after filter
      final start = offset;
      final end = offset + pageSize;
      data = start >= filtered.length
          ? []
          : filtered.sublist(start, end > filtered.length ? filtered.length : end);
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

  /// Advance a project to the next stage, matching web semantics exactly:
  ///   1. Insert a flow_log row for the **completed current stage** (not the next).
  ///   2. Update projects.current_flow_stage → nextStageId.
  Future<void> advanceStage({
    required String projectId,
    required String completedStageId,
    required String completedStageLabel,
    required String nextStageId,
    required String advancedById,
    String? notes,
  }) async {
    // Log the stage that was just COMPLETED (mirrors web useProjectFlow.ts ln 183-189)
    await _supabase.from('project_flow_log').insert({
      'project_id': projectId,
      'stage_id': completedStageId,
      'stage_label': completedStageLabel,
      'advanced_by': advancedById,
      'notes': notes,
    });

    // Move project to the next stage
    await _supabase
        .from('projects')
        .update({'current_flow_stage': nextStageId})
        .eq('id', projectId);
  }
}
