# RLS Implementation Quick Start Guide

## Step-by-Step Implementation

### Step 1: Run Helper Functions First
Copy and run the helper functions from `RLS_IMPLEMENTATION_GUIDE.sql` (Part 2) in your Supabase SQL Editor:
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

- Full implementation: `docs/database/RLS_IMPLEMENTATION_GUIDE.sql`
- This quick start: `docs/database/RLS_QUICK_START.md`
