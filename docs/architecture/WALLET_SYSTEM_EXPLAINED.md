# PACT Wallet System - Complete Explanation

**Last Updated:** November 25, 2025  
**Status:** Production-Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Database Tables Structure](#database-tables-structure)
3. [How Money Flows](#how-money-flows)
4. [Withdrawal Process](#withdrawal-process)
5. [Transaction Types](#transaction-types)
6. [Classification & Fee Calculation](#classification--fee-calculation)
7. [Security & Permissions](#security--permissions)

---

## System Overview

The PACT Wallet System is a complete financial management platform that:
- Automatically calculates and pays field workers for completed site visits
- Manages user wallet balances with multi-currency support
- Handles withdrawal requests with admin approval workflow
- Tracks all transactions with full audit trail
- Enforces security through Row Level Security (RLS) policies

### Key Components

```
┌──────────────────────────────────────────────────────────┐
│                  WALLET ECOSYSTEM                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Wallets Table          ← Central balance storage       │
│  Wallet Transactions    ← Complete transaction history  │
│  Withdrawal Requests    ← Payment approval workflow     │
│  Cost Submissions       ← Site visit expenses           │
│  User Classifications   ← Fee tier management           │
│  Fee Structures         ← Payment rate configuration    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Database Tables Structure

### 1. `wallets` Table

**Purpose:** Stores each user's wallet balance and financial summary.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Unique wallet identifier |
| `user_id` | UUID | References `profiles(id)` (unique per user) |
| `balances` | JSONB | Multi-currency balances `{"SDG": 5000.00, "USD": 100.00}` |
| `total_earned` | DECIMAL | Lifetime total earnings |
| `total_withdrawn` | DECIMAL | Lifetime total withdrawals |
| `created_at` | TIMESTAMPTZ | Wallet creation date |
| `updated_at` | TIMESTAMPTZ | Last balance update |

**Example Record:**
```json
{
  "id": "a1b2c3d4-...",
  "user_id": "xyz123-...",
  "balances": {
    "SDG": 15000.50,
    "USD": 250.00
  },
  "total_earned": 50000.00,
  "total_withdrawn": 35000.00,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-11-25T14:30:00Z"
}
```

**How It Works:**
- Each user gets ONE wallet (created automatically on first transaction)
- `balances` field stores multiple currencies as JSON
- `total_earned` and `total_withdrawn` track lifetime totals
- Balance = `total_earned - total_withdrawn`

---

### 2. `wallet_transactions` Table

**Purpose:** Complete audit trail of every financial operation (deposits, withdrawals, adjustments).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Transaction identifier |
| `wallet_id` | UUID | References `wallets(id)` |
| `user_id` | UUID | References `profiles(id)` |
| `type` | TEXT | Transaction type (see types below) |
| `amount` | DECIMAL | Transaction amount (positive = credit, negative = debit) |
| `currency` | VARCHAR(3) | Currency code (SDG, USD, EUR, etc.) |
| `balance_before` | DECIMAL | Wallet balance before this transaction |
| `balance_after` | DECIMAL | Wallet balance after this transaction |
| `site_visit_id` | UUID | Optional: linked site visit |
| `withdrawal_request_id` | UUID | Optional: linked withdrawal request |
| `description` | TEXT | Human-readable description |
| `metadata` | JSONB | Additional data (fee details, etc.) |
| `created_by` | UUID | Who created this transaction |
| `created_at` | TIMESTAMPTZ | Transaction timestamp |

**Example Transaction (Site Visit Payment):**
```json
{
  "id": "tx-abc123",
  "wallet_id": "wallet-xyz",
  "user_id": "user-456",
  "type": "site_visit_fee",
  "amount": 1500.00,
  "currency": "SDG",
  "balance_before": 5000.00,
  "balance_after": 6500.00,
  "site_visit_id": "site-789",
  "description": "Site visit fee - Al Qadarif Site A",
  "metadata": {
    "classification_level": "A",
    "base_fee": 1200.00,
    "transport_fee": 300.00,
    "complexity_multiplier": 1.0
  },
  "created_by": "admin-001",
  "created_at": "2025-11-25T14:00:00Z"
}
```

**Transaction Types:**
- `site_visit_fee` - Payment for completed site visit
- `withdrawal` - Money withdrawn from wallet (negative amount)
- `adjustment` - Manual admin correction
- `bonus` - Performance bonus
- `penalty` - Deduction for violations
- `retainer` - Monthly retainer payment

---

### 3. `withdrawal_requests` Table

**Purpose:** Manages the withdrawal approval workflow.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Request identifier |
| `user_id` | UUID | Who requested withdrawal |
| `wallet_id` | UUID | Which wallet to withdraw from |
| `amount` | DECIMAL | Requested amount |
| `currency` | VARCHAR(3) | Currency (must match wallet) |
| `status` | TEXT | `pending`, `approved`, `rejected`, `cancelled` |
| `request_reason` | TEXT | Why user needs withdrawal |
| `payment_method` | TEXT | Bank transfer, mobile money, etc. |
| `payment_details` | JSONB | Account number, phone number, etc. |
| `supervisor_id` | UUID | Who approved/rejected |
| `supervisor_notes` | TEXT | Admin's approval/rejection notes |
| `approved_at` | TIMESTAMPTZ | When approved |
| `rejected_at` | TIMESTAMPTZ | When rejected |
| `created_at` | TIMESTAMPTZ | Request submission time |
| `updated_at` | TIMESTAMPTZ | Last status change |

**Example Request:**
```json
{
  "id": "wr-456",
  "user_id": "user-123",
  "wallet_id": "wallet-xyz",
  "amount": 5000.00,
  "currency": "SDG",
  "status": "approved",
  "request_reason": "Emergency family expenses",
  "payment_method": "bank_transfer",
  "payment_details": {
    "bank_name": "Bank of Khartoum",
    "account_number": "123456789",
    "account_name": "Ahmed Hassan"
  },
  "supervisor_id": "admin-001",
  "supervisor_notes": "Approved - urgent request",
  "approved_at": "2025-11-25T15:00:00Z",
  "created_at": "2025-11-25T14:30:00Z"
}
```

---

### 4. `site_visit_cost_submissions` Table

**Purpose:** Tracks actual costs incurred during site visits (separate from fees).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Submission identifier |
| `site_visit_id` | UUID | Associated site visit |
| `submitted_by` | UUID | Field worker who submitted |
| `transportation_cost_cents` | BIGINT | Transport costs (in cents) |
| `accommodation_cost_cents` | BIGINT | Lodging costs |
| `meal_allowance_cents` | BIGINT | Food allowance |
| `other_costs_cents` | BIGINT | Miscellaneous expenses |
| `total_cost_cents` | BIGINT | Auto-calculated total |
| `currency` | VARCHAR(3) | Currency code |
| `status` | TEXT | `pending`, `approved`, `rejected`, `paid` |
| `supporting_documents` | JSONB | Receipt uploads |
| `reviewed_by` | UUID | Admin who reviewed |
| `reviewer_notes` | TEXT | Review comments |
| `wallet_transaction_id` | UUID | Linked payment transaction |
| `paid_at` | TIMESTAMPTZ | When payment made |

**Note:** Cost submissions are for **reimbursing actual expenses**, while wallet transactions for `site_visit_fee` are for **earning fees based on classification**.

---

### 5. `user_classifications` Table

**Purpose:** Defines which fee tier each user belongs to (A, B, or C).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Classification record ID |
| `user_id` | UUID | User being classified |
| `classification_level` | ENUM | `A`, `B`, or `C` (A = highest pay) |
| `role_scope` | ENUM | `coordinator`, `dataCollector`, `supervisor` |
| `effective_from` | TIMESTAMPTZ | When this classification starts |
| `effective_until` | TIMESTAMPTZ | When it expires (NULL = permanent) |
| `has_retainer` | BOOLEAN | Does user get monthly retainer? |
| `retainer_amount_cents` | INTEGER | Monthly retainer in cents |
| `retainer_currency` | TEXT | Currency for retainer |
| `retainer_frequency` | TEXT | `monthly`, `quarterly`, `annual` |
| `is_active` | BOOLEAN | Is this classification current? |

**Example:**
```json
{
  "id": "class-001",
  "user_id": "user-123",
  "classification_level": "A",
  "role_scope": "dataCollector",
  "effective_from": "2025-01-01T00:00:00Z",
  "effective_until": null,
  "has_retainer": true,
  "retainer_amount_cents": 50000,
  "retainer_currency": "SDG",
  "retainer_frequency": "monthly",
  "is_active": true
}
```

---

### 6. `classification_fee_structures` Table

**Purpose:** Defines how much each classification level earns per site visit.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Fee structure ID |
| `classification_level` | ENUM | `A`, `B`, or `C` |
| `role_scope` | ENUM | `coordinator`, `dataCollector`, `supervisor` |
| `site_visit_base_fee_cents` | INTEGER | Base fee per site visit (in cents) |
| `complexity_multiplier` | DECIMAL | Multiplier for complex sites (1.0 - 3.0) |
| `currency` | TEXT | Currency code |
| `valid_from` | TIMESTAMPTZ | When this rate becomes effective |
| `valid_until` | TIMESTAMPTZ | When rate expires |
| `is_active` | BOOLEAN | Is this rate currently active? |

**Example:**
```json
{
  "id": "fee-A-dc",
  "classification_level": "A",
  "role_scope": "dataCollector",
  "site_visit_base_fee_cents": 150000,
  "complexity_multiplier": 1.0,
  "currency": "SDG",
  "valid_from": "2025-01-01T00:00:00Z",
  "valid_until": null,
  "is_active": true
}
```

**Fee Structure Breakdown:**
- **Level A:** Highest earners (most experienced)
  - Base fee: 1,500 SDG per site visit
  - Complex sites: up to 4,500 SDG (3.0x multiplier)
- **Level B:** Mid-tier
  - Base fee: 1,000 SDG per site visit
  - Complex sites: up to 3,000 SDG
- **Level C:** Entry-level
  - Base fee: 500 SDG per site visit
  - Complex sites: up to 1,500 SDG

---

## How Money Flows

### Step-by-Step: From Site Visit to Wallet

```
┌────────────────────────────────────────────────────────────────┐
│                    MONEY FLOW DIAGRAM                          │
└────────────────────────────────────────────────────────────────┘

Step 1: FIELD WORK COMPLETION
┌──────────────────────────────────┐
│ Data Collector visits site       │
│ Completes data collection        │
│ Site visit status = "completed"  │
└──────────────────────────────────┘
                 ↓

Step 2: COST SUBMISSION (Optional - for reimbursement)
┌──────────────────────────────────┐
│ User submits actual costs:       │
│ - Transport: 300 SDG             │
│ - Meals: 100 SDG                 │
│ - Accommodation: 200 SDG         │
│ → Status: "pending"              │
└──────────────────────────────────┘
                 ↓

Step 3: ADMIN REVIEWS COST
┌──────────────────────────────────┐
│ Financial Admin reviews          │
│ - Checks receipts                │
│ - Verifies amounts               │
│ → Approves: Status = "approved"  │
└──────────────────────────────────┘
                 ↓

Step 4: FEE CALCULATION
┌──────────────────────────────────┐
│ System looks up:                 │
│ 1. User classification (A/B/C)   │
│ 2. Base fee (1,500 SDG for A)    │
│ 3. Complexity multiplier (1.0)   │
│ 4. Approved transport (300 SDG)  │
│                                  │
│ Calculation:                     │
│ = (1,500 × 1.0) + 300           │
│ = 1,800 SDG total               │
└──────────────────────────────────┘
                 ↓

Step 5: WALLET CREDIT
┌──────────────────────────────────┐
│ System creates transaction:      │
│ - Type: "site_visit_fee"         │
│ - Amount: +1,800 SDG             │
│ - Wallet balance updated         │
│ - Transaction history recorded   │
└──────────────────────────────────┘
                 ↓

Step 6: USER SEES UPDATED BALANCE
┌──────────────────────────────────┐
│ Wallet Page shows:               │
│ Previous: 5,000 SDG              │
│ New: 6,800 SDG                   │
│ (+1,800 SDG from Site Visit)     │
└──────────────────────────────────┘
```

---

## Withdrawal Process

### Complete Workflow

```
USER SIDE                          ADMIN SIDE
───────────────────────────────────────────────────────────

1. User opens Wallet page
   ↓
2. Clicks "Request Withdrawal"
   ↓
3. Fills form:
   - Amount: 5,000 SDG
   - Reason: "Personal expenses"
   - Payment method: Bank Transfer
   - Account details
   ↓
4. Submits request
   ↓
   withdrawal_requests table:
   - status = "pending"
   - amount = 5,000
   - user_id = current user
   ↓
                                   5. Admin navigates to:
                                      "Withdrawal Approval" page
                                      ↓
                                   6. Sees pending request:
                                      - User: Ahmed Hassan
                                      - Amount: 5,000 SDG
                                      - Balance: 6,800 SDG
                                      - Reason: "Personal expenses"
                                      ↓
                                   7. Reviews request:
                                      ✓ Sufficient balance?
                                      ✓ Valid reason?
                                      ✓ Correct payment details?
                                      ↓
                                   8. Admin clicks "Approve"
                                      Adds notes: "Approved - verified account"
                                      ↓
                                   9. System executes:

┌─────────────────────────────────────────────────────────────┐
│          APPROVAL PROCESS (Atomic Transaction)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ A. Check wallet balance (6,800 SDG)                        │
│    - 6,800 >= 5,000? ✓ Yes                                │
│                                                             │
│ B. Update wallet:                                          │
│    balances.SDG = 6,800 - 5,000 = 1,800                   │
│    total_withdrawn = previous + 5,000                       │
│                                                             │
│ C. Create transaction record:                              │
│    type: "withdrawal"                                       │
│    amount: -5,000 (negative!)                              │
│    balance_before: 6,800                                    │
│    balance_after: 1,800                                     │
│    withdrawal_request_id: links to request                  │
│                                                             │
│ D. Update withdrawal request:                              │
│    status: "approved"                                       │
│    supervisor_id: admin's user_id                          │
│    supervisor_notes: "Approved - verified account"         │
│    approved_at: 2025-11-25 15:00:00                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

                                   10. Admin processes payment:
                                       - Bank transfer initiated
                                       - Marks as "paid"
                                       - Uploads receipt (optional)

11. User receives notification
    ↓
12. User checks wallet:
    New balance: 1,800 SDG
    Transaction history shows:
    - "Withdrawal approved: 5,000 SDG"
```

### Withdrawal Statuses

| Status | Description | Can Change To |
|--------|-------------|---------------|
| `pending` | Awaiting admin review | `approved`, `rejected` |
| `approved` | Admin approved, payment pending | N/A (final) |
| `rejected` | Admin rejected request | N/A (final) |
| `cancelled` | User cancelled before approval | N/A (final) |

### Validation Rules

**Balance Check:**
```typescript
// Before creating withdrawal request:
if (requestedAmount > wallet.balances.SDG) {
  throw new Error("Insufficient balance");
}

// Before approving withdrawal:
const currentBalance = wallet.balances.SDG;
if (currentBalance < request.amount) {
  throw new Error("Insufficient wallet balance");
}
```

**Minimum Withdrawal:**
- Configurable per currency
- Default: 1,000 SDG

**Maximum Withdrawal:**
- Cannot exceed current balance
- No other hard limit

---

## Transaction Types

### 1. Site Visit Fee (Earnings)

**When:** Site visit approved and fee calculated  
**Amount:** Positive (+)  
**Affects:** Increases `total_earned` and `balances`

```typescript
{
  type: "site_visit_fee",
  amount: +1500.00,
  description: "Site visit fee - Location XYZ",
  metadata: {
    classification_level: "A",
    base_fee: 1200,
    transport_fee: 300,
    complexity_multiplier: 1.0
  }
}
```

---

### 2. Withdrawal (Payment Out)

**When:** Withdrawal request approved  
**Amount:** Negative (-)  
**Affects:** Increases `total_withdrawn`, decreases `balances`

```typescript
{
  type: "withdrawal",
  amount: -5000.00,
  description: "Withdrawal approved: Personal expenses",
  withdrawal_request_id: "wr-123"
}
```

---

### 3. Adjustment (Manual Correction)

**When:** Admin fixes errors or makes corrections  
**Amount:** Can be positive or negative  
**Affects:** Updates `balances` only

```typescript
{
  type: "adjustment",
  amount: +500.00,
  description: "Correction: Missing site visit fee",
  created_by: "admin-id",
  metadata: {
    reason: "System error - fee not credited",
    corrected_site_visit_id: "sv-456"
  }
}
```

---

### 4. Bonus (Additional Payment)

**When:** Admin awards performance bonus  
**Amount:** Positive (+)  
**Affects:** Increases `total_earned` and `balances`

```typescript
{
  type: "bonus",
  amount: +2000.00,
  description: "Performance bonus - Q4 2025",
  metadata: {
    period: "2025-Q4",
    reason: "Exceeded targets"
  }
}
```

---

### 5. Penalty (Deduction)

**When:** Admin applies penalty for violations  
**Amount:** Negative (-)  
**Affects:** Decreases `balances` only (not `total_earned`)

```typescript
{
  type: "penalty",
  amount: -1000.00,
  description: "Late submission penalty",
  metadata: {
    violation_type: "late_submission",
    site_visit_id: "sv-789",
    days_late: 5
  }
}
```

---

### 6. Retainer (Monthly Payment)

**When:** Monthly retainer auto-credited (if user has retainer)  
**Amount:** Positive (+)  
**Affects:** Increases `total_earned` and `balances`

```typescript
{
  type: "retainer",
  amount: +500.00,
  description: "Monthly retainer - December 2025",
  metadata: {
    period: "2025-12",
    classification_level: "A",
    retainer_frequency: "monthly"
  }
}
```

---

## Classification & Fee Calculation

### How Fees Are Calculated

```javascript
// Step 1: Get user's classification
const userClass = await getUserClassification(userId);
// Result: { level: "A", roleScope: "dataCollector" }

// Step 2: Get active fee structure
const feeStructure = await getActiveFeeStructure(
  userClass.level, 
  userClass.roleScope, 
  "SDG"
);
// Result: { baseFeeCents: 150000, complexityMultiplier: 1.0 }

// Step 3: Calculate total fee
const baseFee = feeStructure.baseFeeCents / 100; // 1,500 SDG
const transportFee = approvedTransportCost; // 300 SDG (from cost submission)
const complexity = siteVisit.complexityMultiplier || 1.0;

const totalFee = (baseFee * complexity) + transportFee;
// = (1,500 × 1.0) + 300
// = 1,800 SDG

// Step 4: Credit wallet
await creditWallet(userId, totalFee, "SDG", {
  type: "site_visit_fee",
  siteVisitId: siteVisit.id,
  metadata: {
    classification_level: userClass.level,
    base_fee: baseFee,
    transport_fee: transportFee,
    complexity_multiplier: complexity
  }
});
```

### Fee Structure Example

| Classification | Role | Base Fee (SDG) | Complex Site (3.0x) |
|---------------|------|----------------|---------------------|
| **Level A** | Data Collector | 1,500 | 4,500 |
| **Level A** | Coordinator | 2,000 | 6,000 |
| **Level A** | Supervisor | 2,500 | 7,500 |
| **Level B** | Data Collector | 1,000 | 3,000 |
| **Level B** | Coordinator | 1,500 | 4,500 |
| **Level B** | Supervisor | 2,000 | 6,000 |
| **Level C** | Data Collector | 500 | 1,500 |
| **Level C** | Coordinator | 800 | 2,400 |
| **Level C** | Supervisor | 1,200 | 3,600 |

---

## Security & Permissions

### Row Level Security (RLS)

**Wallets Table:**
```sql
-- Users can only see their own wallet
CREATE POLICY "Users can view own wallet"
  ON wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can see all wallets
CREATE POLICY "Admins can view all wallets"
  ON wallets FOR SELECT
  USING (auth.role() IN ('admin', 'financial_admin'));
```

**Wallet Transactions:**
```sql
-- Users see only their own transactions
CREATE POLICY "Users view own transactions"
  ON wallet_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins see all transactions
CREATE POLICY "Admins view all transactions"
  ON wallet_transactions FOR SELECT
  USING (auth.role() IN ('admin', 'financial_admin'));

-- Only system can create transactions
CREATE POLICY "System creates transactions"
  ON wallet_transactions FOR INSERT
  USING (auth.role() IN ('admin', 'financial_admin'));
```

**Withdrawal Requests:**
```sql
-- Users can create and view their own requests
CREATE POLICY "Users manage own withdrawals"
  ON withdrawal_requests
  FOR ALL
  USING (auth.uid() = user_id);

-- Admins can approve/reject
CREATE POLICY "Admins manage all withdrawals"
  ON withdrawal_requests
  FOR UPDATE
  USING (auth.role() IN ('admin', 'financial_admin'));
```

### Permission Matrix

| Action | Data Collector | Coordinator | Supervisor | Financial Admin | Admin |
|--------|---------------|-------------|------------|-----------------|-------|
| View own wallet | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all wallets | ❌ | ❌ | ❌ | ✅ | ✅ |
| Request withdrawal | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve withdrawal | ❌ | ❌ | ❌ | ✅ | ✅ |
| Adjust balances | ❌ | ❌ | ❌ | ✅ | ✅ |
| View transactions | ✅ Own | ✅ Own | ✅ Own | ✅ All | ✅ All |
| Export reports | ✅ Own | ✅ Own | ✅ Own | ✅ All | ✅ All |

---

## Summary: Key Points

### For Regular Users:
1. **Earning Money:**
   - Complete site visits → Get automatically paid based on your classification level
   - Higher classification (A > B > C) = higher pay
   - Complex sites pay more (up to 3x multiplier)

2. **Checking Balance:**
   - Go to "Wallet" page
   - See current balance, total earned, total withdrawn
   - View complete transaction history

3. **Withdrawing Money:**
   - Click "Request Withdrawal"
   - Enter amount, reason, payment details
   - Wait for admin approval
   - Receive notification when approved/rejected

### For Admins:
1. **Managing Withdrawals:**
   - Go to "Withdrawal Approval" page
   - Review pending requests
   - Approve or reject with notes
   - Mark as paid after bank transfer

2. **Managing Wallets:**
   - View all user wallets at "Admin Wallets"
   - Adjust balances if needed (with reason)
   - Export financial reports

3. **Setting Fee Structures:**
   - Go to "Classifications" page
   - Assign users to levels (A/B/C)
   - Update fee rates as needed
   - Set retainers for specific users

---

## Related Documentation

- **Full Payment Guide:** `docs/guides/PAYMENT_SYSTEM_GUIDE.md`
- **Cost Submission Guide:** `docs/guides/COST_SUBMISSION_GUIDE.md`
- **Database Schema:** `supabase/migrations/`
- **API Reference:** Check `src/context/wallet/` for implementation

---

**Questions?** Check the `PAYMENT_SYSTEM_GUIDE.md` or contact system administrator.
