# RLS Implementation Quick Start Guide

## Important: Use Production-Safe Script

Your production database may have a different schema than development. Use the production-safe script:

**Primary file: `docs/database/RLS_PRODUCTION_SAFE.sql`**

This script:
- Organizes policies by logical sections (run one at a time)
- Only includes tables that exist in most environments
- Excludes optional tables like `tracker_plan_configs`

## Step-by-Step Implementation

### Step 1: Get Your Table Inventory
First, run this in your Supabase SQL Editor to see what tables exist:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

### Step 2: Run Helper Functions First
Copy and run the helper functions from `RLS_PRODUCTION_SAFE.sql` (Step 2) in your Supabase SQL Editor:
- `is_super_admin()`
- `has_role()`
- `is_admin()`
- `is_admin_or_super()`
- `is_fom()`
- `is_coordinator()`
- `is_data_collector()`
- `is_supervisor()`
- `is_financial_admin()`
- `get_user_hub_id()`
- `can_access_hub()`

### Step 2: Enable RLS by Priority

#### Priority 1: User Data (Critical Security)
1. `profiles`
2. `user_roles`
3. `super_admins`

#### Priority 2: Finance (Sensitive Data)
1. `wallets`
2. `wallet_transactions`
3. `withdrawal_requests`
4. `down_payment_requests`

#### Priority 3: Workflow (Operational Data)
1. `mmp_files`
2. `mmp_site_entries`
3. `site_visits`

#### Priority 4: Audit (Compliance)
1. `audit_logs`
2. `deletion_audit_log`
3. `notifications`

### Step 3: Verification
After enabling each table, run:
```sql
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'YOUR_TABLE_NAME';
```

### Step 4: Test Access
Test with different user roles to verify policies work correctly before enabling FORCE RLS.

## Table Classification Summary

| Category | Tables | RLS Approach |
|----------|--------|--------------|
| Reference | hubs, hub_states, sites_registry, classifications | Public read, Admin write |
| User Data | profiles, user_roles, super_admins | User-scoped, Admin override |
| Workflow | mmp_files, mmp_site_entries, site_visits | Hub/project-scoped |
| Finance | wallets, transactions, withdrawals, down_payments | Owner + Finance roles |
| Audit | audit_logs, deletion_audit_log | Admin-only read |

## Current Policy Status

Tables WITH policies (3):
- classification_fee_structures
- password_reset_tokens
- user_classifications

Tables WITHOUT policies (28):
- All other tables need policies added

## Files

- **Production-safe script (RECOMMENDED):** `docs/database/RLS_PRODUCTION_SAFE.sql`
- Full implementation (dev reference): `docs/database/RLS_IMPLEMENTATION_GUIDE.sql`
- This quick start: `docs/database/RLS_QUICK_START.md`

## Troubleshooting

### "relation does not exist" error
Your production database is missing a table that exists in development. Simply skip that section and continue with the next one.

### Policies not working
1. Verify RLS is enabled: `SELECT relrowsecurity FROM pg_class WHERE relname = 'your_table';`
2. Check policies exist: `SELECT * FROM pg_policies WHERE tablename = 'your_table';`
3. Test with a specific user role
