# Background / WhatsApp-style calling

This doc describes how incoming Agora calls can ring when the app is in the background or **fully closed** (like WhatsApp).

## Current behavior (app code)

1. **Caller starts a call**  
   - Sends signaling over Supabase Realtime (in-app callee).  
   - **Also** calls the Supabase Edge Function `send-call-invite` with callee user id, channel name, call id, caller name/avatar, and audio-only flag.

2. **Callee device**  
   - **App open**: Realtime delivers the call → incoming call dialog and ringtone.  
   - **App background or killed**: Realtime is not connected. The **only** way to ring is via **FCM**. Your backend must send a high-priority FCM message to the callee’s device with the call payload. When the user taps the notification (or the system shows the full-screen intent), the app opens and the same incoming-call dialog is shown using the payload (channel name, call id, etc.).

3. **Opening the app from a call notification**  
   - FCM: `getInitialMessage()` gives the message; the app routes to main and sets “pending FCM call” with that data.  
   - Local notification (shown by the background handler): the notification payload is JSON with the same call data. On launch, the app reads it via `getNotificationAppLaunchDetails()` and sets the same pending call.  
   - When the main layout is ready, it consumes the pending call and pushes it into the Agora incoming-call stream so the dialog appears and the user can Accept/Decline.

So **background/killed calling only works if**:

- The **caller** triggers the `send-call-invite` Edge Function (already done from the app).
- You **implement** the Edge Function so it sends an FCM message to the **callee** with the right payload.

## Required: Edge Function `send-call-invite`

The app calls:

```ts
await supabase.functions.invoke('send-call-invite', {
  body: {
    callee_user_id: string,
    channel_name: string,
    call_id: string,
    caller_id: string,
    caller_name: string,
    caller_avatar: string | null,
    is_audio_only: boolean,
  },
});
```

You must implement this function so that it:

1. Looks up the **callee’s FCM token(s)** (e.g. from `profiles.fcm_tokens` or your `user_id` → tokens table).
2. Sends a **high-priority FCM message** (data-only or notification + data) to that token with at least:

   - `type` or `notification_type`: `"incoming_call"`
   - `call_id`
   - `channel_name`
   - `from` or `caller_id`
   - `caller_name`
   - `caller_avatar` (optional)
   - `is_audio_only` or `is_video_call`

So the callee’s app (background handler) receives a payload like:

```json
{
  "type": "incoming_call",
  "call_id": "...",
  "channel_name": "pact-xxx-xxx",
  "from": "<caller user id>",
  "caller_name": "Dindu",
  "caller_avatar": "https://...",
  "is_audio_only": true
}
```

Use your existing FCM sending setup (e.g. Firebase Admin SDK in the Edge Function, or another backend that sends FCM to the callee’s token). Send a **data** message (or notification + data) so the background handler receives the payload when the app is in background or killed. The mobile app already handles this payload and shows the incoming call notification and, when opened, the full-screen incoming call UI.

## Android

- **Permissions**: `FOREGROUND_SERVICE_PHONE_CALL`, `USE_FULL_SCREEN_INTENT` are already in the manifest.
- **Channel**: The incoming-call notification uses a high-priority channel and `fullScreenIntent: true` so the system can show a full-screen intent when the device is locked or the app is in the background.

## iOS

- **Background mode**: `voip` is in Info.plist; for true “call when app is killed” you typically add **CallKit** and **VoIP push (PushKit)** so the system shows the native call UI. The current flow uses FCM + local notification; for a native lock-screen call UI on iOS you’d add CallKit and a VoIP push provider.

## Summary

- **App side**: Caller sends Realtime + invokes `send-call-invite`. Callee handles FCM/local notification and shows the same incoming-call dialog when the app is opened from the notification.
- **Backend**: Implement `send-call-invite` to send FCM to the callee with the payload above. After that, background/killed incoming calling will work like WhatsApp from the user’s perspective (ring from notification, open app, accept/decline).
