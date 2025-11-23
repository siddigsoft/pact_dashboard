import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WalletCard } from '@/components/wallet/WalletCard';
import { supabase } from '@/integrations/supabase/client';
import { Search, RefreshCw, Wallet as WalletIcon, Zap, TrendingUp, Activity, DollarSign } from 'lucide-react';

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
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <WalletIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Wallets Management</h1>
            <p className="text-sm text-muted-foreground">
              Financial Operations Command Center
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GradientStatCard
          title="Total Platform Earnings"
          value={fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
          subtitle={`${filtered.length} active wallets`}
          icon={TrendingUp}
          color="blue"
          data-testid="card-stat-total-earnings"
        />

        <GradientStatCard
          title="Total Withdrawals"
          value={fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
          subtitle="Paid to enumerators"
          icon={Activity}
          color="purple"
          data-testid="card-stat-total-withdrawals"
        />

        <GradientStatCard
          title="Current Balances"
          value={fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
          subtitle="Available for withdrawal"
          icon={WalletIcon}
          color="cyan"
          data-testid="card-stat-current-balances"
        />
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
          <Input 
            placeholder="Search wallet ID..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-wallets"
          />
        </div>
        <Button 
          variant="outline" 
          onClick={load} 
          data-testid="button-refresh-wallets"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

        {/* Wallets Grid - Cyber Style */}
        {filtered.length === 0 ? (
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
            <Card className="relative bg-gradient-to-br from-slate-900/90 to-blue-900/50 backdrop-blur-xl border border-blue-500/30">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl mb-6">
                  <WalletIcon className="w-16 h-16 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-3">
                  No Wallets Detected
                </h3>
                <p className="text-blue-300/70 text-center max-w-md text-lg">
                  {search ? 'Adjust search parameters' : 'Wallet data will synchronize once enumerators complete site visits'}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
