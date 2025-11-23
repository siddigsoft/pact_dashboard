# RLS Security Test Plan for Cost Submissions

This document outlines how to test Row Level Security policies for the cost submission system.

## Prerequisites

- RLS policies enabled (run `supabase/migrations/20251123_enable_cost_submission_rls.sql`)
- At least 2 test users:
  - User A: Data Collector role
  - User B: Admin/Finance role

## Test Scenarios

### Test 1: Data Collector Can Only See Own Submissions ✅

**Setup:**
1. Log in as Data Collector (User A)
2. Create a cost submission
3. Log out

**Expected Results:**
- ✅ User A can create submission
- ✅ User A can see their own submission
- ✅ User A CANNOT see submissions from other users

**SQL Verification (run in Supabase):**
```sql
-- Count total submissions
SELECT COUNT(*) as total_submissions FROM site_visit_cost_submissions;

-- Count what User A can see (replace with User A's ID)
SELECT COUNT(*) as user_visible 
FROM site_visit_cost_submissions 
WHERE submitted_by = 'USER_A_UUID_HERE';
```

---

### Test 2: Admin Can See All Submissions ✅

**Setup:**
1. Have User A (Data Collector) create a submission
2. Log in as Admin (User B)
3. Navigate to Cost Submission page

**Expected Results:**
- ✅ Admin can see ALL submissions (including User A's)
- ✅ Admin can see "All Submissions" tab
- ✅ Admin CANNOT see "Submit Costs" tab (not allowed to submit)

**SQL Verification:**
```sql
-- This should work for admin (shows all submissions)
SELECT * FROM site_visit_cost_submissions;
```

---

### Test 3: Data Collector Cannot See Other Users' Submissions ❌

**Setup:**
1. User A creates a submission
2. Log in as different Data Collector (User C)
3. Navigate to Cost Submission page

**Expected Results:**
- ✅ User C sees ONLY their own submissions
- ❌ User C CANNOT see User A's submissions
- ✅ User C can create new submission

**Browser Test:**
1. Log in as User C
2. Go to `/cost-submission`
3. Check "My Submissions" tab
4. Should be empty (or only show User C's submissions)

---

### Test 4: Data Collector Can Update Own Pending Submission ✅

**Setup:**
1. Log in as User A
2. Create a submission (status = 'pending')
3. Edit the submission details
4. Save changes

**Expected Results:**
- ✅ User A can edit their own pending submission
- ✅ Changes are saved successfully

**Try This:**
- User A edits someone else's submission → Should FAIL

---

### Test 5: Data Collector Cannot Update Approved Submissions ❌

**Setup:**
1. Admin approves User A's submission (status = 'approved')
2. Log in as User A
3. Try to edit the approved submission

**Expected Results:**
- ❌ User A CANNOT edit approved submission
- ✅ Error message shown

---

### Test 6: Admin Can Approve Any Submission ✅

**Setup:**
1. User A creates a pending submission
2. Log in as Admin
3. Navigate to submission details
4. Approve the submission

**Expected Results:**
- ✅ Admin can change status to 'approved'
- ✅ Admin can add reviewer notes
- ✅ Approval history is recorded

---

### Test 7: Data Collector Can Delete Own Pending Submission ✅

**Setup:**
1. User A creates a submission
2. User A deletes the submission

**Expected Results:**
- ✅ User A can delete their own pending submission
- ❌ User A CANNOT delete approved submissions
- ❌ User A CANNOT delete other users' submissions

---

## Browser Console Tests

Open browser console and run these tests:

### Test: Fetch All Submissions (as Data Collector)
```javascript
// This should only return your own submissions
const { data, error } = await window.supabase
  .from('site_visit_cost_submissions')
  .select('*');

console.log('My submissions:', data?.length);
// Should match count of submissions you created
```

### Test: Try to Read Someone Else's Submission
```javascript
// Replace with another user's submission ID
const { data, error } = await window.supabase
  .from('site_visit_cost_submissions')
  .select('*')
  .eq('id', 'OTHER_USER_SUBMISSION_ID');

console.log('Result:', data);
// Should be empty array for data collectors
```

### Test: Admin Fetches All Submissions
```javascript
// Log in as Admin, then run:
const { data, error } = await window.supabase
  .from('site_visit_cost_submissions')
  .select('*');

console.log('All submissions visible to admin:', data?.length);
// Should show ALL submissions from all users
```

---

## SQL Direct Tests (Supabase Dashboard)

### Test: Verify RLS is Active
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('site_visit_cost_submissions', 'cost_approval_history');
```
**Expected:** Both tables show `rowsecurity = true`

### Test: List All Policies
```sql
SELECT policyname, tablename, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename LIKE '%cost%'
ORDER BY tablename, cmd;
```
**Expected:** 8 policies total
- 5 on site_visit_cost_submissions (SELECT, INSERT, 2x UPDATE, DELETE)
- 2 on cost_approval_history (SELECT, INSERT)

---

## Success Criteria

✅ All tests above pass
✅ Data collectors can only see/edit their own submissions
✅ Admins can see/approve all submissions
✅ No unauthorized data access possible
✅ Approval history is properly protected

## If Tests Fail

Check these common issues:
1. RLS not enabled: Re-run the RLS migration SQL
2. Policies missing: Verify all 8 policies exist
3. User roles not set: Ensure users have proper roles in `user_roles` table
4. Auth context: Make sure `auth.uid()` is working (user is logged in)
