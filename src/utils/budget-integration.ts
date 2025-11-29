import { supabase } from '@/integrations/supabase/client';

/**
 * Records a budget transaction when a site visit cost is assigned
 */
export async function recordSiteVisitBudgetSpend(
  siteVisitId: string,
  mmpFileId: string,
  totalCost: number,
  category: string = 'site_visits',
  userId?: string
): Promise<void> {
  try {
    // Find the MMP budget for this MMP file
    const { data: mmpBudgets, error: budgetError } = await supabase
      .from('mmp_budgets')
      .select('*')
      .eq('mmp_file_id', mmpFileId)
      .eq('status', 'active')
      .single();

    if (budgetError || !mmpBudgets) {
      console.log('No active budget found for MMP, skipping budget transaction');
      return;
    }

    const costInCents = Math.round(totalCost * 100);
    const currentBalance = parseInt(mmpBudgets.remaining_budget_cents || 0);

    // Create budget transaction
    const { error: txnError } = await supabase
      .from('budget_transactions')
      .insert({
        mmp_budget_id: mmpBudgets.id,
        site_visit_id: siteVisitId,
        transaction_type: 'spend',
        amount_cents: costInCents,
        currency: 'SDG',
        category: category,
        description: `Site visit cost: ${siteVisitId.slice(0, 8)}`,
        balance_before_cents: currentBalance,
        balance_after_cents: currentBalance - costInCents,
        created_by: userId,
      });

    if (txnError) {
      console.error('Failed to create budget transaction:', txnError);
      return;
    }

    // Update MMP budget spent amount
    const newSpentAmount = parseInt(mmpBudgets.spent_budget_cents || 0) + costInCents;
    const { error: updateError } = await supabase
      .from('mmp_budgets')
      .update({
        spent_budget_cents: newSpentAmount,
        completed_sites: (mmpBudgets.completed_sites || 0) + 1,
        average_cost_per_site_cents: Math.round(newSpentAmount / ((mmpBudgets.completed_sites || 0) + 1)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', mmpBudgets.id);

    if (updateError) {
      console.error('Failed to update MMP budget:', updateError);
    }

    console.log(`Budget transaction recorded: ${costInCents / 100} SDG for site visit ${siteVisitId.slice(0, 8)}`);
  } catch (error) {
    console.error('Error recording site visit budget spend:', error);
  }
}

/**
 * Creates a wallet transaction and records the corresponding budget spend
 */
export async function recordSiteVisitPayment(
  siteVisitId: string,
  mmpFileId: string,
  userId: string,
  walletId: string,
  amount: number,
  costBreakdown?: {
    transportation?: number;
    accommodation?: number;
    meals?: number;
    other?: number;
  }
): Promise<void> {
  try {
    const amountInCents = Math.round(amount * 100);

    // Create wallet transaction
    const { data: walletTxn, error: walletError } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: walletId,
        user_id: userId,
        type: 'site_visit_fee',
        amount: amountInCents,
        currency: 'SDG',
        site_visit_id: siteVisitId,
        description: `Site visit payment: ${siteVisitId.slice(0, 8)}`,
      })
      .select()
      .single();

    if (walletError) {
      console.error('Failed to create wallet transaction:', walletError);
      return;
    }

    // Record budget spend for total amount
    await recordSiteVisitBudgetSpend(siteVisitId, mmpFileId, amount, 'site_visits', userId);

    // Record category-specific budget transactions if breakdown provided
    if (costBreakdown) {
      const categories: Array<{ key: keyof typeof costBreakdown; category: string }> = [
        { key: 'transportation', category: 'transportation' },
        { key: 'accommodation', category: 'accommodation' },
        { key: 'meals', category: 'meals' },
        { key: 'other', category: 'other' },
      ];

      for (const { key, category } of categories) {
        if (costBreakdown[key] && costBreakdown[key]! > 0) {
          await recordSiteVisitBudgetSpend(
            siteVisitId,
            mmpFileId,
            costBreakdown[key]!,
            category,
            userId
          );
        }
      }
    }

    console.log(`Site visit payment recorded: ${amount} SDG for user ${userId}`);
  } catch (error) {
    console.error('Error recording site visit payment:', error);
  }
}

/**
 * Gets the available budget for an MMP
 */
export async function getMMPAvailableBudget(mmpFileId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('mmp_budgets')
      .select('remaining_budget_cents')
      .eq('mmp_file_id', mmpFileId)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return null;
    }

    return parseInt(data.remaining_budget_cents || 0) / 100;
  } catch (error) {
    console.error('Error getting MMP available budget:', error);
    return null;
  }
}

/**
 * Checks if an MMP has sufficient budget for a cost
 */
export async function checkMMPBudgetSufficiency(
  mmpFileId: string,
  requiredAmount: number
): Promise<{ sufficient: boolean; available: number; required: number }> {
  const available = await getMMPAvailableBudget(mmpFileId);

  if (available === null) {
    return {
      sufficient: true, // Allow if no budget tracking
      available: 0,
      required: requiredAmount,
    };
  }

  return {
    sufficient: available >= requiredAmount,
    available,
    required: requiredAmount,
  };
}

/**
 * Gets budget utilization percentage for an MMP
 */
export async function getMMPBudgetUtilization(mmpFileId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('mmp_budgets')
      .select('allocated_budget_cents, spent_budget_cents')
      .eq('mmp_file_id', mmpFileId)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return null;
    }

    const allocated = parseInt(data.allocated_budget_cents || 0);
    const spent = parseInt(data.spent_budget_cents || 0);

    if (allocated === 0) return 0;

    return (spent / allocated) * 100;
  } catch (error) {
    console.error('Error getting MMP budget utilization:', error);
    return null;
  }
}
