import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { PROJECT_FLOWS, type ProjectFlow, type FlowStage } from '@/config/projectFlows';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, RotateCcw, Save, Workflow } from 'lucide-react';
import PageInfoBanner from '@/components/common/PageInfoBanner';

interface OverrideRow {
  id?: string;
  project_type: string;
  stage_id: string;
  label_en: string | null;
  label_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  typical_duration_days: number | null;
  key_outputs_en: string[] | null;
  key_outputs_ar: string[] | null;
  is_disabled: boolean;
  notes: string | null;
}

interface DraftState {
  label_en: string;
  label_ar: string;
  description_en: string;
  description_ar: string;
  typical_duration_days: string;
  key_outputs_en: string;
  key_outputs_ar: string;
  is_disabled: boolean;
  notes: string;
}

const PROJECT_TYPE_KEYS = [
  'tpm', 'baseline_survey', 'endline_survey', 'assessment', 'evaluation',
  'research', 'capacity_building', 'compliance', 'infrastructure', 'proposal', 'other',
];

function fromOverride(ov: OverrideRow | undefined): DraftState {
  return {
    label_en: ov?.label_en ?? '',
    label_ar: ov?.label_ar ?? '',
    description_en: ov?.description_en ?? '',
    description_ar: ov?.description_ar ?? '',
    typical_duration_days: ov?.typical_duration_days != null ? String(ov.typical_duration_days) : '',
    key_outputs_en: (ov?.key_outputs_en ?? []).join('\n'),
    key_outputs_ar: (ov?.key_outputs_ar ?? []).join('\n'),
    is_disabled: ov?.is_disabled ?? false,
    notes: ov?.notes ?? '',
  };
}

function toLines(text: string): string[] | null {
  const arr = text.split('\n').map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

function StageEditor({
  flow,
  stage,
  override,
  onSaved,
}: {
  flow: ProjectFlow;
  stage: FlowStage;
  override: OverrideRow | undefined;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => fromOverride(override));
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setDraft(fromOverride(override));
  }, [override]);

  const hasOverride = !!override;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<OverrideRow> = {
        project_type: flow.type,
        stage_id: stage.id,
        label_en: draft.label_en.trim() || null,
        label_ar: draft.label_ar.trim() || null,
        description_en: draft.description_en.trim() || null,
        description_ar: draft.description_ar.trim() || null,
        typical_duration_days: draft.typical_duration_days
          ? Math.max(0, parseInt(draft.typical_duration_days, 10) || 0)
          : null,
        key_outputs_en: toLines(draft.key_outputs_en),
        key_outputs_ar: toLines(draft.key_outputs_ar),
        is_disabled: draft.is_disabled,
        notes: draft.notes.trim() || null,
      };
      const { error } = await supabase
        .from('project_flow_stage_overrides')
        .upsert(payload, { onConflict: 'project_type,stage_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: 'Stage override saved' });
      queryClient.invalidateQueries({ queryKey: ['project_flow_stage_overrides_admin'] });
      queryClient.invalidateQueries({ queryKey: ['project_flow_stage_overrides'] });
      onSaved();
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!override?.id) return;
      const { error } = await supabase
        .from('project_flow_stage_overrides')
        .delete()
        .eq('id', override.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: 'Reset to default' });
      queryClient.invalidateQueries({ queryKey: ['project_flow_stage_overrides_admin'] });
      queryClient.invalidateQueries({ queryKey: ['project_flow_stage_overrides'] });
      onSaved();
    },
    onError: (e: Error) =>
      toast({ title: 'Reset failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div
      className="rounded-md border bg-card"
      data-testid={`stage-editor-${flow.type}-${stage.id}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
        onClick={() => setOpen(o => !o)}
        data-testid={`button-toggle-${flow.type}-${stage.id}`}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">{draft.label_en.trim() || stage.label}</span>
          {hasOverride && (
            <Badge variant="secondary" className="text-xs">Overridden</Badge>
          )}
          {draft.is_disabled && (
            <Badge variant="destructive" className="text-xs">Disabled</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{stage.id}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={`label_en_${stage.id}`}>Label (EN)</Label>
              <Input
                id={`label_en_${stage.id}`}
                placeholder={stage.label}
                value={draft.label_en}
                onChange={e => setDraft({ ...draft, label_en: e.target.value })}
                data-testid={`input-label-en-${flow.type}-${stage.id}`}
              />
            </div>
            <div>
              <Label htmlFor={`label_ar_${stage.id}`}>Label (AR)</Label>
              <Input
                id={`label_ar_${stage.id}`}
                dir="rtl"
                value={draft.label_ar}
                onChange={e => setDraft({ ...draft, label_ar: e.target.value })}
                data-testid={`input-label-ar-${flow.type}-${stage.id}`}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={`desc_en_${stage.id}`}>Description (EN)</Label>
              <Textarea
                id={`desc_en_${stage.id}`}
                rows={3}
                placeholder={stage.description}
                value={draft.description_en}
                onChange={e => setDraft({ ...draft, description_en: e.target.value })}
                data-testid={`textarea-desc-en-${flow.type}-${stage.id}`}
              />
            </div>
            <div>
              <Label htmlFor={`desc_ar_${stage.id}`}>Description (AR)</Label>
              <Textarea
                id={`desc_ar_${stage.id}`}
                rows={3}
                dir="rtl"
                value={draft.description_ar}
                onChange={e => setDraft({ ...draft, description_ar: e.target.value })}
                data-testid={`textarea-desc-ar-${flow.type}-${stage.id}`}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={`outputs_en_${stage.id}`}>Key outputs — EN (one per line)</Label>
              <Textarea
                id={`outputs_en_${stage.id}`}
                rows={4}
                placeholder={stage.keyOutputs.join('\n')}
                value={draft.key_outputs_en}
                onChange={e => setDraft({ ...draft, key_outputs_en: e.target.value })}
                data-testid={`textarea-outputs-en-${flow.type}-${stage.id}`}
              />
            </div>
            <div>
              <Label htmlFor={`outputs_ar_${stage.id}`}>Key outputs — AR (one per line)</Label>
              <Textarea
                id={`outputs_ar_${stage.id}`}
                rows={4}
                dir="rtl"
                value={draft.key_outputs_ar}
                onChange={e => setDraft({ ...draft, key_outputs_ar: e.target.value })}
                data-testid={`textarea-outputs-ar-${flow.type}-${stage.id}`}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={`duration_${stage.id}`}>
                Typical duration (days) — default {stage.typicalDurationDays ?? '—'}
              </Label>
              <Input
                id={`duration_${stage.id}`}
                type="number"
                min={0}
                value={draft.typical_duration_days}
                onChange={e => setDraft({ ...draft, typical_duration_days: e.target.value })}
                data-testid={`input-duration-${flow.type}-${stage.id}`}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id={`disabled_${stage.id}`}
                checked={draft.is_disabled}
                onCheckedChange={v => setDraft({ ...draft, is_disabled: v })}
                data-testid={`switch-disabled-${flow.type}-${stage.id}`}
              />
              <Label htmlFor={`disabled_${stage.id}`} className="cursor-pointer">
                Disable this stage (hidden from new and existing projects)
              </Label>
            </div>
          </div>

          <div>
            <Label htmlFor={`notes_${stage.id}`}>Internal notes (admin only)</Label>
            <Textarea
              id={`notes_${stage.id}`}
              rows={2}
              value={draft.notes}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
              data-testid={`textarea-notes-${flow.type}-${stage.id}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid={`button-save-${flow.type}-${stage.id}`}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save override'}
            </Button>
            {hasOverride && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                data-testid={`button-reset-${flow.type}-${stage.id}`}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to default
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProjectFlowStages() {
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['admin', 'super_admin']);
  const [selectedType, setSelectedType] = useState<string>('tpm');

  const overridesQuery = useQuery({
    queryKey: ['project_flow_stage_overrides_admin'],
    queryFn: async (): Promise<OverrideRow[]> => {
      const { data, error } = await supabase
        .from('project_flow_stage_overrides')
        .select('*');
      if (error) return [];
      return (data ?? []) as OverrideRow[];
    },
    enabled: isAdmin,
  });

  const flow = PROJECT_FLOWS[selectedType] ?? PROJECT_FLOWS.other;
  const overridesForType = useMemo(() => {
    const rows = overridesQuery.data ?? [];
    return new Map(
      rows.filter(r => r.project_type === selectedType).map(r => [r.stage_id, r]),
    );
  }, [overridesQuery.data, selectedType]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Access restricted to administrators.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <PageInfoBanner
        pageKey="admin_project_flow_stages"
        title="Project Flow Stages"
        description="Override the hard-coded labels, descriptions, key outputs, durations or visibility for any stage of any project type. Anything you leave blank falls back to the built-in default. Changes apply immediately to all matching projects."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            <CardTitle>Stage overrides</CardTitle>
          </div>
          <div className="w-64">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger data-testid="select-project-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPE_KEYS.map(t => (
                  <SelectItem key={t} value={t} data-testid={`option-type-${t}`}>
                    {PROJECT_FLOWS[t]?.label ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {overridesQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            flow.stages.map(stage => (
              <StageEditor
                key={stage.id}
                flow={flow}
                stage={stage}
                override={overridesForType.get(stage.id)}
                onSaved={() => overridesQuery.refetch()}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
