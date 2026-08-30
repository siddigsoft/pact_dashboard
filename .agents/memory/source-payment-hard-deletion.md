---
name: Source payment hard deletion
description: Approved exception to the normal immutable-ledger model for Cost Submission and Down Payment payments.
---

Cost Submission and Down Payment payments may be physically deleted by Admin, Finance, or Super Admin, strictly newest-first for the individual source. The active payment, its source totals, fund balance, linked wallet evidence, receipt link, and linked accounting rows must change atomically. Normal row-level deletion preserves an immutable audit snapshot. When a Down Payment is explicitly reopened to an approval state, permanently delete only the snapshots created for active payments removed by that same reopen transaction; preserve older unrelated audit history.

**Why:** The user explicitly chose true SQL deletion rather than compensating reversal rows and later confirmed that a Down Payment revert should remove the current payment records and related evidence. Down Payments and Cost Submissions must remain isolated, and unrelated historical evidence must not be swept up.

**How to apply:** Require a deletion reason and server-side role check. Lock and verify the newest active payment using both source table and source ID. Never perform a fund-wide delete or use source ID without source table. Reject deletion when separate Finance exception evidence references the payment. Reopen cleanup must loop newest-first and purge snapshots by the exact deleted payment IDs, never by source alone.