# Fee Calculation Guide

## Overview

The PACT Platform uses a classification-based fee structure to calculate enumerator (data collector) compensation. Fees are stored in **cents** in the database and converted to SDG for display.

## Fee Structure Components

### 1. Classification Levels
Users are classified into one of three levels:
- **Level A**: Senior (highest compensation)
- **Level B**: Regular (medium compensation)
- **Level C**: Junior (entry-level compensation)

### 2. Role Scopes
Each classification level has different rates based on role:
- **dataCollector**: Field enumerators collecting site data
- **supervisor**: Team supervisors overseeing data collection
- **coordinator**: Regional coordinators managing operations

### 3. Fee Structure Table

The `classification_fee_structures` table stores:

| Field | Type | Description |
|-------|------|-------------|
| `site_visit_base_fee_cents` | integer | Base fee in cents (e.g., 25000 = 250 SDG) |
| `site_visit_transport_fee_cents` | integer | Transport allowance in cents |
| `complexity_multiplier` | decimal | Multiplier applied to base fee (0.80 - 1.40) |
| `currency` | string | Currency code (SDG) |
| `is_active` | boolean | Whether this fee structure is currently active |

## Fee Calculation Process

### Step 1: Fetch User Classification
When a user initiates a site claim, the system retrieves their active classification:
```sql
SELECT classification_level, role_scope 
FROM user_classifications 
WHERE user_id = ? AND is_active = true
ORDER BY effective_from DESC LIMIT 1
```

### Step 2: Look Up Fee Structure
Based on the user's classification level and role scope, fetch the applicable fee structure:
```sql
SELECT site_visit_base_fee_cents, complexity_multiplier 
FROM classification_fee_structures 
WHERE classification_level = ? 
  AND role_scope = ? 
  AND is_active = true
ORDER BY effective_from DESC LIMIT 1
```

### Step 3: Calculate Enumerator Fee
Apply the complexity multiplier to the base fee and convert from cents to SDG:

```
enumeratorFee = (site_visit_base_fee_cents × complexity_multiplier) / 100
```

### Step 4: Calculate Total Payout
Combine transport budget and enumerator fee:

```
totalPayout = transportBudget + enumeratorFee
```

## Example Calculation

**Scenario**: Level C Junior Data Collector claiming a site

### Fee Structure (from database):
```
site_visit_base_fee_cents: 25000 (250 SDG)
complexity_multiplier: 0.80
transport_fee_cents: 20000 (200 SDG)
```

### Calculation:
```
Base Fee:        25000 cents = 250 SDG
Multiplier:      0.80
Enumerator Fee:  (25000 × 0.80) / 100 = 20000 / 100 = 200 SDG
Transport Budget: 20000 cents = 200 SDG
Total Payout:    200 + 200 = 400 SDG
```

### Display in UI:
```
Transport Budget:    200.00 SDG
Your Collector Fee:  200.00 SDG
─────────────────────────────
Total Payout:        400.00 SDG
```

## Fee Classification Matrix

| Level | Role | Base Fee (SDG) | Transport (SDG) | Multiplier | Effective Fee (SDG) |
|-------|------|---|---|---|---|
| C | Data Collector | 250 | 200 | 0.80 | 200 |
| C | Supervisor | 450 | 300 | 1.00 | 450 |
| C | Coordinator | 350 | 250 | 0.90 | 315 |
| B | Data Collector | 350 | 250 | 1.00 | 350 |
| B | Supervisor | 550 | 350 | 1.20 | 660 |
| B | Coordinator | 450 | 300 | 1.10 | 495 |
| A | Data Collector | 500 | 300 | 1.20 | 600 |
| A | Supervisor | 700 | 400 | 1.40 | 980 |
| A | Coordinator | 600 | 350 | 1.30 | 780 |

## Fallback Behavior

If a user has **no active classification**, the system uses:
- **Default Enumerator Fee**: 50 SDG
- **Fee Source**: 'default'
- **Warning**: User is notified to contact supervisor for proper classification

## Implementation Details

### Code Location
- **Hook**: `src/hooks/use-claim-fee-calculation.ts`
- **Component**: `src/components/site-visit/ClaimSiteButton.tsx`
- **Database**: `classification_fee_structures` table

### Key Functions

#### `useClaimFeeCalculation()`
React hook that handles fee calculation for site claims.

```typescript
const breakdown = await calculateFeeForClaim(siteId, userId);
// Returns: ClaimFeeBreakdown
// {
//   transportBudget: number,
//   enumeratorFee: number,
//   totalPayout: number,
//   classificationLevel: ClassificationLevel | null,
//   roleScope: ClassificationRoleScope | null,
//   feeSource: 'classification' | 'default',
//   currency: 'SDG'
// }
```

#### `calculateEnumeratorFeeForUser(userId)`
Standalone function to calculate fee for a specific user.

```typescript
const { fee, classificationLevel, source } = 
  await calculateEnumeratorFeeForUser(userId);
```

## Currency Conversion

All fees are stored in **cents** in the database:
- **1 SDG = 100 cents**
- **Conversion**: `cents / 100 = SDG`

Example:
- 25000 cents → 250 SDG
- 20000 cents → 200 SDG
- 50 cents → 0.50 SDG

## When Fees Are Applied

1. **Site Claim**: User sees calculated fee in confirmation dialog
2. **Site Visit Completion**: Fee is atomically saved via `claim_site_visit` RPC
3. **Wallet Credit**: Amount is added to user's wallet after completion

## Fee Updates

To modify fee structures:
1. Create a new record in `classification_fee_structures` with updated values
2. Set `is_active = true` on the new record
3. Set `is_active = false` on the old record
4. Changes take effect immediately for new claims

## Troubleshooting

### Issue: Fee seems too high/low
**Solution**: Check user's classification level and role scope in `user_classifications` table

### Issue: User seeing default fee (50 SDG)
**Solution**: Ensure user has an active classification record with `is_active = true`

### Issue: Fee calculation doesn't match expected value
**Solution**: Verify the `complexity_multiplier` and `site_visit_base_fee_cents` in the applicable fee structure record
