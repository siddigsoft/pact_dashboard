# Why Wallet Reconciliation Fails & Where Report is Submitted

## Where is the Report Submitted?

### The Flow

1. **User clicks "Complete Visit"** → `handleCompleteVisit()` is called
   - **Location**: `src/pages/MMP.tsx` line 955
   - Opens the `VisitReportDialog` immediately (line 958)
   - Sets `visit_completed_at` in database (line 1018)
   - Tries to create wallet transaction (but errors are caught silently, line 1154)

2. **User fills out Visit Report Dialog**
   - **Component**: `src/components/site-visit/VisitReportDialog.tsx`
   - User enters:
     - Activities performed
     - Notes
     - Photos
     - Visit duration
     - GPS coordinates
   - User clicks "Submit Report"

3. **Report Submission Handler**
   - **Function**: `handleSubmitVisitReport()` 
   - **Location**: `src/pages/MMP.tsx` line 1216
   - **Called by**: `VisitReportDialog` component via `onSubmit` prop (line 4744)

4. **What Happens in `handleSubmitVisitReport`**:
   ```
   a. Upload photos to Supabase storage (lines 1234-1292)
   b. Save report to 'reports' table (lines 1306-1325)
   c. Link photos to report (lines 1328-1346)
   d. Generate PDF report (line 1350)
   e. Save GPS to Sites Registry (lines 1412-1462)
   f. ✅ Update site status to "Completed" (line 1469) ← HAPPENS FIRST
   g. ❌ Reconcile wallet fee (line 1495) ← HAPPENS AFTER
   ```

### Key Code Location

**File**: `src/pages/MMP.tsx`

**Report Submission Function**: `handleSubmitVisitReport()` at line 1216

**Status Update**: Line 1469 (happens BEFORE wallet reconciliation)

**Wallet Reconciliation**: Line 1495 (happens AFTER status update, errors caught silently)

---

## Why is Wallet Reconciliation Failing?

Looking at the code, `reconcileSiteVisitFee()` can fail for several reasons:

### Failure Reason 1: Status Check Fails (MOST LIKELY CAUSE)

**Location**: `src/context/wallet/WalletContext.tsx` line 1102

```typescript
if ((entry.status || '').toLowerCase() !== 'completed') {
  return { success: false, message: `Site is not completed. Current status: ${entry.status}` };
}
```

**However**: This shouldn't be the issue in the current flow because:
- Status IS set to "Completed" BEFORE reconciliation is called
- But there could be a race condition or timing issue

**Wait - Actually, I see the real problem now!**

The issue is that `reconcileSiteVisitFee` requires status to be "Completed", but it's called AFTER status is set. However, if there's ANY error or race condition, the status could already be set but reconciliation fails.

### Failure Reason 2: No User Assigned

**Location**: `src/context/wallet/WalletContext.tsx` line 1109

```typescript
const userIdToPay = entry.accepted_by || entry.claimed_by || entry.visit_completed_by;

if (!userIdToPay) {
  return { success: false, message: 'Site has no user assigned (checked accepted_by, claimed_by, visit_completed_by)' };
}
```

**When this happens**:
- Site entry has no `accepted_by`, `claimed_by`, or `visit_completed_by` set
- Could happen if site was assigned incorrectly or data is missing

### Failure Reason 3: Transaction Already Exists

**Location**: `src/context/wallet/WalletContext.tsx` line 1121

```typescript
if (existingTx) {
  return { success: false, message: `Fee already recorded: ${existingTx.amount} SDG (Transaction: ${existingTx.id})` };
}
```

**When this happens**:
- Wallet transaction was already created (maybe in `handleCompleteVisit`)
- `reconcileSiteVisitFee` detects it and skips
- But this should return success, not failure... wait, it returns `success: false` even though transaction exists!

**This is actually correct behavior** - if transaction exists, reconciliation is not needed.

### Failure Reason 4: No Fee Assigned

**Location**: `src/context/wallet/WalletContext.tsx` line 1128

```typescript
const cost = Number(entry.cost) || (Number(entry.enumerator_fee) + Number(entry.transport_fee)) || 0;

if (cost <= 0) {
  return { success: false, message: 'Site has no fee assigned (cost is 0)' };
}
```

**When this happens**:
- Site entry has no `cost`, `enumerator_fee`, or `transport_fee`
- All are 0 or null
- Cannot create transaction with 0 amount

### Failure Reason 5: Errors from `addSiteVisitFeeToWallet`

When `reconcileSiteVisitFee` calls `addSiteVisitFeeToWallet` (line 1134), that function has many validations that could fail:

#### 5a. Fee Check Fails
**Location**: `src/context/wallet/WalletContext.tsx` line 824

```typescript
if (feeCheckError) {
  throw new Error(`Fee check failed: ${feeCheckError.message}`);
}
```

**When this happens**:
- Database error checking for existing transactions
- Network issue
- Permission issue

#### 5b. Site Entry Not Found
**Location**: `src/context/wallet/WalletContext.tsx` line 854

```typescript
if (entryError) {
  throw new Error(`Site entry fetch failed: ${entryError.message}`);
}
```

**When this happens**:
- Site entry was deleted
- Database connection issue
- Permission issue

#### 5c. Missing `site_code`
**Location**: `src/context/wallet/WalletContext.tsx` line 876

```typescript
if (!entry.site_code) {
  throw new Error('Site entry missing site_code - cannot verify uniqueness');
}
```

**When this happens**:
- Site entry is missing `site_code` field
- Data integrity issue

#### 5d. Missing `visited_at`
**Location**: `src/context/wallet/WalletContext.tsx` line 887

```typescript
if (!entry.visited_at) {
  throw new Error('Site entry missing visited_at - cannot verify week uniqueness');
}
```

**When this happens**:
- Site entry is missing `visited_at` field
- Data integrity issue
- Used for duplicate visit detection

#### 5e. Duplicate Visit Check Fails
**Location**: `src/context/wallet/WalletContext.tsx` line 915

```typescript
if (dupError) {
  throw new Error(`Duplicate visit check failed: ${dupError.message}`);
}
```

**When this happens**:
- Database error checking for duplicate visits
- Network issue

#### 5f. Duplicate Visit Detected
**Location**: `src/context/wallet/WalletContext.tsx` line 925

```typescript
if (duplicateVisits && duplicateVisits.length > 0) {
  // ... shows toast and returns early (no error thrown, just returns)
  return;
}
```

**When this happens**:
- Same site was visited in same week
- Function returns early (no error thrown)
- But `reconcileSiteVisitFee` treats this as success (it doesn't throw)

#### 5g. Wallet Creation/Update Errors
**Location**: `src/context/wallet/WalletContext.tsx` line 962-1004

**When this happens**:
- Database error creating wallet
- Database error updating wallet balance
- Permission issue

#### 5h. Transaction Insert Errors
**Location**: `src/context/wallet/WalletContext.tsx` line 1006-1044

**When this happens**:
- Database constraint violation (duplicate)
- Database error inserting transaction
- Network issue
- Permission issue

### Failure Reason 6: Silent Error Handling in Report Submission

**Location**: `src/pages/MMP.tsx` line 1505

```typescript
} catch (walletErr) {
  console.error('Wallet reconciliation error:', walletErr);
  // Error is caught but NOT re-thrown - site is already "Completed"!
}
```

**This is the critical issue!**

Even if reconciliation fails for ANY of the above reasons:
1. Site status is ALREADY set to "Completed" (line 1469)
2. Reconciliation is attempted (line 1495)
3. If reconciliation fails, error is caught silently (line 1505-1507)
4. Function continues
5. Result: Site marked "Completed" but NO transaction exists

---

## Most Likely Failure Scenarios

Based on the code analysis, the most likely reasons for missing transactions:

### Scenario 1: Status Set Before Reconciliation (The Main Bug)

1. `handleSubmitVisitReport` sets status to "Completed" FIRST (line 1469)
2. Then calls `reconcileSiteVisitFee` (line 1495)
3. Reconciliation fails (any reason from above)
4. Error is caught silently (line 1505-1507)
5. Site is already "Completed" but no transaction

### Scenario 2: Missing Required Fields

- Missing `site_code` (line 876) → throws error → reconciliation fails
- Missing `visited_at` (line 887) → throws error → reconciliation fails
- Missing user assignment (line 1109) → returns failure
- Missing fees (line 1128) → returns failure

### Scenario 3: Database/Network Errors

- Transaction check fails (line 824) → throws error
- Site entry fetch fails (line 854) → throws error
- Wallet creation/update fails (line 962-1004) → throws error
- Transaction insert fails (line 1006) → throws error

### Scenario 4: Duplicate Prevention

- Transaction already exists (line 1121) → returns failure (but this is expected)
- Duplicate visit detected (line 925) → returns early (no error, but no transaction created)

---

## The Root Cause

**The main issue is the order of operations**:

```
Current Flow (BROKEN):
1. Set status to "Completed" ✅
2. Attempt wallet reconciliation ❌
3. If reconciliation fails, catch error silently
4. Result: Site "Completed" but no transaction
```

**What should happen**:

```
Fixed Flow:
1. Attempt wallet reconciliation FIRST ✅
2. If reconciliation succeeds, THEN set status to "Completed" ✅
3. If reconciliation fails, DON'T set status to "Completed" ✅
4. Result: Site only marked "Completed" if transaction exists
```

---

## Summary

**Where report is submitted**:
- `handleSubmitVisitReport()` in `src/pages/MMP.tsx` line 1216
- Called when user submits the Visit Report Dialog

**Why reconciliation fails**:
- Multiple possible reasons (missing fields, database errors, validations)
- **But the MAIN issue is**: Status is set to "Completed" BEFORE reconciliation
- If reconciliation fails for ANY reason, the error is caught silently
- Result: Site marked "Completed" but no transaction exists

**The fix**:
- Move wallet reconciliation BEFORE status update
- Make reconciliation required (fail report submission if it fails)
- Only set status to "Completed" if transaction creation succeeds
