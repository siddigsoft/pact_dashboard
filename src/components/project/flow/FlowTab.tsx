import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
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
  GripVertical,
  Download,
  FileDown,
  Plus,
  X,
  Pencil,
  ChevronRight,
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
import { format, formatDistanceToNow } from 'date-fns';
import type { UseProjectFlowReturn, CustomStageEntry } from '@/hooks/useProjectFlow';
import type { FlowStage } from '@/config/projectFlows';
import { StageAssignees } from './StageAssignees';
import { StageChecklist } from './StageChecklist';
import { StageAttachments } from './StageAttachments';
import { exportFlowPDF, exportFlowDocx } from './flowExport';
import { useStageAssignees, useStageChecklist, useStageAttachments } from '@/hooks/useStageData';

interface Props {
  flow: UseProjectFlowReturn;
  projectName: string;
  projectType: string;
  projectCode?: string;
  projectId: string;
  currentUserId?: string;
  allDefaultStages: FlowStage[];
  customFlowStages?: CustomStageEntry[];
}

function formatTimestamp(iso: string) {
  try { return format(new Date(iso), 'dd MMM yyyy, HH:mm'); } catch { return iso; }
}
function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ''; }
}

const STATUS_CFG = {
  completed: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/60 dark:bg-emerald-900/10',
    ring: 'border-emerald-200 dark:border-emerald-800',
    icon: 'bg-emerald-500 text-white border-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    label: 'Completed',
  },
  current: {
    border: 'border-l-[#1D3461]',
    bg: 'bg-[#0F2041]/5 dark:bg-[#1D3461]/10',
    ring: 'border-[#1D3461]/40 dark:border-[#1D3461]/60',
    icon: 'bg-[#1D3461] text-white border-[#1D3461]',
    badge: 'bg-[#1D3461]/10 text-[#1D3461] dark:bg-[#1D3461]/30 dark:text-blue-300',
    dot: 'bg-[#1D3461]',
    label: 'In Progress',
  },
  skipped: {
    border: 'border-l-slate-300',
    bg: 'bg-slate-50/40 dark:bg-slate-800/10',
    ring: 'border-dashed border-slate-200 dark:border-slate-700',
    icon: 'bg-slate-100 text-slate-400 border-slate-300 dark:bg-slate-800',
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-300',
    label: 'Skipped',
  },
  upcoming: {
    border: 'border-l-slate-200',
    bg: 'bg-background',
    ring: 'border-border',
    icon: 'bg-background text-muted-foreground border-border',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-200',
    label: 'Upcoming',
  },
};

// ── Export helpers ─────────────────────────────────────────────────────────

function ExportButton({
  projectId, projectName, projectType, projectCode, flow, allDefaultStages, customEntries,
}: {
  projectId: string; projectName: string; projectType: string; projectCode?: string;
  flow: UseProjectFlowReturn; allDefaultStages: FlowStage[]; customEntries: CustomStageEntry[];
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  // Gather per-stage data at export time by calling a simple query
  const doExport = async (type: 'pdf' | 'docx') => {
    setExporting(type);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const stageIds = allDefaultStages.map(s => s.id);
      const [assigneesRes, checklistRes, attachmentsRes] = await Promise.all([
        supabase.from('project_stage_assignees').select('stage_id, profiles:user_id(full_name, role)').eq('project_id', projectId),
        supabase.from('project_stage_checklist').select('stage_id, item_text, completed').eq('project_id', projectId),
        supabase.from('project_stage_attachments').select('stage_id, file_name, file_url, file_type, file_size').eq('project_id', projectId),
      ]);

      const extras: Record<string, any> = {};
      stageIds.forEach(sid => {
        extras[sid] = {
          assignees: (assigneesRes.data ?? []).filter((r: any) => r.stage_id === sid).map((r: any) => ({
            id: sid + r.profiles?.full_name, userId: '', fullName: r.profiles?.full_name ?? '', role: r.profiles?.role ?? '', avatarUrl: null, assignedAt: '',
          })),
          checklist: (checklistRes.data ?? []).filter((r: any) => r.stage_id === sid).map((r: any) => ({
            id: sid, itemText: r.item_text, completed: r.completed, completedBy: null, completedAt: null, createdAt: '', sortOrder: 0,
          })),
          attachments: (attachmentsRes.data ?? []).filter((r: any) => r.stage_id === sid).map((r: any) => ({
            id: sid, fileName: r.file_name, fileUrl: r.file_url, fileType: r.file_type, fileSize: r.file_size, uploadedByName: null, createdAt: '',
          })),
        };
      });

      const exportData = {
        projectName, projectType, projectCode,
        stages: allDefaultStages,
        stageHistory: flow.stageHistory,
        currentStageId: flow.currentStage?.id ?? null,
        extras,
        customEntries,
      };

      if (type === 'pdf') {
        await exportFlowPDF(exportData);
      } else {
        await exportFlowDocx(exportData);
      }
      toast({ title: `${type.toUpperCase()} exported successfully` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(null);
    }
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
        <DropdownMenuItem onClick={() => doExport('pdf')}>
          <FileText className="h-3.5 w-3.5 mr-2 text-red-500" /> Export PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => doExport('docx')}>
          <FileText className="h-3.5 w-3.5 mr-2 text-blue-500" /> Export Word (.docx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Edit Flow Dialog ───────────────────────────────────────────────────────

interface EditFlowDialogProps {
  open: boolean;
  onClose: () => void;
  customEntries: CustomStageEntry[];
  setCustomEntries: (entries: CustomStageEntry[]) => void;
  allDefaultStages: FlowStage[];
  projectName: string;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
  getStageStatus: (id: string) => 'completed' | 'current' | 'upcoming' | 'skipped';
}

function EditFlowDialog({
  open, onClose, customEntries, setCustomEntries, allDefaultStages, projectName,
  isSaving, onSave, onReset, getStageStatus,
}: EditFlowDialogProps) {
  const [expandedEditIds, setExpandedEditIds] = useState<Set<string>>(new Set());

  const toggleEditExpand = (id: string) => {
    setExpandedEditIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const updateEntry = (id: string, patch: Partial<CustomStageEntry>) => {
    setCustomEntries(customEntries.map(e => (e.id === id ? { ...e, ...patch } : e)));
  };

  const moveEntry = (idx: number, direction: 'up' | 'down') => {
    const next = [...customEntries];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setCustomEntries(next);
  };

  const toggleSkip = (id: string) => {
    setCustomEntries(customEntries.map(e => (e.id === id ? { ...e, skipped: !e.skipped } : e)));
  };

  const addOutput = (id: string) => {
    const entry = customEntries.find(e => e.id === id);
    const outputs = entry?.customOutputs ?? [];
    updateEntry(id, { customOutputs: [...outputs, ''] });
  };

  const updateOutput = (id: string, outputIdx: number, value: string) => {
    const entry = customEntries.find(e => e.id === id);
    const outputs = [...(entry?.customOutputs ?? [])];
    outputs[outputIdx] = value;
    updateEntry(id, { customOutputs: outputs });
  };

  const removeOutput = (id: string, outputIdx: number) => {
    const entry = customEntries.find(e => e.id === id);
    const outputs = (entry?.customOutputs ?? []).filter((_, i) => i !== outputIdx);
    updateEntry(id, { customOutputs: outputs });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-[#1D3461]" />
            Edit Project Flow
          </DialogTitle>
          <DialogDescription>
            Reorder, rename, or configure stages for <strong>{projectName}</strong>. Changes only affect this project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
          {customEntries.map((entry, idx) => {
            const stageDef = allDefaultStages.find(s => s.id === entry.id);
            if (!stageDef) return null;
            const isExpanded = expandedEditIds.has(entry.id);
            const displayLabel = entry.customLabel || stageDef.label;
            const status = getStageStatus(entry.id);

            return (
              <div
                key={entry.id}
                className={cn(
                  'rounded-xl border transition-colors overflow-hidden',
                  entry.skipped
                    ? 'bg-slate-50 dark:bg-slate-800/30 border-dashed border-slate-200 dark:border-slate-700 opacity-70'
                    : 'bg-white dark:bg-slate-900 border-border',
                  isExpanded && 'border-[#1D3461]/30 shadow-sm',
                )}
              >
                {/* Row header */}
                <div className="flex items-center gap-2 p-3">
                  {/* Stage number */}
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === 0} onClick={() => moveEntry(idx, 'up')}>
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={idx === customEntries.length - 1} onClick={() => moveEntry(idx, 'down')}>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Stage info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn('text-sm font-medium truncate', entry.skipped && 'line-through text-muted-foreground')}>
                        {displayLabel}
                        {entry.customLabel && entry.customLabel !== stageDef.label && (
                          <span className="ml-1.5 text-[10px] text-[#1D3461] font-normal not-italic">(custom)</span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {entry.customDescription || stageDef.description}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0', STATUS_CFG[status].badge)}>
                    {STATUS_CFG[status].label}
                  </span>

                  {/* Skip toggle */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Label htmlFor={`skip-${entry.id}`} className="text-xs text-muted-foreground cursor-pointer">Skip</Label>
                    <Switch
                      id={`skip-${entry.id}`}
                      checked={entry.skipped ?? false}
                      onCheckedChange={() => toggleSkip(entry.id)}
                    />
                  </div>

                  {/* Expand detail edit */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => toggleEditExpand(entry.id)}
                    title="Edit stage details"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>

                {/* Expanded detail editor */}
                {isExpanded && (
                  <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                    {/* Custom label */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Stage Name (override)
                      </Label>
                      <Input
                        placeholder={stageDef.label}
                        value={entry.customLabel ?? ''}
                        onChange={e => updateEntry(entry.id, { customLabel: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">Leave blank to use the default: "{stageDef.label}"</p>
                    </div>

                    {/* Custom description */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Description (override)
                      </Label>
                      <Textarea
                        placeholder={stageDef.description ?? 'Stage description...'}
                        value={entry.customDescription ?? ''}
                        onChange={e => updateEntry(entry.id, { customDescription: e.target.value })}
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>

                    {/* Custom key outputs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Custom Key Outputs
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => addOutput(entry.id)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Output
                        </Button>
                      </div>

                      {/* Default outputs (read-only preview) */}
                      {stageDef.keyOutputs && stageDef.keyOutputs.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground font-medium">Default outputs (always shown):</p>
                          {stageDef.keyOutputs.map((o, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                              <span>{o}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Custom outputs (editable) */}
                      {(entry.customOutputs ?? []).length > 0 && (
                        <div className="space-y-1.5">
                          {(entry.customOutputs ?? []).map((output, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <span className="text-muted-foreground/40">+</span>
                              <Input
                                value={output}
                                onChange={e => updateOutput(entry.id, oIdx, e.target.value)}
                                placeholder="Custom output item..."
                                className="h-7 text-xs flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeOutput(entry.id, oIdx)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {(entry.customOutputs ?? []).length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">No custom outputs added yet</p>
                      )}
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
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
            data-testid="button-save-flow"
          >
            {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : 'Save Flow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function FlowTab({
  flow, projectName, projectType, projectCode, projectId, currentUserId, allDefaultStages, customFlowStages,
}: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    activeStages, currentStage, currentStageIndex, stageHistory,
    isLastStage, canAdvance, canEditFlow, isAdvancing, isSavingCustom,
    advanceStage, updateCustomStages, getStageStatus,
  } = flow;

  const [editOpen, setEditOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [customEntries, setCustomEntries] = useState<CustomStageEntry[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Resolve effective custom entry per stage (for label overrides in main view)
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

  useEffect(() => {
    if (currentStage) {
      setExpandedIds(prev => new Set([...prev, currentStage.id]));
    }
  }, [currentStage?.id]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAdvance = async () => {
    try {
      await advanceStage(notes);
      toast({ title: 'Stage advanced', description: 'Team has been notified.' });
      setNotes('');
    } catch (err: any) {
      toast({ title: 'Failed to advance stage', description: err.message, variant: 'destructive' });
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

  const nextStage = !isLastStage ? activeStages[currentStageIndex + 1] : null;
  const pct = Math.round(((currentStageIndex + 1) / activeStages.length) * 100);
  const completedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'completed').length;
  const skippedCount = allDefaultStages.filter(s => getStageStatus(s.id) === 'skipped').length;
  const remainingCount = allDefaultStages.length - completedCount - skippedCount - 1;

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
              <span className="text-xs text-muted-foreground font-medium">Active Stage</span>
            </div>
            <p className="text-sm font-bold text-[#1D3461] dark:text-blue-300 leading-tight line-clamp-2">
              {currentStage ? (resolvedEntry(currentStage.id)?.customLabel || currentStage.label) : '—'}
            </p>
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

      {/* ── Progress bar + header actions ──────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Stage <span className="font-semibold text-foreground">{currentStageIndex + 1}</span> of {activeStages.length}
            </span>
            {isLastStage && (
              <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-[10px] px-2 py-0.5">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> All Stages Complete
              </Badge>
            )}
            {skippedCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{skippedCount} skipped</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ExportButton
              projectId={projectId}
              projectName={projectName}
              projectType={projectType}
              projectCode={projectCode}
              flow={flow}
              allDefaultStages={allDefaultStages}
              customEntries={customFlowStages ?? []}
            />
            {canEditFlow && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
                className="h-7 text-xs px-3 shrink-0"
                data-testid="button-edit-flow"
              >
                <Settings2 className="h-3 w-3 mr-1.5" /> Edit Flow
              </Button>
            )}
          </div>
        </div>

        <div className="w-full rounded-full bg-muted h-2.5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0F2041] to-[#1D3461] transition-all duration-700 ease-in-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
          <span>{completedCount} done</span>
          <span>{Math.max(0, remainingCount)} remaining</span>
        </div>
      </div>

      {/* ── Stage cards ────────────────────────────────────────── */}
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

          return (
            <div
              key={stage.id}
              className={cn(
                'rounded-xl border border-l-4 transition-all duration-200',
                cfg.border, cfg.ring, cfg.bg,
                isCurrent && 'shadow-sm',
                status === 'skipped' && 'opacity-60',
              )}
              data-testid={`flow-stage-${stage.id}`}
            >
              {/* Card header row */}
              <button
                type="button"
                className="w-full text-left"
                onClick={() => hasDetails ? toggleExpand(stage.id) : undefined}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all',
                      cfg.icon,
                      isCurrent && 'ring-2 ring-[#1D3461]/20 ring-offset-1',
                    )}
                  >
                    {status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : status === 'skipped' ? (
                      <SkipForward className="h-3.5 w-3.5" />
                    ) : isCurrent ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    ) : (
                      <span className="text-[11px] font-bold">{idx + 1}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        'font-semibold text-sm leading-snug',
                        status === 'skipped' && 'line-through text-muted-foreground',
                        isCurrent && 'text-[#1D3461] dark:text-blue-200',
                      )}>
                        {displayLabel}
                      </span>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', cfg.badge)}>
                        {cfg.label}
                      </span>
                    </div>
                    {historyEntry && (
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        <span>{timeAgo(historyEntry.advancedAt)}</span>
                        {historyEntry.advancedByName && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <User className="h-3 w-3 flex-shrink-0" />
                            <span>{historyEntry.advancedByName}</span>
                          </>
                        )}
                      </div>
                    )}
                    {!historyEntry && displayDesc && !isExpanded && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{displayDesc}</p>
                    )}
                  </div>

                  {hasDetails && (
                    <div className="flex-shrink-0 text-muted-foreground/60">
                      {isExpanded ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
                    </div>
                  )}
                </div>
              </button>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-5 border-t border-border/50">
                  {/* Description */}
                  {displayDesc && (
                    <p className="text-sm text-muted-foreground pt-3 leading-relaxed">{displayDesc}</p>
                  )}

                  {/* Completion record */}
                  {historyEntry && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Completion Record</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />{formatTimestamp(historyEntry.advancedAt)}
                        </span>
                        {historyEntry.advancedByName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />{historyEntry.advancedByName}
                          </span>
                        )}
                        {historyEntry.notes && (
                          <span className="flex items-start gap-1">
                            <FileText className="h-3 w-3 mt-0.5 flex-shrink-0" />{historyEntry.notes}
                          </span>
                        )}
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
                        {allOutputs.map((output, oIdx) => (
                          <li key={oIdx} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status === 'completed' ? 'text-emerald-500' : 'text-muted-foreground/30')} />
                            <span>{output}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Linked module button */}
                  {stage.linkedModule && (
                    <Button
                      variant="outline" size="sm" className="h-8 text-xs"
                      onClick={() => navigate(stage.linkedModule!)}
                      data-testid={`button-goto-module-${stage.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Go to {stage.linkedModule.replace('/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Button>
                  )}

                  {/* ── Per-stage data sections ── */}
                  <div className="grid gap-4 pt-1">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <StageAssignees
                        projectId={projectId}
                        stageId={stage.id}
                        currentUserId={currentUserId}
                        canEdit={canEditFlow}
                      />
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <StageChecklist
                        projectId={projectId}
                        stageId={stage.id}
                        currentUserId={currentUserId}
                        canEdit={status !== 'upcoming'}
                      />
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <StageAttachments
                        projectId={projectId}
                        stageId={stage.id}
                        currentUserId={currentUserId}
                        canEdit={status !== 'upcoming'}
                      />
                    </div>
                  </div>

                  {/* ── Advance controls (current stage only) ── */}
                  {isCurrent && canAdvance && nextStage && (
                    <div className="rounded-xl border border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-[#1D3461]" />
                        <p className="text-sm font-semibold text-[#1D3461] dark:text-blue-200">
                          Advance to: <span className="font-bold">{resolvedEntry(nextStage.id)?.customLabel || nextStage.label}</span>
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`advance-notes-${stage.id}`} className="text-xs font-medium text-muted-foreground">
                          Transition notes (optional)
                        </Label>
                        <Textarea
                          id={`advance-notes-${stage.id}`}
                          placeholder="What was achieved in this stage? Any handoff notes..."
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          rows={2}
                          className="text-sm resize-none"
                          data-testid="input-advance-notes"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          onClick={handleAdvance}
                          disabled={isAdvancing}
                          className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
                          data-testid="button-confirm-advance"
                        >
                          {isAdvancing ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Advancing…</>
                          ) : (
                            <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark Complete & Advance</>
                          )}
                        </Button>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 flex-shrink-0" /> Team will be notified
                        </p>
                      </div>
                    </div>
                  )}

                  {isCurrent && isLastStage && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
                        This is the final stage — all stages are complete!
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Edit Flow Dialog ────────────────────────────────────── */}
      <EditFlowDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customEntries={customEntries}
        setCustomEntries={setCustomEntries}
        allDefaultStages={allDefaultStages}
        projectName={projectName}
        isSaving={isSavingCustom}
        onSave={handleSaveCustom}
        onReset={handleResetCustom}
        getStageStatus={getStageStatus}
      />
    </div>
  );
}
