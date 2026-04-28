# Quick Notification Diagnostics

## The Key Differences

### **📞 Calls Tab**
- Shows: People you can call + call history + missed calls
- Realtime: When app is open, you see call screen immediately
- Background: Triggers FCM notification + ringtone
- Tracks: Call history in `call_history` table
- Missed: Detected when call times out or rejected

### **💬 Messages Tab**  
- Shows: Chat conversations + message threads
- Realtime: When app is open, messages appear in chat instantly
- Background: Triggers FCM notification
- Tracks: Message status (sent → delivered → read)
- Blue tick: Shows when recipient reads the message

---

## Why You Don't See Missed Call Notifications

### **Most Common Reasons (in order):**

1. **Missed call notifications not being sent by backend**
   - Backend needs to detect when call is missed
   - Backend needs to send FCM message with `type: "missed_call"`
   - **Action:** Check if backend has code for this

2. **Android notification permissions disabled**
   - **Fix:** Settings → Apps → PACT Mobile → Permissions → Notifications (turn ON)

3. **App is already open on the chat**
   - Notifications are suppressed if message/call is already visible
   - **Expected:** Message appears in list, no notification needed

4. **FCM not properly initialized**
   - **Check:** Firebase Console → check if app sending/receiving tokens
   - **Action:** Uninstall & reinstall app to get fresh FCM token

5. **Notification channel not created**
   - App needs specific notification channels for calls and messages
   - **Status:** Already handled by `BilingualNotificationService.initialize()`

---

## Why You Don't See Message Notifications

### **Most Common Reasons:**

1. **Message notifications not being sent by backend**
   - When message saved to database, backend doesn't send FCM
   - **Action:** Verify backend has code to send FCM `type: "message"`

2. **You're in the chat when message arrives**
   - Message appears directly in chat (notification suppressed)
   - **Expected:** No notification, just message in list

3. **Android notification permissions disabled**
   - **Fix:** Settings → Apps → PACT Mobile → Permissions → Notifications (turn ON)

4. **App not running or internet disconnected**
   - FCM can't deliver if device offline
   - **Check:** Device has WiFi/mobile data connected

---

## Testing Steps

### **Test 1: Missed Call Notification**
```
Device A (Receiver):
1. Login and go to background (press home button)
2. Open another device or have friend call you

Device B (Caller):
2. Find Device A user in Calls tab
3. Click to call

Result Should Be:
✅ Ringtone plays on Device A
✅ System notification appears at top
✅ Notification shows "Incoming Call - [Name]"
✅ Tap notification → call screen opens
```

### **Test 2: Missed Call Notification (After Refusing)**
```
Result Should Be:
✅ Let it ring and timeout (or press Reject)
✅ App shows "Missed Call" notification
✅ In Calls tab → "Missed" section shows the call
```

### **Test 3: Message Notification (App in Background)**
```
Device A (Receiver):
1. Go to background (press home button)
2. Do NOT open the Messages tab

Device B (Sender):
1. Go to Messages tab
2. Find Device A user
3. Type and send a message

Result Should Be:
✅ System notification appears at top of Device A
✅ Notification shows "Device B Name - message preview"
✅ Tap notification → Chat opens showing the message
✅ Message shows "delivered" status in Device B's chat
✅ When Device A reads it → becomes "read" (blue check)
```

### **Test 4: Message Notification (App Fully Closed)**
```
Device A:
1. Close app completely (swipe from recent apps)
2. Wait 5 seconds

Device B:
1. Send a message

Result Should Be:
✅ Device A shows notification even though app is closed
✅ Tap notification → app opens and shows that message
```

---

## Notification System Flow (Technical)

```
┌─────────────────────────────────────────┐
│ Incoming Notification (FCM)             │
└──────────────────┬──────────────────────┘
                   ↓
        Is app in background/closed?
        ↙                            ↘
      YES                            NO (FOREGROUND)
       ↓                              ↓
FCM Message        FirebaseMessaging.onMessage
Handler (top-level)  Handler (in app)
       ↓                              ↓
BackgroundNotification    BackgroundNotification
Handler.handleMessage()    Handler.handleMessage()
(isBackground=true)        (isBackground=false)
       ↓                              ↓
    Detect Type (missed_call, message, etc.)
       ↓
┌──────────────────────────────────┐
├─ If MISSED_CALL                  │
│  → Show "Missed Call" notification│
│  → Vibrate (if enabled)           │
│  → Log to call_history            │
├─ If MESSAGE                       │
│  → Show Message notification      │
│  → Play message sound             │
│  → Log to chat_logs               │
├─ If INCOMING_CALL (foreground)    │
│  → Skip (Realtime already handled)│
└──────────────────────────────────┘
```

---

## Critical Files Involved

| File | Purpose |
|------|---------|
| `lib/services/firebase_messaging_setup_service.dart` | FCM initialization |
| `lib/services/background_notification_handler.dart` | Routes notifications |
| `lib/services/bilingual_notification_service.dart` | Creates notifications |
| `lib/services/ringtone_service.dart` | Plays audio |
| `lib/services/call_notification_service.dart` | Shows call notifications |
| `lib/services/notification_routing_service.dart` | Handles routing logic |

---

## Quick Debugging

### **Enable Debug Logs:**
In Android Studio / VS Code, run:
```bash
flutter run -v
```

Then look for logs containing:
- `[FCM Setup]` - FCM initialization
- `[BackgroundHandler]` - Notification routing
- `[Notification]` - Notification display
- `[Ringtone]` - Audio playback

### **Check FCM Token:**
```dart
// Add this to a test button or initialization
final token = await FirebaseMessaging.instance.getToken();
print('FCM Token: $token');
```

### **Manual Notification Test:**
From Firebase Console:
1. Go to Cloud Messaging
2. Send Test Message
3. Select your app + user
4. Send → check if notification arrives

---

## TLDR (Too Long; Didn't Read)

**Calls Tab** = People + Call History  
**Messages Tab** = Chat Conversations  

**Why no missed call notifications?**
- Backend not sending "missed_call" FCM, OR
- Android permissions are OFF, OR
- App closed with no FCM token

**Why no message notifications?**
- Backend not sending "message" FCM when message sent, OR
- You were already in chat (suppressed), OR
- Android permissions are OFF

**Quick Fix:**
1. Check Android Settings → App Permissions → Notifications (must be ON)
2. Uninstall/reinstall app (gets fresh FCM token)
3. Check that backend is sending FCM payloads correctly

