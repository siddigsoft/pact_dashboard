# Cost Submission Page Issue - Full Diagnosis

## Problem
Cost submission page times out for user: vierycalliper@gmail.com

## Root Cause Analysis

### RLS Policies Check User Roles Table
Looking at `supabase/migrations/20251123_enable_cost_submission_rls.sql`, the policies check:

```sql
-- For viewing all submissions (admin/finance):
EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = auth.uid() 
  AND LOWER(role) IN ('admin', 'financialadmin', 'fom', 'ict')
)

-- For data collectors (viewing own):
submitted_by = auth.uid()
```

**This means:**
- ✅ **Data collectors** can view/create/update/delete **ONLY their own** submissions
- ✅ **Admins/Finance** can view/update **ALL** submissions

**User does NOT need a classification column in profiles table!**

## Diagnostic Steps

### Step 1: Check if user exists in Supabase Auth

Run in browser console (F12):

```javascript
const { data: { user }, error } = await supabase.auth.getUser();
console.log('User ID:', user?.id);
console.log('Email:', user?.email);
console.log('Auth Error:', error);
```

Expected: User ID should be a valid UUID

### Step 2: Test database access directly

```javascript
// Test 1: Can you access site_visit_cost_submissions?
const { data: submissions, error: subError } = await supabase
  .from('site_visit_cost_submissions')
  .select('count');

console.log('Submissions count:', submissions);
console.log('Error accessing submissions:', subError);

// Test 2: Can you access site_visits?
const { data: visits, error: visitError } = await supabase
  .from('site_visits')
  .select('count');

console.log('Visits count:', visits);
console.log('Error accessing visits:', visitError);

// Test 3: Check profiles table
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.id)
  .single();

console.log('Profile:', profile);
console.log('Profile Error:', profileError);
```

### Step 3: Check if tables exist in Supabase

Go to Supabase Dashboard:
1. https://supabase.com/dashboard/project/abznugnirnlrqnnfkein
2. Go to **Table Editor**
3. Verify these tables exist:
   - ✅ `profiles`
   - ✅ `user_roles`
   - ✅ `site_visit_cost_submissions`
   - ✅ `cost_approval_history`
   - ✅ `site_visits`

### Step 4: Check RLS policies are enabled

In Supabase SQL Editor, run:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('site_visit_cost_submissions', 'cost_approval_history');

-- Check policies exist
SELECT policyname, tablename, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename LIKE '%cost%';
```

Expected:
- Both tables should have `rowsecurity = true`
- Should see 7 policies (5 for submissions, 2 for history)

## Common Issues & Fixes

### Issue 1: Tables Don't Exist
**Symptom:** Error "relation 'site_visit_cost_submissions' does not exist"
**Fix:** Need to run migration in Supabase SQL Editor:
- File: `supabase/migrations/20251123_cost_submission_system.sql`

### Issue 2: RLS Not Enabled
**Symptom:** Can't access any data even though logged in
**Fix:** Run in Supabase SQL Editor:
- File: `supabase/migrations/20251123_enable_cost_submission_rls.sql`

### Issue 3: Page Hangs/Timeouts
**Symptom:** Page loads forever, browser console shows no errors
**Possible causes:**
- Supabase queries timing out
- RLS policies blocking queries (should show error, not timeout)
- React Query stuck in loading state
- Network issue

**Debug:** Open browser Network tab (F12 → Network), reload page, look for:
- Failed Supabase API calls
- 401/403 errors (auth/permission issues)
- Timeouts

### Issue 4: User Has No Completed Site Visits
**Symptom:** Page loads but shows "No Completed Site Visits"
**This is EXPECTED!** The page works correctly, but:
- User has no site visits with status = 'completed' assigned to them
- User cannot submit costs without completed site visits

**To verify this is the case:**
```javascript
const { data: { user } } = await supabase.auth.getUser();
const { data: visits } = await supabase
  .from('site_visits')
  .select('*')
  .eq('assigned_to', user.id)
  .eq('status', 'completed');

console.log('Completed site visits:', visits?.length || 0);
```

## What To Do Next

Based on the diagnostic results:

### If tables don't exist:
→ Run migrations in Supabase SQL Editor

### If RLS blocks access with error:
→ Check RLS policies are correct

### If page times out with no error:
→ Check Network tab for failed API calls
→ Check if Supabase project is accessible
→ Verify Supabase env vars are correct

### If page loads but shows "No Completed Site Visits":
→ This is WORKING CORRECTLY!
→ User needs completed site visits to submit costs
→ Admin needs to assign site visits to this user
