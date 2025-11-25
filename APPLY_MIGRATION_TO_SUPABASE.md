# Apply Down-Payment Migration to Supabase ✅

## 🎯 **Use This File**: `20251125_down_payment_system_CLEAN.sql`

**✅ FIXED**: Infinite recursion issue in super_admins RLS policies  
**✅ READY**: Migration now uses simple policies without circular dependencies

---

## 🚀 **Quick Setup (2 Minutes)**

### **Step 1: Open Supabase Dashboard**
Go to: https://supabase.com/dashboard

### **Step 2: Navigate to SQL Editor**
Click **"SQL Editor"** in the left sidebar

### **Step 3: Create New Query**
Click the **"+ New query"** button

### **Step 4: Copy & Paste**
Open `supabase/migrations/20251125_down_payment_system_CLEAN.sql` and copy **ALL** contents into the SQL Editor

### **Step 5: Run Migration**
Click the **"Run"** button ▶️

### **Step 6: Verify Success**
You should see:
```
✅ Migration completed successfully
✅ Tables: down_payment_requests, cost_adjustment_audit, super_admins, deletion_audit_log
✅ Enhanced: site_visit_costs (cost_status, calculated_by, calculation_notes)
✅ RLS policies, triggers, and functions created
✅ hub_id is TEXT type (matches profiles.hub_id)
```

### **Step 7: Refresh Your App**
Go back to your PACT app and refresh the page - all errors will be gone! 🎉

---

## 🐛 **Bug Fixed: Infinite Recursion**

### **Previous Issue:**
```
❌ ERROR: infinite recursion detected in policy for relation "super_admins"
```

**Cause**: RLS policies were checking if a user is a super-admin by querying the `super_admins` table, which triggered the same policy again → infinite loop!

### **Solution Applied:**
✅ Changed policies to check the `profiles` table for admin roles instead  
✅ Allows users to view their own super-admin record without recursion  
✅ Admins can manage super-admins by checking profiles table (no circular dependency)

**New Policy Logic:**
- **View Own Record**: `user_id = auth.uid()` (simple, no recursion)
- **Admin View All**: Check `profiles` table for admin role (breaks circular dependency)
- **Admin Manage**: Check `profiles` table for admin role (no recursion)

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

After running the migration, check your Supabase Dashboard:

1. **Go to**: Database → Tables
2. **You should see** these new tables:
   - `down_payment_requests`
   - `cost_adjustment_audit`
   - `super_admins`
   - `deletion_audit_log`

3. **Check `site_visit_costs`** table:
   - Should have 3 new columns: `cost_status`, `calculated_by`, `calculation_notes`

4. **Test Super-Admin functionality**:
   - Open your PACT app
   - Navigate to Super-Admin Management
   - No more "infinite recursion" errors! ✅

---

## ❌ **Troubleshooting**

### **If you get "already exists" errors:**
✅ **Already handled!** The CLEAN migration drops existing objects first.

### **If you get "text = uuid" type errors:**
✅ **Already fixed!** The migration uses TEXT for hub_id (matches profiles table).

### **If you still see "infinite recursion" errors:**
❌ Old migration still in database. Solution:
1. Run this migration (it will drop and recreate policies)
2. Hard refresh browser (Ctrl+Shift+R)
3. Check Supabase → Database → Policies to verify new policies exist

### **If tables don't appear in your app:**
1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Check browser console for new errors
3. Verify you're connected to the correct Supabase project

---

## 📋 **Next Steps After Migration**

Once migration is applied successfully:

1. ✅ **Refresh your PACT app** - All errors will disappear
2. ✅ **Test super-admin queries** - Should work without recursion errors
3. ✅ **Test the workflow**:
   - Admin can calculate/enter transportation costs before dispatch
   - Enumerators can request down-payments after assignment
   - Hub supervisors can approve (Tier 1)
   - Admins can process payments (Tier 2)
4. ✅ **Set up super-admins** (optional):
   - Navigate to Super-Admin Management
   - Appoint up to 3 super-admin accounts

---

## 🔧 **Technical Details**

### **Fixed RLS Policies:**

**Before (Infinite Recursion):**
```sql
-- ❌ This causes infinite loop!
CREATE POLICY "super_admins_view" ON super_admins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM super_admins  -- Queries same table!
      WHERE user_id = auth.uid()
    )
  );
```

**After (No Recursion):**
```sql
-- ✅ Breaks circular dependency
CREATE POLICY "super_admins_view_own" ON super_admins
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "super_admins_view_admin" ON super_admins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles  -- Checks different table!
      WHERE id = auth.uid() 
      AND role IN ('admin', 'ict')
    )
  );
```

---

**Migration File**: `supabase/migrations/20251125_down_payment_system_CLEAN.sql`  
**Status**: Ready to apply ✅  
**Infinite Recursion Bug**: Fixed ✅  
**Type Conflicts**: All resolved ✅  
**Policy Conflicts**: Handled with DROP IF EXISTS ✅
