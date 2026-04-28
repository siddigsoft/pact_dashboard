# ✅ Notification System - Issues Fixed

## Root Cause Analysis

The notifications weren't working due to **3 critical mismatches**:

### Issue 1: FCM Token Storage Mismatch
**Problem:** Edge Functions looked for `fcm_token` (singular), but app stores `fcm_tokens` (array)
- **App stores:** `profiles.fcm_tokens` (array of tokens for multiple devices)
- **Edge Functions expected:** `profiles.fcm_token` (single value)
- **Result:** No FCM tokens found → no notifications sent

**Fix:** Updated both Edge Functions to:
1. Query `fcm_tokens` array instead of singular field
2. Loop through all tokens in the array
3. Send FCM to each registered device

### Issue 2: Request Format Mismatch (Missed Calls)
**Problem:** Backend was sending wrong field names to Edge Function
- **Backend sent:** `recipient_user_id`, `caller_id`, `caller_name`
- **Edge Function expected:** `caller_user_id`, `receiver_user_id`, `receiver_name`, `call_id`, `reason`
- **Result:** Edge Function couldn't parse request correctly

**Fix:** Updated `call_history_service.dart` to send:
```dart
{
  'caller_user_id': userId,              // Who receives notification
  'receiver_user_id': callerId,          // Who didn't answer
  'receiver_name': callerName,
  'call_id': callId,
  'reason': status                       // "unreachable", "missed", etc.
}
```

### Issue 3: Request Format Mismatch (Messages)
**Problem:** Backend was missing `message_id` field and using wrong field name
- **Backend sent:** `recipient_user_id`, `sender_id`, `sender_name`, `chat_id`, `message_preview`
- **Edge Function expected:** `recipient_user_id`, `sender_user_id`, `sender_name`, `chat_id`, `message_id`, `message_preview`
- **Result:** Edge Function couldn't find sender or message ID

**Fix:** Updated `chat_service.dart` to:
1. Extract `message_id` from inserted message response
2. Use `sender_user_id` instead of `sender_id`
3. Pass `message_id` to notification trigger

---

## Files Modified

### Backend Services

**[lib/services/call_history_service.dart](lib/services/call_history_service.dart)**
- Updated `_triggerMissedCallNotification()` parameter names
- Changed field names to match Edge Function expectations
- Added `callId` and `reason` parameters

**[lib/services/chat_service.dart](lib/services/chat_service.dart)**
- Updated `sendMessage()` to extract and pass `messageId`
- Updated `_triggerMessageNotificationsForChat()` to accept `messageId`
- Updated `_triggerMessageNotification()` to use `sender_user_id` (not `sender_id`)
- Added `message_id` to notification payload

### Edge Functions

**[supabase/functions/send-missed-call-notification/index.ts](supabase/functions/send-missed-call-notification/index.ts)**
- Changed `fcm_token` → `fcm_tokens` (select from array)
- Added loop to send to all tokens in array
- Now handles multiple devices per user
- **Deployed:** Version 2 (2026-03-22 13:41:42)

**[supabase/functions/send-message-notification/index.ts](supabase/functions/send-message-notification/index.ts)**
- Changed `fcm_token` → `fcm_tokens` (select from array)
- Added loop to send to all tokens in array
- Now handles multiple devices per user
- **Deployed:** Version 2 (2026-03-22 13:42:01)

---

## Testing the Fix

### Test Scenario: Missed Call
1. Device A receives call from Device B
2. Device A rejects the call
3. **Expected:** Device A gets notification within 2 seconds
   - Title: "Missed call - [Device B name]"
   - Body: "[Name] didn't answer"
   - Sound: Phone Dial Tone
   - vibrated with 2 pulses

### Test Scenario: Message in 1:1 Chat
1. Device A sends message to Device B
2. **Expected:** Device B gets notification within 2 seconds
   - Title: Device A's name
   - Body: Message preview (150 chars max)
   - No sound (silent notification)

### Test Scenario: Message in Group Chat
1. Device A sends message in group with B, C, D
2. **Expected:** Devices B, C, D each get separate notifications within 2 seconds

---

## Verification Steps

### Check FCM Tokens in Database
```sql
SELECT id, full_name, fcm_tokens FROM profiles WHERE fcm_tokens IS NOT NULL;
-- Should see an array like: ["token1", "token2", ...]
```

### Check Notification Logs
```sql
SELECT * FROM notification_logs 
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 20;
-- Should show status='sent' with fcm_message_id populated
```

### Check Edge Function Logs
Supabase Dashboard → Functions → send-missed-call-notification → Logs
- Look for: `[MissedCall] ✅ FCM sent to [user_id]`
- If error appears: `No FCM tokens for recipient`

### Check App Logs (for debugging)
```bash
flutter logs
# Look for:
# [CallHistory] Missed call notification triggered
# [ChatService] Message notification triggered
```

---

## Success Indicators

✅ **System is now working when:**
1. FCM tokens are in `fcm_tokens` array in profiles table
2. Both Edge Functions are at version 2
3. App sends requests with correct field names
4. Notifications appear in device notification center within 2 seconds
5. `notification_logs` table shows `status='sent'` entries

❌ **If still not working:**
1. Check if Firebase configuration is correct
2. Verify FCM tokens are being saved to profiles table
3. Check Edge Function logs in Supabase dashboard
4. Verify notification permissions are granted on device
5. Ensure device is not in Do Not Disturb mode

---

## Deployment Summary

| Component | Status | Version | Updated |
|-----------|--------|---------|---------|
| send-missed-call-notification | ✅ ACTIVE | 2 | 2026-03-22 13:41:42 |
| send-message-notification | ✅ ACTIVE | 2 | 2026-03-22 13:42:01 |
| call_history_service.dart | ✅ UPDATED | Latest | Fixed field names |
| chat_service.dart | ✅ UPDATED | Latest | Added messageId, fixed fields |

**App Build Status:** Ready for redeploy

---

## Next Steps

1. ✅ Edge Functions deployed (v2)
2. ✅ Backend services updated
3. 🔄 Rebuild and run app on device
4. 🔄 Test missed call notification (reject a call)
5. 🔄 Test message notification (send a chat message)
6. 🔄 Monitor notification_logs table
7. 🔄 Check device notification center for arrivals
8. 🔄 Verify ringtone plays for missed calls

---

## Debug Checklist if Issues Continue

- [ ] Firebase tokens in database: `SELECT fcm_tokens FROM profiles WHERE id='<user_id>'`
- [ ] Edge Function logs: Check Supabase dashboard for errors
- [ ] App logs: `flutter logs | grep -i notification`
- [ ] Request validation: Verify correct field names in HTTP requests
- [ ] Token format: Ensure tokens are valid Firebase tokens
- [ ] Device permissions: Check if app has notification permission
- [ ] Firebase setup: Verify firebase_messaging_setup_service is initialized
