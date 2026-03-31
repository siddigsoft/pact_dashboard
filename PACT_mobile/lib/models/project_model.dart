/// Dart model for a PACT project with project-flow data.

class ProjectFlowStage {
  final String id;
  final String label;
  final String description;
  final List<String> keyOutputs;

  const ProjectFlowStage({
    required this.id,
    required this.label,
    required this.description,
    required this.keyOutputs,
  });
}

class ProjectFlowLog {
  final String id;
  final String projectId;
  final String stageId;
  final String stageLabel;
  final String? advancedBy;
  final DateTime advancedAt;
  final String? notes;

  const ProjectFlowLog({
    required this.id,
    required this.projectId,
    required this.stageId,
    required this.stageLabel,
    this.advancedBy,
    required this.advancedAt,
    this.notes,
  });

  factory ProjectFlowLog.fromMap(Map<String, dynamic> m) => ProjectFlowLog(
        id: m['id'] as String,
        projectId: m['project_id'] as String,
        stageId: m['stage_id'] as String,
        stageLabel: m['stage_label'] as String,
        advancedBy: m['advanced_by'] as String?,
        advancedAt: DateTime.parse(m['advanced_at'] as String),
        notes: m['notes'] as String?,
      );
}

class ProjectModel {
  final String id;
  final String name;
  final String? projectCode;
  final String? description;
  final String? projectType;
  final String status;
  final String? startDate;
  final String? endDate;
  final String? currentFlowStage;
  final Map<String, dynamic>? team;
  final List<ProjectFlowLog> flowLog;

  const ProjectModel({
    required this.id,
    required this.name,
    this.projectCode,
    this.description,
    this.projectType,
    required this.status,
    this.startDate,
    this.endDate,
    this.currentFlowStage,
    this.team,
    this.flowLog = const [],
  });

  String get projectManager {
    final t = team;
    if (t == null) return 'Unassigned';
    return (t['projectManager'] as String?) ?? 'Unassigned';
  }

  factory ProjectModel.fromMap(Map<String, dynamic> m, {List<ProjectFlowLog>? log}) =>
      ProjectModel(
        id: m['id'] as String,
        name: (m['name'] as String?) ?? 'Unnamed Project',
        projectCode: m['project_code'] as String?,
        description: m['description'] as String?,
        projectType: m['project_type'] as String?,
        status: (m['status'] as String?) ?? 'draft',
        startDate: m['start_date'] as String?,
        endDate: m['end_date'] as String?,
        currentFlowStage: m['current_flow_stage'] as String?,
        team: m['team'] as Map<String, dynamic>?,
        flowLog: log ?? const [],
      );
}
