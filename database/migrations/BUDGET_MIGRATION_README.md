# Budget System Migration Guide

## Overview
This migration creates a comprehensive budget tracking system for the PACT platform, integrating with Projects, MMPs, Site Visits, and the Wallet system.

## What This Migration Creates

### Tables Created:
1. **project_budgets** - Overall project budget tracking
2. **mmp_budgets** - MMP-specific budget allocation and tracking
3. **budget_transactions** - All budget movements (allocations, spending, top-ups)
4. **budget_alerts** - Automated budget alerts and warnings

### Features:
- ✅ Multi-level budget hierarchy (Project → MMP → Site Visits)
- ✅ Automatic budget remaining calculations via triggers
- ✅ Automatic alert generation when budgets reach thresholds (80%, 100%)
- ✅ Category-based budget allocation (site visits, transportation, accommodation, meals, equipment)
- ✅ Budget top-up and reallocation support
- ✅ Comprehensive RLS policies for secure access
- ✅ Helper views for dashboard summaries
- ✅ Integration with wallet transactions

## How to Run This Migration

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Sign in and select your PACT project
3. Click **"SQL Editor"** in the left sidebar

### Step 2: Create New Query
1. Click **"New Query"** button (top right)
2. Copy the entire contents of `budget_system_schema.sql`
3. Paste into the SQL editor

### Step 3: Execute
1. Click **"Run"** button or press `Ctrl+Enter` / `Cmd+Enter`
2. Wait for "Success" message
3. Verify: You should see 4 new tables in your database

### Step 4: Initialize Project Budgets (Optional)
Run this function to create draft budgets for all existing projects:

```sql
SELECT initialize_project_budgets();
```

## Database Schema Overview

### Project Budgets Table
```sql
- id (UUID, PK)
- project_id (FK → projects)
- total_budget_cents (BIGINT) - Total project budget
- allocated_budget_cents (BIGINT) - Amount allocated to MMPs
- spent_budget_cents (BIGINT) - Amount actually spent
- remaining_budget_cents (BIGINT) - Auto-calculated
- budget_period (VARCHAR) - monthly/quarterly/annual/project_lifetime
- category_allocations (JSONB) - Budget breakdown by category
- status (VARCHAR) - draft/submitted/approved/active/closed/exceeded
```

### MMP Budgets Table
```sql
- id (UUID, PK)
- mmp_file_id (FK → mmp_files)
- project_budget_id (FK → project_budgets)
- allocated_budget_cents (BIGINT) - Budget for this MMP
- spent_budget_cents (BIGINT) - Amount spent
- remaining_budget_cents (BIGINT) - Auto-calculated
- total_sites (INTEGER) - Number of sites in MMP
- average_cost_per_site_cents (BIGINT) - Average cost per site
- category_breakdown (JSONB) - Category-based spending
- source_type (VARCHAR) - project_allocation/top_up/reallocation
- status (VARCHAR) - draft/active/completed/exceeded/closed
```

### Budget Transactions Table
```sql
- id (UUID, PK)
- project_budget_id (FK)
- mmp_budget_id (FK)
- site_visit_id (FK → site_visits)
- wallet_transaction_id (FK → wallet_transactions)
- transaction_type (VARCHAR) - allocation/spend/top_up/reallocation/adjustment/refund
- amount_cents (BIGINT)
- category (VARCHAR) - site_visits/transportation/accommodation/meals/equipment/other
- description (TEXT)
```

### Budget Alerts Table
```sql
- id (UUID, PK)
- project_budget_id or mmp_budget_id (FK)
- alert_type (VARCHAR) - low_budget/overspending/budget_exceeded/threshold_reached
- severity (VARCHAR) - info/warning/critical
- threshold_percentage (INTEGER) - 80, 100, etc.
- status (VARCHAR) - active/acknowledged/resolved/dismissed
```

## Automated Features

### 1. Auto-Calculate Remaining Budget
Triggers automatically update `remaining_budget_cents` whenever:
- Budget is allocated
- Spending is recorded
- Top-ups are added

### 2. Auto-Generate Alerts
When MMP budget reaches:
- **80% used** → Warning alert created
- **100% exceeded** → Critical alert created + status changed to 'exceeded'

### 3. Real-time Updates
All budget changes trigger Supabase Realtime events for:
- Live dashboard updates
- Instant notification delivery
- Synchronized multi-user views

## Integration with Existing Systems

### Wallet System Integration
- Site visit costs are automatically recorded as budget transactions
- Wallet withdrawals link to budget spending
- Complete financial audit trail

### Site Visit Integration
- Site visit completion → Record budget spend
- Cost tracking → Update MMP budget
- Automatic average cost per site calculation

### MMP Upload Integration
- New MMP uploaded → Create MMP budget (if project budget exists)
- Budget allocation from project budget
- Site count automatically tracked

## Usage Examples

### Create Project Budget
```sql
INSERT INTO project_budgets (
  project_id,
  total_budget_cents,
  budget_period,
  period_start_date,
  period_end_date,
  status
) VALUES (
  'project-uuid-here',
  50000000, -- SDG 500,000.00
  'annual',
  '2025-01-01',
  '2025-12-31',
  'active'
);
```

### Allocate Budget to MMP
```sql
INSERT INTO mmp_budgets (
  mmp_file_id,
  project_budget_id,
  allocated_budget_cents,
  total_sites,
  status
) VALUES (
  'mmp-uuid-here',
  'project-budget-uuid-here',
  10000000, -- SDG 100,000.00
  50, -- 50 sites
  'active'
);
```

### Record Site Visit Spend
```sql
-- This happens automatically when site visit cost is assigned
INSERT INTO budget_transactions (
  mmp_budget_id,
  site_visit_id,
  transaction_type,
  amount_cents,
  category,
  description
) VALUES (
  'mmp-budget-uuid',
  'site-visit-uuid',
  'spend',
  200000, -- SDG 2,000.00
  'site_visits',
  'Site visit #123 completed'
);

-- Update MMP budget spent amount
UPDATE mmp_budgets 
SET spent_budget_cents = spent_budget_cents + 200000
WHERE id = 'mmp-budget-uuid';
```

## Views for Dashboards

### Project Budget Summary
```sql
SELECT * FROM project_budget_summary 
WHERE project_id = 'your-project-id';
```

Returns:
- Project details
- Total/allocated/spent/remaining amounts
- MMP count
- Utilization percentage

### MMP Budget Summary
```sql
SELECT * FROM mmp_budget_summary 
WHERE mmp_file_id = 'your-mmp-id';
```

Returns:
- MMP details
- Budget allocation and spending
- Site counts
- Transaction count
- Utilization percentage

## Security (RLS Policies)

- **Users**: Can view budgets for their accessible projects
- **Admins/FOM/ICT**: Full access to all budgets
- **Budget Transactions**: Viewable by all, manageable by admins
- **Alerts**: Viewable by all, manageable by admins

## Rollback (If Needed)

To remove all budget tables:

```sql
DROP TABLE IF EXISTS budget_alerts CASCADE;
DROP TABLE IF EXISTS budget_transactions CASCADE;
DROP TABLE IF EXISTS mmp_budgets CASCADE;
DROP TABLE IF EXISTS project_budgets CASCADE;
DROP VIEW IF EXISTS project_budget_summary;
DROP VIEW IF EXISTS mmp_budget_summary;
DROP FUNCTION IF EXISTS update_project_budget_remaining();
DROP FUNCTION IF EXISTS update_mmp_budget_remaining();
DROP FUNCTION IF EXISTS check_budget_threshold();
DROP FUNCTION IF EXISTS initialize_project_budgets();
```

## Support

For issues or questions:
1. Check Supabase logs for error details
2. Verify RLS policies are enabled
3. Ensure user roles are properly assigned
4. Check that triggers are active

## Next Steps After Migration

1. ✅ Migration complete
2. Initialize project budgets for existing projects
3. Allocate budgets to MMPs
4. Configure budget alerts thresholds
5. Test budget tracking workflow
6. Monitor budget utilization in dashboards

---

**Migration Status:** Ready to deploy  
**Estimated Time:** 1-2 minutes  
**Impact:** No data loss, adds new functionality  
**Dependencies:** Requires existing projects, mmp_files, site_visits, wallet_transactions tables
