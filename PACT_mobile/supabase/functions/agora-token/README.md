# Agora Token Edge Function

Generates Agora RTC tokens for authenticated users. Required for production calls (Agora tokens expire after 24h max).

## Setup

### 1. Set secrets

From your Agora Console, copy:
- **App ID** (e.g. `1d38576d0cfe429a9c996dfedcb60629`)
- **App Certificate** (enable in Project Settings → Primary Certificate)

Set Supabase secrets:

```bash
supabase secrets set AGORA_APP_ID=1d38576d0cfe429a9c996dfedcb60629
supabase secrets set AGORA_APP_CERTIFICATE=b09eec45b6054928ba247229a29c4385
```

### 2. Deploy

```bash
supabase functions deploy agora-token
```

## Request

**POST** to `https://<project-ref>.supabase.co/functions/v1/agora-token`

Headers:
- `Authorization: Bearer <supabase_session_token>`
- `Content-Type: application/json`

Body:
```json
{
  "channelName": "pact-abc12345-67890",
  "uid": 0,
  "expireSeconds": 3600
}
```

- `channelName` (required): Agora channel name
- `uid` (optional): User ID in channel. Default `0` = auto-assign
- `expireSeconds` (optional): Token lifetime. Default 3600 (1h), max 86400 (24h)

## Response

```json
{
  "token": "007eJxT...",
  "channelName": "pact-abc12345-67890",
  "uid": 0,
  "expireTimestamp": 1739108400
}
```

## Local testing

```bash
supabase functions serve agora-token
```

Test with curl (replace `YOUR_ANON_KEY` and `YOUR_USER_JWT`):

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/agora-token \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "test-channel"}'
```
