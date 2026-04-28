# Calls vs Messages & Missing Notifications Troubleshooting Guide

## Part 1: Difference Between "Call" and "Messages" Tabs

### **Call Tab** (in Communications Screen)
**Location:** Communications Screen → Calls Tab

**What it shows:**
- Active call contacts (people you can call)
- Recent calls (from CallHistoryService)
- Missed calls (from CallHistoryService)
- Call history and call logs
- User presence status (Online/Offline)
- User availability/status

**How it works:**
1. When you tap a contact → initiates Agora WebRTC call
2. Call goes through: `AgoraCallService` → Call invite sent via Supabase Realtime
3. Receiver gets real-time notification via Realtime channel (not FCM)
4. Missed calls tracked by `CallHistoryService` and `call_history` table

**Notification Type:** 
- Incoming call notifications (while app open): via Supabase Realtime
- Missed call notifications (app closed): via FCM with type = `"missed_call"`
- Call invite: via Supabase Realtime `call_invites` channel

---

### **Messages Tab** (in Communications Screen)
**Location:** Communications Screen → Messages Tab → ChatListScreen

**What it shows:**
- Chat conversations (one-on-one)
- Unread message counts
- Last message preview
- Chat participant status
- Message threads

**How it works:**
1. When you send a message → saved to `chat_messages` table
2. Sender status automatically marked as "sent" → "delivered"
3. When receiver opens chat → message status changes to "read" (blue check)
4. New messages trigger: Realtime listener (foreground) + FCM notification (background)

**Notification Type:**
- New message notifications: via FCM with type = `"message"` or `"chat"`
- Real-time updates: via Supabase Realtime `chat_messages` channel

---

## Part 2: Why You Might Not See Missed Call Notifications

### **Possible Reasons:**

#### 1. **Missed Call Notifications Not Being Sent by Backend**
**Check:**
- Does your backend have logic to detect missed calls?
- Is it sending FCM notification when a call is missed?
- Is the `notification_type` field set to `"missed_call"`?

**Expected FCM Payload:**
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
    "call_id": "call_123",
    "status": "missed"
  }
}
```

#### 2. **Notification Permissions Not Granted**
**On Android:**
- Go to Settings → Apps → PACT Mobile → Permissions → Notifications
- Turn ON "Allow notifications"

**On iOS:**
- Settings → Notifications → PACT Mobile
- Turn ON "Allow Notifications"
- Ensure "Sounds" is enabled

#### 3. **Notification Channel Not Created**
**In Android, missed calls should use a channel like:**
```dart
AndroidNotificationChannel(
  'missed_calls',        // channel ID
  'Missed Calls',        // channel name
  importance: Importance.max,
  playSound: true,
  enableVibration: true,
)
```

#### 4. **Notification Detection Failed**
The app checks for missed calls using:
```dart
bool _isMissedCall(String type, Map<String, dynamic> data) {
  return normalizedType == 'missed_call' ||
         normalizedType.contains('missed') ||
         payload.startsWith('missed_call') ||
         status == 'missed';
}
```

**Debug: Check if notification type is one of these:**
- `missed_call`, `call_missed`, contains `"missed"`, or status = `"missed"`

---

## Part 3: Why You Might Not See Message Notifications

### **Possible Reasons:**

#### 1. **Message Notifications Not Being Sent by Backend**
**Check:**
- When a message is sent, does the backend send FCM to the recipient?
- Is the `notification_type` field set to `"message"` or `"chat"`?
- Is the recipient ID correct?

**Expected FCM Payload:**
```json
{
  "notification": {
    "title": "Sender Name",
    "body": "Message preview"
  },
  "data": {
    "type": "message",
    "notification_type": "message",
    "sender_name": "Alice",
    "sender_id": "user_123",
    "chat_id": "chat_abc",
    "message_id": "msg_xyz",
    "message": "Hello!"
  }
}
```

#### 2. **FCM Disabled in App Settings**
**Check:**
- Go to PACT Mobile Settings → Notifications
- Ensure "Message notifications" is ON
- Ensure "Allow notifications when app is closed" is ON

#### 3. **Chat Already Open or Message Already Read**
**Behavior:**
- If you're inside the chat when message arrives → notification suppressed (already visible)
- If app is fully closed → FCM notification should show
- If app is in background → FCM notification should show

#### 4. **Message Not Triggering Notification in Foreground**
**Issue:** Messages sent while you're in the exact chat might not show notification
**Normal Behavior:** The message appears directly in the chat list instead

---

## Part 4: Notification Flow Diagram

### **When Call Arrives (App Closed/Background):**
```
1. Caller initiates call → Supabase Realtime call_invites
2. If receiver offline → Backend sends FCM: type="incoming_call"
3. FCM received → BackgroundNotificationHandler routes to _handleIncomingCall()
4. Show notification + play ringtone
5. User taps notification → App opens, shows call screen
```

### **When Call Is Missed (Receiver Rejected/Timeout):**
```
1. Call expires or rejected → Agora fires missed_call event
2. Backend detects missed call → sends FCM: type="missed_call"
3. FCM received → BackgroundNotificationHandler routes to _handleMissedCall()
4. Show "Missed Call" notification
5. User taps → App opens, shows missed call alert
```

### **When Message Arrives (App Closed/Background):**
```
1. Sender sends message → saved to chat_messages table
2. Realtime broadcasts change
3. Backend sends FCM: type="message"
4. FCM received → BackgroundNotificationHandler routes to _handleNewMessage()
5. Show "New Message" notification
6. User taps → App opens, shows chat screen
```

### **When Message Arrives (App in Foreground):**
```
1. Sender sends message → saved to chat_messages table
2. Realtime broadcasts immediately (listener in ChatScreen active)
3. Message appears in chat_list automatically (no notification needed)
4. OR notification suppressed because chat already showing
```

---

## Part 5: Notification Type Detection Logic

### **How App Determines Notification Type:**

```dart
String _resolveNotificationType(RemoteMessage message, Map<String, dynamic> data) {
  // Priority order:
  // 1. notification_type field
  final rawType = (data['notification_type'] ?? 
                   data['type'] ?? 
                   data['event'] ?? 
                   data['category'] ?? '').toString().toLowerCase();
  
  if (rawType.isNotEmpty) return rawType;
  
  // 2. Analyze payload field
  if ((data['payload'] ?? '').toString().contains('missed_call')) {
    return 'missed_call';
  }
  
  // 3. Status field
  if ((data['status'] ?? '').toString() == 'missed') {
    return 'missed_call';
  }
  
  return 'unknown';
}
```

### **Routing Logic:**

```
Type Detected              →  Handler Called
────────────────────────────────────────────
"incoming_call"           →  _handleIncomingCall()
"missed_call"             →  _handleMissedCall()
"message" or "chat"       →  _handleNewMessage()
"broadcast"               →  _handleBroadcast()
"fund_receipt", etc.      →  _handleFinancialNotification()
```

---

## Part 6: Troubleshooting Checklist

### **For Missed Call Notifications NOT Showing:**

- [ ] Is the backend detecting missed calls? (Check call_history table)
- [ ] Is the backend sending FCM with `type="missed_call"`?
- [ ] Do Android notification permissions allow "Calls"?
- [ ] Is the notification channel created for missed calls?
- [ ] Is FCM token registered on the device? (Check Firebase Console)
- [ ] Run `NotificationDiagnosticsService().runFullDiagnostics()` to verify setup

### **For Message Notifications NOT Showing:**

- [ ] Is the backend sending FCM when a message is sent?
- [ ] Is the `sender_id` and recipient ID correct in FCM?
- [ ] Are Android notification permissions granted?
- [ ] Is the app in the exact chat when message arrives? (This suppresses notification)
- [ ] Is the chat_messages table getting the message?
- [ ] Run `NotificationDiagnosticsService().runFullDiagnostics()` to verify setup

### **For No Notifications at All:**

- [ ] Is Firebase properly initialized? (Check main.dart)
- [ ] Is FCM enabled in Google Cloud Console?
- [ ] Does device have internet connection?
- [ ] Is app permission granted for "Post Notifications"?
- [ ] Check [Android Settings] → Apps → PACT Mobile → Permissions → Notifications
- [ ] Uninstall and reinstall the app to reset FCM token
- [ ] Check Firebase Console → Cloud Messaging → View diagnostics

---

## Part 7: Key Services Involved

| Service | Responsible For |
|---------|-----------------|
| `BackgroundNotificationHandler` | Routes FCM to correct handler |
| `NotificationRoutingService` | Decides how to display notification |
| `BilingualNotificationService` | Creates notification channels |
| `CallNotificationService` | Shows local notifications |
| `RingtoneService` | Plays audio |
| `firebase_messaging_setup_service` | Initializes FCM handlers |
| `CallHistoryService` | Tracks missed calls |
| `ChatService` | Manages messages |

---

## Part 8: How to Test Notifications

### **Test Incoming Call Notification:**
1. Login on Device A
2. Login on Device B (different user)
3. Call from Device B to Device A
4. Put Device A in background (app not visible)
5. Should see notification pop-up
6. Should hear ringtone
7. Tap notification → call screen appears

### **Test Missed Call Notification:**
1. Device B calls Device A
2. Let it ring and timeout (don't answer)
3. Should see "Missed Call" notification
4. If app is closed, notification should appear when reopened

### **Test Message Notification:**
1. Login on Device A
2. Login on Device B (different user)
3. Put Device A in background
4. Send message from Device B to Device A
5. Should see notification
6. Tap notification → opens chat
7. Message should show as "delivered"

---

## Summary Table

| Feature | Call Tab | Messages Tab | Notification |
|---------|----------|--------------|--------------|
| Real-time? | Yes (Realtime) | Yes (Realtime) | Yes (FCM) |
| Show when open? | Dialog appears | Message in list | Suppressed if visible |
| Show when background? | Notification | Notification | YES |
| Show when closed? | Notification | Notification | YES |
| Requires caller online? | Yes | No (offline sync) | No (stored) |
| Sound/Vibration? | Yes | Yes | Yes |
| Read receipt? | Accepted/Rejected | Blue check | N/A |

