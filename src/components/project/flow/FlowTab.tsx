import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import {
  CheckCircle2,
  SkipForward,
  ChevronUp,
  ChevronDown,
  Settings2,
  ArrowRight,
  Clock,
  User,
  FileText,
  Loader2,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  ListChecks,
  ChevronDown as ExpandIcon,
  ChevronUp as CollapseIcon,
  Flag,
  TrendingUp,
  Layers,
  CheckSquare,
  Download,
  FileDown,
  Plus,
  X,
  Pencil,
  BarChart2,
  List,
  Calendar,
  Users,
  Circle,
  Link2,
  Diamond,
  Ban,
  GitMerge,
  Percent,
  UserPlus,
  ClipboardList,
  Building2,
  Map,
  ClipboardCheck,
  DollarSign,
  Receipt,
  FolderOpen,
  Landmark,
  Wallet,
  Trash2,
  MoreVertical,
  Undo2,
  PlayCircle,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, parseISO, isBefore } from 'date-fns';
import type { UseProjectFlowReturn, CustomStageEntry } from '@/hooks/useProjectFlow';
import type { FlowStage, StageActionIcon } from '@/config/projectFlows';
import { StageAssignees } from './StageAssignees';
import { StageChecklist } from './StageChecklist';
import { StageAttachments } from './StageAttachments';
import { useAllStageAssignees, useAllStageChecklist } from '@/hooks/useStageData';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GanttView } from './GanttView';
import { ScheduleView } from './ScheduleView';
import { exportFlowPDF, exportFlowDocx } from './flowExport';
import { workingDaysBetween, calendarDaysBetween, DEFAULT_WORKING_DAYS } from '@/utils/workingDays';
import { ProjectCalendarDialog } from '@/components/project/ProjectCalendarDialog';

type ViewMode = 'list' | 'gantt' | 'schedule';

interface Props {
  flow: UseProjectFlowReturn;
  projectName: string;
  projectType: string;
  projectCode?: string;
  projectId: string;
  currentUserId?: string;
  projectStart?: string;
  projectEnd?: string;
  allDefaultStages: FlowStage[];
  customFlowStages?: CustomStageEntry[];
  /** All project team member user IDs (PM + members) for sending acknowledgement notifications */
  teamUserIds?: string[];
}

// ── Formatters ─────────────────────────────────────────────────────────────

function formatTimestamp(iso: string) {
  try { return format(new Date(iso), 'dd MMM yyyy, HH:mm'); } catch { return iso; }
}
function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ''; }
}
function fmtDate(iso?: string | null) {
  if (!iso) return null;
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
}
function isOverdueFn(iso?: string | null, status?: string) {
  if (!iso || status === 'completed' || status === 'skipped') return false;
  try { return isBefore(parseISO(iso), new Date()); } catch { return false; }
}

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CFG = {
  completed: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/60 dark:bg-emerald-900/10',
    ring: 'border-emerald-200 dark:border-emerald-800',
    icon: 'bg-emerald-500 text-white border-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    label: 'Completed',
  },
  current: {
    border: 'border-l-[#1D3461]',
    bg: 'bg-[#0F2041]/5 dark:bg-[#1D3461]/10',
    ring: 'border-[#1D3461]/40 dark:border-[#1D3461]/60',
    icon: 'bg-[#1D3461] text-white border-[#1D3461]',
    badge: 'bg-[#1D3461]/10 text-[#1D3461] dark:bg-[#1D3461]/30 dark:text-blue-300',
    label: 'In Progress',
  },
  skipped: {
    border: 'border-l-amber-400',
    bg: 'bg-amber-50/40 dark:bg-amber-900/10',
    ring: 'border-dashed border-amber-200 dark:border-amber-800',
    icon: 'bg-amber-100 text-amber-500 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    label: 'Skipped',
  },
  upcoming: {
    border: 'border-l-slate-200',
    bg: 'bg-background',
    ring: 'border-border',
    icon: 'bg-background text-muted-foreground border-border',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    label: 'Upcoming',
  },
};

// ── Export button ──────────────────────────────────────────────────────────

function ExportButton({ projectId, projectName, projectType, projectCode, flow, allDefaultStages, customEntries }: {
  projectId: string; projectName: string; projectType: string; projectCode?: string;
  flow: UseProjectFlowReturn; allDefaultStages: FlowStage[]; customEntries: CustomStageEntry[];
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  const doExport = async (type: 'pdf' | 'docx') => {
    setExporting(type);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const [assigneesRes, checklistRes, attachmentsRes] = await Promise.all([
        supabase.from('project_stage_assignees').select('stage_id, profiles:user_id(full_name, role)').eq('project_id', projectId),
        supabase.from('project_stage_checklist').select('stage_id, item_text, completed').eq('project_id', projectId),
        supabase.from('project_stage_attachments').select('stage_id, file_name, file_url, file_type, file_size').eq('project_id', projectId),
      ]);
      const extras: Record<string, any> = {};
      allDefaultStages.forEach(s => {
        extras[s.id] = {
          assignees: (assigneesRes.data ?? []).filter((r: any) => r.stage_id === s.id).map((r: any) => ({ id: s.id + r.profiles?.full_name, userId: '', fullName: r.profiles?.full_name ?? '', role: r.profiles?.role ?? '', avatarUrl: null, assignedAt: '' })),
          checklist: (checklistRes.data ?? []).filter((r: any) => r.stage_id === s.id).map((r: any) => ({ id: s.id, itemText: r.item_text, completed: r.completed, completedBy: null, completedAt: null, createdAt: '', sortOrder: 0 })),
          attachments: (attachmentsRes.data ?? []).filter((r: any) => r.stage_id === s.id).map((r: any) => ({ id: s.id, fileName: r.file_name, fileUrl: r.file_url, fileType: r.file_type, fileSize: r.file_size, uploadedByName: null, createdAt: '' })),
        };
      });
      const exportData = { projectName, projectType, projectCode, stages: allDefaultStages, stageHistory: flow.stageHistory, currentStageId: flow.currentStage?.id ?? null, extras, customEntries };
      if (type === 'pdf') await exportFlowPDF(exportData);
      else await exportFlowDocx(exportData);
      toast({ title: `${type.toUpperCase()} exported successfully` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally { setExporting(null); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-3 shrink-0" disabled={!!exporting} data-testid="button-export-flow">
          {exporting ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <FileDown className="h-3 w-3 mr-1.5" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => doExport('pdf')}><FileText className="h-3.5 w-3.5 mr-2 text-red-500" />Export PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => doExport('docx')}><FileText className="h-3.5 w-3.5 mr-2 text-blue-500" />Export Word (.docx)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Edit Flow Dialog ───────────────────────────────────────────────────────

interface EditFlowDialogProps {
  open: boolean; onClose: () => void;
  customEntries: CustomStageEntry[]; setCustomEntries: (e: CustomStageEntry[]) => void;
  allDefaultStages: FlowStage[]; projectName: string;
  isSaving: boolean; onSave: () => void; onReset: () => void;
  getStageStatus: (id: string) => 'completed' | 'current' | 'upcoming' | 'skipped';
}

function EditFlowDialog({ open, onClose, customEntries, setCustomEntries, allDefaultStages, projectName, isSaving, onSave, onReset, getStageStatus }: EditFlowDialogProps) {
  const [expandedEditIds, setExpandedEditIds] = useState<Set<string>>(new Set());

  const toggleEditExpand = (id: string) => setExpandedEditIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const updateEntry = (id: string, patch: Partial<CustomStageEntry>) =>
    setCustomEntries(customEntries.map(e => e.id === id ? { ...e, ...patch } : e));

  const moveEntry = (idx: number, dir: 'up' | 'down') => {
    const next = [...customEntries];
    const t = dir === 'up' ? idx - 1 : idx + 1;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setCustomEntries(next);
  };

  // Add a brand-new stage (not in the canonical project flow definition).
  // The id prefix `custom_` lets us distinguish user-added stages so we can
  // also expose a delete control for them.
  const addCustomStage = () => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newEntry: CustomStageEntry = {
      id,
      customLabel: '',
      customDescription: '',
      customOutputs: [],
    };
    setCustomEntries([...customEntries, newEntry]);
    // Auto-expand the new entry so the user can fill it in immediately.
    setExpandedEditIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const removeCustomStage = (id: string) => {
    setCustomEntries(
      customEntries
        .filter(e => e.id !== id)
        // also drop this id from anyone else's dependencies list
        .map(e => e.dependencies?.includes(id)
          ? { ...e, dependencies: e.dependencies.filter(d => d !== id) }
          : e),
    );
  };

  const isCustomStage = (id: string) => id.startsWith('custom_');

  const addOutput = (id: string) => {
    const entry = customEntries.find(e => e.id === id);
    updateEntry(id, { customOutputs: [...(entry?.customOutputs ?? []), ''] });
  };
  const updateOutput = (id: string, oi: number, val: string) => {
    const entry = customEntries.find(e => e.id === id);
    const outs = [...(entry?.customOutputs ?? [])];
    outs[oi] = val;
    updateEntry(id, { customOutputs: outs });
  };
  const removeOutput = (id: string, oi: number) => {
    const entry = customEntries.find(e => e.id === id);
    updateEntry(id, { customOutputs: (entry?.customOutputs ?? []).filter((_, i) => i !== oi) });
  };

  // Collect all used parallelGroup values
  const usedGroups = [...new Set(customEntries.map(e => e.parallelGroup).filter((g): g is number => g != null))];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-[#1D3461]" /> Edit Project Flow
          </DialogTitle>
          <DialogDescription>
            Configure stages, dates, and parallel groups for <strong>{projectName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
          {customEntries.map((entry, idx) => {
            // For user-added stages there is no canonical default — synthesize
            // a minimal stage definition from the entry itself so the row
            // still renders correctly until it is saved (after which the hook
            // synthesizes it on every read).
            const stageDef =
              allDefaultStages.find(s => s.id === entry.id) ?? {
                id: entry.id,
                label: entry.customLabel?.trim() || 'New Stage',
                description: '',
                keyOutputs: [] as string[],
              };
            const customStage = isCustomStage(entry.id);
            const isExpanded = expandedEditIds.has(entry.id);
            const displayLabel = entry.customLabel || stageDef.label;
            const status = getStageStatus(entry.id);
            const isParallel = entry.parallelGroup != null;

            return (
              <div key={entry.id} className={cn(
                'rounded-xl border transition-colors overflow-hidden',
                entry.removedFromTemplate ? 'bg-slate-50 dark:bg-slate-800/30 border-dashed border-slate-200 opacity-70' : 'bg-white dark:bg-slate-900 border-border',
                isExpanded && 'border-[#1D3461]/30 shadow-sm',
              )}>
                {/* Row header */}
                <div className="flex items-center gap-2 p-3">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => moveEntry(idx, 'up')}><ChevronUp className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === customEntries.length - 1} onClick={() => moveEntry(idx, 'down')}><ChevronDown className="h-3 w-3" /></Button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className={cn('text-sm font-medium truncate', entry.removedFromTemplate && 'line-through text-muted-foreground')}>
                        {displayLabel}
                        {customStage && (
                          <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 rounded px-1 py-0.5 font-medium" title="Stage added by you">
                            <Sparkles className="inline h-2.5 w-2.5 mr-0.5" />Added
                          </span>
                        )}
                        {!customStage && entry.customLabel && entry.customLabel !== stageDef.label && (
                          <span className="ml-1 text-[10px] text-[#1D3461]">(custom)</span>
                        )}
                      </p>
                      {isParallel && (
                        <span className="text-[9px] bg-violet-100 text-violet-700 rounded px-1 font-medium">∥ Group {entry.parallelGroup}</span>
                      )}
                    </div>
                    {(entry.plannedStart || entry.plannedEnd) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {entry.plannedStart && fmtDate(entry.plannedStart)}
                        {entry.plannedStart && entry.plannedEnd && ' → '}
                        {entry.plannedEnd && fmtDate(entry.plannedEnd)}
                        {entry.dueDate && ` · Due: ${fmtDate(entry.dueDate)}`}
                      </p>
                    )}
                  </div>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0', STATUS_CFG[status].badge)}>
                    {STATUS_CFG[status].label}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Label htmlFor={`skip-${entry.id}`} className="text-xs text-muted-foreground cursor-pointer">Skip</Label>
                    <Switch id={`skip-${entry.id}`} checked={entry.skipped ?? false} onCheckedChange={() => updateEntry(entry.id, { skipped: !entry.skipped })} />
                  </div>
                  {/* Quick milestone toggle — one click, no expand needed */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 flex-shrink-0 transition-colors',
                      entry.isMilestone
                        ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                        : 'text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-50',
                    )}
                    onClick={() => updateEntry(entry.id, { isMilestone: !entry.isMilestone })}
                    title={entry.isMilestone ? 'Remove milestone flag' : 'Mark as Milestone'}
                  >
                    <Diamond className={cn('h-3.5 w-3.5', entry.isMilestone && 'fill-amber-400')} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => toggleEditExpand(entry.id)} title="Edit details">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  {/* Delete / restore for ALL stages.
                      Custom stages are removed from the list entirely;
                      template stages set removedFromTemplate=true which hides them completely
                      from the main stage view (unlike runtime-skip which shows them dimmed). */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 flex-shrink-0 hover:bg-destructive/10',
                      !customStage && entry.removedFromTemplate
                        ? 'text-amber-500 hover:text-amber-700'
                        : 'text-muted-foreground hover:text-destructive',
                    )}
                    onClick={() =>
                      customStage
                        ? removeCustomStage(entry.id)
                        : updateEntry(entry.id, { removedFromTemplate: !entry.removedFromTemplate })
                    }
                    title={
                      customStage
                        ? 'Delete this added stage'
                        : entry.removedFromTemplate
                        ? 'Restore stage to flow'
                        : 'Remove stage from flow'
                    }
                    data-testid={`button-delete-stage-${entry.id}`}
                  >
                    {!customStage && entry.removedFromTemplate
                      ? <RotateCcw className="h-3.5 w-3.5" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </Button>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                    {/* Name + description */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage Name</Label>
                        <Input placeholder={stageDef.label} value={entry.customLabel ?? ''} onChange={e => updateEntry(entry.id, { customLabel: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parallel Group #</Label>
                        <Input
                          type="number" min="1" placeholder="None (sequential)"
                          value={entry.parallelGroup ?? ''}
                          onChange={e => updateEntry(entry.id, { parallelGroup: e.target.value ? parseInt(e.target.value) : null })}
                          className="h-8 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Stages with the same number run in parallel</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
                      <Textarea placeholder="Override stage description (optional)" value={entry.customDescription ?? ''} onChange={e => updateEntry(entry.id, { customDescription: e.target.value })} rows={2} className="text-sm resize-none" />
                    </div>

                    {/* Date fields */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Planned Start
                        </Label>
                        <Input type="date" value={entry.plannedStart ?? ''} onChange={e => updateEntry(entry.id, { plannedStart: e.target.value || null })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Planned End
                        </Label>
                        <Input type="date" value={entry.plannedEnd ?? ''} onChange={e => updateEntry(entry.id, { plannedEnd: e.target.value || null })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-orange-600">
                          Deadline
                        </Label>
                        <Input type="date" value={entry.dueDate ?? ''} onChange={e => updateEntry(entry.id, { dueDate: e.target.value || null })} className="h-8 text-xs border-orange-200 focus:border-orange-400" />
                      </div>
                    </div>

                    {/* MS Project fields: Milestone + % Complete + Dependencies */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Diamond className="h-3 w-3 text-amber-500" /> Milestone
                        </Label>
                        <div className="flex items-center gap-2 h-8">
                          <Switch
                            id={`milestone-${entry.id}`}
                            checked={entry.isMilestone ?? false}
                            onCheckedChange={v => updateEntry(entry.id, { isMilestone: v })}
                          />
                          <Label htmlFor={`milestone-${entry.id}`} className="text-xs text-muted-foreground cursor-pointer">
                            {entry.isMilestone ? 'Yes — milestone stage' : 'No'}
                          </Label>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Percent className="h-3 w-3" /> % Complete
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number" min="0" max="100" placeholder="Auto"
                            value={entry.percentComplete ?? ''}
                            onChange={e => updateEntry(entry.id, { percentComplete: e.target.value ? Math.min(100, Math.max(0, parseInt(e.target.value))) : null })}
                            className="h-8 text-sm w-24"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Leave blank for auto</p>
                      </div>
                    </div>

                    {/* Dependencies */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <GitMerge className="h-3 w-3" /> Must complete before this stage
                      </Label>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto rounded-lg border border-border/60 p-2 bg-background">
                        {customEntries.filter(e => e.id !== entry.id && !e.skipped).map(depEntry => {
                          const depStageDef = allDefaultStages.find(s => s.id === depEntry.id);
                          const depLabel = depEntry.customLabel || depStageDef?.label || depEntry.id;
                          const isChecked = (entry.dependencies ?? []).includes(depEntry.id);
                          return (
                            <div key={depEntry.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`dep-${entry.id}-${depEntry.id}`}
                                checked={isChecked}
                                onChange={e => {
                                  const deps = entry.dependencies ?? [];
                                  updateEntry(entry.id, {
                                    dependencies: e.target.checked
                                      ? [...deps, depEntry.id]
                                      : deps.filter(d => d !== depEntry.id),
                                  });
                                }}
                                className="h-3.5 w-3.5 rounded accent-[#1D3461] cursor-pointer"
                              />
                              <label htmlFor={`dep-${entry.id}-${depEntry.id}`} className="text-xs text-muted-foreground cursor-pointer truncate">
                                {depLabel}
                              </label>
                            </div>
                          );
                        })}
                        {customEntries.filter(e => e.id !== entry.id && !e.skipped).length === 0 && (
                          <p className="text-[10px] text-muted-foreground italic text-center py-1">No other stages to depend on</p>
                        )}
                      </div>
                      {(entry.dependencies?.length ?? 0) > 0 && (
                        <p className="text-[10px] text-orange-600 flex items-center gap-1">
                          <Ban className="h-3 w-3" /> Stage will be blocked until {entry.dependencies!.length} predecessor{entry.dependencies!.length > 1 ? 's are' : ' is'} complete
                        </p>
                      )}
                    </div>

                    {/* Custom outputs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custom Key Outputs</Label>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => addOutput(entry.id)}>
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </div>
                      {(entry.customOutputs ?? []).map((output, oi) => {
                        // Never show sentinel markers (~~rm~~:) in the edit form —
                        // they are internal markers for removed default outputs
                        if (output.startsWith('~~rm~~:')) return null;
                        return (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="text-muted-foreground/40 text-sm">+</span>
                            <Input value={output} onChange={e => updateOutput(entry.id, oi, e.target.value)} placeholder="Custom output item..." className="h-7 text-xs flex-1" />
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeOutput(entry.id, oi)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Stage — appends a brand-new user-defined stage to the flow.
              Saved when the user clicks "Save Flow". */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCustomStage}
            disabled={isSaving}
            className="w-full mt-2 border-dashed text-[#1D3461] hover:bg-[#0F2041]/5 hover:border-[#1D3461]"
            data-testid="button-add-flow-stage"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Stage
          </Button>
        </div>

        <Separator />
        <DialogFooter className="flex-shrink-0 pt-3 gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground mr-auto text-xs" onClick={onReset} disabled={isSaving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to Default
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={isSaving} className="bg-[#1D3461] hover:bg-[#0F2041] text-white" data-testid="button-save-flow">
            {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : 'Save Flow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main FlowTab ───────────────────────────────────────────────────────────

export function FlowTab({
  flow, projectName, projectType, projectCode, projectId, currentUserId,
  projectStart, projectEnd, allDefaultStages, customFlowStages, teamUserIds,
}: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const {
    activeStages, groups, currentStages, currentStage, currentStageIndex, currentGroupIdx,
    stageHistory, isLastGroup, canAdvance, canEditFlow,
    isAdvancing, isSavingCustom, isMutatingStageStatus,
    completeStage, updateCustomStages, setStageStatus,
    getStageStatus, isStageCompleted,
    getBlockedBy, isStageBlocked,
  } = flow;

  const handleSetStageStatus = async (stageId: string, action: Parameters<typeof setStageStatus>[1]) => {
    try {
      await setStageStatus(stageId, action);
      const verb =
        action === 'mark-complete' ? 'Marked complete'
        : action === 'set-current' ? 'Set as current stage'
        : action === 'toggle-skip' ? 'Skip toggled'
        : 'Reopened';
      toast({ title: `Status updated`, description: verb });
    } catch (err: any) {
      toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' });
    }
  };

  // Project calendar settings (working days + exceptions)
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localWorkingDays, setLocalWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [localCalExceptions, setLocalCalExceptions] = useState<string[]>([]);
  useQuery({
    queryKey: ['project_calendar', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('working_days, calendar_exceptions')
        .eq('id', projectId)
        .single();
      if (data) {
        setLocalWorkingDays((data as any).working_days ?? DEFAULT_WORKING_DAYS);
        setLocalCalExceptions(((data as any).calendar_exceptions as string[] | null) ?? []);
      }
      return data;
    },
    staleTime: 5 * 60_000,
  });

  // Load ALL stage assignees for this project in one query
  const { data: allAssignees = [] } = useAllStageAssignees(projectId);

  // Load ALL stage checklist items for this project in one query (used by Gantt sub-bars)
  const { data: allChecklistItems = [] } = useAllStageChecklist(projectId);

  // Map: stageId → checklist items[] (for Gantt sub-bars)
  const checklistByStage = useMemo(() => {
    const map: Record<string, typeof allChecklistItems> = {};
    allChecklistItems.forEach(item => {
      if (!map[item.stageId]) map[item.stageId] = [];
      map[item.stageId].push(item);
    });
    return map;
  }, [allChecklistItems]);

  // Map: stageId → assignees[]
  const assigneesByStage = useMemo(() => {
    const map: Record<string, typeof allAssignees> = {};
    allAssignees.forEach(a => {
      if (!map[a.stageId]) map[a.stageId] = [];
      map[a.stageId].push(a);
    });
    return map;
  }, [allAssignees]);

  // My Tasks: stages where the current user is assigned
  const myAssignedStages = useMemo(() => {
    if (!currentUserId) return [];
    return allDefaultStages.filter(stage =>
      (assigneesByStage[stage.id] ?? []).some(a => a.userId === currentUserId)
    );
  }, [allAssignees, allDefaultStages, currentUserId, assigneesByStage]);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editOpen, setEditOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [customEntries, setCustomEntries] = useState<CustomStageEntry[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Key outputs inline editing
  const [outputsState, setOutputsState] = useState<Record<string, { items: string[]; inputVal: string }>>({});
  const [outputsSaving, setOutputsSaving] = useState<string | null>(null);

  // Report Risk dialog
  const [riskStageId, setRiskStageId] = useState<string | null>(null);
  const [riskForm, setRiskForm] = useState({ title: '', risk_score: 3, mitigation_plan: '' });
  const [savingRisk, setSavingRisk] = useState(false);

  const resolvedEntry = (stageId: string): CustomStageEntry | undefined =>
    (customFlowStages ?? []).find(e => e.id === stageId);

  useEffect(() => {
    if (editOpen) {
      const initial = allDefaultStages.map(s => ({
        id: s.id,
        skipped: getStageStatus(s.id) === 'skipped',
        ...(customFlowStages?.find(e => e.id === s.id) ?? {}),
      }));
      setCustomEntries(initial);
    }
  }, [editOpen]);

  // Auto-expand all current stages
  useEffect(() => {
    if (currentStages.length > 0) {
      setExpandedIds(prev => new Set([...prev, ...currentStages.map(s => s.id)]));
    }
  }, [currentStages.map(s => s.id).join(',')]);

  const toggleExpand = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleCompleteStage = async (stageId: string) => {
    try {
      await completeStage(stageId, notes[stageId] ?? '');
      toast({ title: 'Stage marked complete', description: 'Team has been notified.' });
      setNotes(prev => ({ ...prev, [stageId]: '' }));
    } catch (err: any) {
      toast({ title: 'Failed to complete stage', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveCustom = async () => {
    try {
      await updateCustomStages(customEntries);
      toast({ title: 'Flow configuration saved' });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err.message, variant: 'destructive' });
    }
  };

  const handleResetCustom = async () => {
    try {
      await updateCustomStages([]);
      toast({ title: 'Flow reset to default' });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to reset', description: err.message, variant: 'destructive' });
    }
  };

  // Save dates for a specific stage via updateCustomStages
  const [dateSaving, setDateSaving] = useState<string | null>(null);
  const saveDatesForStage = async (stageId: string, patch: { plannedStart?: string | null; plannedEnd?: string | null; dueDate?: string | null }) => {
    setDateSaving(stageId);
    try {
      const existing = (customFlowStages ?? []) as CustomStageEntry[];
      const base: CustomStageEntry[] = existing.length > 0
        ? existing
        : allDefaultStages.map(s => ({ id: s.id }));
      const hasEntry = base.some(e => e.id === stageId);
      const updated: CustomStageEntry[] = hasEntry
        ? base.map(e => e.id === stageId ? { ...e, ...patch } : e)
        : [...base, { id: stageId, ...patch }];
      await updateCustomStages(updated);
    } catch (err: any) {
      toast({ title: 'Failed to save dates', description: err.message, variant: 'destructive' });
    } finally {
      setDateSaving(null);
    }
  };

  // Save % complete for a specific stage inline
  const [percentSaving, setPercentSaving] = useState<string | null>(null);
  const savePercentForStage = async (stageId: string, pct: number | null) => {
    setPercentSaving(stageId);
    try {
      const existing = (customFlowStages ?? []) as CustomStageEntry[];
      const base: CustomStageEntry[] = existing.length > 0
        ? existing
        : allDefaultStages.map(s => ({ id: s.id }));
      const hasEntry = base.some(e => e.id === stageId);
      const updated: CustomStageEntry[] = hasEntry
        ? base.map(e => e.id === stageId ? { ...e, percentComplete: pct } : e)
        : [...base, { id: stageId, percentComplete: pct }];
      await updateCustomStages(updated);
    } catch (err: any) {
      toast({ title: 'Failed to save progress', description: err.message, variant: 'destructive' });
    } finally {
      setPercentSaving(null);
    }
  };

  // Toggle isMilestone for a specific stage inline (no dialog needed)
  const [milestoneSaving, setMilestoneSaving] = useState<string | null>(null);
  const saveMilestoneForStage = async (stageId: string, isMilestone: boolean) => {
    setMilestoneSaving(stageId);
    try {
      const existing = (customFlowStages ?? []) as CustomStageEntry[];
      const base: CustomStageEntry[] = existing.length > 0
        ? existing
        : allDefaultStages.map(s => ({ id: s.id }));
      const hasEntry = base.some(e => e.id === stageId);
      const updated: CustomStageEntry[] = hasEntry
        ? base.map(e => e.id === stageId ? { ...e, isMilestone } : e)
        : [...base, { id: stageId, isMilestone }];
      await updateCustomStages(updated);
      toast({ title: isMilestone ? '🔷 Stage marked as Milestone' : 'Milestone removed', description: isMilestone ? 'Team will be notified when this stage is completed.' : undefined });
    } catch (err: any) {
      toast({ title: 'Failed to update milestone', description: err.message, variant: 'destructive' });
    } finally {
      setMilestoneSaving(null);
    }
  };

  // Save custom outputs for a specific stage via updateCustomStages
  const SENTINEL_PREFIX = '~~rm~~:';
  const saveOutputsForStage = async (stageId: string, outputs: string[]) => {
    setOutputsSaving(stageId);
    try {
      const existing = (customFlowStages ?? []) as CustomStageEntry[];
      const base: CustomStageEntry[] = existing.length > 0
        ? existing
        : allDefaultStages.map(s => ({ id: s.id }));
      const hasEntry = base.some(e => e.id === stageId);
      const updated: CustomStageEntry[] = hasEntry
        ? base.map(e => e.id === stageId ? { ...e, customOutputs: outputs } : e)
        : [...base, { id: stageId, customOutputs: outputs }];
      await updateCustomStages(updated);
      // Only store user-visible items in local state — sentinels are internal markers
      setOutputsState(prev => ({
        ...prev,
        [stageId]: { items: outputs.filter(o => !o.startsWith(SENTINEL_PREFIX)), inputVal: '' },
      }));
    } catch (err: any) {
      toast({ title: 'Failed to save outputs', description: err.message, variant: 'destructive' });
    } finally {
      setOutputsSaving(null);
    }
  };

  // Quick Risk Report handler
  const handleSaveRisk = async () => {
    if (!riskForm.title.trim() || !riskStageId) return;
    setSavingRisk(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      // Map picker score (1-5) to likelihood/impact — risk_score is a generated column
      const SCORE_MAP: Record<number, { likelihood: string; impact: string }> = {
        1: { likelihood: 'very_low', impact: 'negligible' },
        2: { likelihood: 'low',      impact: 'minor' },
        3: { likelihood: 'medium',   impact: 'moderate' },
        4: { likelihood: 'high',     impact: 'major' },
        5: { likelihood: 'very_high',impact: 'critical' },
      };
      const lh = SCORE_MAP[riskForm.risk_score] ?? SCORE_MAP[3];
      const { error } = await supabase.from('project_risks').insert({
        project_id: projectId,
        title: riskForm.title.trim(),
        likelihood: lh.likelihood,
        impact: lh.impact,
        mitigation_plan: riskForm.mitigation_plan || null,
        status: 'open',
      });
      if (error) throw error;
      toast({ title: 'Risk reported', description: 'The risk has been logged for this project.' });
      setRiskStageId(null);
      setRiskForm({ title: '', risk_score: 3, mitigation_plan: '' });
    } catch (err: any) {
      toast({ title: 'Failed to report risk', description: err.message, variant: 'destructive' });
    } finally {
      setSavingRisk(false);
    }
  };

  const completedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'completed').length;
  const skippedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'skipped').length;
  const remainingCount = allDefaultStages.length - completedCount - skippedCount - currentStages.length;
  const activeCount = allDefaultStages.filter(s => getStageStatus(s.id) !== 'skipped').length;
  const pct = activeCount > 0 ? Math.round((completedCount / activeCount) * 100) : 0;

  // ── Duration summary ──────────────────────────────────────────────────────
  const durationSummary = useMemo(() => {
    // Sum working days for stages that have both plannedStart and plannedEnd
    let totalScheduledWd = 0;
    let scheduledStageCount = 0;
    for (const stage of allDefaultStages) {
      const entry = (customFlowStages ?? []).find(e => e.id === stage.id);
      if (entry?.plannedStart && entry?.plannedEnd) {
        const wd = workingDaysBetween(entry.plannedStart, entry.plannedEnd, localWorkingDays, localCalExceptions);
        if (wd !== null) {
          totalScheduledWd += wd;
          scheduledStageCount++;
        }
      }
    }
    if (scheduledStageCount === 0) return null;

    const projectSpanDays = calendarDaysBetween(projectStart, projectEnd);
    // Project span in working days for % calculation
    const projectSpanWd = projectStart && projectEnd
      ? workingDaysBetween(projectStart, projectEnd, localWorkingDays, localCalExceptions)
      : null;
    const scheduledPct = projectSpanWd && projectSpanWd > 0
      ? Math.round((totalScheduledWd / projectSpanWd) * 100)
      : null;

    return { totalScheduledWd, scheduledStageCount, projectSpanDays, scheduledPct };
  }, [allDefaultStages, customFlowStages, projectStart, projectEnd, localWorkingDays, localCalExceptions]);

  return (
    <div className="space-y-3">

      {/* ── KPI stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-muted-foreground font-medium">Total Stages</span>
            </div>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{allDefaultStages.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">Completed</span>
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{completedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Flag className="h-3.5 w-3.5 text-[#1D3461]" />
              <span className="text-xs text-muted-foreground font-medium">
                {currentStages.length > 1 ? 'Active Stages' : 'Active Stage'}
              </span>
            </div>
            {currentStages.length > 1 ? (
              <div className="space-y-0.5">
                {currentStages.map(s => (
                  <p key={s.id} className="text-xs font-semibold text-[#1D3461] dark:text-blue-300 leading-tight truncate">
                    {resolvedEntry(s.id)?.customLabel || s.label}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm font-bold text-[#1D3461] dark:text-blue-300 leading-tight line-clamp-2">
                {currentStage ? (resolvedEntry(currentStage.id)?.customLabel || currentStage.label) : '—'}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs text-muted-foreground font-medium">Progress</span>
            </div>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{pct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* ── My Tasks panel ─────────────────────────────────────── */}
      {myAssignedStages.length > 0 && (
        <div className="rounded-xl border border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#1D3461] flex-shrink-0" />
            <span className="text-sm font-semibold text-[#1D3461] dark:text-blue-200">
              My Assigned Stages ({myAssignedStages.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {myAssignedStages.map(stage => {
              const status = getStageStatus(stage.id);
              const entry = resolvedEntry(stage.id);
              const label = entry?.customLabel || stage.label;
              const isBlocked = isStageBlocked(stage.id);
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => {
                    setExpandedIds(prev => new Set([...prev, stage.id]));
                    setTimeout(() => {
                      document.querySelector(`[data-testid="flow-stage-${stage.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border transition-colors',
                    status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' :
                    status === 'current' && !isBlocked ? 'bg-[#1D3461] text-white border-[#1D3461]' :
                    isBlocked ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300' :
                    'bg-white text-slate-700 border-slate-200 hover:border-[#1D3461]/30 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> :
                   isBlocked ? <Ban className="h-3 w-3" /> :
                   status === 'current' ? <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> :
                   <Circle className="h-3 w-3 text-muted-foreground/60" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Toolbar: progress bar + view toggle + actions ─────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: stage count */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Group <span className="font-semibold text-foreground">{currentGroupIdx + 1}</span> of {groups.length}
              {currentStages.length > 1 && <span className="ml-1 text-violet-600 font-medium"> · {currentStages.length} stages in parallel</span>}
            </span>
            {isLastGroup && completedCount === activeCount && (
              <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] px-2 py-0.5">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> All Stages Complete
              </Badge>
            )}
            {skippedCount > 0 && <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{skippedCount} skipped</Badge>}
          </div>

          {/* Right: view toggle + actions */}
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              <Button
                size="sm" variant="ghost"
                className={cn('h-7 px-2.5 rounded-none text-xs gap-1.5', viewMode === 'list' && 'bg-muted')}
                onClick={() => setViewMode('list')}
              >
                <List className="h-3 w-3" /> List
              </Button>
              <Button
                size="sm" variant="ghost"
                className={cn('h-7 px-2.5 rounded-none text-xs gap-1.5 border-l', viewMode === 'gantt' && 'bg-muted')}
                onClick={() => setViewMode('gantt')}
              >
                <BarChart2 className="h-3 w-3" /> Gantt
              </Button>
              <Button
                size="sm" variant="ghost"
                className={cn('h-7 px-2.5 rounded-none text-xs gap-1.5 border-l', viewMode === 'schedule' && 'bg-muted')}
                onClick={() => setViewMode('schedule')}
              >
                <List className="h-3 w-3" /> Schedule
              </Button>
            </div>
            <ExportButton projectId={projectId} projectName={projectName} projectType={projectType} projectCode={projectCode} flow={flow} allDefaultStages={allDefaultStages} customEntries={customFlowStages ?? []} />
            {canEditFlow && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCalendarOpen(true)}
                  className="h-7 text-xs px-3 shrink-0"
                  title="Configure working days and holidays for this project"
                >
                  <CalendarDays className="h-3 w-3 mr-1.5" /> Calendar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="h-7 text-xs px-3 shrink-0" data-testid="button-edit-flow">
                  <Settings2 className="h-3 w-3 mr-1.5" /> Edit Flow
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full rounded-full bg-muted h-2.5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] transition-all duration-700 ease-in-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
          <span>{completedCount} done</span>
          <span>{Math.max(0, remainingCount)} remaining</span>
        </div>
      </div>

      {/* ── Duration summary strip ─────────────────────────────── */}
      {durationSummary && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-[#1D3461]/15 bg-[#0F2041]/[0.04] dark:bg-[#1D3461]/10 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-[#1D3461]/70 flex-shrink-0" />
            <span className="text-xs text-muted-foreground">Project span:</span>
            <span className="text-xs font-semibold text-foreground">
              {durationSummary.projectSpanDays !== null ? `${durationSummary.projectSpanDays} cal days` : '—'}
            </span>
          </div>
          <div className="w-px h-3.5 bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[#1D3461]/70 flex-shrink-0" />
            <span className="text-xs text-muted-foreground">Scheduled stage days:</span>
            <span className="text-xs font-semibold text-foreground">
              {durationSummary.totalScheduledWd} wd
            </span>
            <span className="text-[10px] text-muted-foreground">
              ({durationSummary.scheduledStageCount} of {allDefaultStages.length} stages)
            </span>
          </div>
          {durationSummary.scheduledPct !== null && (
            <>
              <div className="w-px h-3.5 bg-border hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-[#1D3461]/70 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Span scheduled:</span>
                <span className={cn(
                  'text-xs font-semibold',
                  durationSummary.scheduledPct > 100 ? 'text-destructive' :
                  durationSummary.scheduledPct >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                  'text-amber-600 dark:text-amber-400',
                )}>
                  {durationSummary.scheduledPct}%
                </span>
                {durationSummary.scheduledPct > 100 && (
                  <span className="text-[10px] text-destructive font-medium">over-scheduled</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Schedule View (MS Project table) ──────────────────── */}
      {viewMode === 'schedule' && (
        <ScheduleView
          allDefaultStages={allDefaultStages}
          groups={groups}
          stageHistory={stageHistory}
          customEntries={customFlowStages ?? []}
          getStageStatus={getStageStatus}
          projectStart={projectStart}
          projectEnd={projectEnd}
          checklistByStage={checklistByStage}
        />
      )}

      {/* ── Gantt View ─────────────────────────────────────────── */}
      {viewMode === 'gantt' && (
        <GanttView
          allDefaultStages={allDefaultStages}
          groups={groups}
          stageHistory={stageHistory}
          customEntries={customFlowStages ?? []}
          getStageStatus={getStageStatus}
          projectStart={projectStart}
          projectEnd={projectEnd}
          onEditFlow={canEditFlow ? () => setEditOpen(true) : undefined}
          checklistByStage={checklistByStage}
        />
      )}

      {/* ── List View ──────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="space-y-2.5">
          {allDefaultStages.map((stage, idx) => {
            const status = getStageStatus(stage.id);
            const cfg = STATUS_CFG[status];
            const historyEntry = stageHistory.filter(h => h.stageId === stage.id).at(-1);
            const isCurrent = status === 'current';
            const isExpanded = expandedIds.has(stage.id);
            const entry = resolvedEntry(stage.id);
            const displayLabel = entry?.customLabel || stage.label;
            const displayDesc = entry?.customDescription || stage.description;
            const allOutputs = [...(entry?.customOutputs ?? []), ...(stage.keyOutputs ?? [])];
            const hasDetails = allOutputs.length > 0 || !!stage.linkedModule || !!(stage.linkedActions?.length) || !!displayDesc || isCurrent;

            // Parallel info
            const stageGroup = groups.find(g => g.some(s => s.id === stage.id));
            const isInParallelGroup = (stageGroup?.length ?? 0) > 1;
            const parallelPartners = (stageGroup ?? []).filter(s => s.id !== stage.id);

            // Next group's first stage (for advance label)
            const nextGroupStages = groups[currentGroupIdx + 1] ?? [];

            // Date info
            const plannedStart = entry?.plannedStart;
            const plannedEnd = entry?.plannedEnd;
            const dueDate = entry?.dueDate;
            const overdue = isOverdueFn(dueDate || plannedEnd, status);
            const stageNotes = notes[stage.id] ?? '';

            // MS Project features
            const isMilestone = entry?.isMilestone ?? false;
            const percentComplete = entry?.percentComplete ?? null;
            const blockedBy = getBlockedBy(stage.id);
            const blocked = blockedBy.length > 0 && status !== 'completed' && status !== 'skipped';
            // WBS number: position among all non-skipped stages
            const wbsNum = allDefaultStages.filter(s => getStageStatus(s.id) !== 'skipped').findIndex(s => s.id === stage.id) + 1;

            return (
              <div
                key={stage.id}
                className={cn(
                  'rounded-xl border border-l-4 transition-all duration-200',
                  blocked ? 'border-l-orange-400 border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-900/10' : cn(cfg.border, cfg.ring, cfg.bg),
                  isCurrent && !blocked && 'shadow-sm',
                  status === 'skipped' && 'opacity-60',
                )}
                data-testid={`flow-stage-${stage.id}`}
              >
                {/* Card header */}
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D3461]/30 rounded-xl"
                  onClick={() => hasDetails || blocked ? toggleExpand(stage.id) : undefined}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if ((e.key === 'Enter' || e.key === ' ') && (hasDetails || blocked)) {
                      e.preventDefault();
                      toggleExpand(stage.id);
                    }
                  }}
                  aria-expanded={hasDetails ? isExpanded : undefined}
                  data-testid={`button-stage-header-${stage.id}`}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    {/* Status icon — milestone shows diamond, blocked shows ban */}
                    {isMilestone && status !== 'completed' ? (
                      <div className={cn('h-8 w-8 flex items-center justify-center flex-shrink-0 transition-all rotate-45 rounded-sm border-2', blocked ? 'bg-orange-100 border-orange-400 dark:bg-orange-900/30' : cfg.icon, isCurrent && 'ring-2 ring-[#1D3461]/20 ring-offset-1')}>
                        <span className="-rotate-45"><Diamond className="h-3.5 w-3.5" /></span>
                      </div>
                    ) : (
                      <div className={cn('h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all', blocked ? 'bg-orange-100 border-orange-300 dark:bg-orange-900/20 text-orange-500' : cfg.icon, isCurrent && !blocked && 'ring-2 ring-[#1D3461]/20 ring-offset-1')}>
                        {status === 'completed' ? <CheckCircle2 className="h-4 w-4" />
                          : status === 'skipped' ? <SkipForward className="h-3.5 w-3.5" />
                          : blocked ? <Ban className="h-3.5 w-3.5" />
                          : isCurrent ? <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                          : <span className="text-[11px] font-bold">{wbsNum > 0 ? wbsNum : idx + 1}</span>}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* WBS prefix for non-skipped stages */}
                        {status !== 'skipped' && wbsNum > 0 && (
                          <span className="text-[10px] font-mono text-muted-foreground/60 flex-shrink-0">{wbsNum}.0</span>
                        )}
                        {isMilestone && (
                          <Diamond className="h-3 w-3 text-amber-500 flex-shrink-0" title="Milestone" />
                        )}
                        <span className={cn('font-semibold text-sm leading-snug', status === 'skipped' && 'line-through text-muted-foreground', isCurrent && !blocked && 'text-[#1D3461] dark:text-blue-200', blocked && 'text-orange-700 dark:text-orange-300')}>
                          {displayLabel}
                        </span>
                        {blocked ? (
                          <span className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded-full px-1.5 py-0.5 font-medium flex items-center gap-0.5">
                            <Ban className="h-2.5 w-2.5" /> Blocked
                          </span>
                        ) : (
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', cfg.badge)}>
                            {cfg.label}
                          </span>
                        )}
                        {isMilestone && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full px-1.5 py-0.5 font-medium flex items-center gap-0.5">
                            <Diamond className="h-2.5 w-2.5" /> Milestone
                          </span>
                        )}
                        {isInParallelGroup && (
                          <span className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded-full px-1.5 py-0.5 font-medium flex items-center gap-0.5">
                            <Link2 className="h-2.5 w-2.5" /> Parallel
                          </span>
                        )}
                        {stage.typicalDurationDays && status !== 'completed' && status !== 'skipped' && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full px-1.5 py-0.5 font-medium flex items-center gap-0.5" title="Typical duration">
                            <Clock className="h-2.5 w-2.5" />~{stage.typicalDurationDays}d
                          </span>
                        )}
                        {overdue && !blocked && (
                          <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 font-medium">Overdue</span>
                        )}
                        {percentComplete !== null && status !== 'completed' && status !== 'skipped' && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full px-1.5 py-0.5 font-medium flex items-center gap-0.5">
                            <Percent className="h-2.5 w-2.5" />{percentComplete}%
                          </span>
                        )}
                      </div>

                      {/* Date row */}
                      {(plannedStart || plannedEnd || dueDate) && (
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                          {plannedStart && (
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {fmtDate(plannedStart)}
                              {plannedEnd && ` → ${fmtDate(plannedEnd)}`}
                            </span>
                          )}
                          {dueDate && (
                            <span className={cn('flex items-center gap-0.5 font-medium', overdue ? 'text-red-600' : 'text-orange-600')}>
                              <Clock className="h-2.5 w-2.5" /> Due {fmtDate(dueDate)}
                            </span>
                          )}
                          {/* Working-day duration badge */}
                          {plannedStart && plannedEnd && (() => {
                            const wd = workingDaysBetween(plannedStart, plannedEnd, localWorkingDays, localCalExceptions);
                            return wd !== null ? (
                              <span
                                className="flex items-center gap-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 rounded-full px-1.5 py-0 font-medium"
                                title="Working days in this stage"
                              >
                                <CalendarDays className="h-2.5 w-2.5" />{wd} wd
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {historyEntry && (
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>{timeAgo(historyEntry.advancedAt)}</span>
                          {historyEntry.advancedByName && (
                            <><span className="text-muted-foreground/40">·</span><User className="h-3 w-3 flex-shrink-0" /><span>{historyEntry.advancedByName}</span></>
                          )}
                        </div>
                      )}
                      {!historyEntry && displayDesc && !isExpanded && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{displayDesc}</p>
                      )}
                    </div>

                    {/* Assignee avatar stack — visible without expanding */}
                    {(() => {
                      const stageAssignees = assigneesByStage[stage.id] ?? [];
                      return stageAssignees.length > 0 ? (
                        <div className="flex items-center flex-shrink-0 -space-x-1.5">
                          {stageAssignees.slice(0, 3).map((a, ai) => (
                            <div
                              key={a.id}
                              className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[9px] font-bold border-2 border-background flex-shrink-0"
                              title={a.fullName}
                              style={{ zIndex: 3 - ai }}
                            >
                              {a.fullName.charAt(0)}
                            </div>
                          ))}
                          {stageAssignees.length > 3 && (
                            <div
                              className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-bold border-2 border-background flex-shrink-0"
                              title={`+${stageAssignees.length - 3} more`}
                            >
                              +{stageAssignees.length - 3}
                            </div>
                          )}
                        </div>
                      ) : canEditFlow && status !== 'skipped' ? (
                        <div
                          className="flex-shrink-0 h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/40 hover:border-[#1D3461]/40 hover:text-[#1D3461]/60 transition-colors"
                          title="No assignees"
                        >
                          <UserPlus className="h-3 w-3" />
                        </div>
                      ) : null;
                    })()}

                    {/* Per-stage status menu */}
                    {canEditFlow && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                            disabled={isMutatingStageStatus}
                            data-testid={`button-stage-menu-${stage.id}`}
                            title="Change status"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {status !== 'completed' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStageStatus(stage.id, 'mark-complete');
                              }}
                              disabled={isMutatingStageStatus || blocked}
                              data-testid={`menu-stage-complete-${stage.id}`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                              Mark Complete
                            </DropdownMenuItem>
                          )}
                          {status !== 'current' && status !== 'completed' && status !== 'skipped' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStageStatus(stage.id, 'set-current');
                              }}
                              disabled={isMutatingStageStatus || blocked}
                              data-testid={`menu-stage-current-${stage.id}`}
                            >
                              <PlayCircle className="h-3.5 w-3.5 mr-2 text-blue-600" />
                              Set as Current
                            </DropdownMenuItem>
                          )}
                          {status !== 'completed' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStageStatus(stage.id, status === 'skipped' ? 'unskip' : 'skip');
                              }}
                              disabled={isMutatingStageStatus}
                              data-testid={`menu-stage-skip-${stage.id}`}
                            >
                              <SkipForward className="h-3.5 w-3.5 mr-2 text-amber-600" />
                              {status === 'skipped' ? 'Unskip Stage' : 'Skip Stage'}
                            </DropdownMenuItem>
                          )}
                          {/* Milestone toggle — available on any non-completed stage */}
                          {status !== 'completed' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                saveMilestoneForStage(stage.id, !isMilestone);
                              }}
                              disabled={milestoneSaving === stage.id}
                              data-testid={`menu-stage-milestone-${stage.id}`}
                            >
                              <Diamond className={cn('h-3.5 w-3.5 mr-2', isMilestone ? 'text-amber-500 fill-amber-400' : 'text-amber-500')} />
                              {isMilestone ? 'Remove Milestone Flag' : 'Mark as Milestone'}
                            </DropdownMenuItem>
                          )}
                          {status === 'completed' && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetStageStatus(stage.id, 'reopen');
                              }}
                              disabled={isMutatingStageStatus}
                              data-testid={`menu-stage-reopen-${stage.id}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-2 text-slate-600" />
                              Reopen Stage
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {hasDetails && (
                      <div className="flex-shrink-0 text-muted-foreground/60">
                        {isExpanded ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-5 border-t border-border/50">
                    {displayDesc && <p className="text-sm text-muted-foreground pt-3 leading-relaxed">{displayDesc}</p>}

                    {/* ── Milestone info banner ── */}
                    {isMilestone && status !== 'completed' && (
                      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-800 px-3 py-2.5">
                        <Diamond className="h-4 w-4 text-amber-500 fill-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-xs">
                          <p className="font-semibold text-amber-800 dark:text-amber-300">This is a Milestone stage</p>
                          <p className="text-amber-700/80 dark:text-amber-400">
                            Complete all checklist items and work below, then click
                            {' '}<strong>Complete Milestone</strong> at the bottom of this card — the team will be notified automatically.
                            To remove the milestone flag, use the <strong>⋮ menu → Remove Milestone Flag</strong>.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Hint for editors: how to set a milestone on this stage */}
                    {!isMilestone && canEditFlow && status !== 'completed' && status !== 'skipped' && (
                      <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                        <Diamond className="h-3 w-3 text-amber-400 flex-shrink-0" />
                        To mark this stage as a project milestone, click the <strong>⋮ menu → Mark as Milestone</strong>, or use <strong>Edit Flow</strong> and click the diamond icon on this stage row.
                      </p>
                    )}

                    {/* ── Inline stage dates ── */}
                    {canEditFlow && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          <Calendar className="h-3.5 w-3.5" />
                          Dates
                          {dateSaving === stage.id && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium w-8">Start</span>
                          <input
                            type="date"
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            value={plannedStart ?? ''}
                            onChange={e => saveDatesForStage(stage.id, { plannedStart: e.target.value || null })}
                            data-testid={`date-start-${stage.id}`}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium w-6">End</span>
                          <input
                            type="date"
                            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            value={plannedEnd ?? ''}
                            onChange={e => saveDatesForStage(stage.id, { plannedEnd: e.target.value || null })}
                            data-testid={`date-end-${stage.id}`}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium w-7 text-orange-600">Due</span>
                          <input
                            type="date"
                            className="h-7 rounded-md border border-orange-200 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                            value={dueDate ?? ''}
                            onChange={e => saveDatesForStage(stage.id, { dueDate: e.target.value || null })}
                            data-testid={`date-due-${stage.id}`}
                          />
                        </label>
                      </div>
                    )}
                    {!canEditFlow && (plannedStart || plannedEnd || dueDate) && (
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {plannedStart && <span>{fmtDate(plannedStart)}{plannedEnd ? ` → ${fmtDate(plannedEnd)}` : ''}</span>}
                        {dueDate && <span className={cn('font-medium', overdue ? 'text-red-600' : 'text-orange-600')}>Due {fmtDate(dueDate)}</span>}
                      </div>
                    )}

                    {/* Blocked by dependencies warning */}
                    {blocked && (
                      <div className="flex items-start gap-2 text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2.5 mt-3">
                        <Ban className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-orange-800 dark:text-orange-300">Stage Blocked</p>
                          <p className="text-orange-700 dark:text-orange-400 mt-0.5">
                            Waiting for completion of: <span className="font-medium">{blockedBy.join(', ')}</span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* % Complete — inline editable for editors, read-only otherwise */}
                    {status !== 'completed' && status !== 'skipped' && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium">
                            <Percent className="h-3 w-3" /> Progress
                            {percentSaving === stage.id && <Loader2 className="h-2.5 w-2.5 animate-spin ml-1" />}
                          </span>
                          {canEditFlow ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={percentComplete ?? 0}
                                onChange={e => savePercentForStage(stage.id, parseInt(e.target.value))}
                                className="w-24 h-1.5 accent-[#1D3461] cursor-pointer"
                                data-testid={`slider-percent-${stage.id}`}
                              />
                              <span className="font-semibold w-8 text-right">{percentComplete ?? 0}%</span>
                            </div>
                          ) : (
                            <span className="font-semibold">{percentComplete ?? 0}%</span>
                          )}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] transition-all duration-500"
                            style={{ width: `${percentComplete ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Parallel partners */}
                    {isInParallelGroup && parallelPartners.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-violet-50 dark:bg-violet-900/20 rounded-lg px-3 py-2">
                        <Link2 className="h-3.5 w-3.5 text-violet-600 flex-shrink-0" />
                        <span>Running in parallel with: <span className="font-medium text-violet-700 dark:text-violet-300">{parallelPartners.map(s => resolvedEntry(s.id)?.customLabel || s.label).join(', ')}</span></span>
                      </div>
                    )}

                    {/* Completion record */}
                    {historyEntry && (
                      <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Completion Record</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTimestamp(historyEntry.advancedAt)}</span>
                          {historyEntry.advancedByName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{historyEntry.advancedByName}</span>}
                          {historyEntry.notes && <span className="flex items-start gap-1"><FileText className="h-3 w-3 mt-0.5 flex-shrink-0" />{historyEntry.notes}</span>}
                        </div>
                      </div>
                    )}

                    {/* Key Outputs — editable (defaults can be hidden via ~~rm~~: sentinel) */}
                    {(() => {
                      // Sentinel prefix used to mark a removed default output
                      const RM = '~~rm~~:';
                      const editing = outputsState[stage.id];
                      // Strip any sentinel strings that leaked into keyOutputs
                      const allDefaultItems: string[] = (stage.keyOutputs ?? []).filter(o => !o.startsWith(RM));

                      // Sentinels stored in customOutputs mark defaults the user removed
                      const rawCustom = entry?.customOutputs ?? [];
                      const removedDefaultKeys = new Set(
                        rawCustom
                          .filter(o => o.startsWith(RM))
                          .map(o => o.slice(RM.length).trim().toLowerCase())
                      );
                      // Visible defaults = all defaults except those the user removed
                      const visibleDefaults = allDefaultItems.filter(
                        d => !removedDefaultKeys.has(d.trim().toLowerCase())
                      );
                      // De-dup real custom items (strip sentinels + duplicates of defaults)
                      const defaultSet = new Set(allDefaultItems.map(s => s.trim().toLowerCase()));
                      const deduped = rawCustom.filter(
                        o => !o.startsWith(RM) && !defaultSet.has(o.trim().toLowerCase())
                      );

                      // In edit mode, show what's currently in the editing buffer; otherwise deduped
                      const customItems: string[] = editing?.items ?? deduped;
                      const inputVal = editing?.inputVal ?? '';
                      const isSaving = outputsSaving === stage.id;
                      const showEdit = canEditFlow;
                      const isEditing = !!editing;
                      const hasAny = visibleDefaults.length > 0 || customItems.length > 0 || allDefaultItems.length > 0;

                      const startEdit = () => {
                        if (!editing) {
                          setOutputsState(prev => ({
                            ...prev,
                            [stage.id]: { items: deduped, inputVal: '' },
                          }));
                        }
                      };

                      const addOutput = async () => {
                        const val = (editing?.inputVal ?? '').trim();
                        if (!val) return;
                        // Preserve existing sentinels + add new item
                        const sentinels = rawCustom.filter(o => o.startsWith(RM));
                        await saveOutputsForStage(stage.id, [...sentinels, ...customItems, val]);
                      };

                      // Remove a user-added custom item (never a sentinel)
                      const removeCustom = async (idx: number) => {
                        const sentinels = rawCustom.filter(o => o.startsWith(RM));
                        const newItems = customItems.filter((_, i) => i !== idx);
                        await saveOutputsForStage(stage.id, [...sentinels, ...newItems]);
                      };

                      // Remove a default item by adding a sentinel
                      const removeDefault = async (text: string) => {
                        const sentinel = `${RM}${text}`;
                        const existing = rawCustom.filter(o => o !== sentinel);
                        await saveOutputsForStage(stage.id, [...existing, sentinel]);
                        // Also update local state so it disappears immediately
                        setOutputsState(prev => ({
                          ...prev,
                          [stage.id]: { items: customItems, inputVal: editing?.inputVal ?? '' },
                        }));
                      };

                      if (!hasAny && !showEdit) return null;

                      return (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            <ListChecks className="h-3.5 w-3.5" /> Key Outputs
                            {showEdit && !isEditing && (
                              <button
                                onClick={startEdit}
                                className="ml-1 text-[10px] text-blue-500 hover:text-blue-700 font-normal normal-case tracking-normal underline underline-offset-2"
                                data-testid={`btn-edit-outputs-${stage.id}`}
                              >
                                edit
                              </button>
                            )}
                            {showEdit && isEditing && (
                              <span className="ml-1 text-[10px] text-blue-500 font-normal normal-case tracking-normal">
                                editing — hover item to delete
                              </span>
                            )}
                            {isSaving && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                          </div>

                          {!hasAny && (
                            <p className="text-xs text-muted-foreground italic mb-2">No key outputs defined yet.</p>
                          )}

                          <ul className="space-y-1.5">
                            {/* Default outputs — removable in edit mode via sentinel */}
                            {visibleDefaults.map((output, oi) => (
                              <li key={`def-${oi}`} className="flex items-start gap-2 text-sm text-muted-foreground group/out">
                                <CheckCircle2 className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status === 'completed' ? 'text-emerald-500' : 'text-muted-foreground/30')} />
                                <span className="flex-1">{output}</span>
                                {showEdit && (
                                  <button
                                    onClick={() => removeDefault(output)}
                                    disabled={isSaving}
                                    className="opacity-0 group-hover/out:opacity-100 transition-opacity text-destructive hover:text-red-700 ml-1 flex-shrink-0"
                                    title="Remove this output"
                                    data-testid={`btn-remove-default-${stage.id}-${oi}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </li>
                            ))}
                            {/* User-added custom outputs — removable */}
                            {customItems.map((output, oi) => (
                              <li key={`cus-${oi}`} className="flex items-start gap-2 text-sm text-muted-foreground group/out">
                                <CheckCircle2 className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status === 'completed' ? 'text-emerald-500' : 'text-blue-400')} />
                                <span className="flex-1">{output}</span>
                                {showEdit && (
                                  <button
                                    onClick={() => removeCustom(oi)}
                                    disabled={isSaving}
                                    className="opacity-0 group-hover/out:opacity-100 transition-opacity text-destructive hover:text-red-700 ml-1 flex-shrink-0"
                                    title="Remove output"
                                    data-testid={`btn-remove-output-${stage.id}-${oi}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>

                          {showEdit && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <Input
                                value={inputVal}
                                onChange={e => setOutputsState(prev => ({
                                  ...prev,
                                  [stage.id]: { items: customItems, inputVal: e.target.value },
                                }))}
                                onFocus={startEdit}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOutput(); } }}
                                placeholder="Add a key output…"
                                className="h-7 text-xs flex-1"
                                disabled={isSaving}
                                data-testid={`input-new-output-${stage.id}`}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={addOutput}
                                disabled={isSaving || !inputVal.trim()}
                                data-testid={`btn-add-output-${stage.id}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Report Risk — always visible for editors */}
                    {canEditFlow && (
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                          onClick={() => {
                            setRiskStageId(stage.id);
                            setRiskForm({ title: '', risk_score: 3, mitigation_plan: '' });
                          }}
                          data-testid={`btn-report-risk-${stage.id}`}
                        >
                          <Flag className="h-3.5 w-3.5 mr-1.5" />
                          Report Risk
                        </Button>
                      </div>
                    )}

                    {/* Linked actions — multi-button per stage */}
                    {(() => {
                      const ICON_MAP: Record<StageActionIcon, React.ReactNode> = {
                        hub:      <Building2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        'hub-map':<Map className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        mmp:      <FileText className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        visits:   <ClipboardCheck className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        reports:  <BarChart2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        budget:   <DollarSign className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        costs:    <Receipt className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        docs:     <FolderOpen className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        staff:    <Users className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        finance:  <Landmark className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                        wallet:   <Wallet className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />,
                      };
                      const actions = stage.linkedActions ?? (stage.linkedModule ? [{
                        label: ({
                          '/mmp-management': 'MMP Management',
                          '/hub-operations': 'Hub Operations',
                          '/site-visits': 'Site Visits',
                          '/reports': 'Reports',
                          '/projects': 'Projects',
                          '/finance': 'Finance',
                          '/wallet': 'Wallet',
                          '/budget': 'Budget',
                          '/documents': 'Documents',
                          '/staff-directory': 'Staff Directory',
                          '/hub-management': 'Hub Management',
                        } as Record<string, string>)[stage.linkedModule] ?? stage.linkedModule.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        route: stage.linkedModule,
                        icon: 'visits' as StageActionIcon,
                      }] : []);
                      if (actions.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {actions.map((action, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => navigate(action.route)}
                              data-testid={`button-goto-action-${stage.id}-${idx}`}
                            >
                              {ICON_MAP[action.icon as StageActionIcon] ?? <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Per-stage data: Assignees, Checklist, Attachments */}
                    <div className="grid gap-3 pt-1">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <StageAssignees
                          projectId={projectId}
                          stageId={stage.id}
                          stageLabel={displayLabel}
                          projectName={projectName}
                          currentUserId={currentUserId}
                          assignedByName={currentUser?.fullName ?? 'A manager'}
                          canEdit={canEditFlow}
                          notifyUserIds={teamUserIds ?? []}
                          stageStart={plannedStart ?? undefined}
                          stageEnd={plannedEnd ?? undefined}
                          workingDays={localWorkingDays}
                          calendarExceptions={localCalExceptions}
                        />
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <StageChecklist
                          projectId={projectId}
                          stageId={stage.id}
                          currentUserId={currentUserId}
                          currentUserName={currentUser?.fullName}
                          canEdit={canEditFlow}
                          teamUserIds={teamUserIds ?? []}
                          projectName={projectName}
                          stageName={displayLabel}
                          stageStart={plannedStart ?? undefined}
                          stageEnd={plannedEnd ?? undefined}
                          workingDays={localWorkingDays}
                          calendarExceptions={localCalExceptions}
                        />
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <StageAttachments projectId={projectId} stageId={stage.id} currentUserId={currentUserId} canEdit={canEditFlow} />
                      </div>
                    </div>

                    {/* ── Advance control (current stage, not yet completed) ── */}
                    {isCurrent && canAdvance && !isStageCompleted(stage.id) && (
                      <div className={cn(
                        'rounded-xl border p-4 space-y-3',
                        blocked
                          ? 'border-orange-200 bg-orange-50/60 dark:bg-orange-900/10 dark:border-orange-800'
                          : 'border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10'
                      )}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {blocked ? <Ban className="h-4 w-4 text-orange-500 flex-shrink-0" /> : <ArrowRight className="h-4 w-4 text-[#1D3461] flex-shrink-0" />}
                          <p className={cn('text-sm font-semibold', blocked ? 'text-orange-700 dark:text-orange-300' : 'text-[#1D3461] dark:text-blue-200')}>
                            {blocked
                              ? `Cannot advance — waiting for: ${blockedBy.join(', ')}`
                              : isInParallelGroup
                                ? `Mark "${displayLabel}" as complete`
                                : `Advance to: ${nextGroupStages[0] ? (resolvedEntry(nextGroupStages[0].id)?.customLabel || nextGroupStages[0].label) : 'next stage'}`}
                          </p>
                          {!blocked && isInParallelGroup && (
                            <span className="text-xs text-muted-foreground">
                              (Flow advances when all {stageGroup?.length} parallel stages are done)
                            </span>
                          )}
                        </div>
                        {!blocked && (
                          <>
                            <div className="space-y-1.5">
                              <Label htmlFor={`advance-notes-${stage.id}`} className="text-xs font-medium text-muted-foreground">
                                {isInParallelGroup ? 'Completion notes (optional)' : 'Transition notes (optional)'}
                              </Label>
                              <Textarea
                                id={`advance-notes-${stage.id}`}
                                placeholder="What was achieved? Any handoff notes..."
                                value={stageNotes}
                                onChange={e => setNotes(prev => ({ ...prev, [stage.id]: e.target.value }))}
                                rows={2} className="text-sm resize-none" data-testid="input-advance-notes"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <Button
                                size="sm"
                                onClick={() => handleCompleteStage(stage.id)}
                                disabled={isAdvancing || blocked}
                                className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
                                data-testid="button-confirm-advance"
                              >
                                {isAdvancing ? (
                                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Completing…</>
                                ) : (
                                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                    {isMilestone
                                      ? 'Complete Milestone'
                                      : isInParallelGroup
                                        ? 'Mark Stage Complete'
                                        : 'Mark Complete & Advance'}
                                  </>
                                )}
                              </Button>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                {isMilestone ? 'Team will be notified (Milestone!)' : 'Team will be notified'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Stage completed badge (for parallel partners) */}
                    {isCurrent && isStageCompleted(stage.id) && (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 px-4 py-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
                          This stage is complete{isInParallelGroup ? ' — waiting for parallel partners' : ''}.
                        </p>
                      </div>
                    )}

                    {/* Final stage message */}
                    {isCurrent && isLastGroup && !isInParallelGroup && (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 px-4 py-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">This is the final stage!</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Project Calendar Dialog ──────────────────────────────── */}
      <ProjectCalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        projectId={projectId}
        projectName={projectName}
        onSaved={(wd, exc) => {
          setLocalWorkingDays(wd);
          setLocalCalExceptions(exc);
        }}
      />

      {/* ── Edit Flow Dialog ─────────────────────────────────────── */}
      <EditFlowDialog
        open={editOpen} onClose={() => setEditOpen(false)}
        customEntries={customEntries} setCustomEntries={setCustomEntries}
        allDefaultStages={allDefaultStages} projectName={projectName}
        isSaving={isSavingCustom} onSave={handleSaveCustom} onReset={handleResetCustom}
        getStageStatus={getStageStatus}
      />

      {/* ── Report Risk Dialog ───────────────────────────────────── */}
      <Dialog open={!!riskStageId} onOpenChange={open => { if (!open) setRiskStageId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Flag className="h-4 w-4" /> Report a Risk
            </DialogTitle>
            <DialogDescription>
              Log a risk or challenge for this project. It will appear in the Risks tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-semibold mb-1 block">Risk / Challenge *</Label>
              <Input
                value={riskForm.title}
                onChange={e => setRiskForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Describe the risk or challenge…"
                data-testid="input-risk-title"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Risk Level (1 = Low · 5 = Critical)</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRiskForm(p => ({ ...p, risk_score: n }))}
                    className={`h-8 w-8 rounded-md border text-sm font-bold transition-all ${
                      riskForm.risk_score === n
                        ? n <= 2 ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/40 dark:border-green-500'
                        : n === 3 ? 'bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900/40 dark:border-amber-500'
                        : 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/40 dark:border-red-500'
                        : 'border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/50'
                    }`}
                    data-testid={`btn-risk-score-${n}`}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {riskForm.risk_score <= 2 ? 'Low' : riskForm.risk_score === 3 ? 'Medium' : riskForm.risk_score === 4 ? 'High' : 'Critical'}
                </span>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Mitigation / Action Required</Label>
              <Textarea
                value={riskForm.mitigation_plan}
                onChange={e => setRiskForm(p => ({ ...p, mitigation_plan: e.target.value }))}
                placeholder="What action is needed to address this risk?"
                rows={3}
                data-testid="textarea-risk-mitigation"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiskStageId(null)}>Cancel</Button>
            <Button
              onClick={handleSaveRisk}
              disabled={savingRisk || !riskForm.title.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="btn-submit-risk"
            >
              {savingRisk ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Flag className="h-4 w-4 mr-1" />}
              Report Risk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
