# Complete Notification System Architecture

## System Overview

This document explains the complete notification system and how all components work together to deliver ringtones and notifications when calls are missed or messages are received.

## Components

### 1. Mobile App (Flutter - supabase/lib/services/)

#### A. BackgroundNotificationHandler
**Location:** `lib/services/background_notification_handler.dart`
**Purpose:** Route incoming FCM messages to appropriate handlers
**Key Methods:**
- `handleMessage()` - Entry point for all background/foreground messages
- `_isMissedCall()` - 5-level detection for missed calls
- `_isNewMessage()` - 3-level detection for new messages
- `_handleMissedCall()` - Process missed call (add to call_history, show notification)
- `_handleNewMessage()` - Process new message (update chat, show notification)

**Flow:**
```
FCM Message Received
        ↓
handleMessage(RemoteMessage)
        ↓
Type & Data parsed
        ↓
_isMissedCall(type, data) ──→ YES ──→ _handleMissedCall()
  ↓ (NO)
_isNewMessage(type, data) ──→ YES ──→ _handleNewMessage()
  ↓ (NO)
Log unknown message
```

#### B. FirebaseMessagingSetupService
**Location:** `lib/services/firebase_messaging_setup_service.dart`
**Purpose:** Initialize Firebase and set up message handlers
**Initialization Sequence:**
1. `initializeFirebaseMessaging()` - Complete setup
2. `_setupMessageHandlers()` - Configure foreground/background handlers
3. `_setupAndroidNotificationChannel()` - Create notification channels
4. Request notification permissions

**Handler Configuration:**
- Foreground: Process message immediately via BackgroundNotificationHandler
- Background: Process message immediately via BackgroundNotificationHandler
- Both call the same handler, ensuring consistent behavior

#### C. NotificationRoutingService
**Location:** `lib/services/notification_routing_service.dart`
**Purpose:** Display notifications through system
**Key Methods:**
- `showCallNotification()` - Show incoming call with ringtone
- `showMissedCallNotification()` - Show missed call
- `showMessageNotification()` - Show message
- `ringWithMessage()` - Play ringtone while showing dialog
- `get isInitialized` - Check if service is ready

**Notification Features:**
- High-priority notifications (+20 importance on Android)
- Custom channel IDs for categorization
- Ringtone playback on Android
- Vibration pattern support
- Multi-language support

#### D. RingtoneService
**Location:** `lib/services/ringtone_service.dart`
**Purpose:** Play audio for notifications
**Audio Asset:** `assets/sounds/Phone Dial Tone - Sound Effect (HD).mp3`
**Key Methods:**
- `playRingtone()` - Play once
- `loopRingtone()` - Continuous looping
- `stopRingtone()` - Stop playback
- Uses `audioplayers` package

#### E. BilingualNotificationService
**Location:** `lib/services/bilingual_notification_service.dart`
**Purpose:** Create notifications in user's language
**Features:**
- Arabic/English support
- Automatic language detection
- Proper text direction (RTL for Arabic)
- Channel IDs: `pact_calls_ar`, `pact_calls_en`, etc.

### 2. Backend - Supabase Edge Functions (TypeScript)

#### A. send-missed-call-notification
**Location:** `supabase/functions/send-missed-call-notification/index.ts`
**Triggered by:** Call ends without answer (via database trigger)
**Flow:**
```
Call timeout/rejection
        ↓
Database trigger fires
        ↓
POST /functions/v1/send-missed-call-notification
        ↓
Extract parameters:
- caller_user_id
- receiver_user_id
- call_id
- reason ("timeout", "rejected", "failed")
        ↓
Query profiles table for receiver's FCM token
        ↓
Initialize Firebase Admin SDK
        ↓
Send high-priority FCM with:
  - type: "missed_call"
  - notification_type: "missed_call"
  - caller_name: caller's name
  - call_id: call UUID
  - status: "missed"
  - reason: timeout/rejected/failed
        ↓
Log to notification_logs table
        ↓
Return {success: true, messageId}
```

**FCM Payload:**
```json
{
  "data": {
    "type": "missed_call",
    "notification_type": "missed_call",
    "caller_name": "John Doe",
    "call_id": "call-uuid",
    "status": "missed",
    "reason": "timeout"
  }
}
```

#### B. send-message-notification
**Location:** `supabase/functions/send-message-notification/index.ts`
**Triggered by:** Message inserted (via database trigger)
**Flow:**
```
Message inserted into database
        ↓
Database trigger fires
        ↓
POST /functions/v1/send-message-notification
        ↓
Extract parameters:
- recipient_user_id
- sender_user_id
- sender_name
- chat_id
- message_id
- message_preview
        ↓
Query profiles table for recipient's FCM token
        ↓
Validate and truncate preview (max 150 chars)
        ↓
Initialize Firebase Admin SDK
        ↓
Send high-priority FCM with:
  - type: "message"
  - notification_type: "message"
  - sender_name: sender's name
  - sender_id: sender UUID
  - chat_id: chat UUID
  - message_id: message UUID
  - message: preview text
        ↓
Log to notification_logs table
        ↓
Return {success: true, messageId}
```

**FCM Payload:**
```json
{
  "data": {
    "type": "message",
    "notification_type": "message",
    "sender_name": "Jane Doe",
    "sender_id": "sender-uuid",
    "chat_id": "chat-uuid",
    "message_id": "message-uuid",
    "message": "Hey, how are you?"
  }
}
```

### 3. Database - Supabase PostgreSQL

#### A. Notification Triggers
**Location:** `supabase/migrations/20250325_create_notification_triggers.sql`

**Triggers:**
1. `missed_call_notification_trigger` - on call_history INSERT/UPDATE
   - Fires when call status = 'missed', 'rejected', or 'failed'
   - Calls send-missed-call-notification Edge Function
   - Logs to notification_logs

2. `message_notification_trigger` - on messages INSERT
   - Fires when message is inserted
   - Checks if notifications muted for chat
   - Calls send-message-notification Edge Function
   - Logs to notification_logs

#### B. Notification Logs Table
**Tracks:** All notification attempts (sent, failed, no token)
**Columns:**
- `notification_type` - 'missed_call' or 'message'
- `recipient_user_id` - Who receives notification
- `sender_user_id` - Who triggers notification
- `call_id` - Call UUID (for missed calls)
- `message_id` - Message UUID (for messages)
- `chat_id` - Chat UUID (for messages)
- `fcm_message_id` - Firebase response ID
- `status` - 'sent', 'failed', 'no_token'
- `error_message` - Error details if failed
- `created_at` - When notification was attempted

#### C. Required Tables
- `call_history` - Tracks all calls with status, started_at, ended_at
- `messages` - Stores messages with sender_id, recipient_id, content
- `profiles` - User profiles with `fcm_token` and `full_name`
- `chat_participants` - Chat settings including `muted` flag

### 4. Firebase Cloud Messaging (FCM)

**Purpose:** Deliver messages to devices
**Configuration:**
- Service Account: Configured in Edge Functions
- API Key: Used by backend to send messages
- Topic Subscriptions: Can organize by user/device

**Message Types:**
- High-Priority: ~10 second delivery target
- Normal Priority: Batch delivered, hours possible

**Payload Structure:**
```json
{
  "data": {
    // Custom data fields (always strings)
    "type": "missed_call" or "message",
    "notification_type": "...",
    "..." : "..."
  },
  "webpush": {
    "headers": {
      "TTL": "0"  // Immediate delivery
    },
    "fcmOptions": {
      "link": "..." // Deep link for tap action
    }
  }
}
```

## Complete Message Flow

### Missed Call Notification Flow

```
┌─────────────────────────────────────────────────────────┐
│ Device A: User initiates call to Device B              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
    ┌───────────────────────────────────┐
    │ Device B: Call received           │
    │ - Ringtone plays                  │
    │ - Call notification shown         │
    │ - Call in progress (call_history) │
    └────────────────┬────────────────────┘
                     │
                     ▼
             ┌──────────────────┐
             │ Call times out   │
             │ (e.g., 60 secs)  │
             └────────┬─────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Backend: Detect missed call     │
        │ Update call_history status to   │
        │ 'missed' or 'rejected'          │
        └────────────┬────────────────────┘
                     │
                     ▼ (INSERT or UPDATE success)
    ┌──────────────────────────────────────────┐
    │ Database Trigger Fires:                  │
    │ missed_call_notification_trigger         │
    │ Function: send_missed_call_notification()│
    └────────────┬──────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ HTTP POST to Edge Function:              │
    │ /send-missed-call-notification           │
    │ Body: {                                  │
    │   caller_user_id,                       │
    │   receiver_user_id,                     │
    │   call_id,                              │
    │   reason: "timeout"                     │
    │ }                                       │
    └────────────┬──────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Edge Function:                           │
    │ 1. Query FCM token from profiles table   │
    │ 2. Init Firebase Admin SDK               │
    │ 3. Build FCM payload with type="missed_call"
    │ 4. Send via Firebase.messaging()         │
    │ 5. Log to notification_logs              │
    │ 6. Return {success, messageId}           │
    └────────────┬──────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Firebase Cloud Messaging (FCM):          │
    │ Route message to device B                │
    │ - High priority delivery                 │
    │ - ~10 second target delivery time        │
    └────────────┬──────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ Device B (Background/Closed):            │
    │ Firebase receives FCM message            │
    │ Triggers background message handler      │
    └────────────┬──────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ BackgroundNotificationHandler:           │
    │ 1. Parse incoming FCM message            │
    │ 2. Call _isMissedCall() - returns true   │
    │ 3. Call _handleMissedCall()              │
    │    - Insert into missed_calls table      │
    │    - Get caller info from profiles       │
    │    - Call NotificationRoutingService    │
    └────────────┬──────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ NotificationRoutingService:              │
    │ 1. Create notification with caller name  │
    │ 2. Set channel ID to trigger and sound   │
    │ 3. Tap opens missed call (Call history)  │
    │ 4. Show notification                     │
    └────────────┬──────────────────────────────┘
                 │
                 ▼ (1-2 seconds from FCM)
    ┌──────────────────────────────────────────┐
    │ Device B: Notification appears           │
    │ "John Doe - Missed Call"                 │
    │ (Ringtone played during call attempt)    │
    └──────────────────────────────────────────┘
```

### Message Notification Flow

```
┌────────────────────────────────────────────────┐
│ Device A: User sends message to Device B      │
│ in chat with Device B                         │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
        ┌────────────────────────────┐
        │ Message inserted into      │
        │ messages table with status │
        │ = 'sent'                   │
        └──────────────┬─────────────┘
                       │
                       ▼ (INSERT success)
        ┌─────────────────────────────────────┐
        │ Database Trigger Fires:             │
        │ message_notification_trigger        │
        │ Function: send_message_notification()
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │ Check if muted in chat_participants│
        │ (Skip if muted: true)               │
        └──────────────┬──────────────────────┘
                       │
                       ▼ (Not muted)
        ┌─────────────────────────────────────┐
        │ HTTP POST to Edge Function:         │
        │ /send-message-notification          │
        │ Body: {                             │
        │   recipient_user_id,                │
        │   sender_user_id,                   │
        │   sender_name,                      │
        │   chat_id,                          │
        │   message_id,                       │
        │   message_preview                   │
        │ }                                   │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │ Edge Function:                      │
        │ 1. Query FCM token from profiles    │
        │ 2. Truncate preview (max 150 chars) │
        │ 3. Init Firebase Admin SDK          │
        │ 4. Build FCM payload with type="message"
        │ 5. Send via Firebase.messaging()    │
        │ 6. Log to notification_logs         │
        │ 7. Return {success, messageId}      │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │ Firebase Cloud Messaging (FCM):     │
        │ Route message to device B           │
        │ - High priority delivery            │
        │ - ~10 second target delivery time   │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │ Device B (Background/Closed):       │
        │ Firebase receives FCM message       │
        │ Triggers background message handler │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │ BackgroundNotificationHandler:      │
        │ 1. Parse incoming FCM message       │
        │ 2. Call _isNewMessage() - returns   │
        │    true (3-level detection)         │
        │ 3. Call _handleNewMessage()         │
        │    - Get sender info from profiles  │
        │    - Call NotificationRoutingService
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │ NotificationRoutingService:         │
        │ 1. Create notification with sender  │
        │    name and message preview         │
        │ 2. Set channel ID for messaging     │
        │ 3. Tap opens chat with sender       │
        │ 4. Show notification                │
        └──────────────┬──────────────────────┘
                       │
                       ▼ (1-2 seconds from FCM)
        ┌─────────────────────────────────────┐
        │ Device B: Notification appears      │
        │ "Jane Doe: Hey, how are you?"       │
        └─────────────────────────────────────┘
```

## Detection Logic

### Missed Call Detection (5 levels)

**Level 1: Type Check**
```dart
if (type == 'missed_call') return true;  // Direct type indicator
```

**Level 2: Status Check**
```dart
if (data['notification_type'] == 'missed_call') return true;
if (data['status'] == 'missed') return true;
```

**Level 3: Event/Payload Check**
```dart
if (data['event'] == 'call_terminated' && data['reason'] == 'no_answer') return true;
if (data['payload']?.contains('missed_call') ?? false) return true;
```

**Level 4: Content Check**
```dart
if (data['content']?.toLowerCase().contains('missed') ?? false) return true;
if (data['title']?.toLowerCase().contains('missed') ?? false) return true;
```

**Level 5: Fallback**
```dart
// If notification mentions a call, assume missed if not explicitly answered
if (data['type'] == 'call') return true;
```

### Message Detection (3 levels)

**Level 1: Type Check**
```dart
if (type == 'message') return true;  // Direct type indicator
```

**Level 2: Content + Sender Check**
```dart
if (data['notification_type'] == 'message') return true;
if (data['content'] != null && data['sender_id'] != null) return true;
```

**Level 3: Sender + Chat Check**
```dart
if (data['sender_id'] != null && data['chat_id'] != null) return true;
```

## Performance Optimization

### Ringtone Delivery
- High-priority FCM (~10 second delivery)
- Immediate playback on app startup (not waiting for FCM)
- Ringtone plays for 60+ seconds while call pending
- Stops immediately when call ends or answered

### Notification Delivery
- High-priority FCM with TTL=0 (immediate)
- Notification logs for failure analysis
- Automatic retry handling at FCM level
- Fallback to main chat screen if navigation fails

### Battery Optimization
- Ringtone stops after call ends
- No background wake locks
- Respects device Do Not Disturb settings
- No polling, uses push notifications

## Error Handling

### FCM Token Issues
- No token: Log as 'no_token' in notification_logs, silently fail
- Invalid token: Firebase returns error, logged to notification_logs
- Token refresh: Handled by Firebase SDK automatically

### Database Issues
- Connection failed: Logged to notification_logs with error message
- Insert failed: Notification attempt logged as 'failed'
- Trigger failed: System logs captured in error_message column

### Network Issues
- Edge Function timeout: Logged as 'failed' with timeout error
- Firebase unreachable: FCM library handles with retry logic
- Device offline: Message queued by FCM, delivered when online

## Monitoring

### Check Notification Success Rate
```sql
SELECT
  notification_type,
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'sent') / COUNT(*), 2) as success_rate
FROM notification_logs
WHERE created_at > now() - interval '24 hours'
GROUP BY notification_type, status;
```

### Identify Failed Notifications
```sql
SELECT
  id,
  notification_type,
  recipient_user_id,
  error_message,
  created_at
FROM notification_logs
WHERE status = 'failed'
  AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

### Track Peak Usage Times
```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  notification_type,
  COUNT(*) as count
FROM notification_logs
WHERE created_at > now() - interval '7 days'
  AND status = 'sent'
GROUP BY DATE_TRUNC('hour', created_at), notification_type
ORDER BY hour DESC;
```

## Troubleshooting Decision Tree

```
Notification not appearing?
├─ No ringtone playing during call?
│  ├─ Check RingtoneService audio asset exists
│  ├─ Check NotificationRoutingService is initialized
│  └─ Check Android notification permissions granted
├─ No notification after call ends?
│  ├─ Check notification_logs table for failed entries
│  ├─ Verify FCM token exists: SELECT fcm_token FROM profiles WHERE id = 'user_id'
│  ├─ Check BackgroundNotificationHandler.handleMessage() is called
│  └─ Verify _isMissedCall() returns true for payload
└─ Notification delayed (>5 seconds)?
   ├─ Check if device is in battery saver mode
   ├─ Check if app is restricted in battery optimization
   ├─ Verify FCM high-priority is set
   └─ Check network connectivity
```

## Security Considerations

1. **FCM Tokens:** Encrypted in transit, stored securely in profiles table
2. **Data Privacy:** notification_logs table RLS prevents data leakage
3. **Service Account:** Firebase service account key never exposed to client
4. **User Privacy:** Notification content truncated (150 chars) to prevent sensitive data
5. **Authentication:** Edge Functions require service role key, only called internally by triggers

## Future Enhancements

1. **Notification Preferences:** Let users customize sounds/vibrations per contact
2. **Do Not Disturb:** Respect device and app-level DND settings
3. **Notification Grouping:** Group multiple missed calls/messages from same sender
4. **Read Receipt FCM:** Send message read status via separate Edge Function
5. **Analytics:** Track notification engagement (taps, dismissals)
6. **A/B Testing:** Test different notification styles/text
7. **Multi-language:** Localize notification text based on user language
8. **Accessibility:** Support screen readers and high contrast modes

---

**Last Updated:** {{current_date}}
**Version:** 1.0
**Status:** Production Ready
