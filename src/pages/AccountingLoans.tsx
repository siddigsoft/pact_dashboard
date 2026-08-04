import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, RefreshCw, Download, PiggyBank, ChevronDown, ChevronRight } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';
import { addMonths, format, parseISO } from 'date-fns';

interface Loan {
  id: string; loan_number: string; name: string; loan_type: string;
  partner_name: string | null; principal_amount: number; currency: string;
  interest_rate: number; interest_type: string; start_date: string; maturity_date: string;
  payment_frequency: string; outstanding_balance: number; total_paid: number;
  total_interest_paid: number; status: string; description: string | null; created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft:   'bg-slate-100 text-slate-600',
  active:  'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  closed:  'bg-slate-100 text-slate-500',
};
const FREQUENCIES = ['monthly','quarterly','semi_annual','annual'];
const CURRENCIES = ['USD','SDG','EUR','GBP','SAR','AED','EGP'];

const BLANK = {
  loan_number:'', name:'', loan_type:'received', partner_name:'',
  principal_amount:'', currency:'USD', interest_rate:'', interest_type:'fixed',
  start_date: new Date().toISOString().slice(0,10),
  maturity_date: addMonths(new Date(),12).toISOString().slice(0,10),
  payment_frequency:'monthly', description:'',
};

export default function AccountingLoans() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();
  const canManage = hasAnyRole(['super_admin','admin','financialAdmin','finance']);
  const allowed   = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [loans, setLoans]     = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [typeFilter, setTypeFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<Loan | null>(null);
  const [form, setForm]         = useState({ ...BLANK });
  const [saving, setSaving]     = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_loans' as any).select('*').order('created_at', {ascending:false}).limit(500);
    setLoans((data??[]) as Loan[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const sf = (k: keyof typeof BLANK, v: string) => setForm(p=>({...p,[k]:v}));

  const openNew = () => {
    setEditing(null);
    const now = new Date();
    setForm({ ...BLANK, loan_number:`LN-${now.getFullYear()}-${String(loans.length+1).padStart(3,'0')}` });
    setFormOpen(true);
  };
  const openEdit = (l: Loan) => {
    setEditing(l);
    setForm({ loan_number:l.loan_number, name:l.name, loan_type:l.loan_type, partner_name:l.partner_name??'', principal_amount:String(l.principal_amount), currency:l.currency, interest_rate:String(l.interest_rate), interest_type:l.interest_type, start_date:l.start_date, maturity_date:l.maturity_date, payment_frequency:l.payment_frequency, description:l.description??'' });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.principal_amount) { toast({title:'Name and amount required',variant:'destructive'}); return; }
    setSaving(true);
    const principal = Number(form.principal_amount);
    const payload = {
      loan_number: form.loan_number.trim(), name: form.name.trim(), loan_type: form.loan_type,
      partner_name: form.partner_name||null, principal_amount: principal, currency: form.currency,
      interest_rate: Number(form.interest_rate)||0, interest_type: form.interest_type,
      start_date: form.start_date, maturity_date: form.maturity_date,
      payment_frequency: form.payment_frequency, description: form.description||null,
      outstanding_balance: editing ? editing.outstanding_balance : principal,
      total_paid: editing?.total_paid ?? 0,
      total_interest_paid: editing?.total_interest_paid ?? 0,
      status: editing?.status ?? 'active', created_by: currentUser?.id,
    };
    const { error } = editing
      ? await supabase.from('acct_loans' as any).update(payload).eq('id',editing.id)
      : await supabase.from('acct_loans' as any).insert(payload);
    if (error) toast({title:'Failed',description:error.message,variant:'destructive'});
    else { toast({title: editing?'Updated':'Created'}); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const buildAmortization = (loan: Loan) => {
    const r = loan.interest_rate / 100 / 12;
    const months = Math.ceil((new Date(loan.maturity_date).getTime() - new Date(loan.start_date).getTime()) / (1000*60*60*24*30.4));
    const pmt = r === 0 ? loan.principal_amount / months : loan.principal_amount * r * Math.pow(1+r,months) / (Math.pow(1+r,months)-1);
    const lines: { period:string; principal:number; interest:number; payment:number; balance:number }[] = [];
    let balance = loan.principal_amount;
    for (let i = 0; i < Math.min(months,60); i++) {
      const interest = balance * r;
      const principal = Math.min(pmt - interest, balance);
      balance = Math.max(0, balance - principal);
      lines.push({ period: format(addMonths(parseISO(loan.start_date),i),'MMM yyyy'), principal, interest, payment:principal+interest, balance });
      if (balance <= 0) break;
    }
    return lines;
  };

  const toggle = (id: string) => setExpanded(p => { const s=new Set(p); s.has(id)?s.delete(id):s.add(id); return s; });

  const filtered = useMemo(() => loans.filter(l => {
    if (typeFilter !== 'all' && l.loan_type !== typeFilter) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.partner_name??'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [loans, typeFilter, statusFilter, search]);

  const totals = useMemo(() => ({
    principal: filtered.reduce((s,l)=>s+l.principal_amount,0),
    outstanding: filtered.reduce((s,l)=>s+l.outstanding_balance,0),
    paid: filtered.reduce((s,l)=>s+l.total_paid,0),
  }), [filtered]);

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <PiggyBank className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Loans</h2>
        <Badge variant="outline">{filtered.length} loans</Badge>
        <div className="flex-1" />
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="w-40 h-8 text-sm" />
        <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="given">Given</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={()=>exportToExcel(filtered.map(l=>({'#':l.loan_number,Name:l.name,Type:l.loan_type,Partner:l.partner_name??'',Principal:l.principal_amount,Outstanding:l.outstanding_balance,Currency:l.currency,'Rate':l.interest_rate+'%',Status:l.status})),'Loans','loans.xlsx')}><Download className="h-4 w-4 mr-1"/>Export</Button>
        {canManage && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />New Loan</Button>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{label:'Total Principal',val:totals.principal,cls:''},{label:'Outstanding Balance',val:totals.outstanding,cls:'text-amber-700'},{label:'Total Repaid',val:totals.paid,cls:'text-emerald-700'}].map(k=>(
          <Card key={k.label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{k.label}</p><p className={`text-base font-bold mt-0.5 ${k.cls}`}>{formatNumber(k.val)}</p></CardContent></Card>
        ))}
      </div>

      {loading ? <PageLoader compact /> : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <PiggyBank className="h-8 w-8 mx-auto mb-2 opacity-30" /><p>No loans found</p>
          {canManage && <Button size="sm" className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-1"/>Add Loan</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(loan => {
            const amort = expanded.has(loan.id) ? buildAmortization(loan) : [];
            return (
              <Card key={loan.id} className="overflow-hidden">
                <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30" onClick={()=>toggle(loan.id)}>
                  {expanded.has(loan.id)?<ChevronDown className="h-4 w-4 text-muted-foreground"/>:<ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                  <Badge variant="outline" className="font-mono text-xs">{loan.loan_number}</Badge>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{loan.name}</div>
                    {loan.partner_name && <div className="text-xs text-muted-foreground">{loan.partner_name}</div>}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Principal: <span className="font-medium text-foreground">{loan.currency} {formatNumber(loan.principal_amount)}</span></span>
                    <span>Outstanding: <span className="font-medium text-amber-600">{loan.currency} {formatNumber(loan.outstanding_balance)}</span></span>
                    <span>Rate: <span className="font-medium">{loan.interest_rate}%</span></span>
                    <span>Due: <span className="font-medium">{loan.maturity_date}</span></span>
                  </div>
                  <Badge className={`text-xs ${STATUS_STYLES[loan.status]??''}`}>{loan.status}</Badge>
                  {canManage && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e=>{e.stopPropagation();openEdit(loan);}}><Pencil className="h-3.5 w-3.5"/></Button>}
                </div>
                {expanded.has(loan.id) && amort.length > 0 && (
                  <div className="border-t">
                    <div className="p-2 bg-muted/20 text-xs text-muted-foreground font-medium px-4">Amortization Schedule</div>
                    <Table><TableHeader><TableRow className="text-xs bg-muted/20">
                      <TableHead>Period</TableHead><TableHead className="text-right">Principal</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Payment</TableHead><TableHead className="text-right">Balance</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{amort.map((l,i)=>(
                      <TableRow key={l.period} className={`text-xs ${i%2!==0?'bg-muted/10':''}`}>
                        <TableCell className="py-1.5">{l.period}</TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums">{formatNumber(l.principal)}</TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums text-amber-600">{formatNumber(l.interest)}</TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums font-medium">{formatNumber(l.payment)}</TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">{formatNumber(l.balance)}</TableCell>
                      </TableRow>
                    ))}</TableBody></Table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?'Edit':'New'} Loan</DialogTitle><DialogDescription>Track loan details and generate an amortization schedule.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>Loan # *</Label><Input value={form.loan_number} onChange={e=>sf('loan_number',e.target.value)} /></div>
            <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={e=>sf('name',e.target.value)} /></div>
            <div className="space-y-1"><Label>Type</Label>
              <Select value={form.loan_type} onValueChange={v=>sf('loan_type',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="received">Received (Liability)</SelectItem><SelectItem value="given">Given (Asset)</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1"><Label>Partner / Lender</Label><Input value={form.partner_name} onChange={e=>sf('partner_name',e.target.value)} /></div>
            <div className="space-y-1"><Label>Principal Amount *</Label><Input type="number" value={form.principal_amount} onChange={e=>sf('principal_amount',e.target.value)} /></div>
            <div className="space-y-1"><Label>Currency</Label><Select value={form.currency} onValueChange={v=>sf('currency',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Interest Rate (%)</Label><Input type="number" step="0.01" value={form.interest_rate} onChange={e=>sf('interest_rate',e.target.value)} /></div>
            <div className="space-y-1"><Label>Interest Type</Label><Select value={form.interest_type} onValueChange={v=>sf('interest_type',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="variable">Variable</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)} /></div>
            <div className="space-y-1"><Label>Maturity Date</Label><Input type="date" value={form.maturity_date} onChange={e=>sf('maturity_date',e.target.value)} /></div>
            <div className="space-y-1"><Label>Payment Frequency</Label><Select value={form.payment_frequency} onValueChange={v=>sf('payment_frequency',v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FREQUENCIES.map(f=><SelectItem key={f} value={f}>{f.replace('_',' ')}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2 space-y-1"><Label>Description</Label><Input value={form.description} onChange={e=>sf('description',e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setFormOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving} data-testid="button-save-loan">{saving&&<Loader2 className="h-4 w-4 mr-2 animate-spin"/>}{editing?'Save':'Create'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
