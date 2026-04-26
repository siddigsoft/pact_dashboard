import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  Receipt, Plus, Trash2, Send, FileText, Upload, ArrowRight, Info,
  CreditCard, Clock, CheckCircle2, Wallet,
} from 'lucide-react';
import { format } from 'date-fns';

type ExpenseClaim = {
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
const STATUS_META: Record<string, { label: string; cls: string }> = {
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

export default function MyExpenses() {
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

  const stats = useMemo(() => {
    const now = new Date(); const m = now.getMonth(); const y = now.getFullYear();
    const pending = claims.filter(c => ['submitted','manager_approved'].includes(c.status));
    const approved = claims.filter(c => c.status === 'finance_approved');
    const paidThisMonth = claims.filter(c => {
      if (c.status !== 'paid') return false;
      // Use paid_at when present; fall back to created_at if the column was never set.
      const ts = c.paid_at ?? c.created_at;
      const d = new Date(ts);
      return d.getMonth() === m && d.getFullYear() === y;
    });
    // Group amounts by currency so we never sum SDG + USD together.
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
      setOpen(false);
      setHeader({ title: '', description: '', currency: 'SDG' });
      setLines([{ date: format(new Date(),'yyyy-MM-dd'), category:'travel', description:'', amount:0, receipt_url:null }]);
      refetch();
    } catch (err: any) {
      toast({ title: 'Failed / فشل', description: err.message ?? 'Could not submit claim', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl" data-testid="page-my-expenses">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Receipt className="w-7 h-7 text-primary" />
            My Expense Claims <span className="text-base text-muted-foreground">/ مطالبات مصاريفي</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reimbursement for money you paid out of your own pocket. / استرداد المصاريف التي دفعتها من جيبك.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-claim" size="lg">
          <Plus className="w-4 h-4 mr-2" /> New Claim / مطالبة جديدة
        </Button>
      </div>

      {/* When-to-use comparison banner */}
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2 text-sm">
              <div className="font-semibold text-blue-900 dark:text-blue-200">
                Two ways to request money — pick the right one. / طريقتان لطلب الأموال — اختر المناسبة:
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded border bg-white dark:bg-background p-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <Receipt className="w-4 h-4 text-primary" /> My Expenses (this page) / مصاريفي
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    You already paid (taxi, lunch, supplies). Upload receipts and get reimbursed.
                    Manager → Finance → Paid.
                  </div>
                  <div className="text-xs text-muted-foreground mt-1" dir="rtl">
                    دفعت من جيبك بالفعل (مواصلات، غداء، مستلزمات). ارفع الإيصالات واسترد المبلغ. مدير → مالية → مدفوع.
                  </div>
                </div>
                <Link to="/cost-submission" className="block group" data-testid="link-cost-submission">
                  <div className="rounded border bg-white dark:bg-background p-3 hover:border-primary transition-colors h-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold">
                        <Wallet className="w-4 h-4 text-violet-600" /> Cost Submission / تقديم التكاليف
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Project funding requests &amp; advances. Multi-tier approval, signatures, reconciliation.
                    </div>
                    <div className="text-xs text-muted-foreground mt-1" dir="rtl">
                      طلبات تمويل المشاريع والسلف. موافقات متعددة المستويات، توقيعات، تسوية.
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card data-testid="stat-total">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="w-3 h-3"/> Total / الإجمالي</div>
            <div className="text-2xl font-bold mt-1">{stats.totalCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-pending">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3 h-3 text-amber-600"/> Pending / قيد المراجعة</div>
            <div className="text-2xl font-bold mt-1">{stats.pendingCount}</div>
            <div className="text-xs text-muted-foreground truncate" title={renderCcyBreakdown(stats.pendingByCcy)}>{renderCcyBreakdown(stats.pendingByCcy)}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-approved">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="w-3 h-3 text-green-600"/> Awaiting Payment / في انتظار الدفع</div>
            <div className="text-2xl font-bold mt-1">{stats.approvedCount}</div>
            <div className="text-xs text-muted-foreground truncate" title={renderCcyBreakdown(stats.approvedByCcy)}>{renderCcyBreakdown(stats.approvedByCcy)}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-paid">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="w-3 h-3 text-emerald-600"/> Paid This Month / مدفوع هذا الشهر</div>
            <div className="text-2xl font-bold mt-1">{stats.paidCount}</div>
            <div className="text-xs text-muted-foreground truncate" title={renderCcyBreakdown(stats.paidByCcy)}>{renderCcyBreakdown(stats.paidByCcy)}</div>
          </CardContent>
        </Card>
      </div>

      {/* How it works */}
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
                data-testid={`filter-${g.key}`}
              >
                {g.label} <span className="opacity-70 ml-1">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Claims table */}
      <Card>
        <CardHeader><CardTitle>My Claims / مطالباتي</CardTitle></CardHeader>
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
              <Button onClick={() => setOpen(true)} className="mt-1" data-testid="button-new-claim-empty">
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
                data-testid="button-reset-filter"
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
                  const meta = STATUS_META[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <TableRow key={c.id} data-testid={`row-claim-${c.id}`}>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-new-claim">
          <DialogHeader><DialogTitle>New Expense Claim / مطالبة مصاريف جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="title">Title / العنوان *</Label>
                <Input id="title" value={header.title}
                  onChange={e => setHeader(h => ({ ...h, title: e.target.value }))}
                  placeholder="e.g. Field trip to Kassala / مثال: زيارة ميدانية لكسلا"
                  data-testid="input-title" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency / العملة</Label>
                <Select value={header.currency} onValueChange={v => setHeader(h => ({ ...h, currency: v }))}>
                  <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{['SDG','USD','EUR'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description / الوصف</Label>
              <Textarea id="description" rows={2} value={header.description}
                onChange={e => setHeader(h => ({ ...h, description: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items / البنود</Label>
                <Button size="sm" variant="outline" onClick={() =>
                  setLines(prev => [...prev, { date: format(new Date(),'yyyy-MM-dd'), category:'travel', description:'', amount:0, receipt_url:null }])
                } data-testid="button-add-line">
                  <Plus className="w-3 h-3 mr-1" /> Add Line / أضف بنداً
                </Button>
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-md">
                  <div className="col-span-2">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={l.date} onChange={e => setLines(p => p.map((x,j) => j===i?{...x,date:e.target.value}:x))}
                      data-testid={`input-line-date-${i}`} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Category</Label>
                    <Select value={l.category} onValueChange={v => setLines(p => p.map((x,j) => j===i?{...x,category:v}:x))}>
                      <SelectTrigger data-testid={`select-line-category-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">Description</Label>
                    <Input value={l.description} onChange={e => setLines(p => p.map((x,j) => j===i?{...x,description:e.target.value}:x))}
                      placeholder="What was this for?" data-testid={`input-line-desc-${i}`} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" min="0" step="0.01" value={l.amount}
                      onChange={e => setLines(p => p.map((x,j) => j===i?{...x,amount:Number(e.target.value)}:x))}
                      data-testid={`input-line-amount-${i}`} />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs" htmlFor={`input-line-receipt-${i}`}>Receipt</Label>
                    <label
                      htmlFor={`input-line-receipt-${i}`}
                      className="flex items-center justify-center h-9 border rounded cursor-pointer hover:bg-muted"
                      aria-label={`Upload receipt for line ${i + 1}`}
                      data-testid={`button-upload-receipt-${i}`}
                    >
                      <Upload className="w-4 h-4" />
                      <input
                        id={`input-line-receipt-${i}`}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && uploadReceipt(e.target.files[0], i)}
                        data-testid={`input-line-receipt-${i}`}
                      />
                    </label>
                    {l.receipt_url && (
                      <a
                        href={l.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline"
                        data-testid={`link-receipt-${i}`}
                      >
                        view
                      </a>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Button size="icon" variant="ghost" onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                      disabled={lines.length === 1} data-testid={`button-remove-line-${i}`}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="text-right text-sm font-medium pt-2">
                Total / الإجمالي: <span className="text-lg ml-2">{total.toLocaleString()} {header.currency}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} data-testid="button-submit-claim">
              <Send className="w-4 h-4 mr-2" />
              {submitting ? 'Submitting…' : 'Submit Claim / إرسال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
