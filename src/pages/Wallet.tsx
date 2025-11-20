import React, { useMemo, useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';

const formatCurrency = (cents: number, currency: string) => {
  const amt = (cents || 0) / 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'NGN', currencyDisplay: 'narrowSymbol' }).format(amt);
};

const WalletPage: React.FC = () => {
  const { currentUser } = useAppContext();
  const { summary, transactions, earnings, dateRange, setDateRange, loading, requestPayout } = useWallet();
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bank' | 'mobile_money' | 'manual'>('bank');
  const [destination, setDestination] = useState('');

  const currency = summary?.currency || 'NGN';

  const canWithdraw = useMemo(() => {
    const n = Math.round(Number((Number(amount || 0) * 100).toFixed(0)));
    return !!summary && n > 0 && n <= (summary.balanceCents - (summary.pendingPayoutCents || 0));
  }, [amount, summary]);

  const onSubmitPayout = async () => {
    const cents = Math.round(Number(amount) * 100);
    const dest = destination ? (() => { try { return JSON.parse(destination); } catch { return { note: destination }; } })() : {};
    const ok = await requestPayout(cents, method, dest);
    if (ok) {
      setPayoutOpen(false);
      setAmount('');
      setDestination('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Current Balance</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(summary?.balanceCents || 0, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Earnings</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(summary?.pendingEarningsCents || 0, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Completed Earnings</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(summary?.completedEarningsCents || 0, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lifetime Earnings</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatCurrency(summary?.lifetimeEarningsCents || 0, currency)}</CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
        <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
          <DialogTrigger asChild>
            <Button>Withdraw</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Withdrawal</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm">Amount ({currency})</label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Method</label>
                <Select value={method} onValueChange={v => setMethod(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Destination (JSON or note)</label>
                <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder='{"account":"0123456789","bank":"GTB"}' />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!canWithdraw} onClick={onSubmitPayout}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="earnings">
        <TabsList>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        <TabsContent value="earnings">
          <Card>
            <CardHeader><CardTitle>Earnings Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Visit Code</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earnings.map(e => (
                      <TableRow key={e.visitId + e.visitCode}>
                        <TableCell>{e.siteName || '-'}</TableCell>
                        <TableCell>{e.visitCode || '-'}</TableCell>
                        <TableCell>{e.visitDate ? new Date(e.visitDate).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>
                          <Badge variant={e.status === 'approved' ? 'default' : e.status === 'pending' ? 'secondary' : 'destructive'}>
                            {e.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(e.earningAmountCents, currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transactions">
          <Card>
            <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map(t => (
                      <TableRow key={t.id}>
                        <TableCell>{new Date(t.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{t.type}</TableCell>
                        <TableCell>{t.status}</TableCell>
                        <TableCell>{t.memo || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(t.amountCents * (t.type === 'adjustment_debit' || t.type === 'payout_paid' ? -1 : 1), currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WalletPage;
