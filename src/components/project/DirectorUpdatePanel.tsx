import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Info, Check, Send, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import {
  useProjectDirectorUpdate, PDU_VALIDATOR_ROLES,
  type RiskFlag, type UpdateAction, type ActionStatus, type ReportingCadence,
} from '@/hooks/useProjectDirectorUpdate';

const FLAG_META: Record<RiskFlag, { label: string; dot: string; soft: string; ring: string; text: string }> = {
  green:  { label: 'Green',  dot: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-950/30', ring: 'ring-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  yellow: { label: 'Yellow', dot: 'bg-amber-400',   soft: 'bg-amber-50 dark:bg-amber-950/30',     ring: 'ring-amber-400',   text: 'text-amber-700 dark:text-amber-300' },
  orange: { label: 'Orange', dot: 'bg-orange-500',  soft: 'bg-orange-50 dark:bg-orange-950/30',   ring: 'ring-orange-500',  text: 'text-orange-700 dark:text-orange-300' },
  red:    { label: 'Red',    dot: 'bg-red-500',     soft: 'bg-red-50 dark:bg-red-950/30',         ring: 'ring-red-500',     text: 'text-red-700 dark:text-red-300' },
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

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  validated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  returned: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

function pct(n: number | null | undefined) {
  return `${Math.round(Number(n ?? 0))}%`;
}

/** Small computed stat: value + label + how-derived caption. Not the hero-metric card. */
function Derived({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {caption && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{caption}</div>}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 220, h = 44, max = 100;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-primary" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={i * step} cy={h - (p / max) * h} r={2.5} className="fill-primary" />
      ))}
    </svg>
  );
}

export function DirectorUpdatePanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const canValidate = hasAnyRole(PDU_VALIDATOR_ROLES);
  const { cycle, cadence, setCadence, isSettingCadence, snapshot, snapshotLoading, current, actions, history, saveDraft, submit, validate, returnUpdate, isSaving } =
    useProjectDirectorUpdate(projectId);

  const readOnly = current?.status === 'submitted' || current?.status === 'validated';
  const [returnReason, setReturnReason] = useState('');
  const [showReturn, setShowReturn] = useState(false);

  // Form state
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

  // Seed once from the saved row (if any), else from the computed suggestion
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

  if (snapshotLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Computing this cycle's progress…</div>;
  }

  const disabled = readOnly || isSaving;

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Director Update</h2>
          <p className="text-sm text-muted-foreground">
            Reporting cycle: <span className="font-medium text-foreground">{cycle.label}</span>
            <span className="text-muted-foreground/70"> · {cycle.start} → {cycle.end}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
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
              className="h-8 rounded-md border bg-background px-2 text-xs"
              title="Reporting cadence for this project"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
            </select>
          )}
          <Badge className={STATUS_BADGE[current?.status ?? 'draft']}>
            {(current?.status ?? 'not started').replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {current?.status === 'returned' && current.returned_reason && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          Returned for revision: {current.returned_reason}
        </div>
      )}

      {/* 1. Progress this cycle — derived, confirm or override */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Progress this cycle</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <Derived label="Overall progress" value={pct(effectiveProgress)} caption={`weighted · ${snapshot?.activity_count ?? 0} activities`} />
          <Derived label="Planned (to date)" value={snapshot?.planned_progress != null ? pct(snapshot.planned_progress) : '—'} caption="timeline baseline" />
          <Derived label="Milestones" value={`${snapshot?.milestones_completed ?? 0}/${snapshot?.milestones_total ?? 0}`} caption={`${snapshot?.milestones_delayed ?? 0} delayed`} />
          <Derived label="Stage" value={snapshot?.stage_id ?? '—'} />
        </div>

        {/* Implementation breakdown as one stacked bar (sums to 100) */}
        <div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${snapshot?.breakdown_completed ?? 0}%` }} />
            <div className="bg-blue-500" style={{ width: `${snapshot?.breakdown_in_progress ?? 0}%` }} />
            <div className="bg-muted-foreground/25" style={{ width: `${snapshot?.breakdown_not_started ?? 0}%` }} />
          </div>
          <div className="mt-1.5 flex gap-4 text-[11px] text-muted-foreground">
            <span><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 mr-1" />Completed {pct(snapshot?.breakdown_completed)}</span>
            <span><span className="inline-block h-2 w-2 rounded-sm bg-blue-500 mr-1" />In progress {pct(snapshot?.breakdown_in_progress)}</span>
            <span><span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/25 mr-1" />Not started {pct(snapshot?.breakdown_not_started)}</span>
          </div>
        </div>

        {!readOnly && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
              Override overall progress
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input type="number" min={0} max={100} placeholder={pct(snapshot?.overall_progress)} value={override}
                onChange={e => setOverride(e.target.value)} className="w-24" disabled={disabled} />
              <span className="text-muted-foreground text-xs">%</span>
              <Input placeholder="Reason for the override" value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)} className="flex-1 min-w-[200px]" disabled={disabled} />
            </div>
          </details>
        )}
      </section>

      {/* 2. Risk flag */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Risk flag</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(FLAG_META) as RiskFlag[]).map(f => {
            const m = FLAG_META[f];
            const active = flag === f;
            return (
              <button key={f} type="button" disabled={disabled} onClick={() => setFlag(f)}
                className={`rounded-lg border p-3 text-left transition ${active ? `${m.soft} ring-2 ${m.ring}` : 'hover:bg-muted/50'} ${disabled ? 'cursor-default' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
                  <span className={`text-sm font-semibold ${active ? m.text : ''}`}>{m.label}</span>
                  {suggested === f && <span className="ml-auto text-[10px] text-muted-foreground">suggested</span>}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{FLAG_HINT[f]}</p>
              </button>
            );
          })}
        </div>
        {diverged && !readOnly && (
          <div className="flex items-start gap-2 text-sm">
            <Info className="h-4 w-4 mt-2 text-muted-foreground shrink-0" />
            <Input placeholder={`You chose ${flag} over the suggested ${suggested}. Why?`} value={flagReason}
              onChange={e => setFlagReason(e.target.value)} disabled={disabled} />
          </div>
        )}
      </section>

      {/* 3. Challenge & support */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Main challenge &amp; support needed</h3>
        <Textarea placeholder="Main challenge this period" value={mainChallenge} onChange={e => setMainChallenge(e.target.value)} disabled={disabled} rows={2} />
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <select value={category} onChange={e => setCategory(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-60">
              <option value="">Select…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Responsible unit</Label>
            <select value={respUnit} onChange={e => setRespUnit(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-60">
              <option value="">Select…</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Effect on project</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {EFFECTS.map(ef => {
              const on = effect.includes(ef);
              return (
                <button key={ef} type="button" disabled={disabled}
                  onClick={() => setEffect(on ? effect.filter(x => x !== ef) : [...effect, ef])}
                  className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>
                  {ef}
                </button>
              );
            })}
          </div>
        </div>
        <Textarea placeholder="Support needed (direct, practical, precise)" value={support} onChange={e => setSupport(e.target.value)} disabled={disabled} rows={2} />
      </section>

      {/* 4. Open actions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open actions</h3>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setOpenActions([...openActions, { action_required: '', responsible_unit: '', deadline: '', status: 'pending' }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          )}
        </div>
        {openActions.length === 0 && <p className="text-sm text-muted-foreground">No open actions this cycle.</p>}
        <div className="space-y-2">
          {openActions.map((a, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-5" placeholder="Action required" value={a.action_required} disabled={disabled}
                onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, action_required: e.target.value } : x))} />
              <select className="col-span-3 h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-60" value={a.responsible_unit ?? ''} disabled={disabled}
                onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, responsible_unit: e.target.value } : x))}>
                <option value="">Unit…</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <Input type="date" className="col-span-2" value={a.deadline ?? ''} disabled={disabled}
                onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, deadline: e.target.value } : x))} />
              <select className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-60" value={a.status} disabled={disabled}
                onChange={e => setOpenActions(openActions.map((x, j) => j === i ? { ...x, status: e.target.value as ActionStatus } : x))}>
                {ACTION_STATUS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              {!readOnly && (
                <button type="button" className="col-span-12 sm:hidden text-xs text-red-600" onClick={() => setOpenActions(openActions.filter((_, j) => j !== i))}>Remove</button>
              )}
              {!readOnly && (
                <button type="button" className="hidden sm:flex -ml-8 text-muted-foreground hover:text-red-600" onClick={() => setOpenActions(openActions.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5. Director's short summary */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Director's summary</h3>
        <div>
          <Label className="text-xs text-muted-foreground">Main progress this period</Label>
          <Textarea value={sumProgress} onChange={e => setSumProgress(e.target.value)} disabled={disabled} rows={2} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Main issue requiring follow-up</Label>
          <Textarea value={sumIssue} onChange={e => setSumIssue(e.target.value)} disabled={disabled} rows={2} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Immediate support needed</Label>
          <Textarea value={sumSupport} onChange={e => setSumSupport(e.target.value)} disabled={disabled} rows={2} className="mt-1" />
        </div>
      </section>

      {/* 6. Progress over time */}
      {history.length >= 2 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Progress over time</h3>
          <div className="text-primary"><Sparkline points={history.map(h => Number(h.overall_progress ?? 0))} /></div>
          <p className="text-[11px] text-muted-foreground">{history.length} validated updates · latest {pct(history[history.length - 1]?.overall_progress)}</p>
        </section>
      )}

      {/* Actions */}
      {!readOnly ? (
        <div className="flex items-center gap-3 pt-2 border-t">
          <Button variant="outline" onClick={onSaveDraft} disabled={isSaving}>Save draft</Button>
          <Button onClick={onSubmit} disabled={isSaving}>
            <Send className="h-4 w-4 mr-1.5" /> Submit for validation
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">Only validated updates reach the dashboards.</span>
        </div>
      ) : current?.status === 'submitted' && canValidate ? (
        <div className="space-y-3 pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            Submitted — review formulas, risk flag and narrative, then validate or return.
          </p>
          {showReturn ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Reason for return (required)"
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                className="flex-1 min-w-[220px]"
                disabled={isSaving}
              />
              <Button variant="outline" onClick={() => { setShowReturn(false); setReturnReason(''); }} disabled={isSaving}>Cancel</Button>
              <Button variant="destructive" onClick={onReturn} disabled={isSaving}>
                <Undo2 className="h-4 w-4 mr-1.5" /> Return
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button onClick={onValidate} disabled={isSaving}>
                <Check className="h-4 w-4 mr-1.5" /> Validate &amp; publish
              </Button>
              <Button variant="outline" onClick={() => setShowReturn(true)} disabled={isSaving}>Return for revision</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-emerald-600" />
          {current?.status === 'validated'
            ? 'Validated and published to the dashboards.'
            : 'Submitted — awaiting validation by the Implementation & Management Department.'}
        </div>
      )}
    </div>
  );
}

export default DirectorUpdatePanel;
