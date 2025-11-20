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
  const { admin } = useWallet();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const navigate = useNavigate();

  const load = async () => {
    const data = await admin.listWallets();
    setRows(data || []);
    const c = data && data[0]?.currency ? data[0].currency : 'NGN';
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
    return rows.filter(r => (r.owner_name || r.user_id || '').toString().toLowerCase().includes(s));
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Total Platform Earnings</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.total_earned_cents)||0),0), currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Payouts</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.total_paid_out_cents)||0),0), currency)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Payouts</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.pending_payout_cents)||0),0), currency)}</CardContent>
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
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/admin/wallets/${r.user_id}`)}>
                    <TableCell>{r.owner_name || r.user_id}</TableCell>
                    <TableCell>{fmt(Number(r.balance_cents)||0, r.currency||currency)}</TableCell>
                    <TableCell>{fmt(Number(r.total_earned_cents)||0, r.currency||currency)}</TableCell>
                    <TableCell>{fmt(Number(r.total_paid_out_cents)||0, r.currency||currency)}</TableCell>
                    <TableCell>{fmt(Number(r.pending_payout_cents)||0, r.currency||currency)}</TableCell>
                    <TableCell>{r.updated_at ? new Date(r.updated_at).toLocaleString() : '-'}</TableCell>
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
