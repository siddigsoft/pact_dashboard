import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Plus, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

type Advance = {
  id: string; user_id: string; amount: number; currency: string; reason: string | null;
  repayment_months: number; status: string; manager_notes: string | null; finance_notes: string | null;
  manager_decided_at: string | null; finance_decided_at: string | null;
  disbursed_at: string | null; total_repaid: number; created_at: string;
};

const STATUS_META: Record<string, { label: string; labelAr: string; cls: string; icon: typeof Clock }> = {
  pending_manager:  { label: 'Pending Manager',   labelAr: 'بانتظار المدير',     cls: 'bg-amber-100 text-amber-800 border-amber-300',   icon: Clock },
  pending_finance:  { label: 'Pending Finance',   labelAr: 'بانتظار المالية',    cls: 'bg-blue-100 text-blue-800 border-blue-300',     icon: Clock },
  approved:         { label: 'Approved',          labelAr: 'تمت الموافقة',       cls: 'bg-green-100 text-green-800 border-green-300',  icon: CheckCircle2 },
  disbursed:        { label: 'Disbursed',         labelAr: 'تم الصرف',           cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2 },
  repaying:         { label: 'Repaying',          labelAr: 'قيد السداد',         cls: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Clock },
  repaid:           { label: 'Repaid',            labelAr: 'تم السداد',          cls: 'bg-gray-100 text-gray-800 border-gray-300',     icon: CheckCircle2 },
  rejected:         { label: 'Rejected',          labelAr: 'مرفوض',              cls: 'bg-red-100 text-red-800 border-red-300',        icon: XCircle },
  cancelled:        { label: 'Cancelled',         labelAr: 'ملغى',               cls: 'bg-gray-100 text-gray-700 border-gray-300',     icon: XCircle },
};

export default function MyAdvances() {
  const { user, profile } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'SDG', months: '3', reason: '' });

  const { data: advances = [], isLoading, refetch } = useQuery<Advance[]>({
    queryKey: ['my-advances', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_advances')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Advance[];
    },
  });

  const outstanding = useMemo(() =>
    advances.filter(a => ['disbursed','repaying'].includes(a.status))
            .reduce((s, a) => s + Math.max(0, Number(a.amount) - Number(a.total_repaid)), 0),
  [advances]);

  const submit = async () => {
    if (!user?.id) return;
    const amt = Number(form.amount);
    const months = Number(form.months);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: 'Enter a valid amount / أدخل مبلغًا صحيحًا', variant: 'destructive' }); return;
    }
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      toast({ title: 'Repayment must be 1–24 months / السداد بين 1-24 شهرًا', variant: 'destructive' }); return;
    }
    setSubmitting(true);
    try {
      const { data: row, error } = await supabase.from('salary_advances').insert({
        user_id: user.id,
        amount: amt,
        currency: form.currency,
        repayment_months: months,
        reason: form.reason.trim() || null,
        manager_id: (profile as any)?.reports_to ?? null,
        status: 'pending_manager',
      }).select('id').single();
      if (error) throw error;

      // Notify manager (if known) so they can act
      if ((profile as any)?.reports_to) {
        try {
          await NotificationTriggerService.send({
            userId: (profile as any).reports_to,
            title: 'New salary advance request',
            titleAr: 'طلب سلفة راتب جديد',
            message: `${profile?.full_name ?? 'A team member'} requested a salary advance of ${amt.toLocaleString()} ${form.currency} over ${months} month(s).`,
            messageAr: `قدّم ${profile?.full_name ?? 'أحد أعضاء الفريق'} طلب سلفة راتب بمبلغ ${amt.toLocaleString()} ${form.currency} على ${months} شهرًا.`,
            type: 'info',
            category: 'approvals',
            priority: 'normal',
            link: '/approvals',
            relatedEntityId: row?.id,
            relatedEntityType: 'wallet',
            sendEmail: true,
          });
        } catch (e) { console.error('NotificationTriggerService (advance request) failed', e); }
      }

      toast({ title: 'Request submitted / تم إرسال الطلب', description: 'Your manager will review it shortly. / سيقوم مديرك بمراجعته قريبًا.' });
      setOpen(false);
      setForm({ amount: '', currency: 'SDG', months: '3', reason: '' });
      refetch();
    } catch (err: any) {
      toast({ title: 'Failed / فشل', description: err.message ?? 'Could not submit request', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel this advance request? / إلغاء طلب السلفة؟')) return;
    const { error } = await supabase.from('salary_advances').update({ status: 'cancelled' }).eq('id', id);
    if (error) { toast({ title: 'Failed / فشل', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Cancelled / تم الإلغاء' });
    refetch();
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl" data-testid="page-my-advances">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Wallet className="w-7 h-7 text-primary" />
            My Salary Advances <span className="text-base text-muted-foreground">/ سلفي على الراتب</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Request a salary advance and track repayments. / اطلب سلفة على راتبك وتابع سدادها.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-advance">
          <Plus className="w-4 h-4 mr-2" /> New Request / طلب جديد
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Outstanding / المستحق</div>
          <div className="text-2xl font-bold mt-1" data-testid="text-outstanding">{outstanding.toLocaleString()} SDG</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Active Requests / طلبات نشطة</div>
          <div className="text-2xl font-bold mt-1">{advances.filter(a => !['repaid','rejected','cancelled'].includes(a.status)).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Total This Year / الإجمالي السنوي</div>
          <div className="text-2xl font-bold mt-1">{advances.filter(a => new Date(a.created_at).getFullYear() === new Date().getFullYear()).reduce((s, a) => s + Number(a.amount), 0).toLocaleString()} SDG</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Request History / سجل الطلبات</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : advances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 opacity-50" />
              No advance requests yet. / لا توجد طلبات سلف بعد.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / التاريخ</TableHead>
                  <TableHead>Amount / المبلغ</TableHead>
                  <TableHead>Months / الأشهر</TableHead>
                  <TableHead>Repaid / المسدد</TableHead>
                  <TableHead>Status / الحالة</TableHead>
                  <TableHead>Reason / السبب</TableHead>
                  <TableHead className="text-right">Actions / الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map(a => {
                  const meta = STATUS_META[a.status] ?? STATUS_META.pending_manager;
                  const Icon = meta.icon;
                  return (
                    <TableRow key={a.id} data-testid={`row-advance-${a.id}`}>
                      <TableCell className="text-sm">{format(new Date(a.created_at), 'yyyy-MM-dd')}</TableCell>
                      <TableCell className="font-medium">{Number(a.amount).toLocaleString()} {a.currency}</TableCell>
                      <TableCell>{a.repayment_months}</TableCell>
                      <TableCell>{Number(a.total_repaid).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.cls}>
                          <Icon className="w-3 h-3 mr-1" /> {meta.label} / {meta.labelAr}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={a.reason ?? ''}>{a.reason ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {a.status === 'pending_manager' && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(a.id)} data-testid={`button-cancel-${a.id}`}>Cancel</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-new-advance">
          <DialogHeader>
            <DialogTitle>New Salary Advance / سلفة راتب جديدة</DialogTitle>
            <DialogDescription>
              Manager approves first, then finance. / يوافق المدير أولاً، ثم المالية.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="amount">Amount / المبلغ *</Label>
                <Input id="amount" type="number" min="1" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  data-testid="input-amount" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency / العملة</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['SDG','USD','EUR','GBP','SAR','AED','QAR','UGX','RWF','KES','SSP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="months">Repayment Period (months 1–24) / فترة السداد (شهر)</Label>
              <Input id="months" type="number" min="1" max="24" value={form.months}
                onChange={e => setForm(f => ({ ...f, months: e.target.value }))}
                data-testid="input-months" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason / السبب</Label>
              <Textarea id="reason" rows={3} value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Brief explanation… / شرح موجز…"
                data-testid="input-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} data-testid="button-submit-advance">
              {submitting ? 'Submitting…' : 'Submit Request / إرسال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
