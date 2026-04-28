# Push Notification Setup - Complete Step-by-Step Guide

## Critical Issue Identified
Your Edge Functions are deployed, but **push notifications aren't being sent** because:
1. ❌ **fcm_tokens column likely doesn't exist** in profiles table
2. ❌ **Firebase service account secret not set** in Supabase
3. ❌ **notification_logs table incomplete** (missing columns)
4. ❌ **Notification triggers missing** for site claims and payments

---

## IMMEDIATE FIX - 3 Steps

### Step 1: Run SQL to Create Missing Database Schema
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy-paste everything from: `SUPABASE_NOTIFICATION_SETUP.sql`
4. Click **Run**
5. **Verify**: You should see these messages:
   - ✅ "CREATE TABLE" or "already exists" for notification_logs
   - ✅ "ALTER TABLE" for profiles
   - ✅ Multiple trigger creation messages

**What this SQL does:**
- ✅ Adds `fcm_tokens TEXT[]` column to profiles table
- ✅ Creates notification_logs table for tracking
- ✅ Creates triggers to automatically create notifications on:
  - Missed calls
  - New messages
  - Site claims
  - Payments
- ✅ Enables RLS policies

---

### Step 2: Verify Tokens Column Exists
1. Still in SQL Editor, run:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
```

2. In results, look for row with:
   - ✅ `fcm_tokens` | `text[]`

**If you see it:** Column was created successfully! Continue to Step 3.
**If you don't see it:** SQL failed to run. Check for error messages above.

---

### Step 3: Add Firebase Service Account Secret

⚠️ **CRITICAL:** Without this, Edge Functions cannot send notifications to Firebase.

1. Get your Firebase service account JSON:
   - Go to **Firebase Console** → **⚙️ Project Settings** → **Service Accounts**
   - Click **Generate new private key**
   - Copy the entire JSON file

2. Add it to Supabase:
   - Go to **Supabase Dashboard** → **⚙️ Settings** → **Edge Functions** (left sidebar)
   - Click **Add new secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT_JSON`
   - Value: Paste the entire JSON from Firebase
   - **Save**

3. Verify it was saved:
   - Run this SQL query:
   ```sql
   SELECT name FROM vault.decrypted_secrets WHERE name = 'FIREBASE_SERVICE_ACCOUNT_JSON';
   ```
   - Should return 1 row: `FIREBASE_SERVICE_ACCOUNT_JSON`

**If secret is missing:** Edge Functions will fail silently when trying to send FCM notifications.

---

## VERIFICATION CHECKLIST

After completing the 3 steps above, verify everything:

### ✅ Database Schema
```sql
-- Check if fcm_tokens column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'fcm_tokens';
-- Expected: 1 row returned
```

### ✅ Notification Logs Table
```sql
-- Check notification_logs table was created
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = 'notification_logs';
-- Expected: 1
```

### ✅ Triggers Created
```sql
-- Check if triggers exist
SELECT tgname FROM pg_trigger 
WHERE tgrelname IN ('call_history', 'chat_messages', 'site_claims', 'site_payments');
-- Expected: 4 rows
```

### ✅ Firebase Secret
```sql
-- Check if secret exists
SELECT name FROM vault.decrypted_secrets 
WHERE name = 'FIREBASE_SERVICE_ACCOUNT_JSON';
-- Expected: 1 row
```

---

## REBUILD & TEST APP

After database setup + Firebase secret, rebuild the app:

```bash
flutter clean
flutter pub get
flutter run
```

This will:
1. ✅ Reinstall dependencies
2. ✅ App will save FCM token to `profiles.fcm_tokens` on login
3. ✅ Test by triggering a notification event

---

## TEST NOTIFICATIONS

### Test 1: Missed Call Notification
1. Login on **Device A** (recipient)
2. Login on **Device B** (caller)
3. On **Device B**: Make a call to **Device A** in Messages
4. On **Device A**: **Don't answer** the call
5. **Check Device A**: Should see notification appear within 5 seconds

If no notification: Check Edge Function logs (see step below)

### Test 2: Message Notification
1. Login on **Device A**
2. Login on **Device B**
3. On **Device B**: Send a message to **Device A**'s chat
4. **Check Device A**: Should see notification within 5 seconds

### Test 3: Check Tokens Saved
```sql
-- Verify FCM tokens are being saved
SELECT id, full_name, fcm_tokens, ARRAY_LENGTH(fcm_tokens, 1) as token_count
FROM profiles
WHERE fcm_tokens IS NOT NULL AND ARRAY_LENGTH(fcm_tokens, 1) > 0;
```

Expected: At least 1-2 rows with token_count = 1 or 2

---

## DEBUG - IF STILL NO NOTIFICATIONS

### Check 1: View Recent Notifications in Database
```sql
SELECT notification_type, status, COUNT(*) as count
FROM notification_logs
GROUP BY notification_type, status
ORDER BY notification_type;
```

**Shows:**
- How many notifications were attempted
- Status: 'sent' = successful, 'failed' = error, 'no_token' = user has no token

### Check 2: Check Your FCM Tokens Status
```sql
SELECT 
  u.email,
  p.full_name,
  ARRAY_LENGTH(p.fcm_tokens, 1) as token_count,
  p.fcm_tokens[1] as first_token
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE ARRAY_LENGTH(p.fcm_tokens, 1) > 0
LIMIT 5;
```

If `token_count` is NULL or 0: Tokens not being saved to database

### Check 3: Edge Function Logs
1. Go to **Supabase Dashboard** → **Functions** → **send-missed-call-notification**
2. Click **Logs** tab
3. Look for errors like:
   - "No FCM tokens for user"
   - "Firebase service account not found"
   - "Failed to send FCM"

### Check 4: Verify Edge Functions Are Running
```sql
-- This won't show in SQL, instead:
-- Go to Supabase Dashboard → Functions
-- See if both are showing ACTIVE status:
-- - send-missed-call-notification (v2)
-- - send-message-notification (v2)
```

---

## COMMON ISSUES & FIXES

### Issue 1: "fcm_tokens column doesn't exist"
**Fix:** Run the SQL setup again, check for errors

**Verify:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';
```

### Issue 2: "No FCM tokens found for user"
**Cause:** App isn't saving tokens to database
**Fix:** Check that this key exists in Dart:
- `lib/services/background_notification_handler.dart` line ~50
- Should have code: `await _supabase.from('profiles').update({'fcm_tokens': [...]})`

### Issue 3: "Firebase service account not found"
**Cause:** Secret not set in Supabase
**Fix:** Complete Step 3 above (add Firebase secret)

### Issue 4: "Permission denied on notification_logs"
**Cause:** RLS policies missing
**Fix:** Re-run the SQL setup, check for RLS policy creation

---

## NOTIFICATION FLOW DIAGRAM

```
User Event
    ↓
Backend Service (call_history_service.dart, chat_service.dart)
    ↓
HTTP POST to Supabase Edge Function
    ↓
Edge Function (send-missed-call-notification/index.ts)
    ↓
Query: SELECT fcm_tokens FROM profiles WHERE id = ?
    ↓
Firebase Cloud Messaging (FCM) API
    ↓
Device receives notification
```

**If notification never arrives → check each step:**
1. Is event being triggered?
2. Is HTTP POST being sent?
3. Does fcm_tokens column exist?
4. Are tokens being saved?
5. Is Firebase secret configured?
6. Does Edge Function have errors in logs?

---

## IMMEDIATE ACTION ITEMS

**Do this NOW:**

1. ⏳ Run SQL from `SUPABASE_NOTIFICATION_SETUP.sql`
2. ⏳ Verify `fcm_tokens` column exists (run verification query)
3. ⏳ Add Firebase service account secret
4. ⏳ Rebuild app: `flutter clean && flutter pub get && flutter run`
5. ⏳ Test sending a notification (missed call or message)
6. ⏳ Check notification_logs table to see if notification was recorded:
   ```sql
   SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 5;
   ```

---

## WHAT IF IT STILL DOESN'T WORK?

Run these diagnostics and send back results:

```sql
-- Check 1: Tokens exist?
SELECT COUNT(*) FROM profiles WHERE ARRAY_LENGTH(fcm_tokens, 1) > 0;

-- Check 2: Notifications being created?
SELECT notification_type, COUNT(*) FROM notification_logs GROUP BY notification_type;

-- Check 3: Any failed notifications?
SELECT * FROM notification_logs WHERE status IN ('failed', 'no_token') LIMIT 10;

-- Check 4: Firebase secret exists?
SELECT name FROM vault.decrypted_secrets WHERE name LIKE 'FIREBASE%';
```

Results will show exactly where the break is in the chain! 🔍
