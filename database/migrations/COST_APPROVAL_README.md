# 💰 Cost Approval System Migration Guide

## Overview

This migration implements **actual cost-based transport fees with admin/finance approval workflow**, replacing the fixed classification fee system.

### What This Changes

**BEFORE:** Transport fees came from fixed `classification_fee_structures` table  
**AFTER:** Transport fees come from actual site visit costs requiring approval

### New Features

- ✅ Enumerators submit actual transport, accommodation, meal, and other costs
- ✅ Admin/Finance review and approve/reject submissions with notes
- ✅ Automatic wallet payment upon approval
- ✅ Budget tracking uses actual approved costs (not fixed fees)
- ✅ Comprehensive audit trail of all approvals
- ✅ Supporting documents (receipts, photos) upload

## 🚨 Deployment Responsibilities

**⚠️ DATABASE ADMINISTRATOR ACTION REQUIRED**

This migration **cannot be deployed by the frontend development team** because it requires direct database access to Supabase. The SQL migration file is complete and ready for deployment, but must be executed by someone with database administrator privileges.

### DBA Checklist

After deploying the migration (see steps below), verify:

1. **Tables Created:** `site_visit_cost_submissions`, `cost_approval_history`
2. **RLS Policies Active:** Check `pg_policies` for both tables
3. **Trigger Installed:** `trigger_record_cost_approval_history` on submissions table
4. **Views Working:** `pending_cost_approvals`, `user_cost_submission_summary`, `mmp_cost_submission_summary`

**Verification Queries:**

```sql
-- Verify tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%cost%';

-- Verify RLS policies
SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('site_visit_cost_submissions', 'cost_approval_history');

-- Verify trigger
SELECT tgname FROM pg_trigger 
WHERE tgname = 'trigger_record_cost_approval_history';

-- Test workflow (see examples below)
```

---

## Migration Steps

### Step 1: Apply SQL Migration

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/abznugnirnlrqnnfkein)
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy entire contents of `COST_APPROVAL_SYSTEM.sql`
5. Paste into SQL Editor
6. Click **Run** (or press Ctrl/Cmd + Enter)
7. Wait for success message

**Expected Output:**
```
========================================
COST APPROVAL SYSTEM MIGRATION COMPLETE!
========================================

Tables Created:
  ✓ site_visit_cost_submissions
  ✓ cost_approval_history

Views Created:
  ✓ pending_cost_approvals
  ✓ user_cost_submission_summary
  ✓ mmp_cost_submission_summary

Features Enabled:
  ✓ Actual cost submission by enumerators
  ✓ Admin/Finance approval workflow
  ✓ Automatic audit trail
  ✓ Row Level Security policies
  ✓ Auto-calculated totals
========================================
```

### Step 2: Verify Migration Success

Run this verification query in SQL Editor:

```sql
-- Check that tables were created
SELECT 
  'site_visit_cost_submissions' as table_name,
  count(*) as row_count
FROM site_visit_cost_submissions
UNION ALL
SELECT 
  'cost_approval_history',
  count(*)
FROM cost_approval_history;

-- Check that views exist
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN (
  'pending_cost_approvals',
  'user_cost_submission_summary',
  'mmp_cost_submission_summary'
);
```

**Expected Result:**
```
site_visit_cost_submissions | 0
cost_approval_history       | 0
(Plus 3 view names listed)
```

## Database Schema Details

### Table: `site_visit_cost_submissions`

Stores actual costs submitted by enumerators after site visit completion.

#### Key Columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `mmp_site_entry_id` | UUID | Link to site entry (mmp_site_entries) |
| `submitted_by` | UUID | Enumerator who submitted |
| `transportation_cost_cents` | BIGINT | Actual transport cost (in cents) |
| `accommodation_cost_cents` | BIGINT | Hotel/lodging costs (in cents) |
| `meal_allowance_cents` | BIGINT | Food costs (in cents) |
| `other_costs_cents` | BIGINT | Other expenses (in cents) |
| `total_cost_cents` | BIGINT | Auto-calculated total |
| `status` | VARCHAR | pending \| under_review \| approved \| rejected \| paid |
| `reviewed_by` | UUID | Admin/Finance who reviewed |
| `reviewer_notes` | TEXT | Review comments |
| `supporting_documents` | JSONB | Receipts, photos array |
| `wallet_transaction_id` | UUID | Payment link when paid |

#### Status Flow:

```
pending → under_review → approved → paid
                      ↓
                   rejected
```

### Table: `cost_approval_history`

Audit trail of all approval actions.

| Column | Type | Description |
|--------|------|-------------|
| `submission_id` | UUID | Link to submission |
| `action` | VARCHAR | submitted \| approved \| rejected \| paid |
| `actor_id` | UUID | User who performed action |
| `previous_status` | VARCHAR | Status before action |
| `new_status` | VARCHAR | Status after action |
| `notes` | TEXT | Action justification |
| `action_timestamp` | TIMESTAMPTZ | When action occurred |

## Security (RLS Policies)

### Enumerators Can:
- ✅ View their own submissions
- ✅ Create new submissions
- ✅ Update their pending submissions (before review)

### Admin/Finance Can:
- ✅ View all submissions
- ✅ Update any submission (approve/reject)
- ✅ View all history

### System Automatically:
- ✅ Records history on every status change
- ✅ Calculates total cost from component costs
- ✅ Updates timestamps

## Helper Views

### `pending_cost_approvals`
Shows all submissions awaiting approval with submitter details.

```sql
SELECT * FROM pending_cost_approvals 
WHERE days_pending > 3; -- Find old pending submissions
```

### `user_cost_submission_summary`
Aggregates submission stats per user.

```sql
SELECT * FROM user_cost_submission_summary
WHERE user_id = 'some-uuid';
```

### `mmp_cost_submission_summary`
Aggregates costs per MMP file.

```sql
SELECT * FROM mmp_cost_submission_summary
WHERE mmp_file_id = 'some-uuid';
```

## Migration Safety

This migration is **100% SAFE** because:

- ✅ Uses `CREATE TABLE IF NOT EXISTS` - never overwrites existing tables
- ✅ Uses `CREATE OR REPLACE` for functions - updates safely
- ✅ Uses `DROP POLICY IF EXISTS` before CREATE - prevents conflicts
- ✅ No DROP TABLE, DELETE, or TRUNCATE commands
- ✅ No ALTER TABLE on existing tables
- ✅ Fully idempotent - safe to run multiple times

## Rollback (If Needed)

If you need to remove these tables:

```sql
-- WARNING: This deletes all cost submission data!
DROP TABLE IF EXISTS public.cost_approval_history CASCADE;
DROP TABLE IF EXISTS public.site_visit_cost_submissions CASCADE;
DROP VIEW IF EXISTS pending_cost_approvals CASCADE;
DROP VIEW IF EXISTS user_cost_submission_summary CASCADE;
DROP VIEW IF EXISTS mmp_cost_submission_summary CASCADE;
DROP FUNCTION IF EXISTS record_cost_approval_action() CASCADE;
DROP FUNCTION IF EXISTS calculate_total_cost_submission() CASCADE;
DROP FUNCTION IF EXISTS update_cost_submission_timestamp() CASCADE;
```

## Workflow Example

### 1. Enumerator Submits Costs (After Site Visit)

```sql
INSERT INTO site_visit_cost_submissions (
  mmp_site_entry_id,
  submitted_by,
  transportation_cost_cents,
  accommodation_cost_cents,
  meal_allowance_cents,
  transportation_details,
  submission_notes
) VALUES (
  'mmp-site-entry-uuid',
  auth.uid(),
  5000, -- 50 SDG transport
  0,    -- No accommodation
  2000, -- 20 SDG meals
  'Bus fare: 30 SDG, Taxi: 20 SDG',
  'Rural area required additional transport'
);
-- Status: pending
-- History: Automatically recorded as 'submitted'
```

### 2. Finance Reviews and Approves

```sql
UPDATE site_visit_cost_submissions
SET 
  status = 'approved',
  reviewed_by = auth.uid(),
  reviewed_at = NOW(),
  approval_notes = 'Costs verified with receipts'
WHERE id = 'submission-uuid';
-- Status: approved
-- History: Automatically recorded as 'approved'
```

### 3. System Processes Payment

```sql
-- Frontend triggers wallet payment
-- Updates submission with wallet_transaction_id and paid_at
UPDATE site_visit_cost_submissions
SET 
  status = 'paid',
  wallet_transaction_id = 'wallet-txn-uuid',
  paid_at = NOW(),
  paid_amount_cents = 7000 -- Full approved amount
WHERE id = 'submission-uuid';
-- Status: paid
-- History: Automatically recorded as 'paid'
```

## Frontend Integration Points

After migration, implement:

1. **Cost Submission Form** (`SiteVisitCostSubmission.tsx`)
   - Enumerators enter actual costs after visit
   - Upload receipts/photos as proof
   - Submit for approval

2. **Approval Queue** (`CostApprovalQueue.tsx`)
   - Admin/Finance see pending submissions
   - Review details and supporting documents
   - Approve/reject with notes

3. **Wallet Integration** (`WalletContext.tsx`)
   - Auto-pay approved costs to enumerator wallets
   - Record transaction and update submission status

4. **Budget Integration** (`BudgetContext.tsx`)
   - Use actual approved costs for budget tracking
   - Replace fixed classification fees

## Testing Checklist

- [ ] Migration runs successfully without errors
- [ ] Tables created with correct schema
- [ ] RLS policies work (enumerators see only their submissions)
- [ ] Triggers calculate total cost correctly
- [ ] History records created on status changes
- [ ] Views return correct aggregated data

## Next Steps

1. ✅ Apply this SQL migration
2. ⏳ Create TypeScript types (`src/types/cost-submission.ts`)
3. ⏳ Build CostSubmissionContext provider
4. ⏳ Implement SiteVisitCostSubmission component
5. ⏳ Build CostApprovalQueue page
6. ⏳ Integrate wallet payment on approval

---

**Questions?** Check `replit.md` or ask in the project chat.
