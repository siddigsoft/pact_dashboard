import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

const fmt = (c: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'NGN', currencyDisplay: 'narrowSymbol' }).format((c||0)/100);

const AdminWallets: React.FC = () => {
  const { listWallets } = useWallet();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('SDG');
  const navigate = useNavigate();

  const load = async () => {
    const data = await listWallets();
    setRows(data || []);
    const c = data && data[0]?.balances ? Object.keys(data[0].balances)[0] : 'SDG';
    setCurrency(c);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const id = setInterval(() => { load(); }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('admin_wallets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load());
    ch.subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(r => (r.userId || '').toString().toLowerCase().includes(s));
  }, [rows, search]);

  const getBalance = (wallet: any, curr: string) => (wallet.balances?.[curr] || 0) * 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Platform Earnings</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Withdrawals</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Current Balances</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}</CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Input placeholder="Search by user" value={search} onChange={e=>setSearch(e.target.value)} />
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Wallets</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Total Earned</TableHead>
                  <TableHead>Total Paid Out</TableHead>
                  <TableHead>Pending Payouts</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/admin/wallets/${r.userId}`)}>
                    <TableCell>{r.userId}</TableCell>
                    <TableCell>{fmt(getBalance(r, currency), currency)}</TableCell>
                    <TableCell>{fmt((Number(r.totalEarned)||0)*100, currency)}</TableCell>
                    <TableCell>{fmt((Number(r.totalWithdrawn)||0)*100, currency)}</TableCell>
                    <TableCell>{fmt((Number(r.totalEarned)||0)*100 - (Number(r.totalWithdrawn)||0)*100 - getBalance(r, currency), currency)}</TableCell>
                    <TableCell>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'}</TableCell>
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

export default AdminWallets;
