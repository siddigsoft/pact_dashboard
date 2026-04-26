import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApprovalPendingCard } from '@/components/ApprovalPendingCard';
import { TaskDependenciesView } from '@/components/TaskDependenciesView';
import { supabase } from '@/lib/supabase';
import { getBlockingTasks, getDependentTasks } from '@/services/task-dependencies.service';
import { CheckCircle2, GitBranch, History, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  taskId: string;
  /** Total status changes (drives the Activity badge). */
  historyCount: number;
  /** Pre-rendered Status Timeline JSX (kept inline in TaskDetail to keep
   * STATUS_LABELS / STATUS_COLORS imports there). */
  historyChildren: React.ReactNode;
  /** Bubble approval-complete events back to the parent so it can refresh
   * the task-detail query. */
  onApprovalComplete?: () => void;
};

/**
 * Consolidates the three "context" sections that used to stack at the bottom
 * of the task page (Pending Approvals + Dependencies + Status Timeline) into
 * a single tabbed card placed at the top of the right column.
 *
 * - Surfaces actionable items higher on the page.
 * - Shows live count badges on each tab so users can scan state at a glance.
 * - Auto-selects the most useful tab on mount: Approvals if anything is
 *   pending, else Dependencies if any are configured, else Activity.
 */
export function TaskInsightsTabs({
  taskId,
  historyCount,
  historyChildren,
  onApprovalComplete,
}: Props) {
  const [approvalCount, setApprovalCount] = useState<number | null>(null);
  const [depCount, setDepCount] = useState<number | null>(null);
  // `tab` only takes its initial value once the counts settle so the smart
  // default has data to work with. After that user clicks override.
  const [tab, setTab] = useState<string | null>(null);

  // Approval count — query task_approvals for this task with pending status.
  // Polls every 30s alongside the inner ApprovalPendingCard so badges stay
  // in sync with its own polling.
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('task_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('status', 'pending');
      if (cancelled) return;
      setApprovalCount(error ? 0 : (count ?? 0));
    };
    fetchCount();
    const t = window.setInterval(fetchCount, 30_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [taskId]);

  // Dependency count — combine blocking + dependent so the badge reflects
  // both incoming and outgoing edges.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, d] = await Promise.all([
          getBlockingTasks(taskId),
          getDependentTasks(taskId),
        ]);
        if (cancelled) return;
        const total = (b.error ? 0 : b.blockingTasks.length) + (d.error ? 0 : d.dependentTasks.length);
        setDepCount(total);
      } catch {
        if (!cancelled) setDepCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  // Smart default: Approvals if pending, else Dependencies if any, else Activity.
  const smartDefault = useMemo(() => {
    if ((approvalCount ?? 0) > 0) return 'approvals';
    if ((depCount ?? 0) > 0) return 'dependencies';
    return 'activity';
  }, [approvalCount, depCount]);

  useEffect(() => {
    if (tab !== null) return;
    if (approvalCount === null || depCount === null) return;
    setTab(smartDefault);
  }, [approvalCount, depCount, smartDefault, tab]);

  const activeTab = tab ?? 'approvals';

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
      data-testid="card-task-insights"
    >
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 bg-slate-50/40">
        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full h-auto rounded-xl p-1 bg-slate-100">
            <TabPill
              value="approvals"
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label="Approvals"
              count={approvalCount}
              tone={(approvalCount ?? 0) > 0 ? 'amber' : 'neutral'}
              testid="tab-approvals"
            />
            <TabPill
              value="dependencies"
              icon={<GitBranch className="w-3.5 h-3.5" />}
              label="Dependencies"
              count={depCount}
              tone={(depCount ?? 0) > 0 ? 'blue' : 'neutral'}
              testid="tab-dependencies"
            />
            <TabPill
              value="activity"
              icon={<History className="w-3.5 h-3.5" />}
              label="Activity"
              count={historyCount}
              tone="neutral"
              testid="tab-activity"
            />
          </TabsList>

          <TabsContent value="approvals" className="mt-3 focus-visible:outline-none">
            {(approvalCount ?? 0) === 0 ? (
              <div className="text-center py-6 text-slate-500" data-testid="empty-approvals">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium text-slate-700">No pending approvals</p>
                <p className="text-xs text-slate-400 mt-0.5">Anything that needs sign-off will show up here.</p>
              </div>
            ) : (
              <ApprovalPendingCard hideHeader onApprovalComplete={onApprovalComplete} />
            )}
          </TabsContent>

          <TabsContent value="dependencies" className="mt-3 focus-visible:outline-none">
            <TaskDependenciesView taskId={taskId} hideHeader />
          </TabsContent>

          <TabsContent value="activity" className="mt-3 focus-visible:outline-none">
            {historyChildren}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type TabPillProps = {
  value: string;
  icon: React.ReactNode;
  label: string;
  count: number | null;
  tone: 'neutral' | 'amber' | 'blue';
  testid: string;
};

function TabPill({ value, icon, label, count, tone, testid }: TabPillProps) {
  const badgeTone =
    tone === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200'
    : tone === 'blue' ? 'bg-blue-100 text-blue-800 border-blue-200'
    : 'bg-slate-200 text-slate-600 border-slate-300';
  return (
    <TabsTrigger
      value={value}
      data-testid={testid}
      className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600 px-2 py-1.5 h-auto"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {icon}
        <span className="text-xs font-medium truncate">{label}</span>
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full border text-[10px] font-semibold leading-none',
            badgeTone,
          )}
        >
          {count ?? '–'}
        </span>
      </span>
    </TabsTrigger>
  );
}
