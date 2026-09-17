# Incentive Bonuses System — Full Implementation Plan

## 1. Purpose

The Incentive Bonuses system rewards eligible field and management staff based on measurable MMP delivery results.

The system must:

- Calculate bonuses from verified MMP results.
- Use configurable eligibility and percentage rules.
- Prevent the browser from choosing payment amounts or recipients.
- Preserve the exact calculation evidence used for every bonus.
- Approve bonuses through the MMP close process.
- Pay approved bonuses through Wallet or Payroll.
- Prevent duplicate calculation and duplicate payment.
- Support safe reversals and financial reconciliation.
- Enforce organization, state, hub, and role permissions.
- Provide reports for staff, Finance, and administrators.

---

## 2. Current System Summary

The project already contains a substantial Incentive Bonuses implementation.

### Main user interfaces

- `/incentives` — Incentive overview and personal incentive area.
- `/mmp/incentive-settings` — Incentive configuration and monthly reports.
- MMP detail → **Incentives** tab — calculation, pre-approval, payment, reversal, and export.

### Main database records

- `incentive_configs` — active calculation settings.
- `mmp_incentive_snapshots` — immutable calculation summary for an MMP.
- `mmp_incentive_payments` — recipient-level bonus amounts and statuses.
- `mmp_incentive_settlements` — immutable Wallet or Payroll settlement evidence.
- `mmp_incentive_eligibility_overrides` — administrator eligibility inclusions and exclusions.

### Main server operations

- Calculate and pre-approve MMP incentives.
- Close the MMP and lock approved incentives.
- Pay an approved incentive through Wallet or Payroll.
- Reverse a supported incentive settlement.
- Add or revoke eligibility overrides.
- Retrieve personal incentive payments.
- Produce monthly incentive reports.

---

## 3. Roles Covered by the Bonus Rules

The current calculation model supports four configurable roles:

1. **Coordinator**
2. **Supervisor**
3. **Field Operations Manager**
4. **Support**

Each role rule should define:

- Whether the role is active.
- Percentage of the eligible fee pool.
- Allocation method.
- Required scope.
- Minimum coverage threshold.
- Included role labels and classifications.
- Exclusion rules.

### Default configuration currently represented in the UI

| Role | Default percentage | Allocation |
|---|---:|---|
| Coordinator | 10% | Proportional |
| Supervisor | 7% | Equal |
| Field Operations Manager | 5% | Equal |
| Support | 0% / inactive | Equal |

These defaults must remain configuration values rather than permanent business rules.

---

## 4. Authoritative Calculation Model

All monetary calculations must happen in the database.

The browser may send:

- MMP ID
- Requested operation
- Optional reviewed settings or override references

The browser must not submit:

- Final fee pool
- Final recipient list
- Final recipient amounts
- Coverage totals
- Eligibility evidence
- Paid amount

The database must derive these values from trusted records.

### Monetary precision

All incentive calculations should use integer minor units:

```text
100 SDG = 10,000 cents
```

This prevents floating-point differences between:

- Browser preview
- Database calculation
- Excel export
- Wallet settlement
- Payroll settlement
- Financial reconciliation

### Calculation sequence

1. Lock the selected MMP calculation scope.
2. Confirm that the MMP exists and is eligible.
3. Confirm that the MMP is not archived, historical, reversed, or already paid.
4. Load the active incentive configuration.
5. Determine which MMP sites count.
6. Calculate total and qualifying site counts.
7. Calculate the coverage percentage.
8. Confirm that the configured threshold is met.
9. Resolve the MMP's canonical hub and state structure.
10. Resolve eligible users for each configured role.
11. Apply active eligibility overrides.
12. Calculate each role's bonus pool.
13. Allocate each pool to eligible recipients.
14. Distribute rounding remainders deterministically.
15. Validate that allocated totals equal the calculated pools.
16. Store the calculation snapshot and recipient payments atomically.

If any validation fails, the entire calculation must roll back.

---

## 5. WFP and MMP Eligibility Basis

The configuration contains a `what_counts` rule.

### WFP-confirmed basis

Only MMP site entries with authoritative WFP confirmation should count.

The current canonical implementation uses:

```text
mmp_site_entries.verified_by IS NOT NULL
```

This definition must be standardized across:

- Database calculation
- Browser preview
- Reports
- Excel and PDF exports
- Tests

Older status-text interpretations must not remain active in parallel.

### Submitted basis

When the configuration uses `submitted`, all eligible MMP site entries count, subject to archive and validity rules.

### Coverage formula

```text
coverage percentage =
qualifying site count / total eligible MMP site count × 100
```

The default UI threshold is currently 70%, but the database configuration must be authoritative.

### Calculation blocking conditions

Calculation should fail closed when:

- The MMP has no eligible sites.
- The MMP is archived.
- The MMP predates the configured activation date.
- Hub or state mapping is unresolved.
- Role identity is ambiguous.
- A coordinator cannot be mapped to a valid state.
- Coverage is below the configured threshold.
- The MMP is already locked.
- A paid or reversed snapshot already exists.

---

## 6. Role Eligibility

Eligibility must be derived from trusted identity records:

- Primary profile role
- Additional roles
- Active user classifications
- Canonical hub and state assignments
- Active administrator overrides

### Coordinator allocation

Coordinator eligibility should be state-aware within the MMP's canonical hub.

For proportional allocation:

```text
recipient bonus =
role pool × recipient qualifying sites / all qualifying sites for that role
```

### Supervisor allocation

Supervisors should be resolved within the authorized hub and receive an equal allocation unless configuration specifies otherwise.

### Field Operations Manager allocation

Field Operations Managers should be resolved from the canonical hub assignment and receive the configured allocation.

### Support allocation

Support staff participate only when:

- The Support rule is active.
- Its percentage is greater than zero.
- At least one eligible Support recipient is resolved.

### Ambiguity handling

The system must not guess when:

- Multiple conflicting states are assigned.
- A user has conflicting active classifications.
- A role is present without a required hub or state.
- Multiple canonical identities resolve to the same responsibility.

The calculation should stop and show an actionable explanation.

---

## 7. Eligibility Overrides

Administrators need controlled exceptions for unusual staffing arrangements.

An override must contain:

- MMP
- User
- Incentive role
- Include or exclude decision
- Reason
- Creator
- Creation time
- Optional expiry or revocation details

### Override rules

- Only authorized administrators may create or revoke overrides.
- A reason is mandatory.
- Coordinator overrides require a valid mapped state.
- Only one active override should exist for the same MMP, user, and role.
- Revocation should preserve the original record.
- Overrides used in a calculation must be copied into the calculation evidence.

Changing an override after calculation must not rewrite an existing snapshot.

---

## 8. Allocation and Rounding

Each role pool should be calculated independently.

```text
role pool = eligible fee pool × configured role percentage
```

### Equal allocation

```text
base amount = floor(role pool / recipient count)
remainder = role pool - base amount × recipient count
```

Allocate the remainder deterministically using a stable recipient order.

### Proportional allocation

Calculate each recipient's exact proportional share, floor the minor-unit amount, and distribute the remaining minor units using a deterministic largest-remainder method.

### Required invariants

For every role:

```text
sum(recipient amounts) = role pool
```

For the whole snapshot:

```text
sum(all role pools) = sum(all recipient payments)
```

No payment row may contain a negative amount.

---

## 9. Snapshot and Evidence

The calculation result must be stored as immutable evidence.

### Snapshot evidence

Store:

- MMP ID and name
- Configuration version
- Calculation currency
- Total site count
- Qualifying site count
- Coverage percentage
- Eligible fee pool
- Role percentages
- Role pool totals
- Role recipient counts
- Calculation basis
- Calculation timestamp
- Calculated by
- Eligibility evidence
- Applied overrides
- Canonical hub and state resolution

### Recipient evidence

For each recipient, store:

- User ID
- Resolved role
- Canonical hub
- Canonical states
- Qualifying site count
- Allocation method
- Calculated amount
- Currency
- Eligibility sources
- Override evidence
- Payment status

Historical snapshots must not be recalculated from current profile roles.

---

## 10. Bonus Lifecycle

Recommended lifecycle:

```text
draft preview
→ pre-approved
→ approved and locked
→ paid
→ reversed, when supported
```

### Preview

The preview should come from the same authoritative server calculation used for pre-approval.

The UI should not maintain a separate mathematical implementation.

### Pre-approval

An authorized Admin or Financial Admin requests calculation and pre-approval.

The server:

- Validates the MMP.
- Calculates all amounts.
- Stores the immutable snapshot.
- Stores recipient payment rows.
- Marks the snapshot as pre-approved.

### Approval and locking

The current workflow promotes eligible pre-approved bonuses during MMP Cycle Close.

At close:

- The calculation is checked again for lifecycle consistency.
- The snapshot becomes approved.
- The snapshot is locked.
- Recipient payment rows become available to Finance.

If the MMP closes without a valid bonus calculation, the close workflow must store an explicit no-incentive reason rather than leaving an ambiguous state.

### Payment

Only approved and locked bonuses may be settled.

### Reversal

Reversal must create compensating evidence. It must never delete the original settlement.

---

## 11. Wallet Settlement

The Wallet method should:

1. Lock the incentive payment.
2. Confirm that it is approved and unpaid.
3. Confirm that no active settlement exists.
4. Resolve the recipient's wallet and currency.
5. Credit the wallet atomically.
6. Insert a posted wallet transaction.
7. Insert an immutable incentive settlement.
8. Link the settlement and wallet transaction to the payment.
9. Mark the recipient payment as paid.
10. Update the snapshot status when all recipients are settled.

### Idempotency

Repeating the same request must return the original settlement evidence rather than issue another credit.

The identity should include:

- Incentive payment ID
- Settlement method
- Recipient
- Calculation snapshot

### Wallet reversal

A reversal should:

- Lock the original settlement.
- Verify that it has not already been reversed.
- Verify sufficient wallet balance.
- Create a negative posted wallet transaction.
- Store the reversal reference and reason.
- Mark the original settlement as reversed.
- Update payment and snapshot lifecycle consistently.

---

## 12. Payroll Settlement

The Payroll method should:

1. Lock the incentive payment.
2. Confirm approved and unpaid status.
3. Resolve the target payroll run and employee.
4. Confirm that the run is still editable.
5. Create one linked payroll item.
6. Store immutable settlement evidence.
7. Mark the incentive payment as paid or scheduled.

### Current limitation

Payroll reversal is not fully supported by the current implementation.

Before using Payroll settlement broadly, implement one of these policies:

#### Option A — Full payroll reversal

- Remove or reverse the linked payroll item if the run is still open.
- Create a negative adjustment in a later run if the original run is posted.
- Preserve references to both records.

#### Option B — Operational restriction

- Disable incentive reversal after payroll settlement.
- Require an authorized Payroll correction process.
- Display clear instructions and reconciliation evidence.

Option A is the recommended long-term solution.

---

## 13. General Ledger Integration

The current system has Wallet and Payroll settlement evidence but no complete incentive-specific GL bridge.

Add an immutable accounting bridge.

### Wallet payment journal

Typical posting:

```text
Debit: Incentive Bonus Expense
Credit: Staff Wallet Payable
```

### Payroll payment journal

Typical posting:

```text
Debit: Incentive Bonus Expense
Credit: Payroll Payable
```

### Reversal journal

Create a compensating journal that references the original journal.

Never modify or delete the original posted journal.

### GL requirements

- Stable source type and source ID
- Unique journal idempotency key
- Fiscal period
- Accounting fund
- Country and currency
- Recipient or employee reference
- Snapshot and payment references
- Original journal reference for reversals
- Reconciliation status

Finance must be alerted when required accounts or dimensions are missing.

---

## 14. Permissions

Define explicit permissions for:

- View own incentives
- View organization incentive reports
- View State or Hub incentive reports
- Manage incentive settings
- Calculate and pre-approve
- Manage eligibility overrides
- Approve or lock
- Pay through Wallet
- Pay through Payroll
- Reverse a settlement
- Export incentive reports
- Reconcile incentive accounting

### Server enforcement

Every sensitive RPC must enforce permissions itself.

Hiding a button is not authorization.

### Current access gap

The access registry describes `/incentives` as **My Incentives**, but employee self-service is effectively disabled in the current page.

Enable personal access so an employee can see only:

- Their own incentive payments
- Their own calculation role
- Their own amount and currency
- Payment status
- Payment method
- Calculation and payment dates
- MMP reference

Employees must not see other recipients' amounts.

---

## 15. User Experience

### MMP Incentives tab

Display:

- Configuration in effect
- Calculation basis
- Coverage progress
- Qualifying and total site counts
- Role pools
- Eligible and excluded recipients
- Exclusion reasons
- Override indicators
- Snapshot lifecycle
- Cycle Close lock status
- Settlement progress
- Failed payments and retry actions

### Finance payment workspace

Finance should be able to:

- Filter approved unpaid bonuses.
- Review recipient and evidence.
- Select Wallet or Payroll where authorized.
- Pay one or multiple recipients safely.
- See idempotent retry results.
- Review failure reasons.
- Reverse supported settlements.
- Open linked Wallet, Payroll, and GL evidence.

### Personal incentives

Employees should see:

- Bonus amount
- Currency
- MMP and month
- Incentive role
- Calculation basis
- Status
- Payment method
- Payment date

---

## 16. Notifications

Add deduplicated notifications for:

- Incentive calculation pre-approved
- Calculation blocked
- Incentive approved during Cycle Close
- Incentive payment ready for Finance
- Employee bonus paid
- Payment failed
- Settlement reversed
- Reconciliation exception

Channels may include:

- In-app
- Email
- Mobile push

Each event should have a stable deduplication key.

Do not expose organization-wide recipient amounts in employee notifications.

---

## 17. Reports and Exports

### Administrative report

Include:

- MMP
- Calculation month
- Hub and state
- Calculation basis
- Coverage
- Fee pool
- Role pools
- Recipient totals
- Paid, unpaid, failed, and reversed totals
- Settlement methods
- Override counts
- Reconciliation status

### Employee report

Return only the current user's incentive history.

### Finance reconciliation report

Compare:

```text
snapshot recipient amount
= payment amount
= settlement amount
= wallet/payroll evidence
= GL evidence
```

Flag:

- Missing settlement evidence
- Duplicate settlement evidence
- Amount mismatch
- Currency mismatch
- Paid status without Wallet or Payroll evidence
- Wallet or Payroll evidence without a payment row
- Missing GL journal
- Reversed settlement without a compensating journal

### Export security

Export authorization must be enforced at the backend file-producing boundary or authorized export RPC.

The export must not rely only on a hidden frontend button.

---

## 18. Audit Trail

Record:

- Settings changes
- Eligibility override creation and revocation
- Calculation attempts
- Calculation failures
- Pre-approval
- Cycle Close approval and lock
- Payment attempts
- Idempotent retries
- Settlement failures
- Reversals
- Reconciliation corrections

Audit records should include:

- Actor
- Action
- Timestamp
- MMP
- Snapshot
- Recipient payment
- Before and after lifecycle state
- Reason
- Related immutable evidence IDs

Do not store secrets or unrestricted financial payloads in audit metadata.

---

## 19. Concurrency and Failure Safety

### Calculation concurrency

Two administrators calculating the same MMP simultaneously must not create two active snapshots.

Use:

- Row locking
- Unique active-snapshot constraints
- Transactional snapshot and payment creation

### Payment concurrency

Two Finance users paying the same recipient simultaneously must produce one settlement.

Use:

- Row locking
- Unique settlement identity
- Idempotent retry response

### Cycle Close race

Cycle Close and calculation must not run against different MMP states.

The close operation must lock or serialize:

- MMP lifecycle
- Incentive snapshot
- Relevant site evidence

### Failure behavior

If Wallet, Payroll, GL, or settlement evidence fails, the transaction should roll back or leave an explicit retryable failure state.

Never mark a payment as paid without immutable settlement evidence.

---

## 20. Migration and Production Preflight

Before expanding usage:

1. Inventory the incentive functions deployed in production.
2. Confirm the effective migration order.
3. Remove obsolete function overloads only after verification.
4. Confirm four-role calculation is the active implementation.
5. Confirm WFP eligibility uses one canonical definition.
6. Confirm RLS and function grants.
7. Identify legacy snapshots without settlement evidence.
8. Run legacy evidence remediation in report-only mode.
9. Resolve evidence conflicts before enabling automatic backfill.
10. Confirm Cycle Close calls the current lock function.

Relevant migration sequence to verify:

```text
20260818 close and lock integration
→ 20260905 legacy evidence remediation
→ 20260906 system hardening and settlement
→ 20260907 four-role eligibility
→ 20260910 WFP-confirmed payment gating
```

---

## 21. Test Plan

### Calculation

- WFP-confirmed basis
- Submitted basis
- Coverage below, at, and above threshold
- Zero eligible sites
- Archived MMP
- Historical MMP
- Unresolved hub
- Ambiguous state
- All four roles
- Inactive role
- No eligible recipient
- Include and exclude overrides
- Deterministic rounding
- Exact pool reconciliation

### Lifecycle

- Preview does not persist
- Pre-approval creates one snapshot
- Repeated pre-approval is safe
- Cycle Close approves and locks
- Closed snapshot cannot be recalculated
- Paid snapshot cannot be replaced
- Reversed snapshot remains auditable

### Settlement

- Wallet payment
- Payroll payment
- Duplicate payment retry
- Concurrent payment attempts
- Insufficient wallet reversal balance
- Repeated reversal
- Payroll correction
- Forged settlement evidence rejection

### Security

- Employee sees only their own payment
- Supervisor scope
- Coordinator scope
- Financial Admin payment access
- Admin configuration access
- Unauthorized direct RPC calls
- Unauthorized exports
- RLS access to snapshots, payments, settlements, and overrides

### Accounting

- Wallet amount equals settlement
- Payroll amount equals settlement
- GL journal equals settlement
- Currency consistency
- Reversal journal references original
- No duplicate journal

### Deployment-like integration

Run tests with:

- Real database triggers
- Real RLS policies
- Real RPC grants
- Real settlement constraints
- Stubbed terminal external services only

---

## 22. Monitoring and Support

Monitor:

- Calculation failure rate
- Payment failure rate
- Average calculation duration
- Average settlement duration
- Unpaid approved bonuses
- Settlement evidence mismatches
- Missing GL journals
- Reversal failures
- Legacy evidence conflicts

Create alerts for:

- Paid payment without settlement evidence
- Wallet or Payroll evidence without payment
- Duplicate active settlement
- Snapshot total mismatch
- Payment amount mismatch
- Unsupported payroll reversal request
- GL posting failure

Provide support procedures for:

- Recalculating an unlocked MMP
- Correcting eligibility before Cycle Close
- Retrying failed settlement
- Reversing Wallet payment
- Correcting Payroll settlement
- Repairing legacy evidence
- Reconciling GL differences

---

## 23. Recommended Delivery Phases

### Phase 1 — Production verification

- Inventory deployed functions, tables, RLS, triggers, and grants.
- Verify migration order.
- Confirm the active WFP definition and four-role calculator.
- Run existing incentive SQL tests against a deployment-like database.

### Phase 2 — One calculation contract

- Add an authoritative preview RPC.
- Use the same server logic for preview and pre-approval.
- Remove duplicated browser calculation logic.
- Standardize coverage and WFP rules.

### Phase 3 — Access and personal incentives

- Enable `get_my_incentive_payments`.
- Allow employees to view only their own bonuses.
- Define Finance, Admin, HR, Supervisor, and Coordinator permissions.
- Test UI and direct RPC authorization.

### Phase 4 — Workflow completion

- Improve pre-approval and Cycle Close visibility.
- Add eligibility and exclusion evidence.
- Add failure and retry controls.
- Implement the Payroll correction policy.

### Phase 5 — Accounting integration

- Add incentive-specific GL posting.
- Add compensating reversal journals.
- Add idempotency and immutable references.
- Add Finance reconciliation reporting.

### Phase 6 — Notifications

- Add pre-approval, approval, payment, failure, and reversal notifications.
- Add deduplication and recipient privacy.

### Phase 7 — Reporting

- Correct multi-currency formatting.
- Secure backend export boundaries.
- Add reconciliation totals and exception exports.
- Add employee incentive statements.

### Phase 8 — Operational hardening

- Add concurrency tests.
- Add deployed-schema preflight.
- Add monitoring and alerts.
- Document support and recovery procedures.

---

## 24. Definition of Done

The Incentive Bonuses system is complete when:

- One authoritative server calculation drives preview and persistence.
- WFP and coverage rules are consistent everywhere.
- All four configured roles work without ambiguous identity resolution.
- Eligibility overrides are controlled and auditable.
- Cycle Close approves and locks the exact calculated snapshot.
- Wallet and Payroll payments are atomic and idempotent.
- Wallet and Payroll corrections are defined and supported.
- Every settlement has immutable evidence.
- Every settlement and reversal has balanced GL evidence.
- Employees can see only their own incentive history.
- Finance can reconcile calculation, payment, settlement, and GL totals.
- Exports enforce server-side authorization.
- Notifications are deduplicated and privacy-safe.
- Concurrent operations cannot duplicate calculations or payments.
- Deployment-like tests verify lifecycle, permissions, settlement, and accounting.
- Production monitoring detects missing or inconsistent evidence.
