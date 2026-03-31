import { useState, useEffect, useMemo } from 'react';
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
import type { FlowStage } from '@/config/projectFlows';
import { StageAssignees } from './StageAssignees';
import { StageChecklist } from './StageChecklist';
import { StageAttachments } from './StageAttachments';
import { useAllStageAssignees } from '@/hooks/useStageData';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GanttView } from './GanttView';
import { exportFlowPDF, exportFlowDocx } from './flowExport';

type ViewMode = 'list' | 'gantt';

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
    border: 'border-l-slate-300',
    bg: 'bg-slate-50/40 dark:bg-slate-800/10',
    ring: 'border-dashed border-slate-200 dark:border-slate-700',
    icon: 'bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-800',
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
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
            const stageDef = allDefaultStages.find(s => s.id === entry.id);
            if (!stageDef) return null;
            const isExpanded = expandedEditIds.has(entry.id);
            const displayLabel = entry.customLabel || stageDef.label;
            const status = getStageStatus(entry.id);
            const isParallel = entry.parallelGroup != null;

            return (
              <div key={entry.id} className={cn(
                'rounded-xl border transition-colors overflow-hidden',
                entry.skipped ? 'bg-slate-50 dark:bg-slate-800/30 border-dashed border-slate-200 opacity-70' : 'bg-white dark:bg-slate-900 border-border',
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
                      <p className={cn('text-sm font-medium truncate', entry.skipped && 'line-through text-muted-foreground')}>
                        {displayLabel}
                        {entry.customLabel && entry.customLabel !== stageDef.label && <span className="ml-1 text-[10px] text-[#1D3461]">(custom)</span>}
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
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => toggleEditExpand(entry.id)} title="Edit details">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
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
                      <Textarea placeholder={stageDef.description ?? ''} value={entry.customDescription ?? ''} onChange={e => updateEntry(entry.id, { customDescription: e.target.value })} rows={2} className="text-sm resize-none" />
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
                      {(entry.customOutputs ?? []).map((output, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-muted-foreground/40 text-sm">+</span>
                          <Input value={output} onChange={e => updateOutput(entry.id, oi, e.target.value)} placeholder="Custom output item..." className="h-7 text-xs flex-1" />
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeOutput(entry.id, oi)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
  projectStart, projectEnd, allDefaultStages, customFlowStages,
}: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const {
    activeStages, groups, currentStages, currentStage, currentStageIndex, currentGroupIdx,
    stageHistory, isLastGroup, canAdvance, canEditFlow,
    isAdvancing, isSavingCustom,
    completeStage, updateCustomStages, getStageStatus, isStageCompleted,
    getBlockedBy, isStageBlocked,
  } = flow;

  // Load ALL stage assignees for this project in one query
  const { data: allAssignees = [] } = useAllStageAssignees(projectId);

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

  const completedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'completed').length;
  const skippedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'skipped').length;
  const remainingCount = allDefaultStages.length - completedCount - skippedCount - currentStages.length;
  const activeCount = allDefaultStages.filter(s => getStageStatus(s.id) !== 'skipped').length;
  const pct = activeCount > 0 ? Math.round((completedCount / activeCount) * 100) : 0;

  return (
    <div className="space-y-5">

      {/* ── KPI stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-muted-foreground font-medium">Total Stages</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{allDefaultStages.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs text-muted-foreground font-medium">Completed</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{completedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
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
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs text-muted-foreground font-medium">Progress</span>
            </div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pct}%</p>
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
            </div>
            <ExportButton projectId={projectId} projectName={projectName} projectType={projectType} projectCode={projectCode} flow={flow} allDefaultStages={allDefaultStages} customEntries={customFlowStages ?? []} />
            {canEditFlow && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="h-7 text-xs px-3 shrink-0" data-testid="button-edit-flow">
                <Settings2 className="h-3 w-3 mr-1.5" /> Edit Flow
              </Button>
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
            const hasDetails = allOutputs.length > 0 || !!stage.linkedModule || !!displayDesc || isCurrent;

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
                <button type="button" className="w-full text-left" onClick={() => hasDetails || blocked ? toggleExpand(stage.id) : undefined}>
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
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
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

                    {hasDetails && (
                      <div className="flex-shrink-0 text-muted-foreground/60">
                        {isExpanded ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-5 border-t border-border/50">
                    {displayDesc && <p className="text-sm text-muted-foreground pt-3 leading-relaxed">{displayDesc}</p>}

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

                    {/* % Complete bar (when manually set) */}
                    {percentComplete !== null && status !== 'completed' && status !== 'skipped' && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium"><Percent className="h-3 w-3" /> Progress</span>
                          <span className="font-semibold">{percentComplete}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] transition-all duration-500"
                            style={{ width: `${percentComplete}%` }}
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

                    {/* Key outputs */}
                    {allOutputs.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          <ListChecks className="h-3.5 w-3.5" /> Key Outputs
                        </div>
                        <ul className="space-y-1.5">
                          {allOutputs.map((output, oi) => (
                            <li key={oi} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <CheckCircle2 className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status === 'completed' ? 'text-emerald-500' : 'text-muted-foreground/30')} />
                              <span>{output}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Linked module */}
                    {stage.linkedModule && (
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate(stage.linkedModule!)} data-testid={`button-goto-module-${stage.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Go to {({
                          '/mmp-management': 'MMP Management',
                          '/hub-operations': 'Hub Operations',
                          '/site-visits': 'Site Visits',
                          '/reports': 'Reports',
                          '/projects': 'Projects',
                          '/finance': 'Finance',
                          '/wallet': 'Wallet',
                        } as Record<string, string>)[stage.linkedModule] ?? stage.linkedModule.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Button>
                    )}

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
                        />
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <StageChecklist projectId={projectId} stageId={stage.id} currentUserId={currentUserId} canEdit={canEditFlow} />
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

      {/* ── Edit Flow Dialog ─────────────────────────────────────── */}
      <EditFlowDialog
        open={editOpen} onClose={() => setEditOpen(false)}
        customEntries={customEntries} setCustomEntries={setCustomEntries}
        allDefaultStages={allDefaultStages} projectName={projectName}
        isSaving={isSavingCustom} onSave={handleSaveCustom} onReset={handleResetCustom}
        getStageStatus={getStageStatus}
      />
    </div>
  );
}
