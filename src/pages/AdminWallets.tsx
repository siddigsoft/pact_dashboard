import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WalletCard } from '@/components/wallet/WalletCard';
import { supabase } from '@/integrations/supabase/client';
import { Search, RefreshCw, Wallet as WalletIcon, Zap, TrendingUp, Activity } from 'lucide-react';

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
    <div className="relative min-h-screen">
      {/* Cyber Background with Animated Grid */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative space-y-6">
        {/* Futuristic Header */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-gradient-to-r from-slate-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-8 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/50">
                    <WalletIcon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
                      Wallets Management
                      <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 animate-pulse">
                        <Zap className="w-3 h-3 mr-1" />
                        LIVE
                      </Badge>
                    </h1>
                    <p className="text-blue-300/80 mt-2 text-lg font-medium">
                      Cyber-Financial Operations Command Center
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Holographic Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Earnings - Neon Blue */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl blur-lg group-hover:blur-xl transition-all"></div>
            <Card className="relative bg-gradient-to-br from-slate-900/90 via-blue-900/50 to-slate-900/90 backdrop-blur-xl border border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-all">
              <CardHeader className="pb-3 gap-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-blue-300">Total Platform Earnings</CardTitle>
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                  {fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <p className="text-xs text-blue-300/70">{filtered.length} active wallets</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Total Withdrawals - Neon Purple */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl blur-lg group-hover:blur-xl transition-all"></div>
            <Card className="relative bg-gradient-to-br from-slate-900/90 via-purple-900/50 to-slate-900/90 backdrop-blur-xl border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] transition-all">
              <CardHeader className="pb-3 gap-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-purple-300">Total Withdrawals</CardTitle>
                <Activity className="w-5 h-5 text-purple-400" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-300 bg-clip-text text-transparent">
                  {fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                  <p className="text-xs text-purple-300/70">Paid to enumerators</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Balances - Neon Cyan */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl blur-lg group-hover:blur-xl transition-all"></div>
            <Card className="relative bg-gradient-to-br from-slate-900/90 via-cyan-900/50 to-slate-900/90 backdrop-blur-xl border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all">
              <CardHeader className="pb-3 gap-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-cyan-300">Current Balances</CardTitle>
                <WalletIcon className="w-5 h-5 text-cyan-400" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-300 bg-clip-text text-transparent">
                  {fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                  <p className="text-xs text-cyan-300/70">Available for withdrawal</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Cyber Search and Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 z-10" />
            <Input 
              placeholder="SEARCH WALLET ID..." 
              value={search} 
              onChange={e=>setSearch(e.target.value)}
              className="pl-12 bg-slate-900/50 border-blue-500/30 text-blue-100 placeholder:text-blue-400/40 focus:border-blue-400 focus:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all backdrop-blur-xl"
              data-testid="input-search-wallets"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 rounded-md pointer-events-none group-hover:via-blue-500/10 transition-all"></div>
          </div>
          <Button 
            variant="outline" 
            onClick={load} 
            data-testid="button-refresh-wallets"
            className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-purple-500/30 text-purple-300 hover:border-purple-400 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all backdrop-blur-xl"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            REFRESH
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
    </div>
  );
};

export default AdminWallets;
