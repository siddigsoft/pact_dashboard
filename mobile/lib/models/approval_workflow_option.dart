class ApprovalWorkflowOption {
  final String id;
  final String name;
  final String? description;

  const ApprovalWorkflowOption({
    required this.id,
    required this.name,
    this.description,
  });

  factory ApprovalWorkflowOption.fromJson(Map<String, dynamic> json) {
    return ApprovalWorkflowOption(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Workflow',
      description: json['description']?.toString(),
    );
  }
}

class PendingTaskApprovalItem {
  final String recordId;
  final String taskApprovalId;
  final String taskId;
  final String? workflowName;
  final int stageNumber;
  final DateTime? submittedAt;

  const PendingTaskApprovalItem({
    required this.recordId,
    required this.taskApprovalId,
    required this.taskId,
    this.workflowName,
    this.stageNumber = 1,
    this.submittedAt,
  });

  factory PendingTaskApprovalItem.fromJson(Map<String, dynamic> json) {
    final approval = json['task_approvals'];
    final wf = approval is Map ? approval['approval_workflows'] : null;
    return PendingTaskApprovalItem(
      recordId: json['id']?.toString() ?? '',
      taskApprovalId: json['task_approval_id']?.toString() ??
          (approval is Map ? approval['id']?.toString() : '') ??
          '',
      taskId: approval is Map ? approval['task_id']?.toString() ?? '' : '',
      workflowName: wf is Map ? wf['name']?.toString() : null,
      stageNumber: approval is Map
          ? (approval['current_stage_number'] as num?)?.toInt() ?? 1
          : 1,
      submittedAt: approval is Map
          ? DateTime.tryParse(approval['submitted_at']?.toString() ?? '')
          : null,
    );
  }
}
