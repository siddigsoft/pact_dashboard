import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type ApprovalWorkflow = Database['public']['Tables']['approval_workflows']['Row'];
type TaskApproval = Database['public']['Tables']['task_approvals']['Row'];
type TaskApprovalRecord = Database['public']['Tables']['task_approval_records']['Row'];
type ApprovalComment = Database['public']['Tables']['approval_comments']['Row'];

interface ApprovalStage {
  id: string;
  workflow_id: string;
  stage_number: number;
  stage_name: string;
  approver_role: string | null;
  approver_department_id: string | null;
  required_for_approval: boolean;
  auto_escalate_hours: number;
  notify_on_arrival: boolean;
}

interface ApprovalWithDetails extends TaskApproval {
  workflow?: ApprovalWorkflow;
  current_stage?: ApprovalStage | null;
  records?: TaskApprovalRecord[];
  submitted_by_name?: string;
  approver_name?: string;
}

interface ApprovalStats {
  total_submitted: number;
  approved: number;
  rejected: number;
  pending: number;
  escalated: number;
  avg_days_to_approval: number;
}

/**
 * Create an approval workflow configuration
 */
export async function createApprovalWorkflow(
  name: string,
  description: string,
  taskType: string | null = null,
  minBudget: number | null = null,
  maxBudget: number | null = null
): Promise<{ workflow: ApprovalWorkflow; error: null } | { workflow: null; error: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { workflow: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('approval_workflows')
      .insert({
        name,
        description,
        task_type: taskType,
        min_budget: minBudget,
        max_budget: maxBudget,
        created_by: userData.user.id,
      })
      .select()
      .single();

    if (error) return { workflow: null, error: error.message };
    return { workflow: data, error: null };
  } catch (err) {
    console.error('Error creating approval workflow:', err);
    return { workflow: null, error: 'Failed to create workflow' };
  }
}

/**
 * Add a stage to an approval workflow
 */
export async function addApprovalStage(
  workflowId: string,
  stageNumber: number,
  stageName: string,
  approverRole: string | null = null,
  approverDepartmentId: string | null = null,
  autoEscalateHours: number = 48
): Promise<{ stage: ApprovalStage | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('approval_workflow_stages')
      .insert({
        workflow_id: workflowId,
        stage_number: stageNumber,
        stage_name: stageName,
        approver_role: approverRole,
        approver_department_id: approverDepartmentId,
        auto_escalate_hours: autoEscalateHours,
      })
      .select()
      .single();

    if (error) return { stage: null, error: error.message };
    return { stage: data, error: null };
  } catch (err) {
    console.error('Error adding approval stage:', err);
    return { stage: null, error: 'Failed to add stage' };
  }
}

/**
 * Submit a task for approval using a specific workflow
 */
export async function submitTaskForApproval(
  taskId: string,
  workflowId: string
): Promise<{ approval: TaskApproval | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { approval: null, error: 'Not authenticated' };

    // Get first stage of workflow
    const { data: firstStage, error: stageError } = await supabase
      .from('approval_workflow_stages')
      .select('id')
      .eq('workflow_id', workflowId)
      .order('stage_number', { ascending: true })
      .limit(1)
      .single();

    if (stageError || !firstStage) {
      return { approval: null, error: 'Workflow has no stages' };
    }

    // Create task approval
    const { data: approval, error: approvalError } = await supabase
      .from('task_approvals')
      .insert({
        task_id: taskId,
        workflow_id: workflowId,
        current_stage_id: firstStage.id,
        current_stage_number: 1,
        status: 'pending',
        submitted_by: userData.user.id,
      })
      .select()
      .single();

    if (approvalError) return { approval: null, error: approvalError.message };

    // Create first approval record
    const { error: recordError } = await supabase
      .from('task_approval_records')
      .insert({
        task_approval_id: approval.id,
        workflow_stage_id: firstStage.id,
        stage_number: 1,
        approver_id: userData.user.id, // Placeholder - will be assigned to actual approver
      });

    if (recordError) {
      console.error('Error creating approval record:', recordError);
    }

    // Update task status
    await supabase
      .from('personal_tasks')
      .update({ approval_stage: 'submitted' })
      .eq('id', taskId);

    return { approval, error: null };
  } catch (err) {
    console.error('Error submitting task for approval:', err);
    return { approval: null, error: 'Failed to submit for approval' };
  }
}

/**
 * Get pending approvals for current user
 */
export async function getPendingApprovalsForUser(
  limit: number = 50,
  offset: number = 0
): Promise<{ approvals: ApprovalWithDetails[]; total: number; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { approvals: [], total: 0, error: 'Not authenticated' };

    // Get pending approvals where current user is approver
    const { data, error, count } = await supabase
      .from('task_approval_records')
      .select(
        `
        task_approval_id,
        id,
        status,
        task_approvals!inner(
          id,
          task_id,
          workflow_id,
          current_stage_id,
          current_stage_number,
          status,
          submitted_by,
          submitted_at,
          approval_workflows(name, description)
        )
      `,
        { count: 'exact' }
      )
      .eq('approver_id', userData.user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { approvals: [], total: 0, error: error.message };

    return {
      approvals: (data || []) as any,
      total: count || 0,
      error: null,
    };
  } catch (err) {
    console.error('Error getting pending approvals:', err);
    return { approvals: [], total: 0, error: 'Failed to fetch pending approvals' };
  }
}

/**
 * Approve a task at current approval stage
 */
export async function approveTask(
  taskApprovalId: string,
  decisionNotes: string = ''
): Promise<{ success: boolean; message: string; nextStageId: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, message: 'Not authenticated', nextStageId: null };

    const { data, error } = await supabase.rpc('advance_approval_stage', {
      p_task_approval_id: taskApprovalId,
      p_approver_id: userData.user.id,
      p_status: 'approved',
      p_decision_notes: decisionNotes,
    });

    if (error) return { success: false, message: error.message, nextStageId: null };

    return { success: true, message: 'Task approved', nextStageId: data?.next_stage_id };
  } catch (err) {
    console.error('Error approving task:', err);
    return { success: false, message: 'Failed to approve task', nextStageId: null };
  }
}

/**
 * Reject a task at current approval stage
 */
export async function rejectTask(
  taskApprovalId: string,
  rejectionReason: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, message: 'Not authenticated' };

    const { data, error } = await supabase.rpc('advance_approval_stage', {
      p_task_approval_id: taskApprovalId,
      p_approver_id: userData.user.id,
      p_status: 'rejected',
      p_decision_notes: rejectionReason,
    });

    if (error) return { success: false, message: error.message };

    return { success: true, message: 'Task rejected' };
  } catch (err) {
    console.error('Error rejecting task:', err);
    return { success: false, message: 'Failed to reject task' };
  }
}

/**
 * Escalate a task approval to next approver
 */
export async function escalateApprovalTask(
  taskApprovalRecordId: string,
  escalationReason: string = ''
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('task_approval_records')
      .update({
        status: 'escalated',
        escalated_at: new Date().toISOString(),
      })
      .eq('id', taskApprovalRecordId);

    if (error) return { success: false, message: error.message };

    // Add escalation comment
    await supabase.from('approval_comments').insert({
      task_approval_record_id: taskApprovalRecordId,
      commenter_id: (await supabase.auth.getUser()).data.user?.id,
      comment_text: escalationReason || 'Task escalated',
      comment_type: 'concern',
    });

    return { success: true, message: 'Task escalated successfully' };
  } catch (err) {
    console.error('Error escalating task:', err);
    return { success: false, message: 'Failed to escalate task' };
  }
}

/**
 * Add a comment to an approval stage
 */
export async function addApprovalComment(
  taskApprovalRecordId: string,
  commentText: string,
  commentType: string = 'general'
): Promise<{ comment: ApprovalComment | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { comment: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('approval_comments')
      .insert({
        task_approval_record_id: taskApprovalRecordId,
        commenter_id: userData.user.id,
        comment_text: commentText,
        comment_type: commentType,
      })
      .select()
      .single();

    if (error) return { comment: null, error: error.message };
    return { comment: data, error: null };
  } catch (err) {
    console.error('Error adding approval comment:', err);
    return { comment: null, error: 'Failed to add comment' };
  }
}

/**
 * Get full approval history for a task
 */
export async function getTaskApprovalHistory(
  taskId: string
): Promise<{ approval: ApprovalWithDetails | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('task_approvals')
      .select(
        `
        *,
        approval_workflows(name, description),
        task_approval_records(
          *,
          approval_comments(*)
        )
      `
      )
      .eq('task_id', taskId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (error) return { approval: null, error: error.message };
    return { approval: data as any, error: null };
  } catch (err) {
    console.error('Error getting approval history:', err);
    return { approval: null, error: 'Failed to fetch approval history' };
  }
}

/**
 * Get approval statistics for a user or department
 */
export async function getApprovalStats(
  userId?: string,
  departmentId?: string
): Promise<{ stats: ApprovalStats | null; error: string | null }> {
  try {
    let query = supabase
      .from('task_approvals')
      .select('status, submitted_at, completed_at', { count: 'exact' });

    if (userId) {
      query = query.eq('submitted_by', userId);
    }

    const { data, error } = await query;

    if (error) return { stats: null, error: error.message };

    const approved = data?.filter((d) => d.status === 'approved').length || 0;
    const rejected = data?.filter((d) => d.status === 'rejected').length || 0;
    const pending = data?.filter((d) => d.status === 'pending').length || 0;
    const escalated = data?.filter((d) => d.status === 'escalated').length || 0;

    const completedApprovals = data
      ?.filter((d) => d.completed_at)
      .map((d) => {
        const submitted = new Date(d.submitted_at).getTime();
        const completed = new Date(d.completed_at!).getTime();
        return (completed - submitted) / (1000 * 60 * 60 * 24); // Days
      }) || [];

    const avgDays =
      completedApprovals.length > 0
        ? completedApprovals.reduce((a, b) => a + b, 0) / completedApprovals.length
        : 0;

    return {
      stats: {
        total_submitted: data?.length || 0,
        approved,
        rejected,
        pending,
        escalated,
        avg_days_to_approval: Math.round(avgDays * 10) / 10,
      },
      error: null,
    };
  } catch (err) {
    console.error('Error getting approval stats:', err);
    return { stats: null, error: 'Failed to fetch approval statistics' };
  }
}

/**
 * Get all approval workflows
 */
export async function getAllApprovalWorkflows(
  enabled: boolean = true
): Promise<{ workflows: ApprovalWorkflow[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('approval_workflows')
      .select('*')
      .eq('enabled', enabled)
      .order('name');

    if (error) return { workflows: [], error: error.message };
    return { workflows: data || [], error: null };
  } catch (err) {
    console.error('Error getting workflows:', err);
    return { workflows: [], error: 'Failed to fetch workflows' };
  }
}

/**
 * Get workflow stages by workflow ID
 */
export async function getWorkflowStages(
  workflowId: string
): Promise<{ stages: ApprovalStage[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('approval_workflow_stages')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('stage_number', { ascending: true });

    if (error) return { stages: [], error: error.message };
    return { stages: (data as any) || [], error: null };
  } catch (err) {
    console.error('Error getting workflow stages:', err);
    return { stages: [], error: 'Failed to fetch stages' };
  }
}
