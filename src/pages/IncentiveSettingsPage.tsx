import { useState, useEffect, useCallback } from 'react';
import { useAuthorization } from '@/hooks/use-authorization';
import { useLocation as useLocationCtx } from '@/context/location/LocationContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, Save, Plus, Trash2, Settings2, Percent, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  IncentiveConfigRow,
  IncentiveRole,
  IncentiveSplitMethod,
} from '@/types/incentive';
import {
  INCENTIVE_ROLE_LABELS,
  ALL_INCENTIVE_ROLES,
  DEFAULT_ACTIVE_INCENTIVE_ROLES,
} from '@/types/incentive';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalRoleRow {
  role: IncentiveRole;
  isActive: boolean;
  bonusPct: number;
  splitMethod: IncentiveSplitMethod;
  dbId: string | null; // null if the row doesn't exist yet
}

interface HubOverrideRow {
  localId: string;       // client-side key (uuid or existing db id)
  dbId: string | null;   // null = not yet saved
  hubId: string;
  role: IncentiveRole;
  bonusPct: number;
  isNew: boolean;
  toDelete: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mkLocalId() {
  return crypto.randomUUID();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IncentiveSettingsPage() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { hubs } = useLocationCtx();
  const { toast } = useToast();

  const isAllowed = isSuperAdmin() || hasAnyRole(['admin']);

  // ── State ─────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Global role rows (one per role, hub_id IS NULL)
  const [globalRows, setGlobalRows] = useState<GlobalRoleRow[]>(() =>
    ALL_INCENTIVE_ROLES.map(role => ({
      role,
      isActive: DEFAULT_ACTIVE_INCENTIVE_ROLES.includes(role),
      bonusPct: role === 'coordinator' ? 10 : role === 'supervisor' ? 7 : 0,
      splitMethod: 'proportional' as IncentiveSplitMethod,
      dbId: null,
    }))
  );

  // Coverage threshold — read from any global row (they all share the same value)
  const [coverageThreshold, setCoverageThreshold] = useState<number>(70);

  // Hub overrides
  const [hubOverrides, setHubOverrides] = useState<HubOverrideRow[]>([]);

  // Pending new override form
  const [newOverrideHubId, setNewOverrideHubId] = useState('');
  const [newOverrideRole, setNewOverrideRole] = useState<IncentiveRole>('coordinator');
  const [newOverridePct, setNewOverridePct] = useState<number>(10);

  // Validation warnings (non-blocking)
  const [warnings, setWarnings] = useState<string[]>([]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('incentive_configs')
        .select('*')
        .order('hub_id', { ascending: true, nullsFirst: true });

      if (error) throw error;

      const rows = (data ?? []) as IncentiveConfigRow[];

      // ── Global rows ───────────────────────────────────────────────────────
      const globalDbRows = rows.filter(r => r.hub_id === null);
      const threshold = globalDbRows[0]?.coverage_threshold_pct ?? 70;
      setCoverageThreshold(Number(threshold));

      setGlobalRows(prev =>
        prev.map(localRow => {
          const db = globalDbRows.find(r => r.role === localRow.role);
          if (!db) return localRow;
          return {
            ...localRow,
            dbId: db.id,
            isActive: db.is_active,
            bonusPct: Number(db.bonus_pct),
            splitMethod: db.split_method as IncentiveSplitMethod,
          };
        })
      );

      // ── Hub overrides ─────────────────────────────────────────────────────
      const hubDbRows = rows.filter(r => r.hub_id !== null);
      setHubOverrides(
        hubDbRows.map(r => ({
          localId: r.id,
          dbId: r.id,
          hubId: r.hub_id!,
          role: r.role as IncentiveRole,
          bonusPct: Number(r.bonus_pct),
          isNew: false,
          toDelete: false,
        }))
      );
    } catch (err: any) {
      toast({ title: 'Failed to load incentive settings', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // ── Validation ────────────────────────────────────────────────────────────

  useEffect(() => {
    const ws: string[] = [];
    for (const row of globalRows) {
      if (row.isActive && row.bonusPct === 0) {
        ws.push(`${INCENTIVE_ROLE_LABELS[row.role]} is active but has 0% bonus.`);
      }
    }
    if (coverageThreshold < 0 || coverageThreshold > 100) {
      ws.push('Coverage threshold must be between 0 and 100.');
    }
    // Duplicate hub+role overrides
    const active = hubOverrides.filter(o => !o.toDelete);
    const seen = new Set<string>();
    for (const o of active) {
      const key = `${o.hubId}:${o.role}`;
      if (seen.has(key)) ws.push(`Duplicate override for hub "${hubs.find(h => h.id === o.hubId)?.name ?? o.hubId}" / ${INCENTIVE_ROLE_LABELS[o.role]}.`);
      seen.add(key);
    }
    setWarnings(ws);
  }, [globalRows, hubOverrides, coverageThreshold, hubs]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Pre-save duplicate check — block before any DB write so we never produce
    // a partial configuration state if the DB uniqueness constraint fires mid-save.
    const active = hubOverrides.filter(o => !o.toDelete);
    const seen = new Set<string>();
    for (const o of active) {
      const key = `${o.hubId}:${o.role}`;
      if (seen.has(key)) {
        const hubName = hubs.find(h => h.id === o.hubId)?.name ?? o.hubId;
        toast({
          title: 'Duplicate override — not saved',
          description: `Remove the duplicate ${INCENTIVE_ROLE_LABELS[o.role]} override for "${hubName}" before saving.`,
          variant: 'destructive',
        });
        return;
      }
      seen.add(key);
    }

    setSaving(true);
    try {
      const userId = currentUser?.id ?? null;

      // 1. Upsert global rows
      for (const row of globalRows) {
        const payload = {
          hub_id: null as string | null,
          role: row.role,
          is_active: row.isActive,
          bonus_pct: row.bonusPct,
          split_method: row.splitMethod,
          coverage_threshold_pct: coverageThreshold,
          what_counts: 'wfp_confirmed' as const,
          created_by: userId,
        };
        if (row.dbId) {
          const { error } = await supabase
            .from('incentive_configs')
            .update({ ...payload, created_by: undefined })
            .eq('id', row.dbId);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase
            .from('incentive_configs')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          setGlobalRows(prev =>
            prev.map(r => r.role === row.role ? { ...r, dbId: inserted.id } : r)
          );
        }
      }

      // 2. Delete marked hub overrides
      const toDelete = hubOverrides.filter(o => o.toDelete && o.dbId);
      for (const o of toDelete) {
        const { error } = await supabase.from('incentive_configs').delete().eq('id', o.dbId!);
        if (error) throw error;
      }

      // 3. Upsert remaining hub overrides
      const toUpsert = hubOverrides.filter(o => !o.toDelete);
      for (const o of toUpsert) {
        const payload = {
          hub_id: o.hubId,
          role: o.role,
          is_active: true,
          bonus_pct: o.bonusPct,
          split_method: 'proportional' as const,
          coverage_threshold_pct: coverageThreshold,
          what_counts: 'wfp_confirmed' as const,
          created_by: userId,
        };
        if (o.dbId) {
          const { error } = await supabase
            .from('incentive_configs')
            .update({ ...payload, created_by: undefined })
            .eq('id', o.dbId);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await supabase
            .from('incentive_configs')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          setHubOverrides(prev =>
            prev.map(r => r.localId === o.localId ? { ...r, dbId: inserted.id, isNew: false } : r)
          );
        }
      }

      // Purge deleted rows from local state
      setHubOverrides(prev => prev.filter(o => !o.toDelete));

      toast({ title: 'Incentive settings saved', description: 'Changes will apply to future MMP calculations.' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Hub override helpers ───────────────────────────────────────────────────

  const addHubOverride = () => {
    if (!newOverrideHubId) { toast({ title: 'Select a hub first', variant: 'destructive' }); return; }

    // Block duplicate hub+role — the DB enforces uniqueness too, but blocking here
    // prevents a partial-write failure mid-save.
    const duplicate = hubOverrides.find(
      o => !o.toDelete && o.hubId === newOverrideHubId && o.role === newOverrideRole
    );
    if (duplicate) {
      const hubName = hubs.find(h => h.id === newOverrideHubId)?.name ?? newOverrideHubId;
      toast({
        title: 'Override already exists',
        description: `An override for ${hubName} / ${INCENTIVE_ROLE_LABELS[newOverrideRole]} already exists. Edit it in the table above.`,
        variant: 'destructive',
      });
      return;
    }

    setHubOverrides(prev => [
      ...prev,
      {
        localId: mkLocalId(),
        dbId: null,
        hubId: newOverrideHubId,
        role: newOverrideRole,
        bonusPct: newOverridePct,
        isNew: true,
        toDelete: false,
      },
    ]);
    setNewOverrideHubId('');
    setNewOverridePct(10);
  };

  const updateOverride = (localId: string, patch: Partial<HubOverrideRow>) => {
    setHubOverrides(prev => prev.map(o => o.localId === localId ? { ...o, ...patch } : o));
  };

  const removeOverride = (localId: string) => {
    setHubOverrides(prev =>
      prev.map(o => o.localId === localId
        ? o.dbId ? { ...o, toDelete: true } : null  // mark for deletion if DB row, else remove
        : o
      ).filter(Boolean) as HubOverrideRow[]
    );
  };

  // ── Access guard ──────────────────────────────────────────────────────────

  if (!isAllowed) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2 max-w-sm">
          <Settings2 className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold">Access Restricted</p>
          <p className="text-sm text-muted-foreground">Only Admins and Super Admins can configure incentive settings.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="h-8 w-8 border-2 border-[#1D3461]/30 border-t-[#1D3461] rounded-full animate-spin" />
          <p className="text-sm">Loading incentive settings…</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const visibleOverrides = hubOverrides.filter(o => !o.toDelete);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-[#1D3461]" />
            Incentive Bonus Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure bonus percentages for each role. Changes apply to future MMP calculations only — already pre-approved snapshots are not affected.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1D3461] hover:bg-[#1D3461]/90 text-white flex items-center gap-1.5 shrink-0"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* ── Warnings ────────────────────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Configuration warnings
          </div>
          <ul className="space-y-0.5 pl-6 list-disc">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Coverage Threshold ───────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-[#1D3461]" />
          <h2 className="text-sm font-semibold">Coverage Threshold</h2>
        </div>
        <div className="flex items-start gap-4">
          <div className="space-y-1.5 flex-1 max-w-xs">
            <Label className="text-xs text-muted-foreground">Minimum WFP-confirmed coverage (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={coverageThreshold}
                onChange={e => setCoverageThreshold(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="h-9 w-28 text-sm"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Bonus calculations are unlocked only when this percentage of sites in an MMP are WFP-confirmed.
            </p>
          </div>
        </div>
      </section>

      {/* ── Role Configuration ───────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b bg-muted/30">
          <Info className="h-4 w-4 text-[#1D3461]" />
          <h2 className="text-sm font-semibold">Role Bonus Configuration</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">
            DC fee pool = sum of WFP-confirmed site enumerator fees
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="px-6 py-3 text-left font-semibold">Role</th>
              <th className="px-4 py-3 text-center font-semibold">Active</th>
              <th className="px-4 py-3 text-left font-semibold">Bonus %</th>
              <th className="px-4 py-3 text-left font-semibold">Pool split method</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {globalRows.map(row => (
              <tr
                key={row.role}
                className={cn('transition-colors', row.isActive ? 'bg-white dark:bg-card' : 'bg-muted/20')}
              >
                {/* Role name */}
                <td className="px-6 py-4">
                  <div className="font-medium">{INCENTIVE_ROLE_LABELS[row.role]}</div>
                  {!DEFAULT_ACTIVE_INCENTIVE_ROLES.includes(row.role) && (
                    <span className="text-[10px] text-muted-foreground">Future feature</span>
                  )}
                </td>

                {/* Active toggle */}
                <td className="px-4 py-4 text-center">
                  <Switch
                    checked={row.isActive}
                    onCheckedChange={v =>
                      setGlobalRows(prev => prev.map(r => r.role === row.role ? { ...r, isActive: v } : r))
                    }
                  />
                </td>

                {/* Bonus % */}
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={row.bonusPct}
                      disabled={!row.isActive}
                      onChange={e =>
                        setGlobalRows(prev =>
                          prev.map(r =>
                            r.role === row.role
                              ? { ...r, bonusPct: Math.min(100, Math.max(0, Number(e.target.value))) }
                              : r
                          )
                        )
                      }
                      className={cn('h-8 w-24 text-sm', !row.isActive && 'opacity-40')}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </td>

                {/* Split method */}
                <td className="px-4 py-4">
                  <Select
                    value={row.splitMethod}
                    disabled={!row.isActive}
                    onValueChange={v =>
                      setGlobalRows(prev =>
                        prev.map(r => r.role === row.role ? { ...r, splitMethod: v as IncentiveSplitMethod } : r)
                      )
                    }
                  >
                    <SelectTrigger className={cn('h-8 w-36 text-xs', !row.isActive && 'opacity-40')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proportional" className="text-xs">Proportional</SelectItem>
                      <SelectItem value="equal" className="text-xs">Equal</SelectItem>
                    </SelectContent>
                  </Select>
                </td>

                {/* Status badge */}
                <td className="px-4 py-4">
                  {row.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">Inactive</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t bg-muted/10 text-[11px] text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          <span>
            <strong>Proportional</strong> — bonus share is weighted by each person's DC fee pool.
            {' '}
            <strong>Equal</strong> — all eligible people in the same hub/state share equally.
          </span>
        </div>
      </section>

      {/* ── Per-Hub Overrides ────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b bg-muted/30">
          <h2 className="text-sm font-semibold">Per-Hub Overrides</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Override the global bonus % for a specific hub + role combination
          </span>
        </div>

        {/* Existing overrides */}
        {visibleOverrides.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
                <th className="px-6 py-3 text-left font-semibold">Hub</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Bonus %</th>
                <th className="px-4 py-3 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleOverrides.map(o => (
                <tr key={o.localId} className={cn('transition-colors', o.isNew && 'bg-blue-50/40 dark:bg-blue-950/10')}>
                  <td className="px-6 py-3 font-medium">
                    {hubs.find(h => h.id === o.hubId)?.name ?? o.hubId}
                    {o.isNew && <Badge className="ml-2 text-[9px] bg-blue-100 text-blue-700 border-blue-200">New</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{INCENTIVE_ROLE_LABELS[o.role]}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={o.bonusPct}
                        onChange={e => updateOverride(o.localId, { bonusPct: Math.min(100, Math.max(0, Number(e.target.value))) })}
                        className="h-8 w-24 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeOverride(o.localId)}
                      title="Remove override"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-6 py-4 text-sm text-muted-foreground">
            No per-hub overrides configured. Global percentages apply to all hubs.
          </p>
        )}

        {/* Add new override form */}
        <div className="px-6 py-4 border-t bg-muted/10">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Add Override</p>
          <div className="flex items-end gap-2 flex-wrap">
            {/* Hub picker */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Hub</Label>
              <Select value={newOverrideHubId} onValueChange={setNewOverrideHubId}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Select hub…" />
                </SelectTrigger>
                <SelectContent>
                  {hubs.map(h => (
                    <SelectItem key={h.id} value={h.id} className="text-xs">{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role picker */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Role</Label>
              <Select value={newOverrideRole} onValueChange={v => setNewOverrideRole(v as IncentiveRole)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_INCENTIVE_ROLES.map(r => (
                    <SelectItem key={r} value={r} className="text-xs">{INCENTIVE_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bonus % */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Bonus %</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={newOverridePct}
                  onChange={e => setNewOverridePct(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="h-8 w-24 text-sm"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex items-center gap-1.5"
              onClick={addHubOverride}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      </section>

      {/* ── Save footer ──────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1D3461] hover:bg-[#1D3461]/90 text-white flex items-center gap-1.5"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
