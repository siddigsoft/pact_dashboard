import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DollarSign, 
  Plus, 
  RefreshCw, 
  TrendingUp, 
  Building2,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  Edit,
  Save,
  X,
  Info
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfDay, isToday, isYesterday } from 'date-fns';

interface ExchangeRateRecord {
  id: string;
  source_bank: string;
  rate_type: string;
  usd_to_sdg: number;
  fetched_at: string;
  is_active: boolean;
  created_at: string;
}

const BANK_OPTIONS = [
  { value: 'bank_of_khartoum', label: 'Bank of Khartoum' },
  { value: 'bank_of_sudan', label: 'Bank of Sudan' },
  { value: 'faisal_islamic', label: 'Faisal Islamic Bank' },
  { value: 'parallel_market', label: 'Parallel Market' },
];

const RATE_TYPE_OPTIONS = [
  { value: 'buy', label: 'Buy Rate' },
  { value: 'sell', label: 'Sell Rate' },
  { value: 'mid', label: 'Mid Rate' },
];

export default function ExchangeRates() {
  const [rates, setRates] = useState<ExchangeRateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  
  const [newRate, setNewRate] = useState({
    source_bank: 'bank_of_khartoum',
    rate_type: 'mid',
    usd_to_sdg: '',
    rate_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchRates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setRates(data || []);
    } catch (err) {
      console.error('Error fetching rates:', err);
      toast.error('Failed to load exchange rates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const handleAddRate = async () => {
    if (!newRate.usd_to_sdg || parseFloat(newRate.usd_to_sdg) <= 0) {
      toast.error('Please enter a valid exchange rate');
      return;
    }

    try {
      setSaving(true);
      
      const rateDate = new Date(newRate.rate_date);
      rateDate.setHours(12, 0, 0, 0);

      const { data: existing } = await supabase
        .from('exchange_rates')
        .select('id')
        .eq('source_bank', newRate.source_bank)
        .eq('rate_type', newRate.rate_type)
        .gte('fetched_at', startOfDay(rateDate).toISOString())
        .lt('fetched_at', new Date(rateDate.getTime() + 24 * 60 * 60 * 1000).toISOString())
        .single();

      if (existing) {
        const { error: updateError } = await supabase
          .from('exchange_rates')
          .update({
            usd_to_sdg: parseFloat(newRate.usd_to_sdg),
            fetched_at: rateDate.toISOString(),
            is_active: true,
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
        toast.success('Exchange rate updated');
      } else {
        const { error: insertError } = await supabase
          .from('exchange_rates')
          .insert({
            source_bank: newRate.source_bank,
            rate_type: newRate.rate_type,
            usd_to_sdg: parseFloat(newRate.usd_to_sdg),
            fetched_at: rateDate.toISOString(),
            is_active: true,
          });

        if (insertError) throw insertError;
        toast.success('Exchange rate added');
      }

      setNewRate(prev => ({ ...prev, usd_to_sdg: '' }));
      fetchRates();
    } catch (err: any) {
      console.error('Error saving rate:', err);
      toast.error(err.message || 'Failed to save exchange rate');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRate = async (id: string) => {
    if (editValue <= 0) {
      toast.error('Please enter a valid rate');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('exchange_rates')
        .update({ usd_to_sdg: editValue })
        .eq('id', id);

      if (error) throw error;
      toast.success('Rate updated');
      setEditingId(null);
      fetchRates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update rate');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rate?')) return;

    try {
      const { error } = await supabase
        .from('exchange_rates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Rate deleted');
      fetchRates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete rate');
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentStatus ? 'Rate deactivated' : 'Rate activated');
      fetchRates();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const getTodaysRate = () => {
    const todayRates = rates.filter(r => 
      r.is_active && 
      isToday(parseISO(r.fetched_at)) &&
      r.source_bank === 'bank_of_khartoum'
    );
    if (todayRates.length > 0) {
      const midRate = todayRates.find(r => r.rate_type === 'mid');
      return midRate?.usd_to_sdg || todayRates[0].usd_to_sdg;
    }
    const activeRates = rates.filter(r => r.is_active && r.source_bank === 'bank_of_khartoum');
    if (activeRates.length > 0) {
      const midRate = activeRates.find(r => r.rate_type === 'mid');
      return midRate?.usd_to_sdg || activeRates[0].usd_to_sdg;
    }
    return null;
  };

  const getActiveRatesByBank = () => {
    const grouped: Record<string, { buy?: number; sell?: number; mid?: number; date?: string }> = {};
    
    rates.filter(r => r.is_active).forEach(rate => {
      if (!grouped[rate.source_bank]) {
        grouped[rate.source_bank] = {};
      }
      grouped[rate.source_bank][rate.rate_type as 'buy' | 'sell' | 'mid'] = rate.usd_to_sdg;
      if (!grouped[rate.source_bank].date || new Date(rate.fetched_at) > new Date(grouped[rate.source_bank].date!)) {
        grouped[rate.source_bank].date = rate.fetched_at;
      }
    });

    return grouped;
  };

  const formatDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d, yyyy');
  };

  const getBankLabel = (bank: string) => {
    return BANK_OPTIONS.find(b => b.value === bank)?.label || bank;
  };

  const todaysRate = getTodaysRate();
  const activeRatesByBank = getActiveRatesByBank();

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Exchange Rates Management
          </h1>
          <p className="text-muted-foreground">
            Manage USD to SDG exchange rates for cost calculations
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={fetchRates} 
          disabled={loading}
          data-testid="button-refresh-rates"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Today's Rate (Bank of Khartoum)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaysRate ? (
              <div className="text-2xl font-bold text-primary">
                {todaysRate.toLocaleString()} SDG
                <span className="text-sm font-normal text-muted-foreground ml-1">/ USD</span>
              </div>
            ) : (
              <div className="text-lg text-muted-foreground">No rate set</div>
            )}
          </CardContent>
        </Card>

        {Object.entries(activeRatesByBank).slice(0, 3).map(([bank, rates]) => (
          <Card key={bank}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {getBankLabel(bank)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {rates.mid?.toLocaleString() || rates.buy?.toLocaleString() || 'N/A'} SDG
              </div>
              {rates.date && (
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDate(rates.date)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="add" className="space-y-4">
        <TabsList>
          <TabsTrigger value="add" data-testid="tab-add-rate">
            <Plus className="h-4 w-4 mr-2" />
            Add Rate
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-rate-history">
            <Clock className="h-4 w-4 mr-2" />
            Rate History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Exchange Rate
              </CardTitle>
              <CardDescription>
                Enter the current exchange rate for money transfers. Bank of Khartoum parallel market rates are typically used.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  The parallel market rate for Bank of Khartoum is typically much higher than the official rate. 
                  Enter the actual rate you use for money transfers.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source_bank">Bank / Source</Label>
                  <Select
                    value={newRate.source_bank}
                    onValueChange={(value) => setNewRate(prev => ({ ...prev, source_bank: value }))}
                  >
                    <SelectTrigger id="source_bank" data-testid="select-source-bank">
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANK_OPTIONS.map(bank => (
                        <SelectItem key={bank.value} value={bank.value}>
                          {bank.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate_type">Rate Type</Label>
                  <Select
                    value={newRate.rate_type}
                    onValueChange={(value) => setNewRate(prev => ({ ...prev, rate_type: value }))}
                  >
                    <SelectTrigger id="rate_type" data-testid="select-rate-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RATE_TYPE_OPTIONS.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate_date">Date</Label>
                  <Input
                    id="rate_date"
                    type="date"
                    value={newRate.rate_date}
                    onChange={(e) => setNewRate(prev => ({ ...prev, rate_date: e.target.value }))}
                    data-testid="input-rate-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="usd_to_sdg">Rate (SDG per 1 USD)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="usd_to_sdg"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 3500"
                      value={newRate.usd_to_sdg}
                      onChange={(e) => setNewRate(prev => ({ ...prev, usd_to_sdg: e.target.value }))}
                      data-testid="input-exchange-rate"
                    />
                    <Button 
                      onClick={handleAddRate} 
                      disabled={saving || !newRate.usd_to_sdg}
                      data-testid="button-add-rate"
                    >
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="text-sm text-muted-foreground">
                <strong>Quick Reference:</strong> If 1 USD = 3,500 SDG at Bank of Khartoum today, enter "3500".
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Exchange Rate History
              </CardTitle>
              <CardDescription>
                View and manage all recorded exchange rates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : rates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No exchange rates recorded yet. Add your first rate above.
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bank / Source</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Rate (SDG/USD)</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rates.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell className="font-medium">
                            {getBankLabel(rate.source_bank)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {RATE_TYPE_OPTIONS.find(t => t.value === rate.rate_type)?.label || rate.rate_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {editingId === rate.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editValue}
                                  onChange={(e) => setEditValue(parseFloat(e.target.value))}
                                  className="w-24 h-8"
                                  data-testid={`input-edit-rate-${rate.id}`}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleUpdateRate(rate.id)}
                                  disabled={saving}
                                  data-testid={`button-save-rate-${rate.id}`}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                  data-testid={`button-cancel-edit-${rate.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <span className="font-mono">{rate.usd_to_sdg.toLocaleString()}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {formatDate(rate.fetched_at)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={rate.is_active ? 'default' : 'secondary'}
                              className="cursor-pointer"
                              onClick={() => handleToggleActive(rate.id, rate.is_active)}
                              data-testid={`badge-status-${rate.id}`}
                            >
                              {rate.is_active ? (
                                <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
                              ) : (
                                <><AlertCircle className="h-3 w-3 mr-1" /> Inactive</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(rate.id);
                                  setEditValue(rate.usd_to_sdg);
                                }}
                                disabled={editingId !== null}
                                data-testid={`button-edit-rate-${rate.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteRate(rate.id)}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-rate-${rate.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How Exchange Rates Are Used
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <ul className="space-y-2 text-sm">
            <li>
              <strong>Cost Predictions:</strong> When calculating predicted costs for site visits, 
              the system uses the most recent active exchange rate to convert costs between USD and SDG.
            </li>
            <li>
              <strong>Financial Reports:</strong> All financial reports can display amounts in both currencies 
              using the rate from the transaction date.
            </li>
            <li>
              <strong>Money Transfers:</strong> For Bank of Khartoum transfers, use the parallel market rate 
              (typically 3,500+ SDG per USD) rather than the official rate.
            </li>
            <li>
              <strong>Priority:</strong> The system uses Bank of Khartoum mid rate as the primary rate, 
              falling back to other banks if unavailable.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
