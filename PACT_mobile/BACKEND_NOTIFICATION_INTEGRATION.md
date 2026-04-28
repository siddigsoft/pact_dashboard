# Notification Edge Functions Integration Guide

This guide shows where and how to integrate the two new notification Edge Functions into your backend call and message handling logic.

## System Architecture

```
┌─────────────────┐
│  Mobile App     │
│  (Flutter)      │
└────────┬────────┘
         │
         │ Initiates Call/Message
         ▼
┌─────────────────────────────┐
│  Backend Services           │
│ (Edge Functions/Database)   │
└────────┬───────────┬────────┘
         │           │
         │           │ Detects missed call
         │           │ or new message
         │           │
         ▼           ▼
    ┌──────────────────────────────┐
    │  Notification Edge Functions │
    │  - send-missed-call-notify   │
    │  - send-message-notification │
    └────────┬┬────────────────────┘
             ││
             ││ Sends FCM via Firebase
             ││
             ▼▼
    ┌──────────────────────┐
    │  Firebase (FCM)      │
    │  Message Service     │
    └──────────┬───────────┘
               │
               │ High-priority delivery
               │
               ▼
    ┌──────────────────────┐
    │  Mobile Device       │
    │  - Shows notification
    │  - Plays ringtone    │
    │  - Delivers message  │
    └──────────────────────┘
```

## Integration Points

### 1. MISSED CALL NOTIFICATION

**When to send:** When a call ends without being answered

**Trigger locations in your code:**

#### Option A: Call History Insert
When a call record is created with status = 'missed' or 'rejected':

```sql
-- In your call_history table insert or update trigger
CREATE OR REPLACE FUNCTION handle_call_end()
RETURNS TRIGGER AS $$
BEGIN
  -- Only send notification for missed/rejected calls
  IF NEW.status IN ('missed', 'rejected', 'failed') THEN
    -- Invoke the Edge Function
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-missed-call-notification',
      body := jsonb_build_object(
        'caller_user_id', NEW.caller_id,
        'receiver_user_id', NEW.user_id,
        'receiver_name', (SELECT full_name FROM profiles WHERE id = NEW.user_id),
        'call_id', NEW.id::text,
        'reason', NEW.status
      ),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      timeout_milliseconds := 5000
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_ended_notification_trigger
AFTER INSERT OR UPDATE ON call_history
FOR EACH ROW
EXECUTE FUNCTION handle_call_end();
```

#### Option B: Direct Edge Function Call (TypeScript)
When handling call end logic in an Edge Function:

```typescript
// In your existing call-end or call-reject Edge Function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { callerId, receiverId, callId } = await req.json();

  try {
    // Step 1: End the call (update call_history)
    await endCall(callerId, receiverId, callId);

    // Step 2: Send missed call notification via Edge Function
    const notificationResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-missed-call-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          caller_user_id: callerId,
          receiver_user_id: receiverId,
          receiver_name: receiverName,
          call_id: callId,
          reason: "timeout",
        }),
      }
    );

    if (!notificationResponse.ok) {
      console.error("Failed to send missed call notification");
    }

    return new Response(
      JSON.stringify({ success: true, callId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error ending call:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### 2. NEW MESSAGE NOTIFICATION

**When to send:** When a message is inserted into the messages table

**Trigger locations in your code:**

#### Option A: Message Insert Trigger (SQL)
When a new message is created:

```sql
-- In your messages table insert trigger
CREATE OR REPLACE FUNCTION handle_new_message()
RETURNS TRIGGER AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
  v_is_muted BOOLEAN;
BEGIN
  -- Get recipient ID and sender name
  SELECT id, full_name INTO v_recipient_id, v_sender_name
  FROM profiles
  WHERE id = NEW.recipient_id;

  -- Get notification status (check if sender is muted)
  SELECT muted INTO v_is_muted
  FROM chat_participants
  WHERE user_id = NEW.recipient_id AND chat_id = NEW.chat_id;

  -- Only send notification if not muted
  IF NOT COALESCE(v_is_muted, false) THEN
    -- Invoke the Edge Function
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-message-notification',
      body := jsonb_build_object(
        'recipient_user_id', NEW.recipient_id,
        'sender_user_id', NEW.sender_id,
        'sender_name', v_sender_name,
        'chat_id', NEW.chat_id::text,
        'message_id', NEW.id::text,
        'message_preview', SUBSTRING(NEW.content, 1, 150)
      ),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_insert_notification_trigger
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION handle_new_message();
```

#### Option B: Direct Edge Function Call (TypeScript)
When handling message send in an Edge Function:

```typescript
// In your send-message or create-message Edge Function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { senderId, recipientId, chatId, content } = await req.json();

  try {
    // Step 1: Insert the message
    const messageId = await insertMessage(senderId, recipientId, chatId, content);

    // Step 2: Get sender name
    const senderName = await getSenderName(senderId);

    // Step 3: Send message notification via Edge Function
    const notificationResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-message-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          recipient_user_id: recipientId,
          sender_user_id: senderId,
          sender_name: senderName,
          chat_id: chatId,
          message_id: messageId,
          message_preview: content,
        }),
      }
    );

    if (!notificationResponse.ok) {
      console.error("Failed to send message notification");
    }

    return new Response(
      JSON.stringify({ success: true, messageId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending message:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

## Database Setup

### 1. Create RLS Policy for Edge Function Access
Make sure your Edge Functions can access the profiles table:

```sql
-- Allow Edge Functions to read user FCM tokens
CREATE POLICY "Edge Functions can read profiles for FCM tokens"
  ON profiles FOR SELECT
  USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM auth.users WHERE auth.uid() = id AND role = 'service_role'
  ));
```

### 2. Create Notification Logs Table (Optional but Recommended)
For debugging and auditing:

```sql
CREATE TABLE notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL, -- 'missed_call', 'message'
  recipient_user_id UUID NOT NULL,
  sender_user_id UUID,
  call_id UUID,
  message_id UUID,
  chat_id UUID,
  fcm_message_id TEXT,
  status TEXT NOT NULL, -- 'sent', 'failed', 'no_token'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_notification_logs_recipient ON notification_logs(recipient_user_id);
CREATE INDEX idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX idx_notification_logs_created ON notification_logs(created_at DESC);

-- Enable RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification logs"
  ON notification_logs FOR SELECT
  USING (auth.uid() = recipient_user_id OR auth.uid() = sender_user_id);
```

## Testing Integration

### 1. Manual Test - Missed Call Notification
```bash
# Call the Edge Function directly
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-missed-call-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caller_user_id": "caller-uuid",
    "receiver_user_id": "receiver-uuid",
    "receiver_name": "Test User",
    "call_id": "call-uuid",
    "reason": "timeout"
  }'
```

### 2. Manual Test - Message Notification
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-message-notification \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_user_id": "recipient-uuid",
    "sender_user_id": "sender-uuid",
    "sender_name": "Test Sender",
    "chat_id": "chat-uuid",
    "message_id": "message-uuid",
    "message_preview": "Test message content"
  }'
```

### 3. Verify in notification_logs Table
```sql
SELECT * FROM notification_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

## Deployment Checklist

- [ ] Deploy send-missed-call-notification Edge Function
  ```bash
  supabase functions deploy send-missed-call-notification
  ```

- [ ] Deploy send-message-notification Edge Function
  ```bash
  supabase functions deploy send-message-notification
  ```

- [ ] Add SQL triggers/functions for your call and message handlers

- [ ] Create notification_logs table for debugging

- [ ] Test manual integration with curl requests

- [ ] Verify notification_logs are being populated

- [ ] Test end-to-end with 2 real devices

## Troubleshooting

### No notifications received
1. Check notification_logs table for failed entries
2. Verify FCM tokens exist in profiles table: `SELECT id, fcm_token FROM profiles WHERE fcm_token IS NOT NULL;`
3. Check Edge Function logs in Supabase dashboard
4. Verify Firebase service account has correct permissions

### Notifications delayed
1. Ensure high-priority is being set in Edge Function
2. Check device battery optimization settings
3. Verify network connectivity on recipient device

### Notifications not recognized by app
1. Check that app is processing type="missed_call" and type="message" payloads
2. Verify notification detection logic in BackgroundNotificationHandler
3. Check app's FCM initialization sequence
4. Ensure notification channels are created with correct IDs

## Next Steps

1. ✅ Deploy Edge Functions to Supabase
2. ✅ Add triggers to call_history and messages tables
3. ✅ Create notification_logs table
4. ✅ Test with manual curl requests
5. ⏳ Perform end-to-end testing with 2 real devices
6. ⏳ Monitor notification_logs in production
7. ⏳ Set up alerts for failed notifications
