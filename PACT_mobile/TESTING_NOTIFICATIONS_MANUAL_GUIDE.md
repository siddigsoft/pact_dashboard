# Testing Notifications - Manual Verification Guide

## ✅ STATUS CHECK: What We Fixed

✅ **Ringtone paths** - Fixed to use existing audio file  
✅ **Foreground message processing** - Now processes calls/messages when app open  
✅ **Missed call detection** - Enhanced with 5-level detection logic  
✅ **Message detection** - Enhanced with 3-level detection logic  
✅ **High-priority logging** - Added debug markers for both types  

---

## NOW: What Backend Needs to Do

🔴 **CRITICAL:** Backend must send FCM notifications with correct `type` field

WITHOUT this, even with our fixes, notifications won't show.

---

## Testing Steps (2 Devices Required)

### Setup:
- Device A: Your phone (receiver)
- Device B: Another phone or another account (caller/sender)
- Both logged into PACT Mobile app

---

## Test 1: Verify Ringtone Works (App Background)

**Preparation:**
1. Device A: Open PACT Mobile app
2. Device A: Go to Communications tab → Calls tab
3. Device A: Press HOME button (app goes to background but not closed)

**Execution:**
1. Device B: Open PACT Mobile app
2. Device B: Go to Communications → Calls
3. Device B: Find Device A in contacts
4. Device B: Click to CALL Device A
5. Wait 5 seconds

**Expected Result:**
✅ Device A hears ringtone  
✅ Device A sees notification at top of screen  
✅ Notification says "Device B Name - Incoming Call"  
✅ Can tap notification to answer

**If NOT Working:**
- Check: Device A has notification permissions enabled
- Check: Device A's phone volume is ON (not silent)
- Check: WiFi/Mobile data connected on both devices

---

## Test 2: Verify Missed Call Notification

**Prerequisites:** Test 1 working

**Execution:**
1. Device A: Already in background from Test 1
2. Device B: Still showing incoming call screen on Device A
3. Let the incoming call ring for 30+ seconds (or tap Reject on Device B)

**Expected Result:**
✅ Device A shows "Missed Call - Device B Name" notification  
✅ Notification appears even though app is background/closed  
✅ Tap notification → opens app to missed call alert  

**If NOT Working:**
- ❌ Backend not detecting missed calls
- ❌ Backend not sending FCM with `type: "missed_call"`
- ❌ Android notification permission disabled

**Fix:** 
1. Check backend code - look for missed call detection
2. Verify FCM payload includes `type: "missed_call"`
3. Settings → Apps → PACT Mobile → Notifications (turn ON)

---

## Test 3: Verify Message Notification (App Background)

**Preparation:**
1. Device A: Open app
2. Device A: Go to Communications → Messages tab
3. Device A: Do NOT open any chat conversation
4. Device A: Press HOME (app background)
5. Wait 5 seconds to ensure background

**Execution:**
1. Device B: Open PACT Mobile app
2. Device B: Go to Communications → Messages
3. Device B: Find Device A user
4. Device B: Open chat
5. Device B: Type a message
6. Device B: Hit SEND

**Expected Result:**
✅ Device A shows notification at top  
✅ Notification shows: "Device B Name - [message preview]"  
✅ Tap notification → opens chat showing the message  
✅ Message shows "delivered" status on Device B side  

**If NOT Working:**
- ❌ Backend not detecting new messages
- ❌ Backend not sending FCM for messages  
- ❌ FCM type field not set to `"message"`

**Fix:**
1. Check backend - message insert trigger
2. Verify FCM being sent to recipient (not sender)
3. Verify FCM has `sender_name` and message preview

---

## Test 4: Verify Message Notification (App Closed)

**Preparation:**
1. Device A: Open app
2. Device A: Do NOT navigate to Messages
3. Close app completely (swipe from recent apps)
4. Wait 10 seconds

**Execution:**
1. Device B: Send a message to Device A

**Expected Result:**
✅ Device A shows notification (even though app completely closed)  
✅ Tap notification → app opens and shows the message  

**If NOT Working:**
- ❌ Same as Test 3 (backend not sending FCM)

---

## Test 5: Verify Message Status Progression

**Preparation:** Message already sent and delivered

**Step 1: Check "Delivered" Status**
1. Device B (sender): In the chat see message with ✓ (check mark)
2. Device A: Receiving the message → status becomes "delivered"

**Step 2: Check "Read" Status**
1. Device A: Open the Messages tab → view device B's chat
2. Device B: Should see message now shows ✓✓ (double check mark, blue)

**Expected:**
- ✓ (gray) = sent
- ✓ (gray) = delivered
- ✓✓ (blue) = read

---

## Expected Behaviors

### When Incoming Call Arrives:

| State | Ringtone | Notification | Dialog |
|-------|----------|--------------|--------|
| Foreground | ✅ Plays | ✅ Shows | ✅ Dialog appears |
| Background | ✅ Plays | ✅ Shows | ❌ Opens on tap |
| Closed | ✅ Plays | ✅ Shows | ❌ Opens on tap |

### When Message Arrives:

| State | Sound | Notification | Chat Update |
|-------|-------|--------------|-------------|
| Foreground | ✅ Beeps | ❌ Suppressed | ✅ Appears in list |
| Background | ✅ Beeps | ✅ Shows | ✅ Opens on tap |
| Closed | ✅ Beeps | ✅ Shows | ✅ Opens on tap |

### When Call is Missed:

| State | Notification |
|-------|--------------|
| Foreground | ✅ Shows |
| Background | ✅ Shows |
| Closed | ✅ Shows |

---

## Debugging: Check Logs

### How to View Debug Logs:

**VS Code Terminal:**
```bash
# Navigate to project
cd C:\Users\PC\PACT_mobile

# Run with verbose logging
flutter run -v
```

**Look for these markers in the log output:**

```
[FCM Setup] Initialization START
[FCM Setup] Firebase.initializeApp() OK
[FCM Setup] BilingualNotificationService initialized
[FCM Setup] RingtoneService initialized
[FCM Setup] CallNotificationService initialized
[FCM Setup] NotificationRoutingService initialized
[FCM Setup] BackgroundNotificationHandler initialized
[FCM Setup] Message handlers SETUP COMPLETE
```

When notification arrives, you should see:

```
[BackgroundHandler] handleMessage ENTER isBackground=true/false
[BackgroundHandler] 🔴 HIGH PRIORITY: MISSED CALL DETECTED
[BackgroundHandler] ✅ MISSED CALL: Showing notification
[BackgroundHandler]    Caller: John Doe
[BackgroundHandler] ✅ MISSED CALL notification displayed
```

Or for messages:

```
[BackgroundHandler] 🔴 HIGH PRIORITY: MESSAGE DETECTED
[BackgroundHandler] ✅ MESSAGE: Showing notification
[BackgroundHandler]    From: Alice Johnson (ID: user_456)
[BackgroundHandler] ✅ MESSAGE notification displayed
```

---

## Common Issues & Quick Fixes

### Issue: "No notification at all"
**Cause:** Android permissions  
**Fix:** Settings → Apps → PACT Mobile → Permissions → Notifications → ON

### Issue: "Notification appears but no sound"
**Cause:** Phone volume or notification silenced  
**Fix:** Check phone volume + Notification settings

### Issue: "Missed call notification never shows"
**Cause:** Backend not detecting/sending missed calls  
**Fix:** Check backend code for missed call handler

### Issue: "Message notification never shows"
**Cause:** Backend not sending FCM for messages  
**Fix:** Check backend code for message notification trigger

### Issue: "Ringtone doesn't play"
**Cause:** Ringtone service not initializing  
**Fix:** Ensure app has notification AND audio permissions

---

## Next Steps

1. **Build and Run:**
   ```bash
   flutter clean
   flutter pub get
   flutter run
   ```

2. **Run Verbose to See Logs:**
   ```bash
   flutter run -v
   ```

3. **Test Each Scenario:**
   - Run through Test 1 (Ringtone)
   - Run through Test 2 (Missed Call)
   - Run through Test 3 (Message - Background)
   - Run through Test 4 (Message - Closed)

4. **Check Backend:**
   - If tests fail, provide backend logs
   - Check if FCM payloads being sent
   - Verify device FCM tokens are registered

5. **Report Results:**
   - Share which tests passed ✅
   - Share which tests failed ❌
   - Share logs from `flutter run -v`
   - Backend FCM payload logs if available

---

## Success Criteria

All tests should PASS for production:

✅ Test 1: Ringtone plays when app backgrounded  
✅ Test 2: Missed call notification shows  
✅ Test 3: Message notification shows (app background)  
✅ Test 4: Message notification shows (app closed)  
✅ Test 5: Message status shows read when viewed  

**Once ALL tests pass**: Notifications are working correctly ✅

