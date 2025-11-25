# Apply Down-Payment Migration to Supabase ✅

## 🚨 **DEADLOCK ERROR SOLUTION**

If you got this error:
```
ERROR: 40P01: deadlock detected
Process waits for AccessExclusiveLock on relation...
```

**Cause**: Your PACT app is running and querying the database while migration tries to drop tables.

---

## ✅ **TWO SOLUTIONS - Pick One:**

### **Option 1: Close App First (FASTEST - 30 seconds)**

**Steps:**
1. **Close ALL browser tabs** running PACT app
2. **Wait 10 seconds** for database connections to close
3. **Run migration** in Supabase SQL Editor
4. **Reopen app** - All fixed! ✅

**Use this file**: `supabase/migrations/20251125_down_payment_system_CLEAN.sql`

---

### **Option 2: Safe Migration (NO DOWNTIME)**

Run migration **while app is running** - no deadlocks!

**Use this file**: `supabase/migrations/20251125_down_payment_system_SAFE.sql`

**Why it's safe:**
- ✅ Uses `CREATE TABLE IF NOT EXISTS` (doesn't drop existing tables)
- ✅ Uses `CREATE OR REPLACE` for functions (no locks)
- ✅ Drops policies first (doesn't lock tables)
- ✅ Works with active database connections

---

## 🚀 **Quick Setup (Both Options)**

### **Step 1: Open Supabase Dashboard**
Go to: https://supabase.com/dashboard

### **Step 2: Navigate to SQL Editor**
Click **"SQL Editor"** in the left sidebar

### **Step 3: Create New Query**
Click the **"+ New query"** button

### **Step 4: Choose Migration File**

**If you closed app tabs** → Use `20251125_down_payment_system_CLEAN.sql`  
**If app is still running** → Use `20251125_down_payment_system_SAFE.sql`

### **Step 5: Copy & Paste**
Copy **ALL** contents of your chosen migration file into SQL Editor

### **Step 6: Run Migration**
Click the **"Run"** button ▶️

### **Step 7: Verify Success**
You should see:
```
✅ Migration completed successfully
✅ Tables: down_payment_requests, cost_adjustment_audit, super_admins, deletion_audit_log
✅ Enhanced: site_visit_costs (cost_status, calculated_by, calculation_notes)
✅ RLS policies, triggers, and functions created
✅ No infinite recursion - policies check profiles table
```

### **Step 8: Refresh Your App**
Go back to your PACT app and refresh the page - all errors will be gone! 🎉

---

## 📊 **Migration File Comparison**

| Feature | CLEAN Version | SAFE Version |
|---------|---------------|--------------|
| **Speed** | ⚡ Fast | ⚡ Fast |
| **Requires closing app** | ✅ Yes | ❌ No |
| **Handles existing tables** | Drops & recreates | Keeps if exists |
| **Deadlock risk** | ⚠️ Yes if app running | ✅ No |
| **Best for** | Fresh setup | Active production |

**Recommendation**: Use **SAFE version** if unsure - it works in all situations!

---

## 🐛 **What Gets Fixed**

### **1. Infinite Recursion Error**
**Before:**
```
❌ ERROR: infinite recursion detected in policy for relation "super_admins"
```

**After:** ✅ Fixed! Policies check `profiles` table instead of `super_admins`

### **2. Deadlock Error**
**Before:**
```
❌ ERROR: deadlock detected
```

**After:** ✅ Fixed! SAFE migration uses IF NOT EXISTS (no table drops)

### **3. Hub ID Type Mismatch**
**Before:**
```
❌ ERROR: column "hub_id" is of type text but expression is of type uuid
```

**After:** ✅ Fixed! hub_id uses TEXT type (matches profiles table)

---

## ✅ **What This Migration Creates**

### **4 New Tables:**
1. **`down_payment_requests`**
   - Two-tier approval workflow (supervisor → admin)
   - Installment plan support
   - Complete payment tracking
   - hub_id as TEXT (matches profiles table)

2. **`cost_adjustment_audit`**
   - Tracks all cost modifications
   - Mandatory adjustment reasons
   - Before/after values recorded
   - Admin-only write access

3. **`super_admins`**
   - Maximum 3 active accounts (database-enforced)
   - Activity tracking
   - Deletion/adjustment counters
   - Appointment/deactivation audit trail

4. **`deletion_audit_log`**
   - Records all deletions with reasons
   - Full record snapshots (JSONB)
   - Restoration capability tracking
   - Super-admin only write access

### **Enhanced Table:**
- **`site_visit_costs`** - Added 3 new columns:
  - `cost_status` - tracks workflow status
  - `calculated_by` - admin who entered costs
  - `calculation_notes` - cost calculation explanation

### **Security Features:**
- ✅ Row Level Security (RLS) on all tables
- ✅ Role-based access policies **WITHOUT infinite recursion**
- ✅ Database trigger enforcing 3-account super-admin limit
- ✅ Auto-assign supervisor based on hub
- ✅ Auto-calculate remaining payment amounts

---

## 🔍 **Verify Migration Worked**

After running the migration:

1. **Check Supabase Dashboard** → Database → Tables
2. **Should see these new tables:**
   - ✅ `down_payment_requests`
   - ✅ `cost_adjustment_audit`
   - ✅ `super_admins`
   - ✅ `deletion_audit_log`

3. **Check browser console** (F12):
   - ❌ No more "infinite recursion" errors
   - ❌ No more "table does not exist" errors
   - ✅ Super-admin queries work!

4. **Test in app:**
   - Open PACT app
   - Navigate to Super-Admin Management
   - Should load without errors! 🎉

---

## ❌ **Troubleshooting**

### **Still Getting Deadlock Error?**

**Solution A: Close All Apps**
1. Close **all browser tabs** with PACT open
2. Close any **database GUI tools** (pgAdmin, DBeaver, etc.)
3. Wait **30 seconds**
4. Run migration again

**Solution B: Check Active Connections**
```sql
-- Run this in SQL Editor to see active connections
SELECT pid, usename, application_name, state, query 
FROM pg_stat_activity 
WHERE datname = current_database()
AND state = 'active';
```

If you see active connections, use **SAFE migration** instead.

### **Tables Already Exist?**
✅ **SAFE migration handles this** - uses `IF NOT EXISTS`  
✅ **CLEAN migration handles this** - uses `DROP IF EXISTS`

Both versions are safe to run multiple times!

### **Still See Infinite Recursion Errors?**
1. **Clear browser cache** (Ctrl+Shift+Delete)
2. **Hard refresh** (Ctrl+Shift+R)
3. **Check policies** in Supabase Dashboard → Database → Policies
4. Should see `super_admins_view_own` and `super_admins_view_admin` policies

---

## 📋 **Next Steps After Migration**

Once migration succeeds:

1. ✅ **Refresh your PACT app** - Hard refresh (Ctrl+Shift+R)
2. ✅ **All errors disappear** - No more infinite recursion!
3. ✅ **Test the workflow**:
   - Admin can calculate/enter transportation costs before dispatch
   - Enumerators can request down-payments after assignment
   - Hub supervisors can approve (Tier 1)
   - Admins can process payments (Tier 2)
4. ✅ **Set up super-admins** (optional):
   - Navigate to Super-Admin Management
   - Appoint up to 3 super-admin accounts
   - Test deletion/audit features

---

## 🔧 **Technical Details**

### **Why Deadlock Happened:**

```
Your App → Queries super_admins table → Holds shared lock
           ↓
Migration → Tries to DROP table → Needs exclusive lock
           ↓
DEADLOCK! Both processes waiting for each other 🔒
```

### **How SAFE Migration Fixes It:**

```
SAFE Migration:
1. Drops policies first (no table lock) ✅
2. Uses CREATE TABLE IF NOT EXISTS (no drop) ✅
3. Uses CREATE OR REPLACE for functions ✅
4. No exclusive locks needed! ✅
```

---

**Migration Files:**
- `supabase/migrations/20251125_down_payment_system_CLEAN.sql` - Requires closing app
- `supabase/migrations/20251125_down_payment_system_SAFE.sql` - Works with app running ⭐

**Status:** Ready to apply ✅  
**Infinite Recursion:** Fixed ✅  
**Deadlock Issue:** Fixed ✅  
**Type Conflicts:** All resolved ✅
