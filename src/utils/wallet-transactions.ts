/**
 * Centralized utility for creating wallet transactions for site visit completions.
 * This is the SINGLE POINT OF TRUTH for wallet transaction creation.
 * 
 * All site completion flows should use this function to ensure consistency
 * and prevent duplicate transactions.
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreateSiteVisitTransactionOptions {
  /** The site entry ID (mmp_site_entries.id) */
  siteVisitId: string;
  /** Optional: User ID to pay. If not provided, will be determined from site entry (accepted_by > claimed_by > visit_completed_by) */
  userId?: string;
  /** Optional: Amount to pay. If not provided, will be calculated from site entry fees */
  amount?: number;
  /** Optional: Description for the transaction */
  description?: string;
  /** Optional: Whether to skip duplicate checks (use with caution) */
  skipDuplicateCheck?: boolean;
  /** Optional: Whether to show toast notifications (requires toast function) */
  showNotifications?: boolean;
  /** Optional: Toast function for notifications */
  toast?: (options: { title: string; description: string; variant?: 'default' | 'destructive' }) => void;
}

export interface CreateSiteVisitTransactionResult {
  success: boolean;
  transactionId?: string;
  walletId?: string;
  amount?: number;
  message: string;
  error?: string;
}

/**
 * Creates a wallet transaction for a completed site visit.
 * This is the SINGLE POINT OF TRUTH for wallet transaction creation.
 * 
 * @param options Configuration options
 * @returns Result object with success status and details
 */
export async function createSiteVisitWalletTransaction(
  options: CreateSiteVisitTransactionOptions
): Promise<CreateSiteVisitTransactionResult> {
  const {
    siteVisitId,
    userId: providedUserId,
    amount: providedAmount,
    description: providedDescription,
    skipDuplicateCheck = false,
    showNotifications = false,
    toast
  } = options;

  try {
    console.log(`[WalletTransaction] Starting transaction creation for site visit ${siteVisitId}`);

    // Step 1: Fetch site entry to get fee information and determine user to pay
    const { data: siteEntry, error: siteError } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, site_code, status, accepted_by, claimed_by, visit_completed_by, enumerator_fee, transport_fee, cost, visit_completed_at, visit_date')
      .eq('id', siteVisitId)
      .single();

    if (siteError) {
      const errorMsg = `Failed to fetch site entry: ${siteError.message}`;
      console.error(`[WalletTransaction] ${errorMsg}`);
      if (showNotifications && toast) {
        toast({
          title: 'Site Visit Not Found',
          description: 'Cannot create wallet transaction - site visit record not found.',
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg, error: siteError.message };
    }

    if (!siteEntry) {
      const errorMsg = 'Site entry is null';
      console.error(`[WalletTransaction] ${errorMsg}`);
      if (showNotifications && toast) {
        toast({
          title: 'Site Visit Not Found',
          description: 'Cannot create wallet transaction - site visit record not found.',
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg };
    }

    // Step 2: Determine user to pay (priority: accepted_by > claimed_by > visit_completed_by > providedUserId)
    // NOTE: accepted_by is stored as text, but should be a valid UUID string
    let userIdToPay: string | null = null;
    
    if (providedUserId) {
      userIdToPay = providedUserId;
      console.log(`[WalletTransaction] Using provided user ID: ${userIdToPay}`);
    } else {
      // Priority order: accepted_by > claimed_by > visit_completed_by
      // Handle type mismatch: accepted_by is text, others are uuid
      const acceptedBy = siteEntry.accepted_by ? String(siteEntry.accepted_by).trim() : null;
      const claimedBy = siteEntry.claimed_by ? String(siteEntry.claimed_by).trim() : null;
      const visitCompletedBy = siteEntry.visit_completed_by ? String(siteEntry.visit_completed_by).trim() : null;
      
      userIdToPay = acceptedBy || claimedBy || visitCompletedBy || null;
      
      if (userIdToPay) {
        console.log(`[WalletTransaction] Determined user to pay from site entry: ${userIdToPay} (accepted_by: ${acceptedBy}, claimed_by: ${claimedBy}, visit_completed_by: ${visitCompletedBy})`);
      }
    }

    if (!userIdToPay) {
      const errorMsg = 'No user ID found for payment (checked accepted_by, claimed_by, visit_completed_by)';
      console.warn(`[WalletTransaction] ${errorMsg}`);
      if (showNotifications && toast) {
        toast({
          title: 'Payment Error',
          description: 'Cannot determine which user should receive payment for this site visit.',
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg };
    }

    // Validate that userIdToPay is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userIdToPay)) {
      const errorMsg = `Invalid user ID format: ${userIdToPay}`;
      console.error(`[WalletTransaction] ${errorMsg}`);
      if (showNotifications && toast) {
        toast({
          title: 'Payment Error',
          description: 'Invalid user ID format. Cannot create wallet transaction.',
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg };
    }

    // Step 3: Calculate amount (use provided amount, or calculate from site entry fees)
    let amount: number;
    let transactionDescription: string;

    if (providedAmount !== undefined && providedAmount > 0) {
      amount = providedAmount;
      transactionDescription = providedDescription || `Site visit completion: ${siteEntry.site_name || 'Site'}`;
      console.log(`[WalletTransaction] Using provided amount: ${amount} SDG`);
    } else {
      // Calculate from site entry fees
      const enumeratorFee = Number(siteEntry.enumerator_fee || 0);
      const transportFee = Number(siteEntry.transport_fee || 0);
      const directCost = Number(siteEntry.cost || 0);

      // Use direct cost if available, otherwise sum fees
      amount = directCost > 0 ? directCost : (enumeratorFee + transportFee);
      
      if (amount <= 0) {
        const errorMsg = `No fee amount available for site visit ${siteVisitId} (cost: ${directCost}, enumerator_fee: ${enumeratorFee}, transport_fee: ${transportFee})`;
        console.warn(`[WalletTransaction] ${errorMsg}`);
        if (showNotifications && toast) {
          toast({
            title: 'Fee Not Set',
            description: 'The site visit fee was not calculated. Please contact admin to adjust.',
            variant: 'default'
          });
        }
        return { success: false, message: errorMsg };
      }

      transactionDescription = providedDescription || 
        (directCost > 0 
          ? `Site visit completion: ${siteEntry.site_name || 'Site'}`
          : `Site visit completion: ${siteEntry.site_name || 'Site'} (${enumeratorFee} SDG enumerator + ${transportFee} SDG transport)`);
      
      console.log(`[WalletTransaction] Calculated amount from site entry: ${amount} SDG (cost: ${directCost}, enumerator: ${enumeratorFee}, transport: ${transportFee})`);
    }

    // Step 4: Check for existing transactions (duplicate prevention)
    if (!skipDuplicateCheck) {
      console.log(`[WalletTransaction] Checking for existing transactions for site visit ${siteVisitId}...`);
      
      // Use separate queries for more reliable matching
      // Only check for 'earning' type (site_visit_fee is not a valid enum value in the database)
      const { data: existingBySiteVisitId, error: check1Error } = await supabase
        .from('wallet_transactions')
        .select('id, amount, type')
        .eq('site_visit_id', siteVisitId)
        .eq('type', 'earning');

      const { data: existingByRefId, error: check2Error } = await supabase
        .from('wallet_transactions')
        .select('id, amount, type')
        .eq('related_site_visit_id', siteVisitId)
        .eq('type', 'earning');

      const checkError = check1Error || check2Error;
      const existingTransactions = [
        ...(existingBySiteVisitId || []),
        ...(existingByRefId || [])
      ];

      if (checkError) {
        const errorMsg = `Failed to check for existing transactions: ${checkError.message}`;
        console.error(`[WalletTransaction] ${errorMsg}`, { check1Error, check2Error });
        // Fail-safe: don't create transaction if we can't verify duplicates
        if (showNotifications && toast) {
          toast({
            title: 'Validation Failed',
            description: 'Cannot verify if transaction already exists. Please try again.',
            variant: 'destructive'
          });
        }
        return { success: false, message: errorMsg, error: checkError.message };
      }

      if (existingTransactions && existingTransactions.length > 0) {
        const totalExisting = existingTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const message = `Transaction already exists for site visit ${siteVisitId}: ${totalExisting} SDG (${existingTransactions.length} transaction(s))`;
        console.log(`[WalletTransaction] ${message}`);
        if (showNotifications && toast) {
          toast({
            title: 'Transaction Already Exists',
            description: `This site visit already has ${existingTransactions.length} transaction(s) totaling ${totalExisting} SDG.`,
            variant: 'default'
          });
        }
        return { 
          success: true, 
          message: 'Transaction already exists (skipped duplicate)',
          amount: totalExisting
        };
      }
      
      console.log(`[WalletTransaction] No existing transactions found for site visit ${siteVisitId}`);
    }

    // Step 5: Get or create wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, balances, total_earned')
      .eq('user_id', userIdToPay)
      .single();

    let walletId: string;
    let currentBalance = 0;
    let isNewWallet = false;

    if (walletError && walletError.code === 'PGRST116') {
      // Wallet doesn't exist, create it
      console.log(`[WalletTransaction] Creating new wallet for user ${userIdToPay}`);
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({
          user_id: userIdToPay,
          balances: { SDG: amount },
          total_earned: amount,
        })
        .select()
        .single();

      if (createError) {
        const errorMsg = `Failed to create wallet: ${createError.message}`;
        console.error(`[WalletTransaction] ${errorMsg}`);
        if (showNotifications && toast) {
          toast({
            title: 'Wallet Creation Failed',
            description: 'Failed to create wallet for user.',
            variant: 'destructive'
          });
        }
        return { success: false, message: errorMsg, error: createError.message };
      }

      walletId = newWallet.id;
      currentBalance = 0;
      isNewWallet = true;
      console.log(`[WalletTransaction] Created new wallet ${walletId} with initial balance ${amount} SDG`);
    } else if (walletError) {
      const errorMsg = `Failed to fetch wallet: ${walletError.message}`;
      console.error(`[WalletTransaction] ${errorMsg}`);
      if (showNotifications && toast) {
        toast({
          title: 'Wallet Error',
          description: 'Failed to access user wallet.',
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg, error: walletError.message };
    } else {
      walletId = wallet.id;
      currentBalance = Number((wallet.balances as any)?.SDG ?? 0) || 0;
      console.log(`[WalletTransaction] Found existing wallet ${walletId} with balance ${currentBalance} SDG`);
    }

    // Step 6: Calculate new balance
    const newBalance = Number((currentBalance + amount).toFixed(2));

    // Step 7: Update wallet balance
    if (!isNewWallet) {
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balances: { ...(wallet?.balances as any || {}), SDG: newBalance },
          total_earned: (Number(wallet?.total_earned || 0) + amount).toFixed(2),
          updated_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      if (updateError) {
        const errorMsg = `Failed to update wallet balance: ${updateError.message}`;
        console.error(`[WalletTransaction] ${errorMsg}`);
        if (showNotifications && toast) {
          toast({
            title: 'Wallet Update Failed',
            description: 'Failed to update wallet balance.',
            variant: 'destructive'
          });
        }
        return { success: false, message: errorMsg, error: updateError.message };
      }
      console.log(`[WalletTransaction] Updated wallet balance from ${currentBalance} to ${newBalance} SDG`);
    }

    // Step 8: Create wallet transaction
    console.log(`[WalletTransaction] Creating wallet transaction:`, {
      walletId,
      userIdToPay,
      amount,
      siteVisitId,
      currentBalance,
      newBalance
    });

    const transactionData = {
      wallet_id: walletId,
      user_id: userIdToPay,
      type: 'earning' as const,
      amount: amount,
      amount_cents: Math.round(amount * 100),
      currency: 'SDG' as const,
      site_visit_id: siteVisitId,
      related_site_visit_id: siteVisitId, // For legacy compatibility
      description: transactionDescription,
      balance_before: currentBalance,
      balance_after: newBalance,
    };

    console.log(`[WalletTransaction] Transaction data:`, JSON.stringify(transactionData, null, 2));

    const { data: transaction, error: transactionError } = await supabase
      .from('wallet_transactions')
      .insert(transactionData)
      .select('id')
      .single();

    if (transactionError) {
      console.error(`[WalletTransaction] Transaction insertion error:`, {
        error: transactionError,
        code: transactionError.code,
        message: transactionError.message,
        details: transactionError.details,
        hint: transactionError.hint
      });

      // Handle duplicate constraint violation gracefully
      if (transactionError.code === '23505' && transactionError.message?.includes('site_visit')) {
        const message = `Database constraint blocked duplicate transaction for site visit ${siteVisitId}`;
        console.warn(`[WalletTransaction] ${message}`);
        if (showNotifications && toast) {
          toast({
            title: 'Transaction Already Exists',
            description: 'This site visit transaction was already recorded.',
            variant: 'default'
          });
        }
        return { success: true, message: 'Transaction already exists (database constraint)', amount };
      }

      const errorMsg = `Failed to create transaction: ${transactionError.message}`;
      console.error(`[WalletTransaction] ${errorMsg}`, transactionError);
      if (showNotifications && toast) {
        toast({
          title: 'Transaction Creation Failed',
          description: `Failed to create wallet transaction record: ${transactionError.message}`,
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg, error: transactionError.message };
    }

    if (!transaction || !transaction.id) {
      const errorMsg = 'Transaction was created but no ID was returned';
      console.error(`[WalletTransaction] ${errorMsg}`);
      if (showNotifications && toast) {
        toast({
          title: 'Transaction Creation Failed',
          description: 'Transaction was created but could not be verified.',
          variant: 'destructive'
        });
      }
      return { success: false, message: errorMsg };
    }

    console.log(`[WalletTransaction] ✅ Successfully created transaction ${transaction.id} for site visit ${siteVisitId}: ${amount} SDG to user ${userIdToPay}`);

    return {
      success: true,
      transactionId: transaction.id,
      walletId: walletId,
      amount: amount,
      message: `Successfully created wallet transaction: ${amount} SDG`
    };

  } catch (error: any) {
    const errorMsg = `Unexpected error creating wallet transaction: ${error.message || 'Unknown error'}`;
    console.error(`[WalletTransaction] ${errorMsg}`, error);
    if (showNotifications && toast) {
      toast({
        title: 'Transaction Error',
        description: 'An unexpected error occurred while creating the wallet transaction.',
        variant: 'destructive'
      });
    }
    return { success: false, message: errorMsg, error: error.message };
  }
}

/**
 * Helper function to determine the user ID to pay from a site entry.
 * Priority: accepted_by > claimed_by > visit_completed_by
 */
export function determineUserToPay(siteEntry: {
  accepted_by?: string | null;
  claimed_by?: string | null;
  visit_completed_by?: string | null;
}): string | null {
  const acceptedBy = siteEntry.accepted_by ? String(siteEntry.accepted_by).trim() : null;
  const claimedBy = siteEntry.claimed_by ? String(siteEntry.claimed_by).trim() : null;
  const visitCompletedBy = siteEntry.visit_completed_by ? String(siteEntry.visit_completed_by).trim() : null;
  
  return acceptedBy || claimedBy || visitCompletedBy || null;
}

/**
 * Helper function to calculate the fee amount from a site entry.
 * Priority: cost > (enumerator_fee + transport_fee)
 */
export function calculateFeeAmount(siteEntry: {
  cost?: number | null;
  enumerator_fee?: number | null;
  transport_fee?: number | null;
}): number {
  const directCost = Number(siteEntry.cost || 0);
  const enumeratorFee = Number(siteEntry.enumerator_fee || 0);
  const transportFee = Number(siteEntry.transport_fee || 0);

  return directCost > 0 ? directCost : (enumeratorFee + transportFee);
}

/**
 * Backfills wallet transactions for completed sites that are missing them.
 * This is useful for fixing historical data or recovering from errors.
 * 
 * @param siteVisitId The site entry ID to backfill
 * @param options Optional configuration
 * @returns Result object with success status and details
 */
export async function backfillWalletTransactionForSite(
  siteVisitId: string,
  options?: {
    showNotifications?: boolean;
    toast?: (options: { title: string; description: string; variant?: 'default' | 'destructive' }) => void;
  }
): Promise<CreateSiteVisitTransactionResult> {
  console.log(`[WalletTransaction] Backfilling wallet transaction for site visit ${siteVisitId}`);
  
  return createSiteVisitWalletTransaction({
    siteVisitId,
    skipDuplicateCheck: false, // Still check for duplicates
    showNotifications: options?.showNotifications ?? false,
    toast: options?.toast,
  });
}

