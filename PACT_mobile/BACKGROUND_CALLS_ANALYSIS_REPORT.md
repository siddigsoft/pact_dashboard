# Background Calls System - Comprehensive Status Report

**Date:** 2024  
**Status:** ⚠️ PARTIALLY FUNCTIONAL - SIGNIFICANT GAPS IDENTIFIED  
**Can app make calls in background?:** ❌ **CANNOT** (Incoming calls yes with notification, but CANNOT accept/join actively)

---

## Executive Summary

The app **CAN receive incoming call notifications when backgrounded** through Firebase Messaging, but **CANNOT actively accept and join Agora calls while the app is in the background**. The infrastructure is fragmented with incomplete implementations that prevent full background call capability.

### Current Capabilities:
- ✅ FCM receives call invitations when app is killed/backgrounded
- ✅ Shows notification with vibration, audio, and fullScreenIntent
- ✅ Stores missed calls in database
- ✅ Queues offline calls for later sync

### Missing Capabilities:
- ❌ **NO automatic call screen launch on notification tap**
- ❌ **NO Agora engine initialization in background**
- ❌ **NO call acceptance workflow from background**
- ❌ **NO state persistence across app restart**
- ❌ **NO call stacking for multiple concurrent calls**
- ❌ **NO automatic offline queue sync on reconnection**

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Background Call System                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. INCOMING CALL PATH (When App Backgrounded)               │
│  ┌─→ FCM Backends → FirebaseMessagingService                │
│  │   └─→ show notification (ID: 9999) via notification tap  │
│  │       ├─ Vibration ✅                                    │
│  │       ├─ Audio ✅                                        │
│  │       └─ fullScreenIntent ✅                             │
│  │                                                            │
│  └─→ BackgroundCallHandler (via RealtimeChannel)            │
│      └─ Stores signal in _pendingFcmCall                    │
│                                                               │
│  2. BACKGROUND POLLING (Every 15 seconds)                    │
│  ┌─→ BackgroundCallHandlerEnhanced + Workmanager            │
│  │   └─→ _callbackDispatcher()                              │
│  │       ├─ _checkForIncomingCalls() - checks missed_calls  │
│  │       └─ _syncMessages() - syncs unread messages         │
│  │                                                            │
│  └─→ OfflineCallQueueService                                │
│      └─ Stores calls in database when offline               │
│      └─ NOTE: No auto-sync trigger on reconnection          │
│                                                               │
│  3. APP FOREGROUND HANDLING                                  │
│  ┌─→ MainScreen._checkForActiveCall()                       │
│  │   ├─ Waits for Agora engine ready (up to 5 seconds)      │
│  │   ├─ Gets pending call from getAndClearPendingFcmCall()  │
│  │   ├─ Falls back to route args if no pending             │
│  │   └─ Falls back to notification app launch details       │
│  │                                                            │
│  ├─→ AgoraCallService.acceptCall()                          │
│  │   ├─ REQUIRES engine to be initialized                   │
│  │   └─ Joins Agora channel                                 │
│  │                                                            │
│  └─→ MainScreen._attachIncomingCallListener()               │
│      └─ Shows incoming call dialog when app is active       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Analysis by Component

### 1. **Firebase Messaging Service** ✅ Receiving Notifications
**File:** `firebase_messaging_service.dart (204 lines)`

**Status:** ✅ Working for notification delivery

**What it does:**
- Initializes FCM with permission requests
- Sets up foreground/background message handlers
- Shows notifications with vibration and audio
- Handles notification taps

**Implementation:**
```dart
FirebaseMessaging.onMessage.listen() - Foreground messages
FirebaseMessaging.onMessageOpenedApp.listen() - Background tap
```

**Issues:**
- ❌ No call-specific routing to call screen
- ❌ No automatic app launch on call notification
- ❌ Generic notification handler (not call-aware)

---

### 2. **background_call_handler.dart** 🟡 Partial
**File:** `background_call_handler.dart (115 lines)`

**Status:** 🟡 Initialized but limited

**What it does:**
- Singleton that sets up Supabase RealtimeChannel for `agora-signaling:{userId}`
- Creates `incomingCallStream` to receive call signals
- Stores pending call in FCM until app launches

**Implementation:**
```dart
final channel = supabase.channel('agora-signaling:$userId');
channel.subscribe();
incomingCallStream = channel.broadcastStream();
```

**Issues:**
- ❌ Only receives signals, doesn't process them in background
- ❌ No automatic notification showing in background
- ❌ Stream is only active when app is in foreground
- ❌ No integration with Agora engine

---

### 3. **background_call_handler_enhanced.dart** 🔴 Incomplete
**File:** `background_call_handler_enhanced.dart (245 lines)`

**Status:** 🔴 References non-functional callback dispatcher

**What it does:**
- Registers Workmanager periodic tasks every 15 seconds
- Implements `_callbackDispatcher()` for background execution
- Database functions for missed calls tracking

**Workmanager Setup:**
```dart
Workmanager().initialize(_callbackDispatcher, isInDebugMode: kDebugMode);
Workmanager().registerPeriodicTask(
  'check_incoming_calls',
  'checkIncomingCalls',
  frequency: const Duration(seconds: 15),
);
```

**Background Tasks Defined:**
```dart
@pragma('vm:entry-point')
void _callbackDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    if (taskName == 'checkIncomingCalls') {
      await _checkForIncomingCalls();
      return true;
    } else if (taskName == 'syncMessages') {
      await _syncMessages();
      return true;
    }
  });
}

Future<bool> _checkForIncomingCalls() async {
  // Only checks missed_calls table
  // Does NOT initialize Agora or show call screen
  final pendingCalls = await supabase.from('missed_calls').select();
  return true;
}
```

**Critical Issues:**
- ❌ **Callback dispatcher ONLY checks database** - does not interact with call signals
- ❌ **No Agora engine initialization in background** - illegal on Android
- ❌ **No UI launch** - can't show call screen from background task
- ❌ **15-second polling is excessive** - will drain battery
- ❌ **No FCM integration** - only checks local database
- ❌ **Task runs across all users** - no user session context

---

### 4. **offline_call_queue_service.dart** 🟡 Incomplete
**File:** `offline_call_queue_service.dart (136 lines)`

**Status:** 🟡 Queueing works, but sync trigger missing

**What it does:**
- Stores calls in Hive when offline
- Implements exponential backoff retry logic (max 5 retries)
- Marks calls as delivered when synced

**Queue Structure:**
```dart
class QueuedCall {
  final String id;
  final String remoteUserId;
  final String channelName;
  final String callId;
  final int retryCount;
  final DateTime queuedAt;
  bool isDelivered;
}
```

**Issues:**
- ❌ **No auto-trigger on reconnection** - queue is never processed
- ❌ **Requires manual call to `processQueue()`** - not called anywhere
- ❌ **No integration with EnhancedSyncService** - siloed implementation
- ❌ **No conflict resolution** - what if user accepts incoming call while offline queue has call?
- ❌ **Database not created** - missing Hive initialization

---

### 5. **call_notification_service.dart** 🔴 Limited
**File:** `call_notification_service.dart (209 lines)`

**Status:** 🔴 Cannot handle multiple concurrent calls

**What it does:**
- Shows incoming call notification with vibration patterns
- Plays notification audio
- Shows accept/decline buttons
- Uses fullScreenIntent for visibility during lock

**Configuration:**
```dart
const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
  'calls',
  'Calls',
  importance: Importance.max,
  priority: Priority.high,
  fullScreenIntent: true,
  vibrationPattern: [0, 500, 100, 500],
);

// Shows notification with ID: 9999 (STATIC - SINGLE SLOT)
await flutterLocalNotificationsPlugin.show(
  9999,  // ❌ PROBLEM: Only one notification can exist
  'Incoming Call from: $callerName',
  null,
  notificationDetails: notificationDetails,
);
```

**Critical Issue:**
- ❌ **Static notification ID (9999)** means:
  - Only ONE call notification can display at a time
  - Second incoming call OVERWRITES first notification
  - No call stacking in notification panel
  - Users can't see missed calls while taking another call

---

### 6. **AgoraCallService** 🟡 Mobile/Android Limited
**File:** `agora_call_service.dart (1347 lines)`

**Status:** 🟡 Can initialize when app is active, NOT in background

**Initialization Flow:**
```dart
Future<void> initialize() {
  // ✅ Works in foreground (MainScreen._initializeWebRTC)
  // ❌ Cannot be called from Workmanager background task
  // ❌ Requires UI context on Android/iOS
  
  await _initializeAgoraEngine(); // Needs Android/iOS UI permissions
}
```

**Android Limitation:**
- Agora RTC engine on Android requires active application context
- **Cannot initialize from Workmanager background task**
- Would throw error or fail silently

**acceptCall() Requirements:**
```dart
Future<AgoraCallResult> acceptCall(AgoraIncomingCall incomingCall) async {
  if (!kIsWeb && _engine == null) {
    return AgoraCallResult(
      success: false,
      error: 'Call service not initialized',
    );
  }
  
  // Then joins Agora channel
  await joinChannel(incomingCall.channelName);
}
```

**Issues:**
- ❌ Requires engine already initialized (Workmanager can't initialize)
- ❌ Can't initialize in background on Android
- ❌ Web (`kIsWeb`) has some fallback but mobile is blocked

---

### 7. **MainScreen Integration** 🟡 Partial
**File:** `main_screen.dart (1265 lines)`

**Status:** 🟡 Handles foreground recovery, missing background-to-foreground flow

**What happens on app launch:**

```dart
void initState() {
  _checkUserRole();
  _initializeWebRTC();  // ✅ Initializes Agora engine
  _showWhatsNewIfNeeded();
  _setupConnectivityListener();
  _startGlobalActivityHeartbeat();
  
  RealtimeNotificationService().initialize();
  UserNotificationService().initialize();
  _checkAndShowPendingConfirmations();
}

Future<void> _initializeWebRTC() {
  // ✅ Initializes AgoraCallService
  // ✅ Calls _attachIncomingCallListener()
  // ✅ Calls _checkForActiveCall()
}

Future<void> _checkForActiveCall() {
  // WAIT until Agora engine is ready (up to 5 seconds)
  // GET pending call from:
  //   1. AgoraCallService.getAndClearPendingFcmCall()
  //   2. ModalRoute arguments (from notification tap)
  //   3. FlutterLocalNotificationsPlugin.getNotificationAppLaunchDetails()
  // DISPLAY call dialog if found
}
```

**Issues:**
- ❌ **No auto-launch of call screen on notification tap**
  - Notification tap just brings app to foreground
  - Then _checkForActiveCall() checks for pending call
  - But UI doesn't automatically open call screen
  
- ❌ **Missing transition from background notification to foreground UI**
  - When user taps notification, app launches but stays on main screen
  - User must manually navigate to accept call

---

### 8. **Main.dart Firebase Background Handler** 🔴 Not Set Up for Calls
**File:** `main.dart (975 lines)`

**Status:** 🔴 FCM handler exists but doesn't route to calls

**Firebase Background Handler:**
```dart
Future<void> _firebaseMessagingBackgroundHandler(
  RemoteMessage message,
) async {
  debugPrint('Handling background message: ${message.messageId}');
  
  // ❌ Generic handler - doesn't check if message is call-related
  // ❌ Doesn't initialize Agora
  // ❌ Doesn't route to call accept
  
  // Setup Firebase if needed
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
}
```

**Issues:**
- ❌ Doesn't parse call data from FCM payload
- ❌ Doesn't differentiate between call and regular notifications
- ❌ Doesn't initialize Agora engine in background (illegal on Android)

---

## Critical Gaps Analysis

### Gap #1: ❌ No Call Screen Auto-Launch on Notification Tap
**Impact:** User must manually open app, then navigate to accept call  
**Root Cause:** Notification handler doesn't route to call screen  
**Current Behavior:**
1. User receives notification
2. User taps notification
3. App opens to MainScreen
4. MainScreen tries to find pending call
5. If found, shows dialog but NOT call screen
6. User must accept from dialog

**Should Be:**
1. User receives notification
2. User taps notification
3. App should open directly to caller's call screen (AgoraCallScreen)
4. Users see accept/decline buttons and caller info

---

### Gap #2: ❌ Cannot Initialize Agora in Workmanager Background
**Impact:** Background calls can't actually join Agora channels  
**Root Cause:** Agora RTC engine requires Android/iOS UI context  
**Technical Reason:**
- Android: Requires active application context to access audio/video resources
- iOS: Requires foreground entitlements for media capture
- Workmanager: Runs in background process without UI context

**Current Code:**
```dart
// In _callbackDispatcher (Workmanager background)
Future<bool> _checkForIncomingCalls() async {
  // ❌ Cannot call:
  // await AgoraCallService().initialize(); // Would fail
  
  // ❌ Can only do:
  final pendingCalls = await supabase.from('missed_calls').select();
  return true;
}
```

---

### Gap #3: ❌ No State Persistence Across App Restart
**Impact:** Call data lost if app is killed while processing call  
**Root Cause:** All call state held in memory only  
**Current Behavior:**
1. Notification arrives with call data
2. If app is killed before MainScreen initializes
3. When user opens app, there's no record of the call
4. User doesn't know they were called

**Should Have:**
- Persistent call queue in database
- Recovery mechanism on app launch
- Links call notification ID to database record

---

### Gap #4: ❌ Single Notification ID = No Call Stacking
**Impact:** Can't show multiple concurrent calls  
**Code:**
```dart
const int NOTIFICATION_ID = 9999;  // ❌ STATIC

await _show(
  9999,  // Same ID for all calls
  'Call from: $name',
);
```

**Result:**
- Call A arrives → Notification ID 9999 shows
- Call B arrives → Notification ID 9999 REPLACES it
- User sees only the latest call
- Earlier calls are hidden

---

### Gap #5: ❌ No Offline Queue Auto-Sync
**Impact:** Queued calls during offline periods never get processed  
**Current Code:**
```dart
Future<List<QueuedCall>> getQueue() {
  // EXISTS: Returns queued calls from database
}

Future<void> processQueue() {
  // EXISTS: Processes queue, but...
  // ❌ NEVER CALLED from anywhere
}

Future<void> recordOfflineCall(...) {
  // EXISTS: Stores call in queue when offline
}
```

**Flow:**
1. User is offline
2. Someone calls → stored in offline_call_queue table
3. User comes online
4. Offline call queue is NEVER checked
5. Stored calls expire in database

---

### Gap #6: ❌ No BackgroundCallManager Orchestration
**Impact:** Multiple services working independently, no coordination  
**Current Implementation:**
- BackgroundCallHandler ← Receives signals
- BackgroundCallHandlerEnhanced ← Polls database
- OfflineCallQueueService ← Manages offline queue
- CallNotificationService ← Shows notifications
- AgoraCallService ← Joins calls
- FirebaseMessagingService ← Receives FCM
- MainScreen ← Handles foreground

**Problem:** No central coordinator. Each service does its own thing without communicating:
- Notification received but offline queue not checked
- Offline queue processed but current call not considered
- Multiple services may try to accept same call

---

### Gap #7: ❌ FCM Payload Structure Unclear
**Impact:** Don't know what call data arrives in FCM  
**Current Code:**
```dart
// Vague reference in MainScreen
// recover callData from last incoming invite captured by BackgroundHandler.
```

**Unknown:**
- What fields are in FCM payload?
- How is call data encoded?
- What's the exact structure of call invite?
- Where's the Edge Function that sends it?

---

## Implementation Blockers

### Android Blocker: Cannot Initialize Agora in Background
```
Workmanager Background Task
        ↓
Cannot access UI/Media capture resources
        ↓
AgoraCallService.initialize() would fail OR be blocked by OS
        ↓
❌ Cannot join Agora channel from background
```

**Possible Workaround (Still Limited):**
- Create lightweight "call starter" service that initializes only signaling
- When notification tapped, THEN initialize full Agora engine in foreground
- But this means user still must tap notification and see app launch

### iOS Blocker: Background Task Limitations
- iOS terminates background tasks after ~30 seconds
- Cannot maintain active Agora connection in background
- Would need CallKit integration for true background calling

---

## Test Scenarios

### Scenario 1: App in Foreground ✅ WORKS
1. User A calls User B
2. Agora call request arrives via Supabase RealtimeChannel
3. User B sees incoming call dialog
4. User B accepts → joined to Agora channel
5. **Result: Call works**

### Scenario 2: App Backgrounded ⚠️ PARTIALLY WORKS
1. User A calls User B (app is backgrounded)
2. FCM sends notification to User B device
3. Device shows notification with vibration/audio
4. **Notification tapped? ✅ Can tap**
5. **App opens to MainScreen?** ✅ Can do this  
6. **Automatically shows call screen?** ❌ **NO**
7. **Shows dialog that user can accept from?** ❌ **Maybe** (depends on MainScreen recovery)
8. **Actually joins Agora channel?** ✅ **Yes** (now that app is foreground)
9. **Result: Call can be accepted but requires manual action**

### Scenario 3: App Killed ❌ DOESN'T WORK FULLY
1. User A calls User B (app is completely killed)
2. FCM sends notification to User B device ✅
3. Device shows notification ✅
4. **User taps notification?** ✅ Can receive tap
5. **App launches?** ✅ Main.dart runs
6. **Call data persisted?** ❌ **NO** - only in RAM, lost on kill
7. **MainScreen knows about call?** ❌ Probably not
8. **Shows call screen?** ❌ **NO** - User sees MainScreen instead
9. **User can call back?** ✅ **Yes** - but has to initiate call themselves

### Scenario 4: Multiple Concurrent Calls ❌ DOESN'T WORK
1. User A calls User B
2. User B gets notification (ID: 9999) ✅
3. While dialog is open, User C calls User B
4. User C sends notification (ID: 9999)
5. **Notification 9999 REPLACED** ❌ User A's call notification GONE
6. **User sees only User C's call** ❌
7. **User can't see User A anymore** ❌

---

## Recommended Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│           IMPROVED BACKGROUND CALL SYSTEM                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. FCM WITH CALL-AWARE ROUTING                             │
│     FirebaseMessagingService._handleMessageTap()            │
│     ├─ Check if notification is call type                   │
│     ├─ Parse call data from payload                         │
│     ├─ Route to AgoraCallScreen (direct navigation)         │
│     └─ Pass call data via args or SharedPreferences         │
│                                                               │
│  2. PERSISTED CALL STATE                                    │
│     CallStateDb (Hive box)                                  │
│     ├─ Store incoming call when received                    │
│     ├─ Persist across app kill                              │
│     ├─ Use unique call ID (not static 9999)                │
│     └─ Clean up after call accepted/rejected                │
│                                                               │
│  3. BACKGROUND CALL MANAGER (New Service)                  │
│     ├─ Coordinates all background call activities           │
│     ├─ Routes FCM to call screen                            │
│     ├─ Manages offline call queue sync                      │
│     ├─ Prevents call conflicts                              │
│     └─ Handles state transitions                            │
│                                                               │
│  4. DYNAMIC NOTIFICATION IDs                                │
│     CallNotificationService.show()                          │
│     ├─ Generate unique ID per call (hash of callId)         │
│     ├─ Allow 5+ concurrent call notifications               │
│     ├─ Stack notifications in panel                         │
│     └─ Handle per-call accept/reject                        │
│                                                               │
│  5. AUTO-SYNC ON RECONNECTION                               │
│     EnhancedSyncService + OfflineCallQueueService           │
│     ├─ Listen for connectivity changes                      │
│     ├─ Auto-process offline queue on online                 │
│     ├─ Handle call state reconciliation                     │
│     └─ Retry with exponential backoff                       │
│                                                               │
│  6. REMOVE INEFFECTIVE WORKMANAGER POLLING                  │
│     ❌ Delete the 15s polling background task                │
│     ✅ Replace with connectivity-triggered sync             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Priority Issues

### 🔴 CRITICAL (Blocks Basic Functionality)
1. **No notification tap routing to call screen**
   - Fix: Modify FirebaseMessagingService._handleMessageTap()
   - Impact: Users confused when app opens to wrong screen
   
2. **Single notification ID blocks multiple calls**
   - Fix: Generate unique IDs per call
   - Impact: Users miss calls when multiple arrive

3. **No persisted call state across app kill**
   - Fix: Store call in database on receipt
   - Impact: Users don't know they were called if app killed

### 🟠 HIGH (Significant Gaps)
4. **No offline queue auto-sync**
   - Fix: Listen to connectivity changes, trigger sync
   - Impact: Calls made during offline never show up

5. **Workmanager inefficient 15s polling**
   - Fix: Remove polling, use connectivity listener
   - Impact: Wastes battery power

6. **No BackgroundCallManager coordination**
   - Fix: Create service to orchestrate all background calls
   - Impact: Services can conflict or miss edge cases

### 🟡 MEDIUM (Enhancement Gaps)
7. **Unclear FCM payload structure**
   - Fix: Document or trace Edge Function
   - Impact: Hard to debug call data issues

8. **No battery warning for background operations**
   - Fix: Add metrics to performance monitor
   - Impact: Users don't know what drains battery

9. **No call diagnostics in background**
   - Fix: Add to CallDiagnosticsStore
   - Impact: Can't troubleshoot background failures

---

## Next Steps (Recommended Order)

### Phase 1: Enable Notification Tap → Call Screen (2-3 hours)
1. ✏️ Modify `FirebaseMessagingService._handleMessageTap()`
2. ✏️ Add call type detection to FCM handler
3. ✏️ Route to `AgoraCallScreen` with call data
4. ✏️ Store call data in `SharedPreferences` for persistence

### Phase 2: Fix Notification ID Problem (1-2 hours)
1. ✏️ Modify `CallNotificationService.show()`
2. ✏️ Generate unique ID: `callId.hashCode & 0x7fffffff` (range 0-2B)
3. ✏️ Allow 10+ concurrent call notifications
4. ✏️ Add per-call accept/decline actions

### Phase 3: Persist Call State (2-3 hours)
1. ✏️ Create `CallStateDb` Hive box with schema
2. ✏️ Store incoming call on receipt
3. ✏️ Retrieve on app launch in `MainScreen`
4. ✏️ Clean up after call completes

### Phase 4: Create BackgroundCallManager (3-4 hours)
1. ✏️ New service to orchestrate background calls
2. ✏️ Coordinate between FCM, notification, and state services
3. ✏️ Handle state transitions and conflicts
4. ✏️ Add comprehensive logging

### Phase 5: Fix Offline Queue Auto-Sync (2-3 hours)
1. ✏️ Listen to connectivity changes
2. ✏️ Auto-trigger `OfflineCallQueueService.processQueue()`
3. ✏️ Integrate with `EnhancedSyncService`
4. ✏️ Remove Workmanager polling task

---

## Summary Table

| Component | Status | Can Background Call? | Next Action |
|-----------|--------|----------------------|-------------|
| Firebase Messaging | ✅ | Receive only | Route to call screen |
| BackgroundCallHandler | 🟡 | No active join | Remove/simplify |
| BackgroundCallHandlerEnhanced | 🔴 | Database only | Replace with connectivity sync |
| OfflineCallQueueService | 🟡 | Queues only | Add auto-sync trigger |
| CallNotificationService | 🔴 | Limited (1 call) | Use dynamic IDs |
| AgoraCallService | 🟡 | Foreground only | Already optimal |
| MainScreen | 🟡 | Partial recovery | Add auto-dispatch to call screen |
| Firebase Handler | 🔴 | No routing | Add call detection and routing |

---

## Conclusion

**Can the app make calls in the background?**

**Short Answer:** ❌ **NO - Not fully**

**Current Reality:**
- ✅ Receives incoming call notifications while backgrounded
- ✅ Shows vibration and audio alerts
- ❌ Cannot automatically join Agora calls without user intervention
- ❌ Requires app to come to foreground first
- ❌ Even then, doesn't auto-route to call screen
- ❌ Multiple calls overwrite each other
- ❌ Doesn't persist call state if app is killed

**To Enable True Background Calling:**
All 5 phases above need implementation. Estimated total effort: **12-16 hours**.

**Quick Win (1-2 hours):** Just routing FCM notification tap to call screen would make UX much better.

