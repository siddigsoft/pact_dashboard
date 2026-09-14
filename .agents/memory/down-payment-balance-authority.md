---
name: Down-Payment balance authority
description: Canonical status, payment-evidence, and remaining-balance rules for Down-Payment reporting.
---

Every Down-Payment card, tab, grouped view, regular export, and bulk export must use one canonical status and per-request balance policy. Legacy settled statuses (`paid`, `reconciled`, `completed`, and `closed`) belong with completed payments; the Closed UI bucket means rejected or cancelled requests.

**Why:** Independent status lists caused cards, tabs, and exports to disagree even when each local calculation appeared reasonable.

**How to apply:** Approved financial lifecycle includes approved, partially paid, and all settled statuses. Rejected, cancelled, and deleted rows retain historical visibility but contribute zero approved, paid, and remaining financial amounts.

Active immutable payment evidence is authoritative. A positive legacy source total may remain as compatibility evidence for direct or historical payments, but it must be visibly flagged for Finance reconciliation.

**Why:** Silently treating a stale source total as verified can misstate both paid and remaining amounts.

**How to apply:** Calculate remaining per request as `max(approved - paid, 0)` and then sum; never derive the total by subtracting aggregate paid from aggregate approved when individual rows can be overpaid or excluded. A settled or fully-paid label never overrides a lower recorded payment amount: show the difference and flag the row for reconciliation.