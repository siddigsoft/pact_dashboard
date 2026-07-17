import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/approval_workflow_option.dart';
import '../models/task_approval.dart';

class TaskApprovalsService {
  TaskApprovalsService({SupabaseClient? client})
      : _supabase = client ?? Supabase.instance.client;

  final SupabaseClient _supabase;

  String? get _userId => _supabase.auth.currentUser?.id;

  Future<List<TaskApprovalSummary>> fetchForTask(String taskId) async {
    final userId = _userId;
    final rows = await _supabase
        .from('task_approvals')
        .select('*, approval_workflows(name), task_approval_records(*)')
        .eq('task_id', taskId)
        .order('created_at', ascending: false);
    return (rows as List)
        .map(
          (r) => TaskApprovalSummary.fromJson(
            Map<String, dynamic>.from(r),
            currentUserId: userId,
          ),
        )
        .toList();
  }

  Future<String?> approve(String taskApprovalId, {String notes = ''}) async {
    return _advance(taskApprovalId, 'approved', notes);
  }

  Future<String?> reject(String taskApprovalId, String reason) async {
    return _advance(taskApprovalId, 'rejected', reason);
  }

  Future<List<ApprovalWorkflowOption>> fetchWorkflows() async {
    final rows = await _supabase
        .from('approval_workflows')
        .select('id, name, description')
        .order('name');
    return (rows as List)
        .map(
          (r) => ApprovalWorkflowOption.fromJson(
            Map<String, dynamic>.from(r),
          ),
        )
        .toList();
  }

  Future<String?> submitTaskForApproval(
    String taskId,
    String workflowId,
  ) async {
    final userId = _userId;
    if (userId == null) return 'Not signed in';

    final stages = await _supabase
        .from('approval_workflow_stages')
        .select('id')
        .eq('workflow_id', workflowId)
        .order('stage_number', ascending: true)
        .limit(1);
    if ((stages as List).isEmpty) return 'Workflow has no stages';

    final firstStageId = Map<String, dynamic>.from(stages.first)['id'];

    try {
      final approval = await _supabase
          .from('task_approvals')
          .insert({
            'task_id': taskId,
            'workflow_id': workflowId,
            'current_stage_id': firstStageId,
            'current_stage_number': 1,
            'status': 'pending',
            'submitted_by': userId,
          })
          .select('id')
          .single();

      await _supabase.from('task_approval_records').insert({
        'task_approval_id': approval['id'],
        'workflow_stage_id': firstStageId,
        'stage_number': 1,
        'approver_id': userId,
        'status': 'pending',
      });

      await _supabase
          .from('personal_tasks')
          .update({'approval_stage': 'submitted'})
          .eq('id', taskId);

      return null;
    } on PostgrestException catch (e) {
      return e.message;
    }
  }

  Future<List<Map<String, dynamic>>> fetchApprovalHistory(
    String taskApprovalId,
  ) async {
    try {
      final rows = await _supabase
          .from('task_approval_records')
          .select('*, profiles:approver_id(full_name)')
          .eq('task_approval_id', taskApprovalId)
          .order('stage_number', ascending: true);
      return (rows as List).map((r) => Map<String, dynamic>.from(r)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<PendingTaskApprovalItem>> fetchPendingForMe() async {
    final userId = _userId;
    if (userId == null) return [];

    final rows = await _supabase
        .from('task_approval_records')
        .select(
          'id, task_approval_id, status, task_approvals(id, task_id, current_stage_number, submitted_at, approval_workflows(name))',
        )
        .eq('approver_id', userId)
        .eq('status', 'pending')
        .order('created_at', ascending: false)
        .limit(50);

    return (rows as List)
        .map(
          (r) => PendingTaskApprovalItem.fromJson(
            Map<String, dynamic>.from(r),
          ),
        )
        .where((p) => p.taskId.isNotEmpty)
        .toList();
  }

  Future<String?> _advance(
    String taskApprovalId,
    String status,
    String notes,
  ) async {
    final userId = _userId;
    if (userId == null) return 'Not signed in';
    try {
      await _supabase.rpc(
        'advance_approval_stage',
        params: {
          'p_task_approval_id': taskApprovalId,
          'p_approver_id': userId,
          'p_status': status,
          'p_decision_notes': notes,
        },
      );
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    }
  }
}
