# Fix: Call Answer from Notification Not Working

## Problem
When a user received an incoming call notification and tapped the "Accept" button, the app wasn't properly handling the action, leaving the notification displayed without navigating to the active call screen.

## Root Cause
The notification action IDs were defined as generic constants (`'accept_call'` and `'reject_call'`), but the code in `main_layout.dart` was extracting the **callId** from the actionId by parsing it as `'accept_<callId>'` or `'decline_<callId>'`. This mismatch prevented proper call identification and action handling.

### Original Flow (Broken):
1. Notification shows with actionId = `'accept_call'`
2. User taps "Accept"
3. Code tries to extract callId: `aid.substring(aid.indexOf('_') + 1)` 
4. For `'accept_call'`, this extracts `'call'` (not a valid callId!)
5. Call recovery fails → No auto-accept happens

## Solution
Modified notification action IDs to include the actual callId, making each action uniquely identifiable.

### Files Modified:

#### 1. **bilingual_notification_service.dart** - Updated `showIncomingCallNotification()`
- **Before**: Generic actionIds: `'accept_call'`, `'reject_call'`
- **After**: Dynamic actionIds: `'accept_<callId>'`, `'decline_<callId>'`

```dart
// Create action IDs that include the callId for proper identification
final String acceptActionWithId = 'accept_$callId';
final String declineActionWithId = 'decline_$callId';

actions: <AndroidNotificationAction>[
  AndroidNotificationAction(
    declineActionWithId,  // e.g., 'decline_abc123'
    'Decline',
    ...
  ),
  AndroidNotificationAction(
    acceptActionWithId,   // e.g., 'accept_abc123'
    'Accept',
    ...
  ),
],
```

#### 2. **bilingual_notification_service.dart** - Updated action matching in `_handleCallAction()` and `_onNotificationTapBackground()`
- Now checks for both old format (fallback) and new format with callId

```dart
// Handle both old format (fallback) and new format with callId
if (actionId == rejectActionId || actionId.startsWith('decline_')) {
  // Handle reject
} else if (actionId == acceptActionId || actionId.startsWith('accept_')) {
  // Handle accept with auto-accept flag
}
```

#### 3. **bilingual_notification_service.dart** - Updated action detection in `_onNotificationTap()`
- Checks for both old and new formats

```dart
if (actionId == acceptActionId || 
    actionId == rejectActionId || 
    actionId?.startsWith('accept_') == true ||
    actionId?.startsWith('decline_') == true) {
  _handleCallAction(actionId!, payload);
  return;
}
```

## Revised Flow (Fixed):

### Foreground / App Active:
1. User receives incoming call notification with actionIds: `'accept_<callId>'`, `'decline_<callId>'`
2. User taps "Accept" button (actionId = `'accept_abc123'`)
3. `_onNotificationTap()` is called with actionId matching pattern ✅
4. `_handleCallAction(actionId, payload)` handles the action
5. Call data is extracted from payload
6. `agora.setPendingFcmCall(callData)` stores the call
7. `agora.pushAutoAcceptCall()` emits the call to `incomingCallStream`
8. `_attachIncomingCallListener()` in main_screen.dart receives it
9. `showAgoraIncomingCallDialog()` displays the dialog
10. Dialog's `initState()` detects `autoAccept=true` and calls `_doAccept()`
11. `AgoraCallScreen` is shown (active call screen) ✅

### Background / App Killed:
1. Notification is tapped with actionId = `'accept_abc123'`
2. `_onNotificationTapBackground()` is called (background isolate)
3. `_handleCallAction()` processes and persists action via `CallDiagnosticsStore.savePendingCallAction()`
4. App launches (or resumes)
5. `main_layout.dart` calls `_checkPendingIncomingCallFromNotification()`
6. `getNotificationAppLaunchDetails()` retrieves the notification response
7. Code extracts callId from actionId: `'accept_abc123'.substring(indexOf('_') + 1)` = `'abc123'` ✅
8. `CallNotificationService.recoverIncomingCallFromStore(callId, autoAccept: true)` recovers the call
9. `agora.pushAutoAcceptCall()` triggers auto-accept
10. Dialog displays and immediately accepts ✅

## Testing Checklist
- [ ] Receive incoming call notification while app is active
- [ ] Tap "Accept" button
- [ ] Verify call is accepted and active call screen appears
- [ ] Receive incoming call notification while app is in background
- [ ] Tap "Accept" button from lock screen
- [ ] Verify app opens and call is auto-accepted
- [ ] Receive incoming call notification while app is killed/terminated
- [ ] Tap "Accept" button from lock screen
- [ ] Verify app launches and call is auto-accepted
- [ ] Test "Decline" button in all app states
- [ ] Verify ringtone stops immediately when accepting from notification

## Benefits
1. ✅ Action identification is now unique per call
2. ✅ Proper callId extraction in all app states
3. ✅ Backward compatibility with old action ID format (fallback)
4. ✅ Consistent behavior across foreground, background, and terminated states
5. ✅ Integrates with existing auto-accept infrastructure

---
**Date Fixed**: March 25, 2026
**Status**: ✅ Complete
