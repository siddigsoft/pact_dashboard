import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { WalletCard } from '@/components/wallet/WalletCard';
import { supabase } from '@/integrations/supabase/client';
import { Search, RefreshCw, Wallet as WalletIcon } from 'lucide-react';

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <WalletIcon className="w-8 h-8" />
            Wallets Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage all enumerator wallets
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Platform Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}</p>
            <p className="text-xs text-muted-foreground mt-1">{filtered.length} active wallets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Withdrawals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}</p>
            <p className="text-xs text-muted-foreground mt-1">Paid to enumerators</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Current Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}</p>
            <p className="text-xs text-muted-foreground mt-1">Available for withdrawal</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by user ID..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-wallets"
          />
        </div>
        <Button variant="outline" onClick={load} data-testid="button-refresh-wallets">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Wallets Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <WalletIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No wallets found</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {search ? 'Try adjusting your search' : 'Wallets will appear here once enumerators complete site visits'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(wallet => (
            <WalletCard
              key={wallet.id}
              wallet={{
                ...wallet,
                balances: wallet.balances || {},
                pendingPayouts: (Number(wallet.totalEarned)||0) - (Number(wallet.totalWithdrawn)||0) - (wallet.balances?.[currency] || 0),
              }}
              currency={currency}
              onClick={(userId) => navigate(`/admin/wallets/${userId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminWallets;
