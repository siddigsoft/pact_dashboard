# Send Call Invite Edge Function

Sends a high-priority **FCM** call invite to the callee so incoming calls can ring when the app is in the background or fully closed (WhatsApp-style).

## Secrets

Set these in Supabase:

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
```

Notes:
- `FIREBASE_SERVICE_ACCOUNT_JSON` must be the full JSON for a Firebase service account that has permission to send FCM messages.
- The function reads callee tokens from `profiles.fcm_tokens` (array) using the service role key.

## Deploy

```bash
supabase functions deploy send-call-invite
```

## Request

**POST** `https://<project-ref>.supabase.co/functions/v1/send-call-invite`

Headers:
- `Authorization: Bearer <supabase_session_token>`
- `Content-Type: application/json`

Body:

```json
{
  "callee_user_id": "uuid",
  "channel_name": "pact-xxxx-xxxxx",
  "call_id": "uuid",
  "caller_id": "uuid",
  "caller_name": "Dindu",
  "caller_avatar": "https://...",
  "is_audio_only": true
}
```

## What it sends (FCM data payload)

```json
{
  "type": "incoming_call",
  "call_id": "...",
  "channel_name": "...",
  "from": "...",
  "caller_id": "...",
  "caller_name": "...",
  "caller_avatar": "...",
  "is_audio_only": "true"
}
```

