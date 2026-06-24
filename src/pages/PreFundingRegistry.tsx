import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Pencil, Trash2, Upload, FileText, RefreshCw, Search,
  AlertTriangle, ChevronRight, DollarSign, Calendar, CheckCircle2,
  FolderOpen, Download, Send,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface PeriodType { id: string; name: string; day_count: number | null; is_builtin: boolean }
interface PreFundRequest {
  id: string;
  name: string;
  source: string | null;
  amount: number;
  currency: string;
  available_balance: number;
  committed_amount: number;
  paid_amount: number;
  status: string;
  period_type_id: string | null;
  period_type_name: string | null;
  start_date: string | null;
  end_date: string | null;
  country_id: string | null;
  project_id: string | null;
  grant_id: string | null;
  matching_scope: string;
  auto_renewal_mode: string;
  auto_renewal_days_before: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Draft',            cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending_approval: { label: 'Awaiting Approval',cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  awaiting_receipt: { label: 'Awaiting Receipt', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  active:           { label: 'Active',           cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  low_balance:      { label: 'Low Balance',      cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  closed:           { label: 'Closed',           cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  period_locked:    { label: 'Period Locked',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const MATCHING_SCOPE_OPTIONS = [
  { value: 'country',                  label: 'Country Only' },
  { value: 'project',                  label: 'Project Only' },
  { value: 'country_project',          label: 'Country + Project' },
  { value: 'country_project_category', label: 'Country + Project + Cost Category' },
];

const RENEWAL_OPTIONS = [
  { value: 'off',           label: 'Manual Only' },
  { value: 'auto_draft',    label: 'Auto-Draft (Finance approves before activation)' },
  { value: 'auto_activate', label: 'Auto-Activate (auto-activates with grace window)' },
];

const EMPTY_FORM = {
  name: '', source: '', amount: '', currency: 'USD', period_type_id: '',
  start_date: '', end_date: '', country_id: '', project_id: '', grant_id: '',
  matching_scope: 'country_project', threshold_pct: '', threshold_amount: '',
  warning_days: '14', auto_renewal_mode: 'off', auto_renewal_days_before: '7',
  notes: '',
};

export default function PreFundingRegistry() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin', 'countryDirector']);

  const [funds, setFunds]           = useState<PreFundRequest[]>([]);
  const [periodTypes, setPeriodTypes]= useState<PeriodType[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<PreFundRequest | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [receiptDialog, setReceiptDialog] = useState<{ open: boolean; fundId: string; fundName: string }>({ open: false, fundId: '', fundName: '' });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fundsRes, ptRes] = await Promise.all([
        supabase.from('pre_fund_requests' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('pre_fund_period_types' as any).select('id,name,day_count,is_builtin').order('display_order'),
      ]);
      if (fundsRes.error && !fundsRes.error.message.includes('does not exist')) throw fundsRes.error;
      setFunds((fundsRes.data as any) ?? []);
      setPeriodTypes((ptRes.data as any) ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
  const openEdit = (f: PreFundRequest) => {
    setEditing(f);
    setForm({
      name: f.name, source: f.source ?? '', amount: String(f.amount), currency: f.currency,
      period_type_id: f.period_type_id ?? '', start_date: f.start_date ?? '', end_date: f.end_date ?? '',
      country_id: f.country_id ?? '', project_id: f.project_id ?? '', grant_id: f.grant_id ?? '',
      matching_scope: f.matching_scope, threshold_pct: '', threshold_amount: '',
      warning_days: String(f.auto_renewal_days_before ?? 14),
      auto_renewal_mode: f.auto_renewal_mode, auto_renewal_days_before: String(f.auto_renewal_days_before ?? 7),
      notes: f.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.amount || !form.currency) {
      toast({ title: 'Required fields missing', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        source: form.source || null,
        amount: parseFloat(form.amount),
        currency: form.currency,
        period_type_id: form.period_type_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        country_id: form.country_id || null,
        project_id: form.project_id || null,
        grant_id: form.grant_id || null,
        matching_scope: form.matching_scope,
        threshold_pct: form.threshold_pct ? parseFloat(form.threshold_pct) : null,
        threshold_amount: form.threshold_amount ? parseFloat(form.threshold_amount) : null,
        warning_days: form.warning_days ? parseInt(form.warning_days) : 14,
        auto_renewal_mode: form.auto_renewal_mode,
        auto_renewal_days_before: form.auto_renewal_days_before ? parseInt(form.auto_renewal_days_before) : null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error: e } = await supabase.from('pre_fund_requests' as any).update(payload).eq('id', editing.id);
        if (e) throw e;
        toast({ title: 'Fund updated' });
      } else {
        payload.status = 'draft';
        payload.available_balance = payload.amount;
        payload.committed_amount = 0;
        payload.paid_amount = 0;
        payload.created_by = currentUser?.id ?? null;
        const { error: e } = await supabase.from('pre_fund_requests' as any).insert(payload);
        if (e) throw e;
        toast({ title: 'Pre-fund created', description: 'Configure the approval chain in Approval Flow Manager.' });
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error: e } = await supabase.from('pre_fund_requests' as any).delete().eq('id', deleteId);
      if (e) throw e;
      toast({ title: 'Fund deleted' });
      setDeleteId(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmitForApproval = async (f: PreFundRequest) => {
    const { error: e } = await supabase.from('pre_fund_requests' as any).update({ status: 'pending_approval' }).eq('id', f.id);
    if (e) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); return; }
    toast({ title: 'Submitted for approval' });
    await load();
  };

  const handleReceiptUpload = async () => {
    if (!receiptFile || !receiptDialog.fundId) return;
    setUploading(true);
    try {
      const path = `pre-fund-receipts/${receiptDialog.fundId}/${Date.now()}-${receiptFile.name}`;
      const { error: upErr } = await supabase.storage.from('financial-documents').upload(path, receiptFile, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('financial-documents').getPublicUrl(path);
      const { error: updErr } = await supabase.from('pre_fund_requests' as any).update({
        status: 'active',
        available_balance: funds.find(f => f.id === receiptDialog.fundId)?.amount ?? 0,
        receipt_url: urlData.publicUrl,
        activated_at: new Date().toISOString(),
      }).eq('id', receiptDialog.fundId);
      if (updErr) throw updErr;
      toast({ title: 'Receipt uploaded — fund is now Active' });
      setReceiptDialog({ open: false, fundId: '', fundName: '' });
      setReceiptFile(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const filtered = funds.filter(f => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !(f.source ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!canAccess) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><FolderOpen className="h-5 w-5 text-sky-600" />Fund Registry</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage all pre-fund requests</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-registry"><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</Button>
          {canAccess && <Button size="sm" onClick={openNew} data-testid="button-new-fund-registry"><Plus className="h-4 w-4 mr-1.5" />New Fund</Button>}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error} — run pre_funding_migration.sql</AlertDescription></Alert>}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search funds…" className="pl-8 h-8 w-48 text-sm" data-testid="input-search-funds" />
        </div>
        {['all', 'active', 'draft', 'pending_approval', 'awaiting_receipt', 'closed'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-all',
              statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'
            )}>{s === 'all' ? 'All' : STATUS_CFG[s]?.label ?? s}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No pre-funds found</p>
          <Button className="mt-4" onClick={openNew}>+ Create First Pre-Fund</Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / Source</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} data-testid={`row-fund-${f.id}`}>
                  <TableCell>
                    <div className="font-medium text-sm">{f.name}</div>
                    {f.source && <div className="text-[11px] text-muted-foreground">{f.source}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {f.start_date && f.end_date
                      ? <>{format(parseISO(f.start_date), 'MMM d')} – {format(parseISO(f.end_date), 'MMM d, yyyy')}</>
                      : f.period_type_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <span className="text-muted-foreground text-[10px] mr-1">{f.currency}</span>
                    {formatNumber(f.amount, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-emerald-600">{formatNumber(f.available_balance, 0)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-violet-600">{formatNumber(f.committed_amount, 0)}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">{MATCHING_SCOPE_OPTIONS.find(o => o.value === f.matching_scope)?.label?.split(' ')[0] ?? f.matching_scope}</TableCell>
                  <TableCell className="text-[11px]">
                    {f.auto_renewal_mode === 'auto_activate' && <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">Auto-Activate</Badge>}
                    {f.auto_renewal_mode === 'auto_draft'    && <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">Auto-Draft</Badge>}
                    {f.auto_renewal_mode === 'off'           && <span className="text-muted-foreground">Manual</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_CFG[f.status]?.cls)}>{STATUS_CFG[f.status]?.label ?? f.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      {f.status === 'draft' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleSubmitForApproval(f)} data-testid={`button-submit-${f.id}`}>
                          <Send className="h-3.5 w-3.5 mr-1" />Submit
                        </Button>
                      )}
                      {f.status === 'awaiting_receipt' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-sky-600" onClick={() => setReceiptDialog({ open: true, fundId: f.id, fundName: f.name })} data-testid={`button-receipt-${f.id}`}>
                          <Upload className="h-3.5 w-3.5 mr-1" />Receipt
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(f)} data-testid={`button-edit-${f.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      {['draft', 'closed'].includes(f.status) && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(f.id)} data-testid={`button-delete-${f.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Pre-Fund' : 'New Pre-Fund Request'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2">
              <Label>Fund Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. WFP Q3 Field Operations" data-testid="input-fund-name" />
            </div>
            <div className="sm:col-span-2">
              <Label>Source / Donor</Label>
              <Input value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="e.g. WFP Sudan, UNICEF" data-testid="input-fund-source" />
            </div>
            <div>
              <Label>Amount *</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" data-testid="input-fund-amount" />
            </div>
            <div>
              <Label>Currency *</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger data-testid="select-fund-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period Type</Label>
              <Select value={form.period_type_id} onValueChange={v => setForm(p => ({ ...p, period_type_id: v }))}>
                <SelectTrigger data-testid="select-period-type"><SelectValue placeholder="Select period type…" /></SelectTrigger>
                <SelectContent>
                  {periodTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Matching Scope</Label>
              <Select value={form.matching_scope} onValueChange={v => setForm(p => ({ ...p, matching_scope: v }))}>
                <SelectTrigger data-testid="select-matching-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATCHING_SCOPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} data-testid="input-start-date" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} data-testid="input-end-date" />
            </div>
            <div>
              <Label>Low-Balance Threshold %</Label>
              <Input type="number" value={form.threshold_pct} onChange={e => setForm(p => ({ ...p, threshold_pct: e.target.value }))} placeholder="e.g. 20" data-testid="input-threshold-pct" />
            </div>
            <div>
              <Label>Ending-Soon Warning (days)</Label>
              <Input type="number" value={form.warning_days} onChange={e => setForm(p => ({ ...p, warning_days: e.target.value }))} placeholder="14" data-testid="input-warning-days" />
            </div>
            <div>
              <Label>Auto-Renewal Mode</Label>
              <Select value={form.auto_renewal_mode} onValueChange={v => setForm(p => ({ ...p, auto_renewal_mode: v }))}>
                <SelectTrigger data-testid="select-renewal-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RENEWAL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.auto_renewal_mode !== 'off' && (
              <div>
                <Label>Renew N days before end</Label>
                <Input type="number" value={form.auto_renewal_days_before} onChange={e => setForm(p => ({ ...p, auto_renewal_days_before: e.target.value }))} placeholder="7" data-testid="input-renewal-days" />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Internal notes…" data-testid="textarea-fund-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-fund">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Fund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Upload Dialog */}
      <Dialog open={receiptDialog.open} onOpenChange={o => !o && setReceiptDialog({ open: false, fundId: '', fundName: '' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Bank Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Upload the bank receipt for <strong>{receiptDialog.fundName}</strong>. This will activate the fund.</p>
            <div>
              <Label>Receipt File</Label>
              <Input type="file" accept="image/*,.pdf" onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} data-testid="input-receipt-file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptDialog({ open: false, fundId: '', fundName: '' })}>Cancel</Button>
            <Button onClick={handleReceiptUpload} disabled={uploading || !receiptFile} data-testid="button-upload-receipt">
              {uploading ? 'Uploading…' : 'Upload & Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Pre-Fund?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. Only draft and closed funds can be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} data-testid="button-confirm-delete">{deleting ? 'Deleting…' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
