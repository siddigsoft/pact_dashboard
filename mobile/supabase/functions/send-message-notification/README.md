# Send Message Notification

## Purpose
Sends a message notification via Firebase Cloud Messaging (FCM) when:
- A new message is sent in a chat
- A user receives a chat message
- A message fails to deliver to recipient

## Endpoint
`POST https://[YOUR_PROJECT].supabase.co/functions/v1/send-message-notification`

## Request Body
```json
{
  "recipient_user_id": "user_456",
  "sender_user_id": "user_123",
  "sender_name": "John Doe",
  "chat_id": "chat_abc_123",
  "message_id": "msg_xyz_789",
  "message_preview": "Hey, how are you?"
}
```

## Request Parameters
- `recipient_user_id` (string, required): User ID receiving the message
- `sender_user_id` (string, required): User ID sending the message
- `sender_name` (string, required): Display name of sender
- `chat_id` (string, required): Chat/conversation ID
- `message_id` (string, required): Unique message ID
- `message_preview` (string, required): Message preview text (auto-truncated to 150 chars)

## Response

**Success (200)**
```json
{
  "success": true,
  "messageId": "message_id_from_firebase"
}
```

**Failure (400)**
```json
{
  "success": false,
  "reason": "no_fcm_token",
  "message": "No FCM token found for recipient"
}
```

## FCM Payload Sent
```json
{
  "data": {
    "type": "message",
    "notification_type": "message",
    "sender_name": "John Doe",
    "sender_id": "user_123",
    "chat_id": "chat_abc_123",
    "message_id": "msg_xyz_789",
    "message": "Hey, how are you?"
  }
}
```

## How to Call This Function

### From Edge Function (TypeScript)
```typescript
const response = await fetch(
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
      message_preview: messageText,
    }),
  }
);
```

### From Database Trigger (SQL)
```sql
-- When message is inserted
CREATE OR REPLACE FUNCTION on_message_insert()
RETURNS void AS $$
BEGIN
  -- Don't notify if sender is muted
  IF NOT is_muted THEN
    -- Send FCM notification
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-message-notification',
      body := jsonb_build_object(
        'recipient_user_id', recipient_id,
        'sender_user_id', sender_id,
        'sender_name', sender_name,
        'chat_id', chat_id,
        'message_id', message_id,
        'message_preview', message_preview
      ),
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
        'Content-Type', 'application/json'
      )
    );
  END IF;
END;
$$ LANGUAGE plpgsql;
```

## Message Preview Behavior
- Maximum length: 150 characters
- Automatically truncated with "..." if longer
- Example: "Hey, how are you? I've been thinking..." → "Hey, how are you? I've been thinking..."

## Environment Variables
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access
- `FIREBASE_SERVICE_ACCOUNT_JSON` - Firebase service account JSON

## Deployment
```bash
supabase functions deploy send-message-notification
```

## Testing
```bash
curl -X POST https://[YOUR_PROJECT].supabase.co/functions/v1/send-message-notification \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_user_id": "test_user_2",
    "sender_user_id": "test_user_1",
    "sender_name": "Test Sender",
    "chat_id": "test_chat_123",
    "message_id": "test_msg_456",
    "message_preview": "Hello, this is a test message!"
  }'
```
