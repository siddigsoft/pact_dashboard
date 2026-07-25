# Runbook: Pre-Fund Holder User Column

## What this does
Adds a `holder_user_id` column to `pre_fund_requests`.  
Finance Admin or Super Admin can now designate **any user** as the holder of a specific fund.  
The holder gets a **Distribute Funds** tab in the Pre-Funding Hub where they can:
- See their assigned fund balance
- Add staff allocations (pick a user + enter an amount)
- Edit or remove existing allocations

## Apply to Supabase

Open the Supabase SQL Editor and run:

```sql
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS holder_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN pre_fund_requests.holder_user_id IS
  'Optional user designated as the fund holder. Holder can distribute allocations to staff from this fund.';

CREATE INDEX IF NOT EXISTS idx_pre_fund_requests_holder_user_id
  ON pre_fund_requests (holder_user_id)
  WHERE holder_user_id IS NOT NULL;
```

Or run the file directly:
```
supabase/migrations/pre_fund_holder_user.sql
```

## After applying
1. Open **Fund Registry** → Edit any active fund → assign a Fund Holder using the new "Fund Holder" picker
2. The designated user will now see their fund in the **Distribute Funds** tab
3. They can search staff and set allocation amounts directly from that tab
