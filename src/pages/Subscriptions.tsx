import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, isValid, differenceInDays,
} from 'date-fns';
import {
  CreditCard, Plus, Trash2, Edit3, Save, AlertTriangle,
  Loader2, Search, Settings, Bell,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Subscription {
  id: string;
  name: string;
  vendor: string;
  category: 'software' | 'infrastructure' | 'services' | 'other';
  amount: number;
  currency: string;
  billing_cycle: 'monthly' | 'annual';
  renewal_date: string;
  is_active: boolean;
  project_id: string | null;
  notes: string | null;
  created_at: string;
}

interface NotifSettings {
  id: string;
  monthly_cost_threshold: number;
  currency: string;
  renewal_alert_days: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'SDG', 'EUR', 'GBP'];
const CATEGORIES = [
  { value: 'software', label: 'Software' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];
const CATEGORY_COLORS: Record<string, string> = {
  software: '#6366f1',
  infrastructure: '#f59e0b',
  services: '#10b981',
  other: '#94a3b8',
};
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', SDG: 'SDG', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;
const fmt = (n: number, c = 'USD') =>
  `${sym(c)} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function monthlyEquivalent(sub: Subscription): number {
  return sub.billing_cycle === 'annual' ? sub.amount / 12 : sub.amount;
}

const CACHE = { staleTime: 5 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false } as const;

interface Project {
  id: string;
  name: string;
}

type SubCategory = 'software' | 'infrastructure' | 'services' | 'other';
type BillingCycle = 'monthly' | 'annual';

interface SubscriptionForm {
  name: string;
  vendor: string;
  category: SubCategory;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  renewal_date: string;
  is_active: boolean;
  project_id: string;
  notes: string;
}

const EMPTY_FORM: SubscriptionForm = {
  name: '', vendor: '', category: 'software', amount: '',
  currency: 'USD', billing_cycle: 'monthly', renewal_date: '',
  is_active: true, project_id: '', notes: '',
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const roleCanManage = isSuperAdmin() || hasAnyRole(['admin', 'Admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin']);
  const overrideCanManage = usePageManageOverride('subscriptions', roleCanManage);
  const canManage = roleCanManage || overrideCanManage;
  const isAuthorized = canManage || hasAnyRole(['countryDirector', 'country_director', 'CountryDirector']);

  // Route-level authorization — redirect users without finance/admin/auditor access
  useEffect(() => {
    if (!isAuthorized) {
      navigate('/unauthorized', { replace: true });
    }
  }, [isAuthorized, navigate]);
  const canEdit = canManage;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ monthly_cost_threshold: '10000', currency: 'USD', renewal_alert_days: '7' });
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ['subscriptions'],
    ...CACHE,
    queryFn: async () => {
      const { data, error } = await supabase.from('subscriptions').select('*').order('renewal_date');
      if (error) throw error;
      return (data ?? []) as Subscription[];
    },
  });

  const { data: notifSettings } = useQuery<NotifSettings | null>({
    queryKey: ['subscription-notif-settings'],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase.from('subscription_notification_settings').select('*').limit(1).maybeSingle();
      return data as NotifSettings | null;
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list-for-subscriptions'],
    ...CACHE,
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name').order('name');
      if (error) return [];
      return (data ?? []) as Project[];
    },
  });

  // Sync settings form when loaded
  useEffect(() => {
    if (notifSettings) {
      setSettingsForm({
        monthly_cost_threshold: String(notifSettings.monthly_cost_threshold),
        currency: notifSettings.currency,
        renewal_alert_days: String(notifSettings.renewal_alert_days),
      });
    }
  }, [notifSettings]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeSubscriptions = useMemo(() => subscriptions.filter(s => s.is_active), [subscriptions]);

  const totalMonthly = useMemo(() =>
    activeSubscriptions.reduce((s, sub) => s + monthlyEquivalent(sub), 0),
    [activeSubscriptions]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    activeSubscriptions.forEach(sub => {
      const key = sub.category;
      map[key] = (map[key] ?? 0) + monthlyEquivalent(sub);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [activeSubscriptions]);

  const filtered = useMemo(() => {
    let list = subscriptions;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.vendor.toLowerCase().includes(q));
    }
    if (catFilter !== 'all') list = list.filter(s => s.category === catFilter);
    return list;
  }, [subscriptions, search, catFilter]);

  const renewingSoon = useMemo(() => {
    const alertDays = notifSettings?.renewal_alert_days ?? 7;
    const today = new Date();
    return activeSubscriptions
      .filter(s => {
        const d = differenceInDays(parseISO(s.renewal_date), today);
        return d >= 0 && d <= alertDays;
      })
      .sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));
  }, [activeSubscriptions, notifSettings]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(sub: Subscription) {
    setForm({
      name: sub.name, vendor: sub.vendor, category: sub.category,
      amount: String(sub.amount), currency: sub.currency, billing_cycle: sub.billing_cycle,
      renewal_date: sub.renewal_date, is_active: sub.is_active,
      project_id: sub.project_id ?? '', notes: sub.notes ?? '',
    });
    setEditingId(sub.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name || !form.vendor || !form.amount || !form.renewal_date) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), vendor: form.vendor.trim(), category: form.category,
        amount: parseFloat(form.amount), currency: form.currency, billing_cycle: form.billing_cycle,
        renewal_date: form.renewal_date, is_active: form.is_active,
        project_id: form.project_id || null,
        notes: form.notes.trim() || null,
        created_by: currentUser?.id,
      };
      if (editingId) {
        const { error } = await supabase.from('subscriptions').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Subscription updated' });
      } else {
        const { error } = await supabase.from('subscriptions').insert(payload);
        if (error) throw error;
        toast({ title: 'Subscription added' });
      }
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      setShowForm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    toast({ title: 'Subscription deleted' });
  }

  async function handleToggle(sub: Subscription) {
    const { error } = await supabase.from('subscriptions').update({ is_active: !sub.is_active }).eq('id', sub.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const payload = {
        monthly_cost_threshold: parseFloat(settingsForm.monthly_cost_threshold),
        currency: settingsForm.currency,
        renewal_alert_days: parseInt(settingsForm.renewal_alert_days, 10),
        updated_at: new Date().toISOString(),
      };
      let error: { message: string } | null = null;
      if (notifSettings?.id) {
        ({ error } = await supabase.from('subscription_notification_settings').update(payload).eq('id', notifSettings.id));
      } else {
        ({ error } = await supabase.from('subscription_notification_settings').insert(payload));
      }
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ['subscription-notif-settings'] });
      toast({ title: 'Settings saved' });
      setShowSettings(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-indigo-500" />
              Subscriptions
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track all recurring software, infrastructure, and service costs</p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSettings(true)} data-testid="button-open-settings">
                <Settings className="h-3.5 w-3.5" />Alert Settings
              </Button>
            )}
            {canEdit && (
              <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={openNew} data-testid="button-add-subscription">
                <Plus className="h-3.5 w-3.5" />Add Subscription
              </Button>
            )}
          </div>
        </div>

        {/* KPI Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Active Subscriptions" value={isLoading ? '…' : String(activeSubscriptions.length)} sub="Currently active" color="indigo" />
          <KpiCard label="Est. Monthly Cost" value={isLoading ? '…' : fmt(totalMonthly)} sub="All active (prorated)" color="emerald" />
          <KpiCard label="Renewing Soon" value={isLoading ? '…' : String(renewingSoon.length)} sub={`Within ${notifSettings?.renewal_alert_days ?? 7} days`} color={renewingSoon.length > 0 ? 'amber' : 'slate'} />
          <KpiCard label="Total Tracked" value={isLoading ? '…' : String(subscriptions.length)} sub="Active & inactive" color="blue" />
        </div>

        {/* Renewal Alert Banner */}
        {renewingSoon.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Upcoming Renewals</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {renewingSoon.map(s => (
                  <Badge key={s.id} variant="outline" className="border-amber-300 text-amber-700 bg-white dark:bg-transparent text-xs">
                    {s.name} — {format(parseISO(s.renewal_date), 'dd MMM')} ({fmt(s.amount, s.currency)})
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chart + Filters row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1 shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Monthly Cost by Category</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              {isLoading ? <div className="h-40 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin opacity-30" /></div>
              : categoryBreakdown.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8 italic">No active subscriptions</p>
              : (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" nameKey="name">
                      {categoryBreakdown.map((entry, i) => (
                        <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v), 'Monthly']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend iconSize={10} formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-3">
            {/* Search + category filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or vendor…" className="pl-9 h-9 text-sm bg-white dark:bg-slate-900" data-testid="input-search-subscriptions" />
              </div>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="h-9 w-[150px] text-sm bg-white dark:bg-slate-900" data-testid="select-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Category breakdown pills */}
            <div className="flex flex-wrap gap-2">
              {categoryBreakdown.map(cat => (
                <div key={cat.name} className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border rounded-lg px-3 py-1.5 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat.name] ?? '#94a3b8' }} />
                  <span className="text-xs font-medium capitalize">{cat.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{fmt(cat.value)}/mo</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Subscriptions Table */}
        <Card className="shadow-sm border-0 overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground">All Subscriptions</CardTitle>
            <Badge variant="outline" className="text-xs">{filtered.length} shown</Badge>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 uppercase tracking-wide">Subscription</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide hidden sm:table-cell">Category</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Amount</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide hidden md:table-cell">Monthly</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Renewal</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3 uppercase tracking-wide">Status</th>
                  {canEdit && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="h-5 w-5 animate-spin opacity-30 mx-auto" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">No subscriptions found.</td></tr>
                ) : filtered.map(sub => {
                  const daysLeft = differenceInDays(parseISO(sub.renewal_date), new Date());
                  const isRenewingSoon = daysLeft >= 0 && daysLeft <= (notifSettings?.renewal_alert_days ?? 7);
                  return (
                    <tr key={sub.id} className="group border-b last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors" data-testid={`row-subscription-${sub.id}`}>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold leading-tight">{sub.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{sub.vendor}</p>
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[sub.category] ?? '#94a3b8' }} />
                          <span className="text-xs capitalize">{sub.category}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right font-medium">
                        {fmt(sub.amount, sub.currency)}
                        <span className="text-xs text-muted-foreground ml-1">/{sub.billing_cycle === 'annual' ? 'yr' : 'mo'}</span>
                      </td>
                      <td className="px-3 py-3.5 text-right text-muted-foreground hidden md:table-cell text-xs">
                        {fmt(monthlyEquivalent(sub), sub.currency)}/mo
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className={cn('text-xs font-medium', isRenewingSoon && sub.is_active ? 'text-amber-600' : 'text-muted-foreground')}>
                          {format(parseISO(sub.renewal_date), 'dd MMM yyyy')}
                          {isRenewingSoon && sub.is_active && <span className="ml-1 text-amber-500">⚠</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        {canEdit ? (
                          <Switch checked={sub.is_active} onCheckedChange={() => handleToggle(sub)} data-testid={`toggle-active-${sub.id}`} />
                        ) : (
                          <Badge variant={sub.is_active ? 'default' : 'secondary'} className="text-xs">
                            {sub.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sub)} data-testid={`button-edit-${sub.id}`}>
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDelete(sub.id, sub.name)} data-testid={`button-delete-${sub.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {!isLoading && filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-t">
                    <td colSpan={3} className="px-5 py-2.5 text-xs text-muted-foreground font-medium">
                      {filtered.filter(s => s.is_active).length} active · {filtered.filter(s => !s.is_active).length} inactive
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-emerald-700 hidden md:table-cell">
                      {fmt(filtered.filter(s => s.is_active).reduce((sum, s) => sum + monthlyEquivalent(s), 0))}/mo total
                    </td>
                    <td colSpan={canEdit ? 3 : 2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Subscription' : 'Add Subscription'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Subscription Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. GitHub Enterprise" data-testid="input-sub-name" />
              </div>
              <div className="space-y-1">
                <Label>Vendor *</Label>
                <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="e.g. GitHub Inc." data-testid="input-sub-vendor" />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as SubCategory }))}>
                  <SelectTrigger data-testid="select-sub-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount *</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" data-testid="input-sub-amount" />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger data-testid="select-sub-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Billing Cycle</Label>
                <Select value={form.billing_cycle} onValueChange={(v) => setForm(f => ({ ...f, billing_cycle: v as BillingCycle }))}>
                  <SelectTrigger data-testid="select-sub-billing-cycle"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Next Renewal Date *</Label>
                <Input type="date" value={form.renewal_date} onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))} data-testid="input-sub-renewal-date" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Project / Cost Centre</Label>
                <Select value={form.project_id || '__none__'} onValueChange={(v) => setForm(f => ({ ...f, project_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger data-testid="select-sub-project"><SelectValue placeholder="None (general overhead)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (general overhead)</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} id="sub-active" data-testid="toggle-sub-active" />
                <Label htmlFor="sub-active">Active</Label>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes…" data-testid="textarea-sub-notes" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-save-subscription">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4" />Notification Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Monthly Cost Alert Threshold</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" value={settingsForm.monthly_cost_threshold} onChange={e => setSettingsForm(f => ({ ...f, monthly_cost_threshold: e.target.value }))} data-testid="input-threshold-amount" />
                <Select value={settingsForm.currency} onValueChange={v => setSettingsForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger className="w-24" data-testid="select-threshold-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Alert when total monthly subscriptions exceed this amount</p>
            </div>
            <div className="space-y-1">
              <Label>Renewal Alert (days before)</Label>
              <Input type="number" min="1" max="90" value={settingsForm.renewal_alert_days} onChange={e => setSettingsForm(f => ({ ...f, renewal_alert_days: e.target.value }))} data-testid="input-renewal-days" />
              <p className="text-xs text-muted-foreground">Notify when a subscription renewal is within this many days</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={saveSettings} disabled={savingSettings} data-testid="button-save-settings">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-600', emerald: 'text-emerald-600', amber: 'text-amber-600',
    blue: 'text-blue-600', slate: 'text-slate-500',
  };
  return (
    <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
      <CardContent className="pt-4 pb-4 px-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <p className={cn('text-2xl font-bold mt-1', colorMap[color] ?? 'text-slate-700')}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
