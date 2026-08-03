/**
 * AccountingAnnualBudget.tsx
 *
 * Organisation-wide Annual Budget management.
 * Supports: org-level envelope → hub breakdown → donor/fund split → account mapping.
 * Status flow: draft → submitted → approved → active → closed
 */

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Edit2, CheckCircle2, AlertTriangle, Download, BarChart3, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

interface AnnualBudget { id: string; fiscal_year_code: string; fiscal_year_id: string; total_amount: number; currency: string; status: string; notes: string | null; approved_by: string | null; approved_at: string | null; created_at: string }
interface BudgetLine { id: string; budget_id: string; hub: string | null; donor: string | null; fund_id: string | null; account_code: string | null; category: string; allocated_amount: number; spent_amount: number; currency: string; notes: string | null }
interface FiscalYear { id: string; code: string; status: string }
interface Fund { id: string; code: string; name_en: string }

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  active:    'bg-emerald-100 text-emerald-700',
  closed:    'bg-slate-100 text-slate-500',
};

const HUBS = ['Blue Nile', 'South Kordofan', 'North Kordofan', 'East Sudan', 'Khartoum', 'Kassala', 'Gadaref', 'Other'];
const CATEGORIES = ['Personnel', 'Travel', 'Equipment', 'Supplies', 'Contractual', 'Other Direct', 'Indirect'];

export default function AccountingAnnualBudget() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const canEdit    = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const canApprove = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);

  const [budgets, setBudgets] = useState<AnnualBudget[]>([]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [selected, setSelected] = useState<AnnualBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New budget dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ fiscal_year_id: '', total_amount: '', currency: 'SDG', notes: '' });

  // New line dialog
  const [lineOpen, setLineOpen] = useState(false);
  const [lineForm, setLineForm] = useState({ hub: '', donor: '', fund_id: '', account_code: '', category: '', allocated_amount: '', currency: 'SDG', notes: '' });

  async function load() {
    setLoading(true);
    const [bRes, yRes, fRes] = await Promise.all([
      supabase.from('acct_annual_budgets').select('*').order('created_at', { ascending: false }),
      supabase.from('acct_fiscal_years').select('id,code,status').order('code', { ascending: false }),
      supabase.from('acct_funds').select('id,code,name_en').eq('is_active', true).order('code'),
    ]);
    setBudgets((bRes.data ?? []) as AnnualBudget[]);
    setYears((yRes.data ?? []) as FiscalYear[]);
    setFunds((fRes.data ?? []) as Fund[]);
    setLoading(false);
  }

  async function loadLines(budgetId: string) {
    const { data } = await supabase
      .from('acct_annual_budget_lines')
      .select('*')
      .eq('budget_id', budgetId)
      .order('category');
    setLines((data ?? []) as BudgetLine[]);
  }

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated]);
  useEffect(() => { if (selected) loadLines(selected.id); else setLines([]); }, [selected]);

  async function createBudget() {
    if (!newForm.fiscal_year_id || !newForm.total_amount) { toast.error('Year and total amount required'); return; }
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const fy = years.find(y => y.id === newForm.fiscal_year_id);
      const { data, error } = await supabase
        .from('acct_annual_budgets')
        .insert({
          fiscal_year_id: newForm.fiscal_year_id,
          fiscal_year_code: fy?.code ?? '',
          total_amount: parseFloat(newForm.total_amount),
          currency: newForm.currency,
          status: 'draft',
          notes: newForm.notes || null,
          created_by: sess?.session?.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success('Annual budget created');
      setNewOpen(false);
      setNewForm({ fiscal_year_id: '', total_amount: '', currency: 'SDG', notes: '' });
      await load();
      setSelected(data as AnnualBudget);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function addLine() {
    if (!selected || !lineForm.category || !lineForm.allocated_amount) { toast.error('Category and amount required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('acct_annual_budget_lines').insert({
        budget_id: selected.id,
        hub: lineForm.hub || null,
        donor: lineForm.donor || null,
        fund_id: lineForm.fund_id || null,
        account_code: lineForm.account_code || null,
        category: lineForm.category,
        allocated_amount: parseFloat(lineForm.allocated_amount),
        spent_amount: 0,
        currency: lineForm.currency,
        notes: lineForm.notes || null,
      });
      if (error) throw error;
      toast.success('Budget line added');
      setLineOpen(false);
      setLineForm({ hub: '', donor: '', fund_id: '', account_code: '', category: '', allocated_amount: '', currency: 'SDG', notes: '' });
      await loadLines(selected.id);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function changeStatus(budget: AnnualBudget, nextStatus: string) {
    const { data: sess } = await supabase.auth.getSession();
    const update: any = { status: nextStatus };
    if (nextStatus === 'approved') { update.approved_by = sess?.session?.user?.id; update.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from('acct_annual_budgets').update(update).eq('id', budget.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Budget ${nextStatus}`);
    await load();
    setSelected(s => s?.id === budget.id ? { ...s, ...update } : s);
  }

  function exportLines() {
    if (!lines.length) return;
    downloadCsv(`budget_lines_${selected?.fiscal_year_code}.csv`, [
      ['Hub', 'Donor', 'Fund', 'Account Code', 'Category', 'Allocated', 'Spent', 'Remaining', 'Currency', 'Notes'],
      ...lines.map(l => [l.hub??'', l.donor??'', funds.find(f=>f.id===l.fund_id)?.code??'', l.account_code??'', l.category, l.allocated_amount, l.spent_amount, l.allocated_amount-l.spent_amount, l.currency, l.notes??'']),
    ]);
  }

  // Grouped totals
  const byHub = useMemo(() => {
    const m: Record<string, { allocated: number; spent: number }> = {};
    lines.forEach(l => {
      const h = l.hub ?? 'Unassigned';
      if (!m[h]) m[h] = { allocated: 0, spent: 0 };
      m[h].allocated += l.allocated_amount;
      m[h].spent += l.spent_amount;
    });
    return m;
  }, [lines]);

  const byCategory = useMemo(() => {
    const m: Record<string, { allocated: number; spent: number }> = {};
    lines.forEach(l => {
      if (!m[l.category]) m[l.category] = { allocated: 0, spent: 0 };
      m[l.category].allocated += l.allocated_amount;
      m[l.category].spent += l.spent_amount;
    });
    return m;
  }, [lines]);

  const totalAllocated = lines.reduce((s, l) => s + l.allocated_amount, 0);
  const totalSpent     = lines.reduce((s, l) => s + l.spent_amount, 0);

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Annual Budget</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Organisation-wide budget by fiscal year — broken down by hub, donor, fund, and category.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setNewOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> New Annual Budget
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Budget list */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Budgets</h3>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No annual budgets yet.</p>
          ) : budgets.map(b => (
            <Card
              key={b.id}
              className={`cursor-pointer transition-colors hover:border-primary ${selected?.id === b.id ? 'border-primary ring-1 ring-primary' : ''}`}
              onClick={() => setSelected(b)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{b.fiscal_year_code}</span>
                  <Badge className={`text-xs ${STATUS_COLORS[b.status] ?? ''}`}>{b.status}</Badge>
                </div>
                <div className="text-lg font-mono mt-1">{formatNumber(b.total_amount)} <span className="text-xs text-muted-foreground">{b.currency}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{format(new Date(b.created_at), 'dd MMM yyyy')}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Budget detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Select a budget to view details
            </div>
          ) : (
            <>
              {/* Header */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">{selected.fiscal_year_code} Annual Budget</h3>
                      <p className="text-sm text-muted-foreground">{selected.notes}</p>
                    </div>
                    <div className="flex gap-2">
                      {canEdit && selected.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => changeStatus(selected, 'submitted')}>Submit</Button>
                      )}
                      {canApprove && selected.status === 'submitted' && (
                        <Button size="sm" onClick={() => changeStatus(selected, 'approved')}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                      )}
                      {canApprove && selected.status === 'approved' && (
                        <Button size="sm" onClick={() => changeStatus(selected, 'active')}>Activate</Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div><p className="text-xs text-muted-foreground">Total Envelope</p><p className="font-semibold">{formatNumber(selected.total_amount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total Allocated (lines)</p><p className="font-semibold">{formatNumber(totalAllocated)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total Spent</p><p className={`font-semibold ${totalSpent > totalAllocated ? 'text-red-500' : ''}`}>{formatNumber(totalSpent)}</p></div>
                  </div>
                </CardContent>
              </Card>

              {/* By hub */}
              {Object.keys(byHub).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">By Hub</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(byHub).sort((a,b)=>b[1].allocated-a[1].allocated).map(([hub, v]) => {
                        const pct = v.allocated ? Math.min(100, Math.round(v.spent / v.allocated * 100)) : 0;
                        return (
                          <div key={hub}>
                            <div className="flex justify-between text-xs mb-1">
                              <span>{hub}</span>
                              <span className="text-muted-foreground">{formatNumber(v.spent)} / {formatNumber(v.allocated)} ({pct}%)</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full">
                              <div className={`h-1.5 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lines table */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Budget Lines ({lines.length})</CardTitle>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={exportLines}><Download className="h-4 w-4 mr-1" /> CSV</Button>
                      {canEdit && ['draft', 'active'].includes(selected.status) && (
                        <Button size="sm" onClick={() => setLineOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {lines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No lines yet. Add budget lines to break down the envelope.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b">
                            <th className="text-left pb-2 pr-3">Hub</th>
                            <th className="text-left pb-2 pr-3">Donor</th>
                            <th className="text-left pb-2 pr-3">Category</th>
                            <th className="text-right pb-2 pr-3">Allocated</th>
                            <th className="text-right pb-2 pr-3">Spent</th>
                            <th className="text-right pb-2">Remaining</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map(l => {
                            const rem = l.allocated_amount - l.spent_amount;
                            return (
                              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-1.5 pr-3">{l.hub ?? '—'}</td>
                                <td className="py-1.5 pr-3">{l.donor ?? '—'}</td>
                                <td className="py-1.5 pr-3"><Badge variant="outline" className="text-xs">{l.category}</Badge></td>
                                <td className="py-1.5 pr-3 text-right font-mono">{formatNumber(l.allocated_amount)}</td>
                                <td className="py-1.5 pr-3 text-right font-mono">{formatNumber(l.spent_amount)}</td>
                                <td className={`py-1.5 text-right font-mono ${rem < 0 ? 'text-red-500' : ''}`}>{formatNumber(rem)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* New budget dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Annual Budget</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Fiscal Year</label>
              <Select value={newForm.fiscal_year_id} onValueChange={v => setNewForm(f => ({ ...f, fiscal_year_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select year…" /></SelectTrigger>
                <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.code}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Total Envelope</label>
                <Input type="number" placeholder="0.00" value={newForm.total_amount} onChange={e => setNewForm(f => ({ ...f, total_amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Currency</label>
                <Select value={newForm.currency} onValueChange={v => setNewForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['SDG','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea placeholder="Donor, project reference, etc." value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createBudget} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add line dialog */}
      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Budget Line</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Hub</label>
                <Select value={lineForm.hub} onValueChange={v => setLineForm(f => ({ ...f, hub: v }))}>
                  <SelectTrigger><SelectValue placeholder="All hubs" /></SelectTrigger>
                  <SelectContent>{HUBS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={lineForm.category} onValueChange={v => setLineForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Donor / Funder</label>
                <Input placeholder="e.g. WFP, UNICEF" value={lineForm.donor} onChange={e => setLineForm(f => ({ ...f, donor: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Fund</label>
                <Select value={lineForm.fund_id} onValueChange={v => setLineForm(f => ({ ...f, fund_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                  <SelectContent>{funds.map(fn => <SelectItem key={fn.id} value={fn.id}>{fn.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Allocated Amount</label>
                <Input type="number" placeholder="0.00" value={lineForm.allocated_amount} onChange={e => setLineForm(f => ({ ...f, allocated_amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Currency</label>
                <Select value={lineForm.currency} onValueChange={v => setLineForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['SDG','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Account Code (optional)</label>
              <Input placeholder="e.g. 6100" value={lineForm.account_code} onChange={e => setLineForm(f => ({ ...f, account_code: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input placeholder="Description" value={lineForm.notes} onChange={e => setLineForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineOpen(false)}>Cancel</Button>
            <Button onClick={addLine} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Add Line</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
