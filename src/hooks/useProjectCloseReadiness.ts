import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectChecklistItem {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  count: number;
  total: number;
  link?: string;
  notConfigured?: boolean;
}

export interface ProjectCloseReadiness {
  items: ProjectChecklistItem[];
  score: number;
  allPassed: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjectCloseReadiness(projectId: string | null): ProjectCloseReadiness {
  const [items, setItems] = useState<ProjectChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [activitiesRes, costSubsRes] = await Promise.all([
        supabase
          .from('project_activities')
          .select('id, status, sub_activities(id, status)')
          .eq('project_id', projectId),
        supabase
          .from('operational_cost_submissions')
          .select('id, tier1_status, tier2_status')
          .eq('project_id', projectId),
      ]);

      if (activitiesRes.error) throw new Error(activitiesRes.error.message);
      if (costSubsRes.error) throw new Error(costSubsRes.error.message);

      const activities = (activitiesRes.data || []) as Array<{
        id: string;
        status: string | null;
        sub_activities: Array<{ id: string; status: string | null }>;
      }>;
      const totalActivities = activities.length;
      const terminalActivities = activities.filter(
        a => a.status === 'completed' || a.status === 'cancelled',
      ).length;
      const incompleteActivities = totalActivities - terminalActivities;

      // Sub-activities as deliverables — joined through project_activities
      const allSubActivities = activities.flatMap(a => a.sub_activities || []);
      const totalSubActivities = allSubActivities.length;
      const completedSubActivities = allSubActivities.filter(
        s => s.status === 'completed' || s.status === 'cancelled',
      ).length;
      const incompleteSubActivities = totalSubActivities - completedSubActivities;
      const deliverablesNotConfigured = totalSubActivities === 0;

      const costSubs = costSubsRes.data || [];
      const totalCostSubs = costSubs.length;
      const pendingCostSubs = costSubs.filter(c => {
        return c.tier1_status === 'pending' || c.tier2_status === 'pending';
      }).length;

      // Budget reconciliation: no pending tier 2 approvals
      const pendingTier2 = costSubs.filter(c => c.tier2_status === 'pending').length;
      const budgetReconciled = pendingTier2 === 0;
      const budgetNotConfigured = totalCostSubs === 0;

      const newItems: ProjectChecklistItem[] = [
        {
          id: 'activities',
          label: 'All activities completed or cancelled',
          description: 'Every project activity must reach a terminal state (completed or cancelled).',
          passed: incompleteActivities === 0,
          count: terminalActivities,
          total: totalActivities,
          link: `/projects/${projectId}?tab=overview`,
        },
        {
          id: 'deliverables',
          label: 'All sub-activities (deliverables) completed',
          description: 'All sub-tasks must be completed or cancelled before closing.',
          // Zero deliverables: passed=true (matches RPC which only blocks on incomplete count > 0)
          // notConfigured surfaces as amber informational warning; does not block close
          passed: deliverablesNotConfigured || incompleteSubActivities === 0,
          count: completedSubActivities,
          total: totalSubActivities,
          link: `/projects/${projectId}?tab=overview`,
          notConfigured: deliverablesNotConfigured,
        },
        {
          id: 'finance_approvals',
          label: 'No pending finance approvals',
          description: 'All cost submissions linked to this project must be fully approved (tier 1 & tier 2).',
          passed: pendingCostSubs === 0,
          count: totalCostSubs - pendingCostSubs,
          total: totalCostSubs,
          link: `/projects/${projectId}?tab=costs`,
        },
        {
          id: 'budget_reconciled',
          label: 'Budget fully reconciled (all tier 2 approvals)',
          description: 'All cost submissions must have tier 2 approval to confirm budget reconciliation.',
          // Zero cost subs: passed=true (matches RPC which only blocks on pending tier2 count > 0)
          // notConfigured surfaces as amber informational warning; does not block close
          passed: budgetReconciled,
          count: totalCostSubs - pendingTier2,
          total: totalCostSubs,
          link: `/projects/${projectId}?tab=costs`,
          notConfigured: budgetNotConfigured,
        },
      ];

      setItems(newItems);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to check project close readiness');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    check();
  }, [check]);

  const passedCount = items.filter(i => i.passed).length;
  const score = items.length > 0 ? Math.round((passedCount / items.length) * 100) : 100;
  const allPassed = items.length > 0 && items.every(i => i.passed);

  return { items, score, allPassed, loading, error, refresh: check };
}
