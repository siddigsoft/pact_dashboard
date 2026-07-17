class TaskApprovalSummary {
  final String id;
  final String taskId;
  final String status;
  final int currentStageNumber;
  final String? workflowName;
  final DateTime? submittedAt;
  final bool userCanAct;
  final String? userRecordId;

  const TaskApprovalSummary({
    required this.id,
    required this.taskId,
    required this.status,
    this.currentStageNumber = 1,
    this.workflowName,
    this.submittedAt,
    this.userCanAct = false,
    this.userRecordId,
  });

  factory TaskApprovalSummary.fromJson(
    Map<String, dynamic> json, {
    String? currentUserId,
  }) {
    final records = json['task_approval_records'];
    String? recordId;
    var canAct = false;
    if (records is List && currentUserId != null) {
      for (final r in records) {
        if (r is Map &&
            r['approver_id']?.toString() == currentUserId &&
            r['status']?.toString() == 'pending') {
          canAct = true;
          recordId = r['id']?.toString();
          break;
        }
      }
    }
    final wf = json['approval_workflows'];
    return TaskApprovalSummary(
      id: json['id']?.toString() ?? '',
      taskId: json['task_id']?.toString() ?? '',
      status: json['status']?.toString() ?? 'pending',
      currentStageNumber: (json['current_stage_number'] as num?)?.toInt() ?? 1,
      workflowName: wf is Map ? wf['name']?.toString() : null,
      submittedAt: DateTime.tryParse(json['submitted_at']?.toString() ?? ''),
      userCanAct: canAct,
      userRecordId: recordId,
    );
  }
}
