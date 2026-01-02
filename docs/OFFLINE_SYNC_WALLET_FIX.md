# Offline Sync Wallet Payment Fix

## Problem

The offline completion and sync logic had several issues that could cause wallet payments to be missed:

1. **Incorrect user determination**: Only used `userId` from payload, didn't check database fields (`accepted_by`, `claimed_by`, `visit_completed_by`)
2. **Incomplete fee calculation**: Only used `enumerator_fee + transport_fee`, didn't check `cost` field
3. **Missing database fields**: Didn't fetch all necessary fields from database
4. **Invalid enum check**: Checked for `'site_visit_fee'` which is not a valid enum value
5. **No wallet creation**: Didn't create wallet if user didn't have one
6. **Type mismatch**: Didn't properly handle `accepted_by` being text vs `claimed_by`/`visit_completed_by` being uuid

## Solution

### Updated `syncSiteVisitComplete` in `src/lib/sync-manager.ts`

#### 1. Enhanced Database Query
```typescript
// Before: Only fetched basic fields
.select('additional_data, enumerator_fee, transport_fee, status, updated_at')

// After: Fetches all necessary fields including user fields and cost
.select('additional_data, enumerator_fee, transport_fee, cost, status, updated_at, accepted_by, claimed_by, visit_completed_by, site_name')
```

#### 2. Improved User Determination
```typescript
// Before: Only used userId from payload
if (fee > 0 && userId) { ... }

// After: Checks multiple fields in priority order
const userToPay = existing?.accepted_by || 
                 existing?.claimed_by || 
                 existing?.visit_completed_by ||
                 userId;
```

#### 3. Enhanced Fee Calculation
```typescript
// Before: Only summed fees
const fee = (existing?.enumerator_fee || 0) + (existing?.transport_fee || 0);

// After: Uses cost if available, otherwise sums fees
const directCost = Number(existing?.cost || 0);
const enumeratorFee = Number(existing?.enumerator_fee || 0);
const transportFee = Number(existing?.transport_fee || 0);
const fee = directCost > 0 ? directCost : (enumeratorFee + transportFee);
```

#### 4. Fixed Enum Check
```typescript
// Before: Checked invalid enum value
.in('type', ['earning', 'site_visit_fee']);

// After: Only checks valid enum value
.eq('type', 'earning');
```

#### 5. Added Wallet Creation
```typescript
// New: Creates wallet if user doesn't have one
if (walletFetchError && walletFetchError.code === 'PGRST116') {
  const { data: newWallet, error: createError } = await supabase
    .from('wallets')
    .insert({
      user_id: userToPayUuid,
      balances: { SDG: fee },
      total_earned: fee,
    })
    .select()
    .single();
  
  // Create transaction for new wallet
  await supabase.from('wallet_transactions').insert({...});
}
```

#### 6. Proper UUID Type Handling
```typescript
// Handles type mismatch: accepted_by is text, claimed_by/visit_completed_by are uuid
let userToPayUuid: string;
if (existing?.claimed_by) {
  userToPayUuid = existing.claimed_by;
} else if (existing?.visit_completed_by) {
  userToPayUuid = existing.visit_completed_by;
} else if (existing?.accepted_by) {
  // accepted_by is text, but should be a valid UUID string
  userToPayUuid = existing.accepted_by;
} else {
  userToPayUuid = userId;
}
```

## Flow Diagram

```
Offline Completion
    ↓
Save to Local Storage
    ↓
Queue for Sync
    ↓
When Online: syncSiteVisitComplete()
    ↓
1. Fetch site entry from database
   - Get accepted_by, claimed_by, visit_completed_by
   - Get cost, enumerator_fee, transport_fee
    ↓
2. Determine user to pay
   - Priority: accepted_by > claimed_by > visit_completed_by > userId
    ↓
3. Calculate fee
   - Use cost if available
   - Otherwise: enumerator_fee + transport_fee
    ↓
4. Check for existing transaction
   - Prevent duplicates
    ↓
5. Get or create wallet
   - Fetch existing wallet
   - Create if doesn't exist
    ↓
6. Create wallet transaction
   - Type: 'earning'
   - Update wallet balance
   - Update total_earned
    ↓
✅ Payment Complete
```

## Key Improvements

1. **Robust user detection**: Checks multiple database fields, not just payload
2. **Complete fee calculation**: Uses `cost` field when available
3. **Duplicate prevention**: Checks for existing transactions before creating
4. **Wallet auto-creation**: Creates wallet if user doesn't have one
5. **Type safety**: Properly handles text vs uuid type differences
6. **Better error handling**: Logs errors and handles edge cases

## Testing Checklist

- [ ] Complete site visit offline
- [ ] Sync when online
- [ ] Verify wallet transaction created
- [ ] Verify wallet balance updated
- [ ] Verify no duplicate transactions
- [ ] Test with user who has no wallet (should create one)
- [ ] Test with accepted_by set (text field)
- [ ] Test with claimed_by set (uuid field)
- [ ] Test with visit_completed_by set (uuid field)
- [ ] Test with cost field set vs enumerator_fee + transport_fee

## Related Files

- `src/lib/sync-manager.ts` - Main sync logic
- `src/pages/MMP.tsx` - Online completion handler (also fixed)
- `src/context/wallet/WalletContext.tsx` - Reconciliation function (also fixed)
- `src/hooks/useOfflineSiteVisit.ts` - Offline completion hook

## Notes

- The offline sync now matches the online completion logic for consistency
- Both paths now check the same database fields in the same priority order
- The backfill script can be used to fix any missed payments from before this fix

