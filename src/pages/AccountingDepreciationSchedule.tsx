import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RefreshCw, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';
import { format, addMonths, parseISO } from 'date-fns';

interface Asset {
  id: string; asset_code: string; asset_name: string; category: string;
  purchase_cost: number; salvage_value: number; useful_life_months: number;
  depreciation_method: string; acquisition_date: string; status: string;
  accumulated_depreciation: number; book_value: number; currency: string;
}

interface ScheduleLine { period: string; openingNBV: number; depreciation: number; closingNBV: number }

export default function AccountingDepreciationSchedule() {
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [assets, setAssets]       = useState<Asset[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [forecastMonths, setForecastMonths] = useState(12);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('acct_fixed_assets' as any)
      .select('id,asset_code,asset_name,category,purchase_cost,salvage_value,useful_life_months,depreciation_method,acquisition_date,status,accumulated_depreciation,book_value,currency')
      .order('acquisition_date', { ascending: false })
      .limit(500);
    setAssets((data ?? []) as Asset[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => assets.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (catFilter !== 'all' && a.category !== catFilter) return false;
    if (search && !a.asset_name.toLowerCase().includes(search.toLowerCase()) && !a.asset_code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [assets, statusFilter, catFilter, search]);

  const categories = [...new Set(assets.map(a => a.category).filter(Boolean))].sort();

  const buildSchedule = (asset: Asset): ScheduleLine[] => {
    const depreciableAmount = asset.purchase_cost - (asset.salvage_value ?? 0);
    const monthlyDep = asset.useful_life_months > 0 ? depreciableAmount / asset.useful_life_months : 0;
    const lines: ScheduleLine[] = [];
    let nbv = asset.book_value ?? (asset.purchase_cost - (asset.accumulated_depreciation ?? 0));
    const startDate = new Date();
    for (let i = 0; i < forecastMonths; i++) {
      const period = format(addMonths(startDate, i), 'MMM yyyy');
      const dep = Math.min(monthlyDep, Math.max(0, nbv - (asset.salvage_value ?? 0)));
      lines.push({ period, openingNBV: nbv, depreciation: dep, closingNBV: nbv - dep });
      nbv -= dep;
      if (nbv <= (asset.salvage_value ?? 0)) break;
    }
    return lines;
  };

  const toggle = (id: string) => setExpanded(p => { const s = new Set(p); s.has(id)?s.delete(id):s.add(id); return s; });

  const totalNBV = filtered.reduce((s,a) => s + (a.book_value ?? 0), 0);
  const totalAccumDep = filtered.reduce((s,a) => s + (a.accumulated_depreciation ?? 0), 0);
  const totalCost = filtered.reduce((s,a) => s + a.purchase_cost, 0);

  const exportData = () => exportToExcel(
    filtered.flatMap(a => buildSchedule(a).map(l => ({
      'Asset Code':a.asset_code,'Asset Name':a.asset_name,'Category':a.category,
      'Period':l.period,'Opening NBV':l.openingNBV.toFixed(2),'Depreciation':l.depreciation.toFixed(2),'Closing NBV':l.closingNBV.toFixed(2),
    }))), 'Depreciation Schedule','depreciation-schedule.xlsx'
  );

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Depreciation Schedule</h2>
        <Badge variant="outline">{filtered.length} assets</Badge>
        <div className="flex-1" />
        <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search asset…" className="w-40 h-8 text-sm" />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-36 h-8"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disposed">Disposed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(forecastMonths)} onValueChange={v=>setForecastMonths(Number(v))}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[6,12,24,36,60].map(m=><SelectItem key={m} value={String(m)}>Next {m} months</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Total Cost',             val:totalCost,    cls:'' },
          { label:'Accumulated Depreciation',val:totalAccumDep,cls:'text-amber-700' },
          { label:'Net Book Value',          val:totalNBV,     cls:'text-indigo-700' },
        ].map(k=>(
          <Card key={k.label}><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className={`text-base font-bold mt-0.5 ${k.cls}`}>{formatNumber(k.val)}</p>
          </CardContent></Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No fixed assets found</p>
          <p className="text-sm mt-1">Assets must be registered in Fixed Assets first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(asset => {
            const schedule = buildSchedule(asset);
            const isOpen = expanded.has(asset.id);
            return (
              <Card key={asset.id} className="overflow-hidden">
                <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30" onClick={()=>toggle(asset.id)}>
                  {isOpen?<ChevronDown className="h-4 w-4 text-muted-foreground"/>:<ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                  <Badge variant="outline" className="font-mono text-xs">{asset.asset_code}</Badge>
                  <div className="flex-1 font-medium text-sm">{asset.asset_name}</div>
                  <Badge variant="secondary" className="text-xs">{asset.category}</Badge>
                  <div className="flex gap-6 text-xs text-muted-foreground">
                    <span>Cost: <span className="font-medium text-foreground">{formatNumber(asset.purchase_cost)}</span></span>
                    <span>Accum. Dep: <span className="font-medium text-amber-600">{formatNumber(asset.accumulated_depreciation??0)}</span></span>
                    <span>NBV: <span className="font-medium text-indigo-600">{formatNumber(asset.book_value??0)}</span></span>
                  </div>
                  <Badge variant={asset.status==='active'?'default':'outline'} className="text-xs">{asset.status}</Badge>
                </div>
                {isOpen && (
                  <div className="border-t">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 text-xs">
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Opening NBV</TableHead>
                          <TableHead className="text-right">Monthly Dep.</TableHead>
                          <TableHead className="text-right">Closing NBV</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedule.map((l,i)=>(
                          <TableRow key={l.period} className={`text-xs ${i%2!==0?'bg-muted/10':''}`}>
                            <TableCell className="py-1.5">{l.period}</TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums">{formatNumber(l.openingNBV)}</TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums text-amber-600">({formatNumber(l.depreciation)})</TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums font-medium text-indigo-600">{formatNumber(l.closingNBV)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
