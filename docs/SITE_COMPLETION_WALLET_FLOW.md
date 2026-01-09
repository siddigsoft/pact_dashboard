# Site Completion and Wallet Earning Flow

This document explains how site completion triggers wallet earnings through transaction creation.

## Overview

When a site visit is completed, the system automatically:
1. Marks the site as "Completed" in `mmp_site_entries`
2. Calculates the fee (from `cost`, `enumerator_fee`, or `transport_fee`)
3. Creates a wallet transaction record in `wallet_transactions` table
4. Updates the user's wallet balance and total earnings

---

## Flow Diagrams

### Online Completion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  ONLINE SITE COMPLETION                          │
└─────────────────────────────────────────────────────────────────┘

1. User completes site visit (via MMP.tsx handleCompleteVisit)
   ↓
2. Update mmp_site_entries:
   - status: 'Completed'
   - visit_completed_at: timestamp
   - visit_completed_by: user_id
   - additional_data.final_location: GPS coordinates
   ↓
3. Determine user to pay (priority order):
   - accepted_by (from database)
   - claimed_by (from database)  
   - visit_completed_by (from database)
   - current_user.id (fallback)
   ↓
4. Calculate fee:
   - Use cost if available (cost > 0)
   - Otherwise: enumerator_fee + transport_fee
   ↓
5. Get or create wallet for user:
   - Query wallets table by user_id
   - If not found, create new wallet with initial balance = fee
   ↓
6. Insert wallet transaction:
   wallet_transactions {
     wallet_id: wallet.id,
     user_id: user_id,
     type: 'earning',
     amount: fee,
     amount_cents: fee * 100,
     currency: 'SDG',
     site_visit_id: site.id,
     description: "Site visit completed: {site_name}",
     balance_before: currentBalance,
     balance_after: currentBalance + fee,
     status: 'pending' (default)
   }
   ↓
7. Update wallet balance (manual update):
   wallets {
     balances.SDG: newBalance,
     total_earned: old_total_earned + fee,
     updated_at: now()
   }
```

### Context-Based Completion Flow (SiteVisitContext)

```
┌─────────────────────────────────────────────────────────────────┐
│           CONTEXT-BASED COMPLETION FLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. User completes site visit (via SiteVisitContext.completeSiteVisit)
   ↓
2. Update local state and database:
   - Set status to 'completed'
   - Update completedAt timestamp
   ↓
3. Call addSiteVisitFeeToWallet (from WalletContext)
   ↓
4. WalletContext.addSiteVisitFeeToWallet performs:
   - Validation: Check for duplicate fees
   - Validation: Check for duplicate site visits (same site_code in same week)
   - Fetch site entry fees (enumerator_fee, transport_fee, cost)
   - Get or create wallet
   - Insert transaction
   - Update wallet balance
```

### Offline Completion & Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              OFFLINE COMPLETION & SYNC FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. User completes site offline (via useOfflineSiteVisit.completeSiteVisit)
   ↓
2. Save completion locally in IndexedDB (offline_site_visits table)
   ↓
3. When connection restored, SyncManager.syncSiteVisitComplete runs
   ↓
4. Update mmp_site_entries:
   - status: 'Completed'
   - visit_completed_at: timestamp
   - visit_completed_by: user_id
   - additional_data: { offline_complete: true, end_location, ... }
   ↓
5. Check for existing fees (prevent duplicates):
   - Query wallet_transactions by site_visit_id OR reference_id
   - If fee exists, skip wallet update
   ↓
6. Determine user to pay (same priority as online flow)
   ↓
7. Calculate fee (same logic as online flow)
   ↓
8. Get or create wallet
   ↓
9. Insert wallet transaction:
   wallet_transactions {
     wallet_id: wallet.id,
     user_id: user_id,
     type: 'earning',
     amount: fee,
     amount_cents: fee * 100,
     site_visit_id: siteEntryId,
     reference_id: siteEntryId,
     reference_type: 'site_visit',
     description: "Site visit completion (offline sync): {site_name}",
     balance_before: currentBalance,
     balance_after: newBalance,
     status: 'pending'
   }
   ↓
10. Update wallet balance (manual update)
```

---

## Key Components

### 1. Site Completion Entry Points

**File: `src/pages/MMP.tsx`**
- Function: `handleCompleteVisit()` (line ~955)
- Direct wallet update in the same function
- Updates `mmp_site_entries` and `wallet_transactions` in sequence

**File: `src/context/siteVisit/SiteVisitContext.tsx`**
- Function: `completeSiteVisit()` (line ~506)
- Uses WalletContext's `addSiteVisitFeeToWallet()` function
- More robust validation and duplicate checking

**File: `src/hooks/useOfflineSiteVisit.ts`**
- Function: `completeSiteVisit()` (line ~246)
- Saves completion locally when offline
- SyncManager handles wallet update when syncing

### 2. Wallet Fee Addition Logic

**File: `src/context/wallet/WalletContext.tsx`**
- Function: `addSiteVisitFeeToWallet()` (line ~794)
- **Primary function for adding fees with comprehensive validation**

**Key Validations:**
1. **Duplicate Fee Prevention**: Checks `wallet_transactions` for existing fees with same `site_visit_id` or `reference_id`
2. **Duplicate Visit Prevention**: Checks for same `site_code` completed in same week
3. **Data Integrity**: Requires `site_code` and `visited_at` fields

**Fee Calculation Priority:**
1. Use `cost` field if available (cost > 0)
2. Otherwise: `enumerator_fee + transport_fee`
3. Fallback: Classification-based calculation (if fees not stored)

**Wallet Transaction Creation:**
```typescript
{
  wallet_id: wallet.id,
  user_id: userId,
  type: 'earning',
  amount: fee,
  amount_cents: Math.round(fee * 100),
  currency: 'SDG',
  site_visit_id: siteVisitId,
  description: "Site visit fee: {enumerator_fee} SDG enumerator + {transport_fee} SDG transport",
  balance_before: currentBalance,
  balance_after: newBalance,
  status: 'pending' // Default status
}
```

**Wallet Balance Update:**
- Manually updates `wallets` table:
  - `balances.SDG`: newBalance
  - `total_earned`: old_total_earned + fee
  - `updated_at`: current timestamp

### 3. Offline Sync Logic

**File: `src/lib/sync-manager.ts`**
- Function: `syncSiteVisitComplete()` (line ~760)
- Handles wallet updates for offline completions when syncing
- Similar logic to online flow but with additional duplicate checks
- Uses both `site_visit_id` and `reference_id` for transaction tracking

---

## Database Tables

### mmp_site_entries
**Key fields for wallet logic:**
- `id`: Site entry ID (used as site_visit_id in transactions)
- `status`: Site status (must be 'Completed' for wallet payout)
- `accepted_by`: Primary field to determine user to pay (text/uuid)
- `claimed_by`: Secondary field to determine user to pay (uuid)
- `visit_completed_by`: Tertiary field to determine user to pay (uuid)
- `enumerator_fee`: Fee component 1 (numeric)
- `transport_fee`: Fee component 2 (numeric)
- `cost`: Total fee (if directly stored, numeric)
- `site_name`: Site name (used in transaction description)
- `site_code`: Site code (used for duplicate visit validation)

### wallet_transactions
**Transaction record created:**
- `id`: Transaction UUID (auto-generated)
- `wallet_id`: Reference to wallets table
- `user_id`: User who receives the payment
- `type`: 'earning' (enum value)
- `amount`: Fee amount in SDG (numeric)
- `amount_cents`: Fee amount in cents (bigint)
- `currency`: 'SDG' (default)
- `site_visit_id`: Reference to mmp_site_entries.id
- `reference_id`: Also set to siteEntryId (for offline sync tracking)
- `reference_type`: 'site_visit' (for offline sync)
- `description`: Human-readable description
- `balance_before`: Wallet balance before transaction
- `balance_after`: Wallet balance after transaction
- `status`: 'pending' (default, but can be 'posted')

### wallets
**Updated fields:**
- `id`: Wallet UUID
- `user_id`: User who owns the wallet
- `balances`: JSONB object with currency balances (e.g., `{"SDG": 500}`)
- `total_earned`: Total earnings accumulated (numeric)
- `updated_at`: Last update timestamp

**Note**: The application code manually updates wallet balances. While there is a database trigger (`update_wallet_balance()`) that automatically updates wallets when transactions are inserted/updated, it only fires when transaction `status = 'posted'`. Since transactions are inserted with `status = 'pending'` by default, the trigger doesn't fire, and the application code handles the wallet updates directly.

---

## User Determination Priority

When determining which user should receive payment, the system checks in this order:

1. **accepted_by** (from `mmp_site_entries` table)
2. **claimed_by** (from `mmp_site_entries` table)
3. **visit_completed_by** (from `mmp_site_entries` table)
4. **userId** (from completion context/payload - fallback)

**Type Handling**: 
- `accepted_by` is stored as `text` (but should be UUID string)
- `claimed_by` and `visit_completed_by` are stored as `uuid`
- Code handles type conversion when needed

---

## Fee Calculation Logic

**Priority Order:**

1. **Direct Cost** (if available):
   ```typescript
   if (cost > 0) {
     amount = cost;
   }
   ```

2. **Sum of Components**:
   ```typescript
   else if (enumerator_fee > 0 || transport_fee > 0) {
     amount = enumerator_fee + transport_fee;
   }
   ```

3. **Classification-Based** (fallback):
   - Uses `calculateClassificationFee()` function
   - Based on user's classification level (A/B/C)
   - Multiplied by complexity multiplier (1.0, 1.5, or 2.0)

---

## Duplicate Prevention

The system has multiple layers of duplicate prevention:

### 1. Transaction-Level Check
- Queries `wallet_transactions` for existing fees:
  - By `site_visit_id = siteEntryId`
  - By `reference_id = siteEntryId` (for offline sync)
  - Type must be 'earning' or 'site_visit_fee'
- If any existing transaction found, skip wallet update

### 2. Site Visit-Level Check (in WalletContext only)
- Checks for duplicate site visits:
  - Same `site_code`
  - Same week (based on `visited_at`)
  - Status = 'completed'
- Prevents paying for the same site twice in one week

### 3. Race Condition Guards
- `pendingFeeAdditions` Set in WalletContext (prevents concurrent calls)
- `pendingCompletions` Set in SiteVisitContext (prevents concurrent completions)

---

## Important Notes

1. **Manual Wallet Updates**: The application code manually updates wallet balances, even though there's a database trigger. The trigger only fires when `status = 'posted'`, but transactions are inserted with `status = 'pending'`.

2. **Transaction Status**: Transactions are created with `status = 'pending'` by default. The database trigger `update_wallet_balance()` only runs when `status = 'posted'`, so it doesn't automatically update wallets for site completion transactions.

3. **Multiple Entry Points**: There are multiple code paths that can trigger wallet updates:
   - Direct update in MMP.tsx (simpler, less validation)
   - Through WalletContext.addSiteVisitFeeToWallet (more validation)
   - Through SyncManager (for offline completions)

4. **Offline Support**: Offline completions are saved locally and synced later. Wallet updates happen during sync, with the same duplicate prevention logic.

5. **Error Handling**: If wallet update fails, site completion may still succeed (depends on code path). Errors are logged and notifications sent to users.

6. **⚠️ CRITICAL ISSUE - Report Upload Flow**: There is a known issue where sites can be marked as "Completed" without wallet transactions being created. This happens in the report upload flow:
   - In `handleSubmitVisitReport` (MMP.tsx line 1216), the site status is set to "Completed" FIRST (line 1469)
   - Wallet reconciliation happens AFTER status update (line 1495)
   - If wallet reconciliation fails, the error is caught silently (line 1505-1507)
   - Result: Site is marked as "Completed" but no transaction exists
   - See `docs/WALLET_TRANSACTION_ISSUE_ANALYSIS.md` for detailed analysis and recommended fixes

---

## Example Transaction Record

When a site is completed with:
- Site: "ABC Site" (code: "ABC001")
- Enumerator Fee: 150 SDG
- Transport Fee: 50 SDG
- User: "user-123-uuid"

**Transaction Created:**
```json
{
  "id": "tx-uuid-123",
  "wallet_id": "wallet-uuid-456",
  "user_id": "user-123-uuid",
  "type": "earning",
  "amount": 200,
  "amount_cents": 20000,
  "currency": "SDG",
  "site_visit_id": "site-uuid-789",
  "description": "Site visit fee: 150 SDG enumerator + 50 SDG transport",
  "balance_before": 500,
  "balance_after": 700,
  "status": "pending",
  "created_at": "2025-01-15T10:30:00Z"
}
```

**Wallet Updated:**
```json
{
  "id": "wallet-uuid-456",
  "user_id": "user-123-uuid",
  "balances": {
    "SDG": 700
  },
  "total_earned": 1200,
  "updated_at": "2025-01-15T10:30:00Z"
}
```
