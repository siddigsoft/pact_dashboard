---
name: Incentive server authority
description: Durable integrity rules for MMP bonus calculation, allocation, and settlement.
---

MMP incentive amounts, recipients, lifecycle eligibility, and settlement status must be calculated and enforced by database functions. Browser calculations are previews only and must never be accepted as authoritative payment input.

**Why:** Client-supplied totals and separate payment/status writes can be altered or interrupted, producing incorrect bonuses, duplicate credits, or payment records that disagree with wallet and payroll evidence.

**How to apply:** Lock the MMP/payment scope, calculate from canonical site/config/profile data, reject unresolved geographic assignments or unsupported roles, allocate integer remainders deterministically, and commit the settlement evidence and payment lifecycle in one transaction.

Settlement evidence must be FK-backed, semantically matched to the recipient,
signed amount, currency, lifecycle/type, and incentive identity, and immutable
after settlement. Reversals need their own retained source transaction identity;
non-null reference text is not evidence.

**Why:** A status guard that checks only non-null UUIDs or reference strings can
still accept fabricated, swapped, deleted, pending, or unrelated source rows.

**How to apply:** Treat paid/reversed lifecycle states and all evidence-defining
payment fields as terminal or immutable. Validate legacy rows per payment before
enabling guards; fail closed when trustworthy evidence cannot be established.

Legacy evidence remediation may reuse an idempotency-key match only when the
source is not already attributed to another incentive, and only when the full
semantic match is unique. Install remediation/reporting separately before an
atomic hardening migration so a failed preflight leaves neither partial guards
nor an unavailable repair path.

**Why:** An idempotency key can coexist with a contradictory incentive tag, and
creating repair helpers inside the migration that rejects bad legacy rows makes
those helpers roll back precisely when Finance needs them.

**How to apply:** Report zero/multiple/contradictory matches for manual Finance
review; audited backfill may link one existing source but must never manufacture
financial evidence or overwrite another payment's attribution.

Incentive lifecycle and evidence creation must be RPC-only, not merely
shape-validated.

**Why:** If authenticated clients can write the underlying payment, settlement,
wallet, or payroll rows, they can fabricate records that satisfy every semantic
shape check without representing an authorized settlement.

**How to apply:** Revoke direct lifecycle-table DML and block incentive-tagged
source inserts outside the authorized security-definer settlement path. Test the
boundary under the actual authenticated database role, not only as table owner.

Expanded incentive roles must retain their own geographic eligibility scope:
Coordinators are state-scoped, Supervisors and FOM are hub-scoped, and Support
Team membership is manual-only. Manual Coordinator includes require an explicit
hub-mapped state; all overrides require a hub and an audit reason.

**Why:** Treating every role as one hub-wide recipient list can turn proportional
state pools into duplicate whole-hub payouts. Support Team has no canonical
system role, so automatic inference would make eligibility ambiguous.

**How to apply:** Resolve primary roles, additional-role assignments, and active
classifications independently using each source's own hub/state. Snapshot the
chosen evidence and derive recipient counts from final payable rows, not the
pre-filter candidate set.