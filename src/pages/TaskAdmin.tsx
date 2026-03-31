import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Edit2, Loader2, ChevronDown, ChevronUp,
  Building2, DollarSign, FileDown, ListTodo, Users,
  RepeatIcon, CheckCircle2, Circle, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useDailyTaskDefinitions, type DailyTaskDefinition, type PersonalTaskPriority } from '@/hooks/usePersonalTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const PRIORITY_CFG: Record<PersonalTaskPriority, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'bg-blue-100 text-blue-700' },
  medium:   { label: 'Medium',   color: 'bg-amber-100 text-amber-700' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
};

// ── Departments ────────────────────────────────────────────────────────────────

function useDepartments() {
  return useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
}

// ── Task Overview by Department ───────────────────────────────────────────────

interface DeptTaskStat {
  deptId: string;
  deptName: string;
  total: number;
  inprogress: number;
  done: number;
  overdue: number;
}

function useTaskOverview() {
  return useQuery({
    queryKey: ['task_overview_by_dept'],
    queryFn: async (): Promise<DeptTaskStat[]> => {
      const [deptRes, taskRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('personal_tasks')
          .select('target_department_id, status, due_date')
          .not('target_department_id', 'is', null),
      ]);

      const depts = (deptRes.data ?? []) as { id: string; name: string }[];
      const tasks = (taskRes.data ?? []) as { target_department_id: string; status: string; due_date: string | null }[];

      const today = new Date();

      return depts.map(dept => {
        const dTasks = tasks.filter(t => t.target_department_id === dept.id);
        const overdue = dTasks.filter(t => {
          if (!t.due_date || t.status === 'done' || t.status === 'cancelled') return false;
          return new Date(t.due_date) < today;
        }).length;
        return {
          deptId: dept.id,
          deptName: dept.name,
          total: dTasks.length,
          inprogress: dTasks.filter(t => t.status === 'inprogress').length,
          done: dTasks.filter(t => t.status === 'done').length,
          overdue,
        };
      }).filter(d => d.total > 0);
    },
    staleTime: 60_000,
  });
}

function TaskOverviewPanel() {
  const { data: stats = [], isLoading, refetch } = useTaskOverview();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-[#1D3461]" />
            Task Overview by Department
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 w-7 p-0">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <button type="button" onClick={() => setCollapsed(c => !c)} className="text-muted-foreground hover:text-foreground">
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : stats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No department tasks found. Assign tasks to departments using the New Task dialog on My Tasks.</p>
          ) : (
            <div className="space-y-3">
              {stats.map(s => {
                const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
                return (
                  <div key={s.deptId} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-[#1D3461]" />
                        <span className="text-sm font-medium">{s.deptName}</span>
                        {s.overdue > 0 && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700">{s.overdue} overdue</Badge>
                        )}
                      </div>
                      <span className="text-xs font-bold text-muted-foreground">{s.done}/{s.total} done</span>
                    </div>
                    <Progress value={pct} className="h-1.5 mb-2" />
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5 text-slate-400" />{s.total - s.done - s.inprogress} todo</span>
                      <span className="flex items-center gap-1"><Circle className="h-2.5 w-2.5 text-[#1D3461]" />{s.inprogress} in progress</span>
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />{s.done} done</span>
                      {s.overdue > 0 && <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-2.5 w-2.5" />{s.overdue} overdue</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Daily Task Templates ─────────────────────────────────────────────────────

interface DefFormProps {
  initial: Partial<DailyTaskDefinition> | null;
  onClose: () => void;
  onSave: (data: Omit<DailyTaskDefinition, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  isSaving: boolean;
  departments: { id: string; name: string }[];
}

function DefForm({ initial, onClose, onSave, isSaving, departments }: DefFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<PersonalTaskPriority>(initial?.priority ?? 'medium');
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? 'daily');
  const [deptId, setDeptId] = useState(initial?.departmentId ?? '');
  const [rolesRaw, setRolesRaw] = useState((initial?.roleTargets ?? []).join(', '));
  const [rewardAmount, setRewardAmount] = useState(initial?.rewardAmount?.toString() ?? '');
  const [rewardCurrency, setRewardCurrency] = useState(initial?.rewardCurrency ?? 'USD');
  const [active, setActive] = useState(initial?.active ?? true);

  const handleSave = async () => {
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      recurrence,
      departmentId: deptId || null,
      roleTargets: rolesRaw.split(',').map(r => r.trim()).filter(Boolean),
      rewardAmount: rewardAmount ? parseFloat(rewardAmount) : null,
      rewardCurrency: rewardCurrency || 'USD',
      active,
    });
  };

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title *</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Daily standup check-in" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[60px] text-sm resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</Label>
          <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['low', 'medium', 'high', 'critical'] as PersonalTaskPriority[]).map(p => (
                <SelectItem key={p} value={p}>{PRIORITY_CFG[p].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recurrence</Label>
          <Select value={recurrence} onValueChange={setRecurrence}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly (Mon)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department (optional)</Label>
        <Select value={deptId || 'any'} onValueChange={v => setDeptId(v === 'any' ? '' : v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any department</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Roles (comma-separated, leave blank for all)</Label>
        <Input value={rolesRaw} onChange={e => setRolesRaw(e.target.value)} placeholder="coordinator, supervisor" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completion Reward</Label>
          <Input type="number" min="0" step="0.01" value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Currency</Label>
          <Input value={rewardCurrency} onChange={e => setRewardCurrency(e.target.value)} placeholder="USD" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={setActive} id="def-active" />
        <Label htmlFor="def-active" className="text-sm cursor-pointer">Active (materialise tasks for eligible users)</Label>
      </div>
      <DialogFooter className="gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!title.trim() || isSaving} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save Template
        </Button>
      </DialogFooter>
    </div>
  );
}

function DailyTemplatesPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { data: definitions = [], isLoading } = useDailyTaskDefinitions();
  const { data: departments = [] } = useDepartments();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DailyTaskDefinition | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string } & Omit<DailyTaskDefinition, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
      const { id, ...rest } = data;
      const payload = {
        title: rest.title,
        description: rest.description,
        priority: rest.priority,
        recurrence: rest.recurrence,
        department_id: rest.departmentId,
        role_targets: rest.roleTargets,
        reward_amount: rest.rewardAmount,
        reward_currency: rest.rewardCurrency,
        active: rest.active,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { error } = await supabase.from('daily_task_definitions').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('daily_task_definitions').insert({ ...payload, created_by: currentUser?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily_task_definitions'] });
      setFormOpen(false);
      setEditTarget(null);
      toast({ title: 'Template saved' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('daily_task_definitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily_task_definitions'] });
      toast({ title: 'Template deleted' });
    },
  });

  const handleSave = async (data: Omit<DailyTaskDefinition, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
    await saveMutation.mutateAsync({ id: editTarget?.id, ...data });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <RepeatIcon className="h-4 w-4 text-[#1D3461]" />
            Daily Task Templates
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{definitions.filter(d => d.active).length} active</Badge>
          </CardTitle>
          <Button size="sm" className="h-7 bg-[#1D3461] hover:bg-[#0F2041] text-white gap-1" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Templates are materialised into personal tasks when eligible users log in. Daily templates run every day; weekly templates run on Mondays.
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : definitions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl">
            No recurring task templates yet. Create one to automatically assign daily tasks to your team.
          </div>
        ) : (
          <div className="space-y-2">
            {definitions.map(def => {
              const deptName = departments.find(d => d.id === def.departmentId)?.name;
              return (
                <div key={def.id} className={cn('flex items-start gap-3 rounded-lg border p-3', !def.active && 'opacity-50')}>
                  <RepeatIcon className="h-4 w-4 text-[#1D3461] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{def.title}</span>
                      <Badge variant={def.active ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0">
                        {def.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">{def.recurrence}</Badge>
                      <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', PRIORITY_CFG[def.priority]?.color)}>
                        {PRIORITY_CFG[def.priority]?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                      {deptName && <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{deptName}</span>}
                      {def.roleTargets.length > 0 && <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{def.roleTargets.join(', ')}</span>}
                      {def.rewardAmount && <span className="flex items-center gap-0.5 text-emerald-600"><DollarSign className="h-3 w-3" />{def.rewardCurrency} {def.rewardAmount}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditTarget(def); setFormOpen(true); }}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(def.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={open => { if (!open) { setFormOpen(false); setEditTarget(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <RepeatIcon className="h-4 w-4 text-[#1D3461]" />
              {editTarget ? 'Edit Task Template' : 'New Task Template'}
            </DialogTitle>
          </DialogHeader>
          <DefForm
            initial={editTarget}
            onClose={() => { setFormOpen(false); setEditTarget(null); }}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
            departments={departments}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Payroll Panel ─────────────────────────────────────────────────────────────

interface PayrollRow {
  userId: string;
  userName: string;
  deptName: string;
  taskRewards: number;
  retainerAmount: number;
  totalEarnings: number;
  currency: string;
  walletBalance: number;
  tasksCompleted: number;
}

function usePayrollData(deptId: string, fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['payroll_data', deptId, fromDate, toDate],
    queryFn: async (): Promise<PayrollRow[]> => {
      // Get members in dept (or all if no dept selected)
      let profilesQuery = supabase
        .from('profiles')
        .select('id, full_name, department_id');
      if (deptId && deptId !== 'all') {
        profilesQuery = profilesQuery.eq('department_id', deptId);
      }
      const { data: profiles } = await profilesQuery;
      if (!profiles?.length) return [];

      const userIds = profiles.map(p => p.id as string);

      // Get departments for display
      const { data: depts } = await supabase.from('departments').select('id, name');
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: Record<string, unknown>) => { deptMap[d.id as string] = d.name as string; });

      // Get task reward credits in date range (source: task_completion)
      const { data: taskTxns } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency')
        .in('user_id', userIds)
        .eq('type', 'credit')
        .like('memo', 'Task reward:%')
        .gte('created_at', fromDate + 'T00:00:00')
        .lte('created_at', toDate + 'T23:59:59');

      // Get retainer credits in date range (source: retainer or memo containing 'retainer')
      // Note: a dedicated retainer_payments table is not yet implemented; this queries
      // wallet_transactions entries that were created by the retainer management workflow.
      const { data: retainerTxns } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency')
        .in('user_id', userIds)
        .eq('type', 'credit')
        .ilike('memo', '%retainer%')
        .gte('created_at', fromDate + 'T00:00:00')
        .lte('created_at', toDate + 'T23:59:59');

      // Get completed rewarded tasks in date range
      const { data: tasks } = await supabase
        .from('personal_tasks')
        .select('assigned_to')
        .in('assigned_to', userIds)
        .eq('status', 'done')
        .not('completion_reward_amount', 'is', null)
        .gte('updated_at', fromDate + 'T00:00:00')
        .lte('updated_at', toDate + 'T23:59:59');

      // Get wallet balances
      const { data: wallets } = await supabase
        .from('wallets')
        .select('user_id, total_earned')
        .in('user_id', userIds);

      const walletMap: Record<string, number> = {};
      (wallets ?? []).forEach((w: Record<string, unknown>) => { walletMap[w.user_id as string] = Number(w.total_earned ?? 0); });

      const rewardMap: Record<string, number> = {};
      const retainerMap: Record<string, number> = {};
      const currencyMap: Record<string, string> = {};

      (taskTxns ?? []).forEach((t: Record<string, unknown>) => {
        const uid = t.user_id as string;
        rewardMap[uid] = (rewardMap[uid] ?? 0) + Number(t.amount ?? 0);
        currencyMap[uid] = (t.currency as string) ?? 'USD';
      });

      (retainerTxns ?? []).forEach((t: Record<string, unknown>) => {
        const uid = t.user_id as string;
        retainerMap[uid] = (retainerMap[uid] ?? 0) + Number(t.amount ?? 0);
        if (!currencyMap[uid]) currencyMap[uid] = (t.currency as string) ?? 'USD';
      });

      const completedMap: Record<string, number> = {};
      (tasks ?? []).forEach((t: Record<string, unknown>) => {
        const uid = t.assigned_to as string;
        completedMap[uid] = (completedMap[uid] ?? 0) + 1;
      });

      return profiles.map((p: Record<string, unknown>) => {
        const taskR   = rewardMap[p.id as string] ?? 0;
        const retainer = retainerMap[p.id as string] ?? 0;
        return {
          userId: p.id as string,
          userName: (p.full_name as string) ?? 'Unknown',
          deptName: deptMap[p.department_id as string] ?? '—',
          taskRewards: taskR,
          retainerAmount: retainer,
          totalEarnings: taskR + retainer,
          currency: currencyMap[p.id as string] ?? 'USD',
          walletBalance: walletMap[p.id as string] ?? 0,
          tasksCompleted: completedMap[p.id as string] ?? 0,
        };
      }).filter(r => r.totalEarnings > 0 || r.walletBalance > 0 || r.tasksCompleted > 0);
    },
    staleTime: 30_000,
  });
}

function PayrollPanel() {
  const { toast } = useToast();
  const { data: departments = [] } = useDepartments();
  const [deptId, setDeptId] = useState('all');
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { data: rows = [], isLoading, refetch } = usePayrollData(deptId, fromDate, toDate);

  const totals = useMemo(() => ({
    rewards: rows.reduce((s, r) => s + r.taskRewards, 0),
    retainers: rows.reduce((s, r) => s + r.retainerAmount, 0),
    total: rows.reduce((s, r) => s + r.totalEarnings, 0),
    balance: rows.reduce((s, r) => s + r.walletBalance, 0),
    tasks: rows.reduce((s, r) => s + r.tasksCompleted, 0),
  }), [rows]);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Payroll Summary Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Period: ${fromDate} to ${toDate}`, 14, 24);
    autoTable(doc, {
      startY: 30,
      head: [['Name', 'Department', 'Tasks Done', 'Task Rewards', 'Retainer', 'Total Earnings', 'Wallet Balance']],
      body: rows.map(r => [
        r.userName, r.deptName, r.tasksCompleted,
        `${r.currency} ${r.taskRewards.toFixed(2)}`,
        `${r.currency} ${r.retainerAmount.toFixed(2)}`,
        `${r.currency} ${r.totalEarnings.toFixed(2)}`,
        `${r.currency} ${r.walletBalance.toFixed(2)}`,
      ]),
      foot: [['TOTAL', '', totals.tasks,
        totals.rewards.toFixed(2),
        totals.retainers.toFixed(2),
        totals.total.toFixed(2),
        totals.balance.toFixed(2),
      ]],
      theme: 'grid',
    });
    doc.save(`payroll-${fromDate}-to-${toDate}.pdf`);
    toast({ title: 'PDF exported — sending payroll summaries to members…' });
    notifyDeptMembers();
  };

  const exportExcel = () => {
    const wsData = [
      ['Name', 'Department', 'Tasks Completed', 'Task Rewards', 'Retainer', 'Total Earnings', 'Currency', 'Wallet Balance'],
      ...rows.map(r => [r.userName, r.deptName, r.tasksCompleted, r.taskRewards, r.retainerAmount, r.totalEarnings, r.currency, r.walletBalance]),
      ['TOTAL', '', totals.tasks, totals.rewards, totals.retainers, totals.total, '', totals.balance],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, `payroll-${fromDate}-to-${toDate}.xlsx`);
    toast({ title: 'Excel exported — sending payroll summaries to members…' });
    notifyDeptMembers();
  };

  const notifyDeptMembers = async () => {
    if (!rows.length) return;
    let sent = 0;
    for (const row of rows) {
      try {
        const { data: profile } = await supabase.from('profiles').select('email').eq('id', row.userId).maybeSingle();
        if (profile?.email) {
          await supabase.functions.invoke('send-email', {
            body: {
              to: profile.email as string,
              subject: 'Your Payroll Summary',
              html: `<p>Dear ${row.userName},</p><p>Your payroll summary for the period <strong>${fromDate}</strong> to <strong>${toDate}</strong>:</p><ul><li>Tasks completed: <strong>${row.tasksCompleted}</strong></li><li>Task rewards earned: <strong>${row.currency} ${row.taskRewards.toFixed(2)}</strong></li><li>Retainer payments: <strong>${row.currency} ${row.retainerAmount.toFixed(2)}</strong></li><li>Total earnings: <strong>${row.currency} ${row.totalEarnings.toFixed(2)}</strong></li><li>Wallet balance: <strong>${row.currency} ${row.walletBalance.toFixed(2)}</strong></li></ul><p>View your wallet: <a href="https://app.pactorg.com/wallets">https://app.pactorg.com/wallets</a></p>`,
            },
          });
          sent++;
        }
      } catch { /* non-critical */ }
    }
    toast({ title: `Payroll summary sent to ${sent} member${sent !== 1 ? 's' : ''}` });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          Payroll Calculation Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={exportPDF} className="h-8 gap-1" disabled={!rows.length}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} className="h-8 gap-1" disabled={!rows.length}>
            <FileDown className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={notifyDeptMembers} className="h-8 gap-1" disabled={!rows.length}>
            <Users className="h-3.5 w-3.5" /> Email Members
          </Button>
        </div>

        {/* Summary stats */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Tasks Done', value: totals.tasks, color: 'text-[#1D3461]' },
              { label: 'Task Rewards', value: totals.rewards.toFixed(2), color: 'text-emerald-600' },
              { label: 'Retainer Payments', value: totals.retainers.toFixed(2), color: 'text-blue-600' },
              { label: 'Total Earnings', value: totals.total.toFixed(2), color: 'text-violet-600' },
            ].map(s => (
              <div key={s.label} className="rounded-lg border bg-muted/20 p-3 text-center">
                <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl">
            No payroll data for the selected period. Task rewards appear here when completed tasks have a Completion Reward set.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Department</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Tasks</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Task Rewards</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Retainer</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Wallet Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.userId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3 font-medium">{r.userName}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{r.deptName}</td>
                    <td className="py-2 px-3 text-right">{r.tasksCompleted}</td>
                    <td className="py-2 px-3 text-right text-emerald-600 font-semibold">{r.currency} {r.taskRewards.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-blue-600">{r.currency} {r.retainerAmount.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-violet-600 font-bold">{r.currency} {r.totalEarnings.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-amber-600">{r.currency} {r.walletBalance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="py-2 px-3" colSpan={2}>TOTAL ({rows.length} members)</td>
                  <td className="py-2 px-3 text-right">{totals.tasks}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{totals.rewards.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-blue-600">{totals.retainers.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-violet-600">{totals.total.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right text-amber-600">{totals.balance.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TaskAdmin() {
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin']);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground">This page is only accessible to admins.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-[#1D3461] flex items-center justify-center">
          <ListTodo className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#0F2041] dark:text-white">Task Administration</h1>
          <p className="text-sm text-muted-foreground">Manage recurring task templates, view department task health, and calculate payroll</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-9 text-xs">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><ListTodo className="h-3.5 w-3.5" />Task Overview</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1.5"><RepeatIcon className="h-3.5 w-3.5" />Daily Templates</TabsTrigger>
          <TabsTrigger value="payroll" className="text-xs gap-1.5"><DollarSign className="h-3.5 w-3.5" />Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <TaskOverviewPanel />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <DailyTemplatesPanel />
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          <PayrollPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
