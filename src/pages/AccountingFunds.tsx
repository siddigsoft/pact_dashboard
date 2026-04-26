import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, RefreshCw, Plus, Pencil, Search, Landmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface Fund {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  restriction_type: 'without_restriction' | 'with_restriction' | 'board_designated' | 'quasi_endowment';
  donor_partner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

const RESTRICTION_TYPES = [
  { value: 'without_restriction', label: 'Without Restriction', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'with_restriction',    label: 'With Restriction',    color: 'bg-amber-50 text-amber-800 border-amber-200'   },
  { value: 'board_designated',    label: 'Board Designated',    color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { value: 'quasi_endowment',     label: 'Quasi-Endowment',     color: 'bg-sky-50 text-sky-700 border-sky-200'          },
] as const;

const RESTRICTION_TONE = Object.fromEntries(RESTRICTION_TYPES.map(r => [r.value, r.color]));
const RESTRICTION_LABEL = Object.fromEntries(RESTRICTION_TYPES.map(r => [r.value, r.label]));

const BLANK: Omit<Fund, 'id' | 'created_at'> = {
  code: '', name_en: '', name_ar: '',
  restriction_type: 'without_restriction',
  donor_partner_id: null,
  start_date: null, end_date: null,
  is_active: true,
};

export default function AccountingFunds() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'accountant']);
  const { toast } = useToast();

  const [funds, setFunds]   = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [restrictionFilter, setRestrictionFilter] = useState<string>('all');

  const [formOpen, setFormOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Fund | null>(null);
  const [form, setForm]           = useState({ ...BLANK });
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('acct_funds')
      .select('id, code, name_en, name_ar, restriction_type, donor_partner_id, start_date, end_date, is_active, created_at')
      .order('code');
    if (err) setError(err.message);
    setFunds((data ?? []) as Fund[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return funds.filter(f => {
      if (!showInactive && !f.is_active) return false;
      if (restrictionFilter !== 'all' && f.restriction_type !== restrictionFilter) return false;
      if (q) return f.code.toLowerCase().includes(q) || f.name_en.toLowerCase().includes(q) || (f.name_ar ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [funds, search, showInactive, restrictionFilter]);

  const counts = useMemo(() => ({
    total: funds.length,
    active: funds.filter(f => f.is_active).length,
    restricted: funds.filter(f => f.restriction_type !== 'without_restriction').length,
  }), [funds]);

  const openAdd = () => {
    setEditTarget(null);
    setForm({ ...BLANK });
    setFormOpen(true);
  };

  const openEdit = (f: Fund) => {
    setEditTarget(f);
    setForm({
      code: f.code, name_en: f.name_en, name_ar: f.name_ar ?? '',
      restriction_type: f.restriction_type,
      donor_partner_id: f.donor_partner_id,
      start_date: f.start_date, end_date: f.end_date,
      is_active: f.is_active,
    });
    setFormOpen(true);
  };

  const setField = <K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.code.trim() || !form.name_en.trim() || !form.name_ar.trim()) {
      toast({ title: 'Code and both names (EN + AR) are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      code:             form.code.trim(),
      name_en:          form.name_en.trim(),
      name_ar:          form.name_ar.trim(),
      restriction_type: form.restriction_type,
      start_date:       form.start_date || null,
      end_date:         form.end_date   || null,
      is_active:        form.is_active,
    };
    let err;
    if (editTarget) {
      ({ error: err } = await supabase.from('acct_funds').update(payload).eq('id', editTarget.id));
    } else {
      ({ error: err } = await supabase.from('acct_funds').insert(payload));
    }
    setSaving(false);
    if (err) toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    else {
      toast({ title: editTarget ? 'Fund updated' : 'Fund created' });
      setFormOpen(false);
      void load();
    }
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1100px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-blue-600" /> Funds
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">الصناديق</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every journal line must be tagged to a fund. Funds track donor restrictions and endowments.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button size="sm" onClick={openAdd} data-testid="button-add-fund">
              <Plus className="w-4 h-4 mr-1" /> Add Fund
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Total Funds</div><div className="text-xl font-bold">{counts.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Active</div><div className="text-xl font-bold text-emerald-700">{counts.active}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Restricted</div><div className="text-xl font-bold text-amber-700">{counts.restricted}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Fund Registry</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative sm:col-span-1">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid="input-fund-search" />
            </div>
            <Select value={restrictionFilter} onValueChange={setRestrictionFilter}>
              <SelectTrigger data-testid="select-restriction"><SelectValue placeholder="Restriction type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {RESTRICTION_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-show-inactive" />
              <Label htmlFor="show-inactive" className="text-sm">Show inactive</Label>
            </div>
          </div>

          {error && <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No funds match the current filters.</div>
          ) : (
            <div className="border rounded-md">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                <div className="col-span-2">Code</div>
                <div className="col-span-3">Name (EN)</div>
                <div className="col-span-2">Name (AR)</div>
                <div className="col-span-2">Restriction</div>
                <div className="col-span-2">Dates</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              {filtered.map(f => (
                <div key={f.id} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-0 items-center hover:bg-muted/30 group" data-testid={`row-fund-${f.id}`}>
                  <div className="col-span-2 font-mono text-xs font-semibold">{f.code}</div>
                  <div className="col-span-3 text-sm">{f.name_en}</div>
                  <div className="col-span-2 text-sm text-muted-foreground" dir="rtl" lang="ar">{f.name_ar}</div>
                  <div className="col-span-2">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5', RESTRICTION_TONE[f.restriction_type])}>
                      {RESTRICTION_LABEL[f.restriction_type]}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-[11px] text-muted-foreground">
                    {f.start_date ? format(parseISO(f.start_date), 'dd MMM yy') : '—'}{' '}→{' '}
                    {f.end_date   ? format(parseISO(f.end_date),   'dd MMM yy') : '∞'}
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    {!f.is_active && <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-600">Inactive</Badge>}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openEdit(f)}
                        className="p-1 rounded hover:bg-blue-50 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit"
                        data-testid={`button-edit-fund-${f.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-fund-form">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Fund' : 'Add Fund'}</DialogTitle>
            <DialogDescription>
              {editTarget ? `Editing ${editTarget.code} — ${editTarget.name_en}` : 'Create a new fund in the registry.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code *</Label>
                <Input placeholder="e.g. USAID-EDU-2026" value={form.code} onChange={e => setField('code', e.target.value)} data-testid="input-fund-code" />
              </div>
              <div className="space-y-1">
                <Label>Restriction Type *</Label>
                <Select value={form.restriction_type} onValueChange={v => setField('restriction_type', v as Fund['restriction_type'])}>
                  <SelectTrigger data-testid="select-fund-restriction"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESTRICTION_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Name (English) *</Label>
              <Input placeholder="USAID Education Fund 2026" value={form.name_en} onChange={e => setField('name_en', e.target.value)} data-testid="input-fund-name-en" />
            </div>
            <div className="space-y-1">
              <Label>Name (Arabic) *</Label>
              <Input dir="rtl" lang="ar" placeholder="صندوق يوإس إيد التعليمي 2026" value={form.name_ar} onChange={e => setField('name_ar', e.target.value)} data-testid="input-fund-name-ar" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date ?? ''} onChange={e => setField('start_date', e.target.value || null)} data-testid="input-fund-start" />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date ?? ''} onChange={e => setField('end_date', e.target.value || null)} data-testid="input-fund-end" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fund-active" checked={form.is_active} onCheckedChange={v => setField('is_active', v)} data-testid="switch-fund-active" />
              <Label htmlFor="fund-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} data-testid="button-save-fund">
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editTarget ? 'Save Changes' : 'Create Fund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
