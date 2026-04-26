import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/hooks/use-super-admin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Settings2, FlaskConical, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface FeatureFlag {
  key: string;
  description: string;
  is_enabled: boolean;
  rolled_out_pct: number;
  updated_at: string;
}

interface SeedResult {
  reset_performed: boolean;
  funds_inserted: number;
  partners_inserted: number;
  sanctions_inserted: number;
  entries_inserted: number;
  entries_skipped: number;
  fy_id: string;
  period_count: number;
}

const FLAG_DANGER: Record<string, string> = {
  'acct.parallel_run.enabled': 'Enabling this marks the system as live-cutover. The synthetic seed tool will refuse to run.',
  'acct.sanctions.block_on_match': 'When ON, journals referencing a sanctioned partner are hard-blocked. When OFF, matches are logged only.',
  'acct.sod.enforce': 'When ON, Segregation-of-Duties violations block posting. When OFF, violations are logged only.',
};

export default function AccountingSettings() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const { isSuperAdmin }                     = useSuperAdmin();
  const allowed    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canToggle  = isSuperAdmin;
  const { toast }  = useToast();

  const [flags, setFlags]   = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // Seed tool
  const [seedEntries, setSeedEntries] = useState('20');
  const [seedReset, setSeedReset]     = useState(false);
  const [seeding, setSeeding]         = useState(false);
  const [seedResult, setSeedResult]   = useState<SeedResult | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('feature_flags')
      .select('key, description, is_enabled, rolled_out_pct, updated_at')
      .like('key', 'acct.%')
      .order('key');
    if (err) setError(err.message);
    setFlags((data ?? []) as FeatureFlag[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const toggleFlag = async (flag: FeatureFlag) => {
    setTogglingKey(flag.key);
    const { error: err } = await supabase
      .from('feature_flags')
      .update({ is_enabled: !flag.is_enabled, updated_at: new Date().toISOString() })
      .eq('key', flag.key);
    setTogglingKey(null);
    if (err) {
      toast({ title: 'Failed to update flag', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: `${flag.key}: ${!flag.is_enabled ? 'Enabled' : 'Disabled'}` });
      void load();
    }
  };

  const runSeed = async () => {
    const n = Number(seedEntries);
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      toast({ title: 'Enter a number between 1 and 500', variant: 'destructive' });
      return;
    }
    setSeeding(true);
    setSeedResult(null);
    const { data, error: err } = await supabase.rpc('acct_seed_synthetic', {
      p_target_entries: n,
      p_reset: seedReset,
      p_seed: 0.42,
    });
    setSeeding(false);
    if (err) {
      toast({ title: 'Seed failed', description: err.message, variant: 'destructive' });
    } else {
      setSeedResult(data as SeedResult);
      toast({ title: 'Synthetic data seeded' });
    }
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-[900px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-blue-600" /> Accounting Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Feature flags, posting-engine controls, and developer tools.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-flags">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* ── Feature Flags ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Feature Flags
          </CardTitle>
          <CardDescription>
            {canToggle
              ? 'Toggle accounting feature flags. Changes take effect immediately for all users.'
              : 'Read-only view. Only super admins can toggle flags.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {error && <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</div>}
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          ) : flags.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No accounting feature flags found. Apply Sprint 1.1 SQL migration first.
            </div>
          ) : (
            <div className="space-y-3">
              {flags.map(flag => {
                const danger = FLAG_DANGER[flag.key];
                const isBusy = togglingKey === flag.key;
                return (
                  <div
                    key={flag.key}
                    className={cn(
                      'rounded-lg border p-4 space-y-2',
                      flag.is_enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-muted/20'
                    )}
                    data-testid={`flag-row-${flag.key}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold">{flag.key}</span>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]', flag.is_enabled
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                            )}
                          >
                            {flag.is_enabled ? 'ON' : 'OFF'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{flag.description}</p>
                        {danger && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-xs text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{danger}</span>
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Updated {format(parseISO(flag.updated_at), 'dd MMM yyyy HH:mm')}
                          {flag.rolled_out_pct < 100 && ` · ${flag.rolled_out_pct}% rollout`}
                        </p>
                      </div>
                      {canToggle ? (
                        <Switch
                          checked={flag.is_enabled}
                          onCheckedChange={() => void toggleFlag(flag)}
                          disabled={isBusy}
                          data-testid={`switch-flag-${flag.key}`}
                        />
                      ) : (
                        flag.is_enabled
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          : <div className="w-4 h-4 rounded-full border-2 border-muted shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Seed Tool (super_admin only) ── */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4" /> Synthetic Data Generator
            </CardTitle>
            <CardDescription>
              Generate reproducible test journal entries for development and UAT.
              Blocked when <span className="font-mono text-xs">acct.parallel_run.enabled</span> is ON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="seed-entries">Number of entries (1–500)</Label>
                <Input
                  id="seed-entries"
                  type="number"
                  min={1}
                  max={500}
                  value={seedEntries}
                  onChange={e => setSeedEntries(e.target.value)}
                  data-testid="input-seed-entries"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="seed-reset"
                    checked={seedReset}
                    onCheckedChange={setSeedReset}
                    data-testid="switch-seed-reset"
                  />
                  <Label htmlFor="seed-reset" className="text-sm">Reset first (delete previous synthetic rows)</Label>
                </div>
              </div>
            </div>

            <Button
              onClick={() => void runSeed()}
              disabled={seeding}
              variant="outline"
              data-testid="button-run-seed"
            >
              {seeding ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Seeding…</> : <><FlaskConical className="w-4 h-4 mr-1" /> Run Seed</>}
            </Button>

            {seedResult && (
              <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-1">
                <p className="font-semibold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Seed complete
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-emerald-700 mt-2">
                  <div><span className="font-medium">Entries created:</span> {seedResult.entries_inserted}</div>
                  <div><span className="font-medium">Skipped:</span> {seedResult.entries_skipped}</div>
                  <div><span className="font-medium">Funds:</span> {seedResult.funds_inserted}</div>
                  <div><span className="font-medium">Sanctions:</span> {seedResult.sanctions_inserted}</div>
                  <div><span className="font-medium">Partners:</span> {seedResult.partners_inserted}</div>
                  <div><span className="font-medium">Periods found:</span> {seedResult.period_count}</div>
                  <div><span className="font-medium">Reset performed:</span> {seedResult.reset_performed ? 'Yes' : 'No'}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
