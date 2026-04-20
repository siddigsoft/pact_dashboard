import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type TaskSLA = Database['public']['Tables']['task_slas']['Row'];
type TaskEscalation = Database['public']['Tables']['task_escalations']['Row'];
type SLABreach = Database['public']['Tables']['sla_breaches']['Row'];

interface EscalationRule {
  id: string;
  escalation_level: number;
  escalation_hours: number;
  escalate_to_role: string | null;
  notify_via: string[];
  escalation_message: string | null;
}

interface EscalationAlert {
  task_id: string;
  task_name?: string;
  priority: string;
  assigned_to?: string;
  hours_overdue: number;
  escalation_level: number;
  next_escalation_in_hours?: number;
}

interface EscalationStats {
  total_escalations: number;
  active_escalations: number;
  resolved_escalations: number;
  avg_response_time: number;
  most_escalated_users?: Array<{ user_id: string; count: number }>;
}

/**
 * Create a new SLA configuration
 */
export async function createSLA(
  name: string,
  responseTimeHours: number,
  resolutionTimeHours: number,
  taskType?: string,
  priority?: string,
  description?: string
): Promise<{ sla: TaskSLA | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { sla: null, error: 'Not authenticated' };

    const { data, error } = await supabase
      .from('task_slas')
      .insert({
        name,
        response_time_hours: responseTimeHours,
        resolution_time_hours: resolutionTimeHours,
        task_type: taskType,
        priority,
        description,
        created_by: userData.user.id,
      })
      .select()
      .single();

    if (error) return { sla: null, error: error.message };
    return { sla: data, error: null };
  } catch (err) {
    console.error('Error creating SLA:', err);
    return { sla: null, error: 'Failed to create SLA' };
  }
}

/**
 * Add an escalation rule to an SLA
 */
export async function addEscalationRule(
  slaId: string,
  escalationLevel: number,
  escalationHours: number,
  escalateToRole: string,
  notifyVia: string[] = ['email'],
  escalationMessage?: string
): Promise<{ rule: EscalationRule | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('escalation_rules')
      .insert({
        sla_id: slaId,
        escalation_level: escalationLevel,
        escalation_hours: escalationHours,
        escalate_to_role: escalateToRole,
        notify_via: notifyVia,
        escalation_message: escalationMessage,
      })
      .select()
      .single();

    if (error) return { rule: null, error: error.message };
    return { rule: data, error: null };
  } catch (err) {
    console.error('Error adding escalation rule:', err);
    return { rule: null, error: 'Failed to add escalation rule' };
  }
}

/**
 * Get all active SLAs
 */
export async function getAllActiveSLAs(): Promise<{ slas: TaskSLA[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('task_slas')
      .select('*')
      .eq('enabled', true)
      .order('name');

    if (error) return { slas: [], error: error.message };
    return { slas: data || [], error: null };
  } catch (err) {
    console.error('Error fetching SLAs:', err);
    return { slas: [], error: 'Failed to fetch SLAs' };
  }
}

/**
 * Get escalation rules for an SLA
 */
export async function getEscalationRules(
  slaId: string
): Promise<{ rules: EscalationRule[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('escalation_rules')
      .select('*')
      .eq('sla_id', slaId)
      .order('escalation_level', { ascending: true });

    if (error) return { rules: [], error: error.message };
    return { rules: (data || []) as any, error: null };
  } catch (err) {
    console.error('Error fetching escalation rules:', err);
    return { rules: [], error: 'Failed to fetch escalation rules' };
  }
}

/**
 * Check for SLA breaches and trigger escalations
 */
export async function checkAndEscalateSLABreaches(): Promise<{
  breachedTasks: number;
  escalatedTasks: number;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('check_sla_breaches');

    if (error) {
      return { breachedTasks: 0, escalatedTasks: 0, error: error.message };
    }

    return {
      breachedTasks: data?.breached_tasks || 0,
      escalatedTasks: data?.escalated_tasks || 0,
      error: null,
    };
  } catch (err) {
    console.error('Error checking SLA breaches:', err);
    return { breachedTasks: 0, escalatedTasks: 0, error: 'Failed to check SLA breaches' };
  }
}

/**
 * Get pending escalation alerts
 */
export async function getPendingEscalationAlerts(): Promise<{
  alerts: EscalationAlert[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('sla_breaches')
      .select(
        `
        task_id,
        hours_overdue,
        sla_id,
        personal_tasks(priority),
        task_escalations(escalation_level)
      `
      )
      .eq('status', 'active')
      .order('breached_at', { ascending: true })
      .limit(50);

    if (error) return { alerts: [], error: error.message };

    const alerts: EscalationAlert[] = (data || []).map((breach: any) => ({
      task_id: breach.task_id,
      priority: breach.personal_tasks?.priority || 'medium',
      hours_overdue: breach.hours_overdue || 0,
      escalation_level: breach.task_escalations?.[0]?.escalation_level || 0,
    }));

    return { alerts, error: null };
  } catch (err) {
    console.error('Error getting escalation alerts:', err);
    return { alerts: [], error: 'Failed to fetch escalation alerts' };
  }
}

/**
 * Get active escalations for a user
 */
export async function getActiveEscalationsForUser(
  userId: string,
  limit: number = 50
): Promise<{ escalations: TaskEscalation[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('task_escalations')
      .select('*')
      .eq('escalated_to_user_id', userId)
      .eq('status', 'active')
      .order('escalated_at', { ascending: false })
      .limit(limit);

    if (error) return { escalations: [], error: error.message };
    return { escalations: data || [], error: null };
  } catch (err) {
    console.error('Error getting active escalations:', err);
    return { escalations: [], error: 'Failed to fetch active escalations' };
  }
}

/**
 * Resolve an escalation (mark as resolved)
 */
export async function resolveEscalation(
  escalationId: string,
  notes?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, message: 'Not authenticated' };

    const { error: updateError } = await supabase
      .from('task_escalations')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', escalationId);

    if (updateError) return { success: false, message: updateError.message };

    // Log the resolution
    await supabase.from('escalation_history').insert({
      task_escalation_id: escalationId,
      action: 'resolved',
      action_by_id: userData.user.id,
      notes,
    });

    return { success: true, message: 'Escalation resolved' };
  } catch (err) {
    console.error('Error resolving escalation:', err);
    return { success: false, message: 'Failed to resolve escalation' };
  }
}

/**
 * Acknowledge an escalation (mark as seen)
 */
export async function acknowledgeEscalation(escalationId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, message: 'Not authenticated' };

    // Log acknowledgement
    const { error } = await supabase.from('escalation_history').insert({
      task_escalation_id: escalationId,
      action: 'acknowledged',
      action_by_id: userData.user.id,
      notes: 'Escalation acknowledged',
    });

    if (error) return { success: false, message: error.message };

    return { success: true, message: 'Escalation acknowledged' };
  } catch (err) {
    console.error('Error acknowledging escalation:', err);
    return { success: false, message: 'Failed to acknowledge escalation' };
  }
}

/**
 * Get escalation statistics
 */
export async function getEscalationStats(): Promise<{
  stats: EscalationStats | null;
  error: string | null;
}> {
  try {
    const { data: allEscalations, error: escalError } = await supabase
      .from('task_escalations')
      .select('status, escalated_to_user_id, escalated_at');

    if (escalError) return { stats: null, error: escalError.message };

    const total = allEscalations?.length || 0;
    const active = allEscalations?.filter((e) => e.status === 'active').length || 0;
    const resolved = allEscalations?.filter((e) => e.status === 'resolved').length || 0;

    // Calculate average response time
    const respondedEscalations = allEscalations
      ?.filter((e) => e.status === 'resolved')
      .map((e) => ({
        escalated_at: new Date(e.escalated_at).getTime(),
      })) || [];

    const avgResponseTime =
      respondedEscalations.length > 0
        ? respondedEscalations.reduce((sum, e) => sum + (new Date().getTime() - e.escalated_at), 0) /
          respondedEscalations.length /
          (1000 * 60 * 60)
        : 0;

    return {
      stats: {
        total_escalations: total,
        active_escalations: active,
        resolved_escalations: resolved,
        avg_response_time: Math.round(avgResponseTime),
      },
      error: null,
    };
  } catch (err) {
    console.error('Error getting escalation stats:', err);
    return { stats: null, error: 'Failed to fetch escalation statistics' };
  }
}

/**
 * Get SLA compliance report for a period
 */
export async function getSLAComplianceReport(
  startDate: Date,
  endDate: Date
): Promise<{
  compliant: number;
  breached: number;
  complianceRate: number;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('sla_breaches')
      .select('status', { count: 'exact' })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) return { compliant: 0, breached: 0, complianceRate: 0, error: error.message };

    const total = data?.length || 0;
    const breached = data?.filter((b: any) => b.status === 'active').length || 0;
    const compliant = total - breached;

    return {
      compliant,
      breached,
      complianceRate: total > 0 ? (compliant / total) * 100 : 0,
      error: null,
    };
  } catch (err) {
    console.error('Error getting SLA compliance report:', err);
    return { compliant: 0, breached: 0, complianceRate: 0, error: 'Failed to fetch compliance report' };
  }
}
