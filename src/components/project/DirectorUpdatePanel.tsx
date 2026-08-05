import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Info, Check, Send, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import {
  useProjectDirectorUpdate, PDU_VALIDATOR_ROLES,
  type RiskFlag, type UpdateAction, type ActionStatus, type ReportingCadence,
} from '@/hooks/useProjectDirectorUpdate';
import { cn } from '@/lib/utils';

const FLAG_META: Record<RiskFlag, { label: string; dot: string; soft: string; faint: string; ring: string; text: string }> = {
  green:  { label: 'Green',  dot: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-950/40', faint: 'bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/30', ring: 'ring-emerald-500/50', text: 'text-emerald-800 dark:text-emerald-200' },
  yellow: { label: 'Yellow', dot: 'bg-amber-400',   soft: 'bg-amber-50 dark:bg-amber-950/40',     faint: 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-950/15 dark:hover:bg-amber-950/30',       ring: 'ring-amber-400/60',   text: 'text-amber-800 dark:text-amber-200' },
  orange: { label: 'Orange', dot: 'bg-orange-500',  soft: 'bg-orange-50 dark:bg-orange-950/40',   faint: 'bg-orange-50/50 hover:bg-orange-50 dark:bg-orange-950/15 dark:hover:bg-orange-950/30',   ring: 'ring-orange-500/50',  text: 'text-orange-800 dark:text-orange-200' },
  red:    { label: 'Red',    dot: 'bg-rose-500',    soft: 'bg-rose-50 dark:bg-rose-950/40',       faint: 'bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/15 dark:hover:bg-rose-950/30',           ring: 'ring-rose-500/50',    text: 'text-rose-800 dark:text-rose-200' },
};
const FLAG_HINT: Record<RiskFlag, string> = {
  green: 'On plan (≤5 pts behind); no overdue key deliverable; no open high/critical issue.',
  yellow: '6–10 pts behind, or a minor delay ≤1 cycle. Support needed, delivery not yet at risk.',
  orange: '11–20 pts behind, or a key deliverable delayed 2–3 cycles, or an open high issue.',
  red: '>20 pts behind, or delivery blocked, or a critical issue needing immediate escalation.',
};
const CATEGORIES = ['Operations', 'Finance', 'ICT', 'Data', 'M&E', 'Field', 'Security', 'Management', 'Other'];
const EFFECTS = ['Timeline', 'Deliverable', 'Quality', 'Budget', 'Access', 'Team performance'];
const UNITS = ['Operations', 'Finance', 'ICT', 'Data', 'M&E', 'Management', 'Other'];
const ACTION_STATUS: ActionStatus[] = ['pending', 'in_progress', 'resolved', 'escalated'];

const STATUS_TONE: Record<string, string> = {
  draft: 'text-muted-foreground',
  submitted: 'text-sky-700 dark:text-sky-300',
  validated: 'text-emerald-700 dark:text-emerald-300',
  returned: 'text-amber-700 dark:text-amber-300',
};

function pct(n: number | null | undefined) {
  return `${Math.round(Number(n ?? 0))}%`;
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5 border-b border-blue-100 pb-2.5 dark:border-blue-900">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] tabular-nums text-primary">
          {n}
        </span>
        <h3 className="uber-font text-[11px] font-bold uppercase tracking-[0.11em] text-foreground/75">{title}</h3>
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function Metric({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="uber-font text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1.5 font-mono text-[1.5rem] leading-none tabular-nums tracking-tight', tone ?? 'text-foreground')}>{value}</dd>
      {caption && <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground/75">{caption}</p>}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 240, h = 40, max = 100;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible text-foreground/70" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={i * step} cy={h - (p / max) * h} r={2} className="fill-foreground/80" />
      ))}
    </svg>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-8 py-2" aria-busy aria-label="Loading progress snapshot">
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
              <div className="h-7 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted animate-pulse" />
      </div>
      <div className="h-24 rounded-lg bg-muted/60 animate-pulse" />
      <div className="h-32 rounded-lg bg-muted/50 animate-pulse" />
    </div>
  );
}

const selectCls =
  'mt-1 h-9 w-full rounded-md border border-slate-900/10 bg-transparent px-3 text-[0.8125rem] transition-shadow focus:border-foreground/25 focus:outline-none focus:ring-[3px] focus:ring-foreground/[0.07] disabled:opacity-60 dark:border-white/10';

const fieldLabel = 'uber-font text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

export function DirectorUpdatePanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const canValidate = hasAnyRole(PDU_VALIDATOR_ROLES);
  const { cycle, cadence, setCadence, isSettingCadence, snapshot, snapshotLoading, current, actions, history, saveDraft, submit, validate, returnUpdate, isSaving } =
    useProjectDirectorUpdate(projectId);

  const readOnly = current?.status === 'submitted' || current?.status === 'validated';
  const [returnReason, setReturnReason] = useState('');
  const [showReturn, setShowReturn] = useState(false);

  const [override, setOverride] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [flag, setFlag] = useState<RiskFlag | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [mainChallenge, setMainChallenge] = useState('');
  const [category, setCategory] = useState('');
  const [effect, setEffect] = useState<string[]>([]);
  const [support, setSupport] = useState('');
  const [respUnit, setRespUnit] = useState('');
  const [sumProgress, setSumProgress] = useState('');
  const [sumIssue, setSumIssue] = useState('');
  const [sumSupport, setSumSupport] = useState('');
  const [openActions, setOpenActions] = useState<UpdateAction[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => { setSeeded(false); }, [projectId]);

  useEffect(() => {
    if (seeded || snapshotLoading) return;
    if (current) {
      setOverride(current.overall_progress_override != null ? String(current.overall_progress_override) : '');
      setOverrideReason(current.override_reason ?? '');
      setFlag((current.risk_flag as RiskFlag) ?? snapshot?.risk_flag_suggested ?? null);
      setFlagReason(current.risk_flag_reason ?? '');
      setMainChallenge(current.main_challenge ?? '');
      setCategory(current.challenge_category ?? '');
      setEffect(current.challenge_effect ?? []);
      setSupport(current.support_needed ?? '');
      setRespUnit(current.responsible_unit ?? '');
      setSumProgress(current.summary_progress ?? '');
      setSumIssue(current.summary_issue ?? '');
      setSumSupport(current.summary_support ?? '');
    } else if (snapshot) {
      setFlag(snapshot.risk_flag_suggested);
    }
    if (actions.length) setOpenActions(actions);
    setSeeded(true);
  }, [current, snapshot, snapshotLoading, actions, seeded]);

  const effectiveProgress = useMemo(() => {
    const o = override.trim() === '' ? null : Number(override);
    return o != null && !Number.isNaN(o) ? o : (snapshot?.overall_progress ?? 0);
  }, [override, snapshot]);

  const suggested = snapshot?.risk_flag_suggested;
  const diverged = flag && suggested && flag !== suggested;
  const statusKey = current?.status ?? 'draft';

  function buildPatch() {
    const o = override.trim() === '' ? null : Number(override);
    return {
      stage_id: snapshot?.stage_id ?? null,
      overall_progress: snapshot?.overall_progress ?? null,
      planned_progress: snapshot?.planned_progress ?? null,
      milestones_total: snapshot?.milestones_total ?? null,
      milestones_completed: snapshot?.milestones_completed ?? null,
      milestones_remaining: snapshot?.milestones_remaining ?? null,
      milestones_delayed: snapshot?.milestones_delayed ?? null,
      breakdown_completed: snapshot?.breakdown_completed ?? null,
      breakdown_in_progress: snapshot?.breakdown_in_progress ?? null,
      breakdown_not_started: snapshot?.breakdown_not_started ?? null,
      overall_progress_override: o,
      override_reason: o != null ? overrideReason || null : null,
      risk_flag: flag,
      risk_flag_suggested: suggested ?? null,
      risk_flag_reason: diverged ? flagReason || null : null,
      main_challenge: mainChallenge || null,
      challenge_category: category || null,
      challenge_effect: effect.length ? effect : null,
      support_needed: support || null,
      responsible_unit: respUnit || null,
      summary_progress: sumProgress || null,
      summary_issue: sumIssue || null,
      summary_support: sumSupport || null,
      _actions: openActions,
    };
  }

  async function onSaveDraft() {
    try {
      await saveDraft(buildPatch());
      toast({ title: 'Draft saved' });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    }
  }

  async function onSubmit() {
    if (!flag) { toast({ title: 'Pick a risk flag first', variant: 'destructive' }); return; }
    if (diverged && !flagReason.trim()) { toast({ title: 'Explain why you overrode the suggested flag', variant: 'destructive' }); return; }
    if (!sumProgress.trim()) { toast({ title: 'Add your progress summary', variant: 'destructive' }); return; }
    try {
      await submit(buildPatch());
      toast({ title: 'Update submitted for validation' });
    } catch (e: any) {
      toast({ title: 'Could not submit', description: e?.message, variant: 'destructive' });
    }
  }

  async function onValidate() {
    try {
      await validate();
      toast({ title: 'Validated — published to dashboards' });
    } catch (e: any) {
      toast({ title: 'Could not validate', description: e?.message, variant: 'destructive' });
    }
  }

  async function onReturn() {
    if (!returnReason.trim()) { toast({ title: 'Add a return reason', variant: 'destructive' }); return; }
    try {
      await returnUpdate(returnReason.trim());
      setShowReturn(false);
      setReturnReason('');
      toast({ title: 'Returned for revision' });
    } catch (e: any) {
      toast({ title: 'Could not return', description: e?.message, variant: 'destructive' });
    }
  }

  if (snapshotLoading) return <PanelSkeleton />;

  const disabled = readOnly || isSaving;

  return (
    <div className="relative max-w-3xl space-y-9">
      {/* Cycle strip: which window this entry covers, and where it stands. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 dark:border-blue-900 dark:bg-blue-950/30">
        <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          <span className="uppercase tracking-[0.14em] text-primary/80">Cycle</span>{' '}
          <span className="font-medium text-foreground/85">{cycle.label}</span>
          <span className="text-muted-foreground/70"> · {cycle.start} → {cycle.end}</span>
        </p>
        <div className="flex items-center gap-2.5">
          {!readOnly && (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Reporting cadence</span>
              <select
                value={cadence}
                disabled={isSettingCadence || isSaving}
                onChange={async e => {
                  try {
                    await setCadence(e.target.value as ReportingCadence);
                    toast({ title: `Cadence set to ${e.target.value}` });
                  } catch (err: any) {
                    toast({ title: 'Could not update cadence', description: err?.message, variant: 'destructive' });
                  }
                }}
                className="h-7 rounded-md border border-slate-900/10 bg-transparent px-1.5 text-[11px] text-foreground focus:outline-none focus:ring-[3px] focus:ring-foreground/[0.07] dark:border-white/10"
                title="Reporting cadence for this project"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
              </select>
            </label>
          )}
          <span className={cn('uber-font text-[10px] font-bold uppercase tracking-[0.1em]', STATUS_TONE[statusKey] ?? 'text-muted-foreground')}>
            {(current?.status ?? 'not started').replace('_', ' ')}
          </span>
        </div>
      </div>

      {current?.status === 'returned' && current.returned_reason && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-[0.8125rem] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-400/25">
          <span className="uber-font font-bold">Returned for revision.</span>{' '}
          {current.returned_reason}
        </div>
      )}

      {/* 01 Progress */}
      <Section n="01" title="Progress this cycle">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Metric label="Overall" value={pct(effectiveProgress)} caption={`Weighted · ${snapshot?.activity_count ?? 0} activities`} tone="text-primary" />
          <Metric label="Planned" value={snapshot?.planned_progress != null ? pct(snapshot.planned_progress) : '—'} caption="Timeline baseline" tone="text-slate-500 dark:text-slate-400" />
          <Metric
            label="Milestones"
            value={`${snapshot?.milestones_completed ?? 0}/${snapshot?.milestones_total ?? 0}`}
            caption={`${snapshot?.milestones_delayed ?? 0} delayed`}
            tone={(snapshot?.milestones_delayed ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}
          />
          <Metric label="Stage" value={snapshot?.stage_id ?? '—'} tone="text-indigo-600 dark:text-indigo-400" />
        </dl>

        <div className="pt-1">
          <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10">
            <div className="bg-emerald-600 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${snapshot?.breakdown_completed ?? 0}%` }} />
            <div className="bg-sky-600 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${snapshot?.breakdown_in_progress ?? 0}%` }} />
            <div className="bg-slate-900/15 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-white/15" style={{ width: `${snapshot?.breakdown_not_started ?? 0}%` }} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[10.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Completed <span className="font-mono tabular-nums text-foreground/75">{pct(snapshot?.breakdown_completed)}</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-600" />In progress <span className="font-mono tabular-nums text-foreground/75">{pct(snapshot?.breakdown_in_progress)}</span></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-900/25 dark:bg-white/25" />Not started <span className="font-mono tabular-nums text-foreground/75">{pct(snapshot?.breakdown_not_started)}</span></span>
          </div>
        </div>

        {!readOnly && (
          <details className="group text-sm">
            <summary className="uber-font w-fit cursor-pointer select-none text-[11px] font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
              Override overall progress
            </summary>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Input type="number" min={0} max={100} placeholder={pct(snapshot?.overall_progress)} value={override}
                onChange={e => setOverride(e.target.value)} className="h-9 w-24 font-mono" disabled={disabled} />
              <span className="text-xs text-muted-foreground">%</span>
              <Input placeholder="Reason for the override" value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)} className="h-9 min-w-[200px] flex-1" disabled={disabled} />
            </div>
          </details>
        )}
      </Section>

      {/* 02 Risk */}
      <Section n="02" title="Risk flag">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Risk flag">
          {(Object.keys(FLAG_META) as RiskFlag[]).map(f => {
            const m = FLAG_META[f];
            const active = flag === f;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setFlag(f)}
                className={cn(
                  'rounded-lg p-3 text-left ring-1 ring-inset transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  active
                    ? `${m.soft} ${m.ring} ring-2 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.18)]`
                    : `${m.faint} ring-slate-900/10 dark:ring-white/10`,
                  !disabled && 'active:scale-[0.98]',
                  disabled && 'cursor-default opacity-90',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full transition-transform duration-200', m.dot, active && 'scale-125')} />
                  <span className={cn('uber-font text-[0.8125rem] font-bold', active ? m.text : 'text-foreground/80')}>{m.label}</span>
                  {suggested === f && (
                    <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground/80">Suggested</span>
                  )}
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{FLAG_HINT[f]}</p>
              </button>
            );
          })}
        </div>
        {diverged && !readOnly && (
          <div className="flex items-start gap-2">
            <Info className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <div className="flex-1 space-y-1">
              <Label className={fieldLabel}>
                Why {flag} instead of suggested {suggested}?
              </Label>
              <Input
                placeholder="Required when you diverge from the suggestion"
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                disabled={disabled}
                className="h-9"
              />
            </div>
          </div>
        )}
      </Section>

      {/* 03 Challenge */}
      <Section n="03" title="Main challenge & support">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Main challenge this period</Label>
            <Textarea placeholder="What is blocking or slowing delivery?" value={mainChallenge} onChange={e => setMainChallenge(e.target.value)} disabled={disabled} rows={2} className="resize-y" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Category</Label>
              <select value={category} onChange={e => setCategory(e.target.value)} disabled={disabled} className={selectCls}>
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Responsible unit</Label>
              <select value={respUnit} onChange={e => setRespUnit(e.target.value)} disabled={disabled} className={selectCls}>
                <option value="">Select…</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Effect on project</Label>
            <div className="flex flex-wrap gap-1.5">
              {EFFECTS.map(ef => {
                const on = effect.includes(ef);
                return (
                  <button
                    key={ef}
                    type="button"
                    disabled={disabled}
                    onClick={() => setEffect(on ? effect.filter(x => x !== ef) : [...effect, ef])}
                    className={cn(
                      'uber-font rounded-full px-3 py-1 text-[11.5px] font-semibold ring-1 ring-inset transition-colors duration-150',
                      on
                        ? 'bg-primary text-primary-foreground ring-transparent'
                        : 'text-muted-foreground ring-slate-900/10 hover:bg-primary/5 hover:text-primary dark:ring-white/10',
                      !disabled && 'active:scale-[0.98]',
                    )}
                  >
                    {ef}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Support needed</Label>
            <Textarea placeholder="Direct, practical, precise" value={support} onChange={e => setSupport(e.target.value)} disabled={disabled} rows={2} className="resize-y" />
          </div>
        </div>
      </Section>

      {/* 04 Open actions */}
      <Section n="04" title="Open actions">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {openActions.length === 0 ? 'None this cycle' : `${openActions.length} action${openActions.length === 1 ? '' : 's'}`}
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setOpenActions([...openActions, { action_required: '', responsible_unit: '', deadline: '', status: 'pending' }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={1.75} /> Add
            </Button>
          )}
        </div>
        {openActions.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-blue-100 dark:border-blue-900">
            {openActions.map((a, i) => (
              <div key={i} className="grid gap-2 border-b border-blue-100 p-3 last:border-b-0 sm:grid-cols-[1fr_7.5rem_7rem_6.5rem_auto] sm:items-center dark:border-blue-900">
                <Input
                  placeholder="Action required"
                  value={a.action_required}
                  disabled={disabled}
                  className="h-9"
                  onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, action_required: e.target.value } : x))}
                />
                <select
                  className={cn(selectCls, 'mt-0')}
                  value={a.responsible_unit ?? ''}
                  disabled={disabled}
                  onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, responsible_unit: e.target.value } : x))}
                >
                  <option value="">Unit…</option>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <Input
                  type="date"
                  className="h-9 font-mono text-xs"
                  value={a.deadline ?? ''}
                  disabled={disabled}
                  onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, deadline: e.target.value } : x))}
                />
                <select
                  className={cn(selectCls, 'mt-0')}
                  value={a.status}
                  disabled={disabled}
                  onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, status: e.target.value as ActionStatus } : x))}
                >
                  {ACTION_STATUS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                {!readOnly && (
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    onClick={() => setOpenActions(openActions.filter((_, j) => j !== i))}
                    aria-label="Remove action"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 05 Summary */}
      <Section n="05" title="Director's summary">
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Main progress this period</Label>
            <Textarea value={sumProgress} onChange={e => setSumProgress(e.target.value)} disabled={disabled} rows={2} className="resize-y" />
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Main issue requiring follow-up</Label>
            <Textarea value={sumIssue} onChange={e => setSumIssue(e.target.value)} disabled={disabled} rows={2} className="resize-y" />
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Immediate support needed</Label>
            <Textarea value={sumSupport} onChange={e => setSumSupport(e.target.value)} disabled={disabled} rows={2} className="resize-y" />
          </div>
        </div>
      </Section>

      {/* 06 History */}
      {history.length >= 2 && (
        <Section n="06" title="Progress over time">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Sparkline points={history.map(h => Number(h.overall_progress ?? 0))} />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-mono tabular-nums">{history.length}</span> validated · latest{' '}
              <span className="font-mono tabular-nums">{pct(history[history.length - 1]?.overall_progress)}</span>
            </p>
          </div>
        </Section>
      )}

      {/* Sticky action dock — spans the full sheet, reads as the sheet's footer. */}
      <div className="sticky bottom-0 z-[1] border-t border-blue-100 bg-white/[0.94] py-3.5 backdrop-blur-sm dark:border-blue-900 dark:bg-[hsl(222_40%_9.5%/0.94)]">
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="outline" onClick={onSaveDraft} disabled={isSaving} className="active:scale-[0.98]">
              Save draft
            </Button>
            <Button onClick={onSubmit} disabled={isSaving} className="bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-[0_8px_20px_-12px_rgba(37,99,235,0.9)] hover:brightness-110 active:scale-[0.98]">
              <Send className="mr-1.5 h-4 w-4" strokeWidth={1.75} /> Submit for validation
            </Button>
            <p className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
              Only validated updates reach the dashboards.
            </p>
          </div>
        ) : current?.status === 'submitted' && canValidate ? (
          <div className="space-y-2.5">
            <p className="text-sm text-muted-foreground">
              Review formulas, risk flag, and narrative, then validate or return.
            </p>
            {showReturn ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Reason for return (required)"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="h-9 min-w-[220px] flex-1"
                  disabled={isSaving}
                />
                <Button variant="outline" onClick={() => { setShowReturn(false); setReturnReason(''); }} disabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={onReturn} disabled={isSaving} className="active:scale-[0.98]">
                  <Undo2 className="mr-1.5 h-4 w-4" strokeWidth={1.75} /> Return
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <Button onClick={onValidate} disabled={isSaving} className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-[0_8px_20px_-12px_rgba(5,150,105,0.9)] hover:brightness-110 active:scale-[0.98]">
                  <Check className="mr-1.5 h-4 w-4" strokeWidth={1.75} /> Validate &amp; publish
                </Button>
                <Button variant="outline" onClick={() => setShowReturn(true)} disabled={isSaving}>
                  Return for revision
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className={cn(
            'flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-[0.8125rem] ring-1 ring-inset',
            current?.status === 'validated'
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/20'
              : 'bg-sky-50 text-sky-800 ring-sky-600/15 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-400/20',
          )}>
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            {current?.status === 'validated'
              ? 'Validated and published to the dashboards.'
              : 'Submitted. Awaiting validation by Implementation & Management.'}
          </div>
        )}
      </div>
    </div>
  );
}

export default DirectorUpdatePanel;
