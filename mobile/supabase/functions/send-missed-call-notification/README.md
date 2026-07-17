# Send Missed Call Notification

## Purpose
Sends a missed call notification via Firebase Cloud Messaging (FCM) when:
- A call times out (no answer)
- A call is rejected
- A call fails to connect

## Endpoint
`POST https://[YOUR_PROJECT].supabase.co/functions/v1/send-missed-call-notification`

## Request Body
```json
{
  "caller_user_id": "user_123",
  "receiver_user_id": "user_456",
  "receiver_name": "John Doe",
  "call_id": "call_abc_123",
  "reason": "timeout"
}
```

## Request Parameters
- `caller_user_id` (string, required): User ID of who initiated the call
- `receiver_user_id` (string, required): User ID of who didn't answer  
- `receiver_name` (string, optional): Display name of receiver
- `call_id` (string, required): Unique call ID
- `reason` (string, optional): Why it was missed - "timeout", "rejected", "failed"

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
  "message": "No FCM token found for caller"
}
```

## FCM Payload Sent
```json
{
  "data": {
    "type": "missed_call",
    "notification_type": "missed_call",
    "caller_name": "John Doe",
    "call_id": "call_abc_123",
    "status": "missed",
    "reason": "timeout"
  }
}
```

## How to Call This Function

### From Edge Function (TypeScript)
```typescript
const response = await fetch(
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/'send-missed-call-notification`,
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
```

### From Database Trigger (SQL)
```sql
-- When call ends
CREATE OR REPLACE FUNCTION on_call_end()
RETURNS void AS $$
BEGIN
  -- Check if call was answered
  IF NOT call_was_answered THEN
    -- Send FCM notification
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-missed-call-notification',
      body := jsonb_build_object(
        'caller_user_id', caller_id,
        'receiver_user_id', receiver_id,
        'receiver_name', receiver_name,
        'call_id', call_id,
        'reason', 'timeout'
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

## Environment Variables
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access
- `FIREBASE_SERVICE_ACCOUNT_JSON` - Firebase service account JSON

## Deployment
```bash
supabase functions deploy send-missed-call-notification
```

## Testing
```bash
curl -X POST https://[YOUR_PROJECT].supabase.co/functions/v1/send-missed-call-notification \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "caller_user_id": "test_user_1",
    "receiver_user_id": "test_user_2",
    "receiver_name": "Test User",
    "call_id": "test_call_123",
    "reason": "timeout"
  }'
```
