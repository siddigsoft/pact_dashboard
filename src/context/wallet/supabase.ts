import { supabase } from '@/integrations/supabase/client';

/**
 * Admin function to list all wallets with user profile information
 * This function JOINs with profiles table to get full_name, username, email
 * and displays owner_name with fallback priority: full_name → username → email → user_id
 * Also includes transaction breakdown summary
 */
export const adminListWallets = async (params: { search?: string; page?: number; pageSize?: number } = {}) => {
  const page = params.page || 1;
  const pageSize = params.pageSize || 100;
  
  let q = supabase
    .from('wallets')
    .select('*, profiles:profiles!wallets_user_id_fkey(full_name, username, email)')
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  
  const { data, error } = await q;
  
  if (error) {
    console.error('Error fetching wallets:', error);
    return [];
  }
  
  const walletIds = (data || []).map((w: any) => w.id);
  const userIds = (data || []).map((w: any) => w.user_id);
  
  const userToWalletMap: Record<string, string> = {};
  (data || []).forEach((w: any) => {
    userToWalletMap[w.user_id] = w.id;
  });
  
  const { data: txByWallet } = await supabase
    .from('wallet_transactions')
    .select('id, wallet_id, user_id, type, amount')
    .in('wallet_id', walletIds);
  
  const { data: txByUser } = await supabase
    .from('wallet_transactions')
    .select('id, wallet_id, user_id, type, amount')
    .in('user_id', userIds);
  
  const seenTxIds = new Set<string>();
  const allTransactions: any[] = [];
  
  [...(txByWallet || []), ...(txByUser || [])].forEach(tx => {
    if (!tx.id) return;
    if (!seenTxIds.has(tx.id)) {
      seenTxIds.add(tx.id);
      allTransactions.push(tx);
    }
  });
  
  const transactionsByWallet: Record<string, Record<string, number>> = {};
  const earnedByWallet: Record<string, number> = {};
  const withdrawnByWallet: Record<string, number> = {};
  
  allTransactions.forEach((tx: any) => {
    const walletId = tx.wallet_id || userToWalletMap[tx.user_id];
    if (!walletId) return;
    
    if (!transactionsByWallet[walletId]) {
      transactionsByWallet[walletId] = {};
    }
    if (!transactionsByWallet[walletId][tx.type]) {
      transactionsByWallet[walletId][tx.type] = 0;
    }
    transactionsByWallet[walletId][tx.type] += Number(tx.amount || 0);
    
    if (tx.type === 'earning' || tx.type === 'site_visit_fee' || tx.type === 'adjustment') {
      earnedByWallet[walletId] = (earnedByWallet[walletId] || 0) + Number(tx.amount || 0);
    }
    if (tx.type === 'withdrawal') {
      withdrawnByWallet[walletId] = (withdrawnByWallet[walletId] || 0) + Math.abs(Number(tx.amount || 0));
    }
  });
  
  const rows = (data || []).map((r: any) => {
    const breakdown = transactionsByWallet[r.id] || {};
    const storedEarned = Number(r.total_earned || 0);
    const calculatedEarned = earnedByWallet[r.id] || 0;
    const storedWithdrawn = Number(r.total_withdrawn || 0);
    const calculatedWithdrawn = withdrawnByWallet[r.id] || 0;
    
    return {
      ...r,
      owner_name: r.profiles?.full_name || r.profiles?.username || r.profiles?.email || r.user_id,
      totalEarned: Math.max(storedEarned, calculatedEarned),
      totalWithdrawn: Math.max(storedWithdrawn, calculatedWithdrawn),
      breakdown,
    };
  });
  
  return rows;
};

/**
 * Admin function to get detailed wallet information for a specific user
 */
export const adminGetWalletDetail = async (userId: string) => {
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (walletError) {
    console.error('Error fetching wallet detail:', walletError);
    return { wallet: null, transactions: [] };
  }
  
  const { data: transactions, error: txError } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  
  if (txError) {
    console.error('Error fetching transactions:', txError);
    return { wallet, transactions: [] };
  }
  
  return { wallet, transactions: transactions || [] };
};

/**
 * Admin function to list all withdrawal requests
 */
export const adminListWithdrawalRequests = async (params: { status?: string; page?: number; pageSize?: number } = {}) => {
  const page = params.page || 1;
  const pageSize = params.pageSize || 100;
  
  let q = supabase
    .from('withdrawal_requests')
    .select('*, profiles:profiles!withdrawal_requests_user_id_fkey(full_name, username, email)')
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  
  if (params.status) {
    q = q.eq('status', params.status);
  }
  
  const { data, error } = await q;
  
  if (error) {
    console.error('Error fetching withdrawal requests:', error);
    return [];
  }
  
  return data || [];
};
