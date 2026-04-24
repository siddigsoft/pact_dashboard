import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { LogOut, Plus, FileText, Download, CheckCircle2 } from 'lucide-react';
import { format, differenceInMonths, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type Offboarding = {
  id: string; user_id: string; initiated_by: string;
  last_working_date: string; reason: string | null; status: string;
  pro_rated_salary: number; leave_encashment: number; eosb_payout: number;
  bonus_or_incentive: number; outstanding_advances: number; outstanding_loans: number;
  other_deductions: number; final_settlement_amount: number; currency: string;
  checklist: Record<string, boolean>; notes: string | null;
  approved_by: string | null; approved_at: string | null; completed_at: string | null;
  user_name?: string;
};
type Profile = { id: string; full_name: string; role?: string | null; email?: string | null; contract_start_date?: string | null };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  initiated:           { label: 'Initiated / بدء',                     cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  settlement_review:  { label: 'Settlement Pending / بانتظار التسوية', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  approved:            { label: 'Approved / تمت الموافقة',             cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  completed:           { label: 'Completed / مكتمل',                   cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  cancelled:           { label: 'Cancelled / ملغى',                    cls: 'bg-red-100 text-red-800 border-red-300' },
};

const CHECKLIST_ITEMS: Array<{ key: string; en: string; ar: string }> = [
  { key: 'asset_return',           en: 'Assets returned (laptop, badge, equipment)', ar: 'إعادة الأصول (الحاسوب، البطاقة، المعدات)' },
  { key: 'knowledge_transfer',     en: 'Knowledge transfer to colleagues',           ar: 'نقل المعرفة للزملاء' },
  { key: 'project_handover',       en: 'Active projects handed over',                ar: 'تسليم المشاريع النشطة' },
  { key: 'account_revoked',        en: 'System accounts revoked (email, Supabase)',  ar: 'إلغاء حسابات الأنظمة' },
  { key: 'final_payslip',          en: 'Final payslip prepared',                     ar: 'إعداد آخر كشف راتب' },
  { key: 'exit_interview',         en: 'Exit interview completed',                   ar: 'إجراء مقابلة المغادرة' },
  { key: 'experience_certificate', en: 'Experience certificate issued',              ar: 'إصدار شهادة الخبرة' },
];

const isHrAdmin = (role?: string | null) => {
  const r = (role ?? '').toLowerCase();
  return ['super_admin','superadmin','admin','financialadmin','financial_admin','finance','hr','hr_manager'].some(x => r.includes(x.replace('_','')));
};

export default function Offboarding() {
  const { user, profile } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = isHrAdmin(profile?.role);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Offboarding | null>(null);
  const [form, setForm] = useState({
    user_id: '', last_working_date: format(new Date(),'yyyy-MM-dd'), reason: '',
    pro_rated_salary: 0, leave_encashment: 0, eosb_payout: 0, bonus_or_incentive: 0,
    outstanding_advances: 0, outstanding_loans: 0, other_deductions: 0, currency: 'SDG',
    notes: '',
  });

  const { data: cases = [], isLoading } = useQuery<Offboarding[]>({
    queryKey: ['offboarding-cases'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offboarding_cases').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((c: any) => c.user_id)));
      if (ids.length === 0) return data ?? [];
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return (data ?? []).map((c: any) => ({ ...c, user_name: nameById.get(c.user_id) ?? c.user_id.slice(0,8) }));
    },
  });

  const { data: employees = [] } = useQuery<Profile[]>({
    queryKey: ['offboarding-employees'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, role, email, contract_start_date')
        .eq('is_active', true).order('full_name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const final = useMemo(() => {
    const credits = Number(form.pro_rated_salary) + Number(form.leave_encashment) + Number(form.eosb_payout) + Number(form.bonus_or_incentive);
    const debits  = Number(form.outstanding_advances) + Number(form.outstanding_loans) + Number(form.other_deductions);
    return credits - debits;
  }, [form]);

  const initiate = async () => {
    if (!user?.id || !form.user_id) { toast({ title: 'Pick an employee / اختر موظفاً', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const payload = {
        user_id: form.user_id,
        initiated_by: user.id,
        last_working_date: form.last_working_date,
        reason: form.reason.trim() || null,
        status: 'settlement_review',
        pro_rated_salary: Number(form.pro_rated_salary),
        leave_encashment: Number(form.leave_encashment),
        eosb_payout: Number(form.eosb_payout),
        bonus_or_incentive: Number(form.bonus_or_incentive),
        outstanding_advances: Number(form.outstanding_advances),
        outstanding_loans: Number(form.outstanding_loans),
        other_deductions: Number(form.other_deductions),
        final_settlement_amount: final,
        currency: form.currency,
        checklist: Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.key, false])),
        notes: form.notes.trim() || null,
      };
      const { data: row, error } = await supabase.from('offboarding_cases').insert(payload).select('id').single();
      if (error) throw error;

      // Notify the departing employee
      try {
        await NotificationTriggerService.send({
          userId: form.user_id,
          title: 'Offboarding initiated',
          titleAr: 'بدء إجراءات إنهاء الخدمة',
          message: `Your offboarding has been initiated by HR with an exit date of ${form.last_working_date}. Final settlement: ${final.toLocaleString()} ${form.currency}.`,
          messageAr: `تم بدء إجراءات إنهاء خدمتك من قبل الموارد البشرية بتاريخ خروج ${form.last_working_date}. التسوية النهائية: ${final.toLocaleString()} ${form.currency}.`,
          type: 'warning',
          category: 'system',
          priority: 'high',
          link: '/offboarding',
          relatedEntityId: row?.id,
          relatedEntityType: 'account',
          sendEmail: true,
        });
      } catch (e) { console.error('NotificationTriggerService (offboarding init) failed', e); }

      toast({ title: 'Offboarding initiated / تم بدء الإجراء', description: `Final settlement: ${final.toLocaleString()} ${form.currency}` });
      setOpen(false);
      setForm({ user_id: '', last_working_date: format(new Date(),'yyyy-MM-dd'), reason: '',
                pro_rated_salary: 0, leave_encashment: 0, eosb_payout: 0, bonus_or_incentive: 0,
                outstanding_advances: 0, outstanding_loans: 0, other_deductions: 0, currency:'SDG', notes: '' });
      qc.invalidateQueries({ queryKey: ['offboarding-cases'] });
    } catch (err: any) {
      toast({ title: 'Failed / فشل', description: err.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const toggleChecklist = async (id: string, checklist: Record<string, boolean>, key: string) => {
    const next = { ...checklist, [key]: !checklist[key] };
    const { error } = await supabase.from('offboarding_cases').update({ checklist: next }).eq('id', id);
    if (error) { toast({ title: 'Failed / فشل', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['offboarding-cases'] });
  };

  const approve = async (c: Offboarding) => {
    if (!user?.id) return;
    const { error } = await supabase.from('offboarding_cases').update({
      status: 'approved', approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq('id', c.id);
    if (error) { toast({ title: 'Failed / فشل', description: error.message, variant: 'destructive' }); return; }
    try {
      await NotificationTriggerService.send({
        userId: c.user_id,
        title: 'Settlement approved',
        titleAr: 'تمت الموافقة على التسوية',
        message: `Your final settlement of ${Number(c.final_settlement_amount).toLocaleString()} ${c.currency} has been approved.`,
        messageAr: `تمت الموافقة على تسويتك النهائية بمبلغ ${Number(c.final_settlement_amount).toLocaleString()} ${c.currency}.`,
        type: 'success', category: 'financial', priority: 'high',
        link: '/wallet', sendEmail: true,
      });
    } catch (e) { console.error(e); }
    toast({ title: 'Approved / تمت الموافقة' });
    qc.invalidateQueries({ queryKey: ['offboarding-cases'] });
  };

  const complete = async (c: Offboarding) => {
    if (!user?.id) return;
    const allDone = CHECKLIST_ITEMS.every(i => c.checklist?.[i.key]);
    if (!allDone) { toast({ title: 'Complete the checklist first / أكمل قائمة المهام أولاً', variant: 'destructive' }); return; }
    // Mark inactive in profiles
    await supabase.from('profiles').update({ is_active: false }).eq('id', c.user_id);
    const { error } = await supabase.from('offboarding_cases').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', c.id);
    if (error) { toast({ title: 'Failed / فشل', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Offboarding completed / تم الإنهاء', description: `${c.user_name} marked inactive.` });
    qc.invalidateQueries({ queryKey: ['offboarding-cases'] });
  };

  const exportPdf = (c: Offboarding) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Final Settlement Worksheet', 14, 18);
    doc.setFontSize(10);
    doc.text(`Employee: ${c.user_name ?? c.user_id}`, 14, 28);
    doc.text(`Exit Date: ${c.last_working_date}`, 14, 34);
    doc.text(`Reason: ${c.reason ?? '—'}`, 14, 40);
    autoTable(doc, {
      startY: 48,
      head: [['Component','Amount']],
      body: [
        ['Pro-rated salary',          `${Number(c.pro_rated_salary).toLocaleString()} ${c.currency}`],
        ['Leave encashment',          `${Number(c.leave_encashment).toLocaleString()} ${c.currency}`],
        ['EOSB payout',               `${Number(c.eosb_payout).toLocaleString()} ${c.currency}`],
        ['Bonus / incentive',         `${Number(c.bonus_or_incentive).toLocaleString()} ${c.currency}`],
        ['(-) Outstanding advances',  `(${Number(c.outstanding_advances).toLocaleString()}) ${c.currency}`],
        ['(-) Outstanding loans',     `(${Number(c.outstanding_loans).toLocaleString()}) ${c.currency}`],
        ['(-) Other deductions',      `(${Number(c.other_deductions).toLocaleString()}) ${c.currency}`],
        ['NET SETTLEMENT',            `${Number(c.final_settlement_amount).toLocaleString()} ${c.currency}`],
      ],
    });
    let y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text('Checklist', 14, y); y += 6;
    doc.setFontSize(9);
    CHECKLIST_ITEMS.forEach(it => {
      const done = c.checklist?.[it.key] ? '[x]' : '[ ]';
      doc.text(`${done} ${it.en}`, 14, y); y += 5;
    });
    doc.save(`offboarding-${c.user_name ?? c.user_id}-${c.last_working_date}.pdf`);
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6 max-w-2xl text-center text-muted-foreground" data-testid="page-offboarding-no-access">
        <LogOut className="w-12 h-12 mx-auto opacity-50 mb-3" />
        Offboarding is HR/Admin only. / هذه الصفحة لإدارة الموارد البشرية فقط.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl" data-testid="page-offboarding">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <LogOut className="w-7 h-7 text-primary" />
            Offboarding <span className="text-base text-muted-foreground">/ إنهاء الخدمة</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage employee exits: settlement worksheet, checklist, account revocation. / إدارة مغادرة الموظفين: التسوية والمهام وإلغاء الحسابات.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-offboarding">
          <Plus className="w-4 h-4 mr-2" /> Initiate Offboarding / بدء إجراء
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Active Cases / الحالات النشطة</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div> :
           cases.length === 0 ? <div className="text-center py-6 text-muted-foreground">No offboarding cases yet. / لا توجد حالات بعد.</div> :
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee / الموظف</TableHead>
                <TableHead>Exit Date / تاريخ الخروج</TableHead>
                <TableHead>Settlement / التسوية</TableHead>
                <TableHead>Status / الحالة</TableHead>
                <TableHead>Checklist / المهام</TableHead>
                <TableHead className="text-right">Actions / الإجراءات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {cases.map(c => {
                  const done = CHECKLIST_ITEMS.filter(i => c.checklist?.[i.key]).length;
                  const meta = STATUS_META[c.status] ?? { label: c.status, cls: 'bg-gray-100' };
                  return (
                    <TableRow key={c.id} data-testid={`row-offboarding-${c.id}`}>
                      <TableCell className="font-medium">{c.user_name}</TableCell>
                      <TableCell>{c.last_working_date}</TableCell>
                      <TableCell className="font-mono">{Number(c.final_settlement_amount).toLocaleString()} {c.currency}</TableCell>
                      <TableCell><Badge variant="outline" className={meta.cls}>{meta.label}</Badge></TableCell>
                      <TableCell><span className="text-sm">{done}/{CHECKLIST_ITEMS.length}</span></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)} data-testid={`button-view-${c.id}`}>View</Button>
                        <Button size="sm" variant="ghost" onClick={() => exportPdf(c)} data-testid={`button-pdf-${c.id}`}><Download className="w-3 h-3"/></Button>
                        {c.status === 'settlement_review' && (
                          <Button size="sm" onClick={() => approve(c)} data-testid={`button-approve-${c.id}`}>Approve</Button>
                        )}
                        {c.status === 'approved' && (
                          <Button size="sm" variant="default" onClick={() => complete(c)} data-testid={`button-complete-${c.id}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1"/>Complete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          }
        </CardContent>
      </Card>

      {/* Initiate dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-initiate-offboarding">
          <DialogHeader>
            <DialogTitle>Initiate Offboarding / بدء إنهاء خدمة</DialogTitle>
            <CardDescription>Build the final settlement worksheet. / أعد ورقة التسوية النهائية.</CardDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Employee / الموظف *</Label>
                <Select value={form.user_id} onValueChange={v => {
                  setForm(f => ({ ...f, user_id: v }));
                  // Auto-populate EOSB hint = months_of_service / 12 * monthly salary (placeholder — admin can edit)
                  const emp = employees.find(e => e.id === v);
                  if (emp?.contract_start_date) {
                    const months = differenceInMonths(new Date(), parseISO(emp.contract_start_date));
                    setForm(f => ({ ...f, eosb_payout: Math.round(months / 12 * 0) })); // user fills monthly salary
                  }
                }}>
                  <SelectTrigger data-testid="select-employee"><SelectValue placeholder="Choose employee…" /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.role ?? ''})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Exit Date / تاريخ الخروج *</Label>
                <Input type="date" value={form.last_working_date}
                  onChange={e => setForm(f => ({ ...f, last_working_date: e.target.value }))}
                  data-testid="input-exit-date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason / السبب</Label>
              <Textarea rows={2} value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} data-testid="input-reason" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">Credits (+) / المستحقات</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {([
                    ['pro_rated_salary',   'Pro-rated salary / راتب نسبي'],
                    ['leave_encashment',   'Leave encashment / صرف الإجازة'],
                    ['eosb_payout',        'EOSB payout / مكافأة نهاية الخدمة'],
                    ['bonus_or_incentive', 'Bonus / مكافأة'],
                  ] as const).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-2">
                      <Label className="text-xs flex-1">{label}</Label>
                      <Input type="number" min="0" step="0.01" className="w-32"
                        value={(form as any)[k]}
                        onChange={e => setForm(f => ({ ...f, [k]: Number(e.target.value) }))}
                        data-testid={`input-${k}`} />
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">Deductions (-) / الخصومات</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {([
                    ['outstanding_advances', 'Outstanding advances / سلف مستحقة'],
                    ['outstanding_loans',    'Outstanding loans / قروض مستحقة'],
                    ['other_deductions',     'Other deductions / خصومات أخرى'],
                  ] as const).map(([k, label]) => (
                    <div key={k} className="flex items-center gap-2">
                      <Label className="text-xs flex-1">{label}</Label>
                      <Input type="number" min="0" step="0.01" className="w-32"
                        value={(form as any)[k]}
                        onChange={e => setForm(f => ({ ...f, [k]: Number(e.target.value) }))}
                        data-testid={`input-${k}`} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">Final Settlement / التسوية النهائية:</span>
              <span className={`text-2xl font-bold ${final < 0 ? 'text-red-600' : 'text-emerald-700'}`} data-testid="text-final-settlement">
                {final.toLocaleString()} {form.currency}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Notes / ملاحظات</Label>
              <Textarea rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={initiate} disabled={submitting} data-testid="button-initiate">
              {submitting ? 'Initiating…' : 'Initiate / بدء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-view-offboarding">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.user_name} — Offboarding Detail</DialogTitle>
                <CardDescription>Exit date: {editing.last_working_date} · Settlement: {Number(editing.final_settlement_amount).toLocaleString()} {editing.currency}</CardDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4"/>Settlement Breakdown</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="flex justify-between"><span>Pro-rated salary</span><span>{Number(editing.pro_rated_salary).toLocaleString()} {editing.currency}</span></div>
                    <div className="flex justify-between"><span>Leave encashment</span><span>{Number(editing.leave_encashment).toLocaleString()} {editing.currency}</span></div>
                    <div className="flex justify-between"><span>EOSB payout</span><span>{Number(editing.eosb_payout).toLocaleString()} {editing.currency}</span></div>
                    <div className="flex justify-between"><span>Bonus / incentive</span><span>{Number(editing.bonus_or_incentive).toLocaleString()} {editing.currency}</span></div>
                    <div className="flex justify-between text-red-600"><span>(-) Advances</span><span>({Number(editing.outstanding_advances).toLocaleString()}) {editing.currency}</span></div>
                    <div className="flex justify-between text-red-600"><span>(-) Loans</span><span>({Number(editing.outstanding_loans).toLocaleString()}) {editing.currency}</span></div>
                    <div className="flex justify-between text-red-600"><span>(-) Other deductions</span><span>({Number(editing.other_deductions).toLocaleString()}) {editing.currency}</span></div>
                    <div className="flex justify-between border-t pt-2 mt-2 font-bold text-base">
                      <span>NET</span><span>{Number(editing.final_settlement_amount).toLocaleString()} {editing.currency}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Exit Checklist / قائمة المهام</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {CHECKLIST_ITEMS.map(it => (
                      <label key={it.key} className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={!!editing.checklist?.[it.key]}
                          onCheckedChange={() => toggleChecklist(editing.id, editing.checklist || {}, it.key)}
                          data-testid={`checkbox-${it.key}`}
                        />
                        <span className="text-sm">{it.en} <span className="text-muted-foreground">/ {it.ar}</span></span>
                      </label>
                    ))}
                  </CardContent>
                </Card>
                {editing.notes && <div className="text-sm bg-muted p-3 rounded-md"><strong>Notes:</strong> {editing.notes}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => exportPdf(editing)}><Download className="w-4 h-4 mr-2"/>Export PDF</Button>
                <Button onClick={() => setEditing(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
