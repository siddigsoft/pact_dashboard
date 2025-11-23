# Cost Submission Page Access Test

## Issue
Cost submission page times out when loading - likely RLS blocking database access.

## Which Database?
**SUPABASE** - Project ID: `abznugnirnlrqnnfkein`

Tables being queried:
- `site_visit_cost_submissions` (from Supabase)
- `profiles` (from Supabase) 
- `site_visits` (from Supabase)

## Test Your Access

### Step 1: Check Your User Role

Open browser console (F12) on your PACT app and run:

```javascript
// Test 1: Check current user
const { data: { user } } = await supabase.auth.getUser();
console.log('Logged in as:', user?.email);
console.log('User ID:', user?.id);

// Test 2: Check your profile
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.id)
  .single();
console.log('Profile:', profile);
console.log('Role:', profile?.role);
console.log('Classification:', profile?.classification);
console.log('Profile Error:', profileError);

// Test 3: Try to access cost submissions
const { data: submissions, error: submissionError } = await supabase
  .from('site_visit_cost_submissions')
  .select('*');
console.log('Submissions visible:', submissions?.length || 0);
console.log('Submission Error:', submissionError);

// Test 4: Check site visits
const { data: siteVisits, error: siteVisitError } = await supabase
  .from('site_visits')
  .select('*');
console.log('Site visits visible:', siteVisits?.length || 0);
console.log('Site visit Error:', siteVisitError);
```

### Expected Results

**For Admin users:**
- ✅ Profile role: `"admin"` or classification: `"admin"`
- ✅ Can see ALL cost submissions (all users)
- ✅ Can see ALL site visits

**For Data Collector users:**
- ✅ Profile classification includes `"data_collector"`
- ✅ Can see ONLY their own cost submissions
- ✅ Can see ONLY their assigned site visits

**For Other users:**
- ❌ Will see RLS policy error - NOT AUTHORIZED

## Common Issues

### Issue 1: User Has No Role/Classification
**Symptom:** Profile has `role: null` or empty classification
**Fix:** Need to set user role in Supabase dashboard

### Issue 2: RLS Policy Denies Access
**Symptom:** Error like "new row violates row-level security policy"
**Fix:** Check RLS policies in `supabase/migrations/20251123_enable_cost_submission_rls.sql`

### Issue 3: Tables Don't Exist
**Symptom:** Error like "relation does not exist"
**Fix:** Need to run migration `SUPABASE_COMPLETE_SETUP.sql`

## How to Fix Role Issues

If your user has no role/classification, update it in Supabase:

1. Go to: https://supabase.com/dashboard/project/abznugnirnlrqnnfkein
2. Navigate to: **Table Editor** → **profiles** table
3. Find your user by email
4. Set:
   - `role`: `"admin"` OR
   - `classification`: `["admin"]` OR `["data_collector"]`
5. Save changes
6. Reload your PACT app
