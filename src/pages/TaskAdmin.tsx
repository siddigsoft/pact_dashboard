import { useState, useMemo } from 'react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import {
  Plus, Trash2, Edit2, Loader2, ChevronDown, ChevronUp,
  Building2, DollarSign, FileDown, ListTodo, Users,
  RepeatIcon, CheckCircle2, Circle, AlertTriangle, RefreshCw,
  XCircle, Award, Clock,
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
import { RewardDeductionsEditor, RewardBreakdownDisplay } from '@/components/tasks/RewardDeductionsEditor';
import { computeRewardBreakdown, type RewardDeduction } from '@/utils/rewardCalc';
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
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(initial?.recurrenceDays ?? []);
  const [monthlyDay, setMonthlyDay] = useState(initial?.recurrenceMonthlyDay ?? 1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(initial?.recurrenceEndDate ?? '');
  const [deptId, setDeptId] = useState(initial?.departmentId ?? '');
  const [rolesRaw, setRolesRaw] = useState((initial?.roleTargets ?? []).join(', '));
  const [rewardAmount, setRewardAmount] = useState(initial?.rewardAmount?.toString() ?? '');
  const [rewardCurrency, setRewardCurrency] = useState(initial?.rewardCurrency ?? 'USD');
  const [rewardDeductions, setRewardDeductions] = useState<RewardDeduction[]>(initial?.rewardDeductions ?? []);
  const [active, setActive] = useState(initial?.active ?? true);
  const [taskType, setTaskType] = useState<'project' | 'day_to_day' | 'general' | null>(initial?.taskType ?? null);

  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const toggleWeekday = (day: number) => {
    setSelectedWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    if (recurrence === 'specific_days' && selectedWeekdays.length === 0) return;
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      recurrence,
      recurrenceDays: recurrence === 'specific_days' ? selectedWeekdays : [],
      recurrenceMonthlyDay: recurrence === 'monthly' ? monthlyDay : null,
      recurrenceEndDate: recurrenceEndDate || null,
      departmentId: deptId || null,
      roleTargets: rolesRaw.split(',').map(r => r.trim()).filter(Boolean),
      rewardAmount: rewardAmount ? parseFloat(rewardAmount) : null,
      rewardCurrency: rewardCurrency || 'USD',
      rewardDeductions: rewardAmount ? rewardDeductions : [],
      active,
      proofRequired: false,
      taskType: taskType,
    });
  };

  const isSpecificDays = recurrence === 'specific_days';
  const isMonthly = recurrence === 'monthly';

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
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task Type</Label>
          <Select value={taskType ?? 'none'} onValueChange={v => setTaskType(v === 'none' ? null : v as 'project' | 'day_to_day' | 'general')}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              <SelectItem value="project">Project Task</SelectItem>
              <SelectItem value="day_to_day">Day-to-Day</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recurrence</Label>
          <Select value={recurrence} onValueChange={setRecurrence}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Every day</SelectItem>
              <SelectItem value="every_2_days">Every 2 days</SelectItem>
              <SelectItem value="every_3_days">Every 3 days</SelectItem>
              <SelectItem value="weekly">Weekly (Mon)</SelectItem>
              <SelectItem value="biweekly">Bi-weekly (Every 2 weeks)</SelectItem>
              <SelectItem value="specific_days">Specific weekdays</SelectItem>
              <SelectItem value="monthly">Monthly (specific day)</SelectItem>
              <SelectItem value="weekdays">Weekdays only (Mon–Fri)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Weekday selector */}
      {isSpecificDays && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select days</Label>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleWeekday(idx)}
                className={cn('w-10 h-9 rounded-lg text-xs font-semibold border transition-colors', selectedWeekdays.includes(idx) ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'bg-muted text-muted-foreground border-border hover:border-[#1D3461]/50')}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedWeekdays.length === 0 && <p className="text-[11px] text-amber-600">Select at least one day</p>}
        </div>
      )}

      {/* Monthly day picker */}
      {isMonthly && (
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Day of month</Label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={31} value={monthlyDay}
              onChange={e => setMonthlyDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-20 h-9 rounded-lg border text-sm px-3 bg-background"
            />
            <span className="text-xs text-muted-foreground">of each month</span>
          </div>
        </div>
      )}
      {/* Recurrence end date */}
      <div className="space-y-1">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ends on (optional)</Label>
        <input type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)}
          className="w-full h-9 rounded-lg border text-sm px-3 bg-background" />
        {recurrenceEndDate && (
          <button type="button" onClick={() => setRecurrenceEndDate('')} className="text-[11px] text-muted-foreground hover:text-foreground">
            ✕ Clear end date (repeat indefinitely)
          </button>
        )}
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
          <Input type="number" min="0" step="0.01" value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} placeholder="0.00" data-testid="input-template-reward" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Currency</Label>
          <Input value={rewardCurrency} onChange={e => setRewardCurrency(e.target.value)} placeholder="USD" />
        </div>
      </div>
      <RewardDeductionsEditor
        grossAmount={rewardAmount}
        currency={rewardCurrency || 'USD'}
        deductions={rewardDeductions}
        onChange={setRewardDeductions}
        compact
      />
      <p className="text-[10px] text-muted-foreground -mt-1">Deductions snapshot to each materialised daily task on creation, so changes here only affect future days.</p>
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
  const [templateSearch, setTemplateSearch] = useState('');
  const [templatePriorityFilter, setTemplatePriorityFilter] = useState<PersonalTaskPriority | 'all'>('all');
  const [templateDeptFilter, setTemplateDeptFilter] = useState('all');
  const [templateRecurrenceFilter, setTemplateRecurrenceFilter] = useState('all');
  const [templateTaskTypeFilter, setTemplateTaskTypeFilter] = useState<'project' | 'day_to_day' | 'general' | 'all'>('all');

  const filteredDefinitions = useMemo(() => {
    return definitions.filter(def => {
      const matchesSearch = !templateSearch || def.title.toLowerCase().includes(templateSearch.toLowerCase());
      const matchesPriority = templatePriorityFilter === 'all' || def.priority === templatePriorityFilter;
      const matchesDept = templateDeptFilter === 'all' || def.departmentId === templateDeptFilter;
      const matchesRecurrence = templateRecurrenceFilter === 'all' || def.recurrence === templateRecurrenceFilter;
      const matchesTaskType = templateTaskTypeFilter === 'all' || def.taskType === templateTaskTypeFilter;
      return matchesSearch && matchesPriority && matchesDept && matchesRecurrence && matchesTaskType;
    });
  }, [definitions, templateSearch, templatePriorityFilter, templateDeptFilter, templateRecurrenceFilter, templateTaskTypeFilter]);

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string } & Omit<DailyTaskDefinition, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => {
      const { id, ...rest } = data;
      const payload = {
        title: rest.title,
        description: rest.description,
        priority: rest.priority,
        recurrence: rest.recurrence,
        recurrence_days: rest.recurrenceDays ?? [],
        recurrence_monthly_day: rest.recurrenceMonthlyDay ?? null,
        department_id: rest.departmentId,
        role_targets: rest.roleTargets,
        reward_amount: rest.rewardAmount,
        reward_currency: rest.rewardCurrency,
        reward_deductions: rest.rewardDeductions ?? [],
        active: rest.active,
        proof_required: rest.proofRequired ?? false,
        task_type: rest.taskType ?? null,
        recurrence_end_date: rest.recurrenceEndDate ?? null,
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

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[160px]">
            <input
              type="text"
              placeholder="Search templates…"
              value={templateSearch}
              onChange={e => setTemplateSearch(e.target.value)}
              className="w-full h-8 pl-3 pr-3 text-xs border border-border/70 rounded-lg bg-muted/30 focus:outline-none focus:ring-1 focus:ring-[#1D3461]/40"
            />
          </div>
          <Select value={templatePriorityFilter} onValueChange={v => setTemplatePriorityFilter(v as PersonalTaskPriority | 'all')}>
            <SelectTrigger className="h-8 w-auto min-w-[110px] text-xs border-border/70 bg-muted/30">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All priorities</SelectItem>
              <SelectItem value="low" className="text-xs">Low</SelectItem>
              <SelectItem value="medium" className="text-xs">Medium</SelectItem>
              <SelectItem value="high" className="text-xs">High</SelectItem>
              <SelectItem value="critical" className="text-xs">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateDeptFilter} onValueChange={setTemplateDeptFilter}>
            <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs border-border/70 bg-muted/30">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={templateRecurrenceFilter} onValueChange={setTemplateRecurrenceFilter}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs border-border/70 bg-muted/30">
              <SelectValue placeholder="Recurrence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All recurrence</SelectItem>
              <SelectItem value="daily" className="text-xs">Daily</SelectItem>
              <SelectItem value="every_2_days" className="text-xs">Every 2 days</SelectItem>
              <SelectItem value="every_3_days" className="text-xs">Every 3 days</SelectItem>
              <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
              <SelectItem value="biweekly" className="text-xs">Bi-weekly</SelectItem>
              <SelectItem value="weekdays" className="text-xs">Mon–Fri</SelectItem>
              <SelectItem value="specific_days" className="text-xs">Specific days</SelectItem>
              <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateTaskTypeFilter} onValueChange={v => setTemplateTaskTypeFilter(v as typeof templateTaskTypeFilter)}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs border-border/70 bg-muted/30">
              <SelectValue placeholder="Task Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All types</SelectItem>
              <SelectItem value="project" className="text-xs">Project Task</SelectItem>
              <SelectItem value="day_to_day" className="text-xs">Day-to-Day</SelectItem>
              <SelectItem value="general" className="text-xs">General</SelectItem>
            </SelectContent>
          </Select>
          {(templateSearch || templatePriorityFilter !== 'all' || templateDeptFilter !== 'all' || templateRecurrenceFilter !== 'all' || templateTaskTypeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setTemplateSearch(''); setTemplatePriorityFilter('all'); setTemplateDeptFilter('all'); setTemplateRecurrenceFilter('all'); setTemplateTaskTypeFilter('all'); }}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <XCircle className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : definitions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl">
            No recurring task templates yet. Create one to automatically assign daily tasks to your team.
          </div>
        ) : filteredDefinitions.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl">
            No templates match the current filters.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDefinitions.map(def => {
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
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {def.recurrence === 'daily' ? 'Daily'
                         : def.recurrence === 'every_2_days' ? 'Every 2 days'
                         : def.recurrence === 'every_3_days' ? 'Every 3 days'
                         : def.recurrence === 'weekly' ? 'Weekly'
                         : def.recurrence === 'biweekly' ? 'Bi-weekly'
                         : def.recurrence === 'weekdays' ? 'Mon–Fri'
                         : def.recurrence === 'specific_days' ? (def.recurrenceDays?.length ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].filter((_, i) => def.recurrenceDays.includes(i)).join('+') : 'Specific days')
                         : def.recurrence === 'monthly' ? `Monthly (day ${def.recurrenceMonthlyDay ?? 1})`
                         : def.recurrence}
                      </Badge>
                      <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', PRIORITY_CFG[def.priority]?.color)}>
                        {PRIORITY_CFG[def.priority]?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                      {deptName && <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{deptName}</span>}
                      {def.roleTargets.length > 0 && <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{def.roleTargets.join(', ')}</span>}
                      {def.rewardAmount && <span className="flex items-center gap-0.5 text-emerald-600"><DollarSign className="h-3 w-3" />{def.rewardCurrency} {def.rewardAmount}</span>}
                      {def.taskType && <span className="text-[9px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{def.taskType === 'project' ? 'Project' : def.taskType === 'day_to_day' ? 'Day-to-Day' : 'General'}</span>}
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
        .eq('type', 'wallet_credit')
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

// ── Earnings Trend (last 12 weeks) ────────────────────────────────────────────
interface MonthlyEarningRow { month: string; [name: string]: string | number; }

function useEarningsTrend() {
  return useQuery({
    queryKey: ['earnings_trend_monthly_staff'],
    queryFn: async (): Promise<{ chartData: MonthlyEarningRow[]; names: string[] }> => {
      const since = format(subDays(new Date(), 92), 'yyyy-MM-dd');
      const [{ data: txns }, { data: profiles }] = await Promise.all([
        supabase
          .from('wallet_transactions')
          .select('created_at, amount, user_id, type, description')
          .in('type', ['earning', 'wallet_credit'])
          .gte('created_at', since + 'T00:00:00'),
        supabase.from('profiles').select('id, full_name'),
      ]);
      if (!txns?.length) return { chartData: [], names: [] };

      const nameMap: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? p.id.slice(0, 8); });

      // Build 3 months
      const now = new Date();
      const months: string[] = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(format(d, 'yyyy-MM'));
      }

      // Aggregate per user per month
      const userMonthMap: Record<string, Record<string, number>> = {};
      txns.forEach((t: any) => {
        const month = String(t.created_at ?? '').slice(0, 7);
        if (!months.includes(month)) return;
        const uid = t.user_id ?? 'unknown';
        if (!userMonthMap[uid]) userMonthMap[uid] = {};
        userMonthMap[uid][month] = (userMonthMap[uid][month] ?? 0) + Number(t.amount ?? 0);
      });

      // Top 8 earners by total
      const totals = Object.entries(userMonthMap).map(([uid, m]) => ({ uid, total: Object.values(m).reduce((a, b) => a + b, 0) }));
      totals.sort((a, b) => b.total - a.total);
      const top = totals.slice(0, 8).map(t => t.uid);

      const names = top.map(uid => nameMap[uid] ?? uid.slice(0, 8));

      const chartData: MonthlyEarningRow[] = months.map(month => {
        const row: MonthlyEarningRow = { month: month.slice(5) };
        top.forEach((uid, i) => {
          row[names[i]] = Math.round((userMonthMap[uid]?.[month] ?? 0) * 100) / 100;
        });
        return row;
      });

      return { chartData, names };
    },
    staleTime: 60_000,
  });
}

const STAFF_COLORS = ['#1D3461','#4f86c6','#22c55e','#f59e0b','#ef4444','#a855f7','#14b8a6','#f97316'];

function EarningsTrendChart() {
  const { data, isLoading } = useEarningsTrend();

  if (isLoading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading trend…
    </div>
  );
  if (!data?.chartData?.length || !data?.names?.length) return null;

  return (
    <div className="rounded-xl border bg-muted/10 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Staff Reward Credits — Last 3 Months (top earners)
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data.chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: any, name: string) => [v.toFixed(2), name]} />
          {data.names.map((name, i) => (
            <Bar key={name} dataKey={name} name={name} stackId="a" fill={STAFF_COLORS[i % STAFF_COLORS.length]} radius={i === data.names.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
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

        {/* Earnings trend chart */}
        <EarningsTrendChart />

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
          <h1 className="text-xl font-bold text-[#0F2041] dark:text-white">Task Administration & Payroll</h1>
          <p className="text-sm text-muted-foreground">Manage recurring task templates, view department task health, and calculate payroll</p>
        </div>
      </div>

      {/* Quick Navigation */}
      <ConnectedPagesBar exclude="task-admin" />

      <Tabs defaultValue="overview">
        <TabsList className="h-9 text-xs">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><ListTodo className="h-3.5 w-3.5" />Task Overview</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1.5"><RepeatIcon className="h-3.5 w-3.5" />Daily Templates</TabsTrigger>
          <TabsTrigger value="rewards" className="text-xs gap-1.5"><Award className="h-3.5 w-3.5" />Reward Approvals</TabsTrigger>
          <TabsTrigger value="payroll" className="text-xs gap-1.5"><DollarSign className="h-3.5 w-3.5" />Payroll</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <TaskOverviewPanel />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <DailyTemplatesPanel />
        </TabsContent>

        <TabsContent value="rewards" className="mt-4">
          <RewardApprovalsPanel />
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          <PayrollPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Reward Approvals Panel ─────────────────────────────────────────────────
interface RewardApproval {
  id: string;
  task_id: string;
  task_title: string | null;
  user_id: string;
  user_name: string | null;
  /** Gross amount stored on the approval row. The snapshot trigger does not modify this column —
   *  it remains the authoritative gross. Net = reward_amount − reward_deductions_total. */
  reward_amount: number;
  reward_currency: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
  /** Snapshot columns added by 20260425_task_reward_deductions.sql.
   *  Populated by snapshot_reward_deductions_on_approval BEFORE INSERT trigger. */
  reward_deductions_snapshot?: RewardDeduction[] | null;
  reward_deductions_total?: number | null;
  reward_net?: number | null;
}

function RewardApprovalsPanel() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const [approvals, setApprovals] = useState<RewardApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [saving, setSaving] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const query = statusFilter === 'all'
      ? supabase.from('task_reward_approvals').select('*').order('created_at', { ascending: false })
      : supabase.from('task_reward_approvals').select('*').eq('status', statusFilter).order('created_at', { ascending: false });
    const { data } = await query;
    setApprovals(data || []);
    setLoading(false);
  };

  // Load on mount
  useMemo(() => { load(); }, []);

  const review = async (id: string, status: 'approved' | 'rejected', taskId: string, userId: string, amount: number, currency: string) => {
    setSaving(id);
    try {
      const notes = reviewNotes[id] || null;
      await supabase.from('task_reward_approvals').update({ status, reviewed_by: currentUser?.id, reviewed_at: new Date().toISOString(), reviewer_notes: notes }).eq('id', id);
      if (status === 'approved') {
        try {
          await supabase.functions.invoke('credit-task-reward', { body: { task_id: taskId, user_id: userId, override_amount: amount, override_currency: currency, approval_id: id } });
        } catch { /* Edge function call, silent fail - wallet credit attempted */ }
        toast({ title: 'Reward approved', description: `${currency} ${amount} approved for credit` });
      } else {
        toast({ title: 'Reward rejected', description: 'The reward has been rejected' });
      }
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Award className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold">Reward Approval Queue</h2>
            <p className="text-xs text-muted-foreground">Review and approve task completion rewards before wallet credit</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setTimeout(load, 50); }}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Award className="h-12 w-12 mb-3 opacity-30" />
          <p className="font-medium">No {statusFilter === 'all' ? '' : statusFilter} reward approvals</p>
          <p className="text-sm mt-1">Reward approvals appear here when tasks with rewards are completed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map(a => (
            <Card key={a.id} className={cn('border', a.status === 'pending' && 'border-amber-200 dark:border-amber-800/40', a.status === 'approved' && 'border-emerald-200 dark:border-emerald-800/40', a.status === 'rejected' && 'border-red-200 dark:border-red-800/40')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{a.task_title || 'Task Completion'}</span>
                      <Badge className={cn('text-[10px]', a.status === 'pending' ? 'bg-amber-100 text-amber-700' : a.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                        {a.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                        {a.status === 'approved' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {a.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Staff: {a.user_name || a.user_id}</p>
                    {(a.reward_deductions_snapshot && a.reward_deductions_snapshot.length > 0) ? (
                      <div className="mt-1.5 max-w-md">
                        <RewardBreakdownDisplay
                          grossAmount={a.reward_amount}
                          currency={a.reward_currency}
                          deductions={a.reward_deductions_snapshot}
                          label="To credit on approval"
                        />
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-emerald-600 mt-1">{a.reward_currency} {(a.reward_net ?? a.reward_amount).toFixed(2)}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{format(new Date(a.created_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                  {a.status === 'pending' && (
                    <div className="flex flex-col gap-2 min-w-[220px]">
                      <Input
                        placeholder="Reviewer notes (optional)"
                        className="h-7 text-xs"
                        value={reviewNotes[a.id] || ''}
                        onChange={e => setReviewNotes(r => ({ ...r, [a.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving === a.id}
                          onClick={() => review(a.id, 'approved', a.task_id, a.user_id, a.reward_amount, a.reward_currency)}>
                          {saving === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}Approve
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" disabled={saving === a.id}
                          onClick={() => review(a.id, 'rejected', a.task_id, a.user_id, a.reward_amount, a.reward_currency)}>
                          <XCircle className="h-3 w-3 mr-1" />Reject
                        </Button>
                      </div>
                    </div>
                  )}
                  {a.status !== 'pending' && a.reviewer_notes && (
                    <p className="text-xs text-muted-foreground italic">{a.reviewer_notes}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
