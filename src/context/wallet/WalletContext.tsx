import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { WalletSummary, WalletTransaction, EarningRow, PayoutRequest } from '@/types';
import { getMyWalletSummary, listMyTransactions, listMyEarnings, createPayoutRequest, adminListWallets, adminGetWalletDetail, adminListPayoutRequests, adminAdjustBalance, adminApprovePayout, adminDeclinePayout, adminMarkPayoutPaid } from './supabase';

interface WalletContextType {
  summary: WalletSummary | null;
  transactions: WalletTransaction[];
  earnings: EarningRow[];
  payoutRequests: PayoutRequest[];
  dateRange: DateRange | undefined;
  setDateRange: (r: DateRange | undefined) => void;
  loading: boolean;
  refresh: () => Promise<void>;
  requestPayout: (amountCents: number, method: 'bank' | 'mobile_money' | 'manual', destination: any) => Promise<boolean>;
  admin: {
    listWallets: (params?: { search?: string; page?: number; pageSize?: number }) => Promise<any[]>;
    getWalletDetail: (userId: string) => Promise<{ wallet: any; txns: WalletTransaction[] }>;
    listPayoutRequests: (params?: { status?: string; page?: number; pageSize?: number }) => Promise<any[]>;
    adjustBalance: (userId: string, direction: 'credit' | 'debit', amountCents: number, memo?: string) => Promise<any | null>;
    approvePayout: (id: string) => Promise<any | null>;
    declinePayout: (id: string) => Promise<any | null>;
    markPayoutPaid: (id: string) => Promise<any | null>;
  };
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAppContext();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const fromIso = useMemo(() => (dateRange?.from ? new Date(dateRange.from.setHours(0,0,0,0)).toISOString() : undefined), [dateRange]);
  const toIso = useMemo(() => (dateRange?.to ? new Date(new Date(dateRange.to).setHours(23,59,59,999)).toISOString() : undefined), [dateRange]);

  const refresh = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [s, t, e] = await Promise.all([
        getMyWalletSummary(currentUser.id, fromIso, toIso),
        listMyTransactions(currentUser.id, { from: fromIso, to: toIso, pageSize: 50 }),
        listMyEarnings(currentUser.id, { from: fromIso, to: toIso, pageSize: 50 }),
      ]);
      setSummary(s);
      setTransactions(t);
      setEarnings(e);
    } finally {
      setLoading(false);
    }
  };

  const requestPayout = async (amountCents: number, method: 'bank' | 'mobile_money' | 'manual', destination: any) => {
    if (!currentUser) return false;
    const res = await createPayoutRequest(currentUser.id, amountCents, method, destination);
    if (res) {
      setPayoutRequests(prev => [res, ...prev]);
      await refresh();
      return true;
    }
    return false;
  };

  useEffect(() => {
    refresh();
  }, [currentUser, fromIso, toIso]);

  useEffect(() => {
    if (!currentUser) return;
    const ch1 = supabase.channel('wallets').on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${currentUser.id}` }, () => refresh());
    const ch2 = supabase.channel('wallet_tx').on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${currentUser.id}` }, () => refresh());
    const ch3 = supabase.channel('payout_requests').on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests', filter: `user_id=eq.${currentUser.id}` }, () => refresh());
    ch1.subscribe();
    ch2.subscribe();
    ch3.subscribe();
    return () => {
      try { supabase.removeChannel(ch1); } catch {}
      try { supabase.removeChannel(ch2); } catch {}
      try { supabase.removeChannel(ch3); } catch {}
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(() => { refresh(); }, 60000);
    return () => clearInterval(id);
  }, [currentUser, fromIso, toIso]);

  const value: WalletContextType = {
    summary,
    transactions,
    earnings,
    payoutRequests,
    dateRange,
    setDateRange,
    loading,
    refresh,
    requestPayout,
    admin: {
      listWallets: adminListWallets,
      getWalletDetail: adminGetWalletDetail,
      listPayoutRequests: adminListPayoutRequests,
      adjustBalance: adminAdjustBalance,
      approvePayout: adminApprovePayout,
      declinePayout: adminDeclinePayout,
      markPayoutPaid: adminMarkPayoutPaid,
    },
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
};
