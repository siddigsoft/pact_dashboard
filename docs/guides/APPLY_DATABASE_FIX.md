# 🔧 Database Fix - Apply Pending Cost Approvals View

## Issue Detected

Your application is looking for a database view called `pending_cost_approvals` that hasn't been applied to your Supabase database yet.

**Error Message:**
```
Could not find the table 'public.pending_cost_approvals' in the schema cache
```

---

## ✅ Solution

The migration file already exists and is correct:
- **File:** `supabase/migrations/20251123_cost_submission_system.sql`
- **Lines:** 122-138
- **Status:** Migration written but not applied to database

---

## 🚀 How to Apply the Fix

### **Option 1: Supabase Dashboard (Recommended)** ⚡

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your `pact_dashboard` project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and paste this SQL:**

```sql
-- Create pending_cost_approvals view
CREATE OR REPLACE VIEW pending_cost_approvals AS
SELECT 
  cs.*,
  p.full_name as submitter_name,
  p.email as submitter_email,
  sv.site_name,
  sv.status as site_visit_status,
  mf.name as mmp_name,
  proj.name as project_name,
  EXTRACT(DAY FROM (NOW() - cs.submitted_at)) as days_pending
FROM site_visit_cost_submissions cs
LEFT JOIN profiles p ON cs.submitted_by = p.id
LEFT JOIN site_visits sv ON cs.site_visit_id = sv.id
LEFT JOIN mmp_files mf ON cs.mmp_file_id = mf.id
LEFT JOIN projects proj ON cs.project_id = proj.id
WHERE cs.status IN ('pending', 'under_review')
ORDER BY cs.submitted_at ASC;

-- Add comment
COMMENT ON VIEW pending_cost_approvals IS 'Helper view for finance/admin to see all pending cost approvals with submitter details';
```

4. **Click "Run"** (or press Ctrl+Enter)

5. **Verify Success**
   - You should see: "Success. No rows returned"
   - The view is now created! ✅

---

### **Option 2: Using Supabase CLI** 🔧

If you have the Supabase CLI installed:

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref abznugnirnlrqnnfkein

# Push the migration
supabase db push
```

---

### **Option 3: Apply Full Migration File** 📋

If you need to apply the entire cost submission system (recommended if you haven't already):

1. Open the SQL Editor in Supabase Dashboard
2. Copy the entire contents of `supabase/migrations/20251123_cost_submission_system.sql`
3. Paste into SQL Editor
4. Click "Run"

This will create:
- ✅ `site_visit_cost_submissions` table
- ✅ `cost_approval_history` table
- ✅ `pending_cost_approvals` view
- ✅ All necessary indexes and triggers

---

## 🔍 Verify the Fix

After applying the migration:

1. **Refresh your PACT application**
   - The error should disappear from the browser console

2. **Check in Supabase Dashboard:**
   - Go to: Database → Views
   - You should see `pending_cost_approvals` listed

3. **Test the view:**
   ```sql
   SELECT * FROM pending_cost_approvals LIMIT 5;
   ```

---

## 📊 What This View Does

The `pending_cost_approvals` view provides a convenient way to see all pending cost submissions with enriched data:

- **Submission details** from `site_visit_cost_submissions`
- **Submitter information** (name, email) from `profiles`
- **Site visit details** (name, status) from `site_visits`
- **MMP and project names** for context
- **Days pending** calculation (auto-calculated)

### **Usage in the App:**

This view is used in:
- **Financial Operations page** - Cost approval queue
- **Admin dashboards** - Pending approvals count
- **Cost submission context** - `usePendingCostApprovals()` hook

---

## ⚠️ Important Notes

1. **Production Safety:**
   - This is a CREATE OR REPLACE operation (safe to re-run)
   - No data is modified, only a view is created
   - View is read-only

2. **Dependencies:**
   - Requires these tables to exist:
     - `site_visit_cost_submissions`
     - `profiles`
     - `site_visits`
     - `mmp_files`
     - `projects`

3. **RLS Policies:**
   - View inherits RLS policies from underlying tables
   - Admins and Financial Admins can see all records
   - Regular users see only their own submissions

---

## 🐛 Troubleshooting

### **Error: "relation does not exist"**

One or more required tables don't exist. Run the full migration:

```sql
-- Check which tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'site_visit_cost_submissions',
  'profiles',
  'site_visits',
  'mmp_files',
  'projects'
);
```

If any are missing, apply the full migration file.

---

### **Error: "permission denied"**

You need database admin permissions. Ensure:
- You're logged into the correct Supabase project
- Your account has Owner or Admin role

---

### **View appears but still shows error**

Clear your browser cache and refresh:
1. Open DevTools (F12)
2. Right-click Refresh button
3. Select "Empty Cache and Hard Reload"

Or in Supabase Dashboard:
1. Database → Views
2. Find `pending_cost_approvals`
3. Click "..." → "Drop View"
4. Re-run the CREATE VIEW SQL above

---

## ✅ Success Indicators

After applying the fix, you should see:

1. **Browser Console:**
   - ❌ OLD: `Error fetching pending approvals: ...`
   - ✅ NEW: No errors

2. **Financial Operations Page:**
   - Pending approvals section loads correctly
   - Cost submissions display without errors

3. **Database:**
   - View appears in: Database → Views → `pending_cost_approvals`
   - Query returns results: `SELECT * FROM pending_cost_approvals;`

---

## 📞 Support

If you encounter issues:

1. **Check migration file exists:**
   ```bash
   ls -la supabase/migrations/20251123_cost_submission_system.sql
   ```

2. **View Supabase logs:**
   - Dashboard → Logs → Database Logs
   - Look for any errors during view creation

3. **Test connection:**
   ```bash
   # In project directory
   npm run test:db
   ```

---

**Last Updated:** November 23, 2025  
**Migration File:** `supabase/migrations/20251123_cost_submission_system.sql`  
**View Name:** `pending_cost_approvals`

---

*After applying this fix, the "pending_cost_approvals not found" error will be resolved and your cost approval workflow will function correctly.*
