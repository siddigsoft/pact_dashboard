# Classification Features - Comprehensive Testing Guide

## ✅ Fixed Issues
1. **Critical Bug Fixed**: Classifications page was crashing due to incorrect `canManage` function call
   - Changed from `canManage('finances')` to `canManageFinances()`
   - App now loads without errors

2. **UI Refresh Fixed**: Classification assignments now refresh immediately
   - Added `refreshUserClassifications()` call after assignment
   - Users see updated classification without page reload

3. **TypeScript Warnings Resolved**: All 25 warnings fixed with backward-compatible role handling

---

## 🧪 Testing Checklist

### Prerequisites
- [ ] Log in with an admin or ICT account (these roles can manage classifications)
- [ ] Ensure you have at least one test user with a role (Supervisor, Coordinator, or Data Collector)

### Test 1: View Classifications Page
**Path**: Navigate to "Classifications" from the sidebar

**Expected Results**:
- [ ] Page loads without errors
- [ ] "Fee Structures" tab displays 9 fee structures (3 levels × 3 roles)
- [ ] Each fee structure shows:
  - Classification level (A/B/C badge)
  - Role name
  - Transportation fee, Permit fee, Internet fee
  - Total monthly retainer
  - "Active" status badge
- [ ] "User Classifications" tab shows users with assigned classifications

**What to Check**:
- Color-coded badges: Level A (green), Level B (blue), Level C (orange)
- Currency formatting: "SDG 1,500.00" format
- No console errors in browser DevTools

---

### Test 2: Assign Classification to User
**Path**: Users → Click on a user → "Classification" tab → "Assign Classification" button

**Steps**:
1. [ ] Go to Users page
2. [ ] Click on any user with role Supervisor/Coordinator/DataCollector
3. [ ] Click the "Classification" tab
4. [ ] Click "Assign Classification" button
5. [ ] Select a classification level (A, B, or C)
6. [ ] Enter effective date (today or future date)
7. [ ] Optionally add notes
8. [ ] Click "Assign Classification"

**Expected Results**:
- [ ] Dialog closes immediately
- [ ] Success toast appears: "Classification Updated"
- [ ] Classification tab updates **without page reload** showing:
  - New classification badge
  - Level (A/B/C)
  - Monthly retainer amount
  - Effective date
  - Notes (if entered)
- [ ] **CRITICAL**: UI should refresh instantly - verify you see the new classification immediately

**What to Check**:
- No need to refresh the page to see changes
- Classification badge appears in correct color
- Date displays in readable format (e.g., "Jan 15, 2025")
- If user already had a classification, old one moves to "Classification History" section

---

### Test 3: Classification History
**Path**: User Detail → Classification tab → "Classification History" section

**Steps**:
1. [ ] Assign a classification to a user (follow Test 2)
2. [ ] Wait a moment, then assign a different classification level
3. [ ] Scroll down to "Classification History" section

**Expected Results**:
- [ ] History shows both assignments in reverse chronological order (newest first)
- [ ] Each entry shows:
  - Classification level badge
  - Date range (e.g., "Jan 1, 2025 - Jan 15, 2025")
  - Monthly retainer amount
  - Notes (if any)
- [ ] Most recent assignment shows "Active" badge
- [ ] Previous assignment shows end date

**What to Check**:
- Dates don't overlap (end date of old = start date of new - 1 day)
- History is sorted correctly
- All fields display accurately

---

### Test 4: User Classifications Overview
**Path**: Classifications page → "User Classifications" tab

**Expected Results**:
- [ ] Table shows all users with current classifications
- [ ] Columns display:
  - Full name
  - Email
  - Role
  - Classification level (badge)
  - Monthly retainer amount
  - Effective date
- [ ] Users without classifications are not shown
- [ ] Table is responsive and scrollable

**What to Check**:
- Data matches what you assigned in Test 2
- Amounts are formatted correctly
- Badges use correct colors
- No duplicate entries

---

### Test 5: Permission Testing
**Objective**: Verify only authorized users can manage classifications

**Test with Admin/ICT account**:
- [ ] Can view Classifications page
- [ ] Can see "Assign Classification" button
- [ ] Can create/update classifications

**Test with non-admin account** (Supervisor/Coordinator/DataCollector):
- [ ] Classifications page shows "Access Denied" or similar
- [ ] User detail page does NOT show "Assign Classification" button
- [ ] Cannot access classification management features

**What to Check**:
- Authorization is enforced at UI level
- No console errors when accessing restricted pages
- Clear messaging when access is denied

---

### Test 6: Data Validation
**Path**: User Detail → Classification tab → "Assign Classification" button

**Steps to Test**:
1. [ ] Click "Assign Classification"
2. [ ] Try to submit without selecting a level → Should show validation error
3. [ ] Try to submit without entering date → Should show validation error
4. [ ] Select a classification level
5. [ ] Enter a past date (e.g., 1 year ago)
6. [ ] Enter notes longer than 500 characters
7. [ ] Submit form

**Expected Results**:
- [ ] Form validates required fields
- [ ] Can enter past dates (for historical records)
- [ ] Can enter future dates (for planned changes)
- [ ] Notes field accepts long text
- [ ] Clear error messages for validation failures

---

### Test 7: Real-time Updates
**Objective**: Test that changes sync across browser tabs

**Steps**:
1. [ ] Open PACT app in two browser tabs
2. [ ] In Tab 1: Go to User Detail → Classification tab
3. [ ] In Tab 2: Navigate to same user's Classification tab
4. [ ] In Tab 1: Assign a new classification
5. [ ] Watch Tab 2

**Expected Results**:
- [ ] Tab 2 should receive a toast notification about the change
- [ ] Tab 2 should automatically update to show new classification
- [ ] No need to manually refresh Tab 2

**What to Check**:
- Supabase Realtime subscriptions are working
- Toast notifications appear
- Data syncs within 1-2 seconds

---

### Test 8: Database Integrity
**Path**: Supabase Dashboard → Database Tables

**Tables to Check**:
1. [ ] **user_classifications** table:
   - Each assignment creates a new row
   - `user_id` references profiles table
   - `classification_level` is 'A', 'B', or 'C'
   - `effective_date` is set correctly
   - `end_date` is null for current classification

2. [ ] **current_user_classifications** view:
   - Shows only active classifications (end_date IS NULL)
   - Joins with fee_structures to show monthly_retainer

3. [ ] **classification_fee_structures** table:
   - Contains 9 rows (3 levels × 3 roles)
   - All marked as `is_active = true`

**What to Check**:
- No duplicate active classifications for same user
- Dates are stored correctly in UTC
- Foreign keys are valid (no orphaned records)

---

## 🐛 Known Issues (Deferred)

### Role Casing Architectural Issue
**Status**: Documented, deferred for later refactor

**Issue**: Database uses camelCase codes (`'admin'`, `'ict'`, `'fom'`) while TypeScript uses PascalCase labels (`'Admin'`, `'ICT'`, `'Field Operation Manager (FOM)'`)

**Current Solution**: Backward-compatible comparisons check both formats

**Future Work**: Implement `src/utils/roleMapping.ts` utilities across entire codebase

**Impact**: None - all features work correctly with current implementation

---

## ✅ Success Criteria

All features are working if:
- [ ] No console errors when navigating classification features
- [ ] Classifications can be assigned and updated
- [ ] UI refreshes immediately after changes (no page reload needed)
- [ ] Classification history tracks all changes
- [ ] Permissions are enforced correctly
- [ ] Real-time updates work across browser tabs
- [ ] Database integrity is maintained

---

## 🚀 Next Steps

After testing is complete:
1. ✅ Mark classification features as production-ready
2. 🔄 Schedule comprehensive role mapping refactor (if needed)
3. 📊 Begin testing monthly retainer processing features
4. 💰 Test wallet integration with site visit payments

---

## 📞 Support

If you encounter any issues during testing:
1. Check browser console for error messages (F12 → Console tab)
2. Verify you're logged in with correct permissions
3. Ensure database tables are properly populated
4. Check Supabase logs for backend errors

**All classification features are ready for testing!**
