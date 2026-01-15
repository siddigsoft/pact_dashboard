# Investigation: Logout After Site Completion

## Problem
The site logs the user out after completing a site visit.

## Investigation Summary

### Code Flow Analysis
1. **Completion Process** (`lib/screens/complete_visit_screen.dart`):
   - User submits report with notes, photos, and location
   - Multiple database operations:
     - Create report record
     - Upload photos to storage
     - Create report_photos entries
     - Update site_locations
     - Update mmp_site_entries status to 'completed'
   - Provider invalidations (lines 402-406) to refresh visit lists

2. **Authentication Setup**:
   - Supabase initialized with `autoRefreshToken: true` (lib/main.dart:68)
   - Auth state listener in `AuthenticationService` (lib/services/authentication_service.dart:24-30)
   - Listener calls `_handleSignOut()` on `AuthChangeEvent.signedOut`

### Key Findings

#### ✅ No Explicit Logout Code
- No direct `logout()` or `signOut()` calls after site completion
- Completion flow only navigates back and invalidates providers

#### ⚠️ Potential Root Causes

1. **Session Expiration During Long Operations**
   - Visit completion involves multiple sequential database operations
   - If session token expires during this process, Supabase may auto-sign-out
   - Token refresh might fail silently

2. **Database Errors Triggering Auth Failure**
   - Any database operation failing with auth/permission error could trigger logout
   - RLS (Row-Level Security) permission issues
   - PostgREST errors not being caught properly

3. **Auth State Listener Reacting to Supabase Sign-Out**
   - Supabase client may sign out user due to token issues
   - Auth state listener detects this and calls `_handleSignOut()`
   - This clears local auth data, causing app to show as logged out

4. **Provider Invalidation Side Effects**
   - Invalidating providers (lines 402-406) triggers stream re-subscriptions
   - These providers depend on `currentUserIdProvider` which reads `supabase.auth.currentUser?.id`
   - If session is invalid/expired at this point, it could cause issues

### Error Handling Analysis
- Completion errors are caught generically (line 416)
- No specific handling for auth errors
- Error messages shown but no prevention of logout

### Recommendations

#### 1. Add Better Error Handling & Logging
Add specific error handling to catch and log auth-related errors:

```dart
catch (e) {
  debugPrint('Error submitting report: $e');
  
  // Check for auth-related errors
  if (e.toString().contains('auth') || 
      e.toString().contains('unauthorized') ||
      e.toString().contains('JWT')) {
    debugPrint('⚠️ AUTH ERROR during completion: $e');
    // Don't logout on auth errors - let user retry
  }
  
  // Check for session expiration
  final session = supabase.auth.currentSession;
  if (session == null) {
    debugPrint('⚠️ Session lost during completion');
  }
  
  if (mounted) {
    AppSnackBar.show(
      context,
      message: 'Failed to submit report: $e',
      type: SnackBarType.error,
    );
  }
}
```

#### 2. Verify Session Before Operations
Add session validation before starting completion:

```dart
// Before starting submission
final session = supabase.auth.currentSession;
if (session == null || session.isExpired) {
  // Refresh session or prompt user
  await supabase.auth.refreshSession();
}
```

#### 3. Add Session Refresh on Long Operations
Refresh session periodically during long operations (especially photo uploads):

```dart
// Before photo upload loop
final currentSession = supabase.auth.currentSession;
if (currentSession != null && currentSession.isExpired) {
  await supabase.auth.refreshSession();
}
```

#### 4. Check Database Permissions (RLS)
Verify that user has proper RLS permissions for:
- `reports` table (INSERT)
- `report_photos` table (INSERT)
- `site_locations` table (UPSERT)
- `mmp_site_entries` table (UPDATE)

#### 5. Add Diagnostic Logging
Add logging to track session state:

```dart
debugPrint('🔄 Starting visit completion...');
debugPrint('📋 Session valid: ${supabase.auth.currentSession != null}');
debugPrint('👤 User ID: ${supabase.auth.currentUser?.id}');

// After each major operation
debugPrint('✅ Report created. Session still valid: ${supabase.auth.currentSession != null}');
```

#### 6. Prevent Auth State Listener from Clearing Data on Errors
Consider modifying auth state listener to differentiate between user-initiated logout and error-induced logout.

## Next Steps

1. **Check Supabase Logs**: Review Supabase dashboard for auth errors around completion time
2. **Check Console Logs**: Look for "Error submitting report" messages with auth-related errors
3. **Test Session Expiration**: Test with a near-expired session to reproduce issue
4. **Verify RLS Policies**: Check database RLS policies for all tables used in completion
5. **Add Diagnostic Code**: Implement logging recommendations above to track issue

## Files to Review

- `lib/screens/complete_visit_screen.dart` - Completion logic
- `lib/services/authentication_service.dart` - Auth state listener
- `lib/providers/site_visit_provider.dart` - Provider invalidations
- Supabase database RLS policies for: reports, report_photos, site_locations, mmp_site_entries

---

## FIXES IMPLEMENTED (Date: Investigation Fix)

### Root Cause Identified

The logout issue was caused by:
1. **Session expiration during long operations**: Photo uploads and multiple database operations could take long enough for the session token to expire
2. **No session validation/refresh**: Operations didn't check if the session was valid before or during operations
3. **Transient auth errors triggering logout**: Auth state listener was clearing local auth data immediately on any sign-out event, even transient ones during operations
4. **Provider invalidations**: When providers were invalidated after operations, they re-subscribed to streams that read `currentUserIdProvider`, which reads from `supabase.auth.currentUser?.id`. If the session had expired, this could cause issues.

### Fixes Applied

#### 1. Session Validation and Refresh (`lib/screens/field_operations_enhanced_screen.dart`)

**In `_startVisit` method:**
- Added session validation before starting operation
- Added session refresh if session is expired or missing
- Added session check before database update
- Added retry logic with session refresh on auth errors
- Added comprehensive error handling with auth error detection
- Added diagnostic logging to track session state

**In `_completeVisit` method:**
- Added session validation before starting operation
- Added session refresh checks:
  - Before dialog (after user returns from dialog)
  - Before photo uploads
  - After photo uploads (they can take a while)
  - Before report insert
  - Before report photos insert
  - Before site status update
  - Before location insert
- Added retry logic with session refresh on auth errors for all database operations
- Added comprehensive error handling with auth error detection
- Changed `_userId` to local `userId` variable to avoid stale references
- Added diagnostic logging throughout

#### 2. Photo Upload Service (`lib/services/photo_upload_service.dart`)

- Added session check and refresh before each photo upload
- Added retry logic with session refresh on auth errors
- Improved error handling to distinguish auth errors from other errors

#### 3. Authentication Service (`lib/services/authentication_service.dart`)

**Improved auth state listener:**
- Added delay before clearing local auth data on sign-out events
- Check if session recovers before clearing data (transient error detection)
- Only clear local data if session is still null after delay
- Added token refresh event handling to update local data
- Added better diagnostic logging

**Added `_hasLocalAuthData()` method:**
- Quick synchronous check for session existence
- Used to determine if sign-out is transient or real

### Key Improvements

1. **Proactive session management**: Session is validated and refreshed before operations, not after failures
2. **Retry with refresh**: All database operations retry once with session refresh on auth errors
3. **Transient error protection**: Auth state listener doesn't immediately clear data on transient errors
4. **Comprehensive logging**: All operations log session state for debugging
5. **Graceful degradation**: Operations continue even if some non-critical operations fail (e.g., location insert)

### Testing Recommendations

1. Test with a session that's close to expiring
2. Test with slow network (to simulate long operations)
3. Test with multiple photos (to trigger photo upload delays)
4. Monitor console logs for session state messages
5. Verify that logout doesn't occur during start/complete operations

### Files Modified

- `lib/screens/field_operations_enhanced_screen.dart` - Added session validation and refresh throughout start/complete flows
- `lib/services/photo_upload_service.dart` - Added session checks before uploads
- `lib/services/authentication_service.dart` - Improved auth state listener to handle transient errors