# Database Setup Instructions

## Overview
Your PACT platform requires a complete database schema setup. This guide will walk you through setting up all required tables in the correct order.

## Prerequisites
- Access to your Supabase project dashboard
- SQL Editor access in Supabase

## Setup Steps

### Step 1: Run Main Schema (FIRST)
This creates all the core tables like `profiles`, `projects`, `mmp_files`, etc.

1. Open your Supabase dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `supabase/schema.sql`
5. Click **Run**
6. Wait for completion (should see "Success" message)

### Step 2: Run Complete Database Setup (SECOND)
This creates the missing `mmp_site_entries` table plus wallet and budget tables.

1. In SQL Editor, create a new query
2. Copy and paste the contents of `database/migrations/COMPLETE_DATABASE_SETUP.sql`
3. Click **Run**
4. You should see a success message listing all created tables

### Step 3: Verify Installation
Run this query to verify all tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'profiles',
  'projects',
  'mmp_files',
  'mmp_site_entries',
  'wallet_balances',
  'wallet_transactions',
  'project_budgets',
  'mmp_budgets',
  'budget_transactions',
  'budget_alerts'
)
ORDER BY table_name;
```

You should see all 10 tables listed.

## What Gets Created

### Core Tables (from main schema)
- `profiles` - User accounts and information
- `projects` - Project management
- `mmp_files` - Monthly Monitoring Plans
- `user_roles` - User role assignments
- `roles` - Role definitions
- `permissions` - Permission assignments
- Plus 20+ other supporting tables

### Extended Tables (from complete setup)
- **`mmp_site_entries`** - Site visit tracking (was missing from main schema)
- **Wallet System:**
  - `wallet_balances` - User wallet balances
  - `wallet_transactions` - Wallet transaction history
- **Budget System:**
  - `project_budgets` - Project-level budgets
  - `mmp_budgets` - MMP-level budgets  
  - `budget_transactions` - Budget spend tracking
  - `budget_alerts` - Budget threshold alerts

## Troubleshooting

### Error: "relation does not exist"
- Make sure you ran the main schema FIRST
- The complete setup depends on tables from the main schema

### Error: "column does not exist"
- This usually means the main schema wasn't run completely
- Re-run `supabase/schema.sql`

### Error: "duplicate key value"
- Tables already exist - this is safe to ignore
- The script uses `CREATE TABLE IF NOT EXISTS`

## After Setup

Once all tables are created:

1. **Create your first user** - Sign up through the app
2. **Access Budget Dashboard** - Navigate to Finance > Budget
3. **Create Project Budgets** - Allocate budgets to your projects
4. **Upload MMPs** - Upload Monthly Monitoring Plans with budget allocation
5. **Track Spending** - Budget system automatically tracks site visit costs

## Features Enabled After Setup

✅ **Budget Tracking** - Complete budget management for projects and MMPs  
✅ **Wallet System** - Enumerator wallet balances and transactions  
✅ **Site Visit Management** - Full site visit tracking with `mmp_site_entries`  
✅ **Financial Reports** - Export budgets to PDF, Excel, and CSV  
✅ **Budget Alerts** - Automatic alerts at 80% and 100% thresholds  
✅ **Multi-currency Support** - SDG, USD, and EUR currencies  

## Need Help?

If you encounter any issues during setup:
1. Check the Supabase logs for detailed error messages
2. Verify your database connection
3. Make sure you have admin access to your Supabase project
4. The setup scripts are idempotent - safe to run multiple times
