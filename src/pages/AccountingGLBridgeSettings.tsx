/**
 * AccountingGLBridgeSettings.tsx
 *
 * GL Bridge Account Mapping Settings panel.
 *
 * Finance can map each bridge event (pre_fund_disbursement, payroll_run, etc.)
 * to the correct debit and credit accounts from the live Chart of Accounts.
 * Settings are stored in acct_gl_bridge_config and read by the three bridge
 * RPCs (post_prefunding_to_gl, post_payroll_to_gl, post_eosb_to_gl) at runtime.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Settings2, AlertTriangle, CheckCircle2, RefreshCw, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface BridgeConfig {
  id: string;
  source_event: string;
  event_label: string;
  event_description: string | null;
  debit_account_id:  string | null;
  credit_account_id: string | null;
  is_active: boolean;
  updated_at: string;
}

interface Account {
  id: string;
  code: string;
  name_en: string;
  account_type: string;
  is_active: boolean;
}

// pending edit for a single config row
type RowEdit = { debitId: string | null; creditId: string | null; dirty: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const NONE = '__none__';

function accountLabel(a: Account) {
  return `${a.code} — ${a.name_en}`;
}

const TYPE_COLOR: Record<string, string> = {
  asset:     'text-blue-600',
  liability: 'text-orange-600',
  equity:    'text-purple-600',
  income:    'text-green-600',
  expense:   'text-red-600',
};

// ─────────────────────────────────────────────────────────────────────────────
// AccountPicker
// ─────────────────────────────────────────────────────────────────────────────
function AccountPicker({
  value, accounts, onChange, placeholder, disabled,
}: {
  value: string | null;
  accounts: Account[];
  onChange: (id: string | null) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={v => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 text-xs min-w-[200px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>
          <span className="text-muted-foreground italic">— not configured —</span>
        </SelectItem>
        {accounts.map(a => (
          <SelectItem key={a.id} value={a.id}>
            <span className={cn('font-mono mr-1', TYPE_COLOR[a.account_type] ?? '')}>{a.code}</span>
            <span className="truncate">{a.name_en}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function AccountingGLBridgeSettings() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [configs, setConfigs]   = useState<BridgeConfig[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [edits, setEdits]       = useState<Record<string, RowEdit>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null); // source_event being saved

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [cfgRes, acctRes] = await Promise.all([
      supabase
        .from('acct_gl_bridge_config')
        .select('id,source_event,event_label,event_description,debit_account_id,credit_account_id,is_active,updated_at')
        .order('source_event'),
      supabase
        .from('acct_accounts')
        .select('id,code,name_en,account_type,is_active')
        .eq('is_active', true)
        .order('code'),
    ]);

    const cfgs = (cfgRes.data ?? []) as BridgeConfig[];
    setConfigs(cfgs);
    setAccounts((acctRes.data ?? []) as Account[]);
    // Initialise edit state from DB values
    const initEdits: Record<string, RowEdit> = {};
    cfgs.forEach(c => {
      initEdits[c.source_event] = {
        debitId:  c.debit_account_id,
        creditId: c.credit_account_id,
        dirty: false,
      };
    });
    setEdits(initEdits);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated && allowed) load();
  }, [isAuthenticated, allowed, load]);

  // ── Edit handler ───────────────────────────────────────────────────────────
  function handleEdit(sourceEvent: string, side: 'debit' | 'credit', id: string | null) {
    setEdits(prev => ({
      ...prev,
      [sourceEvent]: {
        ...prev[sourceEvent],
        [side === 'debit' ? 'debitId' : 'creditId']: id,
        dirty: true,
      },
    }));
  }

  // ── Save a single row ──────────────────────────────────────────────────────
  async function saveRow(cfg: BridgeConfig) {
    const edit = edits[cfg.source_event];
    if (!edit) return;
    setSaving(cfg.source_event);
    try {
      const { error } = await supabase
        .from('acct_gl_bridge_config')
        .update({
          debit_account_id:  edit.debitId  ?? null,
          credit_account_id: edit.creditId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cfg.id);
      if (error) throw error;
      toast.success(`Saved mapping for "${cfg.event_label}"`);
      setEdits(prev => ({
        ...prev,
        [cfg.source_event]: { ...prev[cfg.source_event], dirty: false },
      }));
      // Refresh config list
      const { data } = await supabase
        .from('acct_gl_bridge_config')
        .select('id,source_event,event_label,event_description,debit_account_id,credit_account_id,is_active,updated_at')
        .eq('id', cfg.id)
        .single();
      if (data) {
        setConfigs(prev => prev.map(c => c.id === cfg.id ? data as BridgeConfig : c));
      }
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(null);
    }
  }

  // ── Save all dirty rows at once ────────────────────────────────────────────
  async function saveAll() {
    const dirty = configs.filter(c => edits[c.source_event]?.dirty);
    if (!dirty.length) return;
    setSaving('__all__');
    try {
      await Promise.all(dirty.map(c => saveRow(c)));
      toast.success(`Saved ${dirty.length} mapping${dirty.length !== 1 ? 's' : ''}`);
    } finally {
      setSaving(null);
    }
  }

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!isAuthenticated || !allowed) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 mr-2" />
        Access restricted to Finance roles.
      </div>
    );
  }

  const dirtyCount = Object.values(edits).filter(e => e.dirty).length;
  const unconfiguredCount = configs.filter(c => {
    const e = edits[c.source_event];
    return !e?.debitId || !e?.creditId;
  }).length;

  const accountMap: Record<string, Account> = {};
  accounts.forEach(a => { accountMap[a.id] = a; });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-muted-foreground" />
            GL Bridge Account Mapping
          </h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Map each bridge event to the correct debit and credit accounts from your Chart of Accounts.
            The bridge RPCs read this configuration at runtime — no SQL editing required.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
          {dirtyCount > 0 && (
            <Button
              size="sm"
              disabled={saving !== null}
              onClick={saveAll}
              className="gap-2"
            >
              {saving === '__all__' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save All ({dirtyCount})
            </Button>
          )}
        </div>
      </div>

      {/* Status summary */}
      {!loading && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-medium">{configs.length - unconfiguredCount}</span>
            <span className="text-muted-foreground">fully configured</span>
          </div>
          {unconfiguredCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="font-medium">{unconfiguredCount}</span>
              <span className="text-muted-foreground">missing account mapping</span>
            </div>
          )}
        </div>
      )}

      {/* Info banner */}
      <div className="flex gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium">How this works:</span>{' '}
          The GL bridge RPCs call <code className="font-mono text-xs bg-blue-100 px-1 rounded">gl_bridge_account(source_event, 'debit'/'credit')</code> to
          look up the account IDs configured here. If an event is unconfigured the transaction is
          skipped with a clear error in the Bridge Log — no silent failures.
        </div>
      </div>

      {/* Config table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : configs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-400" />
            <p className="font-medium">Config table is empty</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run migration <code className="font-mono text-xs">20260803c_acct_gl_bridge_config.sql</code> in
              the Supabase SQL Editor first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {configs.map(cfg => {
            const edit  = edits[cfg.source_event] ?? { debitId: null, creditId: null, dirty: false };
            const configured = !!(edit.debitId && edit.creditId);
            const isSavingThis = saving === cfg.source_event;

            return (
              <Card key={cfg.id} className={cn(
                'transition-all',
                edit.dirty && 'ring-1 ring-blue-400',
                !configured && 'border-amber-200',
              )}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">
                        {cfg.event_label}
                      </CardTitle>
                      <Badge
                        className={cn(
                          'text-xs border shrink-0',
                          configured
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200',
                        )}
                      >
                        {configured ? 'Configured' : 'Missing accounts'}
                      </Badge>
                      {edit.dirty && (
                        <Badge className="text-xs border bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                          Unsaved
                        </Badge>
                      )}
                    </div>
                    {edit.dirty && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving !== null}
                        onClick={() => saveRow(cfg)}
                        className="shrink-0 h-7 gap-1 text-xs"
                      >
                        {isSavingThis
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Save className="h-3 w-3" />}
                        Save
                      </Button>
                    )}
                  </div>
                  {cfg.event_description && (
                    <CardDescription className="text-xs mt-1 leading-relaxed">
                      {cfg.event_description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="px-5 pb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Debit */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-0.5" />
                        Debit Account (DR)
                      </label>
                      <AccountPicker
                        value={edit.debitId}
                        accounts={accounts}
                        onChange={id => handleEdit(cfg.source_event, 'debit', id)}
                        placeholder="Select debit account…"
                        disabled={saving !== null}
                      />
                      {edit.debitId && accountMap[edit.debitId] && (
                        <p className="text-xs text-muted-foreground">
                          Type: <span className={cn('font-medium', TYPE_COLOR[accountMap[edit.debitId].account_type])}>
                            {accountMap[edit.debitId].account_type}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Credit */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-0.5" />
                        Credit Account (CR)
                      </label>
                      <AccountPicker
                        value={edit.creditId}
                        accounts={accounts}
                        onChange={id => handleEdit(cfg.source_event, 'credit', id)}
                        placeholder="Select credit account…"
                        disabled={saving !== null}
                      />
                      {edit.creditId && accountMap[edit.creditId] && (
                        <p className="text-xs text-muted-foreground">
                          Type: <span className={cn('font-medium', TYPE_COLOR[accountMap[edit.creditId].account_type])}>
                            {accountMap[edit.creditId].account_type}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Current saved mapping preview */}
                  {(cfg.debit_account_id || cfg.credit_account_id) && !edit.dirty && (
                    <div className="mt-3 flex gap-4 text-xs text-muted-foreground font-mono">
                      {cfg.debit_account_id && accountMap[cfg.debit_account_id] && (
                        <span>
                          DR {accountMap[cfg.debit_account_id].code}
                        </span>
                      )}
                      {cfg.credit_account_id && accountMap[cfg.credit_account_id] && (
                        <span>
                          CR {accountMap[cfg.credit_account_id].code}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Save all footer */}
      {dirtyCount > 0 && (
        <div className="flex justify-end pt-2">
          <Button
            disabled={saving !== null}
            onClick={saveAll}
            className="gap-2"
          >
            {saving === '__all__' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All Changes ({dirtyCount})
          </Button>
        </div>
      )}
    </div>
  );
}
