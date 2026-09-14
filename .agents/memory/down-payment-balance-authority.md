---
name: Down-Payment balance authority
description: Canonical status, payment-evidence, and remaining-balance rules for Down-Payment reporting.
---

Every Down-Payment card, tab, grouped view, regular export, and bulk export must use one canonical status and per-request balance policy. Legacy settled statuses (`paid`, `reconciled`, `completed`, and `closed`) belong with completed payments; the Closed UI bucket means rejected or cancelled requests.

**Why:** Independent status lists caused cards, tabs, and exports to disagree even when each local calculation appeared reasonable.

**How to apply:** Approved financial lifecycle includes approved, partially paid, and all settled statuses. Rejected, cancelled, and deleted rows retain historical visibility but contribute zero approved, paid, and remaining financial amounts.

Active immutable payment evidence is authoritative. A positive legacy source total may remain as compatibility evidence for direct or historical payments, but it must be visibly flagged for Finance reconciliation.

**Why:** Silently treating a stale source total as verified can misstate both paid and remaining amounts.

**How to apply:** For open approved/partially-paid requests, calculate remaining per request as `max(approved - paid, 0)` and then sum. Settled rows contribute zero Payable Remaining; their `max(approved - paid, 0)` must be displayed separately as a Settled Reconciliation Gap.

Site completion/coverage is a separate dimension from the Down-Payment request/payment status and must be reported separately.

**Why:** An approved or fully-paid advance does not prove that the linked field site was completed or WFP-confirmed.

**How to apply:** Detailed and grouped reports should show both statuses: the request lifecycle (pending, approved, partially paid, settled, etc.) and the linked site’s current system status/coverage classification.