# Logout Issue Diagnosis and Solution

## Problem Analysis
The user reported being "logged out" immediately after clicking the "Start Visit" button. The logs showed a valid session (`Session check - valid: true`), which contradicted a typical auth-based logout.

Upon inspecting `lib/widgets/start_visit_dialog.dart` and `lib/screens/field_operations_enhanced_screen.dart`, I identified a critical logic error causing a "Double Navigation Pop".

## The Root Cause: Double Pop
The `StartVisitDialog` was configured to pop the navigation stack TWICE when the "Start Visit" button was clicked:

1. **First Pop**: Inside `StartVisitDialog.dart`, the `onPressed` handler called `Navigator.of(context).pop(true)`. This correctly closed the dialog.
2. **Second Pop**: The same handler then called `onConfirm()`. In `FieldOperationsEnhancedScreen.dart`, `onConfirm` was defined as `() => Navigator.of(context).pop(true)`.

### Sequence of Events:
1. User clicks "Start Visit" in the dialog.
2. `Navigator.pop` (1st) runs: The Dialog closes. The user is visually back on the `FieldOperationsEnhancedScreen`.
3. `onConfirm` runs: `Navigator.pop` (2nd) runs IMMEDIATELY against the `FieldOperationsEnhancedScreen` context.
4. The `FieldOperationsEnhancedScreen` (or `MainScreen`) is popped from the navigation stack.
5. If `MainScreen` is the root of the app, popping it may exit the app (Android) or return to the previous screen (Login), causing the user to perceive it as a logout.

## The Solution
I have applied the following fixes:

1. **Refactored `StartVisitDialog`**:
   - Removed the `onConfirm` callback parameter.
   - The dialog now simply returns `true` via `Navigator.pop(true)` when the button is clicked.
   - The double-pop is eliminated.

2. **Refactored `VisitReportDialog`**:
   - Identified the same pattern in `VisitReportDialog` (used for "Complete Visit").
   - Removed the `onSubmit` callback which was performing a redundant pop.
   - Now the dialog returns the report data via `Navigator.pop(reportData)`.

3. **Updated `FieldOperationsEnhancedScreen`**:
   - Removed the unnecessary callback arguments when instantiating these dialogs.

## Verification
The session validation logic added in previous attempts (checking session validity, refreshing tokens) remains in place and is correct. The "logout" was a false positive causing a navigation exit, not an authentication failure.

The app should now correctly close *only* the dialog and proceed with the `_startVisit` logic (location capture, DB update) without closing the main screen.
