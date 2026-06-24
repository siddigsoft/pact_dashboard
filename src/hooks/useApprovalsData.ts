import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ApprovalItemType = 'withdrawal' | 'cost' | 'down_payment' | 'user' | 'mmp' | 'pre_fund';

// ── DB row types (only the columns we select) ────────────────────────────────

interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: string;
  currency: string | null;
  status: string;
  created_at: string;
  request_reason: string | null;
  payment_method: string | null;
}

interface CostRow {
  id: string;
  submitted_by: string | null;
  amount_cents: number | null;
  expense_category: string | null;
  description: string | null;
  hub_id: string | null;
  created_at: string;
}

interface DownPaymentRow {
  id: string;
  requested_by: string | null;
  requested_amount: number | null;
  site_name: string | null;
  hub_name: string | null;
  hub_id: string | null;
  status: string;
  created_at: string;
  justification: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  hub_id: string | null;
}

interface MmpFileRow {
  id: string;
  name: string | null;
  region: string | null;
  uploaded_at: string;
  status: string | null;
  coordinator_id: string | null;
  uploaded_by: string | null;
}

interface HubMemberRow {
  id: string;
}

interface ProfileMapRow {
  id: string;
  full_name: string | null;
  hub_id: string | null;
}

// ── Discriminated rawData union ───────────────────────────────────────────────
type ApprovalRawData =
  | WithdrawalRow
  | CostRow
  | DownPaymentRow
  | ProfileRow
  | MmpFileRow;

export interface ApprovalItem {
  id: string;
  type: ApprovalItemType;
  subtype?: string;
  requesterName: string;
  requesterId: string;
  requesterHub?: string;
  amount?: number;
  currency?: string;
  description?: string;
  status: string;
  submittedAt: string;
  urgencyLevel: 'normal' | 'medium' | 'high' | 'critical';
  canInlineApprove: boolean;
  navigationPath?: string;
  rawData?: ApprovalRawData;
}

export interface UseApprovalsDataParams {
  currentUserId?: string;
  hubId?: string | null;
  roleIsSupervisor: boolean;
  roleIsFinance: boolean;
  roleIsAdmin: boolean;
  roleIsFinancialAdmin: boolean;
  roleIsFOM: boolean;
}

const REFRESH_INTERVAL_MS = 3 * 60_000;

function getUrgencyLevel(createdAt: string): ApprovalItem['urgencyLevel'] {
  const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (hoursAgo < 24) return 'normal';
  if (hoursAgo < 48) return 'medium';
  if (hoursAgo < 72) return 'high';
  return 'critical';
}

async function getProfilesMap(userIds: string[]): Promise<{ nameMap: Record<string, string>; hubMap: Record<string, string> }> {
  if (userIds.length === 0) return { nameMap: {}, hubMap: {} };
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, hub_id')
    .in('id', userIds);
  const nameMap: Record<string, string> = {};
  const hubMap: Record<string, string> = {};
  (profiles as ProfileMapRow[] | null || []).forEach((p) => {
    nameMap[p.id] = p.full_name || 'Unknown';
    hubMap[p.id] = p.hub_id || '';
  });
  return { nameMap, hubMap };
}

export function useApprovalsData({
  currentUserId,
  hubId,
  roleIsSupervisor,
  roleIsAdmin,
  roleIsFinancialAdmin,
  roleIsFOM,
}: UseApprovalsDataParams) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentUserId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    const allItems: ApprovalItem[] = [];

    try {
      // ── Determine hub team members for supervisor withdrawal filter ─────
      let supervisorTeamIds: string[] | null = null;
      if (roleIsSupervisor && hubId && !roleIsAdmin) {
        const { data: teamMembers } = await supabase
          .from('profiles')
          .select('id')
          .eq('hub_id', hubId)
          .neq('id', currentUserId);
        supervisorTeamIds = (teamMembers as HubMemberRow[] | null || []).map((m) => m.id);
      }

      // ── 1. Withdrawal requests — status: pending (Supervisor review) ───
      // Visible to: Supervisor (hub-scoped), Admin, FOM
      if (roleIsSupervisor || roleIsAdmin || roleIsFOM) {
        let query = supabase
          .from('withdrawal_requests')
          .select('id, user_id, amount, currency, status, created_at, request_reason, payment_method')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (roleIsSupervisor && !roleIsAdmin && supervisorTeamIds !== null) {
          if (supervisorTeamIds.length === 0) {
            query = query.eq('user_id', 'none');
          } else {
            query = query.in('user_id', supervisorTeamIds);
          }
        }

        const { data: withdrawals } = await query;
        if (withdrawals && withdrawals.length > 0) {
          const rows = withdrawals as WithdrawalRow[];
          const userIds = [...new Set(rows.map((w) => w.user_id))];
          const { nameMap, hubMap } = await getProfilesMap(userIds);
          rows.forEach((w) => {
            allItems.push({
              id: w.id,
              type: 'withdrawal',
              subtype: 'Supervisor',
              requesterName: nameMap[w.user_id] || 'Unknown',
              requesterId: w.user_id,
              requesterHub: hubMap[w.user_id],
              amount: parseFloat(w.amount),
              currency: w.currency || 'SDG',
              description: w.request_reason || w.payment_method || undefined,
              status: w.status,
              submittedAt: w.created_at,
              urgencyLevel: getUrgencyLevel(w.created_at),
              canInlineApprove: true,
              rawData: w,
            });
          });
        }
      }

      // ── 2. Withdrawal requests — status: supervisor_approved (Finance) ─
      // Visible to: Financial Admin, Admin, FOM
      if (roleIsFinancialAdmin || roleIsAdmin || roleIsFOM) {
        const { data: finWithdrawals } = await supabase
          .from('withdrawal_requests')
          .select('id, user_id, amount, currency, status, created_at, request_reason, payment_method')
          .eq('status', 'supervisor_approved')
          .order('created_at', { ascending: true });

        if (finWithdrawals && finWithdrawals.length > 0) {
          const rows = finWithdrawals as WithdrawalRow[];
          const userIds = [...new Set(rows.map((w) => w.user_id))];
          const { nameMap, hubMap } = await getProfilesMap(userIds);
          rows.forEach((w) => {
            allItems.push({
              id: `fin_${w.id}`,
              type: 'withdrawal',
              subtype: 'Finance',
              requesterName: nameMap[w.user_id] || 'Unknown',
              requesterId: w.user_id,
              requesterHub: hubMap[w.user_id],
              amount: parseFloat(w.amount),
              currency: w.currency || 'SDG',
              description: w.request_reason || undefined,
              status: w.status,
              submittedAt: w.created_at,
              urgencyLevel: getUrgencyLevel(w.created_at),
              canInlineApprove: false,
              navigationPath: '/finance-approval',
              rawData: w,
            });
          });
        }
      }

      // ── 3. Cost submissions — tier1_status: pending (Supervisor review) ─
      // Visible to: Supervisor (hub-scoped), Admin, FOM
      if (roleIsSupervisor || roleIsAdmin || roleIsFOM) {
        let costQuery = supabase
          .from('operational_cost_submissions')
          .select('id, submitted_by, amount_cents, expense_category, description, hub_id, created_at')
          .eq('tier1_status', 'pending')
          .order('created_at', { ascending: true });

        if (roleIsSupervisor && !roleIsAdmin && hubId) {
          costQuery = costQuery.eq('hub_id', hubId);
        }

        const { data: costs } = await costQuery;
        if (costs && costs.length > 0) {
          const rows = costs as CostRow[];
          const userIds = [...new Set(rows.map((c) => c.submitted_by).filter((id): id is string => id !== null))];
          const { nameMap } = await getProfilesMap(userIds);
          rows.forEach((c) => {
            allItems.push({
              id: `cost_${c.id}`,
              type: 'cost',
              subtype: 'Tier 1',
              requesterName: nameMap[c.submitted_by || ''] || 'Unknown',
              requesterId: c.submitted_by || '',
              requesterHub: c.hub_id || undefined,
              amount: c.amount_cents !== null ? c.amount_cents / 100 : undefined,
              currency: 'SDG',
              description: c.expense_category || c.description || undefined,
              status: 'pending_tier1',
              submittedAt: c.created_at,
              urgencyLevel: getUrgencyLevel(c.created_at),
              canInlineApprove: true,
              navigationPath: '/supervisor-approvals',
              rawData: c,
            });
          });
        }
      }

      // ── 4. Cost submissions — tier2_status: pending (FOM/Admin review) ─
      // Visible to: FOM, Admin
      if (roleIsFOM || roleIsAdmin) {
        const { data: tier2Costs } = await supabase
          .from('operational_cost_submissions')
          .select('id, submitted_by, amount_cents, expense_category, description, hub_id, created_at')
          .eq('tier1_status', 'approved')
          .eq('tier2_status', 'pending')
          .order('created_at', { ascending: true });

        if (tier2Costs && tier2Costs.length > 0) {
          const rows = tier2Costs as CostRow[];
          const userIds = [...new Set(rows.map((c) => c.submitted_by).filter((id): id is string => id !== null))];
          const { nameMap } = await getProfilesMap(userIds);
          rows.forEach((c) => {
            allItems.push({
              id: `cost2_${c.id}`,
              type: 'cost',
              subtype: 'Tier 2',
              requesterName: nameMap[c.submitted_by || ''] || 'Unknown',
              requesterId: c.submitted_by || '',
              requesterHub: c.hub_id || undefined,
              amount: c.amount_cents !== null ? c.amount_cents / 100 : undefined,
              currency: 'SDG',
              description: c.expense_category || c.description || undefined,
              status: 'pending_tier2',
              submittedAt: c.created_at,
              urgencyLevel: getUrgencyLevel(c.created_at),
              canInlineApprove: true,
              navigationPath: '/withdrawal-approval',
              rawData: c,
            });
          });
        }
      }

      // ── 5. Down-payment requests — status: pending_supervisor ────────────
      // Visible to: Supervisor (hub-scoped), Admin, FOM
      if (roleIsSupervisor || roleIsAdmin || roleIsFOM) {
        let dpQuery = supabase
          .from('down_payment_requests')
          .select('id, requested_by, requested_amount, site_name, hub_name, hub_id, status, created_at, justification')
          .eq('status', 'pending_supervisor')
          .order('created_at', { ascending: true });

        if (roleIsSupervisor && !roleIsAdmin && hubId) {
          dpQuery = dpQuery.eq('hub_id', hubId);
        }

        const { data: dpRequests } = await dpQuery;
        if (dpRequests && dpRequests.length > 0) {
          const rows = dpRequests as DownPaymentRow[];
          const userIds = [...new Set(rows.map((d) => d.requested_by).filter((id): id is string => id !== null))];
          const { nameMap } = await getProfilesMap(userIds);
          rows.forEach((d) => {
            allItems.push({
              id: `dp_${d.id}`,
              type: 'down_payment',
              subtype: 'Supervisor',
              requesterName: nameMap[d.requested_by || ''] || 'Unknown',
              requesterId: d.requested_by || '',
              requesterHub: d.hub_name || d.hub_id || undefined,
              amount: d.requested_amount ?? undefined,
              currency: 'SDG',
              description: d.site_name || d.justification || undefined,
              status: d.status,
              submittedAt: d.created_at,
              urgencyLevel: getUrgencyLevel(d.created_at),
              canInlineApprove: false,
              navigationPath: '/down-payment-approval',
              rawData: d,
            });
          });
        }
      }

      // ── 6. Down-payment requests — status: pending_admin ─────────────────
      // Visible to: Admin, FOM, Financial Admin
      if (roleIsAdmin || roleIsFOM || roleIsFinancialAdmin) {
        const { data: dpAdminRequests } = await supabase
          .from('down_payment_requests')
          .select('id, requested_by, requested_amount, site_name, hub_name, hub_id, status, created_at, justification')
          .eq('status', 'pending_admin')
          .order('created_at', { ascending: true });

        if (dpAdminRequests && dpAdminRequests.length > 0) {
          const rows = dpAdminRequests as DownPaymentRow[];
          const userIds = [...new Set(rows.map((d) => d.requested_by).filter((id): id is string => id !== null))];
          const { nameMap } = await getProfilesMap(userIds);
          rows.forEach((d) => {
            allItems.push({
              id: `dpa_${d.id}`,
              type: 'down_payment',
              subtype: 'Admin',
              requesterName: nameMap[d.requested_by || ''] || 'Unknown',
              requesterId: d.requested_by || '',
              requesterHub: d.hub_name || d.hub_id || undefined,
              amount: d.requested_amount ?? undefined,
              currency: 'SDG',
              description: d.site_name || d.justification || undefined,
              status: d.status,
              submittedAt: d.created_at,
              urgencyLevel: getUrgencyLevel(d.created_at),
              canInlineApprove: false,
              navigationPath: '/down-payment-approval',
              rawData: d,
            });
          });
        }
      }

      // ── 7. Pending user registrations ─────────────────────────────────
      // Visible to: Admin only
      if (roleIsAdmin) {
        const { data: pendingUsers } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, created_at, hub_id')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (pendingUsers) {
          (pendingUsers as ProfileRow[]).forEach((u) => {
            allItems.push({
              id: `user_${u.id}`,
              type: 'user',
              subtype: 'Registration',
              requesterName: u.full_name || u.email || 'Unknown',
              requesterId: u.id,
              requesterHub: u.hub_id || undefined,
              description: u.role ? `Role: ${u.role}` : 'Role not assigned',
              status: 'pending',
              submittedAt: u.created_at,
              urgencyLevel: getUrgencyLevel(u.created_at),
              canInlineApprove: true,
              rawData: u,
            });
          });
        }
      }

      // ── 8. Pre-fund requests — pending approval ───────────────────────
      // Visible to: Financial Admin, Admin — see all pending_approval funds
      // Also visible to: any user assigned to a pending approval step (step-assignee model)
      const preFundIds = new Set<string>();

      if (roleIsFinancialAdmin || roleIsAdmin) {
        const { data: preFunds } = await supabase
          .from('pre_fund_requests')
          .select('id, name, source, amount, currency, status, created_at, created_by, country_id, project_id')
          .eq('status', 'pending_approval')
          .order('created_at', { ascending: true })
          .limit(50);

        if (preFunds && (preFunds as any[]).length > 0) {
          const rows = preFunds as any[];
          const creatorIds = [...new Set(rows.map((r: any) => r.created_by).filter(Boolean))];
          const { nameMap } = await getProfilesMap(creatorIds);
          rows.forEach((r: any) => {
            preFundIds.add(r.id);
            allItems.push({
              id: `pf_${r.id}`,
              type: 'pre_fund',
              subtype: 'Activation',
              requesterName: nameMap[r.created_by || ''] || 'Finance Team',
              requesterId: r.created_by || '',
              amount: parseFloat(r.amount),
              currency: r.currency || 'USD',
              description: [r.name, r.source ? `Donor: ${r.source}` : null].filter(Boolean).join(' — ') || undefined,
              status: r.status,
              submittedAt: r.created_at,
              urgencyLevel: getUrgencyLevel(r.created_at),
              canInlineApprove: false,
              navigationPath: '/pre-funding',
              rawData: r,
            });
          });
        }
      }

      // Step-assignee: surface pre-fund requests where this user has a pending approval step
      // (covers non-finance users assigned to a specific step in the chain)
      // Checks both legacy single-user column AND multi-user array column.
      if (currentUserId) {
        const { data: assignedSteps } = await supabase
          .from('pre_fund_approval_steps')
          .select('pre_fund_request_id, step_label')
          .or(`assigned_user_id.eq.${currentUserId},assigned_user_ids.cs.{${currentUserId}}`)
          .eq('status', 'pending')
          .limit(30);

        if (assignedSteps && (assignedSteps as any[]).length > 0) {
          const stepRows = assignedSteps as any[];
          const pendingFundIds = stepRows
            .map((s: any) => s.pre_fund_request_id)
            .filter((fid: string) => !preFundIds.has(fid));

          if (pendingFundIds.length > 0) {
            const { data: stepFunds } = await supabase
              .from('pre_fund_requests')
              .select('id, name, source, amount, currency, status, created_at, created_by')
              .in('id', pendingFundIds)
              .eq('status', 'pending_approval')
              .limit(30);

            if (stepFunds && (stepFunds as any[]).length > 0) {
              const sfRows = stepFunds as any[];
              const creatorIds = [...new Set(sfRows.map((r: any) => r.created_by).filter(Boolean))];
              const { nameMap } = await getProfilesMap(creatorIds);
              sfRows.forEach((r: any) => {
                const myStep = stepRows.find((s: any) => s.pre_fund_request_id === r.id);
                allItems.push({
                  id: `pf_${r.id}`,
                  type: 'pre_fund',
                  subtype: myStep?.step_label ? `Step: ${myStep.step_label}` : 'Approval Step',
                  requesterName: nameMap[r.created_by || ''] || 'Finance Team',
                  requesterId: r.created_by || '',
                  amount: parseFloat(r.amount),
                  currency: r.currency || 'USD',
                  description: [r.name, r.source ? `Donor: ${r.source}` : null].filter(Boolean).join(' — ') || undefined,
                  status: r.status,
                  submittedAt: r.created_at,
                  urgencyLevel: getUrgencyLevel(r.created_at),
                  canInlineApprove: false,
                  navigationPath: '/pre-funding',
                  rawData: r,
                });
              });
            }
          }
        }
      }

      // ── 9. MMP files — pending coordinator assignment ─────────────────
      // Visible to: Admin, FOM only
      if (roleIsAdmin || roleIsFOM) {
        const { data: mmpFiles } = await supabase
          .from('mmp_files')
          .select('id, name, region, uploaded_at, status, coordinator_id, uploaded_by')
          .is('coordinator_id', null)
          .not('status', 'in', '("completed","archived","deleted","rejected","cancelled")')
          .order('uploaded_at', { ascending: true })
          .limit(50);

        if (mmpFiles && mmpFiles.length > 0) {
          const rows = mmpFiles as MmpFileRow[];
          const uploaderIds = [...new Set(rows.map((m) => m.uploaded_by).filter((id): id is string => id !== null))];
          const { nameMap } = await getProfilesMap(uploaderIds);
          rows.forEach((m) => {
            allItems.push({
              id: `mmp_${m.id}`,
              type: 'mmp',
              subtype: 'Unassigned',
              requesterName: nameMap[m.uploaded_by || ''] || 'Unknown',
              requesterId: m.uploaded_by || '',
              description: [m.name, m.region].filter(Boolean).join(' — ') || undefined,
              status: m.status || 'pending',
              submittedAt: m.uploaded_at,
              urgencyLevel: getUrgencyLevel(m.uploaded_at),
              canInlineApprove: false,
              navigationPath: `/mmp/${m.id}`,
              rawData: m,
            });
          });
        }
      }

      allItems.sort((a, b) => {
        const urgencyOrder: Record<ApprovalItem['urgencyLevel'], number> = { critical: 0, high: 1, medium: 2, normal: 3 };
        const urgencyDiff = urgencyOrder[a.urgencyLevel] - urgencyOrder[b.urgencyLevel];
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      });

      setItems(allItems);
    } catch (err) {
      console.error('ApprovalsHub: Failed to fetch approvals data', err);
      setError('Failed to load approvals data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, hubId, roleIsSupervisor, roleIsAdmin, roleIsFinancialAdmin, roleIsFOM]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const totalPending = items.length;

  return { items, loading, error, refresh, totalPending };
}
