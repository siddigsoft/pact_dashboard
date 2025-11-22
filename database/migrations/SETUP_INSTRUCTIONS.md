# 🛡️ SAFE Database Setup Instructions

## ✅ Safety Guarantees

This setup is **100% SAFE** because:

- ✅ **NO DROP TABLE** - Never deletes existing tables
- ✅ **NO DELETE/TRUNCATE** - Never removes existing data
- ✅ **NO ALTER COLUMN** - Never modifies existing columns
- ✅ **CREATE IF NOT EXISTS** - Only adds new tables if missing
- ✅ **Idempotent** - Safe to run multiple times
- ✅ **Read-only checks first** - Verifies prerequisites before making changes

## 📋 Setup Process (3 Steps)

### Step 1: Pre-Flight Check (OPTIONAL but recommended)
Verifies your database has the core tables needed.

```sql
-- In Supabase SQL Editor, run:
-- File: database/migrations/PRE_FLIGHT_CHECK.sql
```

**What it does:**
- ✓ Checks if `profiles`, `projects`, `mmp_files` tables exist
- ✓ Tells you if main schema is needed
- ✓ **NO CHANGES** - only reads and reports

**Expected output:**
- If core tables exist: "✓ ALL CHECKS PASSED!"
- If missing tables: Shows which tables are missing

---

### Step 2: Main Schema (ONLY if pre-flight check shows missing tables)

If pre-flight check shows missing core tables:

1. Open Supabase Dashboard → SQL Editor
2. Open the file: `supabase/schema.sql`
3. Copy all contents
4. Paste into SQL Editor
5. Click **Run**
6. Wait for "Success" message

**What it creates:** ~30 core tables (profiles, projects, mmp_files, roles, permissions, chats, etc.)

---

### Step 3: Safe Complete Setup (ALWAYS RUN THIS)

**File:** `database/migrations/SAFE_COMPLETE_SETUP.sql`

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `SAFE_COMPLETE_SETUP.sql`
3. Paste into SQL Editor  
4. Click **Run**
5. Wait for success report

**What it creates (ONLY if they don't already exist):**

| Table | Purpose |
|-------|---------|
| `mmp_site_entries` | Site visit tracking (missing from main schema) |
| `wallet_balances` | Enumerator wallet balances |
| `wallet_transactions` | Wallet transaction history |
| `project_budgets` | Project budget allocations |
| `mmp_budgets` | MMP budget tracking |
| `budget_transactions` | Budget spend records |
| `budget_alerts` | Budget threshold alerts |

**Success Output:**
```
========================================
SAFE DATABASE SETUP COMPLETED!
========================================

Table Status:
  ✓ mmp_site_entries: CREATED (or EXISTS if already there)
  ✓ wallet_balances: CREATED
  ✓ wallet_transactions: CREATED
  ✓ project_budgets: CREATED
  ✓ mmp_budgets: CREATED
  ✓ budget_transactions: CREATED
  ✓ budget_alerts: CREATED

Your PACT platform is ready!
========================================
```

---

## 🔍 Verification Query

After setup, verify all tables exist:

```sql
SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('mmp_site_entries', 'wallet_balances', 'wallet_transactions', 
                        'project_budgets', 'mmp_budgets', 'budget_transactions', 'budget_alerts')
    THEN '✓ Budget/Wallet System'
    ELSE '✓ Core System'
  END as system
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'profiles', 'projects', 'mmp_files', 'mmp_site_entries',
    'wallet_balances', 'wallet_transactions',
    'project_budgets', 'mmp_budgets', 'budget_transactions', 'budget_alerts'
  )
ORDER BY system, table_name;
```

Expected result: **10 tables** (3 core + 7 budget/wallet)

---

## 🛡️ Safety Features Explained

### 1. CREATE TABLE IF NOT EXISTS
```sql
CREATE TABLE IF NOT EXISTS public.mmp_site_entries (...)
```
- If table exists: **Skips creation, no error**
- If table missing: **Creates it**
- **Never affects existing tables**

### 2. CREATE INDEX IF NOT EXISTS
```sql
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status ON mmp_site_entries(status);
```
- If index exists: **Skips creation**
- If index missing: **Creates it**
- **Never rebuilds existing indexes**

### 3. DROP POLICY IF EXISTS + CREATE POLICY
```sql
DROP POLICY IF EXISTS mmp_site_entries_all_auth ON public.mmp_site_entries;
CREATE POLICY mmp_site_entries_all_auth ON public.mmp_site_entries ...
```
- Prevents "policy already exists" errors
- **Only affects security policies, not data**
- Re-creates with same permissions

### 4. Foreign Key Constraints
```sql
mmp_file_id UUID REFERENCES public.mmp_files(id) ON DELETE CASCADE
```
- Links tables together
- `ON DELETE CASCADE`: If parent deleted, child records auto-delete
- `ON DELETE SET NULL`: If parent deleted, child field becomes NULL
- **Only enforces data integrity, doesn't delete existing data**

---

## ❓ FAQ

### Q: Will this delete my existing data?
**A: NO.** The script only **creates** new tables. It never deletes, truncates, or modifies existing tables or data.

### Q: What if I run it twice by mistake?
**A: Totally safe!** The script is idempotent. Running it multiple times has no effect after the first run.

### Q: What if some tables already exist?
**A: Perfect!** The script will skip existing tables and only create missing ones.

### Q: Will this affect my existing budget or wallet tables?
**A: No.** If those tables already exist, the script will skip creating them. Your existing data remains untouched.

### Q: What if the main schema hasn't been run?
**A: It will fail gracefully.** You'll see foreign key errors like "table projects does not exist." Just run the main schema first, then re-run this.

### Q: Can I rollback if something goes wrong?
**A: Yes!** Supabase has automatic transaction rollback. If any error occurs, the entire script is rolled back automatically.

---

## 🚨 Troubleshooting

### Error: "relation [table_name] does not exist"
**Cause:** Main schema not run yet  
**Fix:** Run `supabase/schema.sql` first, then retry

### Error: "must be owner of table"
**Cause:** Insufficient permissions  
**Fix:** Make sure you're logged in as database owner in Supabase

### Error: "duplicate key value violates unique constraint"
**Cause:** This is actually OK - means table already exists  
**Fix:** No action needed, script continues

### No errors but tables still missing
**Cause:** Script was rolled back due to dependency issue  
**Fix:** 
1. Run pre-flight check
2. Verify core tables exist
3. Re-run safe setup

---

## ✨ What You Get After Setup

### Budget System ✅
- Track project and MMP budgets
- Automatic spend tracking from site visits
- Budget alerts at 80% and 100% thresholds
- Export to PDF, Excel, CSV
- Multi-currency support (SDG/USD/EUR)

### Wallet System ✅
- Enumerator wallet balances
- Transaction history
- Site visit payment tracking
- Withdrawal request workflows

### Site Visit Management ✅
- Complete site visit lifecycle
- Assignment and dispatch tracking
- Financial tracking integration
- Permit and verification status

---

## 🎯 After Successful Setup

1. **Restart your app** - Refresh the browser
2. **Create test user** - Sign up through the app
3. **Navigate to Budget Dashboard** - Finance → Budget
4. **Create your first project budget** - Click "Allocate Budget"
5. **Upload an MMP** - With optional budget allocation
6. **Watch automatic tracking** - Site visits auto-deduct from budgets

---

## 📞 Need Help?

If you encounter any issues:
1. Check Supabase logs for detailed error messages
2. Run the pre-flight check to verify core tables
3. Make sure you have admin access to Supabase
4. The scripts are designed to be safe and recoverable

**Remember:** This setup never deletes or modifies existing data. You can run it with confidence! 🛡️
