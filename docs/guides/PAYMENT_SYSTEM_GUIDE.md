# PACT Platform - Payment System Guide

**Version:** 1.0  
**Last Updated:** November 23, 2025  
**Platform:** PACT Workflow Platform (Planning, Approval, Coordination, and Tracking)

---

## Table of Contents

1. [Overview](#overview)
2. [Payment Flow Architecture](#payment-flow-architecture)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Management Pages](#management-pages)
5. [Transaction Types](#transaction-types)
6. [Fee Calculation System](#fee-calculation-system)
7. [Withdrawal Process](#withdrawal-process)
8. [Admin Operations](#admin-operations)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)
11. [Security & Compliance](#security--compliance)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The PACT Payment System manages financial operations for field teams, including:
- **Automated fee calculation** based on classification levels
- **Wallet management** with multi-currency support
- **Withdrawal request workflows** with approval chains
- **Cost submission tracking** for site visits
- **Budget allocation and monitoring**
- **Real-time transaction history** and auditing

### Key Features

✅ **Automatic Fee Calculation** - Based on classification level + complexity multiplier  
✅ **Transport Fee Validation** - Only calculated from approved site visits (database-enforced)  
✅ **Multi-Currency Support** - SDG, USD, EUR, GBP, SAR, AED  
✅ **Audit Trail** - Complete transaction history with balance snapshots  
✅ **Search & Filter** - Advanced filtering by date, type, amount, status  
✅ **Export Capabilities** - CSV/PDF/Excel reports  
✅ **Real-time Updates** - Instant wallet synchronization via Supabase Realtime  

---

## Payment Flow Architecture

### End-to-End Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAYMENT WORKFLOW                            │
└─────────────────────────────────────────────────────────────────┘

1. FIELD WORK
   ↓
   Data Collector completes site visit
   ↓
   Site visit marked as "completed"

2. COST SUBMISSION
   ↓
   Field staff submits costs (transport, meals, accommodation)
   ↓
   Cost submission enters "pending" status

3. ADMIN REVIEW
   ↓
   Financial Admin reviews submission
   ↓
   Admin approves/rejects with notes

4. FEE CALCULATION (if approved)
   ↓
   System calculates fee:
   - Classification Level (A/B/C)
   - Role Scope (Coordinator/Data Collector/Supervisor)
   - Complexity Multiplier (1.0 - 3.0)
   - Approved Transport Costs
   ↓
   Total Fee = (Base Fee × Complexity) + Transport

5. WALLET CREDIT
   ↓
   Fee added to user's wallet
   ↓
   Transaction record created
   ↓
   Balance updated in real-time

6. WITHDRAWAL REQUEST
   ↓
   User requests withdrawal (minimum threshold applies)
   ↓
   Request enters "pending" status

7. WITHDRAWAL APPROVAL
   ↓
   Financial Admin reviews request
   ↓
   Admin approves/rejects with notes

8. PAYMENT PROCESSING
   ↓
   If approved: Funds transferred to user
   ↓
   Transaction marked as "completed"
   ↓
   Wallet balance deducted
```

### Business Rules (Database-Enforced)

1. **Transport fees MUST be linked to an approved site visit**
   - Statuses: `approved`, `approved_stage_one`, `approved_stage_two`, `completed`, `closed`
   - Database trigger validates and rejects invalid transport costs
   
2. **Fee structures contain ONLY base fees**
   - No transport fees stored in fee structure tables
   - Transport costs calculated separately from site visits

3. **Withdrawal minimum thresholds**
   - Configurable per currency
   - Default: SDG 500

4. **Balance integrity**
   - All transactions include `balance_before` and `balance_after`
   - Prevents race conditions and ensures audit trail

---

## User Roles & Permissions

### Role Matrix

| Role | View Wallet | Request Withdrawal | Approve Withdrawal | View All Wallets | Adjust Balances | Manage Budgets |
|------|-------------|-------------------|-------------------|------------------|-----------------|----------------|
| **Data Collector** | ✅ Own | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Coordinator** | ✅ Own | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Supervisor** | ✅ Own | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Financial Admin** | ✅ All | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ All | ✅ | ✅ | ✅ | ✅ | ✅ |
| **ICT** | ✅ All | ✅ | ✅ | ✅ | ✅ | ✅ |
| **FOM** | ✅ All | ✅ | ✅ | ✅ | ✅ | ✅ |

### Permission Keys

- **finances:read** - View financial data
- **finances:create** - Create transactions/budgets
- **finances:update** - Modify financial records
- **finances:approve** - Approve withdrawals/cost submissions
- **wallets:manage** - Full wallet management access

---

## Management Pages

### 1. 📱 Wallet Page (`/wallet`)

**Purpose:** Individual user's financial dashboard

**Features:**
- **Overview Tab**
  - Current balance (by currency)
  - Total earned (lifetime)
  - Total withdrawn
  - Pending withdrawal amount
  - Success rate statistics
  - Monthly earnings chart
  
- **Transactions Tab**
  - Filterable transaction history
  - Search by description, ID, site visit
  - Filter by type, date range, amount
  - Export to CSV
  - Balance before/after display
  
- **Withdrawals Tab**
  - Create new withdrawal request
  - View pending/approved/rejected requests
  - Cancel pending requests
  - Track payment status

**Access:** All authenticated users (own wallet only)

**Navigation:** Main menu → "Wallet" or `/wallet`

---

### 2. ✅ Withdrawal Approval (`/withdrawal-approval`)

**Purpose:** Admin approval/rejection of withdrawal requests

**Features:**
- **Pending Requests**
  - List of all pending withdrawal requests
  - User details (name, role, classification)
  - Request amount and reason
  - Payment method preferences
  - Approve with optional notes
  - Reject with required explanation
  
- **Approved Requests**
  - Historical record of approved withdrawals
  - Approval date and approver
  - Payment completion status
  
- **Rejected Requests**
  - Historical record of rejections
  - Rejection reasons and notes

**Actions:**
- `Approve Withdrawal` - Grant request with optional notes
- `Reject Withdrawal` - Decline with explanation (required)
- `View User Wallet` - Navigate to user's wallet detail

**Access:** Financial Admin, Admin, ICT, FOM

**Navigation:** Admin menu → "Withdrawal Approval" or `/withdrawal-approval`

---

### 3. 💼 Financial Operations (`/financial-operations`)

**Purpose:** Comprehensive financial management dashboard

**Features:**
- **Overview Tab**
  - Total budget allocated
  - Total spent
  - Pending approvals count
  - Active classifications
  - Budget utilization charts
  
- **Cost Submissions Tab**
  - Review field cost submissions
  - View submission details (transport, meals, accommodation)
  - Approve/reject with notes
  - Link to related site visit
  - Cost breakdown by category
  
- **Workflow Rail**
  - Visual workflow progress
  - Stage indicators (submission → review → approval → payment)
  - Status badges and timestamps

**Actions:**
- `Review Cost Submission` - View details and approve/reject
- `View Site Visit` - Navigate to related site visit
- `Export Report` - Generate financial reports

**Access:** Financial Admin, Admin, ICT, FOM

**Navigation:** Admin menu → "Financial Operations" or `/financial-operations`

---

### 4. 💳 Budget Management (`/budget`)

**Purpose:** Project and MMP budget allocation and tracking

**Features:**
- **Overview Tab**
  - Total allocated budget
  - Total spent
  - Available balance
  - Budget alerts (overspending warnings)
  - Utilization percentage
  
- **Project Budgets Tab**
  - Create project budgets
  - Allocate funds per project
  - Track spending vs allocation
  - Top-up budgets
  - View transaction history
  
- **MMP Budgets Tab**
  - Create MMP-specific budgets
  - Monthly allocation tracking
  - Per-visit cost monitoring
  - Budget expiration management

**Actions:**
- `Create Budget` - Set allocation for project/MMP
- `Top-up Budget` - Add additional funds
- `View Transactions` - Budget expenditure history
- `Export` - Generate PDF/Excel/CSV reports
- `Acknowledge Alert` - Mark budget warnings as reviewed

**Access:** Financial Admin, Admin, FOM

**Navigation:** Admin menu → "Budget" or `/budget`

---

### 5. 👥 Admin Wallet Detail (`/admin-wallet/{userId}`)

**Purpose:** Admin view and management of individual user wallets

**Features:**
- **Wallet Summary**
  - User information (name, role, classification)
  - Current balance (all currencies)
  - Total earned (lifetime)
  - Total withdrawn
  - Wallet creation date
  
- **Transaction History**
  - Complete transaction log
  - Type, amount, date, description
  - Balance snapshots (before/after)
  - Related entities (site visits, withdrawals)
  
- **Manual Adjustments**
  - Credit wallet (add funds)
  - Debit wallet (deduct funds)
  - Reason required for audit trail
  - Adjustment type (bonus, penalty, correction)

**Actions:**
- `Adjust Balance` - Manual credit/debit with reason
- `View Transaction` - Detailed transaction information
- `Export History` - Generate transaction report

**Access:** Financial Admin, Admin, ICT

**Navigation:** Users page → Click user → "View Wallet" or direct `/admin-wallet/{userId}`

---

## Transaction Types

### Core Transaction Types

| Type | Direction | Description | Example Use Case |
|------|-----------|-------------|------------------|
| `site_visit_fee` | **Credit** (+) | Earnings from completed site visits | Field visit completed, fee calculated and credited |
| `withdrawal` | **Debit** (-) | Approved withdrawal request | User withdrew SDG 5,000 to bank account |
| `adjustment` | **Credit/Debit** (±) | Manual admin correction | Admin corrected erroneous deduction |
| `bonus` | **Credit** (+) | Performance reward | Excellent work quality bonus |
| `penalty` | **Debit** (-) | Deduction for violations | Late submission penalty |
| `retainer` | **Credit** (+) | Monthly fixed payment | Monthly retainer for Level A staff |

### Transaction Status Flow

```
site_visit_fee:
  pending → posted → completed

withdrawal:
  pending → approved → processing → completed
         ↘ rejected

adjustment:
  posted (immediate)

bonus/penalty:
  posted (immediate)

retainer:
  scheduled → posted → completed
```

### Transaction Metadata

Every transaction includes:

```json
{
  "id": "uuid",
  "walletId": "uuid",
  "userId": "uuid",
  "type": "site_visit_fee | withdrawal | adjustment | bonus | penalty | retainer",
  "amount": 25000.00,
  "currency": "SDG",
  "balanceBefore": 10000.00,
  "balanceAfter": 35000.00,
  "description": "Site Visit #SV-001 - Khartoum North",
  "siteVisitId": "uuid (optional)",
  "withdrawalRequestId": "uuid (optional)",
  "createdBy": "uuid (for adjustments)",
  "createdAt": "2025-11-23T10:30:00Z",
  "metadata": {
    "classificationLevel": "A",
    "complexityMultiplier": 1.5,
    "transportCost": 500.00
  }
}
```

---

## Fee Calculation System

### Classification-Based Fees

Fees are calculated using the following formula:

```
Total Fee = (Base Fee × Complexity Multiplier) + Transport Cost
```

### Fee Structure Example

| Level | Role | Base Fee (SDG) | Multiplier Range | Transport |
|-------|------|----------------|------------------|-----------|
| **A** (Senior) | Coordinator | 10,000 | 1.0 - 3.0 | From site visit |
| **A** (Senior) | Data Collector | 8,000 | 1.0 - 3.0 | From site visit |
| **B** (Regular) | Coordinator | 7,000 | 1.0 - 2.5 | From site visit |
| **B** (Regular) | Data Collector | 5,000 | 1.0 - 2.5 | From site visit |
| **C** (Junior) | Data Collector | 3,000 | 1.0 - 2.0 | From site visit |

### Complexity Multipliers

| Multiplier | Description | Use Case |
|------------|-------------|----------|
| **1.0** | Standard | Normal site visit |
| **1.5** | Moderate | Remote location or complex data |
| **2.0** | High | Difficult terrain or extensive data collection |
| **2.5** | Very High | Hazardous conditions or specialized skills |
| **3.0** | Maximum | Extreme conditions or expert-level work |

### Transport Cost Calculation

Transport costs are **only** calculated from approved site visits:

1. **Site visit must be in approved status:**
   - `approved`
   - `approved_stage_one`
   - `approved_stage_two`
   - `completed`
   - `closed`

2. **Transport cost submission must include:**
   - Actual distance traveled
   - Mode of transportation
   - Receipt/justification
   - Admin approval

3. **Database trigger validates:**
   - Site visit exists
   - Site visit status is valid
   - Cost submission links correctly

### Example Calculation

**Scenario:** Level A Coordinator completes complex site visit

```
Base Fee (Level A, Coordinator):     SDG 10,000
Complexity Multiplier:               × 1.5
Subtotal:                            = SDG 15,000

Approved Transport Cost:             + SDG 1,200
─────────────────────────────────────────────
TOTAL FEE:                           SDG 16,200
```

**Transaction Created:**
- Type: `site_visit_fee`
- Amount: 16,200 SDG
- Description: "Site Visit #SV-123 - Omdurman Complex Survey"
- Metadata: `{ level: "A", role: "Coordinator", complexity: 1.5, transport: 1200 }`

---

## Withdrawal Process

### User Withdrawal Flow

**Step 1: Check Eligibility**
- Minimum balance threshold met (default: SDG 500)
- No pending withdrawal requests
- Account in good standing

**Step 2: Create Request**
```
Navigate to: Wallet → Withdrawals Tab → "Request Withdrawal"

Required Information:
- Amount (must be ≤ current balance)
- Reason for withdrawal
- Payment method (Bank Transfer, Mobile Money, etc.)
```

**Step 3: Wait for Approval**
- Request enters "pending" status
- Financial Admin receives notification
- User can track status in Withdrawals tab

**Step 4: Receive Decision**
- **Approved:** Funds processed, balance deducted
- **Rejected:** Balance unchanged, reason provided
- Email/SMS notification sent (if configured)

### Admin Approval Flow

**Step 1: Review Request (Finance Processing Page)**
```
Navigate to: Finance Approval → Ready Tab

Each request card displays:
- User details (name, role, classification)
- Requested amount (large, prominent)
- **Current wallet balance** (color-coded)
- Balance status indicator:
  • Green: Sufficient funds
  • Red: Insufficient funds with shortfall amount
- Withdrawal history
- Request reason
- Urgency indicators (1+ day, 2+ days, 3+ days)
```

**Step 2: Check Wallet Balance**

The Finance Processing page now shows each user's wallet balance:

| Indicator | Meaning |
|-----------|---------|
| Green background | User has sufficient balance to process |
| Red background | Insufficient funds - shows shortfall amount |
| Tooltip | Hover for detailed balance info |

**Example Insufficient Balance Alert:**
```
Insufficient wallet balance!
User has SDG 130,110 but requested SDG 200,000.
Shortfall: SDG 69,890
```

**Step 3: Make Decision**

**To Approve (Sufficient Balance):**
1. Verify green balance indicator
2. Click "Process Payment" button
3. Enter transaction reference number (optional)
4. Attach receipt/screenshot (optional - drag & drop or click to upload)
5. Add notes (e.g., "Approved - bank transfer initiated")
6. Confirm approval
7. System deducts balance and creates withdrawal transaction

**To Reject:**
1. Click "Reject" button
2. Add required explanation (e.g., "Insufficient wallet balance" or "Invalid documentation")
3. Confirm rejection
4. User notified with reason

**Step 4: Receipt Attachment**
- Supports image files (JPG, PNG, etc.)
- Maximum 5MB file size
- Preview before submitting
- Receipt URL saved to audit trail
- Visible in transaction history

**Step 5: Batch Processing (Multiple Payments)**
1. Select multiple requests using checkboxes
2. Click "Batch Process" button
3. Enter batch transaction reference
4. Add common notes
5. Process all selected simultaneously
6. Results summary shows success/failure count

### Withdrawal Limits & Rules

| Parameter | Default Value | Configurable |
|-----------|---------------|--------------|
| Minimum Withdrawal | SDG 500 | ✅ Yes |
| Maximum Withdrawal | Current Balance | ❌ No |
| Pending Limit | 1 request | ✅ Yes |
| Processing Time | 3-5 business days | ℹ️ Manual |

---

## Admin Operations

### Manual Balance Adjustment

**Use Cases:**
- Correct accounting errors
- Apply bonuses/penalties
- Refund incorrect deductions
- Handle edge cases

**Process:**
```
Navigate to: Admin Wallet Detail → "Adjust Balance"

Required Fields:
- Direction: Credit (+) or Debit (-)
- Amount: Positive number
- Reason: Detailed explanation (required for audit)
- Type: adjustment | bonus | penalty
```

**Example - Apply Bonus:**
```json
{
  "direction": "credit",
  "amount": 2000,
  "reason": "Performance bonus for Q4 2025 - exceeded targets",
  "type": "bonus"
}
```

**Result:**
- Transaction created with type `bonus`
- Balance updated immediately
- Audit log entry created
- User receives notification

### Bulk Operations

**Process Monthly Retainers:**
```javascript
// Financial Admin or Admin only
await processMonthlyRetainers();

// Returns:
{
  processed: 45,  // Successfully processed
  failed: 2,      // Failed to process
  total: 47       // Total eligible users
}
```

**Export Financial Reports:**
- Navigate to Budget or Financial Operations
- Click "Export" button
- Select format: PDF, Excel, CSV
- Choose date range and filters
- Download generated report

---

## Database Schema

### Tables Overview

```sql
-- User Wallets
wallets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  balances JSONB DEFAULT '{"SDG": 0}',
  total_earned NUMERIC(12,2) DEFAULT 0,
  total_withdrawn NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Wallet Transactions
wallet_transactions (
  id UUID PRIMARY KEY,
  wallet_id UUID REFERENCES wallets(id),
  user_id UUID REFERENCES profiles(id),
  type TEXT CHECK (type IN ('site_visit_fee', 'withdrawal', 'adjustment', 'bonus', 'penalty', 'retainer')),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'SDG',
  balance_before NUMERIC(12,2),
  balance_after NUMERIC(12,2),
  site_visit_id UUID REFERENCES site_visits(id),
  withdrawal_request_id UUID REFERENCES withdrawal_requests(id),
  description TEXT,
  metadata JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
)

-- Withdrawal Requests
withdrawal_requests (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  wallet_id UUID REFERENCES wallets(id),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'SDG',
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  request_reason TEXT,
  supervisor_id UUID REFERENCES profiles(id),
  supervisor_notes TEXT,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  payment_method TEXT,
  payment_details JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Site Visit Cost Submissions
site_visit_cost_submissions (
  id UUID PRIMARY KEY,
  site_visit_id UUID REFERENCES site_visits(id),
  submitted_by UUID REFERENCES profiles(id),
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  transport_cost NUMERIC(12,2),
  accommodation_cost NUMERIC(12,2),
  meal_allowance NUMERIC(12,2),
  other_costs NUMERIC(12,2),
  total_cost NUMERIC(12,2),
  currency TEXT DEFAULT 'SDG',
  receipts JSONB,
  notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
)

-- Classification Fee Structures
classification_fee_structures (
  id UUID PRIMARY KEY,
  classification_level TEXT CHECK (classification_level IN ('A', 'B', 'C')),
  role_scope TEXT,
  site_visit_base_fee_cents INTEGER NOT NULL,
  -- NO transport fee stored here (business rule)
  complexity_multiplier NUMERIC(3,2) DEFAULT 1.0,
  currency TEXT DEFAULT 'SDG',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

### Database Triggers

**Transport Cost Validation Trigger:**

```sql
CREATE OR REPLACE FUNCTION validate_transport_cost()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure transport costs are only linked to approved site visits
  IF NEW.site_visit_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM site_visits 
      WHERE id = NEW.site_visit_id 
      AND status IN ('approved', 'approved_stage_one', 'approved_stage_two', 'completed', 'closed')
    ) THEN
      RAISE EXCEPTION 'Transport costs can only be submitted for approved site visits';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_transport_before_insert
  BEFORE INSERT OR UPDATE ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION validate_transport_cost();
```

### Row Level Security (RLS) Policies

**Cost Submissions:**

```sql
-- Users can only view their own submissions
CREATE POLICY "Users view own submissions"
  ON site_visit_cost_submissions
  FOR SELECT
  USING (submitted_by = auth.uid());

-- Admins can view all submissions
CREATE POLICY "Admins view all submissions"
  ON site_visit_cost_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'financial_admin', 'ict', 'fom')
    )
  );

-- Users can create their own submissions
CREATE POLICY "Users create own submissions"
  ON site_visit_cost_submissions
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Only admins can update submissions
CREATE POLICY "Admins update submissions"
  ON site_visit_cost_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'financial_admin', 'ict')
    )
  );
```

---

## API Reference

### Wallet Context API

```typescript
import { useWallet } from '@/context/wallet/WalletContext';

const {
  // State
  wallet,                    // Current user's wallet
  transactions,              // Transaction history
  withdrawalRequests,        // Withdrawal requests
  stats,                     // Wallet statistics
  loading,                   // Loading state
  
  // Actions
  refreshWallet,             // Reload wallet data
  refreshTransactions,       // Reload transactions
  refreshWithdrawalRequests, // Reload withdrawal requests
  createWithdrawalRequest,   // Create new withdrawal
  cancelWithdrawalRequest,   // Cancel pending withdrawal
  approveWithdrawalRequest,  // Approve withdrawal (admin)
  rejectWithdrawalRequest,   // Reject withdrawal (admin)
  getBalance,                // Get balance for currency
  
  // Site Visit Fees
  addSiteVisitFeeToWallet,   // Credit fee to wallet
  calculateClassificationFee, // Calculate fee amount
  
  // Admin Operations
  listWallets,               // Get all wallets (admin)
} = useWallet();
```

### Cost Submission API

```typescript
import { useCostSubmissions } from '@/context/costApproval/CostSubmissionContext';

const {
  // Queries
  submissions,               // All cost submissions
  isLoading,                 // Loading state
  refetch,                   // Reload submissions
  
  // Mutations
  createSubmission,          // Create cost submission
  updateSubmission,          // Update submission
  reviewSubmission,          // Approve/reject (admin)
  markPaid,                  // Mark as paid (admin)
  cancelSubmission,          // Cancel submission
  deleteSubmission,          // Delete pending submission
} = useCostSubmissions();
```

### Example: Create Withdrawal Request

```typescript
const { createWithdrawalRequest } = useWallet();

await createWithdrawalRequest(
  5000,                      // amount
  "Salary payment",          // reason
  "Bank Transfer"            // payment method
);
```

### Example: Approve Withdrawal

```typescript
const { approveWithdrawalRequest } = useWallet();

await approveWithdrawalRequest(
  "withdrawal-uuid",         // request ID
  "Approved - transfer initiated on 2025-11-23" // notes
);
```

### Example: Calculate Fee

```typescript
const { calculateClassificationFee } = useWallet();

const fee = await calculateClassificationFee(
  "user-uuid",               // user ID
  1.5                        // complexity multiplier
);

console.log(`Calculated fee: SDG ${fee / 100}`);
```

---

## Security & Compliance

### Access Control

1. **Row Level Security (RLS)**
   - Users can only view their own wallets
   - Admins can view all wallets
   - Database-level enforcement

2. **Role-Based Permissions**
   - Granular permission checks
   - Action-based authorization
   - Context-aware access control

3. **Audit Trail**
   - All transactions logged
   - Balance snapshots preserved
   - Admin actions tracked with user ID

### Data Protection

1. **Sensitive Data Handling**
   - Payment details encrypted in transit
   - Bank account numbers masked in UI
   - PII (Personal Identifiable Information) protected

2. **Transaction Integrity**
   - Atomic operations
   - Balance before/after validation
   - Rollback on failure

3. **Fraud Prevention**
   - Withdrawal limits
   - Suspicious activity detection
   - Admin review required for large amounts

### Compliance

1. **Financial Regulations**
   - Transaction record retention
   - Audit log preservation
   - Regulatory reporting capabilities

2. **Data Privacy (GDPR/PDPA)**
   - User data export
   - Right to deletion (with constraints)
   - Consent management

---

## Troubleshooting

### Common Issues

#### 1. Withdrawal Request Rejected

**Symptoms:**
- Withdrawal request immediately rejected
- Error message: "Insufficient balance"

**Solutions:**
- Verify current balance ≥ requested amount
- Check for pending withdrawal requests
- Ensure minimum threshold met (SDG 500)
- Contact financial admin if balance appears incorrect

---

#### 2. Transport Cost Validation Error

**Symptoms:**
- Error: "Transport costs can only be submitted for approved site visits"
- Cost submission rejected

**Solutions:**
- Verify site visit status is in: `approved`, `approved_stage_one`, `approved_stage_two`, `completed`, or `closed`
- Wait for site visit approval before submitting costs
- Contact supervisor to approve site visit first

---

#### 3. Missing Transaction

**Symptoms:**
- Site visit completed but fee not credited
- Expected transaction not appearing in wallet

**Solutions:**
1. Check site visit status (must be `completed`)
2. Verify cost submission was approved
3. Refresh wallet data (pull-to-refresh or click refresh button)
4. Check transaction filters (may be filtering out the transaction)
5. Contact admin if transaction still missing after 24 hours

---

#### 4. Balance Discrepancy

**Symptoms:**
- Displayed balance doesn't match expected amount
- Balance before/after values inconsistent

**Solutions:**
1. Export transaction history (CSV)
2. Calculate running total manually
3. Identify discrepancy transaction
4. Contact financial admin with:
   - Transaction IDs
   - Expected vs actual balance
   - Screenshot of discrepancy

Admin will create `adjustment` transaction to correct balance if error confirmed.

---

#### 5. Fee Calculation Incorrect

**Symptoms:**
- Site visit fee amount unexpected
- Calculation doesn't match classification level

**Solutions:**
1. Verify classification level at time of site visit
2. Check complexity multiplier applied
3. Review transport cost approval
4. Formula: `(Base Fee × Multiplier) + Transport`

Example verification:
```
Level A Coordinator Base: SDG 10,000
Complexity: 1.5
Transport: SDG 1,200

Expected: (10,000 × 1.5) + 1,200 = 16,200
```

If calculation still incorrect, contact admin with site visit ID.

---

### Support Escalation

**Level 1 - User Support:**
- Check documentation
- Verify account settings
- Review transaction history

**Level 2 - Supervisor:**
- Classification issues
- Site visit approvals
- Basic financial queries

**Level 3 - Financial Admin:**
- Balance adjustments
- Withdrawal approvals
- Budget allocations

**Level 4 - System Admin:**
- Database issues
- Integration errors
- Bug reports

---

## Appendix

### Glossary

- **Classification Level:** User tier (A/B/C) determining base fee
- **Complexity Multiplier:** Adjustment factor for site visit difficulty
- **Retainer:** Fixed monthly payment for senior staff
- **Site Visit Fee:** Earnings from completed field work
- **Transport Cost:** Approved travel expenses from site visit
- **Wallet:** Virtual account holding user's balance
- **Withdrawal Request:** User request to transfer funds out

### Currency Codes

| Code | Currency | Country |
|------|----------|---------|
| SDG | Sudanese Pound | Sudan |
| USD | US Dollar | United States |
| EUR | Euro | European Union |
| GBP | British Pound | United Kingdom |
| SAR | Saudi Riyal | Saudi Arabia |
| AED | UAE Dirham | United Arab Emirates |

### System Limits

| Parameter | Value |
|-----------|-------|
| Max Complexity Multiplier | 3.0 |
| Min Withdrawal (SDG) | 500 |
| Transaction Retention | Unlimited |
| Export Batch Size | 10,000 records |
| Real-time Update Delay | <2 seconds |

---

## Contact & Support

**Technical Support:** Contact your system administrator  
**Financial Queries:** Contact Financial Admin team  
**Documentation Updates:** Submit via GitHub Issues

**Last Reviewed:** November 23, 2025  
**Next Review:** December 23, 2025

---

*This document is maintained by the PACT Platform development team. For updates or corrections, please submit a pull request.*
