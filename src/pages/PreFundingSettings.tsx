import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Settings2, Plus, Pencil, Trash2, RefreshCw, AlertTriangle,
  Lock, Globe, Activity, RotateCcw, Zap, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { activatePreFund } from '@/utils/preFundActivation';
import { useAppContext } from '@/context/AppContext';

interface PeriodType { id: string; name: string; day_count: number | null; is_builtin: boolean; display_order: number }
interface UnmatchedItem {
  id: string;
  raw_reference: string | null;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string | null;
  matched_fund_id: string | null;
  match_status: 'unmatched' | 'matched' | 'dismissed';
  created_at: string;
}
interface Settings {
  id?: string;
  base_currency: string;
  default_threshold_pct: number;
  default_warning_days: number;
  auto_renewal_grace_hours: number;
  bank_match_tolerance_pct: number;
  bank_api_enabled: boolean;
  bank_api_url: string | null;
  bank_api_key_hint: string | null;
  integration_bank_recon: boolean;
  integration_cashflow: boolean;
  integration_encumbrance: boolean;
  default_renewal_mode: string;
  default_base_currency: string;
  // GL account defaults
  default_gl_receipt_account: string;
  default_gl_liability_account: string;
  default_gl_expense_account: string;
  default_gl_cf_account: string;
  // Notification & matching defaults
  default_matching_scope: string;
  // Reconciliation action toggles
  reconciliation_action_return: boolean;
  reconciliation_action_carry_fwd: boolean;
  reconciliation_action_reserve: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  base_currency: 'USD', default_threshold_pct: 20, default_warning_days: 14,
  auto_renewal_grace_hours: 24, bank_match_tolerance_pct: 2,
  bank_api_enabled: false, bank_api_url: null, bank_api_key_hint: null,
  integration_bank_recon: true, integration_cashflow: true, integration_encumbrance: true,
  default_renewal_mode: 'off', default_base_currency: 'USD',
  default_gl_receipt_account: '1200',
  default_gl_liability_account: '2400',
  default_gl_expense_account: '7000',
  default_gl_cf_account: '2401',
  default_matching_scope: 'global',
  reconciliation_action_return: true,
  reconciliation_action_carry_fwd: true,
  reconciliation_action_reserve: true,
};

const BUILTIN_PERIOD_TYPES = [
  { name: 'Weekly',          day_count: 7 },
  { name: 'Bi-weekly',       day_count: 14 },
  { name: 'Monthly',         day_count: 30 },
  { name: 'Quarterly',       day_count: 90 },
  { name: 'Annual',          day_count: 365 },
  { name: 'Project Duration',day_count: null },
  { name: 'Custom',          day_count: null },
];

export default function PreFundingSettings() {
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [settings, setSettings]       = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [periodTypes, setPeriodTypes]  = useState<PeriodType[]>([]);
  const [loading, setLoading]          = useState(true);
  const [saving, setSaving]            = useState(false);
  const [showPTDialog, setShowPTDialog] = useState(false);
  const [editingPT, setEditingPT]      = useState<PeriodType | null>(null);
  const [ptForm, setPtForm]            = useState({ name: '', day_count: '' });
  const [ptSaving, setPtSaving]        = useState(false);
  const [bankApiKey, setBankApiKey]    = useState('');
  const [showApiKey, setShowApiKey]    = useState(false);
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedItem[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(false);
  const [matchDialog, setMatchDialog]  = useState<{ item: UnmatchedItem; funds: { id: string; name: string; currency: string; amount: number }[] } | null>(null);
  const [matchFundId, setMatchFundId]  = useState('');
  const [matchingId, setMatchingId]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, ptRes] = await Promise.all([
        supabase.from('pre_fund_settings').select('*').maybeSingle(),
        supabase.from('pre_fund_period_types').select('*').order('display_order'),
      ]);
      // Surface SELECT errors (e.g. RLS blocking or table missing)
      if (sRes.error && !sRes.error.message.includes('does not exist') && !sRes.error.message.includes('relation')) {
        toast({ title: 'Could not load settings', description: sRes.error.message + ' — run pre_funding_migration.sql first', variant: 'destructive' });
      }
      if (sRes.data) setSettings({ ...DEFAULT_SETTINGS, ...(sRes.data as any) });
      if (ptRes.error && !ptRes.error.message.includes('does not exist')) {
        toast({ title: 'Could not load period types', description: ptRes.error.message, variant: 'destructive' });
      }
      setPeriodTypes((ptRes.data as any) ?? []);
    } catch (e: any) {
      if (!e?.message?.includes('does not exist') && !e?.message?.includes('relation')) {
        toast({ title: 'Failed to load settings', description: e.message + ' — run pre_funding_migration.sql first', variant: 'destructive' });
      }
    }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadUnmatched = useCallback(async () => {
    setLoadingUnmatched(true);
    try {
      const { data, error: e } = await supabase
        .from('pre_fund_bank_unmatched' as any)
        .select('*')
        .eq('match_status', 'unmatched')
        .order('created_at', { ascending: false });
      if (e && !e.message.includes('does not exist')) throw e;
      setUnmatchedItems((data as any) ?? []);
    } catch (e: any) {
      toast({ title: 'Failed to load unmatched transfers', description: e.message, variant: 'destructive' });
    } finally { setLoadingUnmatched(false); }
  }, [toast]);

  const openMatchDialog = async (item: UnmatchedItem) => {
    const { data } = await supabase.from('pre_fund_requests')
      .select('id,name,currency,amount,gl_receipt_account,gl_liability_account')
      .eq('status', 'awaiting_receipt')
      .order('created_at', { ascending: false });
    setMatchFundId('');
    setMatchDialog({ item, funds: (data as any) ?? [] });
  };

  const handleManualMatch = async () => {
    if (!matchDialog || !matchFundId) return;
    const fund = matchDialog.funds.find(f => f.id === matchFundId);
    if (!fund) return;
    setMatchingId(matchDialog.item.id);
    try {
      // ── Full activation: GL journal + balance + bank statement (same as receipt upload) ──
      await activatePreFund({
        fundId: fund.id,
        fundName: fund.name,
        amount: fund.amount,
        currency: fund.currency,
        glReceiptCode: (fund as any).gl_receipt_account as string,
        glLiabilityCode: (fund as any).gl_liability_account as string,
        createdBy: currentUser?.id ?? null,
        idempotencyKeySuffix: 'manual-match',
      });

      // Mark the unmatched transfer as matched
      const { error: e } = await supabase
        .from('pre_fund_bank_unmatched' as any)
        .update({
          match_status: 'matched',
          matched_fund_id: fund.id,
          reviewed_by: currentUser?.id ?? null,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', matchDialog.item.id);
      if (e) throw e;

      toast({ title: 'Transfer matched — fund is now Active', description: 'GL journal entry and bank statement line created.' });
      setMatchDialog(null);
      await loadUnmatched();
    } catch (e: any) {
      toast({ title: 'Match failed', description: e.message, variant: 'destructive' });
    } finally { setMatchingId(null); }
  };

  const handleDismiss = async (itemId: string) => {
    setMatchingId(itemId);
    try {
      const { error: e } = await supabase
        .from('pre_fund_bank_unmatched' as any)
        .update({ match_status: 'dismissed', reviewed_at: new Date().toISOString() } as any)
        .eq('id', itemId);
      if (e) throw e;
      toast({ title: 'Transfer dismissed' });
      await loadUnmatched();
    } catch (e: any) {
      toast({ title: 'Dismiss failed', description: e.message, variant: 'destructive' });
    } finally { setMatchingId(null); }
  };

  useEffect(() => { if (settings.bank_api_enabled) loadUnmatched(); }, [settings.bank_api_enabled, loadUnmatched]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { ...settings };
      delete payload.id;
      // Never persist the raw key — strip it from the payload
      delete payload.bank_api_key_hint;
      delete payload.bank_api_key_encrypted;

      // Upsert on singleton_lock — works whether the row exists or not,
      // and avoids the INSERT-RLS failure when id is unknown after a fresh migration.
      const { data, error: e } = await supabase
        .from('pre_fund_settings')
        .upsert({ singleton_lock: true, ...payload }, { onConflict: 'singleton_lock' })
        .select()
        .maybeSingle();
      if (e) throw e;
      const savedId = (data as any)?.id ?? settings.id;
      if (savedId) setSettings(p => ({ ...p, id: savedId }));

      // If a new API key was entered, store it encrypted via the security-definer RPC.
      // The raw key is never stored in the settings payload above.
      if (bankApiKey.trim() && savedId) {
        const { error: rpcErr } = await supabase.rpc('store_pre_fund_bank_key' as any, {
          p_settings_id: savedId,
          p_key: bankApiKey.trim(),
        });
        if (rpcErr) throw new Error(`Key encryption failed: ${rpcErr.message} — ensure store_pre_fund_bank_key RPC is deployed`);
      }

      toast({ title: 'Settings saved' });
      setBankApiKey('');
      setShowApiKey(false);
      await load();
    } catch (e: any) {
      const msg = (e as any).message ?? String(e);
      const hint = msg.includes('does not exist') || msg.includes('relation') || msg.includes('security')
        ? ' — run pre_funding_migration.sql in Supabase first'
        : '';
      toast({ title: 'Save failed', description: msg + hint, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleSavePT = async () => {
    if (!ptForm.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setPtSaving(true);
    try {
      const maxOrder = periodTypes.length > 0 ? Math.max(...periodTypes.map(p => p.display_order)) : 0;
      const payload: any = {
        name: ptForm.name.trim(),
        day_count: ptForm.day_count ? parseInt(ptForm.day_count) : null,
        is_builtin: false,
        display_order: editingPT ? editingPT.display_order : maxOrder + 1,
      };
      if (editingPT) {
        const { error: e } = await supabase.from('pre_fund_period_types').update(payload).eq('id', editingPT.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('pre_fund_period_types').insert(payload);
        if (e) throw e;
      }
      toast({ title: editingPT ? 'Period type updated' : 'Period type added' });
      setShowPTDialog(false);
      setEditingPT(null);
      setPtForm({ name: '', day_count: '' });
      await load();
    } catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
    finally { setPtSaving(false); }
  };

  const handleDeletePT = async (id: string) => {
    try {
      const { error: e } = await supabase.from('pre_fund_period_types').delete().eq('id', id);
      if (e) throw e;
      toast({ title: 'Period type deleted' });
      await load();
    } catch (e: any) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  const handleSeedBuiltins = async () => {
    setSaving(true);
    try {
      for (let i = 0; i < BUILTIN_PERIOD_TYPES.length; i++) {
        const pt = BUILTIN_PERIOD_TYPES[i];
        const exists = periodTypes.some(p => p.name === pt.name);
        if (!exists) {
          await supabase.from('pre_fund_period_types').insert({ name: pt.name, day_count: pt.day_count, is_builtin: true, display_order: i + 1 });
        }
      }
      toast({ title: 'Built-in period types seeded' });
      await load();
    } catch (e: any) { toast({ title: 'Seed failed', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const set = (k: keyof Settings, v: any) => setSettings(p => ({ ...p, [k]: v }));

  if (!canAccess) return (
    <div className="p-8 text-center"><AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" /><p className="text-muted-foreground">Access denied.</p></div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Settings2 className="h-5 w-5 text-sky-600" />Pre-Funding Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">System-wide defaults, period types, GL accounts, bank API, and integration toggles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-settings">{saving ? 'Saving…' : 'Save Settings'}</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : (
        <>
          {/* ── System defaults */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-sky-600" />System Defaults</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Default Display Currency</Label>
                  <Select value={settings.base_currency} onValueChange={v => set('base_currency', v)}>
                    <SelectTrigger data-testid="select-base-currency-setting"><SelectValue /></SelectTrigger>
                    <SelectContent>{['USD','SDG','EUR','GBP','SAR','AED','JPY','CNY','CHF','CAD','AUD','NOK','SEK'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Dashboard display currency (display-only, GL always uses fund currency)</p>
                </div>
                <div>
                  <Label>Default Low-Balance Threshold %</Label>
                  <Input type="number" value={settings.default_threshold_pct} onChange={e => set('default_threshold_pct', parseInt(e.target.value))} data-testid="input-threshold-pct" />
                  <p className="text-[10px] text-muted-foreground mt-1">Alert fires when available balance drops below this % of funded amount</p>
                </div>
                <div>
                  <Label>Default Ending-Soon Warning (days)</Label>
                  <Input type="number" value={settings.default_warning_days} onChange={e => set('default_warning_days', parseInt(e.target.value))} data-testid="input-warning-days" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Default Auto-Renewal Mode</Label>
                  <Select value={settings.default_renewal_mode} onValueChange={v => set('default_renewal_mode', v)}>
                    <SelectTrigger data-testid="select-default-renewal"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Manual Only</SelectItem>
                      <SelectItem value="auto_draft">Auto-Draft</SelectItem>
                      <SelectItem value="auto_activate">Auto-Activate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Auto-Activate Grace Window (hours)</Label>
                  <Input type="number" value={settings.auto_renewal_grace_hours} onChange={e => set('auto_renewal_grace_hours', parseInt(e.target.value))} data-testid="input-grace-hours" />
                  <p className="text-[10px] text-muted-foreground mt-1">Finance can cancel auto-activation within this window</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Period Type Manager */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><RotateCcw className="h-4 w-4 text-sky-600" />Period Type Manager</CardTitle>
                <div className="flex gap-2">
                  {periodTypes.filter(p => p.is_builtin).length === 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSeedBuiltins}>Seed Built-ins</Button>
                  )}
                  <Button size="sm" className="h-7 text-xs" onClick={() => { setEditingPT(null); setPtForm({ name: '', day_count: '' }); setShowPTDialog(true); }} data-testid="button-add-period-type">
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Type
                  </Button>
                </div>
              </div>
              <CardDescription className="text-[11px]">Built-in types are protected from deletion. Admins can add custom types with any name and day count.</CardDescription>
            </CardHeader>
            <CardContent>
              {periodTypes.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">No period types yet. Click "Seed Built-ins" to add the defaults.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Day Count</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodTypes.map(pt => (
                      <TableRow key={pt.id} data-testid={`row-pt-${pt.id}`}>
                        <TableCell className="font-medium text-sm">{pt.name}</TableCell>
                        <TableCell className="text-sm">{pt.day_count ?? 'Flexible'}</TableCell>
                        <TableCell>
                          {pt.is_builtin
                            ? <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">Built-in</Badge>
                            : <Badge variant="outline" className="text-[10px]">Custom</Badge>}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                              onClick={() => { setEditingPT(pt); setPtForm({ name: pt.name, day_count: String(pt.day_count ?? '') }); setShowPTDialog(true); }}
                              data-testid={`button-edit-pt-${pt.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                            {!pt.is_builtin && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeletePT(pt.id)} data-testid={`button-delete-pt-${pt.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ── Bank API Feed */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-sky-600" />External Bank API Feed</CardTitle>
                <Switch checked={settings.bank_api_enabled} onCheckedChange={v => set('bank_api_enabled', v)} data-testid="switch-bank-api" />
              </div>
              <CardDescription className="text-[11px]">Auto-import incoming transfers and match them to awaiting-receipt pre-funds by amount ± tolerance.</CardDescription>
            </CardHeader>
            {settings.bank_api_enabled && (
              <CardContent className="space-y-4">
                <div>
                  <Label>Webhook / Polling API URL</Label>
                  <Input value={settings.bank_api_url ?? ''} onChange={e => set('bank_api_url', e.target.value)} placeholder="https://bank-api.example.com/feed" data-testid="input-bank-url" />
                </div>
                <div>
                  <Label>API Key {settings.bank_api_key_hint && <span className="text-muted-foreground text-[10px] ml-1">(current: ···{settings.bank_api_key_hint})</span>}</Label>
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={bankApiKey}
                    onChange={e => setBankApiKey(e.target.value)}
                    placeholder="Enter new key to update (leave blank to keep current)"
                    data-testid="input-bank-api-key"
                  />
                  <button className="text-[10px] text-primary mt-1" onClick={() => setShowApiKey(p => !p)}>{showApiKey ? 'Hide' : 'Show'}</button>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Key is encrypted at rest. Only the last 4 characters are ever displayed after save.</p>
                </div>
                <div>
                  <Label>Match Tolerance %</Label>
                  <Input type="number" value={settings.bank_match_tolerance_pct} onChange={e => set('bank_match_tolerance_pct', parseFloat(e.target.value))} placeholder="2" data-testid="input-match-tolerance" />
                  <p className="text-[10px] text-muted-foreground mt-1">Incoming transfers within ±{settings.bank_match_tolerance_pct}% of the fund amount will be auto-matched</p>
                </div>

                {/* ── Unmatched Transfers Queue ─────────────────────────────── */}
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">Unmatched Transfers Queue</p>
                      <p className="text-[11px] text-muted-foreground">Bank feed entries that could not be auto-matched — review and link manually or dismiss.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadUnmatched} disabled={loadingUnmatched} data-testid="button-refresh-unmatched">
                      <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loadingUnmatched && 'animate-spin')} />Refresh
                    </Button>
                  </div>
                  {loadingUnmatched ? (
                    <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : unmatchedItems.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-muted/20">
                      <Activity className="h-6 w-6 mx-auto mb-1 opacity-30" />
                      No unmatched transfers — all clear.
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-[11px]">Date</TableHead>
                            <TableHead className="text-[11px]">Reference</TableHead>
                            <TableHead className="text-[11px]">Amount</TableHead>
                            <TableHead className="text-[11px]">Description</TableHead>
                            <TableHead className="text-[11px] text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unmatchedItems.map(item => (
                            <TableRow key={item.id} data-testid={`row-unmatched-${item.id}`}>
                              <TableCell className="text-[11px] font-mono">{format(parseISO(item.transaction_date), 'MMM d, yyyy')}</TableCell>
                              <TableCell className="text-[11px] max-w-[120px] truncate">{item.raw_reference ?? '—'}</TableCell>
                              <TableCell className="text-[11px] font-mono font-semibold">{item.currency} {formatNumber(item.amount, 0)}</TableCell>
                              <TableCell className="text-[11px] max-w-[160px] truncate text-muted-foreground">{item.description ?? '—'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => openMatchDialog(item)} disabled={!!matchingId} data-testid={`button-match-${item.id}`}>
                                    Link Fund
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive" onClick={() => handleDismiss(item.id)} disabled={matchingId === item.id} data-testid={`button-dismiss-${item.id}`}>
                                    Dismiss
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* ── GL Account Mapping Defaults */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-sky-600" />Default GL Account Mapping</CardTitle>
              <CardDescription className="text-[11px]">COA codes pre-populated when creating a new fund. Override per-fund in the Registry. The GL Bridge engine resolves these codes to account IDs at posting time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Cash / Bank Account (DR on receipt)</Label>
                  <Input value={settings.default_gl_receipt_account} onChange={e => set('default_gl_receipt_account', e.target.value)} placeholder="1200" data-testid="input-gl-receipt" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Debited when fund is received from donor</p>
                </div>
                <div>
                  <Label>Pre-Fund Liability Account (CR on receipt / DR on payment)</Label>
                  <Input value={settings.default_gl_liability_account} onChange={e => set('default_gl_liability_account', e.target.value)} placeholder="2400" data-testid="input-gl-liability" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Deferred liability cleared as cash is disbursed</p>
                </div>
                <div>
                  <Label>Programme Expense Account (CR on period close variance)</Label>
                  <Input value={settings.default_gl_expense_account} onChange={e => set('default_gl_expense_account', e.target.value)} placeholder="7000" data-testid="input-gl-expense" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Recognises residual balance as cost on period close</p>
                </div>
                <div>
                  <Label>Carry-Forward Reserve Account (CR on carry-forward)</Label>
                  <Input value={settings.default_gl_cf_account} onChange={e => set('default_gl_cf_account', e.target.value)} placeholder="2401" data-testid="input-gl-cf" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Liability rolled to next period when surplus action = carry_forward</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Default Bank Feed Matching Scope</Label>
                  <Select value={settings.default_matching_scope} onValueChange={v => set('default_matching_scope', v)}>
                    <SelectTrigger data-testid="select-matching-scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (all unmatched feed entries)</SelectItem>
                      <SelectItem value="project">Project-scoped</SelectItem>
                      <SelectItem value="country">Country-scoped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Reconciliation Action Toggles */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><RotateCcw className="h-4 w-4 text-sky-600" />Reconciliation Actions</CardTitle>
              <CardDescription className="text-[11px]">Enable or disable surplus disposal options at period close.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'reconciliation_action_return' as const,    label: 'Return to Donor',    sub: 'Allow returning surplus cash to the donor at period close' },
                { key: 'reconciliation_action_carry_fwd' as const, label: 'Carry Forward',       sub: 'Allow carrying forward surplus into the next period' },
                { key: 'reconciliation_action_reserve' as const,   label: 'Reserve',             sub: 'Allow reserving surplus in a holding account' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                  </div>
                  <Switch checked={settings[item.key] as boolean} onCheckedChange={v => set(item.key, v)} data-testid={`switch-${item.key}`} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── Integration Toggles */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-sky-600" />Cross-System Integration Toggles</CardTitle>
              <CardDescription className="text-[11px]">Control which systems automatically receive pre-fund events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: 'integration_bank_recon' as const,    label: 'Bank Reconciliation',   sub: 'Auto-create bank statement lines when a fund is activated (acct_bank_statement_lines)' },
                { key: 'integration_cashflow' as const,      label: 'Cash Flow Forecast',    sub: 'Include active pre-funds as inflows and commitments as outflows in cash flow projections' },
                { key: 'integration_encumbrance' as const,   label: 'Budget Encumbrance',    sub: 'Create encumbrance records (acct_budget_encumbrances) for committed fund amounts' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                  </div>
                  <Switch
                    checked={settings[item.key] as boolean}
                    onCheckedChange={v => set(item.key, v)}
                    data-testid={`switch-${item.key}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-settings-bottom">
              {saving ? 'Saving…' : 'Save All Settings'}
            </Button>
          </div>
        </>
      )}

      {/* Period Type Dialog */}
      <Dialog open={showPTDialog} onOpenChange={setShowPTDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingPT ? 'Edit Period Type' : 'Add Period Type'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={ptForm.name} onChange={e => setPtForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Semi-annual" data-testid="input-pt-name" />
            </div>
            <div>
              <Label>Day Count (leave blank for flexible)</Label>
              <Input type="number" value={ptForm.day_count} onChange={e => setPtForm(p => ({ ...p, day_count: e.target.value }))} placeholder="e.g. 180" data-testid="input-pt-days" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPTDialog(false)}>Cancel</Button>
            <Button onClick={handleSavePT} disabled={ptSaving} data-testid="button-save-pt">{ptSaving ? 'Saving…' : editingPT ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Match Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!matchDialog} onOpenChange={o => !o && setMatchDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Transfer to Fund</DialogTitle>
          </DialogHeader>
          {matchDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-[11px]">Transfer</span>
                  <span className="font-mono font-semibold">{matchDialog.item.currency} {formatNumber(matchDialog.item.amount, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-[11px]">Date</span>
                  <span className="text-[11px]">{format(parseISO(matchDialog.item.transaction_date), 'MMM d, yyyy')}</span>
                </div>
                {matchDialog.item.raw_reference && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[11px]">Ref</span>
                    <span className="text-[11px] font-mono">{matchDialog.item.raw_reference}</span>
                  </div>
                )}
              </div>
              <div>
                <Label>Awaiting-Receipt Fund *</Label>
                <Select value={matchFundId} onValueChange={setMatchFundId}>
                  <SelectTrigger data-testid="select-match-fund"><SelectValue placeholder="Select fund…" /></SelectTrigger>
                  <SelectContent>
                    {matchDialog.funds.length === 0 ? (
                      <SelectItem value="__none" disabled>No funds awaiting receipt</SelectItem>
                    ) : matchDialog.funds.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} — {f.currency} {formatNumber(f.amount, 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Matching will mark this transfer as linked and activate the fund.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialog(null)}>Cancel</Button>
            <Button onClick={handleManualMatch} disabled={!matchFundId || !!matchingId} data-testid="button-confirm-match">
              {matchingId ? 'Matching…' : 'Confirm Match'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
