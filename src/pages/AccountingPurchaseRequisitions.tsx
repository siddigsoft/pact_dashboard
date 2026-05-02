import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, ClipboardList, Plus, Download, RefreshCw, Search,
  CheckCircle2, XCircle, Clock, FileText, Pencil, ChevronRight,
  AlertTriangle, ShoppingCart, ArrowRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface Fund { id: string; code: string; name_en: string }
interface Account { id: string; code: string; name_en: string }
interface Profile { id: string; full_name: string }

interface PR {
  id: string; pr_number: string; title: string; description: string | null;
  department: string | null; country_id: string | null; fund_id: string | null;
  gl_account_id: string | null; estimated_amount: number; currency: string;
  required_by_date: string | null; status: string; priority: string;
  requested_by: string | null; reviewed_by: string | null; reviewed_at: string | null;
  approved_by: string | null; approved_at: string | null;
  rejection_note: string | null; notes: string | null; created_at: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30',                     icon: Clock },
  reviewed:  { label: 'Reviewed',  color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30',                     icon: CheckCircle2 },
  approved:  { label: 'Approved',  color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30',            icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30',                     icon: XCircle },
  converted: { label: 'Converted to PO', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30',        icon: ShoppingCart },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500',                                         icon: XCircle },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'bg-slate-100 text-slate-600' },
  normal:   { label: 'Normal',   color: 'bg-blue-100 text-blue-700' },
  high:     { label: 'High',     color: 'bg-amber-100 text-amber-700' },
  critical: { label: 'Critical', color: 'bg-rose-100 text-rose-700' },
};

const STATUS_FLOW: Record<string, string[]> = {
  draft:     ['submitted', 'cancelled'],
  submitted: ['reviewed', 'rejected', 'cancelled'],
  reviewed:  ['approved', 'rejected'],
  approved:  ['converted', 'cancelled'],
};

const BLANK = {
  title: '', description: '', department: '', country_id: '', fund_id: '',
  gl_account_id: '', estimated_amount: 0, currency: 'USD',
  required_by_date: '', priority: 'normal', notes: '',
};

export default function AccountingPurchaseRequisitions() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor', 'project_manager', 'program_manager']);
  const canApprove = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { countries } = useAppContext();
  const { toast } = useToast();

  const [prs, setPRs]       = useState<PR[]>([]);
  const [funds, setFunds]   = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PR | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const [detailPR, setDetailPR] = useState<PR | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: prData }, { data: fundsData }, { data: acctData }, { data: profData }] = await Promise.all([
      supabase.from('purchase_requisitions').select('*').order('created_at', { ascending: false }),
      supabase.from('accounting_funds').select('id, code, name_en').order('code'),
      supabase.from('chart_of_accounts').select('id, code, name_en').order('code'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    setPRs((prData ?? []) as PR[]);
    setFunds((fundsData ?? []) as Fund[]);
    setAccounts((acctData ?? []) as Account[]);
    setProfiles((profData ?? []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => prs.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && p.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.pr_number.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [prs, statusFilter, priorityFilter, search]);

  const stats = useMemo(() => ({
    total: prs.length,
    draft: prs.filter(p => p.status === 'draft').length,
    pending: prs.filter(p => ['submitted', 'reviewed'].includes(p.status)).length,
    approved: prs.filter(p => p.status === 'approved').length,
    totalValue: prs.filter(p => !['rejected', 'cancelled'].includes(p.status)).reduce((s, p) => s + Number(p.estimated_amount), 0),
  }), [prs]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setOpen(true); };
  const openEdit   = (pr: PR) => {
    setEditing(pr);
    setForm({
      title: pr.title, description: pr.description ?? '', department: pr.department ?? '',
      country_id: pr.country_id ?? '', fund_id: pr.fund_id ?? '', gl_account_id: pr.gl_account_id ?? '',
      estimated_amount: Number(pr.estimated_amount), currency: pr.currency,
      required_by_date: pr.required_by_date ?? '', priority: pr.priority, notes: pr.notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description || null,
      department: form.department || null,
      country_id: form.country_id || null,
      fund_id: form.fund_id || null,
      gl_account_id: form.gl_account_id || null,
      estimated_amount: Number(form.estimated_amount) || 0,
      currency: form.currency,
      required_by_date: form.required_by_date || null,
      priority: form.priority,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await supabase.from('purchase_requisitions').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'PR updated' }); setOpen(false); void load(); }
    } else {
      const { error } = await supabase.from('purchase_requisitions').insert({ ...payload, status: 'draft', pr_number: `PR-${Date.now()}` });
      if (error) toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      else { toast({ title: 'PR created' }); setOpen(false); void load(); }
    }
    setSaving(false);
  };

  const doAction = async (pr: PR, newStatus: string) => {
    setActioning(true);
    const extra: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'rejected') extra.rejection_note = actionNote;
    if (['reviewed', 'approved'].includes(newStatus)) {
      extra[newStatus === 'reviewed' ? 'reviewed_at' : 'approved_at'] = new Date().toISOString();
    }
    const { error } = await supabase.from('purchase_requisitions').update(extra).eq('id', pr.id);
    setActioning(false);
    if (error) toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
    else {
      toast({ title: `PR marked as ${STATUS_CFG[newStatus]?.label ?? newStatus}` });
      setDetailPR(null);
      setActionNote('');
      void load();
    }
  };

  const exportCsv = () => {
    downloadCsv('purchase_requisitions.csv', [
      ['PR #', 'Title', 'Priority', 'Status', 'Estimated Amount', 'Currency', 'Required By', 'Created'],
      ...filtered.map(p => [
        p.pr_number, p.title, p.priority, p.status,
        p.estimated_amount, p.currency,
        p.required_by_date ?? '', format(parseISO(p.created_at), 'yyyy-MM-dd'),
      ]),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1200px]">
      <PageInfoBanner
        title="Purchase Requisitions"
        description="Request purchases before they are converted to Purchase Orders. PRs go through a review and approval workflow before a PO can be raised."
        workflowSteps={['Create Draft', 'Submit for Review', 'Finance Review', 'Manager Approval', 'Convert to PO']}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" /> Purchase Requisitions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Internal purchase requests pending approval and PO conversion.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-pr">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-pr">
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button size="sm" onClick={openCreate} data-testid="button-create-pr">
            <Plus className="w-4 h-4 mr-1" /> New PR
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total PRs',    value: stats.total,     color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Drafts',       value: stats.draft,     color: 'text-slate-600',   bg: 'bg-slate-50 dark:bg-slate-800/30' },
          { label: 'Pending',      value: stats.pending,   color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: 'Approved',     value: stats.approved,  color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Est. Value',   value: `$${formatNumber(stats.totalValue)}`, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', isText: true },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border p-3', s.bg)}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('font-bold mt-1', s.isText ? 'text-lg' : 'text-2xl', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search PR# or title…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-pr" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[130px] h-9" data-testid="select-priority-filter">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {Object.entries(PRIORITY_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No purchase requisitions found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {['PR #', 'Title', 'Priority', 'Status', 'Est. Amount', 'Required By', 'Created', ''].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(pr => {
                    const scfg = STATUS_CFG[pr.status] ?? STATUS_CFG.draft;
                    const Icon = scfg.icon;
                    const pcfg = PRIORITY_CFG[pr.priority] ?? PRIORITY_CFG.normal;
                    return (
                      <tr key={pr.id} className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDetailPR(pr)} data-testid={`row-pr-${pr.id}`}>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-blue-600">{pr.pr_number}</td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="font-medium truncate">{pr.title}</p>
                          {pr.department && <p className="text-xs text-muted-foreground truncate">{pr.department}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn('text-[10px]', pcfg.color)}>{pcfg.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium', scfg.color)}>
                            <Icon className="w-3 h-3" />{scfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {pr.currency} {formatNumber(pr.estimated_amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {pr.required_by_date ? format(parseISO(pr.required_by_date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {format(parseISO(pr.created_at), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {pr.status === 'draft' && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(pr)} data-testid={`btn-edit-pr-${pr.id}`}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailPR(pr)} data-testid={`btn-view-pr-${pr.id}`}>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Purchase Requisition' : 'New Purchase Requisition'}</DialogTitle>
            <DialogDescription>Fill in the details for the purchase request.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Office Supplies Q1 2026" data-testid="input-pr-title" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Detailed justification…" data-testid="input-pr-description" />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} placeholder="e.g. Field Operations" data-testid="input-pr-department" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger data-testid="select-pr-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={form.country_id} onValueChange={v => setForm(p => ({ ...p, country_id: v }))}>
                <SelectTrigger data-testid="select-pr-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                <SelectContent>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={form.fund_id} onValueChange={v => setForm(p => ({ ...p, fund_id: v }))}>
                <SelectTrigger data-testid="select-pr-fund"><SelectValue placeholder="Select fund" /></SelectTrigger>
                <SelectContent>
                  {funds.map(f => <SelectItem key={f.id} value={f.id}>[{f.code}] {f.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GL Account</Label>
              <Select value={form.gl_account_id} onValueChange={v => setForm(p => ({ ...p, gl_account_id: v }))}>
                <SelectTrigger data-testid="select-pr-account"><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Amount *</Label>
              <Input type="number" min={0} value={form.estimated_amount} onChange={e => setForm(p => ({ ...p, estimated_amount: Number(e.target.value) }))} data-testid="input-pr-amount" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger data-testid="select-pr-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['USD', 'SDG', 'EUR', 'GBP', 'SAR', 'AED'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Required By Date</Label>
              <Input type="date" value={form.required_by_date} onChange={e => setForm(p => ({ ...p, required_by_date: e.target.value }))} data-testid="input-pr-required-date" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} data-testid="input-pr-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="button-save-pr">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editing ? 'Update PR' : 'Create PR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Action Dialog */}
      <Dialog open={!!detailPR} onOpenChange={v => { if (!v) { setDetailPR(null); setActionNote(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailPR && (() => {
            const scfg = STATUS_CFG[detailPR.status] ?? STATUS_CFG.draft;
            const pcfg = PRIORITY_CFG[detailPR.priority] ?? PRIORITY_CFG.normal;
            const transitions = canApprove ? (STATUS_FLOW[detailPR.status] ?? []) : [];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" /> {detailPR.pr_number}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', scfg.color)}>
                      <scfg.icon className="w-3.5 h-3.5" /> {scfg.label}
                    </span>
                    <Badge variant="outline" className={cn('text-xs', pcfg.color)}>{pcfg.label} priority</Badge>
                  </div>
                  <div>
                    <p className="font-semibold">{detailPR.title}</p>
                    {detailPR.description && <p className="text-sm text-muted-foreground mt-1">{detailPR.description}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground text-xs">Amount</span><br /><span className="font-mono font-medium">{detailPR.currency} {formatNumber(detailPR.estimated_amount)}</span></div>
                    <div><span className="text-muted-foreground text-xs">Department</span><br />{detailPR.department ?? '—'}</div>
                    <div><span className="text-muted-foreground text-xs">Required By</span><br />{detailPR.required_by_date ? format(parseISO(detailPR.required_by_date), 'dd MMM yyyy') : '—'}</div>
                    <div><span className="text-muted-foreground text-xs">Created</span><br />{format(parseISO(detailPR.created_at), 'dd MMM yyyy')}</div>
                  </div>
                  {detailPR.rejection_note && (
                    <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                      <p className="font-medium mb-0.5">Rejection reason</p>
                      <p>{detailPR.rejection_note}</p>
                    </div>
                  )}
                  {transitions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</p>
                      {transitions.includes('rejected') && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Rejection reason (required for reject)</Label>
                          <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="State the reason…" data-testid="input-rejection-note" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {transitions.map(t => {
                          const tcfg = STATUS_CFG[t] ?? { label: t, color: '', icon: ArrowRight };
                          return (
                            <Button key={t} size="sm" variant="outline"
                              className={cn(t === 'approved' && 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
                                           t === 'rejected' && 'border-rose-300 text-rose-700 hover:bg-rose-50')}
                              disabled={actioning || (t === 'rejected' && !actionNote.trim())}
                              onClick={() => doAction(detailPR, t)}
                              data-testid={`btn-action-${t}`}>
                              {actioning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                              <ArrowRight className="w-3.5 h-3.5 mr-1" />
                              Mark {tcfg.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDetailPR(null); setActionNote(''); }}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
