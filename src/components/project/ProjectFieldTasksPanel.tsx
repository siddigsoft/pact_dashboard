import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Plus, X, MapPin, Calendar, User, Flag, Trash2,
  CheckCircle2, Clock, AlertTriangle, Circle, Loader2, Edit2,
  ChevronDown, Search, CheckSquare, Link2, DollarSign, Timer,
  LayoutList, Columns, CalendarDays, BarChart2, ArrowRight,
  TrendingUp, TrendingDown, Minus, ExternalLink,
  FileDown, GanttChartSquare, MessageCircle, Send, CheckCheck,
  Square,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useFieldTaskComments } from '@/hooks/useFieldTaskComments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format, parseISO, isBefore, differenceInDays, startOfWeek, isValid } from 'date-fns';
import {
  useProjectTasks,
  type FieldTask,
  type FieldTaskStatus,
  type FieldTaskPriority,
  type CreateFieldTask,
} from '@/hooks/useProjectTasks';
import type { CustomStageEntry } from '@/hooks/useProjectFlow';
import type { FlowStage } from '@/config/projectFlows';

// ── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<FieldTaskPriority, { label: string; color: string; dot: string }> = {
  low:      { label: 'Low',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         dot: 'bg-blue-500' },
  medium:   { label: 'Medium',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',     dot: 'bg-amber-500' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', dot: 'bg-orange-500' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',             dot: 'bg-red-500' },
};

const STATUS_CFG: Record<FieldTaskStatus, { label: string; color: string; border: string; colBg: string }> = {
  todo:       { label: 'To Do',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',          border: 'border-l-slate-400', colBg: 'bg-slate-50 dark:bg-slate-900/30' },
  inprogress: { label: 'In Progress', color: 'bg-[#1D3461] text-white',                                                    border: 'border-l-[#1D3461]', colBg: 'bg-blue-50 dark:bg-blue-900/10' },
  done:       { label: 'Done',        color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', border: 'border-l-emerald-500', colBg: 'bg-emerald-50 dark:bg-emerald-900/10' },
  cancelled:  { label: 'Cancelled',   color: 'bg-slate-100 text-slate-400 dark:bg-slate-800',                              border: 'border-l-slate-200', colBg: 'bg-slate-50/50 dark:bg-slate-900/20' },
};

const STATUS_ORDER: FieldTaskStatus[] = ['todo', 'inprogress', 'done', 'cancelled'];
const PRIORITY_ORDER: FieldTaskPriority[] = ['critical', 'high', 'medium', 'low'];

type ViewMode = 'list' | 'board' | 'timeline' | 'gantt';

// ── Hooks ──────────────────────────────────────────────────────────────────

function useAllProfiles() {
  return useQuery({
    queryKey: ['all_approved_profiles'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('status', 'approved')
        .order('full_name');
      return (data ?? []) as { id: string; full_name: string; role: string }[];
    },
    staleTime: 5 * 60_000,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'dd MMM yyyy') : iso;
  } catch { return iso; }
}

function isOverdue(dueDate?: string | null, status?: FieldTaskStatus) {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  try { return isBefore(parseISO(dueDate), new Date()); } catch { return false; }
}

function fmtHours(h: number | null) {
  if (h === null || h === undefined) return '—';
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

function fmtCost(c: number | null) {
  if (c === null || c === undefined) return '—';
  return `$${c.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Assignee Selector ─────────────────────────────────────────────────────

interface AssigneeSelectorProps {
  value: string | null;
  displayName: string;
  onChange: (id: string | null, name: string) => void;
}

function AssigneeSelector({ value, displayName, onChange }: AssigneeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: allProfiles = [] } = useAllProfiles();

  const filtered = useMemo(() =>
    q.trim()
      ? allProfiles.filter(p => p.full_name?.toLowerCase().includes(q.toLowerCase()))
      : allProfiles,
    [allProfiles, q],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between text-sm font-normal" type="button">
          {value ? (
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-5 w-5 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                {displayName?.charAt(0) ?? '?'}
              </span>
              <span className="truncate">{displayName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select staff member…</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Filter by name…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 text-sm pl-8"
            autoFocus
          />
        </div>
        {value && (
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-muted-foreground mb-1"
            onClick={() => { onChange(null, ''); setOpen(false); setQ(''); }}
          >
            <X className="h-3.5 w-3.5" /> Remove assignee
          </button>
        )}
        <div className="space-y-0.5 max-h-52 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">No staff found</p>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-left',
                value === p.id && 'bg-[#1D3461]/10',
              )}
              onClick={() => { onChange(p.id, p.full_name); setOpen(false); setQ(''); }}
            >
              <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {p.full_name?.charAt(0) ?? '?'}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate text-xs">{p.full_name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{p.role?.replace(/_/g, ' ')}</p>
              </div>
              {value === p.id && <CheckCircle2 className="h-3.5 w-3.5 text-[#1D3461] ml-auto flex-shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Dependency Search + Task List ──────────────────────────────────────────

interface DepSearchInputProps {
  otherTasks: FieldTask[];
  deps: string[];
  toggleDep: (id: string) => void;
}

function DepSearchInput({ otherTasks, deps, toggleDep }: DepSearchInputProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? otherTasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.assignedToName?.toLowerCase().includes(q) ||
      t.stateName?.toLowerCase().includes(q),
    ) : otherTasks;
  }, [otherTasks, search]);

  const grouped = useMemo(() => {
    const order: FieldTaskStatus[] = ['todo', 'inprogress', 'done', 'cancelled'];
    return order
      .map(s => ({ status: s, tasks: filtered.filter(t => t.status === s) }))
      .filter(g => g.tasks.length > 0);
  }, [filtered]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search tasks by name, assignee, or location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No tasks match your search</p>
      ) : (
        <div className="space-y-3 max-h-52 overflow-y-auto pr-0.5">
          {grouped.map(({ status, tasks }) => {
            const sCfg = STATUS_CFG[status];
            return (
              <div key={status}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full', sCfg.color)}>{sCfg.label}</span>
                  <span>{tasks.length}</span>
                </p>
                <div className="space-y-1">
                  {tasks.map(t => {
                    const selected = deps.includes(t.id);
                    const pCfg = PRIORITY_CFG[t.priority];
                    const overdueTask = isOverdue(t.dueDate, t.status);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleDep(t.id)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border-l-4 border border-border text-left transition-all text-sm',
                          sCfg.border,
                          selected
                            ? 'bg-[#1D3461]/5 border-[#1D3461]/40 shadow-sm'
                            : 'bg-card hover:bg-muted/40',
                        )}
                        data-testid={`dep-task-${t.id}`}
                      >
                        {/* Checkbox */}
                        <div className={cn(
                          'h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                          selected ? 'border-[#1D3461] bg-[#1D3461]' : 'border-muted-foreground/30',
                        )}>
                          {selected && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                        </div>

                        {/* Task info */}
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs font-medium truncate leading-snug', t.status === 'done' && 'line-through text-muted-foreground')}>
                            {t.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={cn('text-[9px] font-semibold px-1 py-0 rounded', pCfg.color)}>{pCfg.label}</span>
                            {t.dueDate && (
                              <span className={cn('text-[9px] flex items-center gap-0.5', overdueTask ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                                <Calendar className="h-2.5 w-2.5" />
                                {overdueTask && '⚠ '}
                                {fmtDate(t.dueDate)}
                              </span>
                            )}
                            {t.assignedToName && (
                              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                <User className="h-2.5 w-2.5" />{t.assignedToName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status icon */}
                        {t.status === 'done' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        ) : overdueTask ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" title="Overdue" />
                        ) : t.status === 'inprogress' ? (
                          <Clock className="h-3.5 w-3.5 text-[#1D3461] flex-shrink-0" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Task Form Dialog ───────────────────────────────────────────────────────

interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  initial?: FieldTask | null;
  onSave: (data: CreateFieldTask & { status: FieldTaskStatus }) => Promise<void>;
  isSaving: boolean;
  allStages: FlowStage[];
  customEntries: CustomStageEntry[];
  allTasks: FieldTask[];
}

function TaskFormDialog({ open, onClose, initial, onSave, isSaving, allStages, customEntries, allTasks }: TaskFormProps) {
  const [title,         setTitle]         = useState(initial?.title ?? '');
  const [description,   setDescription]   = useState(initial?.description ?? '');
  const [priority,      setPriority]      = useState<FieldTaskPriority>(initial?.priority ?? 'medium');
  const [status,        setStatus]        = useState<FieldTaskStatus>(initial?.status ?? 'todo');
  const [assignedTo,    setAssignedTo]    = useState<string | null>(initial?.assignedTo ?? null);
  const [assigneeName,  setAssigneeName]  = useState(initial?.assignedToName ?? '');
  const [dueDate,       setDueDate]       = useState(initial?.dueDate ?? '');
  const [startDate,     setStartDate]     = useState(initial?.startDate ?? '');
  const [stateName,     setStateName]     = useState(initial?.stateName ?? '');
  const [localityName,  setLocalityName]  = useState(initial?.localityName ?? '');
  const [stageId,       setStageId]       = useState(initial?.stageId ?? '');
  const [notes,         setNotes]         = useState(initial?.notes ?? '');
  const [estHours,      setEstHours]      = useState<string>(initial?.estimatedHours?.toString() ?? '');
  const [actHours,      setActHours]      = useState<string>(initial?.actualHours?.toString() ?? '');
  const [estCost,       setEstCost]       = useState<string>(initial?.estimatedCost?.toString() ?? '');
  const [actCost,       setActCost]       = useState<string>(initial?.actualCost?.toString() ?? '');
  const [deps,          setDeps]          = useState<string[]>(initial?.dependencies ?? []);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setDescription(initial?.description ?? '');
      setPriority(initial?.priority ?? 'medium');
      setStatus(initial?.status ?? 'todo');
      setAssignedTo(initial?.assignedTo ?? null);
      setAssigneeName(initial?.assignedToName ?? '');
      setDueDate(initial?.dueDate ?? '');
      setStartDate(initial?.startDate ?? '');
      setStateName(initial?.stateName ?? '');
      setLocalityName(initial?.localityName ?? '');
      setStageId(initial?.stageId ?? '');
      setNotes(initial?.notes ?? '');
      setEstHours(initial?.estimatedHours?.toString() ?? '');
      setActHours(initial?.actualHours?.toString() ?? '');
      setEstCost(initial?.estimatedCost?.toString() ?? '');
      setActCost(initial?.actualCost?.toString() ?? '');
      setDeps(initial?.dependencies ?? []);
    }
  }, [open, initial]);

  const isEditing = !!initial;
  const otherTasks = allTasks.filter(t => t.id !== initial?.id);

  const toggleDep = (id: string) =>
    setDeps(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      priority, status,
      assignedTo: assignedTo || null,
      dueDate: dueDate || null,
      startDate: startDate || null,
      stateName: stateName.trim() || null,
      localityName: localityName.trim() || null,
      stageId: stageId || null,
      notes: notes.trim() || undefined,
      estimatedHours: estHours ? parseFloat(estHours) : null,
      actualHours:    actHours ? parseFloat(actHours)  : null,
      estimatedCost:  estCost  ? parseFloat(estCost)   : null,
      actualCost:     actCost  ? parseFloat(actCost)   : null,
      dependencies:   deps,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-[#1D3461]" />
            {isEditing ? 'Edit Field Task' : 'New Field Task'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-4 w-full flex-shrink-0">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
            <TabsTrigger value="dependencies" className="flex items-center gap-1.5">
              Dependencies
              {deps.length > 0 && (
                <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[#1D3461] text-white text-[9px] font-bold">
                  {deps.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            {/* ── BASIC TAB ── */}
            <TabsContent value="basic" className="space-y-4 mt-0">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task Title *</Label>
                <Input placeholder="e.g. Visit 5 sites in Kassala State" value={title} onChange={e => setTitle(e.target.value)} className="h-9" autoFocus />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
                <Textarea placeholder="What needs to be done in the field…" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="resize-none text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</Label>
                  <Select value={priority} onValueChange={v => setPriority(v as FieldTaskPriority)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_ORDER.map(p => (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-full', PRIORITY_CFG[p].dot)} />
                            {PRIORITY_CFG[p].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
                  <Select value={status} onValueChange={v => setStatus(v as FieldTaskStatus)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <User className="h-3 w-3" /> Assignee
                </Label>
                <AssigneeSelector
                  value={assignedTo}
                  displayName={assigneeName}
                  onChange={(id, name) => { setAssignedTo(id); setAssigneeName(name); }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Start Date
                  </Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Due Date
                  </Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> State
                  </Label>
                  <Input placeholder="e.g. Kassala" value={stateName} onChange={e => setStateName(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Locality</Label>
                  <Input placeholder="e.g. Kassala City" value={localityName} onChange={e => setLocalityName(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>

              {allStages.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Linked Flow Stage (optional)
                  </Label>
                  <Select value={stageId || 'none'} onValueChange={v => setStageId(v === 'none' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Not linked" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked to any stage</SelectItem>
                      {allStages.map(s => {
                        const entry = customEntries.find(e => e.id === s.id);
                        return <SelectItem key={s.id} value={s.id}>{entry?.customLabel || s.label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field Notes</Label>
                <Textarea placeholder="Access instructions, contacts, risks, context…" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="resize-none text-sm" />
              </div>
            </TabsContent>

            {/* ── TIMESHEET TAB ── */}
            <TabsContent value="timesheet" className="space-y-4 mt-0">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-xs text-muted-foreground">Track estimated vs actual hours for this field task.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Timer className="h-3 w-3" /> Estimated Hours
                    </Label>
                    <Input
                      type="number" min="0" step="0.5"
                      placeholder="e.g. 8"
                      value={estHours}
                      onChange={e => setEstHours(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Actual Hours
                    </Label>
                    <Input
                      type="number" min="0" step="0.5"
                      placeholder="e.g. 10"
                      value={actHours}
                      onChange={e => setActHours(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {(estHours || actHours) && (
                  <div className="space-y-2 pt-2 border-t">
                    {estHours && actHours && (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Progress</span>
                          <span className={cn(
                            'font-semibold',
                            parseFloat(actHours) > parseFloat(estHours) ? 'text-red-600' : 'text-emerald-600',
                          )}>
                            {fmtHours(parseFloat(actHours))} / {fmtHours(parseFloat(estHours))}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, (parseFloat(actHours) / parseFloat(estHours)) * 100)}
                          className="h-2"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {parseFloat(actHours) > parseFloat(estHours)
                            ? `⚠ ${fmtHours(parseFloat(actHours) - parseFloat(estHours))} over estimate`
                            : `${fmtHours(parseFloat(estHours) - parseFloat(actHours))} remaining`}
                        </p>
                      </>
                    )}
                    {estHours && !actHours && (
                      <p className="text-xs text-muted-foreground">Estimated: {fmtHours(parseFloat(estHours))} — actual not yet logged</p>
                    )}
                    {!estHours && actHours && (
                      <p className="text-xs text-muted-foreground">Actual logged: {fmtHours(parseFloat(actHours))} — no estimate set</p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── COSTS TAB ── */}
            <TabsContent value="costs" className="space-y-4 mt-0">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-xs text-muted-foreground">Track the budget and actual spend for this task (USD).</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Estimated Cost
                    </Label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="e.g. 500"
                      value={estCost}
                      onChange={e => setEstCost(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Actual Cost
                    </Label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="e.g. 450"
                      value={actCost}
                      onChange={e => setActCost(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                {(estCost || actCost) && (
                  <div className="space-y-2 pt-2 border-t">
                    {estCost && actCost && (() => {
                      const est = parseFloat(estCost);
                      const act = parseFloat(actCost);
                      const pct = Math.min(100, (act / est) * 100);
                      const over = act > est;
                      return (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Budget usage</span>
                            <span className={cn('font-semibold', over ? 'text-red-600' : 'text-emerald-600')}>
                              {fmtCost(act)} / {fmtCost(est)}
                            </span>
                          </div>
                          <Progress value={pct} className="h-2" />
                          <div className="flex items-center gap-1 text-[11px]">
                            {over ? <TrendingUp className="h-3 w-3 text-red-500" /> : <TrendingDown className="h-3 w-3 text-emerald-500" />}
                            <span className={over ? 'text-red-600' : 'text-emerald-600'}>
                              {over ? `${fmtCost(act - est)} over budget` : `${fmtCost(est - act)} under budget`}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                    {estCost && !actCost && (
                      <p className="text-xs text-muted-foreground">Budget: {fmtCost(parseFloat(estCost))} — actual not yet recorded</p>
                    )}
                    {!estCost && actCost && (
                      <p className="text-xs text-muted-foreground">Actual spend: {fmtCost(parseFloat(actCost))} — no budget set</p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── DEPENDENCIES TAB ── */}
            <TabsContent value="dependencies" className="space-y-3 mt-0">
              {/* Header info */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-dashed">
                <Link2 className="h-3.5 w-3.5 text-[#1D3461] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Select tasks that must finish before this one can begin <span className="font-medium text-foreground">(Finish-to-Start)</span>. Dependency tracking is informational and does not block status changes.
                </p>
              </div>

              {otherTasks.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg gap-2">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No other tasks yet</p>
                  <p className="text-xs text-muted-foreground/70 text-center max-w-[220px]">
                    Create more tasks in this project and they'll appear here as dependency options.
                  </p>
                </div>
              ) : (
                <>
                  {/* Search + grouped list */}
                  <DepSearchInput otherTasks={otherTasks} deps={deps} toggleDep={toggleDep} />

                  {/* Selected tasks summary strip */}
                  {deps.length > 0 && (
                    <div className="rounded-lg border border-[#1D3461]/30 bg-[#1D3461]/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#1D3461] flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {deps.length} dependenc{deps.length === 1 ? 'y' : 'ies'} selected
                        </p>
                        <button
                          type="button"
                          onClick={() => setDeps([])}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Clear all
                        </button>
                      </div>
                      {/* Progress of selected deps */}
                      {(() => {
                        const selectedTasks = otherTasks.filter(t => deps.includes(t.id));
                        const doneCount = selectedTasks.filter(t => t.status === 'done').length;
                        const pct = deps.length > 0 ? Math.round((doneCount / deps.length) * 100) : 0;
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{doneCount} of {deps.length} completed</span>
                              <span className={cn('font-semibold', pct === 100 ? 'text-emerald-600' : 'text-amber-600')}>{pct}%</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        );
                      })()}
                      {/* Chips of selected */}
                      <div className="flex flex-wrap gap-1">
                        {otherTasks.filter(t => deps.includes(t.id)).map(t => (
                          <span key={t.id} className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                            t.status === 'done'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-[#1D3461]/10 text-[#1D3461] border-[#1D3461]/30 dark:text-blue-300',
                          )}>
                            {t.status === 'done' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                            <span className="max-w-[120px] truncate">{t.title}</span>
                            <button type="button" onClick={() => toggleDep(t.id)} className="hover:text-destructive ml-0.5">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="pt-3 gap-2 flex-shrink-0 border-t">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving || !title.trim()}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
          >
            {isSaving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              : isEditing ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Task Detail Dialog ────────────────────────────────────────────────────

interface TaskDetailProps {
  task: FieldTask | null;
  allTasks: FieldTask[];
  allStages: FlowStage[];
  customEntries: CustomStageEntry[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: FieldTaskStatus) => void;
}

function TaskDetailDialog({ task, allTasks, allStages, customEntries, canEdit, onClose, onEdit, onDelete, onStatusChange, currentUserId, currentUserName }: TaskDetailProps & { currentUserId?: string; currentUserName?: string }) {
  if (!task) return null;
  const overdue = isOverdue(task.dueDate, task.status);
  const sCfg = STATUS_CFG[task.status];
  const pCfg = PRIORITY_CFG[task.priority];
  const linkedStage = allStages.find(s => s.id === task.stageId);
  const linkedStageLabel = linkedStage
    ? (customEntries.find(e => e.id === linkedStage.id)?.customLabel || linkedStage.label)
    : null;

  const depTasks = allTasks.filter(t => task.dependencies.includes(t.id));
  const blockingTasks = allTasks.filter(t => t.dependencies.includes(task.id));

  const hoursUsedPct = task.estimatedHours && task.actualHours
    ? Math.min(100, (task.actualHours / task.estimatedHours) * 100) : null;
  const costUsedPct = task.estimatedCost && task.actualCost
    ? Math.min(100, (task.actualCost / task.estimatedCost) * 100) : null;

  const { comments, loading: commentsLoading, submitting: commentSubmitting, addComment, deleteComment } =
    useFieldTaskComments(task.id);
  const [commentText, setCommentText] = useState('');

  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !currentUserId) return;
    const ok = await addComment(commentText, currentUserId, currentUserName ?? 'Unknown');
    if (ok) setCommentText('');
  };

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-base leading-tight pr-8">{task.title}</DialogTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', sCfg.color)}>{sCfg.label}</span>
            <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', pCfg.color)}>{pCfg.label}</span>
            {overdue && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>}
            {task.dependencies.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Depends on {task.dependencies.length}
              </span>
            )}
            {blockingTasks.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                Blocking {blockingTasks.length}
              </span>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden mt-2">
          <TabsList className="grid grid-cols-5 w-full flex-shrink-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timesheet">
              Timesheet
              {(task.estimatedHours || task.actualHours) && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-blue-500" />}
            </TabsTrigger>
            <TabsTrigger value="costs">
              Costs
              {(task.estimatedCost || task.actualCost) && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="dependencies">
              Deps
              {(depTasks.length > 0 || blockingTasks.length > 0) && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </TabsTrigger>
            <TabsTrigger value="comments">
              <MessageCircle className="h-3 w-3 mr-1" />
              {comments.length > 0 && <span className="text-[10px]">{comments.length}</span>}
              {comments.length === 0 && 'Chat'}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4 pr-1 space-y-4">
            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              {task.description && (
                <div className="rounded-lg bg-muted/30 px-4 py-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {task.assignedToName && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Assignee</p>
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[9px] font-bold">
                        {task.assignedToName.charAt(0)}
                      </div>
                      <span className="text-xs font-medium">{task.assignedToName}</span>
                      {task.assignedToRole && <span className="text-[10px] text-muted-foreground capitalize">({task.assignedToRole.replace(/_/g,' ')})</span>}
                    </div>
                  </div>
                )}
                {task.createdByName && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Created by</p>
                    <p className="text-xs">{task.createdByName}</p>
                  </div>
                )}
                {task.startDate && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Start Date</p>
                    <p className="text-xs">{fmtDate(task.startDate)}</p>
                  </div>
                )}
                {task.dueDate && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Due Date</p>
                    <p className={cn('text-xs font-medium', overdue ? 'text-red-600' : '')}>
                      {fmtDate(task.dueDate)}
                      {overdue && ` (${differenceInDays(new Date(), parseISO(task.dueDate))}d overdue)`}
                    </p>
                  </div>
                )}
                {(task.stateName || task.localityName) && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Location</p>
                    <p className="text-xs flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {[task.stateName, task.localityName].filter(Boolean).join(' — ')}
                    </p>
                  </div>
                )}
                {linkedStageLabel && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Linked Flow Stage</p>
                    <p className="text-xs flex items-center gap-1">
                      <Link2 className="h-3 w-3 text-muted-foreground" /> {linkedStageLabel}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Created</p>
                  <p className="text-xs">{fmtDate(task.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Last Updated</p>
                  <p className="text-xs">{fmtDate(task.updatedAt)}</p>
                </div>
              </div>

              {task.notes && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 px-4 py-3">
                  <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Field Notes</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{task.notes}</p>
                </div>
              )}

              {canEdit && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Change Status</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onStatusChange(s)}
                        className={cn(
                          'text-[10px] font-semibold px-3 py-1 rounded-full border transition-all',
                          task.status === s
                            ? cn(sCfg.color, 'ring-2 ring-[#1D3461]/30')
                            : 'border-border hover:border-[#1D3461]/40 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {STATUS_CFG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── TIMESHEET ── */}
            <TabsContent value="timesheet" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 text-center space-y-1">
                  <Timer className="h-5 w-5 text-blue-500 mx-auto" />
                  <p className="text-2xl font-bold text-foreground">{fmtHours(task.estimatedHours)}</p>
                  <p className="text-xs text-muted-foreground">Estimated Hours</p>
                </div>
                <div className="rounded-lg border p-4 text-center space-y-1">
                  <Clock className="h-5 w-5 text-[#1D3461] mx-auto" />
                  <p className="text-2xl font-bold text-foreground">{fmtHours(task.actualHours)}</p>
                  <p className="text-xs text-muted-foreground">Actual Hours</p>
                </div>
              </div>
              {hoursUsedPct !== null && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Time usage</span>
                    <span className={cn('font-semibold', (task.actualHours ?? 0) > (task.estimatedHours ?? 0) ? 'text-red-600' : 'text-emerald-600')}>
                      {hoursUsedPct.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={hoursUsedPct} className="h-3" />
                  <div className="flex items-center gap-1.5 text-xs">
                    {(task.actualHours ?? 0) > (task.estimatedHours ?? 0)
                      ? <><TrendingUp className="h-3.5 w-3.5 text-red-500" /><span className="text-red-600">{fmtHours((task.actualHours ?? 0) - (task.estimatedHours ?? 0))} over estimate</span></>
                      : <><TrendingDown className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600">{fmtHours((task.estimatedHours ?? 0) - (task.actualHours ?? 0))} remaining</span></>
                    }
                  </div>
                </div>
              )}
              {!task.estimatedHours && !task.actualHours && (
                <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
                  No timesheet data. Edit the task to add estimated or actual hours.
                </p>
              )}
            </TabsContent>

            {/* ── COSTS ── */}
            <TabsContent value="costs" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 text-center space-y-1">
                  <BarChart2 className="h-5 w-5 text-slate-400 mx-auto" />
                  <p className="text-2xl font-bold text-foreground">{fmtCost(task.estimatedCost)}</p>
                  <p className="text-xs text-muted-foreground">Budget (Estimated)</p>
                </div>
                <div className="rounded-lg border p-4 text-center space-y-1">
                  <DollarSign className="h-5 w-5 text-emerald-500 mx-auto" />
                  <p className="text-2xl font-bold text-foreground">{fmtCost(task.actualCost)}</p>
                  <p className="text-xs text-muted-foreground">Actual Spend</p>
                </div>
              </div>
              {costUsedPct !== null && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Budget usage</span>
                    <span className={cn('font-semibold', (task.actualCost ?? 0) > (task.estimatedCost ?? 0) ? 'text-red-600' : 'text-emerald-600')}>
                      {costUsedPct.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={costUsedPct} className="h-3" />
                  <div className="flex items-center gap-1.5 text-xs">
                    {(task.actualCost ?? 0) > (task.estimatedCost ?? 0)
                      ? <><TrendingUp className="h-3.5 w-3.5 text-red-500" /><span className="text-red-600">{fmtCost((task.actualCost ?? 0) - (task.estimatedCost ?? 0))} over budget</span></>
                      : <><TrendingDown className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-600">{fmtCost((task.estimatedCost ?? 0) - (task.actualCost ?? 0))} remaining</span></>
                    }
                  </div>
                </div>
              )}
              {!task.estimatedCost && !task.actualCost && (
                <p className="text-sm text-muted-foreground text-center py-8 border rounded-lg">
                  No cost data. Edit the task to add budget or actual spend.
                </p>
              )}
            </TabsContent>

            {/* ── COMMENTS ── */}
            <TabsContent value="comments" className="flex flex-col gap-3 mt-0 h-full">
              {commentsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                  <MessageCircle className="h-7 w-7 opacity-30" />
                  <p className="text-sm">No comments yet. Start the conversation.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2.5 group">
                      <div className="h-7 w-7 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                        {c.author_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{c.author_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(c.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{c.body}</p>
                      </div>
                      {(currentUserId === c.author_id || canEdit) && (
                        <button
                          type="button"
                          onClick={() => deleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-all flex-shrink-0 mt-0.5"
                          title="Delete comment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {currentUserId && (
                <div className="flex gap-2 pt-2 border-t mt-auto">
                  <Textarea
                    placeholder="Write a comment… (Ctrl+Enter to send)"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleCommentSubmit(); } }}
                    className="text-xs resize-none min-h-[60px] flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={!commentText.trim() || commentSubmitting}
                    onClick={handleCommentSubmit}
                    className="bg-[#1D3461] hover:bg-[#0F2041] text-white self-end h-8 px-3"
                  >
                    {commentSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── DEPENDENCIES ── */}
            <TabsContent value="dependencies" className="space-y-4 mt-0">
              {/* Health summary banner */}
              {depTasks.length > 0 && (() => {
                const doneCount = depTasks.filter(t => t.status === 'done').length;
                const overdueCount = depTasks.filter(t => isOverdue(t.dueDate, t.status)).length;
                const pct = Math.round((doneCount / depTasks.length) * 100);
                const allClear = doneCount === depTasks.length;
                return (
                  <div className={cn(
                    'rounded-lg border p-3 space-y-2',
                    allClear
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                      : overdueCount > 0
                      ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900'
                      : 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900',
                  )}>
                    <div className="flex items-center justify-between">
                      <p className={cn('text-xs font-semibold flex items-center gap-1',
                        allClear ? 'text-emerald-700 dark:text-emerald-300' : overdueCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300',
                      )}>
                        {allClear
                          ? <><CheckCircle2 className="h-3.5 w-3.5" /> All prerequisites complete</>
                          : overdueCount > 0
                          ? <><AlertTriangle className="h-3.5 w-3.5" /> {overdueCount} overdue prerequisite{overdueCount !== 1 ? 's' : ''}</>
                          : <><Clock className="h-3.5 w-3.5" /> {depTasks.length - doneCount} prerequisite{depTasks.length - doneCount !== 1 ? 's' : ''} pending</>}
                      </p>
                      <span className={cn('text-xs font-bold', allClear ? 'text-emerald-600' : 'text-amber-600')}>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">{doneCount} of {depTasks.length} completed</p>
                  </div>
                );
              })()}

              {/* "Depends on" section */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <ArrowRight className="h-3.5 w-3.5" />
                  Prerequisites — this task depends on ({depTasks.length})
                </p>
                {depTasks.length === 0 ? (
                  <div className="flex flex-col items-center py-5 border-2 border-dashed rounded-lg gap-1">
                    <Link2 className="h-4 w-4 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No prerequisites set</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {depTasks.map(t => {
                      const pCfg = PRIORITY_CFG[t.priority];
                      const overdueTask = isOverdue(t.dueDate, t.status);
                      return (
                        <div key={t.id} className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-l-4 text-sm',
                          STATUS_CFG[t.status].colBg,
                          STATUS_CFG[t.status].border,
                          overdueTask && t.status !== 'done' && 'border-red-200 border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
                        )}>
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-xs font-medium truncate', t.status === 'done' && 'line-through text-muted-foreground')}>{t.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_CFG[t.status].color)}>{STATUS_CFG[t.status].label}</span>
                              <span className={cn('text-[9px] font-semibold px-1 rounded', pCfg.color)}>{pCfg.label}</span>
                              {t.dueDate && (
                                <span className={cn('text-[9px] flex items-center gap-0.5', overdueTask && t.status !== 'done' ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                                  <Calendar className="h-2.5 w-2.5" />
                                  {overdueTask && t.status !== 'done' ? '⚠ ' : ''}{fmtDate(t.dueDate)}
                                </span>
                              )}
                              {t.assignedToName && (
                                <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                  <User className="h-2.5 w-2.5" />{t.assignedToName}
                                </span>
                              )}
                            </div>
                          </div>
                          {t.status === 'done' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          ) : overdueTask ? (
                            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          ) : t.status === 'inprogress' ? (
                            <Clock className="h-4 w-4 text-[#1D3461] flex-shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* "Blocks" section */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Blocks — tasks waiting on this ({blockingTasks.length})
                </p>
                {blockingTasks.length === 0 ? (
                  <div className="flex items-center justify-center py-4 border-2 border-dashed rounded-lg">
                    <p className="text-xs text-muted-foreground">No tasks are waiting on this one</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {blockingTasks.map(t => {
                      const thisIsDone = task.status === 'done';
                      return (
                        <div key={t.id} className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-l-4 text-sm',
                          STATUS_CFG[t.status].colBg,
                          STATUS_CFG[t.status].border,
                        )}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{t.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_CFG[t.status].color)}>{STATUS_CFG[t.status].label}</span>
                              {t.assignedToName && <span className="text-[9px] text-muted-foreground flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{t.assignedToName}</span>}
                            </div>
                          </div>
                          {!thisIsDone && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full px-1.5 py-0.5 font-medium flex-shrink-0">
                              Waiting
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {canEdit && (
          <DialogFooter className="pt-3 gap-2 flex-shrink-0 border-t">
            <Button variant="outline" size="sm" onClick={onDelete} className="text-red-600 hover:text-red-700 mr-auto">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" onClick={onEdit} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
              <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit Task
            </Button>
          </DialogFooter>
        )}
        {!canEdit && (
          <DialogFooter className="pt-3 flex-shrink-0 border-t">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: FieldTask;
  allTasks: FieldTask[];
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: FieldTaskStatus) => void;
}

function TaskCard({ task, allTasks, canEdit, onOpen, onEdit, onDelete, onStatusChange }: TaskCardProps) {
  const overdue = isOverdue(task.dueDate, task.status);
  const sCfg = STATUS_CFG[task.status];
  const pCfg = PRIORITY_CFG[task.priority];
  const depCount = task.dependencies.length;
  const blockingCount = allTasks.filter(t => t.dependencies.includes(task.id)).length;
  const hasHours = task.estimatedHours || task.actualHours;
  const hasCost  = task.estimatedCost  || task.actualCost;

  return (
    <div
      className={cn(
        'group rounded-lg border-l-4 border border-border bg-card hover:shadow-md transition-all duration-150 cursor-pointer',
        sCfg.border,
        task.status === 'cancelled' && 'opacity-60',
      )}
      onClick={onOpen}
    >
      <div className="px-3 py-2.5 space-y-2">
        {/* Title row */}
        <div className="flex items-start gap-2 justify-between">
          <p className={cn('text-xs font-semibold leading-snug flex-1 min-w-0', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </p>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button type="button" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5 rounded transition-opacity flex-shrink-0">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {STATUS_ORDER.map(s => (
                  <DropdownMenuItem key={s} onClick={e => { e.stopPropagation(); onStatusChange(s); }}
                    className={cn(task.status === s && 'font-semibold')}>
                    → {STATUS_CFG[s].label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>
                  <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onDelete(); }} className="text-red-600 focus:text-red-600">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', pCfg.color)}>{pCfg.label}</span>
          {overdue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>}
          {depCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Deps: {depCount}
            </span>
          )}
          {blockingCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              Blocking: {blockingCount}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
          {task.assignedToName && (
            <span className="flex items-center gap-1">
              <div className="h-4 w-4 rounded-full bg-[#1D3461]/20 text-[#1D3461] flex items-center justify-center text-[8px] font-bold">
                {task.assignedToName.charAt(0)}
              </div>
              {task.assignedToName}
            </span>
          )}
          {task.dueDate && (
            <span className={cn('flex items-center gap-0.5', overdue ? 'text-red-600 font-semibold' : '')}>
              <Calendar className="h-2.5 w-2.5" /> {fmtDate(task.dueDate)}
            </span>
          )}
          {(task.stateName || task.localityName) && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5" />
              {[task.stateName, task.localityName].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        {/* Timesheet / Cost mini bars */}
        {(hasHours || hasCost) && (
          <div className="flex gap-3 pt-1 border-t border-border/50">
            {hasHours && task.estimatedHours && task.actualHours && (
              <div className="flex-1 space-y-0.5">
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" /> Time</span>
                  <span>{fmtHours(task.actualHours)}/{fmtHours(task.estimatedHours)}</span>
                </div>
                <Progress value={Math.min(100, (task.actualHours / task.estimatedHours) * 100)} className="h-1" />
              </div>
            )}
            {hasCost && task.estimatedCost && task.actualCost && (
              <div className="flex-1 space-y-0.5">
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><DollarSign className="h-2.5 w-2.5" /> Cost</span>
                  <span>{fmtCost(task.actualCost)}/{fmtCost(task.estimatedCost)}</span>
                </div>
                <Progress value={Math.min(100, (task.actualCost / task.estimatedCost) * 100)} className="h-1" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Views ──────────────────────────────────────────────────────────────────

function ListView({ tasks, allTasks, canEdit, onOpen, onEdit, onDelete, onStatusChange, bulkMode = false, selectedIds, onToggleSelect }: {
  tasks: FieldTask[];
  allTasks: FieldTask[];
  canEdit: boolean;
  onOpen: (t: FieldTask) => void;
  onEdit: (t: FieldTask) => void;
  onDelete: (t: FieldTask) => void;
  onStatusChange: (t: FieldTask, s: FieldTaskStatus) => void;
  bulkMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  if (tasks.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <CheckSquare className="h-8 w-8 opacity-30" />
      <p className="text-sm">No tasks match your filters</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {tasks.map(t => (
        <div key={t.id} className={cn('flex items-start gap-2', bulkMode && 'cursor-pointer')}>
          {bulkMode && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggleSelect?.(t.id); }}
              className="mt-2.5 flex-shrink-0 text-muted-foreground hover:text-[#1D3461] transition-colors"
            >
              {selectedIds?.has(t.id)
                ? <CheckSquare className="h-4 w-4 text-[#1D3461]" />
                : <Square className="h-4 w-4" />
              }
            </button>
          )}
          <div className={cn('flex-1 min-w-0', bulkMode && selectedIds?.has(t.id) && 'ring-2 ring-[#1D3461]/30 rounded-lg')}>
            <TaskCard task={t} allTasks={allTasks} canEdit={canEdit && !bulkMode}
              onOpen={() => onOpen(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)}
              onStatusChange={s => onStatusChange(t, s)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardView({ tasks, allTasks, canEdit, onOpen, onEdit, onDelete, onStatusChange }: {
  tasks: FieldTask[];
  allTasks: FieldTask[];
  canEdit: boolean;
  onOpen: (t: FieldTask) => void;
  onEdit: (t: FieldTask) => void;
  onDelete: (t: FieldTask) => void;
  onStatusChange: (t: FieldTask, s: FieldTaskStatus) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<FieldTaskStatus | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragEnd = () => { setDraggingId(null); setOverCol(null); };
  const handleDragOver = (e: React.DragEvent, status: FieldTaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverCol(status);
  };
  const handleDrop = (e: React.DragEvent, status: FieldTaskStatus) => {
    e.preventDefault();
    if (!draggingId) return;
    const task = tasks.find(t => t.id === draggingId);
    if (task && task.status !== status) onStatusChange(task, status);
    setDraggingId(null);
    setOverCol(null);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[300px]">
      {STATUS_ORDER.map(status => {
        const col = tasks.filter(t => t.status === status);
        const cfg = STATUS_CFG[status];
        const isOver = overCol === status;
        return (
          <div
            key={status}
            className={cn('flex-shrink-0 w-64 flex flex-col gap-2 rounded-xl transition-all', isOver && 'ring-2 ring-[#1D3461]/40 bg-[#1D3461]/5')}
            onDragOver={e => handleDragOver(e, status)}
            onDragLeave={() => setOverCol(null)}
            onDrop={e => handleDrop(e, status)}
          >
            <div className={cn('rounded-lg px-3 py-2 flex items-center justify-between', cfg.colBg, 'border border-border/50')}>
              <span className="text-xs font-semibold">{cfg.label}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{col.length}</Badge>
            </div>
            <div className="space-y-2 flex-1">
              {col.map(t => (
                <div
                  key={t.id}
                  draggable={canEdit}
                  onDragStart={e => handleDragStart(e, t.id)}
                  onDragEnd={handleDragEnd}
                  className={cn('transition-opacity', draggingId === t.id && 'opacity-40')}
                >
                  <TaskCard task={t} allTasks={allTasks} canEdit={canEdit}
                    onOpen={() => onOpen(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)}
                    onStatusChange={s => onStatusChange(t, s)} />
                </div>
              ))}
              {col.length === 0 && (
                <div className={cn('border-2 border-dashed rounded-lg h-20 flex items-center justify-center transition-all', isOver ? 'border-[#1D3461] bg-[#1D3461]/10' : 'border-border')}>
                  <p className="text-[10px] text-muted-foreground">{isOver ? 'Drop here' : 'Empty'}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({ tasks, allTasks, canEdit, onOpen, onEdit, onDelete, onStatusChange }: {
  tasks: FieldTask[];
  allTasks: FieldTask[];
  canEdit: boolean;
  onOpen: (t: FieldTask) => void;
  onEdit: (t: FieldTask) => void;
  onDelete: (t: FieldTask) => void;
  onStatusChange: (t: FieldTask, s: FieldTaskStatus) => void;
}) {
  const sorted = [...tasks]
    .filter(t => t.dueDate || t.startDate)
    .sort((a, b) => {
      const da = a.dueDate || a.startDate || '';
      const db = b.dueDate || b.startDate || '';
      return da.localeCompare(db);
    });
  const undated = tasks.filter(t => !t.dueDate && !t.startDate);

  // Group by week
  const grouped = useMemo(() => {
    const weeks = new Map<string, FieldTask[]>();
    sorted.forEach(t => {
      const dateStr = t.dueDate || t.startDate!;
      try {
        const weekKey = format(startOfWeek(parseISO(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        if (!weeks.has(weekKey)) weeks.set(weekKey, []);
        weeks.get(weekKey)!.push(t);
      } catch { /* skip */ }
    });
    return Array.from(weeks.entries()).map(([week, wTasks]) => ({
      week,
      label: `Week of ${format(parseISO(week), 'dd MMM yyyy')}`,
      tasks: wTasks,
    }));
  }, [sorted]);

  if (sorted.length === 0 && undated.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <CalendarDays className="h-8 w-8 opacity-30" />
      <p className="text-sm">No tasks match your filters</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {grouped.map(({ week, label, tasks: wTasks }) => (
        <div key={week} className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-[#1D3461]" />
            <span className="text-xs font-semibold text-[#1D3461]">{label}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-2 pl-5">
            {wTasks.map(t => (
              <TaskCard key={t.id} task={t} allTasks={allTasks} canEdit={canEdit}
                onOpen={() => onOpen(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)}
                onStatusChange={s => onStatusChange(t, s)} />
            ))}
          </div>
        </div>
      ))}
      {undated.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">No date set ({undated.length})</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-2 pl-5">
            {undated.map(t => (
              <TaskCard key={t.id} task={t} allTasks={allTasks} canEdit={canEdit}
                onOpen={() => onOpen(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)}
                onStatusChange={s => onStatusChange(t, s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gantt View ─────────────────────────────────────────────────────────────

const GANTT_STATUS_COLORS: Record<FieldTaskStatus, string> = {
  todo:       'bg-slate-400',
  inprogress: 'bg-[#1D3461]',
  done:       'bg-emerald-500',
  cancelled:  'bg-slate-300',
};

function GanttView({ tasks, onOpen }: {
  tasks: FieldTask[];
  onOpen: (t: FieldTask) => void;
}) {
  const dated = tasks.filter(t => t.startDate || t.dueDate);
  const undated = tasks.filter(t => !t.startDate && !t.dueDate);

  if (dated.length === 0 && undated.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <GanttChartSquare className="h-8 w-8 opacity-30" />
      <p className="text-sm">No tasks match your filters</p>
    </div>
  );
  if (dated.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <GanttChartSquare className="h-8 w-8 opacity-30" />
      <p className="text-sm">Add start or due dates to tasks to see the Gantt chart.</p>
    </div>
  );

  const allDates = dated.flatMap(t => [t.startDate, t.dueDate].filter(Boolean) as string[]);
  const minDate = new Date(allDates.reduce((a, b) => a < b ? a : b));
  const maxDate = new Date(allDates.reduce((a, b) => a > b ? a : b));
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000)) + 2;

  const getOffset = (dateStr: string) =>
    Math.max(0, Math.ceil((new Date(dateStr).getTime() - minDate.getTime()) / 86400000));
  const getWidth = (start: string, end: string) =>
    Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));

  const sorted = [...dated].sort((a, b) => {
    const da = a.startDate || a.dueDate || '';
    const db = b.startDate || b.dueDate || '';
    return da.localeCompare(db);
  });

  const monthTicks: { label: string; pct: number }[] = [];
  const d = new Date(minDate);
  d.setDate(1);
  while (d <= maxDate) {
    const offset = Math.ceil((d.getTime() - minDate.getTime()) / 86400000);
    monthTicks.push({ label: format(d, 'MMM d'), pct: (offset / totalDays) * 100 });
    d.setMonth(d.getMonth() + 1);
  }

  return (
    <div className="space-y-2 overflow-x-auto">
      {/* Month header */}
      <div className="relative h-5 ml-44 mr-2">
        {monthTicks.map(tick => (
          <span
            key={tick.label}
            className="absolute text-[9px] text-muted-foreground transform -translate-x-1/2"
            style={{ left: `${tick.pct}%` }}
          >{tick.label}</span>
        ))}
      </div>
      <div className="relative ml-44 mr-2 h-px bg-border mb-1" />

      {/* Today line */}
      {(() => {
        const todayOffset = Math.ceil((Date.now() - minDate.getTime()) / 86400000);
        const todayPct = (todayOffset / totalDays) * 100;
        if (todayPct < 0 || todayPct > 100) return null;
        return (
          <div
            className="absolute top-5 bottom-0 w-px bg-red-500/60 z-10 pointer-events-none ml-44"
            style={{ left: `calc(${todayPct}% + 11rem)` }}
            title="Today"
          />
        );
      })()}

      {/* Task rows */}
      <div className="space-y-1.5">
        {sorted.map(t => {
          const start = t.startDate || t.dueDate!;
          const end   = t.dueDate   || t.startDate!;
          const startOff = getOffset(start);
          const widthDays = start === end ? 1 : getWidth(start, end);
          const leftPct  = (startOff / totalDays) * 100;
          const widthPct = Math.max(0.5, (widthDays / totalDays) * 100);
          const barColor = GANTT_STATUS_COLORS[t.status];
          const overdue  = isOverdue(t.dueDate, t.status);
          return (
            <div key={t.id} className="flex items-center gap-2 group cursor-pointer" onClick={() => onOpen(t)}>
              {/* Label */}
              <div className="w-44 flex-shrink-0 pr-2">
                <p className={cn('text-xs font-medium truncate leading-tight', t.status === 'done' && 'line-through text-muted-foreground')}>{t.title}</p>
                <p className="text-[9px] text-muted-foreground">{STATUS_CFG[t.status].label}{overdue ? ' · Overdue' : ''}</p>
              </div>
              {/* Bar track */}
              <div className="flex-1 relative h-6 min-w-[200px]">
                <div className="absolute inset-y-0 rounded-full" style={{ left: `${leftPct}%`, width: `${widthPct}%` }}>
                  <div className={cn('h-full rounded-full opacity-90 group-hover:opacity-100 transition-opacity flex items-center px-2', barColor)}>
                    {widthPct > 8 && (
                      <span className="text-[9px] text-white font-medium truncate">
                        {t.assignedToName || ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t mt-3">
        {STATUS_ORDER.map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={cn('h-2.5 w-2.5 rounded-full', GANTT_STATUS_COLORS[s])} />
            <span className="text-[10px] text-muted-foreground">{STATUS_CFG[s].label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="h-2.5 w-px bg-red-500/60" />
          <span className="text-[10px] text-muted-foreground">Today</span>
        </div>
      </div>
    </div>
  );
}

// ── Team Health Strip ───────────────────────────────────────────────────────

interface TeamHealthStripProps {
  tasks: FieldTask[];
  activeMemberId: string | null;
  onMemberClick: (id: string | null) => void;
}

function TeamHealthStrip({ tasks, activeMemberId, onMemberClick }: TeamHealthStripProps) {
  const byMember = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; done: number; inprogress: number; overdue: number }>();
    tasks.forEach(t => {
      if (!t.assignedTo) return;
      const entry = map.get(t.assignedTo) ?? { id: t.assignedTo, name: t.assignedToName ?? 'Unknown', total: 0, done: 0, inprogress: 0, overdue: 0 };
      entry.total++;
      if (t.status === 'done') entry.done++;
      else if (t.status === 'inprogress') entry.inprogress++;
      if (isOverdue(t.dueDate, t.status)) entry.overdue++;
      map.set(t.assignedTo, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [tasks]);

  const total = tasks.length;
  const done  = tasks.filter(t => t.status === 'done').length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue = tasks.filter(t => isOverdue(t.dueDate, t.status)).length;

  if (byMember.length === 0 && total === 0) return null;

  return (
    <div className="rounded-xl border bg-gradient-to-r from-[#0F2041]/5 to-[#1D3461]/3 dark:from-[#0F2041]/30 dark:to-[#1D3461]/20 p-3.5 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#1D3461]" />
          <span className="text-xs font-semibold text-[#1D3461] dark:text-blue-300 uppercase tracking-wide">Project Task Health</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="font-bold text-foreground">{pct}% complete</span>
          <span className="text-muted-foreground">{done}/{total} tasks</span>
          {overdue > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-semibold">
              <AlertTriangle className="h-3 w-3" /> {overdue} overdue
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={pct} className="h-1.5" />

      {/* Member chips */}
      {byMember.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {byMember.map(m => {
            const mPct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
            const isActive = activeMemberId === m.id;
            const chipColor = m.overdue > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : mPct === 100 ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : mPct > 50 ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20' : 'border-border bg-card';
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onMemberClick(isActive ? null : m.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all hover:shadow-sm',
                  chipColor,
                  isActive && 'ring-2 ring-[#1D3461] ring-offset-1',
                )}
                title={`${m.name} — ${mPct}% complete${m.overdue > 0 ? ` · ${m.overdue} overdue` : ''}`}
              >
                <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] font-semibold truncate max-w-[80px]">{m.name.split(' ')[0]}</p>
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-[#1D3461]" style={{ width: `${mPct}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground font-medium">{mPct}%</span>
                  </div>
                </div>
                {m.overdue > 0 && <span className="h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">{m.overdue}</span>}
                {m.inprogress > 0 && m.overdue === 0 && <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#1D3461] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">{m.inprogress}</span>}
              </button>
            );
          })}
          {activeMemberId && (
            <button type="button" onClick={() => onMemberClick(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-2 py-1">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  projectName: string;
  currentUserId?: string;
  currentUserName?: string;
  canEdit: boolean;
  allStages: FlowStage[];
  customEntries: CustomStageEntry[];
}

export function ProjectFieldTasksPanel({
  projectId, projectName, currentUserId, currentUserName = 'A manager', canEdit, allStages, customEntries,
}: Props) {
  const { toast } = useToast();
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating, isUpdating } =
    useProjectTasks(projectId);

  const [viewMode,       setViewMode]       = useState<ViewMode>('list');
  const [formOpen,       setFormOpen]       = useState(false);
  const [editTask,       setEditTask]       = useState<FieldTask | null>(null);
  const [detailTask,     setDetailTask]     = useState<FieldTask | null>(null);
  const [search,         setSearch]         = useState('');
  const [filterStatus,   setFilterStatus]   = useState<FieldTaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<FieldTaskPriority | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'mine'>('all');
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return tasks
      .filter(t => {
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (filterAssignee === 'mine' && t.assignedTo !== currentUserId) return false;
        if (filterMemberId && t.assignedTo !== filterMemberId) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return t.title.toLowerCase().includes(q) ||
            (t.description ?? '').toLowerCase().includes(q) ||
            (t.stateName ?? '').toLowerCase().includes(q) ||
            (t.assignedToName ?? '').toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        const pa = PRIORITY_ORDER.indexOf(a.priority);
        const pb = PRIORITY_ORDER.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, filterStatus, filterPriority, filterAssignee, filterMemberId, search, currentUserId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todo: 0, inprogress: 0, done: 0, cancelled: 0 };
    tasks.forEach(t => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [tasks]);

  // Summary numbers
  const totalEstHours = tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const totalActHours = tasks.reduce((s, t) => s + (t.actualHours ?? 0), 0);
  const totalEstCost  = tasks.reduce((s, t) => s + (t.estimatedCost ?? 0), 0);
  const totalActCost  = tasks.reduce((s, t) => s + (t.actualCost ?? 0), 0);
  const hasTimesheetData = tasks.some(t => t.estimatedHours || t.actualHours);
  const hasCostData      = tasks.some(t => t.estimatedCost  || t.actualCost);

  const handleCreate = async (data: CreateFieldTask & { status: FieldTaskStatus }) => {
    if (!currentUserId) return;
    try {
      await createTask(data, currentUserId, projectName, currentUserName);
      toast({ title: 'Field task created' });
      setFormOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to create task', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = async (data: CreateFieldTask & { status: FieldTaskStatus }) => {
    if (!editTask) return;
    try {
      await updateTask(editTask.id, data, {
        currentUserId, projectName, currentUserName, prevAssignee: editTask.assignedTo,
      });
      toast({ title: 'Task updated' });
      setEditTask(null);
      setDetailTask(null);
    } catch (err: any) {
      toast({ title: 'Failed to update task', description: err.message, variant: 'destructive' });
    }
  };

  const handleStatusChange = async (task: FieldTask, status: FieldTaskStatus) => {
    try {
      await updateTask(task.id, { status }, { currentUserId });
      setDetailTask(prev => prev?.id === task.id ? { ...prev, status } : prev);
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDelete = async (task: FieldTask) => {
    try {
      await deleteTask(task.id);
      toast({ title: 'Task deleted' });
      setDetailTask(null);
    } catch {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  // ── Bulk select ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)));
  const clearSelection = () => { setSelectedIds(new Set()); setBulkMode(false); };
  const handleBulkStatus = async (status: FieldTaskStatus) => {
    const targets = tasks.filter(t => selectedIds.has(t.id) && t.status !== status);
    await Promise.all(targets.map(t => updateTask(t.id, { status }, { currentUserId }).catch(() => null)));
    toast({ title: `${targets.length} task${targets.length !== 1 ? 's' : ''} updated to "${STATUS_CFG[status].label}"` });
    clearSelection();
  };

  // ── CSV/PDF Export ──
  const exportCSV = () => {
    const header = ['Title','Status','Priority','Assignee','Start Date','Due Date','State','Locality','Est Hours','Act Hours','Est Cost','Act Cost','Notes'];
    const rows = filtered.map(t => [
      t.title, STATUS_CFG[t.status].label, PRIORITY_CFG[t.priority].label,
      t.assignedToName ?? '', t.startDate ?? '', t.dueDate ?? '',
      t.stateName ?? '', t.localityName ?? '',
      t.estimatedHours ?? '', t.actualHours ?? '',
      t.estimatedCost ?? '', t.actualCost ?? '',
      (t.notes ?? '').replace(/\n/g, ' '),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${projectName.replace(/\s+/g, '_')}_field_tasks.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: 'CSV exported' });
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`Field Tasks — ${projectName}`, 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Exported ${new Date().toLocaleDateString()} · ${filtered.length} tasks`, 14, 20);
    autoTable(doc, {
      startY: 25,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [29, 52, 97] },
      head: [['Title','Status','Priority','Assignee','Start','Due','Location','Est h','Act h','Est $','Act $']],
      body: filtered.map(t => [
        t.title,
        STATUS_CFG[t.status].label,
        PRIORITY_CFG[t.priority].label,
        t.assignedToName ?? '',
        t.startDate ?? '',
        t.dueDate ?? '',
        [t.stateName, t.localityName].filter(Boolean).join(' / '),
        t.estimatedHours != null ? String(t.estimatedHours) : '',
        t.actualHours    != null ? String(t.actualHours)    : '',
        t.estimatedCost  != null ? `$${t.estimatedCost}`   : '',
        t.actualCost     != null ? `$${t.actualCost}`       : '',
      ]),
    });
    doc.save(`${projectName.replace(/\s+/g, '_')}_field_tasks.pdf`);
    toast({ title: 'PDF exported' });
  };

  const filtersActive = filterStatus !== 'all' || filterPriority !== 'all' || filterAssignee !== 'all' || !!filterMemberId || !!search.trim();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-foreground">Field Tasks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Project-specific field operations — independent of the MMP workflow
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View switcher */}
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
            {([
              ['list',     LayoutList,       'List'],
              ['board',    Columns,          'Board'],
              ['timeline', CalendarDays,     'Timeline'],
              ['gantt',    GanttChartSquare, 'Gantt'],
            ] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                title={label}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all',
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-800 text-[#1D3461] shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Bulk select toggle */}
          {canEdit && viewMode === 'list' && (
            <Button
              variant={bulkMode ? 'default' : 'outline'}
              size="sm"
              className={cn('h-8 text-xs', bulkMode && 'bg-[#1D3461] text-white')}
              onClick={() => { setBulkMode(v => !v); setSelectedIds(new Set()); }}
              title="Toggle bulk select"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              {bulkMode ? 'Exit Bulk' : 'Bulk'}
            </Button>
          )}

          {/* Export dropdown */}
          {tasks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <FileDown className="h-3.5 w-3.5 mr-1" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCSV}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}>
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canEdit && (
            <Button
              size="sm"
              onClick={() => setFormOpen(true)}
              className="bg-[#1D3461] hover:bg-[#0F2041] text-white h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Task
            </Button>
          )}
        </div>
      </div>

      {/* ── Status strip ── */}
      <div className="grid grid-cols-4 gap-2">
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(prev => prev === s ? 'all' : s)}
            className={cn(
              'rounded-lg border px-3 py-2 text-left transition-all',
              filterStatus === s
                ? 'border-[#1D3461] bg-[#0F2041]/5 ring-1 ring-[#1D3461]/30'
                : 'border-border hover:border-[#1D3461]/30',
            )}
          >
            <p className="text-lg font-bold text-foreground leading-none">{counts[s] ?? 0}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{STATUS_CFG[s].label}</p>
          </button>
        ))}
      </div>

      {/* ── Team Health Strip ── */}
      <TeamHealthStrip
        tasks={tasks}
        activeMemberId={filterMemberId}
        onMemberClick={setFilterMemberId}
      />

      {/* ── Timesheet + Cost summary (only when data exists) ── */}
      {(hasTimesheetData || hasCostData) && (
        <div className="grid grid-cols-2 gap-3">
          {hasTimesheetData && (
            <div className="rounded-lg border px-4 py-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold">Time Summary</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Est: {fmtHours(totalEstHours)}</span>
                <span className="font-medium">Act: {fmtHours(totalActHours)}</span>
              </div>
              {totalEstHours > 0 && (
                <Progress value={Math.min(100, (totalActHours / totalEstHours) * 100)} className="h-1.5" />
              )}
            </div>
          )}
          {hasCostData && (
            <div className="rounded-lg border px-4 py-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold">Cost Summary</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Est: {fmtCost(totalEstCost)}</span>
                <span className="font-medium">Act: {fmtCost(totalActCost)}</span>
              </div>
              {totalEstCost > 0 && (
                <Progress value={Math.min(100, (totalActCost / totalEstCost) * 100)} className="h-1.5" />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {bulkMode && (
        <div className="flex items-center gap-2 rounded-lg border bg-[#0F2041]/5 border-[#1D3461]/30 px-3 py-2 flex-wrap">
          <button type="button" onClick={selectAll} className="text-xs text-[#1D3461] font-medium hover:underline">Select all ({filtered.length})</button>
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs font-medium text-muted-foreground">Set status:</span>
              {STATUS_ORDER.map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => handleBulkStatus(s)}
                >
                  {STATUS_CFG[s].label}
                </Button>
              ))}
            </>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 text-sm" />
        </div>
        <Select value={filterPriority} onValueChange={v => setFilterPriority(v as any)}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITY_ORDER.map(p => <SelectItem key={p} value={p}>{PRIORITY_CFG[p].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignee} onValueChange={v => setFilterAssignee(v as any)}>
          <SelectTrigger className="h-8 text-xs w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All staff</SelectItem>
            <SelectItem value="mine">Mine</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button
            variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setSearch(''); setFilterStatus('all'); setFilterPriority('all'); setFilterAssignee('all'); setFilterMemberId(null); }}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length}/{tasks.length} tasks</span>
      </div>

      {/* ── View ── */}
      {viewMode === 'list' && (
        <ListView tasks={filtered} allTasks={tasks} canEdit={canEdit}
          bulkMode={bulkMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
          onOpen={t => { if (!bulkMode) setDetailTask(t); else toggleSelect(t.id); }}
          onEdit={t => { setEditTask(t); setDetailTask(null); }}
          onDelete={t => handleDelete(t)} onStatusChange={(t, s) => handleStatusChange(t, s)} />
      )}
      {viewMode === 'board' && (
        <BoardView tasks={filtered} allTasks={tasks} canEdit={canEdit}
          onOpen={t => setDetailTask(t)} onEdit={t => { setEditTask(t); setDetailTask(null); }}
          onDelete={t => handleDelete(t)} onStatusChange={(t, s) => handleStatusChange(t, s)} />
      )}
      {viewMode === 'timeline' && (
        <TimelineView tasks={filtered} allTasks={tasks} canEdit={canEdit}
          onOpen={t => setDetailTask(t)} onEdit={t => { setEditTask(t); setDetailTask(null); }}
          onDelete={t => handleDelete(t)} onStatusChange={(t, s) => handleStatusChange(t, s)} />
      )}
      {viewMode === 'gantt' && (
        <GanttView tasks={filtered} onOpen={t => setDetailTask(t)} />
      )}

      {/* ── Dialogs ── */}
      <TaskFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleCreate}
        isSaving={isCreating}
        allStages={allStages}
        customEntries={customEntries}
        allTasks={tasks}
      />
      <TaskFormDialog
        open={!!editTask}
        onClose={() => setEditTask(null)}
        initial={editTask}
        onSave={handleEdit}
        isSaving={isUpdating}
        allStages={allStages}
        customEntries={customEntries}
        allTasks={tasks}
      />
      <TaskDetailDialog
        task={detailTask}
        allTasks={tasks}
        allStages={allStages}
        customEntries={customEntries}
        canEdit={canEdit}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onClose={() => setDetailTask(null)}
        onEdit={() => { setEditTask(detailTask); setDetailTask(null); }}
        onDelete={() => detailTask && handleDelete(detailTask)}
        onStatusChange={s => detailTask && handleStatusChange(detailTask, s)}
      />
    </div>
  );
}
