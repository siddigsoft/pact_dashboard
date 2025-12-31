# Wallet Payment Fix - Missing Earnings for Completed Sites

## Problem

Users who completed site visits were not receiving earnings in their wallets, even though:
- Sites were marked as "Completed"
- `cost`, `enumerator_fee`, and `transport_fee` were set
- `claimed_by` and `visit_completed_by` were populated

## Root Cause

The payment logic in `handleCompleteVisit` (src/pages/MMP.tsx) only checked for `accepted_by` to determine which user should be paid:

```typescript
const acceptedBy = site.accepted_by || site.additional_data?.accepted_by;
```

However, some completed sites only had `claimed_by` or `visit_completed_by` set, but not `accepted_by`. When `accepted_by` was null, the payment was skipped with the warning:
```
No accepted_by user found for site entry {id}, skipping wallet payment
```

## Solution

### 1. Updated Payment Logic (src/pages/MMP.tsx)

The payment logic now checks multiple fields in priority order:
1. `accepted_by` (primary field)
2. `claimed_by` (fallback)
3. `visit_completed_by` (fallback)
4. Current user ID (last resort)

```typescript
// Fetch fresh data from database first
const { data: freshSite } = await supabase
  .from('mmp_site_entries')
  .select('enumerator_fee, transport_fee, cost, accepted_by, claimed_by, visit_completed_by')
  .eq('id', site.id)
  .single();

// Check multiple fields to determine who should be paid
const acceptedBy = freshSite?.accepted_by || 
                  freshSite?.claimed_by || 
                  freshSite?.visit_completed_by ||
                  site.accepted_by || site.additional_data?.accepted_by || 
                  site.claimed_by || site.additional_data?.claimed_by ||
                  site.visit_completed_by || currentUser?.id;
```

### 2. Updated Reconciliation Function (src/context/wallet/WalletContext.tsx)

The `reconcileSiteVisitFee` function was also updated to check the same fields:

```typescript
const { data: entry } = await supabase
  .from('mmp_site_entries')
  .select('id, site_name, status, accepted_by, claimed_by, visit_completed_by, enumerator_fee, transport_fee, cost')
  .eq('id', siteVisitId)
  .single();

const userIdToPay = entry.accepted_by || entry.claimed_by || entry.visit_completed_by;
```

### 3. Updated Backfill Script (supabase_migrations/backfill_wallet_transactions.sql)

The SQL backfill script was updated to:
- Check `accepted_by`, `claimed_by`, and `visit_completed_by` when finding users to pay
- Use the `'earning'` transaction type (matching current codebase) instead of `'site_visit_fee'`
- Include both transaction types when updating wallet balances

## How to Fix Existing Missing Payments

### Option 1: Use the Reconciliation Function (Recommended)

If you have access to the admin interface, you can use the `reconcileSiteVisitFee` function for individual sites.

### Option 2: Run the Backfill SQL Script

1. Open Supabase SQL Editor
2. Run the updated `backfill_wallet_transactions.sql` script
3. Review the results from Step 1 before running the INSERT statements
4. The script will:
   - Find all completed sites missing wallet transactions
   - Create wallets for users who don't have one
   - Create wallet transactions for missing payments
   - Update wallet balances based on all transactions

### Option 3: Manual Fix via SQL

For specific sites, you can manually create wallet transactions:

```sql
-- 1. Find the site and determine user to pay
SELECT 
  id,
  site_name,
  COALESCE(accepted_by, claimed_by, visit_completed_by) as user_to_pay,
  cost,
  enumerator_fee,
  transport_fee
FROM mmp_site_entries
WHERE id = 'SITE_ID_HERE'
  AND status = 'Completed';

-- 2. Create wallet transaction
INSERT INTO wallet_transactions (
  wallet_id,
  user_id,
  type,
  amount,
  amount_cents,
  currency,
  site_visit_id,
  description,
  balance_before,
  balance_after,
  created_at
)
SELECT 
  w.id,
  COALESCE(mse.accepted_by, mse.claimed_by, mse.visit_completed_by),
  'earning',
  COALESCE(mse.cost, COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0)),
  ROUND(COALESCE(mse.cost, COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0)) * 100)::bigint,
  'SDG',
  mse.id,
  'Backfill: Site visit completed: ' || mse.site_name,
  0,
  COALESCE(mse.cost, COALESCE(mse.enumerator_fee, 0) + COALESCE(mse.transport_fee, 0)),
  NOW()
FROM mmp_site_entries mse
JOIN wallets w ON w.user_id = COALESCE(mse.accepted_by, mse.claimed_by, mse.visit_completed_by)
WHERE mse.id = 'SITE_ID_HERE'
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions wt 
    WHERE wt.site_visit_id = mse.id 
    AND wt.type IN ('earning', 'site_visit_fee')
  );

-- 3. Update wallet balance
UPDATE wallets
SET 
  balances = jsonb_build_object('SDG', COALESCE(tx_sum.total, 0)),
  total_earned = COALESCE(tx_sum.total, 0),
  updated_at = NOW()
FROM (
  SELECT 
    user_id,
    SUM(amount) as total
  FROM wallet_transactions
  WHERE user_id = 'USER_ID_HERE'
    AND type IN ('earning', 'site_visit_fee')
  GROUP BY user_id
) tx_sum
WHERE wallets.user_id = tx_sum.user_id;
```

## Verification

After applying the fix, verify that:

1. **New completions work**: Complete a new site visit and verify the wallet transaction is created
2. **Existing sites are fixed**: Check that completed sites now have wallet transactions
3. **Wallet balances are correct**: Verify that `total_earned` matches the sum of all earning transactions

```sql
-- Check for completed sites without wallet transactions
SELECT 
  mse.id,
  mse.site_name,
  COALESCE(mse.accepted_by, mse.claimed_by, mse.visit_completed_by) as user_id,
  mse.cost,
  mse.status
FROM mmp_site_entries mse
WHERE mse.status = 'Completed'
  AND (mse.accepted_by IS NOT NULL OR mse.claimed_by IS NOT NULL OR mse.visit_completed_by IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM wallet_transactions wt 
    WHERE wt.site_visit_id = mse.id 
    AND wt.type IN ('earning', 'site_visit_fee')
  );

-- Verify wallet balances match transactions
SELECT 
  w.user_id,
  w.total_earned,
  COALESCE(tx_sum.total, 0) as calculated_total,
  w.total_earned - COALESCE(tx_sum.total, 0) as difference
FROM wallets w
LEFT JOIN (
  SELECT 
    user_id,
    SUM(amount) as total
  FROM wallet_transactions
  WHERE type IN ('earning', 'site_visit_fee')
  GROUP BY user_id
) tx_sum ON tx_sum.user_id = w.user_id
WHERE ABS(w.total_earned - COALESCE(tx_sum.total, 0)) > 0.01;  -- Allow small rounding differences
```

## Prevention

Going forward, the system will:
- Check multiple user fields when processing payments
- Fetch fresh data from the database to ensure accuracy
- Log warnings if no user can be determined for payment

## Related Files

- `src/pages/MMP.tsx` - Main completion handler
- `src/context/wallet/WalletContext.tsx` - Reconciliation function
- `supabase_migrations/backfill_wallet_transactions.sql` - Backfill script

