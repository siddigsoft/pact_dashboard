# Notification System Deployment Checklist

Complete this checklist to deploy the notification system and test it end-to-end.

## Phase 1: Edge Functions Deployment ⏳

### Step 1.1: Deploy Edge Functions
```bash
cd supabase
supabase functions deploy send-missed-call-notification
supabase functions deploy send-message-notification
```

**Expected output:**
```
✓ Function deployed successfully
  ✓ send-missed-call-notification
  ✓ send-message-notification
```

[ ] Missed call notification function deployed
[ ] Message notification function deployed

### Step 1.2: Verify Edge Functions
Check that functions exist in Supabase dashboard:
- Dashboard → Functions → select-missed-call-notification
- Dashboard → Functions → send-message-notification

[ ] Both functions visible in Supabase dashboard
[ ] No errors in function details

### Step 1.3: Test Functions with cURL
Run these commands from terminal to verify functions are working:

**Missed Call Test:**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-missed-call-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caller_user_id": "test-caller-uuid",
    "receiver_user_id": "test-receiver-uuid", 
    "receiver_name": "Test Receiver",
    "call_id": "test-call-123",
    "reason": "timeout"
  }'
```

**Message Test:**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-message-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_user_id": "test-recipient-uuid",
    "sender_user_id": "test-sender-uuid",
    "sender_name": "Test Sender",
    "chat_id": "test-chat-123",
    "message_id": "test-msg-456",
    "message_preview": "Hello, this is a test message!"
  }'
```

[ ] Missed call test returns success response
[ ] Message test returns success response

## Phase 2: Database Setup 🔧

### Step 2.1: Run Migration
Execute the migration file to create triggers and notification_logs table:

```bash
supabase db push
```

Or manually in Supabase SQL Editor:
1. Go to Supabase Dashboard → SQL Editor
2. Open file: `supabase/migrations/20250325_create_notification_triggers.sql`
3. Run all SQL statements

[ ] Migration executed without errors
[ ] notification_logs table created
[ ] Triggers created on call_history
[ ] Triggers created on messages

### Step 2.2: Verify Database Changes
Check tables and triggers were created:

```sql
-- Check notification_logs table exists
SELECT * FROM information_schema.tables 
WHERE table_name = 'notification_logs';

-- Check triggers exist
SELECT trigger_name, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_name LIKE '%notification%';

-- Verify notification_logs is empty
SELECT COUNT(*) FROM notification_logs;
```

[ ] notification_logs table exists with correct columns
[ ] missed_call_notification_trigger exists
[ ] message_notification_trigger exists
[ ] notification_logs is empty (ready for testing)

### Step 2.3: Verify RLS Policies
Check that required policies are created:

```sql
-- Check notification_logs policies
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'notification_logs';

-- Check profiles policies
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
AND policyname LIKE '%logs%';
```

[ ] notification_logs SELECT policy exists
[ ] profiles service role policies exist

## Phase 3: App-Side Verification ✅

### Step 3.1: Verify Flutter App Code
Ensure app has all required components:

**Check BackgroundNotificationHandler.dart:**
- [ ] `_isMissedCall()` method exists with 5-level detection
- [ ] `_isNewMessage()` method exists with 3-level detection
- [ ] Both methods have 🔴 HIGH PRIORITY markers
- [ ] Enhanced logging with caller/sender details

**Check FirebaseMessagingSetupService.dart:**
- [ ] `_setupMessageHandlers()` method exists
- [ ] Foreground messages are processed

**Check NotificationRoutingService.dart:**
- [ ] `isInitialized` getter exists
- [ ] No duplicate ringtone playback
- [ ] High-priority channel configuration

**Check RingtoneService.dart:**
- [ ] Audio path points to existing asset: `assets/sounds/Phone Dial Tone - Sound Effect (HD).mp3`
- [ ] Ringtone plays immediately on notification

[ ] All app components verified
[ ] No compilation errors
[ ] App builds successfully

### Step 3.2: Build & Install App
```bash
flutter clean
flutter pub get
flutter run
```

[ ] App builds without errors
[ ] App installs on test device
[ ] App runs without crashes

## Phase 4: Integration Testing 🧪

### Test 4.1: Database Trigger Test
Manually insert test records and verify notification_logs are populated:

**Insert test call:**
```sql
INSERT INTO call_history (
  user_id, caller_id, caller_name, call_type, status,
  started_at, ended_at, reason_for_end, duration_seconds
) VALUES (
  'receiver-uuid',
  'caller-uuid',
  'Test Caller',
  'incoming',
  'missed',
  now() - interval '1 minute',
  now(),
  'no_answer',
  60
);
```

**Check notification_logs:**
```sql
SELECT * FROM notification_logs 
WHERE notification_type = 'missed_call'
ORDER BY created_at DESC
LIMIT 1;
```

[ ] Test call inserted successfully
[ ] notification_logs record created with status='sent'
[ ] No errors in error_message column

**Insert test message:**
```sql
INSERT INTO messages (
  sender_id, recipient_id, chat_id, content, status
) VALUES (
  'sender-uuid',
  'recipient-uuid',
  'chat-uuid',
  'Test message content',
  'sent'
);
```

**Check notification_logs:**
```sql
SELECT * FROM notification_logs 
WHERE notification_type = 'message'
ORDER BY created_at DESC
LIMIT 1;
```

[ ] Test message inserted successfully
[ ] notification_logs record created with status='sent'
[ ] No errors in error_message column

### Test 4.2: Edge Function Direct Call Test
Call functions directly with valid test data (not emulator UUIDs):

**Function should return:**
- [ ] `success: true` response
- [ ] `messageId` from Firebase (FCM message ID)
- [ ] notification_logs table entry with status='sent'

## Phase 5: End-to-End Testing (2 Real Devices) 🎯

### Setup
- [ ] Device 1: "Caller" with latest app
- [ ] Device 2: "Receiver" with latest app
- [ ] Both devices connected to same network
- [ ] Both devices have proper FCM token in profiles table

### Test 5.1: Ringtone Test (App Background)
1. On Device 2: Send app to background
2. On Device 1: Initiate call to Device 2
3. On Device 2: Listen for ringtone

**Expected Result:**
- [ ] Ringtone plays immediately (within 1-2 seconds)
- [ ] Sound is loud enough to hear
- [ ] Device vibrates

### Test 5.2: Missed Call Notification
1. On Device 2: Send app to background  
2. On Device 1: Call Device 2
3. On Device 2: Don't answer - wait for timeout (or Device 1: end call)
4. On Device 2: Check notification

**Expected Result:**
- [ ] Notification appears within 2 seconds
- [ ] Shows caller name
- [ ] Can expand to see full notification
- [ ] Tap opens call history with missed call

**In database:**
```sql
SELECT * FROM notification_logs 
WHERE notification_type = 'missed_call'
AND created_at > now() - interval '1 minute'
ORDER BY created_at DESC;
```
- [ ] notification_logs entry has status='sent'
- [ ] fcm_message_id is populated

### Test 5.3: Message Notification (App Background)
1. On Device 2: Send app to background
2. On Device 1: Send message to Device 2
3. On Device 2: Check notification

**Expected Result:**
- [ ] Notification appears within 2 seconds
- [ ] Shows sender name and message preview
- [ ] Tap opens chat with Device 1
- [ ] Message displays correctly

**In database:**
```sql
SELECT * FROM notification_logs 
WHERE notification_type = 'message'
AND created_at > now() - interval '1 minute'
ORDER BY created_at DESC;
```
- [ ] notification_logs entry has status='sent'
- [ ] fcm_message_id is populated

### Test 5.4: Message Notification (App Closed)
1. On Device 2: Close app completely
2. On Device 1: Send message to Device 2
3. On Device 2: Check notification without opening app

**Expected Result:**
- [ ] Notification appears in notification center
- [ ] Shows sender name and message preview
- [ ] Tap opens app and displays message

### Test 5.5: Message Status (Read Receipts)
1. On Device 1: Send message to Device 2
2. On Device 2: Read message
3. On Device 1: Check message has blue checkmark

**Expected Result:**
- [ ] Message status changes to 'read'
- [ ] Blue checkmark displays on Device 1
- [ ] Happens within 1-2 seconds

### Test 5.6: Notification Logs Auditing
Check that all test notifications appear in logs:

```sql
SELECT 
  notification_type,
  status,
  COUNT(*) as count
FROM notification_logs
WHERE created_at > now() - interval '30 minutes'
GROUP BY notification_type, status;
```

**Expected Result:**
- [ ] Multiple missed_call entries with status='sent'
- [ ] Multiple message entries with status='sent'
- [ ] No entries with status='failed'
- [ ] error_message column is NULL for all sent notifications

## Phase 6: Production Deployment ✅

### Step 6.1: Monitor Notification Performance
Set up monitoring for first 24 hours:

**Daily check:**
```sql
SELECT
  notification_type,
  status,
  COUNT(*) as count,
  DATE_TRUNC('hour', created_at) as hour
FROM notification_logs
WHERE created_at > now() - interval '24 hours'
GROUP BY notification_type, status, hour
ORDER BY hour DESC;
```

[ ] Monitor notification success rates
[ ] Monitor for error patterns
[ ] Check error_message column for issues

### Step 6.2: Troubleshooting Setup
If issues occur, check:

1. **No notifications at all:**
   - [ ] FCM tokens exist: `SELECT id, fcm_token FROM profiles WHERE fcm_token IS NOT NULL;`
   - [ ] Firebase Admin SDK is working
   - [ ] Edge Functions have errors in logs
   - [ ] Triggers are firing: check notification_logs entries

2. **Delayed notifications:**
   - [ ] Verify high-priority is set in Edge Functions
   - [ ] Check device battery optimization settings
   - [ ] Check network connectivity
   - [ ] Review Firebase delivery status

3. **App not processing notifications:**
   - [ ] Verify app background handler is enabled
   - [ ] Check detection logic in BackgroundNotificationHandler
   - [ ] Check notification channel IDs match
   - [ ] Enable debug logging in app

### Step 6.3: Document for Team
- [ ] Create runbook for notification troubleshooting
- [ ] Document how to monitor notification_logs
- [ ] Share deployment steps with team
- [ ] Set up alerts for notification failures

## Rollback Plan (If Issues)

If serious issues occur:

### Quick Disable:
```sql
-- Disable triggers temporarily
DROP TRIGGER missed_call_notification_trigger ON call_history;
DROP TRIGGER message_notification_trigger ON messages;
```

### Quick Enable:
```bash
-- Re-run migration to recreate triggers
supabase db push
```

## Success Criteria

✅ **System is working if:**
- [ ] All 5 end-to-end tests pass on real devices
- [ ] Ringtone plays immediately
- [ ] Missed call notifications appear within 2 seconds
- [ ] Message notifications appear within 2 seconds
- [ ] All notifications logged in notification_logs
- [ ] No errors logged after 24 hours
- [ ] Blue checkmarks appear for read messages

## Timeline Estimate

- Phase 1 (Deployment): **5 minutes**
- Phase 2 (Database): **10 minutes**
- Phase 3 (Verification): **5 minutes**
- Phase 4 (Integration Testing): **10 minutes**
- Phase 5 (E2E Testing): **30-60 minutes**
- Phase 6 (Monitoring): **Ongoing**

**Total expected time: ~2 hours**

---

**Last Updated:** {{current_date}}
**Status:** Ready for deployment
**Next Action:** Begin Phase 1 - Deploy Edge Functions
