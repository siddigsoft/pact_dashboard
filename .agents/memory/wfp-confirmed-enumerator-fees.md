---
name: WFP-confirmed enumerator fees
description: Authority and workflow boundary for ordinary site-fee wallet credits and payments.
---

Ordinary enumerator and transport fees may be credited to a wallet or recorded as paid only after the site status is canonically WFP confirmed. Completed, submitted, approved, or costed states are not payable states. Incentive bonuses remain a separate system.

**Why:** Completion-time client credits and permissive wallet writes can pay before external confirmation or create duplicate financial evidence. The database must own credit creation and reject direct ordinary-earning mutations.

**How to apply:** Keep web, offline, and Flutter completion flows non-financial. Let the trusted WFP-confirmation database path create one idempotent site earning. Direct covered-fee payments must use the receipt-backed Field Payments Centre workflow.

New WFP-confirmed ordinary fees use wallet settlement as the single payment path. A valid transportation advance reduces the wallet earning through immutable, exact-site applications; receipt-backed direct cash must be rejected once an ordinary wallet earning exists. Post-application advance reversals and source mutations fail closed for Finance reconciliation.

**Why:** Allowing direct cash and wallet credit for the same site creates double payment. Recomputing deductions from mutable request totals or unsynchronized reversal events creates underpayment, overpayment, and race conditions.

**How to apply:** Serialize advance application and reversal on the same request key, retain an immutable application ledger plus a locked request marker, and derive residual advance value from verified net ledger events. Post ordinary settlement as gross fee expense split across advance clearing and Staff Wallet Payable; preserve redirect-specific GL behavior.