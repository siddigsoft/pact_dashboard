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
  FolderOpen, Download, Send, Briefcase, ArrowRight, X as XIcon,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { activatePreFund } from '@/utils/preFundActivation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PeriodType  { id: string; name: string; day_count: number | null; is_builtin: boolean }
interface Project     { id: string; name: string; status?: string | null; description?: string | null }

const BUILTIN_PERIOD_TYPES: PeriodType[] = [
  { id: 'builtin-weekly',    name: 'Weekly',           day_count: 7,    is_builtin: true },
  { id: 'builtin-biweekly',  name: 'Bi-weekly',        day_count: 14,   is_builtin: true },
  { id: 'builtin-monthly',   name: 'Monthly',          day_count: 30,   is_builtin: true },
  { id: 'builtin-quarterly', name: 'Quarterly',        day_count: 90,   is_builtin: true },
  { id: 'builtin-annual',    name: 'Annual',           day_count: 365,  is_builtin: true },
  { id: 'builtin-project',   name: 'Project Duration', day_count: null, is_builtin: true },
  { id: 'builtin-custom',    name: 'Custom',           day_count: null, is_builtin: true },
];
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
  warning_days: number | null;
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
  auto_renewal_bypass_approvals: false,
  notes: '',
};

export default function PreFundingRegistry() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]           = useState<PreFundRequest[]>([]);
  const [periodTypes, setPeriodTypes]= useState<PeriodType[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [showForm, setShowForm]     = useState(false);
  const [dialogStep, setDialogStep] = useState<1 | 2>(1);   // 1 = pick project, 2 = fill details
  const [projectSearch, setProjectSearch] = useState('');
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
      const [fundsRes, ptRes, projRes] = await Promise.all([
        supabase.from('pre_fund_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('pre_fund_period_types').select('id,name,day_count,is_builtin').order('display_order'),
        supabase.from('projects').select('id,name,status,description').order('name'),
      ]);
      if (fundsRes.error && !fundsRes.error.message.includes('does not exist')) throw fundsRes.error;
      setFunds((fundsRes.data as any) ?? []);
      setProjects((projRes.data as any) ?? []);
      // Use DB rows if available; fall back to built-ins if table is empty or not yet seeded
      const dbTypes = (ptRes.data as any[]) ?? [];
      setPeriodTypes(dbTypes.length > 0 ? dbTypes : BUILTIN_PERIOD_TYPES);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogStep(1);
    setProjectSearch('');
    setShowForm(true);
  };
  const openEdit = (f: PreFundRequest) => {
    setEditing(f);
    setForm({
      name: f.name, source: f.source ?? '', amount: String(f.amount), currency: f.currency,
      period_type_id: f.period_type_id ?? '', start_date: f.start_date ?? '', end_date: f.end_date ?? '',
      country_id: f.country_id ?? '', project_id: f.project_id ?? '', grant_id: f.grant_id ?? '',
      matching_scope: f.matching_scope, threshold_pct: '', threshold_amount: '',
      warning_days: String(f.warning_days ?? 14),
      auto_renewal_mode: f.auto_renewal_mode, auto_renewal_days_before: String(f.auto_renewal_days_before ?? 7),
      auto_renewal_bypass_approvals: (f as any).auto_renewal_bypass_approvals ?? false,
      notes: f.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.amount || !form.currency) {
      toast({ title: 'Required fields missing', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(form.amount.replace(/,/g, ''));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Amount must be greater than zero', variant: 'destructive' });
      return;
    }
    if (form.start_date && form.end_date && form.start_date >= form.end_date) {
      toast({ title: 'End date must be after start date', variant: 'destructive' });
      return;
    }
    if (form.threshold_pct && (parseFloat(form.threshold_pct) < 0 || parseFloat(form.threshold_pct) > 100)) {
      toast({ title: 'Alert threshold % must be between 0 and 100', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        source: form.source || null,
        amount: parseFloat(form.amount.replace(/,/g, '')),
        currency: form.currency,
        period_type_id: (form.period_type_id && !form.period_type_id.startsWith('builtin-')) ? form.period_type_id : null,
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
        auto_renewal_bypass_approvals: form.auto_renewal_bypass_approvals ?? false,
        notes: form.notes || null,
      };
      if (editing) {
        const { error: e } = await supabase.from('pre_fund_requests').update(payload).eq('id', editing.id);
        if (e) throw e;
        toast({ title: 'Fund updated' });
      } else {
        payload.status = 'draft';
        payload.available_balance = 0;   // stays 0 until receipt/activation — fund is not spendable in draft
        payload.committed_amount = 0;
        payload.paid_amount = 0;
        payload.created_by = currentUser?.id ?? null;
        const { error: e } = await supabase.from('pre_fund_requests').insert(payload);
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
      const { error: e } = await supabase.from('pre_fund_requests').delete().eq('id', deleteId);
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
    const { error: e } = await supabase.from('pre_fund_requests').update({ status: 'pending_approval' }).eq('id', f.id);
    if (e) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); return; }

    // Wire into Approvals Hub — create a notification event so the approval
    // queue in ApprovalsHub.tsx surfaces this fund under the 'pre_fund' type.
    // The ApprovalItem is constructed on the fly from pre_fund_requests rows
    // with status='pending_approval' in useApprovalsData.ts; here we just
    // emit the notification so approvers are alerted.
    try {
      await supabase.from('notification_events' as any).insert({
        event_type: 'pre_fund_approval_requested',
        reference_id: f.id,
        reference_type: 'pre_fund_request',
        title: 'Pre-Fund Approval Required',
        message: `Fund "${f.name}" (${f.currency} ${f.amount.toLocaleString()}) requires approval before activation.`,
        target_roles: ['super_admin', 'admin', 'financialAdmin'],
        created_by: currentUser?.id ?? null,
        metadata: { fund_id: f.id, fund_name: f.name, amount: f.amount, currency: f.currency },
      });
    } catch { /* notifications are non-blocking — main approval flow still works */ }

    toast({ title: 'Submitted for approval', description: 'Finance approvers have been notified via the Approvals Hub.' });
    await load();
  };

  const handleReceiptUpload = async () => {
    if (!receiptFile || !receiptDialog.fundId) return;
    setUploading(true);
    try {
      // 1. Upload file to storage first
      const path = `pre-fund-receipts/${receiptDialog.fundId}/${Date.now()}-${receiptFile.name}`;
      const { error: upErr } = await supabase.storage.from('financial-documents').upload(path, receiptFile, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('financial-documents').getPublicUrl(path);

      const fund = funds.find(f => f.id === receiptDialog.fundId);

      // 2. Activate via shared utility — fail-closed GL + fund status update
      const { bankLineWarning } = await activatePreFund({
        fundId: receiptDialog.fundId,
        fundName: fund?.name ?? 'Fund',
        amount: fund?.amount ?? 0,
        currency: fund?.currency ?? 'USD',
        glReceiptCode:  (fund as any)?.gl_receipt_account  ?? '1200',
        glLiabilityCode:(fund as any)?.gl_liability_account ?? '2400',
        createdBy: currentUser?.id ?? null,
        receiptUrl: urlData.publicUrl,
      });

      toast({ title: 'Receipt uploaded — fund is now Active', description: bankLineWarning ?? 'GL journal entry created (draft).' });
      setReceiptDialog({ open: false, fundId: '', fundName: '' });
      setReceiptFile(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // ── Donor Statement PDF (per-fund, from Registry) ────────────────────────
  const [generatingDonorPdf, setGeneratingDonorPdf] = useState<string | null>(null);

  const handleDonorPDF = async (f: PreFundRequest) => {
    setGeneratingDonorPdf(f.id);
    try {
      // Load transactions + approval steps in parallel
      const [{ data: txnData }, { data: stepsData }] = await Promise.all([
        supabase.from('pre_fund_transactions')
          .select('*').eq('pre_fund_request_id', f.id).order('transaction_date', { ascending: false }),
        supabase.from('pre_fund_approval_steps')
          .select('step_order,step_label,assigned_user_id,status,approved_at,notes')
          .eq('pre_fund_request_id', f.id).order('step_order'),
      ]);
      const transactions: any[] = (txnData as any) ?? [];
      const approvalSteps: any[] = (stepsData as any) ?? [];

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('Donor Pre-Fund Statement', 15, 20);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Prepared: ${format(new Date(), 'MMM d, yyyy')}`, 15, 28);

      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('Fund Information', 15, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      let y = 48;
      [['Fund', f.name], ['Donor / Source', f.source ?? '—'], ['Currency', f.currency],
        ['Period', f.start_date && f.end_date
          ? `${format(parseISO(f.start_date), 'MMM d, yyyy')} – ${format(parseISO(f.end_date), 'MMM d, yyyy')}`
          : '—'],
      ].forEach(([k, v]) => { doc.text(`${k}:`, 15, y); doc.text(v, 60, y); y += 7; });

      y += 6;
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('Fund Utilisation', 15, y); y += 8;
      autoTable(doc, {
        startY: y,
        head: [['Description', 'Amount']],
        body: [
          ['Amount Funded',   `${f.currency} ${formatNumber(f.amount, 0)}`],
          ['Total Disbursed', `${f.currency} ${formatNumber(f.paid_amount, 0)}`],
          ['Balance Available', `${f.currency} ${formatNumber(f.available_balance, 0)}`],
        ],
        styles: { fontSize: 10 }, headStyles: { fillColor: [3, 105, 161] },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      const payments = transactions.filter((t: any) => t.transaction_type === 'payment');
      if (payments.length > 0) {
        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text('Disbursement Detail', 15, y); y += 8;
        autoTable(doc, {
          startY: y, head: [['Date', 'Reference', 'Description', 'Amount']],
          body: payments.map((t: any) => [
            format(parseISO(t.transaction_date), 'MMM d, yyyy'),
            t.reference ?? '—', t.description ?? '—',
            `${t.currency} ${formatNumber(t.amount, 0)}`,
          ]),
          styles: { fontSize: 9 }, headStyles: { fillColor: [3, 105, 161] },
        });
      }

      // ── Approval Chain ────────────────────────────────────────────────────
      if (approvalSteps.length > 0) {
        y += 4;
        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text('Approval Chain', 15, y); y += 8;
        autoTable(doc, {
          startY: y,
          head: [['#', 'Step', 'Status', 'Date Actioned', 'Notes']],
          body: approvalSteps.map((s: any) => [
            String(s.step_order),
            s.step_label,
            (s.status ?? '—').toUpperCase(),
            s.approved_at ? format(parseISO(s.approved_at), 'dd MMM yyyy') : '—',
            s.notes ?? '—',
          ]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [15, 32, 65] as [number, number, number] },
          alternateRowStyles: { fillColor: [245, 247, 250] as [number, number, number] },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      // ── Certification line ────────────────────────────────────────────────
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFontSize(9); doc.setFont('helvetica', 'italic');
      doc.text('This statement is generated from PACT Command Center financial records and is accurate as of the date shown above.', 15, y);

      const filename = `Donor-Statement-${f.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyyMMdd')}.pdf`;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);

      // Persist to Supabase Storage
      try {
        const path = `pre-fund-pdfs/${f.id}/${filename}`;
        await supabase.storage.from('financial-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true });
      } catch { /* storage is best-effort */ }

      toast({ title: 'Donor statement downloaded' });
    } catch (e: any) {
      toast({ title: 'PDF failed', description: e.message, variant: 'destructive' });
    } finally {
      setGeneratingDonorPdf(null);
    }
  };

  // ── Bank API Auto-Activation (awaiting_receipt → active) ─────────────────
  // Queries unmatched bank feed for entries matching an awaiting_receipt fund
  // by amount ± tolerance. If matched, auto-activates the fund.
  const [bankCheckBusy, setBankCheckBusy] = useState(false);

  const handleBankApiCheck = async () => {
    setBankCheckBusy(true);
    let activated = 0;
    try {
      // Read configurable tolerance + integration toggles from pre_fund_settings
      const { data: settingsRow } = await supabase
        .from('pre_fund_settings')
        .select('bank_match_tolerance_pct, integration_bank_recon')
        .limit(1)
        .maybeSingle();
      const tolerancePct = ((settingsRow as any)?.bank_match_tolerance_pct ?? 2) / 100;
      const bankReconEnabled = (settingsRow as any)?.integration_bank_recon !== false;

      const awaitingFunds = funds.filter(f => f.status === 'awaiting_receipt');
      for (const fund of awaitingFunds) {
        const tolerance = Math.max(0.01, fund.amount * tolerancePct);
        const { data: feedRows } = await supabase
          .from('pre_fund_bank_unmatched')
          .select('id,amount,currency')
          .eq('match_status', 'unmatched')
          .eq('currency', fund.currency);
        const feed: any[] = (feedRows as any) ?? [];
        const match = feed.find((r: any) => Math.abs(r.amount - fund.amount) <= tolerance);
        if (match) {
          const activatedAt = new Date().toISOString();

          // ── Activate via shared utility — fail-closed GL + fund status update ──
          // If GL fails, this fund is skipped (stays awaiting_receipt); loop continues.
          const { data: fundDetail } = await supabase.from('pre_fund_requests')
            .select('gl_receipt_account,gl_liability_account').eq('id', fund.id).maybeSingle();
          const { bankLineWarning: blw } = await activatePreFund({
            fundId: fund.id,
            fundName: fund.name,
            amount: fund.amount,
            currency: fund.currency,
            glReceiptCode:   (fundDetail as any)?.gl_receipt_account   ?? '1200',
            glLiabilityCode: (fundDetail as any)?.gl_liability_account ?? '2400',
            createdBy: currentUser?.id ?? null,
            idempotencyKeySuffix: 'bankapi',
          });
          if (blw) console.warn('[PreFundingRegistry] Bank line warning:', blw);

          // Mark feed row as matched (after successful activation)
          await supabase.from('pre_fund_bank_unmatched').update({
            matched_fund_id: fund.id,
            match_status: 'matched',
            reviewed_by: currentUser?.id ?? null,
            reviewed_at: activatedAt,
          }).eq('id', match.id);

          activated++;
        }
      }
      if (activated > 0) {
        toast({ title: `Bank API: ${activated} fund${activated !== 1 ? 's' : ''} auto-activated`, description: 'Matched incoming transfers by amount±tolerance.' });
        await load();
      } else {
        toast({ title: 'Bank API check complete', description: 'No matching transfers found for awaiting-receipt funds.' });
      }
    } catch (e: any) {
      toast({ title: 'Bank API check failed', description: e.message, variant: 'destructive' });
    } finally {
      setBankCheckBusy(false);
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

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <FolderOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Fund Registry</h1>
            <p className="text-sm text-muted-foreground">Create and manage all pre-fund requests</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-registry">
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
          {canAccess && (
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={openNew} data-testid="button-new-fund-registry">
              <Plus className="h-4 w-4 mr-1.5" />New Fund
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error} — run pre_funding_migration.sql</AlertDescription></Alert>}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search funds…" className="pl-8 h-8 w-52 text-sm" data-testid="input-search-funds" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'all',              label: 'All' },
            { key: 'active',           label: 'Active' },
            { key: 'draft',            label: 'Draft' },
            { key: 'pending_approval', label: 'Awaiting Approval' },
            { key: 'awaiting_receipt', label: 'Awaiting Receipt' },
            { key: 'closed',           label: 'Closed' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setStatus(key)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium border transition-all',
                statusFilter === key
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:border-sky-400 hover:text-sky-700'
              )}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-xl bg-muted/20">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No pre-funds found</p>
          <p className="text-xs text-muted-foreground mb-4">Get started by creating your first pre-fund request.</p>
          <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />Create First Pre-Fund
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-semibold text-foreground pl-4 w-56">Fund Name</TableHead>
                <TableHead className="font-semibold text-foreground">Period</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Available</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Committed</TableHead>
                <TableHead className="font-semibold text-foreground">Scope</TableHead>
                <TableHead className="font-semibold text-foreground">Renewal</TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
                <TableHead className="font-semibold text-foreground text-center pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} className="hover:bg-muted/30 border-b last:border-0" data-testid={`row-fund-${f.id}`}>

                  {/* Name + Source */}
                  <TableCell className="pl-4 py-3">
                    <div className="font-semibold text-sm leading-tight">{f.name}</div>
                    {f.source && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]" title={f.source}>
                        {f.source}
                      </div>
                    )}
                  </TableCell>

                  {/* Period */}
                  <TableCell className="py-3">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {f.start_date && f.end_date
                        ? <>{format(parseISO(f.start_date), 'MMM d')} – {format(parseISO(f.end_date), 'MMM d, yyyy')}</>
                        : f.period_type_name ?? '—'}
                    </span>
                  </TableCell>

                  {/* Amount */}
                  <TableCell className="py-3 text-right">
                    <div className="font-mono text-sm font-semibold">{formatNumber(f.amount, 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{f.currency}</div>
                  </TableCell>

                  {/* Available */}
                  <TableCell className="py-3 text-right">
                    <div className="font-mono text-sm font-semibold text-emerald-600">{formatNumber(f.available_balance, 0)}</div>
                    <div className="text-[10px] text-muted-foreground">{f.currency}</div>
                  </TableCell>

                  {/* Committed */}
                  <TableCell className="py-3 text-right">
                    <div className="font-mono text-sm text-violet-600">{formatNumber(f.committed_amount, 0)}</div>
                  </TableCell>

                  {/* Scope */}
                  <TableCell className="py-3">
                    <span className="text-xs text-muted-foreground">
                      {MATCHING_SCOPE_OPTIONS.find(o => o.value === f.matching_scope)?.label?.split(' ')[0] ?? f.matching_scope}
                    </span>
                  </TableCell>

                  {/* Renewal */}
                  <TableCell className="py-3">
                    {f.auto_renewal_mode === 'auto_activate' && (
                      <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap">Auto-Activate</Badge>
                    )}
                    {f.auto_renewal_mode === 'auto_draft' && (
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 whitespace-nowrap">Auto-Draft</Badge>
                    )}
                    {f.auto_renewal_mode === 'off' && (
                      <span className="text-xs text-muted-foreground">Manual</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell className="py-3">
                    <Badge variant="outline" className={cn('text-xs font-medium whitespace-nowrap', STATUS_CFG[f.status]?.cls)}>
                      {STATUS_CFG[f.status]?.label ?? f.status}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="py-3 pr-4">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {f.status === 'draft' && (
                        <Button size="sm" className="h-8 px-3 text-xs bg-sky-600 hover:bg-sky-700 text-white gap-1.5" onClick={() => handleSubmitForApproval(f)} data-testid={`button-submit-${f.id}`}>
                          <Send className="h-3.5 w-3.5" />Submit
                        </Button>
                      )}
                      {f.status === 'awaiting_receipt' && (
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs text-sky-600 border-sky-300 hover:bg-sky-50 gap-1.5" onClick={() => setReceiptDialog({ open: true, fundId: f.id, fundName: f.name })} data-testid={`button-receipt-${f.id}`}>
                          <Upload className="h-3.5 w-3.5" />Receipt
                        </Button>
                      )}
                      {['active', 'low_balance', 'closed'].includes(f.status) && (
                        <Button size="sm" variant="outline" className="h-8 px-3 text-xs text-sky-600 border-sky-300 hover:bg-sky-50 gap-1.5" title="Donor Statement PDF" onClick={() => handleDonorPDF(f)} disabled={generatingDonorPdf === f.id} data-testid={`button-donor-pdf-${f.id}`}>
                          <FileText className="h-3.5 w-3.5" />PDF
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="Edit fund" onClick={() => openEdit(f)} data-testid={`button-edit-${f.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {['draft', 'closed'].includes(f.status) && (
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 border-destructive/30" title="Delete fund" onClick={() => setDeleteId(f.id)} data-testid={`button-delete-${f.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog — two-step wizard for new funds, single step for edits */}
      <Dialog open={showForm} onOpenChange={o => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

          {/* ── STEP 1: Project selection (new fund only) ──────────────────── */}
          {!editing && dialogStep === 1 && (() => {
            const filteredProjects = projects.filter(p =>
              !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
            );
            const selectedProject = projects.find(p => p.id === form.project_id);
            return (
              <>
                <DialogHeader className="pb-1">
                  <DialogTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-sky-600" />
                    New Pre-Fund Request
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Step 1 of 2 — Select the project this fund belongs to, then continue to fill in the details.
                  </p>
                </DialogHeader>

                {/* Step indicator */}
                <div className="flex items-center gap-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-6 w-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                    <span className="text-sm font-medium text-sky-700 dark:text-sky-400">Select Project</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-1.5 opacity-40">
                    <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-bold">2</span>
                    <span className="text-sm text-muted-foreground">Fund Details</span>
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={projectSearch}
                    onChange={e => setProjectSearch(e.target.value)}
                    placeholder="Search projects…"
                    className="pl-9"
                    data-testid="input-project-search"
                  />
                </div>

                {/* Project cards */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {/* No-project option */}
                  <button
                    onClick={() => setForm(p => ({ ...p, project_id: '' }))}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-lg border transition-all',
                      form.project_id === ''
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 ring-1 ring-sky-500'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                    data-testid="button-project-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <FolderOpen className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">No Project / General Fund</div>
                        <div className="text-[11px] text-muted-foreground">This fund is not tied to a specific project</div>
                      </div>
                      {form.project_id === '' && <CheckCircle2 className="h-4 w-4 text-sky-600 ml-auto shrink-0" />}
                    </div>
                  </button>

                  {filteredProjects.length === 0 && projectSearch ? (
                    <p className="text-center text-sm text-muted-foreground py-6">No projects match "{projectSearch}"</p>
                  ) : filteredProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setForm(prev => ({ ...prev, project_id: p.id }))}
                      className={cn(
                        'w-full text-left px-4 py-3 rounded-lg border transition-all',
                        form.project_id === p.id
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 ring-1 ring-sky-500'
                          : 'border-border bg-card hover:bg-muted/40'
                      )}
                      data-testid={`button-project-${p.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                          <Briefcase className="h-4 w-4 text-sky-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          {p.description && <div className="text-[11px] text-muted-foreground truncate">{p.description}</div>}
                        </div>
                        {p.status && (
                          <span className="text-[10px] shrink-0 bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{p.status}</span>
                        )}
                        {form.project_id === p.id && <CheckCircle2 className="h-4 w-4 text-sky-600 shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {selectedProject ? `Selected: ${selectedProject.name}` : 'No project selected (general fund)'}
                </p>

                <DialogFooter className="mt-2">
                  <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button
                    className="bg-sky-600 hover:bg-sky-700 text-white"
                    onClick={() => { setDialogStep(2); setProjectSearch(''); }}
                    data-testid="button-step1-continue"
                  >
                    Continue — Fund Details
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </DialogFooter>
              </>
            );
          })()}

          {/* ── STEP 2: Fund details (new fund) OR full form (edit) ─────────── */}
          {(editing || dialogStep === 2) && (
            <>
              <DialogHeader className="pb-1">
                <DialogTitle>
                  {editing ? 'Edit Pre-Fund' : 'New Pre-Fund Request'}
                </DialogTitle>
                {!editing && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Step 2 of 2 — Fill in the fund details.
                  </p>
                )}
              </DialogHeader>

              {/* Step indicator (new only) */}
              {!editing && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex items-center gap-1.5 opacity-50">
                    <span className="h-6 w-6 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">✓</span>
                    <span className="text-sm text-muted-foreground">Project Selected</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-1.5">
                    <span className="h-6 w-6 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                    <span className="text-sm font-medium text-sky-700 dark:text-sky-400">Fund Details</span>
                  </div>
                </div>
              )}

              {/* Selected project chip */}
              {!editing && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border">
                  <Briefcase className="h-4 w-4 text-sky-600 shrink-0" />
                  <span className="text-sm flex-1">
                    {form.project_id
                      ? <><span className="font-medium">{projects.find(p => p.id === form.project_id)?.name}</span><span className="text-muted-foreground ml-1 text-xs">— project fund</span></>
                      : <span className="text-muted-foreground italic">No Project / General Fund</span>
                    }
                  </span>
                  <button
                    className="text-xs text-sky-600 hover:underline"
                    onClick={() => setDialogStep(1)}
                    data-testid="button-change-project"
                  >
                    Change
                  </button>
                </div>
              )}

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
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9.]/g, '');
                      setForm(p => ({ ...p, amount: raw }));
                    }}
                    onBlur={() => {
                      const num = parseFloat(form.amount.replace(/,/g, ''));
                      if (!isNaN(num) && num > 0) setForm(p => ({ ...p, amount: num.toLocaleString('en-US') }));
                    }}
                    onFocus={() => setForm(p => ({ ...p, amount: p.amount.replace(/,/g, '') }))}
                    placeholder="0"
                    data-testid="input-fund-amount"
                  />
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
                {form.auto_renewal_mode === 'auto_activate' && (
                  <div className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <Switch
                      id="switch-bypass-approvals"
                      checked={form.auto_renewal_bypass_approvals}
                      onCheckedChange={v => setForm(p => ({ ...p, auto_renewal_bypass_approvals: v }))}
                      data-testid="switch-bypass-approvals"
                    />
                    <div>
                      <Label htmlFor="switch-bypass-approvals" className="text-amber-800 dark:text-amber-300 font-medium cursor-pointer">
                        Bypass approval chain on auto-renewal
                      </Label>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        When on, the renewed fund goes directly to <em>Active</em> without re-running the approval flow.
                        Leave off to require approvers to re-approve each renewal cycle.
                      </p>
                    </div>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Internal notes…" data-testid="textarea-fund-notes" />
                </div>
              </div>

              <DialogFooter>
                {!editing
                  ? <Button variant="outline" onClick={() => setDialogStep(1)}>← Back</Button>
                  : <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                }
                <Button onClick={handleSave} disabled={saving} data-testid="button-save-fund">
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Fund'}
                </Button>
              </DialogFooter>
            </>
          )}
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
