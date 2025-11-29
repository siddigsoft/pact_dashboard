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
  
  // Get transaction breakdowns for all wallets in parallel
  // Query by both wallet_id AND user_id to handle legacy transactions
  const walletIds = (data || []).map((w: any) => w.id);
  const userIds = (data || []).map((w: any) => w.user_id);
  
  // Build a map of user_id -> wallet_id for fallback matching
  const userToWalletMap: Record<string, string> = {};
  (data || []).forEach((w: any) => {
    userToWalletMap[w.user_id] = w.id;
  });
  
  // Query transactions by wallet_id first
  const { data: txByWallet } = await supabase
    .from('wallet_transactions')
    .select('wallet_id, user_id, type, amount')
    .in('wallet_id', walletIds);
  
  // Also query by user_id for legacy transactions that might not have wallet_id set
  const { data: txByUser } = await supabase
    .from('wallet_transactions')
    .select('wallet_id, user_id, type, amount')
    .in('user_id', userIds);
  
  // Combine and dedupe transactions
  const seenTxIds = new Set<string>();
  const allTransactions: any[] = [];
  
  [...(txByWallet || []), ...(txByUser || [])].forEach(tx => {
    const txKey = `${tx.wallet_id || tx.user_id}-${tx.type}-${tx.amount}`;
    if (!seenTxIds.has(txKey)) {
      seenTxIds.add(txKey);
      allTransactions.push(tx);
    }
  });
  
  // Group transactions by wallet_id (or user_id mapped to wallet_id)
  const transactionsByWallet: Record<string, Record<string, number>> = {};
  allTransactions.forEach((tx: any) => {
    // Use wallet_id if available, otherwise map user_id to wallet_id
    const walletId = tx.wallet_id || userToWalletMap[tx.user_id];
    if (!walletId) return;
    
    if (!transactionsByWallet[walletId]) {
      transactionsByWallet[walletId] = {};
    }
    if (!transactionsByWallet[walletId][tx.type]) {
      transactionsByWallet[walletId][tx.type] = 0;
    }
    transactionsByWallet[walletId][tx.type] += Number(tx.amount || 0);
  });
  
  const rows = (data || []).map((r: any) => {
    const breakdown = transactionsByWallet[r.id] || {};
    
    return {
      ...r,
      owner_name: r.profiles?.full_name || r.profiles?.username || r.profiles?.email || r.user_id,
      // Convert numeric strings to numbers for proper calculations
      totalEarned: Number(r.total_earned || 0),
      totalWithdrawn: Number(r.total_withdrawn || 0),
      // Add transaction breakdown
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
