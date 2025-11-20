import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWallet } from '@/context/wallet/WalletContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

const currencyFmt = (c: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'NGN', currencyDisplay: 'narrowSymbol' }).format((c||0)/100);

const AdminWalletDetail: React.FC = () => {
  const params = useParams();
  const userId = params.userId as string;
  const { admin } = useWallet();
  const [wallet, setWallet] = useState<any | null>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [currency, setCurrency] = useState('NGN');
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDirection, setAdjDirection] = useState<'credit'|'debit'>('credit');

  const load = async () => {
    const { wallet: w, txns: t } = await admin.getWalletDetail(userId);
    setWallet(w);
    setTxns(t);
    setCurrency(w?.currency || 'NGN');
  };

  useEffect(() => { if (userId) load(); }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const id = setInterval(() => { load(); }, 60000);
    return () => clearInterval(id);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`admin_wallet_detail_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${userId}` }, () => load());
    ch.subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [userId]);

  const totals = useMemo(() => ({
    earned: txns.filter(t=>t.type==='earning'&&t.status==='posted').reduce((a,b)=>a+(Number(b.amountCents)||0),0),
    paid: txns.filter(t=>t.type==='payout_paid'&&t.status==='posted').reduce((a,b)=>a+(Number(b.amountCents)||0),0),
  }), [txns]);

  const onAdjust = async () => {
    const cents = Math.round(Number(adjAmount||0)*100);
    const res = await admin.adjustBalance(userId, adjDirection, cents);
    if (res) {
      setAdjOpen(false);
      setAdjAmount('');
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{currencyFmt(Number(wallet?.balance_cents)||0, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Earned</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{currencyFmt(Number(wallet?.total_earned_cents)||0, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Paid Out</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{currencyFmt(Number(wallet?.total_paid_out_cents)||0, currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Payouts</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{currencyFmt(Number(wallet?.pending_payout_cents)||0, currency)}</CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
          <DialogTrigger asChild>
            <Button>Adjust Balance</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adjustment</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm">Direction</label>
                <div className="flex gap-2">
                  <Button variant={adjDirection==='credit'?'default':'outline'} onClick={()=>setAdjDirection('credit')}>Credit</Button>
                  <Button variant={adjDirection==='debit'?'default':'outline'} onClick={()=>setAdjDirection('debit')}>Debit</Button>
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm">Amount ({currency})</label>
                <Input type="number" min="0" step="0.01" value={adjAmount} onChange={e=>setAdjAmount(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onAdjust} disabled={!adjAmount}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t:any) => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.createdAt || t.created_at).toLocaleString()}</TableCell>
                    <TableCell>{t.type}</TableCell>
                    <TableCell>{t.status}</TableCell>
                    <TableCell>{currencyFmt(Number(t.amountCents||t.amount_cents)||0, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminWalletDetail;
