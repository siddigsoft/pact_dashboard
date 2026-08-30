---
name: Source payment hard deletion
description: Approved exception to the normal immutable-ledger model for Cost Submission and Down Payment payments.
---

Cost Submission and Down Payment payments may be physically deleted by Admin, Finance, or Super Admin, strictly newest-first for the individual source. The active payment, its source totals, fund balance, linked wallet evidence, receipt link, and linked accounting rows must change atomically. Preserve the complete original evidence and deletion metadata in a separate immutable audit snapshot.

**Why:** The user explicitly chose true SQL deletion for these source payments rather than compensating reversal rows, while still requiring permanent audit history. Down Payments and Cost Submissions must remain isolated from each other.

**How to apply:** Require a deletion reason and server-side role check. Lock and verify the newest active payment using both source table and source ID. Never perform a fund-wide delete or use source ID without source table. Reject deletion when separate Finance exception evidence references the payment.