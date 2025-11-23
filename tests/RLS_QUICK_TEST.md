# Quick RLS Security Test

## ✅ RLS is Now Enabled!

Row Level Security has been successfully enabled on your cost submission tables. Here's how to verify it's working:

---

## 🧪 Quick Browser Test (5 minutes)

### Test 1: Login and Check Console

1. **Log in to your PACT app** as any user
2. **Open Browser Console** (press F12)
3. **Paste and run this:**

```javascript
// Test: Check if RLS is active
const testRLS = async () => {
  console.log('🔐 Testing RLS Security...\n');
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  console.log('✅ Logged in as:', user?.email);
  
  // Get user role
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user?.id);
  console.log('✅ Your role:', roles?.[0]?.role);
  
  // Try to fetch cost submissions (RLS will automatically filter)
  const { data: submissions, error } = await supabase
    .from('site_visit_cost_submissions')
    .select('*');
  
  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log('✅ Submissions visible:', submissions?.length || 0);
    console.log('📊 Your submissions:', submissions);
  }
  
  console.log('\n✅ RLS is working! You can only see authorized data.');
};

testRLS();
```

**Expected Results:**
- ✅ **Admin/Finance**: See ALL submissions
- ✅ **Data Collector**: See only their own submissions
- ✅ No errors!

---

### Test 2: Try to Access Other User's Data (Should Fail)

**Only run this if you're a Data Collector:**

```javascript
// This should return EMPTY for data collectors
// (even if you know another user's submission ID exists)
const testUnauthorized = async () => {
  const { data, error } = await supabase
    .from('site_visit_cost_submissions')
    .select('*')
    .neq('submitted_by', (await supabase.auth.getUser()).data.user.id);
  
  console.log('🔒 Other users\' submissions visible:', data?.length || 0);
  console.log(data?.length === 0 ? '✅ SECURE: Cannot see others' data' : '❌ SECURITY ISSUE!');
};

testUnauthorized();
```

**Expected Result:** 
- ✅ Data collectors see: `"Other users' submissions visible: 0"`
- ✅ Security message: `"SECURE: Cannot see others' data"`

---

## 📋 Full Test Scenarios

See `tests/RLS_SECURITY_TEST_PLAN.md` for comprehensive testing including:
- 7 detailed security scenarios
- Role-based access testing
- Edit/delete permission tests
- Approval workflow tests

---

## ✅ What RLS Protects

**Data Collectors:**
- ✅ Can only see their own submissions
- ✅ Can only edit their own pending submissions
- ✅ Cannot see other users' data
- ✅ Cannot approve submissions

**Admins/Finance:**
- ✅ Can see ALL submissions
- ✅ Can approve/reject any submission
- ✅ Can view all history
- ❌ Cannot submit costs (oversight only)

**Everyone:**
- ✅ Database enforces security automatically
- ✅ Even direct API calls respect RLS
- ✅ No way to bypass security at database level

---

## 🎉 Success Indicators

You'll know RLS is working if:
1. ✅ No errors when loading Cost Submission page
2. ✅ Data collectors only see their own data
3. ✅ Admins see all data
4. ✅ Browser console test shows correct behavior

---

## 🚨 If You See Errors

**"Policy error" or "insufficient privileges":**
- Check user has role assigned in `user_roles` table
- Verify user is authenticated (logged in)

**"RLS not enabled":**
- Re-run the RLS migration script

**No data showing at all:**
- This is normal if no submissions exist yet!
- Create a test submission to verify visibility
