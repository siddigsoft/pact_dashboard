import { supabase } from '@/integrations/supabase/client';

export { adminListWallets } from '@/features/wallet/repository/walletRepository';

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
