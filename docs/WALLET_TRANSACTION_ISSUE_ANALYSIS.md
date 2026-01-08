# Wallet Transaction Creation Issue - Report Upload Flow

## Problem Statement

Some sites are marked as "Completed" but wallet transactions are not created in the `wallet_transactions` table. This occurs when completing sites through the report upload workflow.

## Root Cause Analysis

### Current Flow

1. **User clicks "Complete Visit"** → `handleCompleteVisit()` is called (line 955 in MMP.tsx)
   - Opens visit report dialog immediately (line 958)
   - If online, tries to create wallet transaction (lines 1042-1140)
   - **Issue**: Wallet transaction creation is in a try-catch that silently logs errors (line 1154-1162)
   - Function continues even if wallet transaction fails

2. **User submits visit report** → `handleSubmitVisitReport()` is called (line 1216 in MMP.tsx)
   - Updates site status to "Completed" FIRST (line 1469)
   - Then tries to reconcile wallet fee (line 1495) via `reconcileSiteVisitFee()`
   - **Issue**: Wallet reconciliation happens AFTER status update
   - **Issue**: If reconciliation fails, error is caught silently (line 1505-1507)
   - Site is already marked as "Completed" but no transaction exists

### Critical Issues

#### Issue 1: Wallet Transaction Creation in `handleCompleteVisit` Can Fail Silently

**Location**: `src/pages/MMP.tsx`, lines 1042-1162

```typescript
// Process wallet payment for the user who completed the site entry
try {
  // ... wallet transaction creation code ...
} catch (walletErr) {
  console.error('Failed to process wallet payment for completed site entry:', walletErr);
  // Don't fail the entire operation if wallet payment fails
  toast({
    title: 'Payment Warning',
    description: 'Site visit completed but wallet payment failed. Please contact support.',
    variant: 'destructive',
  });
}
```

**Problem**: The error is caught and logged, but the operation continues. The wallet transaction is NOT created, but the function doesn't throw an error.

#### Issue 2: Status Update Happens Before Wallet Reconciliation

**Location**: `src/pages/MMP.tsx`, lines 1464-1511

```typescript
// Update site status to 'Completed' and save report info
if (isOnline) {
  console.log('🔄 Updating site status to Completed...');
  const { data: updateData, error: updateError } = await supabase
    .from('mmp_site_entries')
    .update({
      status: 'Completed',  // ← STATUS SET HERE FIRST
      additional_data: {
        ...(site.additional_data || {}),
        visit_report_submitted: true,
        visit_report_id: report?.id || null,
        visit_report_submitted_at: now
      }
    })
    .eq('id', site.id)
    .select();

  // ... error handling ...
}

// Wallet reconciliation (only when online)
if (isOnline) {
  try {
    console.log('💰 Reconciling wallet for completed site:', site.id);
    const result = await reconcileSiteVisitFee(site.id);  // ← WALLET RECONCILIATION AFTER STATUS UPDATE
    if (result.success) {
      toast({
        title: 'Payment Added',
        description: result.message,
        variant: 'default'
      });
    } else {
      console.warn('[Wallet] ' + result.message);
    }
  } catch (walletErr) {
    console.error('Wallet reconciliation error:', walletErr);  // ← ERROR CAUGHT SILENTLY
  }
}
```

**Problem**: 
- Site status is set to "Completed" FIRST (line 1469)
- Wallet reconciliation happens AFTER (line 1495)
- If reconciliation fails, site is already marked as "Completed" but no transaction exists
- Error is silently caught (line 1505-1507)

#### Issue 3: `reconcileSiteVisitFee` Requires Status to be "Completed"

**Location**: `src/context/wallet/WalletContext.tsx`, lines 1089-1141

```typescript
const reconcileSiteVisitFee = async (siteVisitId: string): Promise<{ success: boolean; message: string }> => {
  // ...
  
  if ((entry.status || '').toLowerCase() !== 'completed') {
    return { success: false, message: `Site is not completed. Current status: ${entry.status}` };
  }
  
  // ...
}
```

**Problem**: `reconcileSiteVisitFee` checks if status is "completed" (line 1102). This creates a chicken-and-egg problem:
- Status must be "completed" for reconciliation to run
- But if reconciliation fails, we have a completed site with no transaction

#### Issue 4: Duplicate Transaction Prevention May Skip Creation

**Location**: `src/context/wallet/WalletContext.tsx`, `addSiteVisitFeeToWallet()` function

The function checks for existing transactions before creating new ones. If:
1. `handleCompleteVisit` tries to create a transaction but it fails silently
2. `handleSubmitVisitReport` calls `reconcileSiteVisitFee`
3. `reconcileSiteVisitFee` calls `addSiteVisitFeeToWallet`
4. `addSiteVisitFeeToWallet` checks for existing transactions
5. If a partial transaction exists (created but failed), it might skip creating a new one

However, this might not be the issue since `handleCompleteVisit` wallet creation failure would not create a transaction at all.

## Scenarios Where Transactions Are Missing

### Scenario 1: Wallet Transaction Fails in `handleCompleteVisit`

1. User clicks "Complete Visit"
2. `handleCompleteVisit` tries to create wallet transaction
3. Transaction creation fails (e.g., database error, network issue)
4. Error is caught silently (line 1154-1162)
5. Function continues, report dialog opens
6. User submits report
7. `handleSubmitVisitReport` sets status to "Completed"
8. `reconcileSiteVisitFee` is called but may also fail
9. Result: Site is "Completed" but no transaction exists

### Scenario 2: Wallet Reconciliation Fails in `handleSubmitVisitReport`

1. User clicks "Complete Visit"
2. Wallet transaction creation in `handleCompleteVisit` may succeed or fail (silently)
3. User submits report
4. Status is set to "Completed"
5. `reconcileSiteVisitFee` is called
6. Reconciliation fails (e.g., validation fails, duplicate check fails incorrectly)
7. Error is caught silently (line 1505-1507)
8. Result: Site is "Completed" but no transaction exists

### Scenario 3: Race Condition

1. User clicks "Complete Visit"
2. `handleCompleteVisit` starts wallet transaction creation
3. User quickly submits report before transaction completes
4. `handleSubmitVisitReport` sets status to "Completed"
5. `reconcileSiteVisitFee` is called
6. `reconcileSiteVisitFee` checks for existing transaction
7. Transaction from `handleCompleteVisit` may not be visible yet
8. New transaction is attempted, but duplicate check may fail
9. Result: Site is "Completed" but no transaction exists (or duplicate transaction)

## Why This Affects Report Upload Flow Specifically

The report upload flow (`handleSubmitVisitReport`) is the primary path where this issue manifests because:

1. `handleCompleteVisit` opens the report dialog immediately
2. Wallet transaction creation in `handleCompleteVisit` is optional (errors are caught silently)
3. The actual status update to "Completed" happens in `handleSubmitVisitReport`
4. Wallet reconciliation in `handleSubmitVisitReport` happens AFTER status update
5. If reconciliation fails, site is already marked as "Completed"

In contrast, other completion flows (e.g., direct completion without report) may have different code paths that handle wallet transactions differently.

## Impact

- Users complete site visits and submit reports
- Sites are marked as "Completed" in the database
- But wallet transactions are NOT created
- Users don't receive payment
- Financial records are incomplete
- Reconciliation becomes difficult

## Solution Recommendations

### Option 1: Move Wallet Reconciliation Before Status Update (Recommended)

Move wallet reconciliation BEFORE setting status to "Completed":

```typescript
// Wallet reconciliation (only when online) - DO THIS FIRST
if (isOnline) {
  try {
    console.log('💰 Reconciling wallet for completed site:', site.id);
    const result = await reconcileSiteVisitFee(site.id);
    if (!result.success) {
      throw new Error(result.message);
    }
  } catch (walletErr) {
    console.error('Wallet reconciliation error:', walletErr);
    throw walletErr; // Don't mark as completed if wallet fails
  }
}

// Update site status to 'Completed' - DO THIS AFTER
if (isOnline) {
  console.log('🔄 Updating site status to Completed...');
  const { data: updateData, error: updateError } = await supabase
    .from('mmp_site_entries')
    .update({
      status: 'Completed',
      // ...
    })
    .eq('id', site.id);
}
```

**Problem**: `reconcileSiteVisitFee` requires status to be "Completed" (line 1102). Need to modify this check.

### Option 2: Modify `reconcileSiteVisitFee` to Work with Non-Completed Status

Modify `reconcileSiteVisitFee` to check status more flexibly:

```typescript
// Allow reconciliation if status is "Completed" OR if visit_completed_at is set
const isCompleted = (entry.status || '').toLowerCase() === 'completed' || 
                    entry.visit_completed_at !== null;

if (!isCompleted) {
  return { success: false, message: `Site is not completed. Current status: ${entry.status}` };
}
```

### Option 3: Remove Wallet Transaction Creation from `handleCompleteVisit`

Remove the wallet transaction creation from `handleCompleteVisit` entirely and only do it in `handleSubmitVisitReport`:

- Pros: Single code path, easier to maintain
- Cons: Requires refactoring, may break existing flows

### Option 4: Make Wallet Transaction Creation Required (Fail Fast)

Make wallet transaction creation required and fail the operation if it fails:

```typescript
// Process wallet payment for the user who completed the site entry
try {
  // ... wallet transaction creation code ...
} catch (walletErr) {
  console.error('Failed to process wallet payment for completed site entry:', walletErr);
  throw walletErr; // Fail the operation if wallet payment fails
}
```

**Problem**: This would prevent completion if wallet fails, which might not be desired.

## Recommended Fix (Option 1 + Option 2)

1. **Modify `reconcileSiteVisitFee`** to check status more flexibly (allow if `visit_completed_at` is set)
2. **Move wallet reconciliation BEFORE status update** in `handleSubmitVisitReport`
3. **Make wallet reconciliation required** (fail report submission if reconciliation fails)
4. **Remove or simplify wallet transaction creation** from `handleCompleteVisit` (or make it optional but don't rely on it)

This ensures:
- Wallet transaction is created BEFORE status is set to "Completed"
- If wallet transaction fails, site is NOT marked as "Completed"
- Single source of truth for wallet transaction creation (in report submission)
- Clear error handling and user feedback
