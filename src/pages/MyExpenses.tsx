import { useState, useMemo } from 'react';
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
import { Receipt, Plus, Trash2, Send, FileText, Upload } from 'lucide-react';
import { format } from 'date-fns';

type ExpenseClaim = {
  id: string; user_id: string; claim_number: string | null; title: string;
  description: string | null; currency: string; total_amount: number; status: string;
  manager_notes: string | null; finance_notes: string | null;
  created_at: string;
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

export default function MyExpenses() {
  const { user, profile } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

      // Notify manager
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
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl" data-testid="page-my-expenses">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Receipt className="w-7 h-7 text-primary" />
            My Expense Claims <span className="text-base text-muted-foreground">/ مطالبات مصاريفي</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submit expense reimbursements with receipts. / قدّم مطالبات استرداد المصاريف مع الإيصالات.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-claim">
          <Plus className="w-4 h-4 mr-2" /> New Claim / مطالبة جديدة
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>My Claims / مطالباتي</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : claims.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 opacity-50" />
              No expense claims yet. / لا توجد مطالبات بعد.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number / الرقم</TableHead>
                  <TableHead>Title / العنوان</TableHead>
                  <TableHead>Amount / المبلغ</TableHead>
                  <TableHead>Status / الحالة</TableHead>
                  <TableHead>Created / التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map(c => {
                  const meta = STATUS_META[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <TableRow key={c.id} data-testid={`row-claim-${c.id}`}>
                      <TableCell className="font-mono text-xs">{c.claim_number ?? c.id.slice(0,8)}</TableCell>
                      <TableCell className="font-medium">{c.title}</TableCell>
                      <TableCell>{Number(c.total_amount).toLocaleString()} {c.currency}</TableCell>
                      <TableCell><Badge variant="outline" className={meta.cls}>{meta.label}</Badge></TableCell>
                      <TableCell className="text-sm">{format(new Date(c.created_at), 'yyyy-MM-dd')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
                <Label>Currency / العملة</Label>
                <Select value={header.currency} onValueChange={v => setHeader(h => ({ ...h, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <Label className="text-xs">Receipt</Label>
                    <label className="flex items-center justify-center h-9 border rounded cursor-pointer hover:bg-muted">
                      <Upload className="w-4 h-4" />
                      <input type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={e => e.target.files?.[0] && uploadReceipt(e.target.files[0], i)} />
                    </label>
                    {l.receipt_url && <a href={l.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">view</a>}
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
