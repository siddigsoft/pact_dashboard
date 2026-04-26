import { useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Receipt, Plus, Trash2, Send, FileText, Upload, Info,
  CreditCard, Clock, CheckCircle2,
  Plane, UtensilsCrossed, BedDouble, Package, Phone, Stethoscope, MoreHorizontal,
} from 'lucide-react';
import { format } from 'date-fns';
import { SUPPORTED_CURRENCIES } from '@/utils/currencyUtils';

export type ExpenseClaim = {
  id: string; user_id: string; claim_number: string | null; title: string;
  description: string | null; currency: string; total_amount: number; status: string;
  manager_notes: string | null; finance_notes: string | null;
  created_at: string; paid_at: string | null;
};
type ExpenseLine = {
  id?: string; date: string; category: string; description: string;
  amount: number; receipt_url: string | null;
};

const CATEGORIES = ['travel','meals','accommodation','supplies','communications','medical','other'];

const CATEGORY_META: Record<string, { label: string; labelAr: string; icon: any; color: string }> = {
  travel:         { label: 'Travel',         labelAr: 'سفر',           icon: Plane,          color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' },
  meals:          { label: 'Meals',          labelAr: 'طعام',          icon: UtensilsCrossed,color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900' },
  accommodation:  { label: 'Accommodation',  labelAr: 'إقامة',         icon: BedDouble,      color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900' },
  supplies:       { label: 'Supplies',       labelAr: 'مستلزمات',      icon: Package,        color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900' },
  communications: { label: 'Communications', labelAr: 'اتصالات',       icon: Phone,          color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900' },
  medical:        { label: 'Medical',        labelAr: 'طبي',           icon: Stethoscope,    color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900' },
  other:          { label: 'Other',          labelAr: 'أخرى',          icon: MoreHorizontal, color: 'text-slate-600 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800' },
};
export const PERSONAL_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:             { label: 'Draft / مسودة',                cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  submitted:         { label: 'Submitted / مرسل',             cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  manager_approved:  { label: 'Manager OK / موافقة المدير',   cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  manager_rejected:  { label: 'Mgr Rejected / مرفوض - مدير',  cls: 'bg-red-100 text-red-800 border-red-300' },
  finance_approved:  { label: 'Finance OK / موافقة المالية',  cls: 'bg-green-100 text-green-800 border-green-300' },
  finance_rejected:  { label: 'Fin Rejected / مرفوض - مالية', cls: 'bg-red-100 text-red-800 border-red-300' },
  paid:              { label: 'Paid / مدفوع',                 cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled:         { label: 'Cancelled / ملغى',             cls: 'bg-gray-100 text-gray-600 border-gray-300' },
};

const FILTER_GROUPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'all',     label: 'All / الكل',                       statuses: [] },
  { key: 'pending', label: 'Pending / قيد المراجعة',           statuses: ['submitted','manager_approved'] },
  { key: 'approved',label: 'Finance OK / موافقة',              statuses: ['finance_approved'] },
  { key: 'paid',    label: 'Paid / مدفوع',                     statuses: ['paid'] },
  { key: 'rejected',label: 'Rejected / مرفوض',                 statuses: ['manager_rejected','finance_rejected','cancelled'] },
];

export interface PersonalExpenseFlowHandle {
  isDirty: () => boolean;
  reset: () => void;
}

interface PersonalExpenseFlowProps {
  /**
   * When true, the component is meant to be embedded inside another page
   * (e.g. Cost Submission). In that case the page-level header, the
   * "two-ways-to-request-money" banner, and the "how it works" accordion
   * are omitted because the host page provides its own framing.
   * Default: false (used by /my-expenses where these elements are needed).
   */
  embedded?: boolean;
  /** Optional dirty-state signal for the host so it can show a discard confirm. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Header above the action button (only shown when embedded). */
  embeddedTitle?: string;
  embeddedDescription?: string;
}

/**
 * Personal Expense Claims flow — extracted from /my-expenses so it can
 * also be embedded inside the Cost Submission page (Task #56).
 *
 * Identical write path: inserts into expense_claims + expense_claim_lines
 * and triggers the same NotificationTriggerService notification to the
 * line manager. No schema changes.
 */
export const PersonalExpenseFlow = forwardRef<PersonalExpenseFlowHandle, PersonalExpenseFlowProps>(
function PersonalExpenseFlow({ embedded = false, onDirtyChange, embeddedTitle, embeddedDescription }, ref) {
  const { user, profile } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [header, setHeader] = useState({ title: '', description: '', currency: 'SDG' });
  const [lines, setLines] = useState<ExpenseLine[]>([
    { date: format(new Date(), 'yyyy-MM-dd'), category: 'travel', description: '', amount: 0, receipt_url: null },
  ]);

  const { data: claims = [], isLoading, refetch } = useQuery<ExpenseClaim[]>({
    queryKey: ['my-expenses', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_claims').select('*').eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseClaim[];
    },
  });

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);

  // Dirty-state computed from the header + lines + dialog open state.
  const isDirty = useMemo(() => {
    if (!open) return false;
    if (header.title.trim() !== '') return true;
    if (header.description.trim() !== '') return true;
    return lines.some(l => (Number(l.amount) || 0) > 0 || (l.description || '').trim() !== '' || !!l.receipt_url);
  }, [open, header, lines]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const resetForm = () => {
    setHeader({ title: '', description: '', currency: 'SDG' });
    setLines([{ date: format(new Date(), 'yyyy-MM-dd'), category: 'travel', description: '', amount: 0, receipt_url: null }]);
    setOpen(false);
  };

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    reset: () => resetForm(),
  }), [isDirty]);

  const stats = useMemo(() => {
    const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
    const pending = claims.filter(c => ['submitted','manager_approved'].includes(c.status));
    const approved = claims.filter(c => c.status === 'finance_approved');
    const paidThisMonth = claims.filter(c => {
      if (c.status !== 'paid') return false;
      const ts = c.paid_at ?? c.created_at;
      const d = new Date(ts);
      return d.getMonth() === m && d.getFullYear() === y;
    });
    const sumByCurrency = (arr: ExpenseClaim[]) => {
      const map = new Map<string, number>();
      arr.forEach(c => {
        const cur = c.currency || 'SDG';
        map.set(cur, (map.get(cur) ?? 0) + Number(c.total_amount ?? 0));
      });
      return Array.from(map.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
    };
    return {
      totalCount: claims.length,
      pendingCount: pending.length, pendingByCcy: sumByCurrency(pending),
      approvedCount: approved.length, approvedByCcy: sumByCurrency(approved),
      paidCount: paidThisMonth.length, paidByCcy: sumByCurrency(paidThisMonth),
    };
  }, [claims]);

  const renderCcyBreakdown = (entries: Array<[string, number]>) =>
    entries.length === 0
      ? '—'
      : entries.map(([cur, v]) => `${v.toLocaleString()} ${cur}`).join(' · ');

  const filteredClaims = useMemo(() => {
    if (filter === 'all') return claims;
    const grp = FILTER_GROUPS.find(g => g.key === filter);
    if (!grp || grp.statuses.length === 0) return claims;
    return claims.filter(c => grp.statuses.includes(c.status));
  }, [claims, filter]);

  const uploadReceipt = async (file: File, idx: number) => {
    if (!user?.id) return;
    const path = `expense-receipts/${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: false });
    if (upErr) { toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' }); return; }
    const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path);
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, receipt_url: pub.publicUrl } : l));
    toast({ title: 'Receipt uploaded / تم رفع الإيصال' });
  };

  const submit = async () => {
    if (!user?.id) return;
    if (!header.title.trim()) { toast({ title: 'Title required / العنوان مطلوب', variant: 'destructive' }); return; }
    if (lines.length === 0 || total <= 0) { toast({ title: 'Add at least one line item / أضف بندًا واحدًا على الأقل', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const { data: claim, error: cErr } = await supabase.from('expense_claims').insert({
        user_id: user.id,
        title: header.title.trim(),
        description: header.description.trim() || null,
        currency: header.currency,
        total_amount: total,
        status: 'submitted',
        manager_id: (profile as any)?.reports_to ?? null,
      }).select('id, claim_number').single();
      if (cErr) throw cErr;

      const linesPayload = lines.map(l => ({
        claim_id: claim.id, date: l.date, category: l.category,
        description: l.description, amount: Number(l.amount), receipt_url: l.receipt_url,
      }));
      const { error: lErr } = await supabase.from('expense_claim_lines').insert(linesPayload);
      if (lErr) throw lErr;

      if ((profile as any)?.reports_to) {
        try {
          await NotificationTriggerService.send({
            userId: (profile as any).reports_to,
            title: `New expense claim ${claim.claim_number ?? ''}`.trim(),
            titleAr: `مطالبة مصاريف جديدة ${claim.claim_number ?? ''}`.trim(),
            message: `${profile?.full_name ?? 'A team member'} submitted "${header.title}" for ${total.toLocaleString()} ${header.currency}.`,
            messageAr: `قدّم ${profile?.full_name ?? 'أحد أعضاء الفريق'} "${header.title}" بمبلغ ${total.toLocaleString()} ${header.currency}.`,
            type: 'info',
            category: 'approvals',
            priority: 'normal',
            link: '/approvals',
            relatedEntityId: claim.id,
            relatedEntityType: 'wallet',
            sendEmail: true,
          });
        } catch (e) { console.error('NotificationTriggerService (expense submit) failed', e); }
      }

      toast({ title: 'Claim submitted / تم إرسال المطالبة', description: `${claim.claim_number ?? ''}` });
      resetForm();
      refetch();
    } catch (err: any) {
      toast({ title: 'Failed / فشل', description: err.message ?? 'Could not submit claim', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Default copy varies by mode. /my-expenses (embedded=false) is a full page
  // with its own h1; the embedded version inside Cost Submission shows only an
  // h2 because the host page already provides the page-level title.
  const headerTitle = embeddedTitle ?? (embedded
    ? 'Personal Reimbursement / استرداد شخصي'
    : 'My Expense Claims / مطالبات مصاريفي');
  const headerDescription = embeddedDescription ?? (embedded
    ? 'Money you paid out of your own pocket — submit receipts to get reimbursed. Manager → Finance → Paid. / مصاريف دفعتها من جيبك — قدّم الإيصالات لاسترداد المبلغ.'
    : 'Reimbursement for money you paid out of your own pocket. / استرداد المصاريف التي دفعتها من جيبك.');

  return (
    <div className="space-y-5" data-testid="personal-expense-flow">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {embedded ? (
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              {headerTitle}
            </h2>
          ) : (
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Receipt className="w-7 h-7 text-primary" />
              {headerTitle}
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-1">{headerDescription}</p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          data-testid="button-personal-new-claim"
          size={embedded ? 'default' : 'lg'}
        >
          <Plus className="w-4 h-4 mr-2" /> New Claim / مطالبة جديدة
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card data-testid="stat-personal-total">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="w-3 h-3"/> Total / الإجمالي</div>
            <div className="text-2xl font-bold mt-1">{stats.totalCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-personal-pending">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3 h-3 text-amber-600"/> Pending / قيد المراجعة</div>
            <div className="text-2xl font-bold mt-1">{stats.pendingCount}</div>
            <div className="text-xs text-muted-foreground truncate" title={renderCcyBreakdown(stats.pendingByCcy)}>{renderCcyBreakdown(stats.pendingByCcy)}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-personal-approved">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="w-3 h-3 text-green-600"/> Awaiting Payment / في انتظار الدفع</div>
            <div className="text-2xl font-bold mt-1">{stats.approvedCount}</div>
            <div className="text-xs text-muted-foreground truncate" title={renderCcyBreakdown(stats.approvedByCcy)}>{renderCcyBreakdown(stats.approvedByCcy)}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-personal-paid">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="w-3 h-3 text-emerald-600"/> Paid This Month / مدفوع هذا الشهر</div>
            <div className="text-2xl font-bold mt-1">{stats.paidCount}</div>
            <div className="text-xs text-muted-foreground truncate" title={renderCcyBreakdown(stats.paidByCcy)}>{renderCcyBreakdown(stats.paidByCcy)}</div>
          </CardContent>
        </Card>
      </div>

      {/* How it works (only on standalone /my-expenses page) */}
      {!embedded && (
        <Accordion type="single" collapsible className="bg-muted/30 rounded-lg px-4">
          <AccordionItem value="how" className="border-0">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-how">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Info className="w-4 h-4 text-primary" /> How a claim flows / كيف تسير المطالبة
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm pt-2">
              <ol className="space-y-2 list-decimal pl-5">
                <li><b>Submit / إرسال</b> — fill in the title, add line items (date, category, amount, optional receipt), click Submit. / املأ العنوان وأضف البنود ثم اضغط إرسال.</li>
                <li><b>Manager review / مراجعة المدير</b> — your line manager gets a notification and approves or rejects. / يصل إشعار للمدير المباشر للموافقة أو الرفض.</li>
                <li><b>Finance review / مراجعة المالية</b> — Finance verifies receipts and approves payment. / تتحقق المالية من الإيصالات وتعتمد الدفع.</li>
                <li><b>Paid / مدفوع</b> — funds are released and the claim is marked Paid. / يُصرف المبلغ وتُعلَّم المطالبة كمدفوعة.</li>
              </ol>
              <div className="text-xs text-muted-foreground mt-3 border-t pt-2">
                Tip: every line item should have a receipt attached. Without receipts Finance may bounce the claim back. /
                نصيحة: أرفق إيصالاً لكل بند، وإلا قد ترفض المالية المطالبة.
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Status filter chips */}
      {claims.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTER_GROUPS.map(g => {
            const count = g.statuses.length === 0
              ? claims.length
              : claims.filter(c => g.statuses.includes(c.status)).length;
            const active = filter === g.key;
            return (
              <button
                key={g.key}
                onClick={() => setFilter(g.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:border-primary/40'
                }`}
                data-testid={`filter-personal-${g.key}`}
              >
                {g.label} <span className="opacity-70 ml-1">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Claims table */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle>My Claims / مطالباتي</CardTitle>
          {/* Inline "new claim" trigger when embedded — keeps the button discoverable
              even when stats/filters scroll the header out of view */}
          {embedded && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              data-testid="button-personal-new-claim-inline"
            >
              <Plus className="w-3 h-3 mr-1" /> New Claim
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : claims.length === 0 ? (
            <div className="text-center py-10 flex flex-col items-center gap-3">
              <div className="rounded-full bg-muted p-4">
                <Receipt className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="font-semibold">No expense claims yet / لا توجد مطالبات بعد</div>
              <div className="text-sm text-muted-foreground max-w-md">
                Click <b>New Claim</b> to start. Add line items, attach receipts,
                and submit for manager approval. /
                اضغط <b>مطالبة جديدة</b> للبدء، وأضف البنود وارفع الإيصالات ثم أرسل للموافقة.
              </div>
              <Button onClick={() => setOpen(true)} className="mt-1" data-testid="button-personal-new-claim-empty">
                <Plus className="w-4 h-4 mr-2" /> Create your first claim / أنشئ أول مطالبة
              </Button>
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No claims match this filter. / لا توجد مطالبات تطابق هذا التصفية.
              {' '}
              <button
                className="underline text-primary"
                onClick={() => setFilter('all')}
                data-testid="button-personal-reset-filter"
              >
                Show all / عرض الكل
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number / الرقم</TableHead>
                    <TableHead>Title / العنوان</TableHead>
                    <TableHead className="text-right">Amount / المبلغ</TableHead>
                    <TableHead>Status / الحالة</TableHead>
                    <TableHead>Created / التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.map(c => {
                    const meta = PERSONAL_STATUS_META[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-700' };
                    return (
                      <TableRow key={c.id} data-testid={`row-personal-claim-${c.id}`}>
                        <TableCell className="font-mono text-xs">{c.claim_number ?? c.id.slice(0,8)}</TableCell>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell className="text-right font-mono">{Number(c.total_amount).toLocaleString()} {c.currency}</TableCell>
                        <TableCell><Badge variant="outline" className={meta.cls}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-sm">{format(new Date(c.created_at), 'yyyy-MM-dd')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New claim dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="dialog-personal-new-claim">
          <DialogHeader>
            <DialogTitle>New Expense Claim / مطالبة مصاريف جديدة</DialogTitle>
          </DialogHeader>

          <div className="grid lg:grid-cols-[1fr,300px] gap-5 py-2">
            {/* Main column — header + grouped line items */}
            <div className="space-y-4 min-w-0">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="personal-title">Title / العنوان *</Label>
                  <Input id="personal-title" value={header.title}
                    onChange={e => setHeader(h => ({ ...h, title: e.target.value }))}
                    placeholder="e.g. Field trip to Kassala / مثال: زيارة ميدانية لكسلا"
                    data-testid="input-personal-title" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="personal-currency">Currency / العملة</Label>
                  <Select value={header.currency} onValueChange={v => setHeader(h => ({ ...h, currency: v }))}>
                    <SelectTrigger id="personal-currency" data-testid="select-personal-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {SUPPORTED_CURRENCIES.map(c => (
                        <SelectItem key={c.code} value={c.code} data-testid={`option-currency-${c.code}`}>
                          <span className="inline-flex items-center gap-2">
                            <span aria-hidden>{c.flag}</span>
                            <span className="font-mono font-semibold">{c.code}</span>
                            <span className="text-muted-foreground text-xs">— {c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="personal-description">Description / الوصف</Label>
                <Textarea id="personal-description" rows={2} value={header.description}
                  onChange={e => setHeader(h => ({ ...h, description: e.target.value }))} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Line Items / البنود <span className="text-muted-foreground font-normal">({lines.length})</span></Label>
                  <Button size="sm" variant="outline" onClick={() =>
                    setLines(prev => [...prev, { date: format(new Date(),'yyyy-MM-dd'), category:'travel', description:'', amount:0, receipt_url:null }])
                  } data-testid="button-personal-add-line">
                    <Plus className="w-3 h-3 mr-1" /> Add Line / أضف بنداً
                  </Button>
                </div>

                {/* Items grouped by category with subtotals — mirrors /cost-submission review style */}
                {(() => {
                  const indexed = lines.map((l, i) => ({ line: l, idx: i }));
                  const groups = CATEGORIES
                    .map(cat => ({ cat, entries: indexed.filter(e => e.line.category === cat) }))
                    .filter(g => g.entries.length > 0);

                  return groups.map(({ cat, entries }) => {
                    const meta = CATEGORY_META[cat];
                    const Icon = meta.icon;
                    const subtotal = entries.reduce((s, e) => s + (Number(e.line.amount) || 0), 0);
                    return (
                      <div key={cat} className={`rounded-lg border ${meta.color}`} data-testid={`group-personal-${cat}`}>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-current/10">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            <span className="text-sm font-semibold">{meta.label} / {meta.labelAr}</span>
                            <Badge variant="outline" className="text-[10px] bg-background">
                              {entries.length} {entries.length === 1 ? 'item' : 'items'}
                            </Badge>
                          </div>
                          <div className="text-sm font-mono font-semibold tabular-nums" data-testid={`subtotal-personal-${cat}`}>
                            {subtotal.toLocaleString()} {header.currency}
                          </div>
                        </div>
                        <div className="p-2 space-y-2 bg-background/60">
                          {entries.map(({ line: l, idx: i }) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-md bg-card">
                              <div className="col-span-2">
                                <Label className="text-xs">Date</Label>
                                <Input type="date" value={l.date} onChange={e => setLines(p => p.map((x,j) => j===i?{...x,date:e.target.value}:x))}
                                  data-testid={`input-personal-line-date-${i}`} />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Category</Label>
                                <Select value={l.category} onValueChange={v => setLines(p => p.map((x,j) => j===i?{...x,category:v}:x))}>
                                  <SelectTrigger data-testid={`select-personal-line-category-${i}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {CATEGORIES.map(c => (
                                      <SelectItem key={c} value={c}>
                                        <span className="inline-flex items-center gap-2">
                                          {(() => { const I = CATEGORY_META[c].icon; return <I className="w-3 h-3" />; })()}
                                          {CATEGORY_META[c].label}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-4">
                                <Label className="text-xs">Description</Label>
                                <Input value={l.description} onChange={e => setLines(p => p.map((x,j) => j===i?{...x,description:e.target.value}:x))}
                                  placeholder="What was this for?" data-testid={`input-personal-line-desc-${i}`} />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Amount</Label>
                                <Input type="number" min="0" step="0.01" value={l.amount}
                                  onChange={e => setLines(p => p.map((x,j) => j===i?{...x,amount:Number(e.target.value)}:x))}
                                  data-testid={`input-personal-line-amount-${i}`} />
                              </div>
                              <div className="col-span-1">
                                <Label className="text-xs" htmlFor={`input-personal-line-receipt-${i}`}>Receipt</Label>
                                <label
                                  htmlFor={`input-personal-line-receipt-${i}`}
                                  className="flex items-center justify-center h-9 border rounded cursor-pointer hover:bg-muted"
                                  aria-label={`Upload receipt for line ${i + 1}`}
                                  data-testid={`button-personal-upload-receipt-${i}`}
                                >
                                  <Upload className="w-4 h-4" />
                                  <input
                                    id={`input-personal-line-receipt-${i}`}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={e => e.target.files?.[0] && uploadReceipt(e.target.files[0], i)}
                                    data-testid={`input-personal-line-receipt-${i}`}
                                  />
                                </label>
                                {l.receipt_url && (
                                  <a
                                    href={l.receipt_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-600 underline"
                                    data-testid={`link-personal-receipt-${i}`}
                                  >
                                    view
                                  </a>
                                )}
                              </div>
                              <div className="col-span-1">
                                <Button size="icon" variant="ghost" onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                                  disabled={lines.length === 1} data-testid={`button-personal-remove-line-${i}`}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Side column — Request Summary (sticky on large screens) */}
            <aside className="lg:sticky lg:top-2 self-start space-y-3" data-testid="panel-personal-summary">
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary" />
                    Request Summary / ملخص الطلب
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Currency / العملة</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      {(() => {
                        const c = SUPPORTED_CURRENCIES.find(x => x.code === header.currency);
                        return <><span aria-hidden>{c?.flag}</span> <span className="font-mono">{header.currency}</span></>;
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Line items / البنود</span>
                    <span className="font-semibold tabular-nums">{lines.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">With receipts / مع إيصال</span>
                    <span className="font-semibold tabular-nums">
                      {lines.filter(l => !!l.receipt_url).length} / {lines.length}
                    </span>
                  </div>

                  <div className="border-t pt-3 space-y-1.5">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">By category / حسب الفئة</div>
                    {(() => {
                      const groups = CATEGORIES
                        .map(cat => ({
                          cat,
                          subtotal: lines.filter(l => l.category === cat).reduce((s,l) => s + (Number(l.amount)||0), 0),
                          count: lines.filter(l => l.category === cat).length,
                        }))
                        .filter(g => g.count > 0);
                      if (groups.length === 0) {
                        return <div className="text-xs text-muted-foreground italic">No items yet / لا توجد بنود بعد</div>;
                      }
                      return groups.map(g => {
                        const meta = CATEGORY_META[g.cat];
                        const Icon = meta.icon;
                        const pct = total > 0 ? (g.subtotal / total) * 100 : 0;
                        return (
                          <div key={g.cat} className="space-y-1" data-testid={`summary-row-${g.cat}`}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="inline-flex items-center gap-1.5">
                                <Icon className="w-3 h-3" />
                                {meta.label}
                              </span>
                              <span className="font-mono tabular-nums">{g.subtotal.toLocaleString()}</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  <div className="border-t pt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">Grand Total / الإجمالي</span>
                    <span className="text-lg font-bold font-mono tabular-nums" data-testid="text-personal-grand-total">
                      {total.toLocaleString()} {header.currency}
                    </span>
                  </div>

                  {lines.some(l => !l.receipt_url) && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-900">
                      <Info className="w-3 h-3 inline mr-1" />
                      Some items have no receipt. Finance may bounce the claim. /
                      بعض البنود بدون إيصال — قد ترفض المالية المطالبة.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="text-[11px] text-muted-foreground leading-snug px-1">
                Flow / المسار: <b>You → Manager → Finance → Paid</b>.
                {' '}You'll be notified at each step. / ستصلك إشعارات في كل خطوة.
              </div>
            </aside>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} data-testid="button-personal-submit-claim">
              <Send className="w-4 h-4 mr-2" />
              {submitting ? 'Submitting…' : 'Submit Claim / إرسال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default PersonalExpenseFlow;
