/**
 * ProjectMyWorkPanel — Shows the current user's personal work on this project:
 *   • Assigned field tasks (status + due date)
 *   • Their cost submissions (approval status)
 *   • Their professional fee status (if in teamComposition)
 *   • Quick links to team communication
 *
 * Only rendered when the current user is a member of the project.
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useProjectChat } from '@/hooks/use-project-chat';
import { useProjectChatUnread } from '@/hooks/useProjectChatUnread';
import {
  CheckSquare, Receipt, DollarSign, MessageSquare, ArrowRight,
  Clock, CheckCircle2, AlertCircle, Circle, Loader2, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { calcMemberTotalCost } from '@/types/project';
import type { Project, ProjectTeamMember } from '@/types/project';

/* ── Types ── */
interface FieldTask {
  id: string;
  title: string;
  status: string;
  due_date?: string;
  priority?: string;
}
interface CostSub {
  id: string;
  description?: string;
  amount_cents: number;
  currency: string;
  status: string;
  tier1_status?: string;
  tier2_status?: string;
  expense_date: string;
}

/* ── Helpers ── */
const TASK_STATUS_CFG: Record<string, { label: string; icon: any; cls: string }> = {
  todo:        { label: 'To Do',       icon: Circle,       cls: 'text-slate-500' },
  in_progress: { label: 'In Progress', icon: Clock,        cls: 'text-amber-500' },
  done:        { label: 'Done',        icon: CheckCircle2, cls: 'text-emerald-500' },
  blocked:     { label: 'Blocked',     icon: AlertCircle,  cls: 'text-red-500' },
};

const COST_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:         { label: 'Pending Review',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  under_review:    { label: 'Under Review',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  approved:        { label: 'Approved',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  paid:            { label: 'Paid',            cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected:        { label: 'Rejected',        cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  tier1_approved:  { label: 'T1 Approved',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  tier2_approved:  { label: 'T2 Approved',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

function fmtDate(d?: string) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtMoney(cents: number, cur: string) {
  return `${cur} ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function resolvedCostStatus(sub: CostSub) {
  return sub.tier2_status || sub.tier1_status || sub.status || 'pending';
}

/* ── Props ── */
interface Props {
  project: Project;
  currentUserId: string;
  currentUserName?: string;
  /** Total project budget amount (for % fee calculation) */
  projectBudgetTotal?: number;
  /** Called when the user clicks "Team Chat" — opens the inline chat drawer */
  onOpenChatDrawer?: () => void;
  /** True while the chat room is being found / provisioned */
  chatDrawerLoading?: boolean;
}

export function ProjectMyWorkPanel({ project, currentUserId, currentUserName, projectBudgetTotal, onOpenChatDrawer, chatDrawerLoading }: Props) {
  const navigate = useNavigate();
  const { openProjectChat, busy: chatBusy } = useProjectChat();
  const { unreadCount: chatUnread, markAsRead: markChatRead } = useProjectChatUnread(project.id, currentUserId);
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [costs, setCosts] = useState<CostSub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [tasksRes, costsRes] = await Promise.all([
        supabase
          .from('project_field_tasks')
          .select('id, title, status, due_date, priority')
          .eq('project_id', project.id)
          .or(`assigned_to.eq.${currentUserId},co_assignees.cs.["${currentUserId}"]`)
          .neq('status', 'done')
          .order('due_date', { ascending: true })
          .limit(5),
        supabase
          .from('operational_cost_submissions')
          .select('id, description, amount_cents, currency, status, tier1_status, tier2_status, expense_date')
          .eq('project_id', project.id)
          .eq('submitted_by', currentUserId)
          .order('expense_date', { ascending: false })
          .limit(5),
      ]);
      if (!alive) return;
      setTasks((tasksRes.data ?? []) as FieldTask[]);
      setCosts((costsRes.data ?? []) as CostSub[]);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [project.id, currentUserId]);

  /* ── My fee ── */
  const myFee = useMemo(() => {
    const composition: ProjectTeamMember[] = (project.team as any)?.teamComposition ?? [];
    return composition.find((m: ProjectTeamMember) => m.userId === currentUserId) ?? null;
  }, [project.team, currentUserId]);

  const myFeeTotal = useMemo(() => {
    if (!myFee?.feeType) return 0;
    return calcMemberTotalCost(myFee, projectBudgetTotal || 0);
  }, [myFee, projectBudgetTotal]);

  /* ── My role ── */
  const myRole = useMemo(() => {
    if (project.team?.projectManager === currentUserId) return 'Project Manager';
    if (myFee) return 'Consultant / Professional';
    return 'Team Member';
  }, [project.team, currentUserId, myFee]);

  const hasContent = tasks.length > 0 || costs.length > 0 || !!myFee;

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-6 flex items-center gap-3 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your work on this project…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.06] divide-y divide-border/60">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">My Work on This Project</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
            {myRole}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5 relative"
            disabled={chatDrawerLoading}
            onClick={() => {
              markChatRead();
              if (onOpenChatDrawer) {
                onOpenChatDrawer();
              } else {
                navigate(`/projects/${project.id}?tab=comments`);
              }
            }}
          >
            {chatDrawerLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <MessageSquare className="h-3.5 w-3.5" />}
            Team Chat
            {chatUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
                {chatUnread > 99 ? '99+' : chatUnread}
              </span>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1 text-primary"
            disabled={chatBusy}
            onClick={() => openProjectChat(project, currentUserId)}
          >
            {chatBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            Message Team
          </Button>
        </div>
      </div>

      {!hasContent ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No tasks or cost submissions assigned to you on this project yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60">

          {/* ── My Tasks ── */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Open Tasks ({tasks.length})
                </span>
              </div>
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => navigate(`/projects/${project.id}?tab=field_tasks`)}
              >
                View all
              </button>
            </div>
            {tasks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">No open tasks assigned to you.</p>
            ) : (
              tasks.map(task => {
                const cfg = TASK_STATUS_CFG[task.status] ?? TASK_STATUS_CFG.todo;
                const Icon = cfg.icon;
                const due = fmtDate(task.due_date);
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-muted/40 rounded-md px-1 -mx-1 transition-colors"
                    onClick={() => navigate(`/projects/${project.id}?tab=field_tasks`)}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', cfg.cls)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight truncate">{task.title}</p>
                      {due && (
                        <p className={cn('text-[10px] mt-0.5', isOverdue ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                          {isOverdue ? '⚠ ' : ''}Due {due}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── My Cost Submissions ── */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Cost Submissions ({costs.length})
                </span>
              </div>
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => navigate('/cost-submission')}
              >
                Submit new
              </button>
            </div>
            {costs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">No cost submissions for this project.</p>
            ) : (
              costs.map(sub => {
                const st = resolvedCostStatus(sub);
                const statusInfo = COST_STATUS_LABEL[st] ?? COST_STATUS_LABEL.pending;
                return (
                  <div key={sub.id} className="flex items-center gap-2 py-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight">
                        {sub.description || 'Cost submission'}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {fmtMoney(sub.amount_cents, sub.currency)} · {fmtDate(sub.expense_date)}
                      </p>
                    </div>
                    <span className={cn('shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full', statusInfo.cls)}>
                      {statusInfo.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* ── My Fee Status ── */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                My Fee / Payment
              </span>
            </div>
            {!myFee ? (
              <p className="text-[11px] text-muted-foreground py-2">
                No professional fee linked to you on this project.
              </p>
            ) : (
              <div className="space-y-2 py-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Fee Type</span>
                  <span className="text-[11px] font-semibold capitalize">
                    {myFee.feeType?.replace('_', ' ') ?? '—'}
                  </span>
                </div>
                {myFeeTotal > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Total Fee</span>
                    <span className="text-[11px] font-semibold text-foreground">
                      {myFee.currency ?? 'USD'} {myFeeTotal.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Payment Status</span>
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize',
                    myFee.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    myFee.paymentStatus === 'partially_paid' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  )}>
                    {myFee.paymentStatus?.replace('_', ' ') ?? 'Unpaid'}
                  </span>
                </div>
                <button
                  className="text-[10px] text-primary hover:underline mt-1"
                  onClick={() => navigate(`/projects/${project.id}?tab=fees`)}
                >
                  View fee details →
                </button>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
