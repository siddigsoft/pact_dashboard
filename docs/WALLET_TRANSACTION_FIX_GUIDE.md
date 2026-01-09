# Wallet Transaction Fix Guide

## Problem
Sites are being marked as "Completed" but wallet transactions are not being created automatically.

## Root Cause
The application code was the only mechanism creating wallet transactions. If the code path failed, was skipped, or had errors, no transaction would be created.

## Solution: Database Trigger + Backfill Scripts

We've implemented a **database-level trigger** that automatically creates wallet transactions when a site is marked as "Completed". This ensures transactions are **ALWAYS** created, regardless of application code paths.

---

## Step 1: Apply the Database Trigger

**File:** `supabase/migrations/20250106_auto_create_wallet_transaction_on_completion.sql`

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the entire contents of the migration file
3. Execute the SQL
4. Verify the trigger was created:
   ```sql
   SELECT trigger_name, event_manipulation, event_object_table
   FROM information_schema.triggers
   WHERE trigger_name = 'trigger_create_wallet_transaction_on_completion';
   ```

**What this does:**
- Automatically creates wallet transactions when `status` changes to 'Completed'
- Handles user determination (accepted_by > claimed_by > visit_completed_by)
- Calculates amounts correctly
- Prevents duplicates
- Creates/updates wallets as needed

---

## Step 2: Backfill Existing Completed Sites

For sites that are already completed but missing transactions, use one of these scripts:

### Option A: Quick Fix for Specific Sites

**File:** `supabase_migrations/quick_fix_4_sites.sql`

This script fixes the 4 specific sites you identified:
- HAY ALARAB (1ce9fb02-e17b-48e3-a21f-0e687989d390)
- KABUSHI (7a1e75d0-c77d-46c8-8d23-08f1a9f9cc33)
- ALSHARGEY8 (592da95b-6717-4665-bb7b-b4b30b9617cb)
- BASABIR (f9513f1d-5dea-4a1f-84a8-551ab2ba3bd6)

**To use:**
1. Run the script in Supabase SQL Editor
2. Check the verification query at the end to confirm transactions were created

### Option B: Backfill All Missing Transactions

**File:** `supabase_migrations/backfill_missing_wallet_transactions.sql`

This script finds and fixes ALL completed sites missing transactions.

**To use:**
1. **First**, run Step 1 (the SELECT query) to see which sites will be affected
2. Review the results
3. **Then**, run Steps 2-5 to create the transactions
4. **Finally**, run Step 6 to verify the results

---

## Step 3: Verify Everything Works

### Test the Trigger

1. Find a site that's NOT completed yet
2. Update its status to 'Completed':
   ```sql
   UPDATE mmp_site_entries
   SET status = 'Completed'
   WHERE id = 'some-site-id'
     AND status != 'Completed';
   ```
3. Check if a transaction was created:
   ```sql
   SELECT * FROM wallet_transactions
   WHERE site_visit_id = 'some-site-id'
     AND type = 'earning';
   ```

### Check for Missing Transactions

Run this query to find any remaining sites without transactions:

```sql
SELECT 
  mse.id,
  mse.site_name,
  mse.status,
  CASE 
    WHEN wt.id IS NOT NULL THEN 'Has Transaction'
    ELSE 'Missing Transaction'
  END as transaction_status
FROM mmp_site_entries mse
LEFT JOIN wallet_transactions wt ON (
  (wt.site_visit_id = mse.id OR wt.related_site_visit_id = mse.id)
  AND wt.type IN ('earning', 'site_visit_fee')
)
WHERE LOWER(mse.status) = 'completed'
  AND (mse.accepted_by IS NOT NULL OR mse.claimed_by IS NOT NULL OR mse.visit_completed_by IS NOT NULL)
  AND (COALESCE(mse.cost, 0) > 0 OR COALESCE(mse.enumerator_fee, 0) > 0)
  AND wt.id IS NULL
ORDER BY mse.visit_completed_at DESC NULLS LAST;
```

---

## How It Works

### The Trigger Function

The trigger function `create_wallet_transaction_on_completion()`:

1. **Fires when:** `status` column changes to 'Completed' or 'completed'
2. **Determines user to pay:**
   - Priority: `accepted_by` > `claimed_by` > `visit_completed_by`
   - Handles type mismatch (accepted_by is text, others are uuid)
3. **Calculates amount:**
   - Uses `cost` if available
   - Otherwise: `enumerator_fee + transport_fee`
4. **Prevents duplicates:**
   - Checks for existing transactions before creating
5. **Creates/updates wallet:**
   - Creates wallet if it doesn't exist
   - Updates balance if it does
6. **Creates transaction:**
   - Inserts into `wallet_transactions` table
   - Sets type to 'earning'
   - Records balance before/after

### Application Code

The application code (`createSiteVisitWalletTransaction` function) still works and provides:
- Better error messages
- Toast notifications
- Detailed logging

But now, even if the application code fails, the database trigger ensures the transaction is created.

---

## Troubleshooting

### Transaction Still Not Created?

1. **Check if trigger exists:**
   ```sql
   SELECT * FROM information_schema.triggers
   WHERE trigger_name = 'trigger_create_wallet_transaction_on_completion';
   ```

2. **Check trigger logs:**
   - Look in Supabase logs for NOTICE messages from the trigger
   - These will show why transactions weren't created (e.g., "No user to pay", "No fee amount")

3. **Verify site has required data:**
   - Must have `status = 'Completed'`
   - Must have at least one: `accepted_by`, `claimed_by`, or `visit_completed_by`
   - Must have `cost > 0` OR (`enumerator_fee > 0` OR `transport_fee > 0`)

4. **Check for duplicate transactions:**
   ```sql
   SELECT * FROM wallet_transactions
   WHERE site_visit_id = 'your-site-id'
     AND type IN ('earning', 'site_visit_fee');
   ```

### Trigger Not Firing?

1. **Check trigger condition:**
   - Trigger only fires on `UPDATE` (not INSERT)
   - Must change `status` column
   - Must change TO 'Completed' (not FROM 'Completed')

2. **Test manually:**
   ```sql
   -- Temporarily change status away from Completed
   UPDATE mmp_site_entries
   SET status = 'In Progress'
   WHERE id = 'your-site-id';
   
   -- Change back to Completed (this should trigger)
   UPDATE mmp_site_entries
   SET status = 'Completed'
   WHERE id = 'your-site-id';
   ```

---

## Files Created

1. **`supabase/migrations/20250106_auto_create_wallet_transaction_on_completion.sql`**
   - Main trigger migration (apply this first)

2. **`supabase_migrations/backfill_missing_wallet_transactions.sql`**
   - Backfill script for all missing transactions

3. **`supabase_migrations/quick_fix_4_sites.sql`**
   - Quick fix for the 4 specific sites

4. **`supabase_migrations/test_wallet_transaction_trigger.sql`**
   - Test script to verify trigger is working

---

## Summary

✅ **Database trigger** ensures transactions are ALWAYS created at database level  
✅ **Application code** still works and provides better UX  
✅ **Backfill scripts** fix existing completed sites  
✅ **Single point of truth** - trigger is the ultimate fallback  

After applying the trigger, all future site completions will automatically create wallet transactions, regardless of application code paths.

