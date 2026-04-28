# HIGH PRIORITY: Backend FCM Payload Requirements

## Timeline: CRITICAL FIX (Must be implemented ASAP)

The Flutter app now has **HIGH PRIORITY detection** for:
- 🔴 **Missed Calls** - with 5-level aggressive detection  
- 🔴 **Messages** - with 3-level aggressive detection

**BUT** - The backend MUST send these notifications with the correct FCM payloads.

---

## Backend Requirements

### 1. When a Call is Missed (NO ANSWER / TIMEOUT)

**Your backend MUST send FCM:**
```json
{
  "notification": {
    "title": "Caller Name",
    "body": "Missed call"
  },
  "data": {
    "type": "missed_call",
    "notification_type": "missed_call",
    "caller_name": "John Doe",
    "caller_id": "user_123",
    "call_id": "call_abc_123",
    "status": "missed"
  },
  "android": {
    "priority": "high"
  }
}
```

**OR any of these variations (all detected now):**
```json
{
  "data": {
    "type": "call_missed",
    "caller_name": "John Doe",
    "call_id": "call_123"
  }
}
```

```json
{
  "data": {
    "event": "missed",
    "caller_name": "John Doe",
    "payload": "missed_call:call_123"
  }
}
```

```json
{
  "data": {
    "call_reason": "missed",
    "caller_name": "John Doe"
  }
}
```

---

### 2. When a Message is Sent to User

**Your backend MUST send FCM:**
```json
{
  "notification": {
    "title": "Sender Name",
    "body": "Message preview text"
  },
  "data": {
    "type": "message",
    "notification_type": "message",
    "sender_name": "Alice Johnson",
    "sender_id": "user_456",
    "chat_id": "chat_xyz",
    "message_id": "msg_789",
    "message": "Hello! How are you?",
    "message_text": "Hello! How are you?"
  },
  "android": {
    "priority": "high"
  }
}
```

**OR any of these variations (all detected now):**
```json
{
  "data": {
    "type": "chat",
    "sender_name": "Alice",
    "sender_id": "user_456",
    "body": "Message preview"
  }
}
```

```json
{
  "data": {
    "type": "new_message",
    "from": "user_456",
    "message": "Hello!"
  }
}
```

```json
{
  "data": {
    "sender_id": "user_456",
    "sender_name": "Alice",
    "chat_id": "chat_xyz",
    "body": "Message text"
  }
}
```

---

## Detection Logic (What the App Detects)

### Missed Call Detection - 5 Levels:

```
LEVEL 1: Type field
├─ "missed_call"
├─ "call_missed"
└─ contains "missed_call"

LEVEL 2: Status fields
├─ status = "missed"
├─ call_status = "missed"
├─ reason contains "missed"
└─ call_reason contains "missed"

LEVEL 3: Event/Payload
├─ event contains "missed"
├─ payload starts with "missed_call"
└─ payload contains "missed"

LEVEL 4: Content fields
├─ title contains "missed"
├─ body contains "missed"
└─ body contains "no answer"

LEVEL 5: Fallback
└─ Has call_id + (type contains terminate/end/expire)
```

### Message Detection - 3 Levels:

```
LEVEL 1: Type field
├─ "message"
├─ "chat"
├─ "new_message"
└─ "text_message"

LEVEL 2: Content + Sender
├─ (message OR body OR message_text) 
└─ + (sender_id OR sender_name OR from)

LEVEL 3: Sender + Chat fields
├─ (sender_id OR from)
└─ + (message OR chat_id OR message_id)
```

---

## Checklist for Backend Developer

### For Missed Calls:

- [ ] When call times out → detect in backend
- [ ] When call rejected → detect in backend
- [ ] When call expires → detect in backend
- [ ] Send FCM with `type: "missed_call"` field (primary detection)
- [ ] Include `caller_name` (extracted from call invite)
- [ ] Include `call_id` (from the call record)
- [ ] Set Android FCM `priority: "high"`
- [ ] Send immediately (don't batch)

**Test:** Call someone → let it timeout → should see notification

### For Messages:

- [ ] When message inserted to chat_messages table → trigger FCM
- [ ] Send FCM with `type: "message"` field (primary detection)
- [ ] Include `sender_name` (from profiles table)
- [ ] Include `sender_id` (user_id)
- [ ] Include `chat_id` (for routing)
- [ ] Include `message` or `body` (text preview)
- [ ] Set Android FCM `priority: "high"`
- [ ] Send to correct recipient (NOT the sender)
- [ ] Send immediately (don't batch)

**Test:** Send message from User A to User B → User B should see notification

---

## Edge Cases Handled by App

### Missed Call Cases:
✅ Timeout (no answer)
✅ Rejected/Declined
✅ Network failure during call
✅ Call duration expired
✅ Multiple attempts to same person

### Message Cases:
✅ One-on-one messages
✅ Long message previews (truncated)
✅ Messages with special characters
✅ Messages with emojis
✅ Messages while app backgrounded
✅ Messages while app closed

---

## Database Triggers (If Using Supabase)

### For Missed Calls:

```sql
-- Trigger when call ends without being answered
CREATE OR REPLACE FUNCTION on_call_end()
RETURNS void AS $$
BEGIN
  -- Check if call was answered
  -- If not answered → send FCM via Edge Function
  -- Call https://your-edge-function/send-fcm
  -- With: { "type": "missed_call", "caller_name": "...", "call_id": "..." }
END;
$$ LANGUAGE plpgsql;
```

### For Messages:

```sql
-- Trigger after message inserted
CREATE OR REPLACE FUNCTION on_message_insert()
RETURNS void AS $$
BEGIN
  -- Look up sender name from profiles
  -- Send FCM via Edge Function
  -- Call https://your-edge-function/send-fcm
  -- With: { "type": "message", "sender_name": "...", "sender_id": "...", "message": "..." }
END;
$$ LANGUAGE plpgsql;
```

---

## Verification Steps

### Step 1: Test Missed Call
```bash
1. Device A: Login
2. Device B: Call Device A
3. Device A: Let it ring (timeout after 30 seconds)
4. Expected: Notification shows "Missed call - Device B Name"
5. Check Firebase Cloud Messaging logs for FCM delivery
```

### Step 2: Test Message
```bash
1. Device A: Login (put in background)
2. Device B: Send message from Device A
3. Expected: Notification shows "[Device B Name] - message text"
4. Check Firebase Cloud Messaging logs for FCM delivery
```

### Step 3: Check Logs
```bash
# In VS Code/Android Studio while running:
flutter run -v
# Look for these markers:
# [FCM Setup] - FCM initialization
# [BackgroundHandler] 🔴 HIGH PRIORITY - notification detected
# ✅ MISSED CALL - notification displayed
# ✅ MESSAGE - notification displayed
```

---

## Common Backend Issues to Fix

### Issue 1: Missed call notifications not sending
**Check:**
- Is backend detecting when call times out?
- Is there a function that monitors call expiration?
- Is it sending FCM to the receiver (not caller)?
- Is it using correct task ID/user ID for delivery?

**Fix:**
- Add call_ended_at timestamp to calls table
- Create trigger: `if (ended_at - created_at > 30s) → send_fcm_missed_call()`
- Send to receiver_id, NOT caller_id

### Issue 2: Message notifications not sending
**Check:**
- Does message insert trigger send FCM?
- Is it sending to receiver (recipient)?
- Is the sender_name populated from profiles?
- Is message preview extracted correctly?

**Fix:**
- Create trigger on chat_messages INSERT
- Use supabase.functions.invoke() to call Edge Function
- Pass: sender_name, message preview, recipient_id
- Don't send FCM to sender (they already see message in UI)

### Issue 3: FCM tokens not matching
**Check:**
- Are you storing FCM tokens to user_profiles table?
- Are tokens updated when they refresh?
- Is the token sent to the correct user_id?

**Fix:**
- Store token in profiles.fcm_token
- Update when Firebase sends refresh message
- Always query this token before sending FCM

---

## Timeline

🔴 **HIGH PRIORITY** - This needs to be done ASAP:
- [ ] Backend detects missed calls ← START HERE
- [ ] Backend sends FCM for missed calls ← START HERE
- [ ] Backend sends FCM for messages
- [ ] Test with 2 devices
- [ ] Verify notifications appear

**Estimated time:** 1-2 hours to implement

