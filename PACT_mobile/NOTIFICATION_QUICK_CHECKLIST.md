# Push Notification Setup - Quick Checklist

## Required Fixes (Before Notifications Work)

### ❌ Problem 1: Missing `fcm_tokens` Column in Profiles Table
**Status:** Not created yet (likely)  
**Impact:** App can't save FCM tokens → Edge Functions can't find tokens → No notifications sent  
**Fix Time:** 2 minutes

- [ ] Go to Supabase Dashboard → SQL Editor
- [ ] Open file: `SUPABASE_NOTIFICATION_SETUP.sql`
- [ ] Copy-paste entire contents into SQL Editor
- [ ] Click **Run**
- [ ] See "ALTER TABLE" message for profiles

**Verify it worked:**
```sql
SELECT 'fcm_tokens' FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'fcm_tokens';
```
Expected: ✅ One row returned

---

### ❌ Problem 2: Firebase Service Account Secret Not Set
**Status:** Not configured  
**Impact:** Edge Functions can't authenticate with Firebase → Can't send FCM → No notifications  
**Fix Time:** 5 minutes

- [ ] Get Firebase service account JSON:
  - [ ] Go to Firebase Console
  - [ ] Settings → Service Accounts
  - [ ] Click "Generate new private key"
  - [ ] Copy entire JSON

- [ ] Add to Supabase:
  - [ ] Supabase Dashboard → Settings → Edge Functions
  - [ ] Click "Add new secret"
  - [ ] Name: `FIREBASE_SERVICE_ACCOUNT_JSON`
  - [ ] Value: Paste the JSON from Firebase
  - [ ] Click Save

- [ ] Verify it was saved:
```sql
SELECT name FROM vault.decrypted_secrets 
WHERE name = 'FIREBASE_SERVICE_ACCOUNT_JSON';
```
Expected: ✅ One row: `FIREBASE_SERVICE_ACCOUNT_JSON`

---

### ❌ Problem 3: notification_logs Table Incomplete
**Status:** May exist but missing columns  
**Impact:** Can't track which notifications were sent/failed/have no token  
**Fix Time:** Already handled by SQL file

- [ ] Run SQL from `SUPABASE_NOTIFICATION_SETUP.sql` (same as Problem 1)
- [ ] Table should now be created with all columns

**Verify:**
```sql
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = 'notification_logs';
```
Expected: ✅ One row with value = 1

---

### ❌ Problem 4: Missing Notification Triggers
**Status:** Not created  
**Impact:** Site claims and payments don't trigger notifications automatically  
**Fix Time:** Already handled by SQL file

- [ ] Run SQL from `SUPABASE_NOTIFICATION_SETUP.sql` (same as Problem 1)
- [ ] Triggers created for:
  - [ ] Missed calls
  - [ ] Messages
  - [ ] Site claims
  - [ ] Payments

**Verify:**
```sql
SELECT COUNT(*) FROM pg_trigger 
WHERE tgrelname IN ('call_history', 'chat_messages', 'site_claims', 'site_payments');
```
Expected: ✅ At least 4 rows

---

## Post-Fix Steps

### Step 1: Rebuild Flutter App
```bash
flutter clean
flutter pub get
flutter run
```

### Step 2: Test Tokens Are Saving
- [ ] Login to app on a device
- [ ] Run this SQL:
```sql
SELECT COUNT(*) FROM profiles 
WHERE ARRAY_LENGTH(fcm_tokens, 1) > 0;
```
Expected: ✅ At least 1

---

### Step 3: Test Each Notification Type

#### Test Missed Call Notification
- [ ] Device A logged in
- [ ] Device B logged in
- [ ] Device B calls Device A (from Messages)
- [ ] Device A rejects/misses the call
- [ ] Check Device A for notification
- [ ] Expected: ✅ Notification appears within 5 seconds

#### Test Message Notification
- [ ] Device A logged in
- [ ] Device B logged in
- [ ] Device B sends message to Device A
- [ ] Check Device A for notification
- [ ] Expected: ✅ Notification appears within 5 seconds

#### Test Site Claim Notification
- [ ] Admin receives notification when site is claimed
- [ ] Expected: ✅ Notification appears

#### Test Payment Notification
- [ ] User receives notification when payment is processed
- [ ] Expected: ✅ Notification appears

---

## Verification Queries (Run All)

```sql
-- 1. FCM tokens column exists?
SELECT 'fcm_tokens' FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'fcm_tokens' LIMIT 1;
-- Expected: 1 row

-- 2. Notification logs table exists?
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = 'notification_logs';
-- Expected: 1

-- 3. Firebase secret exists?
SELECT name FROM vault.decrypted_secrets 
WHERE name = 'FIREBASE_SERVICE_ACCOUNT_JSON';
-- Expected: 1 row

-- 4. Triggers exist?
SELECT COUNT(*) FROM pg_trigger 
WHERE tgrelname IN ('call_history', 'chat_messages', 'site_claims', 'site_payments');
-- Expected: 4 or more

-- 5. RLS policies on notification_logs?
SELECT COUNT(*) FROM pg_policies 
WHERE tablename = 'notification_logs';
-- Expected: 2 or more
```

---

## Troubleshooting

### If Notifications Still Not Working:

```sql
-- Check 1: Do users have tokens saved?
SELECT id, ARRAY_LENGTH(fcm_tokens, 1) as token_count 
FROM profiles 
WHERE ARRAY_LENGTH(fcm_tokens, 1) > 0 
LIMIT 5;
-- If empty: Tokens not being saved

-- Check 2: Have any notifications been created?
SELECT notification_type, COUNT(*) 
FROM notification_logs 
GROUP BY notification_type;
-- If empty: Triggers not firing

-- Check 3: Are notifications successful?
SELECT status, COUNT(*) 
FROM notification_logs 
GROUP BY status;
-- If all 'no_token': Problem 1 not fixed
-- If all 'failed': Check Edge Function logs

-- Check 4: Recent errors?
SELECT notification_type, status, error_message 
FROM notification_logs 
WHERE status IN ('failed', 'no_token') 
ORDER BY created_at DESC LIMIT 5;
```

---

## Summary

| Step | Action | Time | Critical |
|------|--------|------|----------|
| 1 | Run SQL setup | 2 min | ⚠️ YES |
| 2 | Add Firebase secret | 5 min | ⚠️ YES |
| 3 | Rebuild app | 3 min | ✅ YES |
| 4 | Test notifications | 2 min | ✅ YES |

**Total time: ~12 minutes**

---

## Files Created
- `SUPABASE_NOTIFICATION_SETUP.sql` - Complete SQL to run
- `NOTIFICATION_SETUP_GUIDE.md` - Detailed explanations
- `NOTIFICATION_QUICK_CHECKLIST.md` - This file

---

## Status After Completion

Once all steps are done:
- ✅ fcm_tokens column will exist
- ✅ Firebase service account configured
- ✅ notification_logs table ready
- ✅ Triggers automatic notifications
- ✅ Push notifications should start working

**Go test it now!** 🚀
